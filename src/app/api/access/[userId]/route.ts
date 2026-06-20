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
//   2. Revenue-based free tier (trialClaimedAt set AND revenue ≤ 50.000 kr.)
//   3. TokenPay (.tbkey proof / subscription plan period)
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

    // ─── 2. Revenue-based free tier ─────────────────────────────
    //    Only applies once the user has actively chosen a plan via the
    //    first-login prompt (trialClaimedAt set). Before that choice,
    //    we fall through to TokenPay (which returns read_only for a
    //    brand-new user — so the plan prompt is shown).
    const revenueResult = await checkRevenueAccess(userId);
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

    // ─── 3. Normal flow: check TokenPay service ────────────────
    const access = await tokenpay.checkAccess(userId);
    return NextResponse.json(access);
  } catch (error) {
    console.error('[Access API] Error:', error);
    const message = error instanceof Error ? error.message : 'Access check failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
