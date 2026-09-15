import { NextResponse } from 'next/server';
import { sproomClient } from '@/lib/sproom-client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

/**
 * POST /api/sproom/register-webhook
 *
 * Registers Sproom webhooks for the active company's child company,
 * pointing to {APP_URL}/api/sproom/webhook:
 *   - DocumentReceived   → inbound e-invoices delivered to AlphaFlow's inbox
 *   - DocumentStatusChanged → outbound delivery status updates (EInvoiceSending)
 *
 * Idempotent: lists existing webhooks + only creates the missing types, so
 * it's safe to call repeatedly.
 *
 * Sproom fires DocumentReceived when a child company receives a document.
 * Without this webhook registered, Sproom has nowhere to notify AlphaFlow,
 * so received e-invoices never appear in the inbox — even though Sproom's
 * dashboard shows them as received.
 *
 * The create-child-company route auto-registers these for NEW child
 * companies; this route backfills EXISTING child companies created before
 * the auto-registration was added.
 */
export const POST = withGuard(
  {
    auth: true,
    requireCompany: true,
    blockOversight: true,
    blockDemo: true,
    requireTokenPay: true,
    permissions: [Permission.DATA_EDIT],
  },
  async (request, ctx) => {
    try {
      const company = await db.company.findUnique({
        where: { id: ctx.activeCompanyId! },
        select: { id: true, cvrNumber: true, sproomChildCompanyId: true },
      });

      if (!company) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 });
      }
      if (!company.sproomChildCompanyId) {
        return NextResponse.json(
          { error: 'Ingen Sproom child company — opret en først.', code: 'NOT_CONNECTED' },
          { status: 400 }
        );
      }
      if (!sproomClient.isConfigured) {
        return NextResponse.json(
          {
            error: 'Sproom er ikke konfigureret. Sæt SPROOM_API_TOKEN i .env.',
            code: 'PLATFORM_NOT_CONFIGURED',
          },
          { status: 503 }
        );
      }

      const childCompanyId = company.sproomChildCompanyId;
      const appUrl = (process.env.APP_URL || 'https://alphaflow.dk').replace(/\/$/, '');
      const webhookUrl = `${appUrl}/api/sproom/webhook`;

      // Idempotency: list existing webhooks + only create the missing types.
      let existingWebhooks: { type?: string }[] = [];
      try {
        existingWebhooks = await sproomClient.listWebhooks({ childCompanyId });
      } catch (err) {
        // Non-fatal: proceed to attempt creation even if listing failed
        // (the webhooks may not exist + creation will succeed).
        logger.warn('[SPROOM_WEBHOOK_REGISTER] listWebhooks failed (will attempt create anyway)', {
          childCompanyId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      const existingTypes = new Set(existingWebhooks.map((w) => w.type).filter(Boolean) as string[]);

      const desiredTypes = ['DocumentReceived', 'DocumentStatusChanged'] as const;
      const registered: string[] = [];
      const errors: string[] = [];

      for (const type of desiredTypes) {
        if (existingTypes.has(type)) continue;
        try {
          await sproomClient.createWebhook(type, webhookUrl, { childCompanyId });
          registered.push(type);
          logger.info('[SPROOM_WEBHOOK_REGISTER] Created webhook', {
            childCompanyId,
            type,
            webhookUrl,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${type}: ${msg}`);
          logger.error('[SPROOM_WEBHOOK_REGISTER] Failed to create webhook', {
            childCompanyId,
            type,
            error: msg,
          });
        }
      }

      await auditCreate(
        ctx.id,
        'Company',
        ctx.activeCompanyId!,
        {
          action: 'sproom_webhooks_registered',
          childCompanyId,
          webhookUrl,
          registered,
          alreadyExisted: [...existingTypes],
          errors,
        },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      return NextResponse.json({
        success: true,
        webhookUrl,
        registered,
        alreadyExisted: [...existingTypes],
        ...(errors.length > 0 && { errors }),
      });
    } catch (error) {
      logger.error('[SPROOM_WEBHOOK_REGISTER] Failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to register Sproom webhooks';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
);
