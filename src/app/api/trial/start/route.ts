import { NextRequest, NextResponse } from 'next/server';
import { withGuard } from '@/lib/route-guard';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditLog, requestMetadata } from '@/lib/audit';
import { frontendPlanIdToTier, PlanTier } from '@/lib/plan-features';

// ─── POST /api/trial/start ─────────────────────────────────────────
// Activate the FREE plan on first login.
//
// Called ONLY when the user clicks the Free (Gratis) plan on the
// subscription plans prompt. For paid plans (Månedlig / Pro / Business /
// Business Extended), the frontend calls /api/subscription/create-payment
// instead — the plan is activated only after a confirmed Flatpay payment.
//
// For Free:
//   - Set User.trialClaimedAt (the "has chosen a plan" gate)
//   - Set Company.planTier = 'free' + planPurchasedAt = now
//   - The revenue-gate (lib/revenue-check.ts) grants read_write access
//     for tenants whose revenue ≤ 50.000 kr.
//
// Rules:
//   - Each user can only self-claim ONCE (tracked by trialClaimedAt).
//   - SuperDev users and demo companies are not eligible.

export const POST = withGuard({
  auth: true,
  requireCompany: true,
  blockOversight: true,
  blockDemo: true,
}, async (request: NextRequest, ctx) => {
  try {
    // SuperDev users don't need a trial
    if (ctx.isSuperDev) {
      return NextResponse.json(
        { error: 'App owner does not need a trial' },
        { status: 403 },
      );
    }

    // Parse the planId from the request body
    const body = await request.json().catch(() => ({}));
    const planId: string = body.planId || 'free';
    const planTier = frontendPlanIdToTier(planId);

    // This route ONLY handles the Free plan. Paid plans must go through
    // /api/subscription/create-payment → Flatpay → webhook activation.
    if (planTier !== PlanTier.Free) {
      return NextResponse.json(
        {
          error: 'Paid plans require payment. Use /api/subscription/create-payment.',
          code: 'PAID_PLAN_REQUIRES_PAYMENT',
          paymentEndpoint: '/api/subscription/create-payment',
        },
        { status: 400 },
      );
    }

    // Check if user has already claimed their one-time plan choice
    const user = await db.user.findUnique({
      where: { id: ctx.id },
      select: { id: true, email: true, trialClaimedAt: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.trialClaimedAt) {
      return NextResponse.json(
        {
          error: 'Du har allerede valgt en plan.',
          alreadyClaimed: true,
          claimedAt: user.trialClaimedAt.toISOString(),
        },
        { status: 409 },
      );
    }

    // Mark that the user has actively chosen a plan (User-level gate).
    await db.user.update({
      where: { id: ctx.id },
      data: { trialClaimedAt: new Date() },
    });

    // Activate the Free plan on the company immediately.
    const now = new Date();
    await db.company.update({
      where: { id: ctx.activeCompanyId! },
      data: {
        planTier: PlanTier.Free,
        planPurchasedAt: now,
        planExpiresAt: null,
        planActivatedBy: ctx.id,
      },
    });

    // Audit log
    await auditLog({
      action: 'CREATE',
      entityType: 'User',
      entityId: ctx.id,
      userId: ctx.id,
      companyId: ctx.activeCompanyId,
      changes: {
        planChosen: { old: null, new: PlanTier.Free },
        planId: { old: null, new: planId },
      },
      metadata: requestMetadata(request),
    });

    logger.info(
      `[TRIAL] User ${user.email} chose the Free plan. trialClaimedAt set. Revenue gate now active.`,
    );

    return NextResponse.json({
      success: true,
      planId,
      planTier: PlanTier.Free,
      paidPlan: false,
      message: 'Du har nu fuld adgang — gratis så længe din omsætning er under 50.000 kr.',
    });
  } catch (error) {
    logger.error('[TRIAL START] Error:', error);
    return NextResponse.json(
      { error: 'Kunne ikke aktivere din plan. Prøv igen senere.' },
      { status: 500 },
    );
  }
});
