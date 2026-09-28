import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { auditLog, requestMetadata } from '@/lib/audit';
import { withGuard, SUPERDEV_ONLY } from '@/lib/route-guard';
import { sproomClient } from '@/lib/sproom-client';
import { getPlatformSettings, setCvrVerificationRequired } from '@/lib/platform-settings';

/**
 * SuperDev-only platform-wide CVR-verification toggle.
 *
 * ── WHAT THIS DOES ─────────────────────────────────────────────────
 * SuperDev-only endpoint. Controls a platform-wide flag that, when
 * disabled, makes the Sproom child-company creation route
 * (/api/sproom/create-child-company) skip the cvrVerifiedAt gate for
 * ALL tenants on the platform — not just the active tenant.
 *
 * POST   → re-enable CVR verification (default/safe state — all tenants
 *           must verify their CVR before creating a Sproom child company)
 * DELETE → disable CVR verification (skip the gate for all tenants —
 *           useful for testing the Sproom integration without real CVR
 *           data)
 * GET    → return current state + last-changed metadata
 *
 * ── SEMANTICS ──────────────────────────────────────────────────────
 * The flag's polarity is "verification required" (true = normal,
 * false = bypassed), so:
 *   - POST means "I want CVR verification back on" (re-arm the gate)
 *   - DELETE means "I want to skip CVR verification" (open the gate)
 *
 * This matches the convention of POST = "create/restore a requirement"
 * and DELETE = "remove a requirement" — the same convention used by
 * the rest of the Sproom API routes (e.g. POST creates a child
 * company, DELETE disconnects).
 *
 * ── SAFETY GATE: SPROOM ENVIRONMENT ─────────────────────────────────
 * DELETE (disable verification) is refused when Sproom is pointed at
 * production (sproomClient.environment === 'production'). This
 * prevents a SuperDev from accidentally disabling CVR verification
 * while the platform is connected to real NemHandel, which could let
 * tenants create Sproom child companies with fake CVR numbers against
 * the live NHR.
 *
 * POST (re-enable verification) is ALWAYS allowed — turning safety
 * back on should never be blocked.
 *
 * ── WHERE THE FLAG LIVES ───────────────────────────────────────────
 * A small JSON file at <process.cwd()>/data/platform-settings.json —
 * see src/lib/platform-settings.ts. Survives server restarts, no DB
 * migration required. Concurrent writes are serialized via a mutex.
 *
 * ── AUDIT TRAIL ────────────────────────────────────────────────────
 * Every toggle writes an AuditLog entry with action: 'OVERSIGHT' and
 * metadata.type 'platform_cvr_verification_required' /
 * 'platform_cvr_verification_disabled' (following the convention from
 * /api/oversight/notify-nemhandel). The settings file ALSO records the
 * changer's userId + timestamp directly (cvrVerificationLastChangedBy /
 * cvrVerificationLastChangedAt) so the audit info is visible without a
 * DB query.
 *
 * ── GUARD ──────────────────────────────────────────────────────────
 * SuperDev-only via SUPERDEV_ON_TENANT (SuperDev + requireCompany).
 * The requireCompany ensures ctx.activeCompanyId is set so the audit
 * entry has a tenant context (which tenant the SuperDev was operating
 * on when they flipped it). The flag itself is global, but the audit
 * context is per-tenant.
 */

// SuperDev-only AND requireCompany — SuperDev must be operating on a
// specific tenant (active company selected) to toggle the flag.
// Without requireCompany, ctx.activeCompanyId would be null and we
// couldn't audit which tenant context the SuperDev was in when they
// flipped it (though the flag itself is global, the audit context is
// per-tenant).
const SUPERDEV_ON_TENANT = {
  ...SUPERDEV_ONLY,
  requireCompany: true,
} as const;

// Safety gate: refuse DELETE (disable verification) when Sproom is
// pointed at production. POST (re-enable) is always allowed.
// Returns null if allowed, or a 403 NextResponse if refused.
function refuseIfSproomProductionForDisable(): NextResponse | null {
  const sproomEnv = sproomClient.environment;
  if (sproomEnv === 'production') {
    return NextResponse.json(
      {
        error:
          'CVR-verifikation kan ikke deaktiveres når Sproom er peget på produktion (sproom.net). Ppeg SPROOM_API_URL på https://staging.sproom.net, eller fjern SPROOM_API_TOKEN for at bruge simulation mode, og prøv igen.',
        code: 'CVR_VERIFICATION_CANNOT_DISABLE_FOR_SPROOM_PRODUCTION',
        sproomEnvironment: sproomEnv,
      },
      { status: 403 }
    );
  }
  return null;
}

// ─── POST: Re-enable CVR verification (the default/safe state) ──────
//
// Always allowed — turning safety back on should never be blocked,
// even if Sproom is in production.

