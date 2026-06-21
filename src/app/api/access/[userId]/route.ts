import { NextResponse } from 'next/server';
import { tokenpay } from '@/lib/tokenpay';
import { checkOwnerAccess } from '@/lib/access-guard';
import { checkRevenueAccess, FREE_REVENUE_THRESHOLD } from '@/lib/revenue-check';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';

// GET /api/access/[userId]
//
// Mirrors the evaluation order of requireAccess() in lib/tokenpay.ts so
// the frontend sees the same access level that mutation guards enforce:
//   1. Owner bypass
//   2. Plan-choice gate — if trialClaimedAt is NOT set, return read_only
//      immediately. This blocks stale TokenPay trials from granting
//      access before the user has clicked a plan on the first-login prompt.
//   3. Revenue-based free tier (trialClaimedAt set AND revenue ≤ 50.000 kr.)
//   4. TokenPay (.tbkey proof / subscription plan period)
//
// The response includes a `source` field describing WHY access was granted
// or denied, plus revenue/subscription metadata for the settings UI to
// display a detailed access summary.
export const GET = withGuard({ auth: true }, async (request, ctx, context) => {
  try {
    const { userId } = await context.params as { userId: string };
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // ─── 1. Owner bypass: AlphaAi owner always has read_write ───
    const ownerAccess = await checkOwnerAccess(userId);
    if (ownerAccess) {
      return NextResponse.json({
        ...ownerAccess,
        source: 'owner',
        sourceLabelDa: 'App-ejer (permanent)',
        sourceLabelEn: 'App Owner (permanent)',
        revenue: null,
        withinFreeTier: null,
        subscriptionRevoked: false,
        hasChosenPlan: true,
      });
    }

    // ─── 2. Plan-choice gate + revenue check ───────────────────
    const revenueResult = await checkRevenueAccess(userId);

    if (!revenueResult.hasChosenPlan) {
      return NextResponse.json({
        userId,
        accessLevel: 'read_only',
        accessExpiry: null,
        daysRemaining: null,
        isExpired: false,
        cached: false,
        source: 'no_plan',
        sourceLabelDa: 'Ingen plan valgt',
        sourceLabelEn: 'No plan chosen',
        revenue: revenueResult.totalRevenue,
        withinFreeTier: revenueResult.withinFreeTier,
        subscriptionRevoked: revenueResult.revoked,
        hasChosenPlan: false,
        freeRevenueThreshold: FREE_REVENUE_THRESHOLD,
      });
    }

    // ─── 3. Revenue-based free tier ────────────────────────────
    if (revenueResult.grantedByRevenue) {
      return NextResponse.json({
        userId,
        accessLevel: 'read_write',
        accessExpiry: null,
        daysRemaining: null,
        isExpired: false,
        cached: false,
        source: 'subscription',
        sourceLabelDa: 'Abonnement (gratis tier)',
        sourceLabelEn: 'Subscription (free tier)',
        revenue: revenueResult.totalRevenue,
        withinFreeTier: true,
        subscriptionRevoked: false,
        hasChosenPlan: true,
        freeRevenueThreshold: FREE_REVENUE_THRESHOLD,
      });
    }

    // ─── 4. TokenPay service (.tbkey proof / subscription) ─────
    //    Reached when the user HAS chosen a plan but revenue exceeds
    //    50.000 kr. (or access was revoked) — they need a purchased plan
    //    or .tbkey proof.
    const access = await tokenpay.checkAccess(userId);

    // Determine the source label for the TokenPay path. If the user has
    // an active proof, it's .tbkey-based; otherwise it's a subscription
    // plan period (or denied).
    let source: string;
    let sourceLabelDa: string;
    let sourceLabelEn: string;

    if (access.isExpired) {
      source = 'expired';
      sourceLabelDa = 'Udløbet';
      sourceLabelEn = 'Expired';
    } else if (access.accessLevel === 'read_write') {
      // Distinguish .tbkey proof from a subscription plan by checking
      // whether the user has an active proof on file.
      try {
        const status = await tokenpay.getUserStatus(userId);
        if (status.activeProof) {
          source = 'tbkey';
          sourceLabelDa = '.tbkey proof';
          sourceLabelEn = '.tbkey proof';
        } else {
          source = 'subscription_plan';
          sourceLabelDa = 'Abonnementsplan';
          sourceLabelEn = 'Subscription plan';
        }
      } catch {
        // Status check failed — fall back to a generic label.
        source = 'subscription_plan';
        sourceLabelDa = 'Abonnementsplan';
        sourceLabelEn = 'Subscription plan';
      }
    } else {
      source = 'denied';
      sourceLabelDa = 'Adgang nægtet';
      sourceLabelEn = 'Access denied';
    }

    // Fetch trialClaimedAt + subscriptionRevokedAt for the metadata block.
    let trialClaimedAt: string | null = null;
    try {
      const userRow = await db.user.findUnique({
        where: { id: userId },
        select: { trialClaimedAt: true, subscriptionRevokedAt: true },
      });
      trialClaimedAt = userRow?.trialClaimedAt?.toISOString() ?? null;
    } catch {
      // Non-critical — leave null.
    }

    return NextResponse.json({
      ...access,
      source,
      sourceLabelDa,
      sourceLabelEn,
      revenue: revenueResult.totalRevenue,
      withinFreeTier: revenueResult.withinFreeTier,
      subscriptionRevoked: revenueResult.revoked,
      hasChosenPlan: true,
      trialClaimedAt,
      freeRevenueThreshold: FREE_REVENUE_THRESHOLD,
    });
  } catch (error) {
    console.error('[Access API] Error:', error);
    const message = error instanceof Error ? error.message : 'Access check failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
