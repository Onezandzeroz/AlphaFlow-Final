import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { queueEInvoiceSend } from '@/lib/einvoice-sender';
import { EInvoiceSendChannel } from '@prisma/client';
import { logger } from '@/lib/logger';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { notifyDataChange } from '@/lib/notify-data-change';

const VALID_CHANNELS: string[] = [EInvoiceSendChannel.NEMHANDEL_OIOUBL, EInvoiceSendChannel.PEPPOL_BIS, EInvoiceSendChannel.STORECOVE];

// POST /api/invoices/[id]/send-einvoice — Queue an e-invoice send via OIOUBL, Peppol, or Storecove
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

      notifyDataChange({ scope: 'invoices', companyId: ctx.activeCompanyId!, action: 'update' }).catch(() => {});

      return NextResponse.json({ sending }, { status: 201 });
    } catch (error) {
      logger.error('[EINVOICE_SEND_API] Failed to queue e-invoice send:', error);
      const message = error instanceof Error ? error.message : 'Kunne ikke afsende e-faktura';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
);
