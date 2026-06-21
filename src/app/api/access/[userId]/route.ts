import { NextResponse } from 'next/server';
import { tokenpay } from '@/lib/tokenpay';
import { checkOwnerAccess } from '@/lib/access-guard';
import { checkRevenueAccess, FREE_REVENUE_THRESHOLD } from '@/lib/revenue-check';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';
import { PlanTier, getPlanFeatures, tierToFrontendPlanId } from '@/lib/plan-features';

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

    // ─── Fetch the user's active company + plan tier ──────────
    // We need the actual Company.planTier to show the correct tier in the
    // settings UI (e.g. "Pro" instead of always "free tier").
    const userRow = await db.user.findUnique({
      where: { id: userId },
      select: {
        trialClaimedAt: true,
        subscriptionRevokedAt: true,
        companies: {
          take: 1,
          select: {
            company: {
              select: {
                id: true,
                planTier: true,
                planPurchasedAt: true,
                planExpiresAt: true,
              },
            },
          },
        },
      },
    });

    const companyPlanTier = (userRow?.companies?.[0]?.company?.planTier ?? PlanTier.Free) as PlanTier;
    const planPurchasedAt = userRow?.companies?.[0]?.company?.planPurchasedAt?.toISOString() ?? null;
    const planExpiresAt = userRow?.companies?.[0]?.company?.planExpiresAt?.toISOString() ?? null;

    // ─── 1. Owner bypass: AlphaAi owner always has read_write ───
    const ownerAccess = await checkOwnerAccess(userId);
    if (ownerAccess) {
      return NextResponse.json({
        ...ownerAccess,
        source: 'owner',
        sourceLabelDa: 'App-ejer (permanent)',
        sourceLabelEn: 'App Owner (permanent)',
        planTier: companyPlanTier,
        planId: tierToFrontendPlanId(companyPlanTier),
        planPurchasedAt,
        planExpiresAt,
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
        planTier: companyPlanTier,
        planId: tierToFrontendPlanId(companyPlanTier),
        planPurchasedAt,
        planExpiresAt,
        revenue: revenueResult.totalRevenue,
        withinFreeTier: revenueResult.withinFreeTier,
        subscriptionRevoked: revenueResult.revoked,
        hasChosenPlan: false,
        freeRevenueThreshold: FREE_REVENUE_THRESHOLD,
      });
    }

    // ─── 3. Paid plan (non-free tier) — access granted by plan ──
    //    If the company has a paid plan tier (monthly/annual/twoyear/threeyear),
    //    access is granted by the plan itself — not the revenue gate.
    if (companyPlanTier !== PlanTier.Free) {
      // Plan tier labels for the source field
      const tierLabels: Record<PlanTier, { da: string; en: string }> = {
        [PlanTier.Free]: { da: 'Gratis', en: 'Free' },
        [PlanTier.Monthly]: { da: 'Månedlig', en: 'Monthly' },
        [PlanTier.Annual]: { da: 'Pro', en: 'Pro' },
        [PlanTier.TwoYear]: { da: 'Business', en: 'Business' },
        [PlanTier.ThreeYear]: { da: 'Business Extended', en: 'Business Extended' },
      };

      return NextResponse.json({
        userId,
        accessLevel: 'read_write',
        accessExpiry: planExpiresAt,
        daysRemaining: planExpiresAt
          ? Math.max(0, Math.ceil((new Date(planExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
          : null,
        isExpired: false,
        cached: false,
        source: 'subscription_plan',
        sourceLabelDa: tierLabels[companyPlanTier].da,
        sourceLabelEn: tierLabels[companyPlanTier].en,
        planTier: companyPlanTier,
        planId: tierToFrontendPlanId(companyPlanTier),
        planPurchasedAt,
        planExpiresAt,
        revenue: revenueResult.totalRevenue,
        withinFreeTier: revenueResult.withinFreeTier,
        subscriptionRevoked: revenueResult.revoked,
        hasChosenPlan: true,
        freeRevenueThreshold: FREE_REVENUE_THRESHOLD,
      });
    }

    // ─── 4. Revenue-based free tier ────────────────────────────
    //    Company is on the Free plan. If revenue ≤ 50.000 kr. → granted.
    if (revenueResult.grantedByRevenue) {
      return NextResponse.json({
        userId,
        accessLevel: 'read_write',
        accessExpiry: null,
        daysRemaining: null,
        isExpired: false,
        cached: false,
        source: 'subscription',
        sourceLabelDa: 'Gratis (omsætning < 50.000 kr.)',
        sourceLabelEn: 'Free (revenue < 50,000 DKK)',
        planTier: companyPlanTier,
        planId: tierToFrontendPlanId(companyPlanTier),
        planPurchasedAt,
        planExpiresAt,
        revenue: revenueResult.totalRevenue,
        withinFreeTier: true,
        subscriptionRevoked: false,
        hasChosenPlan: true,
        freeRevenueThreshold: FREE_REVENUE_THRESHOLD,
      });
    }

    // ─── 5. TokenPay service (.tbkey proof) ────────────────────
    //    Reached when the company is on Free, revenue > 50.000 kr. (or
    //    access was revoked) — they need a .tbkey proof.
    const access = await tokenpay.checkAccess(userId);

    let source: string;
    let sourceLabelDa: string;
    let sourceLabelEn: string;

    if (access.isExpired) {
      source = 'expired';
      sourceLabelDa = 'Udløbet';
      sourceLabelEn = 'Expired';
    } else if (access.accessLevel === 'read_write') {
      // Check for active .tbkey proof
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
        source = 'subscription_plan';
        sourceLabelDa = 'Abonnementsplan';
        sourceLabelEn = 'Subscription plan';
      }
    } else {
      source = 'denied';
      sourceLabelDa = 'Adgang nægtet';
      sourceLabelEn = 'Access denied';
    }

    return NextResponse.json({
      ...access,
      source,
      sourceLabelDa,
      sourceLabelEn,
      planTier: companyPlanTier,
      planId: tierToFrontendPlanId(companyPlanTier),
      planPurchasedAt,
      planExpiresAt,
      revenue: revenueResult.totalRevenue,
      withinFreeTier: revenueResult.withinFreeTier,
      subscriptionRevoked: revenueResult.revoked,
      hasChosenPlan: true,
      trialClaimedAt: userRow?.trialClaimedAt?.toISOString() ?? null,
      freeRevenueThreshold: FREE_REVENUE_THRESHOLD,
    });
  } catch (error) {
    console.error('[Access API] Error:', error);
    const message = error instanceof Error ? error.message : 'Access check failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
