import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { getProvider, getAvailableBanks } from '@/lib/bank-providers';
import { tenantFilter, Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { encryptOrNull, decryptOrNull } from '@/lib/crypto';
import { notifyDataChange } from '@/lib/notify-data-change';

// GET - List bank connections or available banks
export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.BANK_CONNECT] },
  async (request, ctx) => {
    try {
      const { searchParams } = new URL(request.url);
      const action = searchParams.get('action');

      // List available banks
      if (action === 'banks') {
        return NextResponse.json({ banks: getAvailableBanks() });
      }

      // List user's bank connections
      
      const connections = await db.bankConnection.findMany({
        where: {
          ...tenantFilter(ctx),
        },
        include: {
          syncs: {
            orderBy: { startedAt: 'desc' },
            take: 3,
          },
          bankStatements: {
            orderBy: { startDate: 'desc' },
            take: 1,
            include: {
              lines: {
                where: { reconciliationStatus: 'UNMATCHED' },
                take: 0,
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Add computed fields
      const enriched = connections.map(conn => ({
        ...conn,
        unmatchedCount: conn.bankStatements.reduce(
          (sum, stmt) => sum + (stmt as any).lines?.length || 0,
          0
        ),
        recentSyncs: conn.syncs,
      }));

      return NextResponse.json({ connections: enriched });
    } catch (error) {
      logger.error('List bank connections error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);

// POST - Create a new bank connection
export const POST = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.BANK_CONNECT] },
  async (request, ctx) => {
    try {
      const body = await request.json();
      const {
        bankName,
        provider,
        registrationNumber,
        accountNumber,
        iban,
        accountName,
        syncFrequency = 'daily',
      } = body;

      // Get the provider early to check if it provides accounts (like Tink)
      const bankProvider = getProvider(provider);
      if (!bankProvider) {
        return NextResponse.json(
          { error: `Ukendt bankudbyder: ${provider}` },
          { status: 400 }
        );
      }

      // Tink (and other providers with providesAccounts) don't need accountNumber
      // upfront — the user selects an account after the OAuth callback.
      const needsAccountUpfront = !bankProvider.providesAccounts;
      if (!bankName || !provider || (needsAccountUpfront && !accountNumber)) {
        return NextResponse.json(
          { error: 'Missing required fields: bankName, provider' + (needsAccountUpfront ? ', accountNumber' : '') },
          { status: 400 }
        );
      }

      // Check for duplicate account (only for providers that require accountNumber)
      if (accountNumber) {
        const existing = await db.bankConnection.findFirst({
          where: {
            ...tenantFilter(ctx),
            accountNumber,
          },
        });

        if (existing) {
          return NextResponse.json(
            { error: 'En bankforbindelse med dette kontonummer findes allerede' },
            { status: 409 }
          );
        }
      }

      // Create the connection record first so we have an ID for the OAuth state.
      // For providers like Tink that provide accounts, we use a placeholder
      // accountNumber that gets replaced after the user selects an account.
      const placeholderAccountNumber = bankProvider.providesAccounts
        ? `pending-${provider}-${Date.now()}`
        : accountNumber;

      const connection = await db.bankConnection.create({
        data: {
          bankName,
          provider,
          registrationNumber: registrationNumber || null,
          accountNumber: placeholderAccountNumber,
          iban: iban || null,
          accountName: accountName || null,
          syncFrequency,
          status: 'PENDING',
          consentId: null, // Will be set by initiateConsent below
          consentExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          nextSyncAt: null, // No auto-sync until fully authorized
          userId: ctx.id,
          companyId: ctx.activeCompanyId!,
        },
      });

      // Initiate consent — pass the connectionId so Tink can use it as OAuth state
      const consentResult = await bankProvider.initiateConsent({
        registrationNumber: registrationNumber || '',
        accountNumber: placeholderAccountNumber,
        iban,
        connectionId: connection.id,
      });

      // Update the connection with the consentId from the provider
      await db.bankConnection.update({
        where: { id: connection.id },
        data: { consentId: consentResult.consentId },
      });
      connection.consentId = consentResult.consentId;

      // Calculate next sync time
      const now = new Date();
      const nextSyncAt = new Date(now);
      if (syncFrequency === 'hourly') {
        nextSyncAt.setHours(nextSyncAt.getHours() + 1);
      } else if (syncFrequency === 'daily') {
        nextSyncAt.setDate(nextSyncAt.getDate() + 1);
        nextSyncAt.setHours(6, 0, 0, 0); // 6 AM next day
      }

      const isActiveConsent = consentResult.status === 'active';
      const effectiveNextSyncAt = isActiveConsent && syncFrequency !== 'manual' ? nextSyncAt : null;

      // Update the connection with the consent result
      await db.bankConnection.update({
        where: { id: connection.id },
        data: {
          status: isActiveConsent ? 'ACTIVE' : 'PENDING',
          accessToken: consentResult.consentId ? encryptOrNull(consentResult.consentId) : null,
          nextSyncAt: effectiveNextSyncAt,
        },
      });
      connection.status = isActiveConsent ? 'ACTIVE' : 'PENDING';

      await auditCreate(
        ctx.id,
        'BankConnection',
        connection.id,
        {
          bankName,
          provider,
          accountNumber: placeholderAccountNumber,
          status: connection.status,
        },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      notifyDataChange({ scope: 'bank-connections', companyId: ctx.activeCompanyId!, action: 'create' }).catch(() => {});

      // If demo provider and active, do an initial sync
      if (bankProvider.isDemo && connection.status === 'ACTIVE') {
        const syncResult = await performSync(connection.id, ctx.id);
        return NextResponse.json(
          { connection, initialSync: syncResult },
          { status: 201 }
        );
      }

      // For real banks: return the consent redirect URL
      // For Tink, the redirect URL already has the connection ID in the state param,
      // so we don't need to append connection_id to the URL.
      let consentRedirect = consentResult.redirectUrl || null;
      if (consentRedirect && !bankProvider.providesAccounts && !consentRedirect.includes('connection_id')) {
        const separator = consentRedirect.includes('?') ? '&' : '?';
        consentRedirect = `${consentRedirect}${separator}connection_id=${connection.id}`;
      }

      return NextResponse.json(
        {
          connection,
          consentRedirect,
          sandboxMode: consentResult.sandboxMode || false,
          providerProvidesAccounts: bankProvider.providesAccounts || false,
        },
        { status: 201 }
      );
    } catch (error) {
      logger.error('Create bank connection error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);

// Helper: Perform sync for a bank connection
async function performSync(connectionId: string, userId: string) {
  const connection = await db.bankConnection.findUnique({
    where: { id: connectionId },
  });

  if (!connection || connection.userId !== userId) {
    return null;
  }

  // Don't sync connections that haven't been authorized yet
  if (connection.status !== 'ACTIVE') {
    return { error: 'Bank connection requires authorization before syncing. Complete the consent flow first.' };
  }

  const provider = getProvider(connection.provider);
  if (!provider) return null;

  // Create sync record
  const sync = await db.bankConnectionSync.create({
    data: {
      bankConnectionId: connectionId,
      companyId: connection.companyId,
      status: 'PENDING',
    },
  });

  try {
    // Decrypt token — with automatic migration of legacy base64 tokens
    const decryptToken = (stored: string | null): string => {
      if (!stored) return '';
      try {
        return decryptOrNull(stored);
      } catch {
        // Legacy base64-encoded token — decode and use directly
        try {
          return Buffer.from(stored, 'base64').toString('utf8');
        } catch {
          return '';
        }
      }
    };

    const fromDate = connection.lastSyncAt || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = new Date();

    let accessToken = decryptToken(connection.accessToken);

    // ─── Tink token refresh ─────────────────────────────────────
    // Tink access tokens expire in ~30 minutes. If the token is likely
    // expired, attempt to re-authorize via the stored credentialsId.
    if (connection.provider === 'tink' && accessToken) {
      const { isTokenLikelyExpired, getTinkConfig, reauthorizeCredential, exchangeCodeForToken } = await import('@/lib/tink-client');
      const tinkConfig = getTinkConfig();

      if (tinkConfig && isTokenLikelyExpired(connection.lastSyncAt)) {
        logger.info('Tink token likely expired, attempting re-authorization', { connectionId });
        try {
          const credentialsId = decryptToken(connection.refreshToken);
          if (credentialsId && accessToken) {
            const newCode = await reauthorizeCredential(tinkConfig, accessToken, credentialsId);
            const newToken = await exchangeCodeForToken(tinkConfig, newCode);
            accessToken = newToken.access_token;

            // Store the fresh token
            await db.bankConnection.update({
              where: { id: connectionId },
              data: { accessToken: encryptOrNull(newToken.access_token) },
            });

            logger.info('Tink token re-authorized successfully', { connectionId });
          }
        } catch (reauthError) {
          // Re-authorization failed — mark connection as needing user re-auth
          logger.warn('Tink re-authorization failed, marking for re-auth', {
            connectionId,
            error: reauthError instanceof Error ? reauthError.message : 'Unknown',
          });
          await db.bankConnection.update({
            where: { id: connectionId },
            data: { status: 'PENDING', lastError: 'Tink adgangstoken er udløbet. Gen godkend din bankforbindelse.' },
          });

          await db.bankConnectionSync.update({
            where: { id: sync.id },
            data: {
              status: 'FAILED',
              completedAt: new Date(),
              errorMessage: 'Tink adgangstoken udløbet — gen godkendelse påkrævet',
              errorCode: 'TOKEN_EXPIRED',
            },
          });

          return { error: 'TINK_REAUTH_REQUIRED', needsReauth: true };
        }
      }
    }

    const result = await provider.fetchTransactions({
      accessToken,
      accountNumber: connection.accountNumber,
      fromDate,
      toDate,
    });

    // Deduplicate against existing transactions
    const existingLines = await db.bankStatementLine.findMany({
      where: {
        bankStatement: {
          companyId: connection.companyId,
          bankConnectionId: connectionId,
        },
      },
      select: { date: true, amount: true, description: true },
    });

    const existingKeys = new Set(
      existingLines.map(l =>
        `${l.date.toISOString().split('T')[0]}_${l.amount.toFixed(2)}_${l.description.substring(0, 30)}`
      )
    );

    const newTransactions = result.transactions.filter(tx => {
      const key = `${tx.date}_${tx.amount.toFixed(2)}_${tx.description.substring(0, 30)}`;
      return !existingKeys.has(key);
    });

    // Create bank statement if there are new transactions
    let matchedCount = 0;
    if (newTransactions.length > 0) {
      const sortedTx = [...newTransactions].sort((a, b) => a.date.localeCompare(b.date));
      const openingBalance = Number(sortedTx[0].balance) - Number(sortedTx[0].amount);
      const closingBalance = Number(sortedTx[sortedTx.length - 1].balance);

      
      const statement = await db.bankStatement.create({
        data: {
          bankAccount: `${connection.registrationNumber || ''}${connection.accountNumber}`,
          startDate: new Date(sortedTx[0].date),
          endDate: new Date(sortedTx[sortedTx.length - 1].date),
          openingBalance: Math.round(Number(openingBalance) * 100) / 100,
          closingBalance: Math.round(closingBalance * 100) / 100,
          importSource: 'open_banking',
          importDate: new Date(),
          bankConnectionId: connectionId,
          companyId: connection.companyId,
          userId,
          lines: {
            create: sortedTx.map(tx => ({
              companyId: connection.companyId,
              date: new Date(tx.date),
              description: tx.description,
              reference: tx.reference || null,
              amount: Math.round(Number(tx.amount) * 100) / 100,
              balance: Math.round(Number(tx.balance) * 100) / 100,
              reconciliationStatus: 'UNMATCHED',
            })),
          },
        },
        include: { lines: true },
      });

      // Auto-match using the matching engine
      const { batchMatch } = await import('@/lib/matching-engine');

      const bankAccounts = await db.account.findMany({
        where: {
          companyId: connection.companyId,
          group: 'BANK',
          isActive: true,
        },
      });

      if (bankAccounts.length > 0) {
        const bankAccountIds = bankAccounts.map(a => a.id);

        const journalLines = await db.journalEntryLine.findMany({
          where: {
            accountId: { in: bankAccountIds },
            journalEntry: {
              companyId: connection.companyId,
              status: 'POSTED',
              cancelled: false,
            },
          },
          include: {
            account: true,
            journalEntry: true,
          },
        });

        const bankLineInputs = statement.lines.map(l => ({
          id: l.id,
          date: new Date(l.date),
          description: l.description,
          reference: l.reference,
          amount: Number(l.amount),
        }));

        const journalLineInputs = journalLines.map(jl => ({
          id: jl.id,
          date: new Date(jl.journalEntry.date),
          description: jl.journalEntry.description || '',
          accountNumber: jl.account.number,
          accountName: jl.account.name,
          amount: Number(jl.debit) > 0 ? -Number(jl.debit) : Number(jl.credit),
        }));

        const matches = batchMatch(bankLineInputs, journalLineInputs, {
          autoMatchThreshold: 0.95,
        });

        // Apply matches
        for (const [bankLineId, match] of matches) {
          const status = match.confidence >= 0.95 ? 'MATCHED' : 'AI_SUGGESTED';
          await db.bankStatementLine.update({
            where: { id: bankLineId },
            data: {
              reconciliationStatus: status,
              matchedJournalLineId: match.journalLineId,
              matchedAt: new Date(),
              matchConfidence: match.confidence,
              matchMethod: match.method,
            },
          });
          matchedCount++;
        }

        // Check if all lines matched
        const unmatchedCount = await db.bankStatementLine.count({
          where: {
            bankStatementId: statement.id,
            reconciliationStatus: 'UNMATCHED',
          },
        });

        if (unmatchedCount === 0) {
          await db.bankStatement.update({
            where: { id: statement.id },
            data: { reconciled: true, reconciledAt: new Date() },
          });
        }
      }
    }

    // Update sync record
    await db.bankConnectionSync.update({
      where: { id: sync.id },
      data: {
        status: 'SUCCESS',
        completedAt: new Date(),
        transactionsFound: result.transactions.length,
        transactionsNew: newTransactions.length,
        transactionsDup: result.transactions.length - newTransactions.length,
        matchedCount,
      },
    });

    // Update connection
    const nextSync = new Date();
    if (connection.syncFrequency === 'hourly') {
      nextSync.setHours(nextSync.getHours() + 1);
    } else if (connection.syncFrequency === 'daily') {
      nextSync.setDate(nextSync.getDate() + 1);
      nextSync.setHours(6, 0, 0, 0);
    }

    const lastBalance = newTransactions.length > 0
      ? newTransactions[newTransactions.length - 1].balance
      : connection.currentBalance;

    await db.bankConnection.update({
      where: { id: connectionId },
      data: {
        status: 'ACTIVE',
        lastSyncAt: new Date(),
        nextSyncAt: connection.syncFrequency !== 'manual' ? nextSync : null,
        currentBalance: lastBalance,
        retryCount: 0,
        lastError: null,
      },
    });

    return {
      transactionsFound: result.transactions.length,
      transactionsNew: newTransactions.length,
      matchedCount,
    };
  } catch (error) {
    logger.error('Bank connection sync error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await db.bankConnectionSync.update({
      where: { id: sync.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage,
        errorCode: 'SYNC_ERROR',
      },
    });

    // Update connection retry count
    await db.bankConnection.update({
      where: { id: connectionId },
      data: {
        retryCount: { increment: 1 },
        lastError: errorMessage,
        status: connection.retryCount >= 3 ? 'ERROR' : connection.status,
      },
    });

    return { error: errorMessage };
  }
}

// Export for use in sync route
export { performSync };
