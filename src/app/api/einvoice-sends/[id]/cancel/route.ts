import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditLog, requestMetadata } from '@/lib/audit';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { EInvoiceSendStatus } from '@prisma/client';

/**
 * POST /api/einvoice-sends/[id]/cancel
 *
 * Cancel a stuck/duplicate e-invoice sending that NEVER left the system.
 * Sets status to CANCELLED so it disappears from the active tracking list.
 *
 * ONLY allows cancelling PENDING, QUEUED, or SENDING — these are sends
 * that are stuck locally and never made it to Sproom (e.g. duplicates
 * created before the Task 35 duplicate-prevention fix, or sends where
 * processEInvoiceSend timed out before updating to SENT/FAILED).
 *
 * Does NOT allow cancelling:
 *   - SENT / IN_TRANSIT / DELIVERED / PENDING_APPROVAL — the document
 *     has already been delivered to the recipient. Cancelling the
 *     tracking record would be misleading (it implies the send was
 *     undone, but the recipient still has the document).
 *   - ACCEPTED / REJECTED / PAID — terminal, already final.
 *   - FAILED — can be retried via the retry button, not cancelled.
 *   - CANCELLED — already cancelled.
 */

// Only truly stuck sends (never left the local system) can be cancelled.
// Once a send reaches SENT, it's in Sproom's network and cannot be "taken back".
const CANCELLABLE_STATUSES = [
  'PENDING',
  'QUEUED',
  'SENDING',
] as EInvoiceSendStatus[];

export const POST = withGuard(
  {
    auth: true,
    requireCompany: true,
    permissions: [Permission.DATA_EDIT],
  },
  async (request, ctx) => {
    try {
      // Extract sendingId from the URL path: /api/einvoice-sends/[id]/cancel
      const url = new URL(request.url);
      const pathParts = url.pathname.split('/');
      const sendingId = pathParts[pathParts.length - 2]; // [..., 'einvoice-sends', id, 'cancel']

      if (!sendingId) {
        return NextResponse.json(
          { error: 'Missing sending ID' },
          { status: 400 }
        );
      }

      // Fetch the sending record (scoped to the active tenant)
      const sending = await db.eInvoiceSending.findFirst({
        where: { id: sendingId, companyId: ctx.activeCompanyId! },
      });

      if (!sending) {
        return NextResponse.json(
          { error: 'E-forsendelse ikke fundet.' },
          { status: 404 }
        );
      }

      // Check if it's cancellable (only stuck/duplicate sends that never left the system)
      if (!CANCELLABLE_STATUSES.includes(sending.status as EInvoiceSendStatus)) {
        return NextResponse.json(
          {
            error: `Kan ikke annullere en forsendelse med status "${sending.status}". Kun forsendelser der ikke er kommet afsted (Afventer/Sender) kan annulleres. Forsendelser der er afsendt eller leveret kan ikke trækkes tilbage — de er allerede modtaget af modtageren.`,
            code: 'NOT_CANCELLABLE',
            currentStatus: sending.status,
          },
          { status: 400 }
        );
      }

      // Cancel it
      await db.eInvoiceSending.update({
        where: { id: sendingId },
        data: {
          status: EInvoiceSendStatus.CANCELLED,
          nextRetryAt: null,
        },
      });

      logger.info('[EINVOICE_SEND] Cancelled e-invoice send (user-initiated)', {
        sendingId,
        invoiceId: sending.invoiceId,
        previousStatus: sending.status,
        companyId: ctx.activeCompanyId,
        userId: ctx.id,
      });

      // Audit trail
      await auditLog({
        action: 'CANCEL',
        entityType: 'EInvoiceSending',
        entityId: sendingId,
        userId: ctx.id,
        companyId: ctx.activeCompanyId,
        changes: {
          status: { old: sending.status, new: 'CANCELLED' },
        },
        metadata: {
          ...requestMetadata(request),
          invoiceId: sending.invoiceId,
          previousStatus: sending.status,
          reason: 'user_cancelled_via_tracking_page',
        },
      });

      return NextResponse.json({ success: true, id: sendingId, status: 'CANCELLED' });
    } catch (error) {
      logger.error('[EINVOICE_CANCEL] Failed:', error);
      return NextResponse.json(
        { error: 'Kunne ikke annullere e-forsendelse.' },
        { status: 500 }
      );
    }
  }
);
