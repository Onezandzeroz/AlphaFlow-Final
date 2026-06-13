import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { StorecoveClient } from '@/lib/storecove-client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

// POST /api/storecove/connect — Connect/test Storecove API key and save configuration
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

      const body = await request.json();
      const { apiKey, legalEntityId } = body as { apiKey?: string; legalEntityId?: number };

      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        return NextResponse.json(
          { error: 'API key is required' },
          { status: 400 }
        );
      }

      // Create a new client with the provided API key to test the connection
      const testClient = new StorecoveClient({
        apiKey: apiKey.trim(),
        simulationMode: false,
      });

      const result = await testClient.testConnection();

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

      // Store only the last 4 characters of the API key for identification
      const apiKeyId = `****${apiKey.trim().slice(-4)}`;

      // Update the Company record with Storecove configuration
      await db.company.update({
        where: { id: ctx.activeCompanyId! },
        data: {
          storecoveConnected: true,
          storecoveApiKeyId: apiKeyId,
          storecoveLegalEntityId: legalEntityId ?? null,
          storecoveConnectedAt: new Date(),
          storecoveLastTestedAt: new Date(),
        },
      });

      // Audit trail for Storecove connection
      await auditCreate(
        ctx.id,
        'Company',
        ctx.activeCompanyId!,
        {
          action: 'storecove_connect',
          storecoveApiKeyId: apiKeyId,
          legalEntityId: legalEntityId ?? null,
          legalEntitiesCount: result.legalEntitiesCount,
        },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      logger.info('[STORECOVE_CONNECT] Storecove connected successfully', {
        companyId: ctx.activeCompanyId,
        userId: ctx.id,
        apiKeyId,
        legalEntitiesCount: result.legalEntitiesCount,
      });

      return NextResponse.json({
        connected: true,
        legalEntitiesCount: result.legalEntitiesCount ?? 0,
      });
    } catch (error) {
      logger.error('[STORECOVE_CONNECT] Failed to connect Storecove:', error);
      const message = error instanceof Error ? error.message : 'Failed to connect Storecove';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
);

// PUT /api/storecove/connect — Disconnect Storecove
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
      // Update the Company record to disconnect Storecove
      await db.company.update({
        where: { id: ctx.activeCompanyId! },
        data: {
          storecoveConnected: false,
          storecoveApiKeyId: null,
          storecoveLegalEntityId: null,
        },
      });

      // Audit trail for Storecove disconnection
      await auditCreate(
        ctx.id,
        'Company',
        ctx.activeCompanyId!,
        { action: 'storecove_disconnect' },
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