export const POST = withGuard(
  SUPERDEV_ON_TENANT,
  async (request, ctx) => {
    try {
      const before = await getPlatformSettings();
      if (before.cvrVerificationRequired !== false) {
        // Idempotent — already required (the default).
        return NextResponse.json({
          ok: true,
          already: true,
          cvrVerificationRequired: true,
          message: 'CVR verification is already required (default state).',
        });
      }

      const after = await setCvrVerificationRequired(true, ctx.id);

      logger.info('[CVR_VERIFICATION] Re-enabled (required again)', {
        userId: ctx.id,
        activeCompanyId: ctx.activeCompanyId,
        previousChangedAt: before.cvrVerificationLastChangedAt,
        newChangedAt: after.cvrVerificationLastChangedAt,
      });

      await auditLog({
        action: 'OVERSIGHT',
        entityType: 'Company',
        entityId: ctx.activeCompanyId!,
        userId: ctx.id,
        companyId: ctx.activeCompanyId,
        performedByUserId: ctx.id,
        metadata: {
          ...requestMetadata(request),
          type: 'platform_cvr_verification_required',
          scope: 'platform-wide',
          note: 'SuperDev re-enabled platform-wide CVR verification. All tenants must now verify their CVR via the normal CVR lookup flow before creating Sproom child companies.',
          previousChangedAt: before.cvrVerificationLastChangedAt,
          newChangedAt: after.cvrVerificationLastChangedAt,
        },
      });

      return NextResponse.json({
        ok: true,
        cvrVerificationRequired: true,
        cvrVerificationLastChangedAt: after.cvrVerificationLastChangedAt,
        cvrVerificationLastChangedBy: after.cvrVerificationLastChangedBy,
      });
    } catch (error) {
      logger.error('[CVR_VERIFICATION] Re-enable failed:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);

// ─── DELETE: Disable CVR verification (skip the gate for all tenants) ─
//
// Refused when Sproom is pointed at production — see refuseIfSproomProductionForDisable.

export const DELETE = withGuard(
  SUPERDEV_ON_TENANT,
  async (request, ctx) => {
    // Safety gate
    const blocked = refuseIfSproomProductionForDisable();
    if (blocked) return blocked;

    try {
      const before = await getPlatformSettings();
      if (before.cvrVerificationRequired === false) {
        // Idempotent — already disabled.
        return NextResponse.json({
          ok: true,
          already: true,
          cvrVerificationRequired: false,
          message: 'CVR verification is already disabled.',
        });
      }

      const previousChangedAt = before.cvrVerificationLastChangedAt;
      const after = await setCvrVerificationRequired(false, ctx.id);

      logger.info('[CVR_VERIFICATION] Disabled (skipped for all tenants)', {
        userId: ctx.id,
        activeCompanyId: ctx.activeCompanyId,
        previousChangedAt,
        newChangedAt: after.cvrVerificationLastChangedAt,
      });

      await auditLog({
        action: 'OVERSIGHT',
        entityType: 'Company',
        entityId: ctx.activeCompanyId!,
        userId: ctx.id,
        companyId: ctx.activeCompanyId,
        performedByUserId: ctx.id,
        metadata: {
          ...requestMetadata(request),
          type: 'platform_cvr_verification_disabled',
          scope: 'platform-wide',
          note: 'SuperDev disabled platform-wide CVR verification. All tenants can now create Sproom child companies without verifying their CVR. Only effective when Sproom is in a non-production environment.',
          previousChangedAt,
          newChangedAt: after.cvrVerificationLastChangedAt,
        },
      });

      return NextResponse.json({
        ok: true,
        cvrVerificationRequired: false,
        cvrVerificationLastChangedAt: after.cvrVerificationLastChangedAt,
        cvrVerificationLastChangedBy: after.cvrVerificationLastChangedBy,
      });
    } catch (error) {
      logger.error('[CVR_VERIFICATION] Disable failed:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);

// ─── GET: Return current platform-wide CVR-verification state ───────
//
// Read-only — used by the frontend to render the toggle's current state.
// No audit log needed (read is harmless). Still SuperDev-only so a
// regular tenant can't probe the platform-wide flag (though it doesn't
// leak much info beyond "is CVR verification currently required or
// not", which is also surfaced via /api/sproom/status for the toggle
// to read).

export const GET = withGuard(
  SUPERDEV_ON_TENANT,
  async (_request, ctx) => {
    try {
      const settings = await getPlatformSettings();
      return NextResponse.json({
        cvrVerificationRequired: settings.cvrVerificationRequired !== false,
        cvrVerificationLastChangedAt: settings.cvrVerificationLastChangedAt,
        cvrVerificationLastChangedBy: settings.cvrVerificationLastChangedBy,
        sproomEnvironment: sproomClient.environment,
        sproomBaseUrl: sproomClient.baseUrlValue,
      });
    } catch (error) {
      logger.error('[CVR_VERIFICATION] GET failed:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
