import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { tenantFilter, Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

// GET /api/einvoice-sends/[id] — Detalje-view med event-timeline
//
// Dette endpoint returnerer en enkelt EInvoiceSending med dens fulde
// event-timeline (EInvoiceSendEvent rows sorteret kronologisk). Bruges af
// timeline-komponenten i både det globale sporings-view og per-invoice popup.
//
// Response:
//   {
//     sending: EInvoiceSending (med invoice join),
//     events: EInvoiceSendEvent[]  // kronologisk (ældste først)
//   }
//
// Tenant-scope check: sending skal tilhøre ctx.activeCompanyId — hvis ikke,
// returneres 404 (ikke 403, for at undgå at lække existence af andre tenants'
// sendings).

export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  async (request, ctx, context) => {
    try {
      const { id } = await context.params as { id: string };

      // ── Fetch the sending (with tenant filter — implicit auth check) ──
      const sending = await db.eInvoiceSending.findFirst({
        where: {
          id,
          ...tenantFilter(ctx),
        },
        select: {
          id: true,
          invoiceId: true,
          channel: true,
          format: true,
          recipientName: true,
          recipientCvr: true,
          recipientEAN: true,
          recipientEndpointId: true,
          status: true,
          sproomRawStatus: true,
          sentAt: true,
          inTransitAt: true,
          deliveredAt: true,
          pendingApprovalAt: true,
          acceptedAt: true,
          rejectedAt: true,
          paidAt: true,
          errorCode: true,
          errorMessage: true,
          retryCount: true,
          maxRetries: true,
          nextRetryAt: true,
          messageId: true,
          storecoveSubmissionId: true,
          createdAt: true,
          updatedAt: true,
          sentBy: true,
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              documentType: true,
              total: true,
              currency: true,
              issueDate: true,
              dueDate: true,
              paidDate: true,
              customerName: true,
              customerCvr: true,
            },
          },
        },
      });

      if (!sending) {
        return NextResponse.json(
          { error: 'E-faktura afsendelse ikke fundet' },
          { status: 404 },
        );
      }

      // ── Fetch the event-timeline (kronologisk) ──
      const events = await db.eInvoiceSendEvent.findMany({
        where: { sendingId: id },
        orderBy: { eventTimestamp: 'asc' },
        select: {
          id: true,
          status: true,
          sproomRawState: true,
          sproomStatusCode: true,
          deliveryType: true,
          message: true,
          failedProperties: true,
          source: true,
          eventTimestamp: true,
          createdAt: true,
          metadata: true,
        },
      });

      return NextResponse.json({
        sending,
        events,
      });
    } catch (error) {
      logger.error('[EINVOICE-SENDS-DETAIL] Failed to fetch sending detail:', error);
      return NextResponse.json(
        { error: 'Kunne ikke hente afsendelsesdetaljer' },
        { status: 500 },
      );
    }
  },
);
