import { NextResponse } from 'next/server';
import { getInvoiceSendHistory, getInvoiceReceiveHistory } from '@/lib/einvoice-sender';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { Permission, tenantFilter } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

// GET /api/invoices/[id]/einvoice-sends — Get send + receive history for an invoice
//
// Returns BOTH outbound sends (EInvoiceSending records) AND inbound receives
// (ReceivedInvoice records whose invoiceNumber matches the Invoice's number).
//
// The popup component (einvoice-send-status.tsx) uses both arrays to render
// two sections: "Afsendelseshistorik" (send history) and "Modtagne e-fakturaer"
// (received e-invoices). For example, if INV-2026-0008 was sent FROM this
// tenant AND a credit note with the same number was received back, the popup
// will show BOTH directions of the e-invoice lifecycle.
//
// Response shape:
//   {
//     einvoiceSends: EInvoiceSending[],          // outbound sends (existing field — kept for backward compat)
//     receivedInvoices: ReceivedInvoiceSummary[], // inbound receives (new field)
//   }
//
// Backward compatibility: the popup currently reads `data.sends || data.records`
// when only outbound sends existed. That field is preserved as `einvoiceSends`
// (the canonical name) so existing consumers keep working. The new
// `receivedInvoices` field is added alongside.
export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  async (request, ctx, context) => {
    try {
      const { id } = await context.params as { id: string };

      // 1. Fetch the invoice first to get its invoiceNumber (needed to match
      //    inbound ReceivedInvoice records, which are keyed by invoiceNumber
      //    in the XML cbc:ID field — not by Invoice FK).
      const invoice = await db.invoice.findFirst({
        where: { id, ...tenantFilter(ctx) },
        select: { invoiceNumber: true },
      });

      // Run both queries in parallel. If the invoice doesn't exist, we still
      // return empty arrays (rather than 404) so the popup can render its
      // empty state gracefully without an error toast.
      const [einvoiceSends, receivedInvoices] = await Promise.all([
        getInvoiceSendHistory(id, ctx.activeCompanyId!),
        invoice
          ? getInvoiceReceiveHistory(invoice.invoiceNumber, ctx.activeCompanyId!)
          : Promise.resolve([]),
      ]);

      return NextResponse.json({ einvoiceSends, receivedInvoices });
    } catch (error) {
      logger.error('[EINVOICE_SENDS_API] Failed to fetch e-invoice send/receive history:', error);
      return NextResponse.json(
        { error: 'Kunne ikke hente e-faktura afsendelseshistorik' },
        { status: 500 }
      );
    }
  }
);
