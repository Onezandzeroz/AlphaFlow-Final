import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { storecoveClient, StorecoveClient } from '@/lib/storecove-client';
import { logger } from '@/lib/logger';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

interface ParticipantLookupBody {
  scheme?: string;
  identifier: string;
  countryCode?: string;
}

// POST /api/storecove/participants — Look up a Peppol participant
export const POST = withGuard(
  {
    auth: true,
    requireCompany: true,
    permissions: [Permission.DATA_READ],
  },
  async (request, ctx) => {
    try {
      // Rate limit: 20 lookups per minute per IP
      const clientIp = getClientIp(request);
      const rl = rateLimit(`storecove-participants:${clientIp}`, {
        maxRequests: 20,
        windowMs: 60 * 1000,
        message: 'Too many participant lookup requests. Please try again later.',
      });
      if (!rl.allowed) {
        return NextResponse.json(
          { error: 'Too many participant lookup requests. Please try again later.', retryAfter: rl.resetAt },
          { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
        );
      }

      const body = await request.json();
      const { scheme, identifier, countryCode } = body as ParticipantLookupBody;

      if (!identifier || typeof identifier !== 'string' || identifier.trim().length === 0) {
        return NextResponse.json(
          { error: 'Identifier is required' },
          { status: 400 }
        );
      }

      // Default country code to DK if not provided
      const resolvedCountryCode = countryCode?.trim()?.toUpperCase() || 'DK';

      // Derive scheme from country code if not provided
      const resolvedScheme = scheme?.trim() || StorecoveClient.getSchemeForCountry(resolvedCountryCode);

      // ── Sandbox test-receiver override ──────────────────────────
      // If STORECOVE_TEST_RECEIVER_SCHEME/IDENTIFIER env vars are set
      // (sandbox mode), the pre-flight check always reports the test
      // receiver as reachable. This prevents the "recipient cannot
      // receive e-invoices" warning when the real 0184:<CVR> isn't on
      // the Peppol test network but the DK:DIGST test identifier is.
      const testReceiverScheme = process.env.STORECOVE_TEST_RECEIVER_SCHEME;
      const testReceiverIdentifier = process.env.STORECOVE_TEST_RECEIVER_IDENTIFIER;

      if (testReceiverScheme && testReceiverIdentifier) {
        logger.info('[STORECOVE_PARTICIPANTS] Sandbox test-receiver override active', {
          originalScheme: resolvedScheme,
          originalIdentifier: identifier.trim(),
          overrideScheme: testReceiverScheme,
          overrideIdentifier: testReceiverIdentifier,
        });
        return NextResponse.json({
          exists: true,
          scheme: testReceiverScheme,
          identifier: testReceiverIdentifier,
          name: 'Storecove Test Receiver (DK:DIGST)',
          countryCode: 'DK',
          accessPoints: [],
          testOverride: true,
        });
      }

      const result = await storecoveClient.lookupParticipant(resolvedScheme, identifier.trim());

      logger.info('[STORECOVE_PARTICIPANTS] Participant lookup', {
        companyId: ctx.activeCompanyId,
        userId: ctx.id,
        scheme: resolvedScheme,
        identifier: identifier.trim(),
        exists: result.exists,
      });

      return NextResponse.json({
        exists: result.exists,
        scheme: result.scheme,
        identifier: result.identifier,
        name: result.name,
        countryCode: result.countryCode,
        accessPoints: result.accessPoints,
      });
    } catch (error) {
      logger.error('[STORECOVE_PARTICIPANTS] Participant lookup failed:', error);
      const message = error instanceof Error ? error.message : 'Participant lookup failed';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
);
