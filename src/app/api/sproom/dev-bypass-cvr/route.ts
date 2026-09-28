import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { auditLog, requestMetadata } from '@/lib/audit';
import { withGuard, SUPERDEV_ONLY } from '@/lib/route-guard';
import { sproomClient } from '@/lib/sproom-client';
import { getPlatformSettings, setCvrBypassEnabled } from '@/lib/platform-settings';

/**
 * DevMode CVR-verification bypass — platform-wide toggle.
 *
 * ── WHAT THIS DOES ─────────────────────────────────────────────────
 * SuperDev-only endpoint. Toggles a platform-wide flag that, when ON,
 * makes the Sproom child-company creation route
 * (/api/sproom/create-child-company) skip the cvrVerifiedAt gate for
 * ALL tenants on the platform — not just the active tenant.
 *
 * POST   → enable bypass (all tenants skip CVR verification)
 * DELETE → disable bypass (all tenants must verify CVR again)
 * GET    → return current state + last-changed metadata
 *
 * ── WHEN IT'S ALLOWED ───────────────────────────────────────────────
 * Two gates, both must hold:
 *
 *   1. Caller must be SuperDev — enforced by the SUPERDEV_ON_TENANT
 *      guard config. A regular tenant gets 403 before the handler runs.
 *
 *   2. Sproom must NOT be pointed at production — i.e.
 *      sproomClient.environment ∈ {'staging', 'custom', 'simulation'}.
 *      Refuses with 403 if Sproom is at sproom.net, so the bypass is
 *      inert against real Sproom prod regardless of what the file says.
 *      We do NOT check NODE_ENV — see Task 18 commit for rationale
 *      (a prod build pointed at staging is still a sandbox).
 *
 * ── WHERE THE FLAG LIVES ───────────────────────────────────────────
 * A small JSON file at <process.cwd()>/data/platform-settings.json —
 * see src/lib/platform-settings.ts. Survives server restarts, no DB
 * migration required. Concurrent writes are serialized via a mutex.
 *
 * ── AUDIT TRAIL ────────────────────────────────────────────────────
 * Every toggle writes an AuditLog entry (action: 'platform_cvr_bypass_enabled'
 * or 'platform_cvr_bypass_disabled') AND records the changer's userId +
 * timestamp in the settings file itself (cvrBypassLastChangedBy /
 * cvrBypassLastChangedAt) so the audit info is visible without a DB query.
 *
 * ── EFFECT ON /api/sproom/create-child-company ─────────────────────
 * That route reads the flag on every call via isCvrBypassEnabled().
 * When the flag is ON, it logs "[SPROOM_CREATE_CHILD] CVR gate bypassed"
 * and proceeds without checking company.cvrVerifiedAt. The tenant
 * still needs a CVR number set on their company (Sproom requires one
 * in the payload), but it doesn't need to be verified against the
 * official CVR register.
 */

// SuperDev-only AND requireCompany — SuperDev must be operating on a
// specific tenant (active company selected) to toggle the bypass.
// Without requireCompany, ctx.activeCompanyId would be null and we
// couldn't audit which tenant context the SuperDev was in when they
// flipped it (though the flag itself is global, the audit context is
// per-tenant).
const SUPERDEV_ON_TENANT = {
  ...SUPERDEV_ONLY,
  requireCompany: true,
} as const;

