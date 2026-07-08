import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditCreate, auditCancel, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { tenantFilter, Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { ensureInitialBackup } from '@/lib/backup-scheduler';
import { notifyDataChanges } from '@/lib/notify-data-change';

// GET /api/invoices - List all non-cancelled invoices
export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  async (request, ctx) => {
    try {
      const invoices = await db.invoice.findMany({
        // Include cancelled invoices so the UI can show them struck-through
        // + grayed-out. Danish bookkeeping law requires cancelled entries to
        // be preserved (not deleted), and showing them crossed-out gives the
        // user a clear audit trail.
        where: { ...tenantFilter(ctx) },
        orderBy: { createdAt: 'desc' },
        include: {
          // Include the project relation so the UI can gray-out invoices
          // that don't belong to the active project when in project mode.
          project: { select: { id: true, name: true, color: true, code: true } },
        },
      });

      return NextResponse.json({ invoices });
    } catch (error) {
      logger.error('Failed to fetch invoices:', error);
      return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
    }
  }
);

// POST /api/invoices - Create a new invoice
export const POST = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_CREATE] },
  async (request, ctx) => {
    try {
      const body = await request.json();
      const {
        customerName,
        customerAddress,
        customerEmail,
        customerPhone,
        customerCvr,
        issueDate,
        dueDate,
        lineItems,
        notes,
        status,
        projectId,
        documentType,
        originalInvoiceId,
      } = body;

      // documentType defaults to INVOICE (regular sale). When 'CREDIT_NOTE',
      // the document is a credit note — it gets its own numbering series
      // (creditNotePrefix) and mirrored bookkeeping on status transitions.
      const isCreditNote = documentType === 'CREDIT_NOTE';
      const resolvedDocumentType = isCreditNote ? 'CREDIT_NOTE' : 'INVOICE';

      if (!customerName || !issueDate || !dueDate || !lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }

      for (const item of lineItems) {
        if (!item.description || !item.quantity || !item.unitPrice || item.vatPercent === undefined) {
          return NextResponse.json({ error: 'Invalid line item data' }, { status: 400 });
        }
      }

      // If a credit note references an original invoice, verify it belongs to
      // the same tenant and is not itself a credit note (you cannot credit a
      // credit note). A missing/blank originalInvoiceId means a freestanding
      // credit note (refunds/goodwill without a specific original).
      let resolvedOriginalInvoiceId: string | null = null;
      if (isCreditNote && originalInvoiceId) {
        const original = await db.invoice.findFirst({
          where: { id: originalInvoiceId, ...tenantFilter(ctx), documentType: 'INVOICE' },
          select: { id: true },
        });
        if (!original) {
          return NextResponse.json({ error: 'Original invoice not found or is not a valid invoice to credit' }, { status: 400 });
        }
        resolvedOriginalInvoiceId = original.id;
      }

      const subtotal = lineItems.reduce((sum: number, item: { quantity: number; unitPrice: number }) => {
        return sum + (Number(item.quantity) * Number(item.unitPrice));
      }, 0);

      const vatTotal = lineItems.reduce((sum: number, item: { quantity: number; unitPrice: number; vatPercent: number }) => {
        return sum + ((Number(item.quantity) * Number(item.unitPrice) * Number(item.vatPercent)) / 100);
      }, 0);

      const total = subtotal + vatTotal;

        const companyInfo = ctx.activeCompanyId
        ? await db.company.findUnique({
            where: { id: ctx.activeCompanyId },
            select: {
              id: true, name: true, cvrNumber: true, address: true, phone: true,
              email: true, invoicePrefix: true, nextInvoiceSequence: true, currentYear: true,
              creditNotePrefix: true, nextCreditNoteSequence: true,
              bankName: true, bankAccount: true, bankRegistration: true,
            },
          })
        : null;
      if (!companyInfo) {
        return NextResponse.json({ error: 'Company info not set up. Please set up company information first.' }, { status: 400 });
      }

      const currentYear = new Date().getFullYear();
      const yearRolled = companyInfo.currentYear !== currentYear;

      // ── Document numbering ──
      // Invoices use invoicePrefix + nextInvoiceSequence (e.g. INV-2026-0001).
      // Credit notes use creditNotePrefix + nextCreditNoteSequence (e.g.
      // KRE-2026-0001). Both sequences reset to 1 on a new calendar year.
      // The chosen number must be unique within the company; the separate
      // prefix guarantees no collision between invoices and credit notes.
      const nextSeq = yearRolled
        ? 1
        : (isCreditNote ? companyInfo.nextCreditNoteSequence : companyInfo.nextInvoiceSequence);
      const invoiceNumber = isCreditNote
        ? `${companyInfo.creditNotePrefix}-${currentYear}-${String(nextSeq).padStart(4, '0')}`
        : `${companyInfo.invoicePrefix}-${currentYear}-${String(nextSeq).padStart(4, '0')}`;

      const invoice = await db.$transaction(async (tx) => {
        const newInvoice = await tx.invoice.create({
          data: {
            invoiceNumber,
            documentType: resolvedDocumentType,
            originalInvoiceId: resolvedOriginalInvoiceId,
            customerName,
            customerAddress: customerAddress || null,
            customerEmail: customerEmail || null,
            customerPhone: customerPhone || null,
            customerCvr: customerCvr || null,
            issueDate: new Date(issueDate),
            dueDate: new Date(dueDate),
            lineItems,
            subtotal,
            vatTotal,
            total,
            status: 'DRAFT', // Always create as DRAFT; use PUT to change status
            notes: notes || null,
            projectId: projectId || null,
            userId: ctx.id,
            companyId: ctx.activeCompanyId!,
          },
        });

        // Bump the correct sequence (invoice vs credit-note) + sync currentYear.
        await tx.company.update({
          where: { id: companyInfo.id },
          data: isCreditNote
            ? { nextCreditNoteSequence: nextSeq + 1, currentYear }
            : { nextInvoiceSequence: nextSeq + 1, currentYear },
        });

        return newInvoice;
      });

      // Audit log
      await auditCreate(
        ctx.id,
        'Invoice',
        invoice.id,
        { invoiceNumber, customerName, total, status: status || 'DRAFT', documentType: resolvedDocumentType, originalInvoiceId: resolvedOriginalInvoiceId },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      // Trigger initial backup on first tenant data input
      ensureInitialBackup(ctx.activeCompanyId!, ctx.id);

      notifyDataChanges([
        { scope: 'invoices', companyId: ctx.activeCompanyId!, action: 'create' },
        { scope: 'dashboard', companyId: ctx.activeCompanyId!, action: 'update' },
      ]).catch(() => {});

      return NextResponse.json({ invoice }, { status: 201 });
    } catch (error) {
      logger.error('Failed to create invoice:', error);
      return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 });
    }
  }
);

