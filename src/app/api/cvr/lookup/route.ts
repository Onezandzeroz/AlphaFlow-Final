/**
 * GET /api/cvr/lookup?cvr=XXXXXXXX
 *
 * Verifies that a Danish CVR number exists in the official CVR register
 * (Erhvervsstyrelsen / VIRK) and returns company metadata for auto-fill.
 *
 * Requires authentication + an active company (follows the same guard
 * pattern as /api/storecove/participants). Rate-limited to 20 lookups
 * per minute per IP to protect the CVR API quota.
 *
 * Response (200):
 *   { exists: boolean, cvrNumber: string, name?: string, status?: string,
 *     address?: string, postalCode?: string, city?: string, country?: string,
 *     simulated?: boolean }
 *
 * Response (400): { error: 'Invalid CVR number (8 digits required)' }
 * Response (429): { error: 'Too many CVR lookup requests...', retryAfter }
 * Response (500): { error: 'CVR lookup failed' }
 * Response (503): { error: 'CVR lookup service is in simulation mode...' }
 */

import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { cvrClient } from '@/lib/cvr-client';
import { logger } from '@/lib/logger';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { db } from '@/lib/db';

// GET /api/cvr/lookup — Verify a CVR number against the CVR register
export const GET = withGuard(
  {
    auth: true,
    requireCompany: true,
    permissions: [Permission.DATA_READ],
  },
  async (request, ctx) => {
    try {
      // Rate limit: 20 lookups per minute per IP (matches storecove participants)
      const clientIp = getClientIp(request);
      const rl = rateLimit(`cvr-lookup:${clientIp}`, {
        maxRequests: 20,
        windowMs: 60 * 1000,
        message: 'Too many CVR lookup requests. Please try again later.',
      });
      if (!rl.allowed) {
        return NextResponse.json(
          { error: 'Too many CVR lookup requests. Please try again later.', retryAfter: rl.resetAt },
          {
            status: 429,
            headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
          }
        );
      }

      // Parse + validate CVR
      const cvrParam = new URL(request.url).searchParams.get('cvr') ?? '';
      const cvrDigits = cvrParam.toUpperCase().replace(/^DK/, '').replace(/\D/g, '');
      if (cvrDigits.length !== 8) {
        return NextResponse.json(
          { error: 'Invalid CVR number (8 digits required)' },
          { status: 400 }
        );
      }

      const result = await cvrClient.lookup(cvrDigits);

      logger.info('[CVR_LOOKUP] CVR lookup', {
        companyId: ctx.activeCompanyId,
        userId: ctx.id,
        cvr: cvrDigits,
        exists: result.exists,
        simulated: result.simulated ?? false,
      });

      // In simulation mode, surface a clear flag so the UI can show a badge
      // without blocking the flow (useful for demo/dev environments).

      // ─── Cross-tenant CVR uniqueness gate ────────────────────────
      //
      // A CVR number identifies a single legal entity. Two tenants must
      // NEVER be able to verify the same CVR — otherwise both could send
      // e-invoices under the same Peppol identifier (0184:<CVR>), which
      // is illegal and would cause Storecove "Peppol identifier already
      // exists" errors at best, and duplicate-delivery confusion at worst.
      //
      // Before stamping cvrVerifiedAt, check that no OTHER company has
      // already verified this CVR. The active company is allowed to
      // re-verify its own CVR (idempotent).
      if (result.exists && ctx.activeCompanyId) {
        const claimant = await db.company.findFirst({
          where: {
            cvrNumber: cvrDigits,
            cvrVerifiedAt: { not: null },
            id: { not: ctx.activeCompanyId },
          },
          select: { id: true, name: true },
        });

        if (claimant) {
          logger.warn('[CVR_LOOKUP] CVR already verified by another tenant', {
            cvr: cvrDigits,
            attemptCompanyId: ctx.activeCompanyId,
            claimantCompanyId: claimant.id,
            claimantName: claimant.name,
            userId: ctx.id,
          });
          return NextResponse.json(
            {
              exists: false,
              cvrNumber: cvrDigits,
              error: 'Dette CVR-nummer er allerede verificeret af en anden virksomhed på AlphaFlow.',
              code: 'CVR_ALREADY_CLAIMED',
            },
            { status: 409 }
          );
        }

        // Persist verification timestamp on the company when the CVR exists
        try {
          await db.$executeRaw`UPDATE "Company" SET "cvrVerifiedAt" = NOW(), "cvrNumber" = ${cvrDigits} WHERE id = ${ctx.activeCompanyId}`;
        } catch (dbErr) {
          logger.warn('[CVR_LOOKUP] Could not persist cvrVerifiedAt', dbErr);
        }
      }

      return NextResponse.json(result);
    } catch (error) {
      logger.error('[CVR_LOOKUP] Lookup failed:', error);
      const message = error instanceof Error ? error.message : 'CVR lookup failed';

      // Distinguish auth/config errors (503 — service unavailable) from
      // transient/network errors (502 — bad gateway upstream).
      const isConfigError =
        message.includes('authentication failed') || message.includes('credentials');
      const status = isConfigError ? 503 : 502;
      return NextResponse.json({ error: message }, { status });
    }
  }
);