// Hard gate: refuse only when Sproom is pointed at production.
// Returns null if allowed, or a 403 NextResponse if refused.
function refuseIfSproomProduction(): NextResponse | null {
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

// ─── POST: Enable platform-wide bypass ─────────────────────────────

export const POST = withGuard(
  SUPERDEV_ON_TENANT,
  async (request, ctx) => {
    // Sproom environment gate
    const prod = refuseIfSproomProduction();
    if (prod) return prod;

    try {
      const before = await getPlatformSettings();
      if (before.cvrBypassEnabled) {
        // Idempotent — already on, no change needed.
        return NextResponse.json({
          ok: true,
          already: true,
          cvrBypassEnabled: true,
          message: 'Platform-wide CVR bypass is already enabled.',
        });
      }

      const after = await setCvrBypassEnabled(true, ctx.id);

      logger.info('[DEV_BYPASS_CVR] Platform-wide bypass ENABLED', {
        userId: ctx.id,
        activeCompanyId: ctx.activeCompanyId,
        previousChangedAt: before.cvrBypassLastChangedAt,
        newChangedAt: after.cvrBypassLastChangedAt,
      });

      // Audit-log the change. This is a platform-level action, so the
      // audit entry is scoped to the active company context (which
      // records which tenant the SuperDev was operating on when they
      // flipped it). The settings file ALSO records the changer's
      // userId + timestamp directly, so the audit trail survives even
      // if the AuditLog is cleared.
      await auditLog(
        ctx.id,
        'platform_cvr_bypass_enabled',
        'Company',
        ctx.activeCompanyId!,
        {
          action: 'platform_cvr_bypass_enabled',
          scope: 'platform-wide',
          note: 'SuperDev enabled platform-wide DevMode CVR bypass. All tenants can now create Sproom child companies without verifying their CVR. Only effective when Sproom is in a non-production environment.',
          previousChangedAt: before.cvrBypassLastChangedAt,
          newChangedAt: after.cvrBypassLastChangedAt,
        },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      return NextResponse.json({
        ok: true,
        cvrBypassEnabled: true,
        cvrBypassLastChangedAt: after.cvrBypassLastChangedAt,
        cvrBypassLastChangedBy: after.cvrBypassLastChangedBy,
      });
    } catch (error) {
      logger.error('[DEV_BYPASS_CVR] Enable failed:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);

// ─── DELETE: Disable platform-wide bypass ───────────────────────────

export const DELETE = withGuard(
  SUPERDEV_ON_TENANT,
  async (request, ctx) => {
    // Sproom environment gate
    const prod = refuseIfSproomProduction();
    if (prod) return prod;

    try {
      const before = await getPlatformSettings();
      if (!before.cvrBypassEnabled) {
        // Idempotent — already off, no change needed.
        return NextResponse.json({
          ok: true,
          already: true,
          cvrBypassEnabled: false,
          message: 'Platform-wide CVR bypass is already disabled.',
        });
      }

      const previousChangedAt = before.cvrBypassLastChangedAt;
      const after = await setCvrBypassEnabled(false, ctx.id);

      logger.info('[DEV_BYPASS_CVR] Platform-wide bypass DISABLED', {
        userId: ctx.id,
        activeCompanyId: ctx.activeCompanyId,
        previousChangedAt,
        newChangedAt: after.cvrBypassLastChangedAt,
      });

      await auditLog(
        ctx.id,
        'platform_cvr_bypass_disabled',
        'Company',
        ctx.activeCompanyId!,
        {
          action: 'platform_cvr_bypass_disabled',
          scope: 'platform-wide',
          note: 'SuperDev disabled platform-wide DevMode CVR bypass. All tenants must now verify their CVR via the normal CVR lookup flow before creating Sproom child companies.',
          previousChangedAt,
          newChangedAt: after.cvrBypassLastChangedAt,
        },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      return NextResponse.json({
        ok: true,
        cvrBypassEnabled: false,
        cvrBypassLastChangedAt: after.cvrBypassLastChangedAt,
        cvrBypassLastChangedBy: after.cvrBypassLastChangedBy,
      });
    } catch (error) {
      logger.error('[DEV_BYPASS_CVR] Disable failed:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);

// ─── GET: Return current platform-wide bypass state ──────────────────
//
// Read-only — used by the frontend to render the toggle's current state.
// No audit log needed (read is harmless). Still SuperDev-only so a
// regular tenant can't probe the platform-wide flag (though it doesn't
// leak much info beyond "is the platform in DevMode or not").

export const GET = withGuard(
  SUPERDEV_ON_TENANT,
  async (_request, ctx) => {
    try {
      const settings = await getPlatformSettings();
      return NextResponse.json({
        cvrBypassEnabled: settings.cvrBypassEnabled,
        cvrBypassLastChangedAt: settings.cvrBypassLastChangedAt,
        cvrBypassLastChangedBy: settings.cvrBypassLastChangedBy,
        sproomEnvironment: sproomClient.environment,
        sproomBaseUrl: sproomClient.baseUrlValue,
      });
    } catch (error) {
      logger.error('[DEV_BYPASS_CVR] GET failed:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
