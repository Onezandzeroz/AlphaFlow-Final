/**
 * Secure session management with multi-tenant AuthContext
 *
 * Features:
 * - Cryptographically secure random session tokens
 * - Session validation against database
 * - Automatic expiry (7 days default, sliding)
 * - Session invalidation on logout
 * - Multi-tenant AuthContext with active company & role
 */

import { db } from '@/lib/db';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { PlanTier, Feature, getPlanFeatures } from '@/lib/plan-features';
import { tokenpay } from '@/lib/tokenpay';

export const SESSION_COOKIE_NAME = 'session';
const SESSION_MAX_AGE_DAYS = 7;

// ─── AUTH CONTEXT ────────────────────────────────────────────────────

export interface AuthContext {
  id: string;
  email: string;
  emailVerified: boolean;
  businessName?: string | null;
  isSuperDev: boolean;
  activeCompanyId: string | null;
  activeCompanyRole: string | null; // CompanyRole as string
  activeCompanyName: string | null;
  demoModeEnabled: boolean;
  /** True when the active company is the shared demo company — all writes must be blocked */
  isDemoCompany: boolean;
  /** When set, this SuperDev user is overseeing another tenant in read-only mode */
  oversightCompanyId: string | null;
  oversightCompanyName: string | null;
  /** True when oversightCompanyId is set — all mutations must be blocked */
  isOversightMode: boolean;
  // ── Project Mode (FASE 4) ──
  /** SuperDev-controlled per-tenant flag: when false, Projects UI + APIs are hidden */
  projectModeEnabled: boolean;
  /** When set, the user is working inside this project's context */
  activeProjectId: string | null;
  activeProjectName: string | null;
  activeProjectColor: string | null;
  activeProjectStatus: string | null;
  /** Project's start/end dates (ISO strings) — used to auto-default date filters */
  activeProjectStartDate: string | null;
  activeProjectEndDate: string | null;
  /** True when activeProjectId is set */
  isProjectMode: boolean;
  // ── Subscription plan (FASE 5 — feature gating) ──
  /** Active company's plan tier (null when no active company) */
  planTier: PlanTier | null;
  /** When the current plan was activated (ISO string or null) */
  planPurchasedAt: string | null;
  /** End of binding period (ISO string or null for free + monthly) */
  planExpiresAt: string | null;
  /** Pre-computed list of features available to this user+company (includes SuperDev + .tbkey overrides) */
  availableFeatures: Feature[];
}

// ─── TOKEN GENERATION ────────────────────────────────────────────────

/**
 * Generate a cryptographically secure session token
 */
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// ─── CREATE SESSION ──────────────────────────────────────────────────

/**
 * Create a new session for a user and set the cookie.
 *
 * Auto-sets activeCompanyId from the user's first company
 * (ordered by joinedAt ascending).
 */
export async function createSession(
  userId: string,
  request?: Request
): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_MAX_AGE_DAYS);

  // Extract IP and user agent if available
  const ipAddress = request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request?.headers.get('x-real-ip')
    || null;
  const userAgent = request?.headers.get('user-agent') || null;

  // Auto-set activeCompanyId: pick the user's first company (by joinedAt)
  const firstCompany = await db.userCompany.findFirst({
    where: { userId },
    orderBy: { joinedAt: 'asc' },
    select: { companyId: true },
  });

  await db.session.create({
    data: {
      token,
      userId,
      activeCompanyId: firstCompany?.companyId ?? null,
      ipAddress,
      userAgent,
      expiresAt,
    },
  });

  return token;
}

// ─── GET AUTH CONTEXT ────────────────────────────────────────────────

/**
 * Get the full AuthContext for the current request.
 *
 * This is the primary authentication function for API routes.
 * It resolves:
 *   - User identity (id, email, businessName)
 *   - Super-dev status
 *   - Active company (id, name, role)
 *   - Demo mode flag
 *
 * Returns null if not authenticated (no session cookie, expired, etc.)
 */
