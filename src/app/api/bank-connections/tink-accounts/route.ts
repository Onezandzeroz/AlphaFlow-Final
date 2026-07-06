/**
 * POST /api/bank-connections/tink-accounts
 *
 * Called by the frontend after the user selects a Tink bank account
 * from the account selection page (rendered by tink-callback).
 *
 * This endpoint:
 *   1. Receives the selected account details from the Tink callback
 *   2. Updates the BankConnection with the real account information
 *   3. Sets the connection status to ACTIVE
 *   4. Triggers an initial sync to fetch the first transactions
 *
 * Request body:
 *   connectionId  — The BankConnection record ID
 *   accountId     — Tink's internal account ID (used for transaction fetching)
 *   accountNumber — The account number from Tink
 *   iban          — The IBAN from Tink (if available)
 *   accountName   — The account name from Tink
 *   bankName      — The institution/bank name from Tink
 *   balance       — The current balance from Tink
 *   credentialsId — The Tink credentials ID (for re-authorization)
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditUpdate, requestMetadata } from '@/lib/audit';
import { withGuard } from '@/lib/route-guard';
import { Permission, tenantFilter } from '@/lib/rbac';
import { notifyDataChange } from '@/lib/notify-data-change';
import { performSync } from '@/app/api/bank-connections/route';

export const POST = withGuard(
  {
    auth: true,
    requireCompany: true,
    permissions: [Permission.BANK_CONNECT],
  },
  async (request, ctx) => {
    try {
      const body = await request.json();
      const {
        connectionId,
        accountId,      // Tink account ID
        accountNumber,
        iban,
        accountName,
        bankName,
        balance,
        credentialsId,
      } = body;

      if (!connectionId || !accountId) {
        return NextResponse.json(
          { error: 'Manglende connectionId eller accountId' },
          { status: 400 },
        );
      }

      // ─── Find and validate the connection ─────────────────────
      const connection = await db.bankConnection.findFirst({
        where: { id: connectionId, ...tenantFilter(ctx) },
      });

      if (!connection) {
        return NextResponse.json(
          { error: 'Bankforbindelse ikke fundet' },
          { status: 404 },
        );
      }

      if (connection.provider !== 'tink') {
        return NextResponse.json(
          { error: 'Denne endpoint er kun for Tink-forbindelser' },
          { status: 400 },
        );
      }

      // ─── Update the connection with real account data ─────────
      // Parse registration number from Danish account numbers (first 4 digits)
      let registrationNumber = connection.registrationNumber;
      if (!registrationNumber && accountNumber && accountNumber.length >= 4) {
        registrationNumber = accountNumber.substring(0, 4);
      }

      const updated = await db.bankConnection.update({
        where: { id: connectionId },
        data: {
          // Store Tink's accountId in the accountNumber field.
          // This is what fetchTransactions() uses to call Tink's API.
          accountNumber: accountId,
          registrationNumber: registrationNumber || null,
          iban: iban || null,
          accountName: accountName || bankName || null,
          bankName: bankName || connection.bankName,
          currentBalance: balance !== null && balance !== undefined
            ? Math.round(Number(balance) * 100) / 100
            : connection.currentBalance,
          status: 'ACTIVE',
          consentExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
          lastError: null,
          retryCount: 0,
        },
      });

      // ─── Audit log ────────────────────────────────────────────
      await auditUpdate(
        ctx.id,
        'BankConnection',
        connectionId,
        {
          status: 'PENDING',
          accountNumber: connection.accountNumber,
        },
        {
          status: 'ACTIVE',
          accountNumber: accountId,
          accountName: accountName,
          bankName: bankName,
        },
        requestMetadata(request),
        ctx.activeCompanyId,
      );

      // ─── Notify data change listeners ─────────────────────────
      notifyDataChange({
        scope: 'bank-connections',
        companyId: ctx.activeCompanyId!,
        action: 'update',
      }).catch(() => {});

      // ─── Trigger initial sync ─────────────────────────────────
      let syncResult: Record<string, unknown> | null = null;
      try {
        syncResult = await performSync(connectionId, ctx.id);

        // Notify all dependent scopes after sync
        const { notifyDataChanges } = await import('@/lib/notify-data-change');
        await notifyDataChanges([
          { scope: 'bank-connections', companyId: ctx.activeCompanyId!, action: 'sync' },
          { scope: 'bank-reconciliation', companyId: ctx.activeCompanyId!, action: 'update' },
          { scope: 'transactions', companyId: ctx.activeCompanyId!, action: 'sync' },
          { scope: 'dashboard', companyId: ctx.activeCompanyId!, action: 'update' },
          { scope: 'ledger', companyId: ctx.activeCompanyId!, action: 'update' },
          { scope: 'cash-flow', companyId: ctx.activeCompanyId!, action: 'update' },
        ]).catch(() => {});
      } catch (syncError) {
        logger.warn('Initial Tink sync failed (non-fatal, user can sync manually)', {
          connectionId,
          error: syncError instanceof Error ? syncError.message : 'Unknown',
        });
      }

      return NextResponse.json({
        success: true,
        connection: updated,
        initialSync: syncResult,
      });
    } catch (error) {
      logger.error('Tink account selection error:', error);
      return NextResponse.json(
        { error: 'Der opstod en fejl ved tilkobling af kontoen' },
        { status: 500 },
      );
    }
  },
);