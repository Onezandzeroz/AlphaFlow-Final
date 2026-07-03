import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';
import { auditCreate, auditUpdate, auditCancel, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { TransactionType, Prisma, VATCode } from '@prisma/client';
import { tenantFilter, Permission, projectScope } from '@/lib/rbac';
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
    // ── Project Mode (FASE 4) ──
    // In project mode we deliberately return ALL tenant transactions (not
    // just the project's), so the UI can gray-out the non-project ones and
    // give the user a strong visual signal of what belongs to the active
    // project vs. the tenant. The `project` relation is included so the
    // client can determine membership.
    //
    // Cancelled transactions ARE included (cancelled: true) so the UI can
    // show them struck-through + grayed-out. Danish bookkeeping law requires
    // cancelled entries to be preserved (not deleted), and showing them
    // crossed-out gives the user a clear audit trail.
    const where = {
      ...tenantFilter(ctx),
    };

    const transactions = await db.transaction.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        project: { select: { id: true, name: true, color: true, code: true } },
      },
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

    // ── Project Mode (FASE 4) ──
    // Defence-in-depth: when the session is in project mode, force projectId
    // to the active project regardless of what the client sent. This pairs
    // with the form-level useEffect + locked ProjectSelector so a saved
    // draft or tampered request cannot escape the project context.
    const effectiveProjectId = ctx.isProjectMode
      ? ctx.activeProjectId
      : (projectId || null);

    // Validate projectId (when not in project mode) — must belong to the
    // active company and be ACTIVE.
    if (!ctx.isProjectMode && effectiveProjectId) {
      const project = await db.project.findFirst({
        where: { id: effectiveProjectId, companyId: ctx.activeCompanyId! },
        select: { id: true },
      });
      if (!project) {
        return NextResponse.json(
          { error: 'Ugyldigt projekt. / Invalid project.' },
          { status: 400 }
        );
      }
    }

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
            projectId: effectiveProjectId,
            userId: ctx.id,
            companyId: ctx.activeCompanyId!,
          },
        });

        // 2. For PURCHASE, create the paired journal entry
        //
        // ── POSTING MODEL (current — "Solution A") ──────────────────────────
        // The client aggregates all purchase lines (including negative discount
        // lines) into a SINGLE net amount and sends it here as `amount`. We
        // create ONE journal entry with three lines: expense (net), input VAT,
        // bank (gross). A discount on the invoice is therefore "baked into"
        // the net amount rather than posted on its own line.
        //
        // This is compliant with bogføringsloven for the common case of a
        // trade discount shown on the supplier's invoice at purchase time:
        //   • The voucher (receiptImage) shows the full breakdown (gross item,
        //     discount line, net, VAT, total) — satisfies §10 traceability.
        //   • VAT is computed on the actually-paid net (after discount) —
        //     correct per momsloven.
        //   • Immutability (§7-8) is preserved: entries are never deleted,
        //     only reversed via a counter-entry.
        //
        // ── KNOWN LIMITATIONS (consider "Solution B" if these bite) ─────────
        // 1. Management information: discounts are invisible in reports — you
        //    cannot see total discounts received YTD because they are folded
        //    into the net expense. Not a legal issue, but an MIS limitation.
        // 2. Mixed VAT rates: the client picks the MOST COMMON VAT% among
        //    lines and applies it to the whole net. If an invoice has lines
        //    at different VAT rates (e.g. 25% goods + 0% rebate), VAT will be
        //    computed on the wrong rate for part of the amount. In practice
        //    discounts carry the same rate as the item they reduce, so this is
        //    rarely triggered — but it is a latent correctness gap.
        // 3. Credit notes / annual rebates received AFTER the original
        //    purchase: posting these as a "negative purchase" (netAmount < 0,
        //    direction reversed below) is technically possible but is NOT
        //    best practice. They should ideally be a separate journal entry
        //    to a dedicated rebate/other-operating-income account. Use the
        //    negative-net path here for on-invoice discounts only.
        // 4. Per-line project allocation: the whole entry uses ONE projectId.
        //    Lines cannot be split across projects in a single transaction.
        //
        // "Solution B" (future refactor) would accept an array of lines from
        // the client and create one journal line per purchase line (with its
        // own account, VAT code, and project), giving full fidelity. It is a
        // larger change to both the API contract and the client aggregation
        // logic, so it is deferred until a concrete need arises.
        if (txType === 'PURCHASE') {
          const netAmount = parsedAmount;
          const vatPct = vatPercent ?? 25;
          const vatAmount = (netAmount * vatPct) / 100;
          const grossAmount = netAmount + vatAmount;

          // Validate against non-finite values only. A net amount of zero or
          // negative is allowed: a negative net represents a discount/credit
          // (e.g. an invoice line with a negative amount, or a credit note)
          // and is recorded by reversing the debit/credit direction below.
          if (!isFinite(netAmount) || !isFinite(grossAmount)) {
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

          // Determine the posting direction from the sign of netAmount.
          // A normal purchase (netAmount > 0): debit expense + input VAT, credit bank.
          // A discount/credit (netAmount < 0): credit expense + input VAT, debit bank —
          // the reversal direction, so debit/credit values stay positive (proper
          // double-entry convention) and the entry balances to zero.
          // netAmount === 0 produces no movement; we still create the entry for the
          // audit trail but all lines are zero (rejected by the balance check below,
          // so in practice the client must send a non-zero amount).
          const isNegative = netAmount < 0;
          const absNet = Math.abs(netAmount);
          const absVat = Math.abs(vatAmount);
          const absGross = Math.abs(grossAmount);

          const jeLines: Array<{ accountId: string; debit: number; credit: number; description: string; vatCode: VATCode | null; companyId: string; projectId: string | null }> = [];

          // Expense account (net amount) — carries projectId.
          // Normal: debit; discount/credit: credit.
          jeLines.push({
            accountId: expenseAccount.id,
            debit: isNegative ? 0 : Math.round(absNet * 100) / 100,
            credit: isNegative ? Math.round(absNet * 100) / 100 : 0,
            description,
            vatCode: null,
            companyId: ctx.activeCompanyId!,
            projectId: effectiveProjectId || null,
          });

          // Input VAT account (VAT amount) — no projectId (VAT is company-level).
          // Normal: debit; discount/credit: credit. Only posted when non-zero.
          if (inputVatAccount && absVat > 0) {
            const vatCode: VATCode = vatPct === 25 ? 'K25' : vatPct === 12 ? 'K12' : 'K0';
            jeLines.push({
              accountId: inputVatAccount.id,
              debit: isNegative ? 0 : Math.round(absVat * 100) / 100,
              credit: isNegative ? Math.round(absVat * 100) / 100 : 0,
              description: `${description} – Indgående moms ${vatPct}%`,
              vatCode,
              companyId: ctx.activeCompanyId!,
              projectId: null,
            });
          }

          // Bank account (gross amount) — no projectId.
          // Normal: credit (money out); discount/credit: debit (money back in).
          jeLines.push({
            accountId: bankAccount.id,
            debit: isNegative ? Math.round(absGross * 100) / 100 : 0,
            credit: isNegative ? 0 : Math.round(absGross * 100) / 100,
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
          logger.info(`[PURCHASE] Created journal entry ${je.id} for transaction ${newTx.id}: DR=${totalDebit}, CR=${totalCredit}, projectId=${effectiveProjectId || 'none'}`);
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
      { type: txType, date, amount: parsedAmount, description, vatPercent, receiptImage, accountId, projectId: effectiveProjectId },
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
    const reason = searchParams.get('reason') || 'SYSTEM:USER_REQUESTED';

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

    // ── Create a reversal journal entry (modpostering) ──
    // Per bogføringsloven §10-12, cancelling a transaction must be done by
    // creating a counter-entry (modpostering) that neutralises the original —
    // NOT by hiding/deleting the original. Both entries stay POSTED + visible
    // in the journal; together they net to zero in all accounting figures
    // (ledger, reports, budgets, cash-flow, aging, etc.).
    //
    // The original journal entry (reference `TX-<id>`) stays POSTED + not
    // cancelled. We create a NEW journal entry with the same lines but
    // debit/credit swapped, reference `REVERSAL-TX-<id>`, so the two entries
    // cancel each other out in every calculation.
    const txRefPrefix = `TX-${id.slice(0, 8)}`;
    const originalJournalEntries = await db.journalEntry.findMany({
      where: {
        reference: txRefPrefix,
        ...tenantFilter(ctx),
        cancelled: false,
      },
      include: {
        lines: true,
      },
    });

    for (const originalJE of originalJournalEntries) {
      // Create the reversal entry with swapped debit/credit on each line.
      //
      // DATE: the reversal is dated at the ORIGINAL journal entry's date — NOT
      // `new Date()` (today). This is critical for period-based reports (VAT,
      // profit & loss): if the reversal were dated at the cancellation date and
      // that falls in a different reporting period, the original and reversal
      // would not net to zero within any single period's report, leaving stale
      // VAT/amounts in the original period. Dating the reversal at the original
      // date keeps both entries in the same period so they always net out.
      // (computeVATRegister additionally excludes cancelled-transaction JEs as
      // a belt-and-suspenders safeguard, but dating them in the same period is
      // the correct accounting treatment and keeps the ledger consistent too.)
      const reversalJE = await db.journalEntry.create({
        data: {
          date: originalJE.date,
          description: `Annullering – ${originalJE.description}`,
          reference: `REVERSAL-${originalJE.reference || txRefPrefix}`,
          status: 'POSTED',
          userId: ctx.id,
          companyId: ctx.activeCompanyId!,
          lines: {
            create: originalJE.lines.map((line) => ({
              companyId: line.companyId,
              account: { connect: { id: line.accountId } },
              // Swap debit ↔ credit to reverse the entry
              debit: Number(line.credit) || 0,
              credit: Number(line.debit) || 0,
              description: `Annullering – ${line.description || ''}`,
              vatCode: line.vatCode,
              ...(line.projectId ? { project: { connect: { id: line.projectId } } } : {}),
            })),
          },
        },
      });

      logger.info(
        `[TRANSACTION CANCEL] Created reversal journal entry ${reversalJE.id} (reference: ${reversalJE.reference}, date: ${originalJE.date.toISOString()}) for transaction ${id}`
      );
    }

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
