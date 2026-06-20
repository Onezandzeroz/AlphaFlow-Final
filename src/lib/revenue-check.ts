/**
 * Revenue-based access gate
 *
 * Business rule:
 *   A tenant gets FULL access as long as their total revenue is under
 *   50.000 kr. The moment revenue exceeds 50.000 kr., write access is
 *   denied unless the tenant has an active subscription plan period OR
 *   a valid .tbkey proof file.
 *
 * "Revenue" is defined as the sum of all SALE-type transactions across
 * ALL companies the user belongs to (a tenant's full bookkeeping scope).
 * Cancelled transactions are excluded. Both `amountDKK` (preferred, the
 * normalised DKK value) and `amount` (fallback) are considered.
 *
 * The user MUST have actively chosen a plan first (trialClaimedAt is set).
 * Without that explicit choice, the revenue gate does NOT grant access —
 * the first-login plan prompt still forces an active selection.
 */

import { db } from '@/lib/db';

// ─── Config ───────────────────────────────────────────────────────────

/** Revenue threshold (in DKK) below which access is free. */
export const FREE_REVENUE_THRESHOLD = 50_000;

// ─── Types ────────────────────────────────────────────────────────────

export interface RevenueCheckResult {
  /** True if the user has actively chosen a plan (trialClaimedAt set). */
  hasChosenPlan: boolean;
  /** Total revenue across all of the user's companies, in DKK. */
  totalRevenue: number;
  /** True if revenue is at or below the free threshold. */
  withinFreeTier: boolean;
  /**
   * True if this user should be granted access based on the revenue rule
   * alone (hasChosenPlan AND withinFreeTier). Callers still need to fall
   * through to TokenPay/.tbkey checks when this is false.
   */
  grantedByRevenue: boolean;
}

// ─── Revenue calculation ──────────────────────────────────────────────

/**
 * Sum all SALE-type transactions for every company the user belongs to.
 *
 * Uses `_sum` aggregation in Prisma for efficiency (one DB call). Falls
 * back to `amount` if `amountDKK` is null for a transaction row — this
 * matches how the rest of the app treats the DKK-normalised column as
 * authoritative when present.
 *
 * Returns 0 for users with no companies or no sale transactions.
 */
export async function computeTenantRevenue(userId: string): Promise<number> {
  try {
    // Find every company the user belongs to.
    const memberships = await db.userCompany.findMany({
      where: { userId },
      select: { companyId: true },
    });

    if (memberships.length === 0) return 0;

    const companyIds = memberships.map((m) => m.companyId);

    // Sum amountDKK across all non-cancelled SALE transactions for those
    // companies. amountDKK is the normalised DKK value (populated by the
    // app when a transaction is created, even for DKK-native rows).
    const dkkSum = await db.transaction.aggregate({
      _sum: { amountDKK: true },
      where: {
        companyId: { in: companyIds },
        type: 'SALE',
        cancelled: false,
        amountDKK: { not: null },
      },
    });

    const fromDkk = dkkSum._sum.amountDKK
      ? Number(dkkSum._sum.amountDKK)
      : 0;

    // Some historical SALE rows may have amountDKK = null (pre-normalisation).
    // Sum their `amount` field separately and treat it as DKK (the app's
    // default currency) so we never under-count revenue.
    const fallbackSum = await db.transaction.aggregate({
      _sum: { amount: true },
      where: {
        companyId: { in: companyIds },
        type: 'SALE',
        cancelled: false,
        amountDKK: null,
      },
    });

    const fromFallback = fallbackSum._sum.amount
      ? Number(fallbackSum._sum.amount)
      : 0;

    return fromDkk + fromFallback;
  } catch (error) {
    console.error('[RevenueCheck] Failed to compute revenue:', error);
    // Fail safe: if the DB query errors, do NOT grant free-tier access.
    // Fall through to the normal TokenPay/.tbkey check instead.
    return Number.POSITIVE_INFINITY;
  }
}

// ─── Combined check ───────────────────────────────────────────────────

/**
 * Evaluate the revenue-based free-tier gate for a user.
 *
 * This does NOT grant access on its own — it returns a structured result
 * that the caller (`requireAccess` in tokenpay.ts) combines with the
 * owner-bypass and TokenPay/.tbkey checks.
 *
 * Rules encoded here:
 *   1. The user must have actively chosen a plan (trialClaimedAt != null).
 *      First-login users who haven't picked a plan are NOT granted access
 *      by the revenue rule — they still see the plan prompt.
 *   2. If chosen AND totalRevenue <= 50.000 kr. → grantedByRevenue = true.
 *   3. If chosen AND totalRevenue > 50.000 kr. → grantedByRevenue = false
 *      (caller must check TokenPay/.tbkey instead).
 */
export async function checkRevenueAccess(userId: string): Promise<RevenueCheckResult> {
  // 1. Has the user actively chosen a plan?
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { trialClaimedAt: true },
  });

  const hasChosenPlan = !!user?.trialClaimedAt;

  // If the user hasn't chosen a plan yet, the revenue gate is not active.
  // Return a neutral result that does NOT grant access — the caller falls
  // through to TokenPay (which will be read_only for a brand-new user).
  if (!hasChosenPlan) {
    return {
      hasChosenPlan: false,
      totalRevenue: 0,
      withinFreeTier: false,
      grantedByRevenue: false,
    };
  }

  // 2. Compute revenue across all of the user's companies.
  const totalRevenue = await computeTenantRevenue(userId);
  const withinFreeTier = totalRevenue <= FREE_REVENUE_THRESHOLD;

  return {
    hasChosenPlan: true,
    totalRevenue,
    withinFreeTier,
    grantedByRevenue: withinFreeTier,
  };
}
