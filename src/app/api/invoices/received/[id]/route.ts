import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  auditUpdate,
  auditCancel,
  auditDeleteAttempt,
  auditCreate,
  requestMetadata,
} from '@/lib/audit';
import { tenantFilter, Permission } from '@/lib/rbac';
import { generateInvoiceResponse } from '@/lib/einvoice-response';
import { logger } from '@/lib/logger';
import { JournalEntryStatus, VATCode } from '@prisma/client';
import { assignVoucherNumberIfPosted } from '@/lib/voucher-number';
import { sealJournalEntry } from '@/lib/journal-hash-chain';
import { withGuard } from '@/lib/route-guard';
import { notifyDataChange, notifyDataChanges } from '@/lib/notify-data-change';

// ─── GET /api/invoices/received/[id] ────────────────────────────

export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  async (request, ctx, context) => {
    try {
      const { id } = await context.params as { id: string };

      const invoice = await db.receivedInvoice.findFirst({
        where: { id, ...tenantFilter(ctx) },
      });

      if (!invoice) {
        return NextResponse.json({ error: 'Received invoice not found' }, { status: 404 });
      }

      return NextResponse.json({ receivedInvoice: invoice });
    } catch (error) {
      logger.error('Get received invoice error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

// ─── PUT /api/invoices/received/[id] ────────────────────────────
// Actions: approve, reject, post

export const PUT = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_EDIT] },
  async (request, ctx, context) => {
    try {
      const { id } = await context.params as { id: string };
      const body = await request.json();
      const { action, reason } = body;

      if (!action || !['approve', 'reject', 'post'].includes(action)) {
        return NextResponse.json(
          { error: 'Missing or invalid action. Must be: approve, reject, or post' },
          { status: 400 }
        );
      }

      const companyId = ctx.activeCompanyId!;

      // Fetch existing invoice
      const existing = await db.receivedInvoice.findFirst({
        where: { id, ...tenantFilter(ctx) },
      });

      if (!existing) {
        return NextResponse.json({ error: 'Received invoice not found' }, { status: 404 });
      }

      // ── APPROVE ──────────────────────────────────────────────
      if (action === 'approve') {
        if (existing.status !== 'RECEIVED') {
          return NextResponse.json(
            { error: `Cannot approve invoice with status "${existing.status}". Only RECEIVED invoices can be approved.` },
            { status: 400 }
          );
        }

        const updated = await db.receivedInvoice.update({
          where: { id },
          data: {
            status: 'APPROVED',
            approvedBy: ctx.id,
            approvedAt: new Date(),
          },
        });

        await auditUpdate(
          ctx.id,
          'ReceivedInvoice' as never,
          id,
          { status: existing.status },
          { status: 'APPROVED', approvedBy: ctx.id },
          { action: 'approve' },
          companyId
        );

        notifyDataChange({ scope: 'received-invoices', companyId, action: 'update' }).catch(() => {});

        return NextResponse.json({ receivedInvoice: updated });
      }

      // ── REJECT ───────────────────────────────────────────────
      if (action === 'reject') {
        if (existing.status !== 'RECEIVED' && existing.status !== 'APPROVED') {
          return NextResponse.json(
            { error: `Cannot reject invoice with status "${existing.status}". Only RECEIVED or APPROVED invoices can be rejected.` },
            { status: 400 }
          );
        }

        const updated = await db.receivedInvoice.update({
          where: { id },
          data: {
            status: 'REJECTED',
            rejectionReason: reason || 'Rejected by user',
          },
        });

        await auditCancel(
          ctx.id,
          'ReceivedInvoice' as never,
          id,
          reason || 'Rejected by user',
          { action: 'reject' },
          companyId
        );

        notifyDataChange({ scope: 'received-invoices', companyId, action: 'update' }).catch(() => {});

        return NextResponse.json({ receivedInvoice: updated });
      }

      // ── POST (create JournalEntry) ───────────────────────────
      if (action === 'post') {
        if (existing.status !== 'APPROVED') {
          return NextResponse.json(
            { error: `Cannot post invoice with status "${existing.status}". Only APPROVED invoices can be posted.` },
            { status: 400 }
          );
        }

        // Find accounts for booking
        // Credit: PAYABLES account (liability)
        const payablesAccount = await db.account.findFirst({
          where: {
            companyId,
            group: 'PAYABLES',
            isActive: true,
          },
        });

        // Debit: find an expense account (prefer COST_OF_GOODS, fallback OTHER_OPERATING)
        const expenseAccount = await db.account.findFirst({
          where: {
            companyId,
            group: { in: ['COST_OF_GOODS', 'OTHER_OPERATING'] },
            isActive: true,
          },
          orderBy: { number: 'asc' },
        });

        // Debit: INPUT_VAT account (indgående moms / købsmoms) — used to book the
        // deductible input VAT separately from the net expense. Without this, the
        // full gross amount is booked to expense and the VAT register shows 0 input
        // VAT — so the dashboard's "moms" metric shows 0 instead of the negative
        // net VAT (output − input = refund due) for a purchase-only period.
        // Optional: if absent or the document has no VAT, the full amount is booked
        // to expense (legacy behaviour).
        const inputVatAccount = await db.account.findFirst({
          where: {
            companyId,
            group: 'INPUT_VAT',
            isActive: true,
          },
          orderBy: { number: 'asc' },
        });

        if (!payablesAccount) {
          return NextResponse.json(
            { error: 'No PAYABLES account found in chart of accounts. Please create one before posting e-invoices.' },
            { status: 400 }
          );
        }

        if (!expenseAccount) {
          return NextResponse.json(
            { error: 'No expense account found (COST_OF_GOODS or OTHER_OPERATING). Please create one before posting e-invoices.' },
            { status: 400 }
          );
        }

        // ── Amount split: net (expense) + VAT (input VAT) + total (payable) ──
        // A received purchase invoice carries taxExclusiveAmount (net),
        // taxAmount (VAT), and payableAmount (gross = net + VAT). Booking the VAT
        // to a dedicated INPUT_VAT account (instead of lumping it into expense)
        // makes the VAT register + dashboard "moms" metric reflect the
        // deductible input VAT.
        const netAmount = Number(existing.taxExclusiveAmount) || 0;
        const vatAmount = Number(existing.taxAmount) || 0;
        const totalAmount = Number(existing.payableAmount) || Number(existing.taxInclusiveAmount) || 0;
        const issueDate = existing.issueDate;

        // Book the input VAT separately only when there IS VAT and an INPUT_VAT
        // account exists. Otherwise fall back to booking the full gross amount to
        // expense (legacy behaviour — keeps posting working for tenants without a
        // VAT account or for zero-VAT documents).
        const bookInputVat = vatAmount > 0 && !!inputVatAccount;
        const expenseAmount = bookInputVat ? netAmount : totalAmount;

        // Derive the input VAT code (K25/K12/K0) from the line items' VAT rate so
        // computeVATRegister() categorises the input VAT correctly (not under
        // 'NONE'). Falls back to K25 for non-standard non-zero rates.
        let inputVatCode: VATCode | null = null;
        if (bookInputVat) {
          const lineItemsForVat = (existing.lineItems as Array<{ vatPercent?: number } | null>) ?? [];
          const firstVatPercent = lineItemsForVat[0]?.vatPercent;
          const vatRate =
            typeof firstVatPercent === 'number'
              ? firstVatPercent
              : netAmount > 0
                ? (vatAmount / netAmount) * 100
                : 0;
          const roundedRate = Math.round(vatRate);
          inputVatCode =
            roundedRate === 25 ? 'K25' : roundedRate === 12 ? 'K12' : roundedRate === 0 ? 'K0' : 'K25';
        }

        // ── Document-type-aware posting ────────────────────────
        //
        // INVOICE (documentType = 'INVOICE' or 'CORRECTED'):
        //   Debit  expense account   (NET amount — increase expense)
        //   Debit  INPUT_VAT account  (VAT amount — deductible input VAT)
        //   Credit payables account   (GROSS amount — increase supplier liability)
        //
        // CREDIT_NOTE (documentType = 'CREDIT_NOTE' or 'SELF_BILLED'):
        //   Credit expense account   (NET amount — DECREASE expense — reversal)
        //   Credit INPUT_VAT account  (VAT amount — DECREASE input VAT — reversal)
        //   Debit  payables account   (GROSS amount — DECREASE supplier liability — reversal)
        //
        // A credit note from a supplier REDUCES what you owe them and REDUCES the
        // expense + input VAT you originally booked. Without this swap, posting a
        // credit note would INCORRECTLY increase both the expense and the payable —
        // treating the credit note as if it were another invoice.
        //
        // When bookInputVat is false (no VAT or no INPUT_VAT account), the VAT
        // line is omitted and the full gross amount goes to expense (legacy).
        const isCreditNote =
          existing.documentType === 'CREDIT_NOTE' ||
          existing.documentType === 'SELF_BILLED';

        // For invoices: debit expense + inputVat, credit payables.
        // For credit notes: credit expense + inputVat, debit payables (reversed).
        const expenseDebit = isCreditNote ? 0 : expenseAmount;
        const expenseCredit = isCreditNote ? expenseAmount : 0;
        const inputVatDebit = isCreditNote ? 0 : (bookInputVat ? vatAmount : 0);
        const inputVatCredit = isCreditNote ? (bookInputVat ? vatAmount : 0) : 0;
        const payablesDebit = isCreditNote ? totalAmount : 0;
        const payablesCredit = isCreditNote ? 0 : totalAmount;

        // Build journal entry description — use the correct document noun
        // so the journal entry reads "E-kreditnota: ..." for credit notes
        // and "E-faktura: ..." for invoices.
        const docNounDa = isCreditNote ? 'E-kreditnota' : 'E-faktura';
        const description = `${docNounDa}: ${existing.invoiceNumber} fra ${existing.supplierName}`;
        const expenseLineDesc = `${docNounDa} ${existing.invoiceNumber} — ${existing.supplierName}`;
        const payablesLineDesc = isCreditNote
          ? `Leverandørgæld (kreditnota): ${existing.supplierName} — ${existing.invoiceNumber}`
          : `Leverandørgæld: ${existing.supplierName} — ${existing.invoiceNumber}`;

        // Build the journal lines (2 or 3 lines depending on whether input VAT
        // is booked separately). For invoices: debit expense (+ debit inputVat)
        // + credit payables. For credit notes: reversed.
        const journalLineInputs = [
          // Expense line — Debit (net) for invoices, Credit (net) for credit notes
          {
            companyId,
            accountId: expenseAccount.id,
            debit: expenseDebit,
            credit: expenseCredit,
            description: expenseLineDesc,
          },
          // INPUT_VAT line — Debit (VAT) for invoices, Credit (VAT) for credit
          // notes. Only present when bookInputVat is true (VAT > 0 and an
          // INPUT_VAT account exists). The vatCode (K25/K12/K0) lets
          // computeVATRegister() categorise the input VAT correctly.
          ...(bookInputVat && inputVatAccount
            ? [{
                companyId,
                accountId: inputVatAccount.id,
                debit: inputVatDebit,
                credit: inputVatCredit,
                description: isCreditNote
                  ? `Indgående moms (kreditnota): ${existing.supplierName} — ${existing.invoiceNumber}`
                  : `Indgående moms: ${existing.supplierName} — ${existing.invoiceNumber}`,
                vatCode: inputVatCode,
              }]
            : []),
          // Payables line — Credit (gross) for invoices, Debit (gross) for credit notes
          {
            companyId,
            accountId: payablesAccount.id,
            debit: payablesDebit,
            credit: payablesCredit,
            description: payablesLineDesc,
          },
        ];

        // Create JournalEntry (2 lines for zero-VAT/legacy, 3 lines when booking input VAT)
        const journalEntry = await db.$transaction(async (tx) => {
          const je = await tx.journalEntry.create({
            data: {
              date: issueDate,
              description,
              reference: existing.invoiceNumber,
              status: JournalEntryStatus.POSTED,
              userId: ctx.id,
              companyId,
              lines: {
                create: journalLineInputs,
              },
            },
            include: {
              lines: {
                include: {
                  account: true,
                },
              },
            },
          });

          // Assign voucher number for POSTED journal entry
          await assignVoucherNumberIfPosted(tx, je.id, companyId, 'POSTED');
          // Seal the hash chain (Bogføringsloven §10-12). Mirrors the manual
          // JE flow at /api/journal-entries (line ~215).
          await sealJournalEntry(tx, je.id, companyId);

          return je;
        });

        // Update the received invoice
        const updated = await db.receivedInvoice.update({
          where: { id },
          data: {
            status: 'POSTED',
            postedBy: ctx.id,
            postedAt: new Date(),
            journalEntryId: journalEntry.id,
          },
        });

        // Generate InvoiceResponse XML for Peppol invoices
        let invoiceResponseXml: string | null = null;
        if (existing.format === 'PEPPOL_BIS') {
          const lineItems = existing.lineItems as Array<{ id?: string; description?: string }>;
          invoiceResponseXml = generateInvoiceResponse({
            invoiceId: existing.invoiceNumber,
            responseCode: 'OK',
            lineResponses: lineItems.map((li) => ({
              lineId: li.id || String(lineItems.indexOf(li) + 1),
              code: 'OK' as const,
              description: `Posted to journal: ${expenseAccount.name}`,
            })),
          });
          await db.receivedInvoice.update({
            where: { id },
            data: { responseXml: invoiceResponseXml, responseType: 'INVOICE_RESPONSE' },
          });
        }

        // Audit log — journal entry creation
        await auditCreate(
          ctx.id,
          'JournalEntry' as never,
          journalEntry.id,
          {
            date: issueDate.toISOString(),
            description,
            reference: existing.invoiceNumber,
            status: 'POSTED',
            lineCount: journalLineInputs.length,
            totalDebit: journalLineInputs.reduce((s, l) => s + l.debit, 0),
            totalCredit: journalLineInputs.reduce((s, l) => s + l.credit, 0),
            source: 'e-invoice-post',
            receivedInvoiceId: id,
          },
          requestMetadata(request),
          companyId
        );

        // Audit log — invoice status update
        await auditUpdate(
          ctx.id,
          'ReceivedInvoice' as never,
          id,
          { status: existing.status },
          { status: 'POSTED', journalEntryId: journalEntry.id, postedBy: ctx.id },
          { action: 'post', journalEntryId: journalEntry.id },
          companyId
        );

        // Bump ALL dashboard-relevant scopes so the dashboard auto-refreshes
        // after posting (the JE affects income-statement, balance-sheet,
        // VAT register, ledger, cash-flow, journal-entries, + the received-
        // invoices inbox). Mirrors the multi-scope bump in
        // /api/journal-entries (line ~233-239). Without this, the dashboard
        // stays stale until a manual page reload — the "hole in the single
        // source of truth" the user observed.
        notifyDataChanges([
          { scope: 'received-invoices', companyId, action: 'update' },
          // 'invoices' scope: the Salg & Faktura page now shows posted
          // received e-invoices in a dedicated tab — bump so it auto-refreshes
          // when an e-invoice is posted (the posted item leaves the e-inbox
          // and appears on the invoice list).
          { scope: 'invoices', companyId, action: 'update' },
          { scope: 'dashboard', companyId, action: 'update' },
          { scope: 'journal-entries', companyId, action: 'create' },
          { scope: 'ledger', companyId, action: 'update' },
          { scope: 'cash-flow', companyId, action: 'update' },
          { scope: 'reports', companyId, action: 'update' },
          { scope: 'vat-report', companyId, action: 'update' },
        ]).catch(() => {});

        return NextResponse.json({
          receivedInvoice: updated,
          journalEntry,
        });
      }

      // Unreachable: action is validated above, but TypeScript needs this
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
      logger.error('Update received invoice error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

// ─── DELETE /api/invoices/received/[id] ──────────────────────────

export const DELETE = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_DELETE] },
  async (request, ctx, context) => {
    try {
      const { id } = await context.params as { id: string };
      const companyId = ctx.activeCompanyId!;

      const existing = await db.receivedInvoice.findFirst({
        where: { id, ...tenantFilter(ctx) },
      });

      if (!existing) {
        return NextResponse.json({ error: 'Received invoice not found' }, { status: 404 });
      }

      // If RECEIVED, hard delete. Otherwise, soft-delete (set REJECTED + reason)
      if (existing.status === 'RECEIVED') {
        await db.receivedInvoice.delete({ where: { id } });

        await auditDeleteAttempt(
          ctx.id,
          'ReceivedInvoice' as never,
          id,
          { action: 'hard_delete' },
          companyId
        );

        notifyDataChange({ scope: 'received-invoices', companyId, action: 'delete' }).catch(() => {});

        return NextResponse.json({ message: 'Received invoice deleted' });
      } else {
        // Soft delete: set status to REJECTED with reason "Slettet"
        const updated = await db.receivedInvoice.update({
          where: { id },
          data: {
            status: 'REJECTED',
            rejectionReason: 'Slettet',
          },
        });

        await auditCancel(
          ctx.id,
          'ReceivedInvoice' as never,
          id,
          'Slettet',
          { action: 'soft_delete', previousStatus: existing.status },
          companyId
        );

        notifyDataChange({ scope: 'received-invoices', companyId, action: 'delete' }).catch(() => {});

        return NextResponse.json({ receivedInvoice: updated });
      }
    } catch (error) {
      logger.error('Delete received invoice error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