export async function getAuthContext(request?: Request): Promise<AuthContext | null> {
  let token: string | undefined;

  // Try to get token from cookie first, then from Authorization header
  try {
    const cookieStore = await cookies();
    token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  } catch {
    // cookies() throws in some edge runtime contexts; fall through to header
  }

  if (!token && request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }

  if (!token) return null;

  // Find valid session with user + activeCompany + oversightCompany + activeProject
  const session = await db.session.findUnique({
    where: { token },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          emailVerified: true,
          businessName: true,
          isSuperDev: true,
          demoModeEnabled: true,
          deactivatedAt: true,
        },
      },
      activeCompany: {
        select: {
          id: true,
          name: true,
          isDemo: true,
          cvrNumber: true,
          projectModeEnabled: true,
          planTier: true,
          planPurchasedAt: true,
          planExpiresAt: true,
        },
      },
      oversightCompany: {
        select: {
          id: true,
          name: true,
        },
      },
      activeProject: {
        select: {
          id: true,
          name: true,
          color: true,
          status: true,
          companyId: true,
          startDate: true,
          endDate: true,
        },
      },
    },
  });

  if (!session) return null;

  // Block access for deactivated accounts — session is invalidated immediately
  if (session.user.deactivatedAt) {
    // Destroy this session so it can't be reused
    await db.session.delete({ where: { id: session.id } });
    return null;
  }

  // Check if session expired
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } });
    return null;
  }

  // Sliding expiry: extend session on each use
  const newExpiresAt = new Date();
  newExpiresAt.setDate(newExpiresAt.getDate() + SESSION_MAX_AGE_DAYS);
  await db.session.update({
    where: { id: session.id },
    data: { expiresAt: newExpiresAt },
  });

  // Determine the user's role in the active company
  let activeCompanyRole: string | null = null;

  if (session.activeCompanyId && !session.user.isSuperDev) {
    const userCompany = await db.userCompany.findUnique({
      where: {
        userId_companyId: {
          userId: session.userId,
          companyId: session.activeCompanyId,
        },
      },
      select: { role: true },
    });
    activeCompanyRole = userCompany?.role ?? null;
  } else if (session.user.isSuperDev) {
    // SUPER_DEV implicitly has OWNER-level access for read operations
    // (The RBAC module handles the actual permission check)
    activeCompanyRole = 'OWNER';
  }

  // SuperDev (AppOwner / AlphaAi) is ALWAYS treated as verified
  const effectiveEmailVerified = session.user.isSuperDev ? true : (session.user.emailVerified ?? false);

  // ── Project Mode safety: clear stale activeProjectId if it belongs to a
  // different company than the active one (e.g. after company switch), or if
  // project mode is disabled for this tenant AND the user is not a SuperDev.
  // SuperDev bypasses the projectModeEnabled check so they can enter/exit
  // project mode in any tenant (to test + inspect) — including their own
  // AlphaAi tenant where projectModeEnabled defaults to false.
  // We auto-clean the session row so the next request sees a consistent
  // state without a manual exit.
  let effectiveActiveProject = session.activeProject;
  if (
    session.activeProject &&
    (session.activeProject.companyId !== session.activeCompanyId ||
      (!session.activeCompany?.projectModeEnabled && !session.user.isSuperDev))
  ) {
    effectiveActiveProject = null;
    // Fire-and-forget cleanup — don't block the response on it
    db.session.update({
      where: { id: session.id },
      data: { activeProjectId: null },
    }).catch(() => { /* ignore */ });
  }

  // ── Compute available features (FASE 5) ──
  // Start from the plan tier's feature set, then add SuperDev override
  // expansions (projectModeEnabled / HermesAgent.enabled). SuperDev users
  // get ALL features regardless of plan tier.
  const rawPlanTier = (session.activeCompany?.planTier as PlanTier) ?? PlanTier.Free;
  const featureSet = getPlanFeatures(rawPlanTier);

  // SuperDev override: projectModeEnabled adds PROJECT_ACCOUNTING even on
  // sub-Business-Extended tiers (manual App Owner flag for beta testers).
  if (session.activeCompany?.projectModeEnabled) {
    featureSet.add(Feature.ProjectAccounting);
  }

  // HermesAgent.enabled override is checked separately at the Hermes route
  // level (isHermesAvailable). We add HERMES to availableFeatures here too
  // so the frontend nav/settings show Hermes when the override is active.
  // We need to query HermesAgent — but only if the tier doesn't already
  // include Hermes (avoid the extra query for Pro+ tenants).
  if (!featureSet.has(Feature.Hermes) && session.activeCompanyId) {
    try {
      const hermesAgent = await db.hermesAgent.findUnique({
        where: { companyId: session.activeCompanyId },
        select: { enabled: true },
      });
      if (hermesAgent?.enabled) {
        featureSet.add(Feature.Hermes);
      }
    } catch {
      // Non-critical — leave Hermes out.
    }
  }

  // ── .tbkey proof override (FASE 5) ──
  // A valid .tbkey proof grants ALL features (highest tier = Business Extended).
  // This makes .tbkey proofs override the plan tier for feature access — a
  // proof holder on the Free plan gets Hermes, advanced reports, project
  // accounting, etc.
  //
  // We only check TokenPay if the user doesn't already have all features
  // (avoids the extra API call for SuperDev + threeyear tier). The check is
  // best-effort: if the TokenPay service is unreachable, the user falls back
  // to their plan-tier features only.
  if (!session.user.isSuperDev && !featureSet.has(Feature.ProjectAccounting)) {
    try {
      const status = await tokenpay.getUserStatus(session.user.id);
      if (status.activeProof) {
        // .tbkey proof holder — grant ALL features
        Object.values(Feature).forEach((f) => featureSet.add(f));
      }
    } catch {
      // TokenPay unavailable — fall back to plan-tier features only.
    }
  }

  // SuperDev always gets all features (for testing/inspection in any tenant)
  if (session.user.isSuperDev) {
    Object.values(Feature).forEach((f) => featureSet.add(f));
  }

  return {
    id: session.user.id,
    email: session.user.email,
    emailVerified: effectiveEmailVerified,
    businessName: session.user.businessName,
    isSuperDev: session.user.isSuperDev,
    activeCompanyId: session.activeCompanyId,
    activeCompanyRole,
    activeCompanyName: session.activeCompany?.name ?? null,
    demoModeEnabled: session.user.demoModeEnabled,
    isDemoCompany: session.activeCompany?.isDemo === true && session.activeCompany?.cvrNumber === '29876543',
    oversightCompanyId: session.oversightCompanyId,
    oversightCompanyName: session.oversightCompany?.name ?? null,
    isOversightMode: session.oversightCompanyId !== null,
    // ── Project Mode ──
    projectModeEnabled: session.activeCompany?.projectModeEnabled ?? false,
    activeProjectId: effectiveActiveProject?.id ?? null,
    activeProjectName: effectiveActiveProject?.name ?? null,
    activeProjectColor: effectiveActiveProject?.color ?? null,
    activeProjectStatus: effectiveActiveProject?.status ?? null,
    activeProjectStartDate: effectiveActiveProject?.startDate
      ? effectiveActiveProject.startDate.toISOString()
      : null,
    activeProjectEndDate: effectiveActiveProject?.endDate
      ? effectiveActiveProject.endDate.toISOString()
      : null,
    isProjectMode: effectiveActiveProject != null,
    // ── Subscription plan (FASE 5) ──
    planTier: rawPlanTier,
    planPurchasedAt: session.activeCompany?.planPurchasedAt?.toISOString() ?? null,
    planExpiresAt: session.activeCompany?.planExpiresAt?.toISOString() ?? null,
    availableFeatures: Array.from(featureSet),
  };
}

// ─── GET AUTH USER (backwards-compatible wrapper) ────────────────────

/**
 * Get the current authenticated user from session.
 * Backwards-compatible wrapper around getAuthContext.
 *
 * Returns null if not authenticated.
 */
export async function getAuthUser(
  request?: Request
): Promise<{ id: string; email: string; businessName?: string | null } | null> {
  const ctx = await getAuthContext(request);
  if (!ctx) return null;

  return {
    id: ctx.id,
    email: ctx.email,
    businessName: ctx.businessName,
  };
}

// ─── SESSION MANAGEMENT ──────────────────────────────────────────────

/**
 * Delete a session (logout)
 */
export async function destroySession(token?: string): Promise<void> {
  const cookieStore = await cookies();
  const sessionToken = token || cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionToken) {
    await db.session.deleteMany({ where: { token: sessionToken } });
  }
}

/**
 * Delete all sessions for a user (e.g., password change)
 */
export async function destroyAllUserSessions(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}

/**
 * Clean up expired sessions (call periodically)
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await db.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}
