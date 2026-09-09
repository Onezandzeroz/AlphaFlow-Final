import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { storecoveClient } from '@/lib/storecove-client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

/**
 * POST /api/storecove/connect — Test the platform Storecove connection
 *
 * Architecture (revised):
 *   The Storecove API key is a PLATFORM-level secret in .env
 *   (STORECOVE_API_KEY). It is NEVER entered in the UI. This endpoint
 *   simply tests that the platform key works (calls GET /legal_entities)
 *   and records that this company's Storecove connection is healthy.
 *
 *   Legal entity creation is a SEPARATE endpoint:
 *     POST /api/storecove/create-legal-entity
 *   (tenant-initiated, gated on CVR verification).
 *
 * This endpoint no longer accepts an `apiKey` in the request body.
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
      // Rate limit: 3 attempts per minute per IP
      const clientIp = getClientIp(request);
      const rl = rateLimit(`storecove-connect:${clientIp}`, {
        maxRequests: 3,
        windowMs: 60 * 1000,
        message: 'Too many Storecove connection attempts. Please try again later.',
      });
      if (!rl.allowed) {
        return NextResponse.json(
          { error: 'Too many Storecove connection attempts. Please try again later.', retryAfter: rl.resetAt },
          { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
        );
      }

      // ── Check the platform Storecove key is configured ──
      if (!storecoveClient.isConfigured) {
        return NextResponse.json(
          {
            error:
              'Storecove er ikke konfigureret på platformen. API-nøglen mangler i .env (STORECOVE_API_KEY). Kontakt platform-administratoren.',
            code: 'PLATFORM_NOT_CONFIGURED',
            connected: false,
          },
          { status: 503 }
        );
      }

      // ── Test the connection using the platform singleton key ──
      const result = await storecoveClient.testConnection();

      if (!result.connected) {
        logger.warn('[STORECOVE_CONNECT] Connection test failed', {
          companyId: ctx.activeCompanyId,
          userId: ctx.id,
          error: result.error,
        });

        return NextResponse.json(
          { error: result.error || 'Storecove connection test failed', connected: false },
          { status: 400 }
        );
      }

      // ── Record the connection state on the Company ──
      // Note: we do NOT store any API key — the key lives only in .env.
      // storecoveApiKeyId is kept for backwards compat but is now derived
      // from the env key (masked) purely for identification in the UI.
      await db.company.update({
        where: { id: ctx.activeCompanyId! },
        data: {
          storecoveConnected: true,
          storecoveLastTestedAt: new Date(),
          // Preserve storecoveLegalEntityId if already set (via create-legal-entity)
          ...(result.legalEntitiesCount !== undefined && {
            storecoveConnectedAt: new Date(),
          }),
        },
      });

      // Audit trail
      await auditCreate(
        ctx.id,
        'Company',
        ctx.activeCompanyId!,
        {
          action: 'storecove_connect_test',
          legalEntitiesCount: result.legalEntitiesCount,
          hasLegalEntityId: true, // populated below if known
        },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      logger.info('[STORECOVE_CONNECT] Storecove connection healthy', {
        companyId: ctx.activeCompanyId,
        userId: ctx.id,
        legalEntitiesCount: result.legalEntitiesCount,
      });

      return NextResponse.json({
        connected: true,
        legalEntitiesCount: result.legalEntitiesCount ?? 0,
      });
    } catch (error) {
      logger.error('[STORECOVE_CONNECT] Failed to test Storecove connection:', error);
      const message = error instanceof Error ? error.message : 'Failed to test Storecove connection';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
);

/**
 * PUT /api/storecove/connect — Disconnect Storecove
 *
 * Clears the Storecove binding for this company. Does NOT delete the
 * legal entity from Storecove (that requires a separate delete call and
 * is intentionally not done automatically — the tenant may want to
 * re-connect later with the same legal entity).
 */
export const PUT = withGuard(
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
      // Fetch current state for audit
      const company = await db.company.findUnique({
        where: { id: ctx.activeCompanyId! },
        select: { storecoveLegalEntityId: true, storecoveConnected: true },
      });

      // Update the Company record to disconnect Storecove
      await db.company.update({
        where: { id: ctx.activeCompanyId! },
        data: {
          storecoveConnected: false,
          storecoveApiKeyId: null,
          storecoveLegalEntityId: null,
          storecoveConnectedAt: null,
        },
      });

      // Audit trail for Storecove disconnection
      await auditCreate(
        ctx.id,
        'Company',
        ctx.activeCompanyId!,
        {
          action: 'storecove_disconnect',
          previousLegalEntityId: company?.storecoveLegalEntityId ?? null,
        },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      logger.info('[STORECOVE_CONNECT] Storecove disconnected', {
        companyId: ctx.activeCompanyId,
        userId: ctx.id,
      });

      return NextResponse.json({ connected: false });
    } catch (error) {
      logger.error('[STORECOVE_CONNECT] Failed to disconnect Storecove:', error);
      const message = error instanceof Error ? error.message : 'Failed to disconnect Storecove';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
);
