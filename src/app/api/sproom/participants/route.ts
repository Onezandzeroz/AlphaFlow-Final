import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { sproomClient } from '@/lib/sproom-client';
import { logger } from '@/lib/logger';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

/**
 * POST /api/sproom/participants
 *
 * Looks up whether a recipient can receive e-invoices via Sproom.
 * Checks both NemHandel and Peppol networks.
 *
 * Body: { scheme?: string, identifier: string, countryCode?: string }
 * Response: { exists: boolean, scheme: string, identifier: string, ... }
 */
export const POST = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  async (request, ctx) => {
    try {
      const clientIp = getClientIp(request);
      const rl = rateLimit(`sproom-participants:${clientIp}`, {
        maxRequests: 20,
        windowMs: 60 * 1000,
        message: 'Too many participant lookup requests.',
      });
      if (!rl.allowed) {
        return NextResponse.json(
          { error: 'Too many requests. Please try again later.', retryAfter: rl.resetAt },
          { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
        );
      }

      const body = await request.json();
      const { scheme, identifier, countryCode } = body as {
        scheme?: string;
        identifier: string;
        countryCode?: string;
      };

      if (!identifier || typeof identifier !== 'string' || identifier.trim().length === 0) {
        return NextResponse.json({ error: 'Identifier is required' }, { status: 400 });
      }

      const resolvedCountryCode = countryCode?.trim()?.toUpperCase() || 'DK';
      const resolvedScheme = scheme?.trim() || (resolvedCountryCode === 'DK' ? 'DK:CVR' : '0184');

      // Build the orgId: "scheme:value" format
      const orgId = `${resolvedScheme}:${identifier.trim()}`;

      logger.info('[SPROOM_PARTICIPANTS] Lookup', {
        companyId: ctx.activeCompanyId,
        scheme: resolvedScheme,
        identifier: identifier.trim(),
      });

      // Check if Sproom is configured
      if (!sproomClient.isConfigured) {
        // Simulation mode — pretend the recipient exists
        return NextResponse.json({
          exists: true,
          scheme: resolvedScheme,
          identifier: identifier.trim(),
          countryCode: resolvedCountryCode,
          accessPoints: [],
          simulated: true,
        });
      }

      const result = await sproomClient.lookupRecipient(orgId);

      return NextResponse.json({
        exists: result.canReceive,
        scheme: resolvedScheme,
        identifier: identifier.trim(),
        countryCode: resolvedCountryCode,
        errorMessage: result.errorMessage || undefined,
      });
    } catch (error) {
      logger.error('[SPROOM_PARTICIPANTS] Lookup failed:', error);
      const message = error instanceof Error ? error.message : 'Participant lookup failed';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
);
