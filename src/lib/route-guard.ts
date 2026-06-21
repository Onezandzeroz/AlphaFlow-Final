/**
 * Central Route Guard System for AlphaFlow
 *
 * Provides a declarative, enforced guard architecture for all API routes.
 * Instead of manually calling getAuthContext(), blockOversightMutation(),
 * requireTokenPayAccess(), requireNotDemoCompany(), requirePermission(),
 * and tenantFilter() in every route handler, routes declare their guard
 * requirements via GuardConfig and are wrapped with withGuard().
 *
 * Benefits:
 * - Structurally impossible to forget a guard (missing config = 500 error)
 * - Declarative route config serves as both code AND documentation
 * - All routes validated consistently through a single execution path
 * - No changes to session architecture (still uses getAuthContext + DB)
 *
 * Usage:
 * ```ts
 * export const POST = withGuard('/api/transactions', {
 *   auth: true,
 *   requireCompany: true,
 *   blockOversight: true,
 *   blockDemo: true,
 *   requireTokenPay: true,
 *   permissions: [Permission.DATA_CREATE],
 * }, async (request, ctx, context) => {
 *   // ctx is fully validated — just write business logic
 *   // For dynamic routes, access params via: const { id } = await context.params;
 *   const data = await db.transaction.create({
 *     ...body,
 *     companyId: ctx.activeCompanyId,
 *   });
 *   return NextResponse.json(data);
 * });
 * ```
 */

import { getAuthContext, AuthContext } from '@/lib/session';
import {
  requirePermission,
  Permission,
  blockOversightMutation,
  requireNotDemoCompany,
} from '@/lib/rbac';
import { requireTokenPayAccess } from '@/lib/tokenpay';
import { hasFeature, Feature, getFeatureLabel } from '@/lib/plan-features';
import { NextRequest, NextResponse } from 'next/server';

// ─── Next.js 16 Route Context Type ──────────────────────────────

/**
 * Next.js 16 route handler context — params is now a Promise.
 * Each route file receives this as the second argument from Next.js.
 */
export type RouteSegmentContext = { params: Promise<Record<string, string | string[]>> };

// ─── Guard Configuration ──────────────────────────────────────

export interface GuardConfig {
  /** Require authenticated session (getAuthContext must return non-null) */
  auth: true | 'optional' | false;

  /** Require the user to have an active company selected */
  requireCompany?: boolean;

  /** Block mutations when user is in oversight (read-only) mode */
  blockOversight?: boolean;

  /** Block mutations when user is in the demo company */
  blockDemo?: boolean;

  /** Require TokenPay read_write access (owner bypasses automatically) */
  requireTokenPay?: boolean;

  /** Require specific RBAC permissions (all must pass) */
  permissions?: Permission[];

  /** Require SuperDev status */
  requireSuperDev?: boolean;

  /** Require a specific subscription plan feature (FASE 5). SuperDev + oversight always pass. */
  requireFeature?: Feature;

  /** Require multiple features (all must pass). SuperDev + oversight always pass. */
  requireFeatures?: Feature[];
}

// ─── Convenience Presets ──────────────────────────────────────

/** Standard read route: auth + company scope */
export const READ: GuardConfig = {
  auth: true,
  requireCompany: true,
};

/** Standard mutation route: all guards active */
export const MUTATE: GuardConfig = {
  auth: true,
  requireCompany: true,
  blockOversight: true,
  blockDemo: true,
  requireTokenPay: true,
};

/** Auth-only route: just needs a valid session, no company */
export const AUTH_ONLY: GuardConfig = {
  auth: true,
};

/** Public route: no authentication required */
export const PUBLIC: GuardConfig = {
  auth: false,
};

/** SuperDev-only route */
export const SUPERDEV_ONLY: GuardConfig = {
  auth: true,
  requireSuperDev: true,
};

/** Public webhook route: verified by HMAC or other mechanism, not session */
export const WEBHOOK: GuardConfig = {
  auth: false,
};

// ─── Guard Execution Engine ───────────────────────────────────

/**
 * Execute all guard checks for a given configuration.
 * Returns { ctx, error } — if error is non-null, the request is denied.
 */
