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
 * Cancel a (possibly stuck/duplicate) e-invoice sending. Sets status to
 * CANCELLED so it disappears from the active tracking list.
 *
 * Unlike cancelEInvoiceSend() in einvoice-sender.ts (which only allows
 * PENDING/QUEUED), this endpoint allows cancelling ANY non-terminal
 * sending — including SENDING, SENT, IN_TRANSIT, DELIVERED, and
 * PENDING_APPROVAL. This is necessary because:
 *
 *   1. Duplicate sends (from the pre-Task-35 era when there was no
 *      duplicate prevention) may be stuck in PENDING or SENDING state
 *      if the Sproom API call timed out without updating the status.
 *
 *   2. A sending may be stuck in SENT/IN_TRANSIT/DELIVERED/
 *      PENDING_APPROVAL if Sproom never sends a terminal webhook
 *      (ACCEPTED/REJECTED) — e.g. the recipient never opens the invoice.
 *
 *   3. The user may want to clean up the tracking list by removing
 *      stale entries that will never progress.
 *
 * Terminal statuses (ACCEPTED, REJECTED, PAID, FAILED, CANCELLED) cannot
 * be cancelled — they're already final.
 *
 * NOTE: This does NOT recall or undo the Sproom-side document — if the
 * document has already been delivered to the recipient, cancelling the
 * AlphaFlow-side tracking record only removes it from the tracking list.
 * The recipient still has the document. For a real "undo", the user
 * would need to send a credit note.
 */

// Non-terminal statuses that CAN be cancelled
const CANCELLABLE_STATUSES = [
  'PENDING',
  'QUEUED',
  'SENDING',
  'SENT',
  'IN_TRANSIT',
  'DELIVERED',
  'PENDING_APPROVAL',
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

      // Check if it's already in a terminal state
      if (!CANCELLABLE_STATUSES.includes(sending.status as EInvoiceSendStatus)) {
        return NextResponse.json(
          {
            error: `Kan ikke annullere en forsendelse med status "${sending.status}". Kun aktive (ikke-afsluttede) forsendelser kan annulleres.`,
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
