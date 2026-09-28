import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { sproomClient } from '@/lib/sproom-client';

/**
 * DevMode CVR-verification bypass for Sproom staging sandbox.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────
 * The Sproom create-child-company route (src/app/api/sproom/
 * create-child-company/route.ts) gates on `company.cvrVerifiedAt`
 * to enforce KYC. In DevMode, a developer may want to test the
 * Sproom staging sandbox (https://staging.sproom.net) without
 * having a real Danish CVR number to verify against the official
 * CVR register. This route lets them flip `cvrVerifiedAt` on/off
 * for the active tenant so the gate passes.
 *
 * ── WHEN IT'S ALLOWED ─────────────────────────────────────────────
 * The ONLY gate is the Sproom environment:
 *   sproomClient.environment ∈ {'staging', 'custom', 'simulation'}.
 *
 * We do NOT check NODE_ENV. The reason: a user may run a production
 * Next.js build (NODE_ENV='production') but still point Sproom at
 * the staging sandbox for testing — e.g. a clean production
 * deployment with only test tenants, where they want to exercise
 * the Sproom sandbox end-to-end without touching real CVR data.
 * NODE_ENV is the wrong signal for this; Sproom's actual
 * baseUrl is the right signal.
 *
 * The real production guard is sproomClient.environment === 'production':
 * if Sproom is pointed at sproom.net (real MitID, real NemHandel),
 * the bypass is always refused, regardless of how the Next.js app
 * is built. This makes the feature safe to ship — it's inert against
 * real Sproom production.
 *
 * ── WHAT IT DOES ──────────────────────────────────────────────────
 * POST   → set company.cvrVerifiedAt = new Date()  (gate now passes)
 * DELETE → set company.cvrVerifiedAt = null         (gate re-armed)
 *
 * Both operations write an audit-log entry so there's a record.
 *
 * ── LIMITATIONS ──────────────────────────────────────────────────
 * - Only affects the active tenant (ctx.activeCompanyId)
 * - Doesn't touch `cvrNumber` itself — only the verification flag
 * - If the tenant has a *real* verified CVR and toggles bypass OFF,
 *   they'll lose the real verification and must re-verify. This is
 *   intentional — this route is for dev/test only.
 */

// Hard gate: refuse only when Sproom is pointed at production.
// Returns null if allowed, or a 403 NextResponse if refused.
function refuseIfDisallowed(): NextResponse | null {
  const sproomEnv = sproomClient.environment;
  if (sproomEnv === 'production') {
    return NextResponse.json(
      {
        error:
          'DevMode CVR bypass is not allowed when Sproom is pointed at production (sproom.net). Point SPROOM_API_URL at https://staging.sproom.net or remove SPROOM_API_TOKEN to use simulation mode.',
        code: 'DEV_BYPASS_NOT_ALLOWED_FOR_SPROOM_PRODUCTION',
        sproomEnvironment: sproomEnv,
      },
      { status: 403 }
    );
  }
  return null;
}

// ─── POST: Enable bypass (set cvrVerifiedAt = now) ─────────────────

export const POST = withGuard(
  {
    auth: true,
    requireCompany: true,
    permissions: [Permission.DATA_EDIT],
  },
  async (request, ctx) => {
    // Production guard
    const prod = refuseIfDisallowed();
    if (prod) return prod;

    try {
      const company = await db.company.findUnique({
        where: { id: ctx.activeCompanyId! },
        select: { id: true, cvrNumber: true, cvrVerifiedAt: true },
      });

      if (!company) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 });
      }

      // Idempotent: if already verified (real or via bypass), just return.
      if (company.cvrVerifiedAt) {
        return NextResponse.json({
          ok: true,
          already: true,
          cvrVerifiedAt: company.cvrVerifiedAt.toISOString(),
          message: 'CVR is already verified — no change needed.',
        });
      }

      // Set the flag
      const now = new Date();
      await db.company.update({
        where: { id: ctx.activeCompanyId! },
        data: { cvrVerifiedAt: now },
      });

      logger.info('[DEV_BYPASS_CVR] Bypass ENABLED', {
        companyId: ctx.activeCompanyId,
        userId: ctx.id,
        cvr: company.cvrNumber ?? '(none)',
      });

      await auditCreate(
        ctx.id,
        'Company',
        ctx.activeCompanyId!,
        {
          action: 'dev_cvr_bypass_enabled',
          previousCvrVerifiedAt: null,
          newCvrVerifiedAt: now.toISOString(),
          note:
            'DevMode-only bypass for Sproom staging sandbox testing. Not a real CVR verification.',
        },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      return NextResponse.json({
        ok: true,
        cvrVerifiedAt: now.toISOString(),
      });
    } catch (error) {
      logger.error('[DEV_BYPASS_CVR] Enable failed:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);

// ─── DELETE: Disable bypass (set cvrVerifiedAt = null) ─────────────

export const DELETE = withGuard(
  {
    auth: true,
    requireCompany: true,
    permissions: [Permission.DATA_EDIT],
  },
  async (request, ctx) => {
    // Production guard
    const prod = refuseIfDisallowed();
    if (prod) return prod;

    try {
      const company = await db.company.findUnique({
        where: { id: ctx.activeCompanyId! },
        select: { id: true, cvrNumber: true, cvrVerifiedAt: true },
      });

      if (!company) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 });
      }

      // Idempotent: if not verified, nothing to clear.
      if (!company.cvrVerifiedAt) {
        return NextResponse.json({
          ok: true,
          already: true,
          message: 'CVR is not currently verified — no change needed.',
        });
      }

      const previousVerifiedAt = company.cvrVerifiedAt;

      await db.company.update({
        where: { id: ctx.activeCompanyId! },
        data: { cvrVerifiedAt: null },
      });

      logger.info('[DEV_BYPASS_CVR] Bypass DISABLED', {
        companyId: ctx.activeCompanyId,
        userId: ctx.id,
        cvr: company.cvrNumber ?? '(none)',
        previousCvrVerifiedAt: previousVerifiedAt.toISOString(),
      });

      await auditCreate(
        ctx.id,
        'Company',
        ctx.activeCompanyId!,
        {
          action: 'dev_cvr_bypass_disabled',
          previousCvrVerifiedAt: previousVerifiedAt.toISOString(),
          newCvrVerifiedAt: null,
          note:
            'DevMode bypass disabled. CVR must be re-verified via the normal CVR lookup flow before Sproom child company creation.',
        },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      return NextResponse.json({ ok: true, cvrVerifiedAt: null });
    } catch (error) {
      logger.error('[DEV_BYPASS_CVR] Disable failed:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