// DELETE /api/invoices?id=xxx - Soft-delete (cancel) an invoice
export const DELETE = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_DELETE] },
  async (request, ctx) => {
    try {
      const { searchParams } = new URL(request.url);
      const id = searchParams.get('id');
      const reason = searchParams.get('reason') || 'SYSTEM:USER_REQUESTED';

      if (!id) {
        return NextResponse.json({ error: 'Invoice ID required' }, { status: 400 });
      }

      const invoice = await db.invoice.findFirst({
        where: { id, ...tenantFilter(ctx), cancelled: false },
      });

      if (!invoice) {
        return NextResponse.json({ error: 'Invoice not found or already cancelled' }, { status: 404 });
      }

      // Soft-delete: mark as cancelled
      await db.invoice.update({
        where: { id },
        data: {
          cancelled: true,
          cancelReason: reason,
          status: 'CANCELLED',
        },
      });

      // ── Create a reversal journal entry (modpostering) ──
      // Per bogføringsloven §10-12, cancelling an invoice must be done by
      // creating a counter-entry (modpostering) that neutralises the original —
      // NOT by hiding/deleting the original. Both entries stay POSTED + visible
      // in the journal; together they net to zero in all accounting figures.
      //
      // The original journal entry (reference = invoiceNumber) stays POSTED +
      // not cancelled. We create a NEW journal entry with the same lines but
      // debit/credit swapped, reference `REVERSAL-<invoiceNumber>`.
      const originalJournalEntries = await db.journalEntry.findMany({
        where: {
          reference: invoice.invoiceNumber,
          ...tenantFilter(ctx),
          cancelled: false,
        },
        include: {
          lines: true,
        },
      });

      for (const originalJE of originalJournalEntries) {
        const reversalJE = await db.journalEntry.create({
          data: {
            date: new Date(),
            description: `Annullering – ${originalJE.description}`,
            reference: `REVERSAL-${originalJE.reference || invoice.invoiceNumber}`,
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
          `[INVOICE CANCEL] Created reversal journal entry ${reversalJE.id} (reference: ${reversalJE.reference}) for invoice ${invoice.invoiceNumber}`
        );
      }

      // Audit log
      await auditCancel(
        ctx.id,
        'Invoice',
        id,
        reason,
        requestMetadata(request),
        ctx.activeCompanyId
      );

      notifyDataChanges([
        { scope: 'invoices', companyId: ctx.activeCompanyId!, action: 'delete' },
        { scope: 'dashboard', companyId: ctx.activeCompanyId!, action: 'update' },
      ]).catch(() => {});

      return NextResponse.json({ success: true, message: 'Invoice cancelled (soft-delete)' });
    } catch (error) {
      logger.error('Failed to cancel invoice:', error);
      return NextResponse.json({ error: 'Failed to cancel invoice' }, { status: 500 });
    }
  }
);