async function executeGuard(
  config: GuardConfig,
  request: NextRequest
): Promise<{ ctx: AuthContext | null; error: NextResponse | null }> {
  // 1. Authentication
  const ctx = await getAuthContext(request);

  if (config.auth === true && !ctx) {
    return {
      ctx: null,
      error: NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      ),
    };
  }

  // 'optional' or false — allow unauthenticated
  if (config.auth === false || config.auth === 'optional') {
    return { ctx, error: null };
  }

  // From here on, ctx is guaranteed non-null (auth === true)
  if (!ctx) {
    // This shouldn't happen given the check above, but TypeScript needs it
    return {
      ctx: null,
      error: NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      ),
    };
  }

  // 2. SuperDev requirement
  if (config.requireSuperDev && !ctx.isSuperDev) {
    return {
      ctx,
      error: NextResponse.json(
        { error: 'SuperDev access required' },
        { status: 403 }
      ),
    };
  }

  // 3. Company requirement
  if (config.requireCompany && !ctx.activeCompanyId) {
    return {
      ctx,
      error: NextResponse.json(
        { error: 'No active company selected. Please select a company.' },
        { status: 400 }
      ),
    };
  }

  // 4. Oversight block (for mutations)
  if (config.blockOversight) {
    const blocked = blockOversightMutation(ctx);
    if (blocked) return { ctx, error: blocked };
  }

  // 5. Demo company block (for mutations)
  if (config.blockDemo) {
    const blocked = requireNotDemoCompany(ctx);
    if (blocked) return { ctx, error: blocked };
  }

  // 6. TokenPay access (for mutations — owner bypasses automatically)
  if (config.requireTokenPay) {
    const denied = await requireTokenPayAccess(ctx.id);
    if (denied) return { ctx, error: denied };
  }

  // 7. RBAC permissions
  if (config.permissions?.length) {
    for (const perm of config.permissions) {
      const denied = requirePermission(ctx, perm);
      if (denied) return { ctx, error: denied };
    }
  }

  // 8. Subscription plan feature gate (FASE 5)
  //    SuperDev + oversight mode always pass (handled inside hasFeature).
  //    Returns 403 with code 'PLAN_FEATURE_REQUIRED' so the frontend can
  //    show an upgrade prompt.
  const requiredFeatures: Feature[] = [];
  if (config.requireFeature) requiredFeatures.push(config.requireFeature);
  if (config.requireFeatures?.length) requiredFeatures.push(...config.requireFeatures);

  for (const feature of requiredFeatures) {
    if (!hasFeature(ctx, feature)) {
      return {
        ctx,
        error: NextResponse.json(
          {
            error: `Dit abonnement inkluderer ikke "${getFeatureLabel(feature, 'da')}". Opgrader for at få adgang.`,
            code: 'PLAN_FEATURE_REQUIRED',
            feature,
          },
          { status: 403 }
        ),
      };
    }
  }

  return { ctx, error: null };
}

// ─── withGuard Wrapper ────────────────────────────────────────

type RouteHandlerContext = AuthContext;

type RouteHandler = (
  request: NextRequest,
  ctx: RouteHandlerContext,
  context: RouteSegmentContext
) => Promise<Response>;

/**
 * Wrap an API route handler with enforced guard checks.
 *
 * The guard configuration is executed BEFORE the handler runs.
 * If any guard check fails, an error response is returned immediately.
 * If all checks pass, the handler receives the validated AuthContext.
 *
 * @param config - Guard configuration declaring required protections
 * @param handler - Business logic handler receiving (request, ctx, context)
 * @returns Next.js 16 route handler function with correct signature
 */
export function withGuard(
  config: GuardConfig,
  handler: RouteHandler
): (request: NextRequest, context: RouteSegmentContext) => Promise<Response> {
  return async (request: NextRequest, context: RouteSegmentContext) => {
    const { ctx, error } = await executeGuard(config, request);
    if (error) return error;

    // For auth: false / 'optional', ctx might be null — handler must handle that
    // For auth: true, ctx is guaranteed non-null
    return handler(request, ctx as RouteHandlerContext, context);
  };
}
