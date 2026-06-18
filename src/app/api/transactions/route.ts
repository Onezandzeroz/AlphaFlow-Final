import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';
import { auditCreate, auditUpdate, auditCancel, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { TransactionType, Prisma, VATCode } from '@prisma/client';
import { tenantFilter, Permission } from '@/lib/rbac';
import { ensureInitialBackup } from '@/lib/backup-scheduler';
import { enrichTransactionsWithVAT } from '@/lib/vat-utils';
import { assignVoucherNumberIfPosted } from '@/lib/voucher-number';
import { notifyDataChanges } from '@/lib/notify-data-change';

// GET - Fetch all non-cancelled transactions for the logged-in user
export const GET = withGuard({
  auth: true,
  requireCompany: true,
  permissions: [Permission.DATA_READ],
}, async (request, ctx) => {
  try {
    const transactions = await db.transaction.findMany({
      where: { ...tenantFilter(ctx), cancelled: false },
      orderBy: { date: 'desc' },
    });

    // Enrich with journal-entry-derived VAT data (single source of truth)
    const companyId = ctx.activeCompanyId;
    if (companyId) {
      try {
        const vatMap = await enrichTransactionsWithVAT(transactions.map(t => ({
          ...t,
          amount: Number(t.amount),
          vatPercent: Number(t.vatPercent),
        })), companyId);
        // Add journal-derived VAT to each transaction.
        // IMPORTANT: If no journal entry is found for a transaction, journalVAT
        // is set to null — we do NOT fall back to a fabricated amount × vatPercent
        // calculation. The summary totals are always correct via computeVATRegister().
        const enriched = transactions.map(t => {
          const jeVAT = vatMap.get(t.id);
          return {
            ...t,
            journalVAT: jeVAT
              ? { amount: jeVAT.vatAmount, code: jeVAT.vatCode, rate: jeVAT.vatRate }
              : null,
          };
        });
        return NextResponse.json({ transactions: enriched });
      } catch (e) {
        logger.warn('Failed to enrich transactions with journal VAT data:', e);
      }
    }

    return NextResponse.json({ transactions });
  } catch (error) {
    logger.error('Get transactions error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

// POST - Create a new transaction
export const POST = withGuard({
  auth: true,
  requireCompany: true,
  blockOversight: true,
  blockDemo: true,
  requireTokenPay: true,
  permissions: [Permission.DATA_CREATE],
}, async (request, ctx) => {
  try {
    const body = await request.json();
    const { type, date, amount, description, vatPercent, receiptImage, accountId, projectId } = body;

    if (!date || !amount || !description) {
      return NextResponse.json(
        { error: 'Date, amount, and description are required' },
        { status: 400 }
      );
    }

    // Validate transaction type
    const validTypes = Object.values(TransactionType);
    const txType = type && validTypes.includes(type) ? type : 'SALE';

    // Validate amount
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount)) {
      return NextResponse.json(
        { error: 'Amount must be a valid number' },
        { status: 400 }
      );
    }

    // PURCHASE transactions require an accountId for double-entry bookkeeping.
    // This ensures every purchase is properly recorded with debit/credit lines
    // in the journal (single source of truth).
    if (txType === 'PURCHASE' && !accountId) {
      return NextResponse.json(
        { error: 'En omkostningskonto er påkrævet for at bogføre et indkøb. Vælg en konto fra kontoplanen (6xxx–9xxx). / An expense account is required to record a purchase. Select an account from the chart of accounts (6xxx–9xxx).' },
        { status: 400 }
      );
    }

    // Validate accountId — must belong to the same company
    if (accountId) {
      const account = await db.account.findFirst({
        where: { id: accountId, companyId: ctx.activeCompanyId! },
      });
      if (!account) {
        return NextResponse.json(
          { error: 'Invalid account' },
          { status: 400 }
        );
      }
    }

    // ─── Pre-flight check for PURCHASE journal-entry prerequisites ──────
    // A purchase MUST produce a balanced journal entry. If any required
    // system account is missing (Bank 1100, Input VAT 5410/5420), we fail
    // LOUDLY before creating anything — so the user gets a clear error
    // instead of a silently half-created transaction with no journal entry.
    if (txType === 'PURCHASE') {
      const vatPct = vatPercent ?? 25;
      const [bankAccount, inputVatAccount, expenseAccount] = await Promise.all([
        db.account.findFirst({ where: { companyId: ctx.activeCompanyId!, number: '1100', isActive: true } }),
        db.account.findFirst({ where: { companyId: ctx.activeCompanyId!, number: vatPct === 12 ? '5420' : '5410', isActive: true } }),
        accountId ? db.account.findFirst({ where: { id: accountId, companyId: ctx.activeCompanyId! } }) : Promise.resolve(null),
      ]);

      const missing: string[] = [];
      if (!bankAccount) missing.push('1100 Bankkonto');
      if (!inputVatAccount) missing.push(`${vatPct === 12 ? '5420' : '5410'} Indgående moms`);
      if (!expenseAccount) missing.push('valgt omkostningskonto');

      if (missing.length > 0) {
        const isDa = true; // default to Danish for the error message
        const msg = isDa
          ? `Kan ikke bogføre indkøb — følgende konti mangler i kontoplanen: ${missing.join(', ')}. Gå til Kontoplan og klik "Standardkonti" for at oprette den danske standardkontoplan.`
          : `Cannot record purchase — the following accounts are missing from the chart of accounts: ${missing.join(', ')}. Go to Chart of Accounts and click "Seed" to create the standard Danish chart.`;
        logger.error(`[PURCHASE] Prerequisite check failed for company ${ctx.activeCompanyId}: missing ${missing.join(', ')}`);
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    // ─── Create transaction + journal entry ATOMICALLY ───────────────────
    // Both must succeed or neither does — no half-created state.
    let transaction;
    try {
      transaction = await db.$transaction(async (tx) => {
        // 1. Create the transaction record
        const newTx = await tx.transaction.create({
          data: {
            type: txType,
            date: new Date(date),
            amount: parsedAmount,
            description,
            vatPercent: vatPercent ?? 25.0,
            receiptImage,
            accountId: accountId || null,
            userId: ctx.id,
            companyId: ctx.activeCompanyId!,
          },
        });

        // 2. For PURCHASE, create the paired journal entry
        if (txType === 'PURCHASE') {
          const netAmount = parsedAmount;
          const vatPct = vatPercent ?? 25;
          const vatAmount = (netAmount * vatPct) / 100;
          const grossAmount = netAmount + vatAmount;

          if (netAmount <= 0 || grossAmount <= 0) {
            throw new Error(`Invalid amount: net=${netAmount}, gross=${grossAmount}`);
          }

          // Re-fetch accounts inside the transaction (consistent read)
          const [bankAccount, inputVatAccount, expenseAccount] = await Promise.all([
            tx.account.findFirst({ where: { companyId: ctx.activeCompanyId!, number: '1100', isActive: true } }),
            tx.account.findFirst({ where: { companyId: ctx.activeCompanyId!, number: vatPct === 12 ? '5420' : '5410', isActive: true } }),
            accountId ? tx.account.findFirst({ where: { id: accountId, companyId: ctx.activeCompanyId! } }) : Promise.resolve(null),
          ]);

          if (!bankAccount || !expenseAccount) {
            throw new Error('Required account disappeared during transaction');
          }

          const jeLines: Array<{ accountId: string; debit: number; credit: number; description: string; vatCode: VATCode | null; companyId: string; projectId: string | null }> = [];

          // Debit expense account (net amount) — carries projectId
          jeLines.push({
            accountId: expenseAccount.id,
            debit: netAmount,
            credit: 0,
            description,
            vatCode: null,
            companyId: ctx.activeCompanyId!,
            projectId: projectId || null,
          });

          // Debit input VAT account (VAT amount) — no projectId (VAT is company-level)
          if (inputVatAccount && vatAmount > 0) {
            const vatCode: VATCode = vatPct === 25 ? 'K25' : vatPct === 12 ? 'K12' : 'K0';
            jeLines.push({
              accountId: inputVatAccount.id,
              debit: Math.round(vatAmount * 100) / 100,
              credit: 0,
              description: `${description} – Indgående moms ${vatPct}%`,
              vatCode,
              companyId: ctx.activeCompanyId!,
              projectId: null,
            });
          }

          // Credit bank account (gross amount) — no projectId
          jeLines.push({
            accountId: bankAccount.id,
            debit: 0,
            credit: Math.round(grossAmount * 100) / 100,
            description: `${description} – Betaling`,
            vatCode: null,
            companyId: ctx.activeCompanyId!,
            projectId: null,
          });

          // Validate balance BEFORE creating
          const totalDebit = jeLines.reduce((s, l) => s + l.debit, 0);
          const totalCredit = jeLines.reduce((s, l) => s + l.credit, 0);
          if (jeLines.length < 2 || Math.abs(totalDebit - totalCredit) >= 0.01) {
            throw new Error(`Unbalanced journal entry: DR=${totalDebit}, CR=${totalCredit}, lines=${jeLines.length}`);
          }

          const je = await tx.journalEntry.create({
            data: {
              date: new Date(date),
              description: `Køb – ${description}`,
              reference: `TX-${newTx.id.slice(0, 8)}`,
              status: 'POSTED',
              userId: ctx.id,
              companyId: ctx.activeCompanyId!,
              lines: {
                create: jeLines.map(l => ({
                  companyId: l.companyId,
                  account: { connect: { id: l.accountId } },
                  debit: l.debit,
                  credit: l.credit,
                  description: l.description,
                  vatCode: l.vatCode,
                  // Prisma v6 requires relation connections via { connect },
                  // not the raw foreign-key field name, inside nested creates.
                  ...(l.projectId ? { project: { connect: { id: l.projectId } } } : {}),
                })),
              },
            },
          });

          await assignVoucherNumberIfPosted(tx, je.id, ctx.activeCompanyId!, 'POSTED');
          logger.info(`[PURCHASE] Created journal entry ${je.id} for transaction ${newTx.id}: DR=${totalDebit}, CR=${totalCredit}, projectId=${projectId || 'none'}`);
        }

        return newTx;
      });
    } catch (txError) {
      logger.error('[PURCHASE] Atomic transaction+journal creation failed:', txError);
      const errMsg = txError instanceof Error ? txError.message : 'Unknown error';
      return NextResponse.json(
        { error: `Kunne ikke bogføre indkøb: ${errMsg}. / Failed to record purchase: ${errMsg}.` },
        { status: 500 }
      );
    }

    // Audit log
    await auditCreate(
      ctx.id,
      'Transaction',
      transaction.id,
      { type: txType, date, amount: parsedAmount, description, vatPercent, receiptImage, accountId },
      requestMetadata(request),
      ctx.activeCompanyId
    );

    // Trigger initial backup on first tenant data input
    ensureInitialBackup(ctx.activeCompanyId!, ctx.id);

    notifyDataChanges([
      { scope: 'transactions', companyId: ctx.activeCompanyId!, action: 'create' },
      { scope: 'dashboard', companyId: ctx.activeCompanyId!, action: 'update' },
      { scope: 'ledger', companyId: ctx.activeCompanyId!, action: 'update' },
      { scope: 'cash-flow', companyId: ctx.activeCompanyId!, action: 'update' },
      { scope: 'reports', companyId: ctx.activeCompanyId!, action: 'update' },
    ]).catch(() => {});

    return NextResponse.json({ transaction });
  } catch (error) {
    logger.error('Create transaction error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

// PUT - Update a transaction (e.g., attach receipt) — with audit trail
export const PUT = withGuard({
  auth: true,
  requireCompany: true,
  blockOversight: true,
  blockDemo: true,
  requireTokenPay: true,
  permissions: [Permission.DATA_EDIT],
}, async (request, ctx) => {
  try {
    const body = await request.json();
    const { id, receiptImage } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Transaction ID is required' },
        { status: 400 }
      );
    }

    // Verify ownership
    
    const existing = await db.transaction.findFirst({
      where: { id, ...tenantFilter(ctx) },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Update only allowed fields
    const updateData: Record<string, unknown> = {};
    if (receiptImage !== undefined) {
      updateData.receiptImage = receiptImage;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    const transaction = await db.transaction.update({
      where: { id },
      data: updateData as Prisma.TransactionUpdateInput,
    });

    // Audit log with old/new values
    await auditUpdate(
      ctx.id,
      'Transaction',
      id,
      { receiptImage: existing.receiptImage },
      { receiptImage },
      requestMetadata(request),
      ctx.activeCompanyId
    );

    return NextResponse.json({ transaction });
  } catch (error) {
    logger.error('Update transaction error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

// DELETE - Soft-delete (cancel) a transaction — NOT a hard delete
// Per bogføringsloven, transactions must be preserved (cancelled, not deleted)
export const DELETE = withGuard({
  auth: true,
  requireCompany: true,
  blockOversight: true,
  blockDemo: true,
  requireTokenPay: true,
  permissions: [Permission.DATA_DELETE],
}, async (request, ctx) => {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const reason = searchParams.get('reason') || 'User requested cancellation';

    if (!id) {
      return NextResponse.json(
        { error: 'Transaction ID is required' },
        { status: 400 }
      );
    }

    // Verify ownership
    
    const transaction = await db.transaction.findFirst({
      where: { id, ...tenantFilter(ctx), cancelled: false },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction not found or already cancelled' },
        { status: 404 }
      );
    }

    // Soft-delete: mark as cancelled instead of deleting
    await db.transaction.update({
      where: { id },
      data: {
        cancelled: true,
        cancelReason: reason,
      },
    });

    // Audit log
    await auditCancel(
      ctx.id,
      'Transaction',
      id,
      reason,
      requestMetadata(request),
      ctx.activeCompanyId
    );

    notifyDataChanges([
      { scope: 'transactions', companyId: ctx.activeCompanyId!, action: 'delete' },
      { scope: 'dashboard', companyId: ctx.activeCompanyId!, action: 'update' },
      { scope: 'ledger', companyId: ctx.activeCompanyId!, action: 'update' },
      { scope: 'cash-flow', companyId: ctx.activeCompanyId!, action: 'update' },
      { scope: 'reports', companyId: ctx.activeCompanyId!, action: 'update' },
    ]).catch(() => {});

    return NextResponse.json({ success: true, message: 'Transaction cancelled (soft-delete)' });
  } catch (error) {
    logger.error('Cancel transaction error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
