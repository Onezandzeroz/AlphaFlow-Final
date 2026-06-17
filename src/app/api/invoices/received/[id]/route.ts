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
import { JournalEntryStatus } from '@prisma/client';
import { assignVoucherNumberIfPosted } from '@/lib/voucher-number';
import { withGuard } from '@/lib/route-guard';
import { notifyDataChange } from '@/lib/notify-data-change';

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

        const totalAmount = Number(existing.payableAmount) || 0;
        const issueDate = existing.issueDate;

        // Build journal entry description
        const description = `E-faktura: ${existing.invoiceNumber} fra ${existing.supplierName}`;

        // Create JournalEntry with two lines
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
                create: [
                  // Debit: expense account
                  {
                    companyId,
                    accountId: expenseAccount.id,
                    debit: totalAmount,
                    credit: 0,
                    description: `E-faktura ${existing.invoiceNumber} — ${existing.supplierName}`,
                  },
                  // Credit: payables account
                  {
                    companyId,
                    accountId: payablesAccount.id,
                    debit: 0,
                    credit: totalAmount,
                    description: `Leverandørgæld: ${existing.supplierName} — ${existing.invoiceNumber}`,
                  },
                ],
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
            lineCount: 2,
            totalDebit: totalAmount,
            totalCredit: totalAmount,
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

        notifyDataChange({ scope: 'received-invoices', companyId, action: 'update' }).catch(() => {});

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
