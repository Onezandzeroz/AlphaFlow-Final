import { NextResponse } from 'next/server';
import { tokenpay } from '@/lib/tokenpay';
import { checkOwnerAccess } from '@/lib/access-guard';
import { checkRevenueAccess } from '@/lib/revenue-check';
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
export const GET = withGuard({ auth: true }, async (request, ctx, context) => {
  try {
    const { userId } = await context.params as { userId: string };
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // ─── 1. Owner bypass: AlphaAi owner always has read_write ───
    const ownerAccess = await checkOwnerAccess(userId);
    if (ownerAccess) {
      return NextResponse.json(ownerAccess);
    }

    // ─── 2. Plan-choice gate + revenue check ───────────────────
    //    checkRevenueAccess returns hasChosenPlan = false for users who
    //    have never clicked a plan. We return read_only in that case so
    //    the frontend shows the plan prompt — even if TokenPay has a
    //    stale trial from before this rule existed.
    const revenueResult = await checkRevenueAccess(userId);

    if (!revenueResult.hasChosenPlan) {
      return NextResponse.json({
        userId,
        accessLevel: 'read_only',
        accessExpiry: null,
        daysRemaining: null,
        isExpired: false,
        cached: false,
      });
    }

    // ─── 3. Revenue-based free tier ────────────────────────────
    //    User has chosen a plan AND revenue ≤ 50.000 kr. → read_write.
    if (revenueResult.grantedByRevenue) {
      return NextResponse.json({
        userId,
        accessLevel: 'read_write',
        accessExpiry: null,
        daysRemaining: null,
        isExpired: false,
        cached: false,
      });
    }

    // ─── 4. TokenPay service (.tbkey proof / subscription) ─────
    //    Reached only when the user HAS chosen a plan but revenue exceeds
    //    50.000 kr. — they need a purchased plan or .tbkey proof.
    const access = await tokenpay.checkAccess(userId);
    return NextResponse.json(access);
  } catch (error) {
    console.error('[Access API] Error:', error);
    const message = error instanceof Error ? error.message : 'Access check failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
