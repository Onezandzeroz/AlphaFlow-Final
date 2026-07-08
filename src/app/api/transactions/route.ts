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
import { VAT_RATE_MAP } from '@/lib/vat-codes';

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
    const { type, date, amount, description, vatPercent, receiptImage, accountId, projectId, lineItems, documentType, originalTransactionId } = body;

    // Purchase credit notes: a supplier credit note received by the tenant.
    // Marked via documentType='PURCHASE_CREDIT_NOTE' on a PURCHASE row. The
    // bookkeeping is identical to a regular purchase with NEGATIVE amounts —
    // the existing line-item logic already mirrors debit↔credit when netAmount
    // < 0 (see the isNegative branches below). The client is expected to send
    // negative amounts; we just persist the documentType + link here.
    const isPurchaseCreditNote = documentType === 'PURCHASE_CREDIT_NOTE';
    let resolvedOriginalTransactionId: string | null = null;
    if (isPurchaseCreditNote && originalTransactionId) {
      const original = await db.transaction.findFirst({
        where: {
          id: originalTransactionId,
          companyId: ctx.activeCompanyId!,
          type: 'PURCHASE',
          // can't credit another credit note — only regular purchases (documentType
          // null/empty) are eligible. Using `notIn` keeps null rows (regular
          // purchases) whereas `NOT: { equals }` would also drop them in Prisma.
          documentType: { notIn: ['PURCHASE_CREDIT_NOTE'] },
          cancelled: false,
        },
        select: { id: true },
      });
      if (!original) {
        return NextResponse.json(
          { error: 'Det originale køb blev ikke fundet eller kan ikke krediteres. / Original purchase not found or cannot be credited.' },
          { status: 400 }
        );
      }
      resolvedOriginalTransactionId = original.id;
    }

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
    // A purchase MUST produce a balanced journal entry. We need the Bank
    // account (1100) always, plus the input VAT accounts (5410 for 25%,
    // 5420 for 12%) when any line carries a VAT code with that rate.
    // We fail LOUDLY before creating anything so the user gets a clear error.
    if (txType === 'PURCHASE') {
      const missing: string[] = [];
      const bankAccount = await db.account.findFirst({ where: { companyId: ctx.activeCompanyId!, number: '1100', isActive: true } });
      if (!bankAccount) missing.push('1100 Bankkonto');

      // Check which VAT rates are needed (Solution B: per-line VAT codes)
      const neededRates = new Set<number>();
      if (lineItems && Array.isArray(lineItems)) {
        for (const li of lineItems) {
          const rate = VAT_RATE_MAP[li.vatCode] ?? 0;
          if (rate > 0) neededRates.add(rate);
        }
      } else {
        // Backward compat (Solution A): single vatPercent
        const vatPct = vatPercent ?? 25;
        if (vatPct > 0) neededRates.add(vatPct);
      }

      if (neededRates.has(25)) {
        const vat25 = await db.account.findFirst({ where: { companyId: ctx.activeCompanyId!, number: '5410', isActive: true } });
        if (!vat25) missing.push('5410 Indgående moms 25%');
      }
      if (neededRates.has(12)) {
        const vat12 = await db.account.findFirst({ where: { companyId: ctx.activeCompanyId!, number: '5420', isActive: true } });
        if (!vat12) missing.push('5420 Indgående moms 12%');
      }

      if (missing.length > 0) {
        const isDa = true;
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
            // Purchase credit note metadata (null for regular purchases/sales)
            documentType: isPurchaseCreditNote ? 'PURCHASE_CREDIT_NOTE' : null,
            originalTransactionId: resolvedOriginalTransactionId,
          },
        });

        // 2. For PURCHASE, create the paired journal entry.
        //
        // ── POSTING MODEL ("Solution B" — per-line fidelity) ───────────────
        // The client sends a `lineItems` array where each line has its own
        // accountId, netAmount, and VAT code. We create ONE journal entry
        // with multiple lines:
        //   • One expense line per purchase line (debit if positive, credit
        //     if negative — e.g. a discount).
        //   • One input-VAT line per line with VAT > 0 (on 5410 for 25% or
        //     5420 for 12%), tagged with the line's VAT code.
        //   • One bank line for the total gross (credit if money out, debit
        //     if money back in — when the total is negative).
        //
        // This correctly handles:
        //   • Mixed accounts in one transaction (8200, 8300, 8400 …)
        //   • Mixed VAT codes per line (K0, K25, K12 …)
        //   • Negative lines (discounts/credits) with reversed direction
        //   • The VAT register reads the VAT lines → correct totals per code
        //
        // Backward compatibility: if `lineItems` is absent (old clients), we
        // fall back to the Solution A path — a single 3-line entry using the
        // aggregate `amount`, `vatPercent`, and `accountId`.
        //
        // Compliance: bogføringsloven §7-8 (immutability — entries are only
        // reversed, never deleted), §10 (traceability — the voucher is
        // attached via receiptImage), and momsloven (VAT computed on the
        // actually-paid net per line).
        if (txType === 'PURCHASE') {
          const jeLines: Array<{ accountId: string; debit: number; credit: number; description: string; vatCode: VATCode | null; companyId: string; projectId: string | null }> = [];
          let totalGross = 0;
          let totalDebit = 0;
          let totalCredit = 0;
          const r2 = (n: number) => Math.round(n * 100) / 100;

          if (lineItems && Array.isArray(lineItems) && lineItems.length > 0) {
            // ── Solution B: multi-line path ──
            // Pre-fetch system accounts inside the transaction (consistent read)
            const bankAccount = await tx.account.findFirst({ where: { companyId: ctx.activeCompanyId!, number: '1100', isActive: true } });
            if (!bankAccount) throw new Error('Bank account 1100 disappeared during transaction');

            // Cache VAT accounts to avoid repeated queries
            const vatAccountCache: Record<number, string | null> = {};
            for (const li of lineItems) {
              const rate = VAT_RATE_MAP[li.vatCode] ?? 0;
              if (rate > 0 && !(rate in vatAccountCache)) {
                const vatAcc = await tx.account.findFirst({ where: { companyId: ctx.activeCompanyId!, number: rate === 12 ? '5420' : '5410', isActive: true } });
                vatAccountCache[rate] = vatAcc?.id ?? null;
              }
            }

            for (const li of lineItems) {
              const netAmount = Number(li.netAmount);
              if (!isFinite(netAmount)) {
                throw new Error(`Invalid line amount: ${li.netAmount}`);
              }

              const vatCode = li.vatCode as VATCode;
              const rate = VAT_RATE_MAP[li.vatCode] ?? 0;
              const vatAmount = (netAmount * rate) / 100;
              const lineGross = netAmount + vatAmount;
              totalGross += lineGross;

              // Validate the expense account belongs to this company
              const expenseAccount = await tx.account.findFirst({ where: { id: li.accountId, companyId: ctx.activeCompanyId! } });
              if (!expenseAccount) {
                throw new Error(`Invalid expense account: ${li.accountId}`);
              }

              const lineDesc = li.description?.trim() || description;
              const isNegative = netAmount < 0;
              const absNet = Math.abs(netAmount);

              // Expense line — debit (normal) or credit (discount/credit)
              jeLines.push({
                accountId: li.accountId,
                debit: isNegative ? 0 : r2(absNet),
                credit: isNegative ? r2(absNet) : 0,
                description: lineDesc,
                vatCode,
                companyId: ctx.activeCompanyId!,
                projectId: effectiveProjectId || null,
              });
              if (isNegative) totalCredit += r2(absNet); else totalDebit += r2(absNet);

              // Input VAT line — only when non-zero VAT
              if (Math.abs(vatAmount) > 0.005) {
                const vatAccId = vatAccountCache[rate];
                if (!vatAccId) {
                  throw new Error(`Input VAT account for rate ${rate}% not found`);
                }
                const absVat = Math.abs(vatAmount);
                jeLines.push({
                  accountId: vatAccId,
                  debit: isNegative ? 0 : r2(absVat),
                  credit: isNegative ? r2(absVat) : 0,
                  description: `${lineDesc} – Indgående moms ${rate}%`,
                  vatCode,
                  companyId: ctx.activeCompanyId!,
                  projectId: null,
                });
                if (isNegative) totalCredit += r2(absVat); else totalDebit += r2(absVat);
              }
            }

            // Bank line — total gross
            const absGross = Math.abs(totalGross);
            const grossNegative = totalGross < 0;
            jeLines.push({
              accountId: bankAccount.id,
              debit: grossNegative ? r2(absGross) : 0,
              credit: grossNegative ? 0 : r2(absGross),
              description: `${description} – Betaling`,
              vatCode: null,
              companyId: ctx.activeCompanyId!,
              projectId: null,
            });
            if (grossNegative) totalDebit += r2(absGross); else totalCredit += r2(absGross);

          } else {
            // ── Backward compatibility: Solution A (single-line) path ──
            // Used by old clients / recurring entries that don't send lineItems.
            const netAmount = parsedAmount;
            const vatPct = vatPercent ?? 25;
            const vatAmount = (netAmount * vatPct) / 100;
            const grossAmount = netAmount + vatAmount;

            if (!isFinite(netAmount) || !isFinite(grossAmount)) {
              throw new Error(`Invalid amount: net=${netAmount}, gross=${grossAmount}`);
            }

            const [bankAccount, inputVatAccount, expenseAccount] = await Promise.all([
              tx.account.findFirst({ where: { companyId: ctx.activeCompanyId!, number: '1100', isActive: true } }),
              tx.account.findFirst({ where: { companyId: ctx.activeCompanyId!, number: vatPct === 12 ? '5420' : '5410', isActive: true } }),
              accountId ? tx.account.findFirst({ where: { id: accountId, companyId: ctx.activeCompanyId! } }) : Promise.resolve(null),
            ]);

            if (!bankAccount || !expenseAccount) {
              throw new Error('Required account disappeared during transaction');
            }

            const isNegative = netAmount < 0;
            const absNet = Math.abs(netAmount);
            const absVat = Math.abs(vatAmount);
            const absGross = Math.abs(grossAmount);

            jeLines.push({
              accountId: expenseAccount.id,
              debit: isNegative ? 0 : r2(absNet),
              credit: isNegative ? r2(absNet) : 0,
              description,
              vatCode: null,
              companyId: ctx.activeCompanyId!,
              projectId: effectiveProjectId || null,
            });

            if (inputVatAccount && absVat > 0) {
              const vatCode: VATCode = vatPct === 25 ? 'K25' : vatPct === 12 ? 'K12' : 'K0';
              jeLines.push({
                accountId: inputVatAccount.id,
                debit: isNegative ? 0 : r2(absVat),
                credit: isNegative ? r2(absVat) : 0,
                description: `${description} – Indgående moms ${vatPct}%`,
                vatCode,
                companyId: ctx.activeCompanyId!,
                projectId: null,
              });
            }

            jeLines.push({
              accountId: bankAccount.id,
              debit: isNegative ? r2(absGross) : 0,
              credit: isNegative ? 0 : r2(absGross),
              description: `${description} – Betaling`,
              vatCode: null,
              companyId: ctx.activeCompanyId!,
              projectId: null,
            });
          }

          // Validate balance BEFORE creating
          totalDebit = jeLines.reduce((s, l) => s + l.debit, 0);
          totalCredit = jeLines.reduce((s, l) => s + l.credit, 0);
          if (jeLines.length < 2 || Math.abs(totalDebit - totalCredit) >= 0.01) {
            throw new Error(`Unbalanced journal entry: DR=${totalDebit}, CR=${totalCredit}, lines=${jeLines.length}`);
          }

          const je = await tx.journalEntry.create({
            data: {
              date: new Date(date),
              description: isPurchaseCreditNote ? `Købskreditnota – ${description}` : `Køb – ${description}`,
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
                  ...(l.projectId ? { project: { connect: { id: l.projectId } } } : {}),
                })),
              },
            },
          });

          await assignVoucherNumberIfPosted(tx, je.id, ctx.activeCompanyId!, 'POSTED');
          logger.info(`[PURCHASE] Created journal entry ${je.id} for transaction ${newTx.id}: DR=${totalDebit}, CR=${totalCredit}, lines=${jeLines.length}, projectId=${effectiveProjectId || 'none'}`);
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
      { type: txType, date, amount: parsedAmount, description, vatPercent, receiptImage, accountId, projectId: effectiveProjectId, documentType: isPurchaseCreditNote ? 'PURCHASE_CREDIT_NOTE' : null, originalTransactionId: resolvedOriginalTransactionId },
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
