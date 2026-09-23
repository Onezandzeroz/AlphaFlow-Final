import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { queueEInvoiceSend, processEInvoiceSend } from '@/lib/einvoice-sender';
import { EInvoiceSendChannel } from '@prisma/client';
import { logger } from '@/lib/logger';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { notifyDataChange } from '@/lib/notify-data-change';
import { db } from '@/lib/db';
import { getEInvoiceUsage } from '@/lib/usage-quotas';

// NOTE: The Prisma `EInvoiceSendChannel` enum still includes `STORECOVE`
// for backward-compat with existing DB rows — renaming it would require
// a migration. Functionally, the `STORECOVE` channel now maps to Sproom
// (the only Access Point). Both `STORECOVE` and `PEPPOL_BIS` route
// through `sproomClient.sendDocument()` in `processEInvoiceSend()`.
const VALID_CHANNELS: string[] = [EInvoiceSendChannel.NEMHANDEL_OIOUBL, EInvoiceSendChannel.PEPPOL_BIS, EInvoiceSendChannel.STORECOVE];

// POST /api/invoices/[id]/send-einvoice — Send an e-invoice via OIOUBL, Peppol, or Sproom
//
// This route does TWO things synchronously:
//   1. queueEInvoiceSend() — creates a PENDING EInvoiceSending row
//   2. processEInvoiceSend() — generates the OIOUBL XML and submits it
//      to Sproom immediately (inline, no background worker needed)
//
// By the time the response returns, the send has been transmitted to
// Sproom and the status is either DELIVERED (success) or FAILED
// (error). Further status changes (ACCEPTED/REJECTED) arrive
// asynchronously via the Sproom webhook at /api/sproom/webhook.
//
// If processEInvoiceSend() fails, we still return the sending row
// (with status FAILED) so the UI can show the error and offer a retry.
export const POST = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_EDIT] },
  async (request, ctx, context) => {
    try {
      // Rate limit: 5 sends per minute per IP
      const clientIp = getClientIp(request);
      const rl = rateLimit(`einvoice-send:${clientIp}`, {
        maxRequests: 5,
        windowMs: 60 * 1000,
        message: 'For mange e-faktura afsendelser. Prøv igen om et minut.',
      });
      if (!rl.allowed) {
        return NextResponse.json(
          { error: 'For mange e-faktura afsendelser. Prøv igen om et minut.', retryAfter: rl.resetAt },
          { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
        );
      }

      const { id } = await context.params as { id: string };
      const body = await request.json();
      const { channel } = body as { channel?: string };

      if (!channel || !VALID_CHANNELS.includes(channel)) {
        return NextResponse.json(
          { error: `Ugyldig kanal. Gyldige værdier: ${VALID_CHANNELS.join(', ')}` },
          { status: 400 }
        );
      }

      // ── Månedlig forbrugskvote (e-faktura: afsendelser + modtagelser) ──
      // Planens grundkvote + evt. tilkøbt ekstra forbrug (oversight).
      // Blokerer nye AFSSENDELSER når grænsen er nået. Automatisk Sproom-
      // modtagelse opretter altid ReceivedInvoice (data går aldrig tabt),
      // men tæller med i forbruget her.
      const usage = await getEInvoiceUsage(ctx.activeCompanyId!);
      if (usage.remaining <= 0) {
        logger.warn('[EINVOICE_SEND_API] Monthly e-invoice quota exceeded', {
          companyId: ctx.activeCompanyId,
          used: usage.used,
          totalQuota: usage.totalQuota,
        });
        return NextResponse.json(
          {
            error:
              'Månedligt forbrug af e-faktura er nået for din plan. ' +
              'Tilkøb ekstra forbrug, der passer din virksomhed — det er nemt og hurtigt: skriv til os via kontaktsiden, og vi udvider dit forbrug.',
            code: 'EINVOICE_QUOTA_EXCEEDED',
            usage: {
              used: usage.used,
              planQuota: usage.planQuota,
              addonQuota: usage.addonQuota,
              totalQuota: usage.totalQuota,
              resetsAt: usage.resetsAt,
            },
          },
          { status: 429 }
        );
      }

      // Step 1: Queue the send (creates PENDING row)
      const sending = await queueEInvoiceSend({
        invoiceId: id,
        companyId: ctx.activeCompanyId!,
        userId: ctx.id,
        channel: channel as EInvoiceSendChannel,
      });

      logger.info(`[EINVOICE_SEND_API] Queued e-invoice send for invoice ${id}`, {
        sendingId: sending.id,
        channel,
        userId: ctx.id,
        companyId: ctx.activeCompanyId,
      });

      // Step 2: Transmit to Sproom IMMEDIATELY (inline, no worker).
      // processEInvoiceSend() generates the OIOUBL XML and submits it
      // to Sproom. On success → status DELIVERED. On failure →
      // status FAILED with errorMessage populated.
      let transmissionError: string | undefined;
      try {
        await processEInvoiceSend(sending.id);
        logger.info(`[EINVOICE_SEND_API] Transmitted to Sproom`, {
          sendingId: sending.id,
          invoiceId: id,
        });
      } catch (err) {
        transmissionError = err instanceof Error ? err.message : 'Transmission failed';
        logger.error(`[EINVOICE_SEND_API] Transmission failed (send row kept for retry)`, {
          sendingId: sending.id,
          invoiceId: id,
          error: transmissionError,
        });
        // Don't throw — we still return the sending row so the UI can
        // show the FAILED status and offer a retry button.
      }

      // Re-fetch the sending row to get the updated status (DELIVERED
      // or FAILED) after processEInvoiceSend() ran.
      const updatedSending = await db.eInvoiceSending.findUnique({
        where: { id: sending.id },
        select: {
          id: true,
          status: true,
          channel: true,
          format: true,
          recipientName: true,
          recipientCvr: true,
          recipientEndpointId: true,
          storecoveSubmissionId: true,
          errorMessage: true,
          errorCode: true,
          sentAt: true,
          deliveredAt: true,
          acceptedAt: true,
          messageId: true,
          createdAt: true,
        },
      });

      // If processEInvoiceSend() did NOT throw (Sproom returned
      // { success: false } internally → Path A), the row is FAILED with
      // an errorMessage but transmissionError is still undefined. Surface
      // the row's errorMessage so the UI toast shows the ACTUAL failure
      // reason (e.g. "childCompanyId is required", "Sproom API error: 422",
      // recipient endpoint not found, OIOUBL validation error, etc.)
      // instead of the unhelpful generic "Se afsendelseshistorik for
      // detaljer." fallback.
      if (!transmissionError && updatedSending?.status === 'FAILED' && updatedSending.errorMessage) {
        transmissionError = updatedSending.errorMessage;
      }

      notifyDataChange({ scope: 'invoices', companyId: ctx.activeCompanyId!, action: 'update' }).catch(() => {});

      // Return the updated sending row. If transmission failed, include
      // a top-level error field so the UI toast can surface it, but still
      // return 201 (the row was created) so the client gets the data.
      return NextResponse.json({
        sending: updatedSending ?? sending,
        ...(transmissionError && { error: transmissionError }),
      }, { status: 201 });
    } catch (error) {
      logger.error('[EINVOICE_SEND_API] Failed to send e-invoice:', error);
      const message = error instanceof Error ? error.message : 'Kunne ikke afsende e-faktura';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
);
