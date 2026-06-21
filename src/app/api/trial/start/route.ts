import { NextRequest, NextResponse } from 'next/server';
import { withGuard } from '@/lib/route-guard';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditLog, requestMetadata } from '@/lib/audit';
import { frontendPlanIdToTier, PlanTier } from '@/lib/plan-features';

// ─── POST /api/trial/start ─────────────────────────────────────────
// Confirm the user's plan choice on first login.
//
// Called when the user actively clicks ANY plan on the subscription plans
// prompt. The request body includes `{ planId }` so we know which plan
// the user chose.
//
// For the Free plan:
//   - Set User.trialClaimedAt (the "has chosen a plan" gate)
//   - Set Company.planTier = 'free' + planPurchasedAt = now
//   - The revenue-gate (lib/revenue-check.ts) grants read_write access
//     for tenants whose revenue ≤ 50.000 kr.
//
// For paid plans (monthly / annual / 2year / 3year):
//   - Set User.trialClaimedAt (so the user doesn't see the prompt again)
//   - Record the user's INTENT in Company.planNotes ("requested: <planId>")
//   - The actual plan tier is NOT activated here — paid plans require
//     App Owner activation via /api/oversight/subscription. The frontend
//     navigates the user to the access settings to upload a .tbkey proof
//     or wait for App Owner activation.
//
// Rules:
//   - Each user can only self-claim ONCE (tracked by trialClaimedAt).
//   - SuperDev users and demo companies are not eligible.

export const POST = withGuard({
  auth: true,
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

    // Set the Company plan tier. For Free, activate immediately. For paid
    // plans, record the user's intent in planNotes but keep the tier as
    // 'free' until the App Owner activates the paid plan via oversight.
    if (ctx.activeCompanyId) {
      const now = new Date();
      if (planTier === PlanTier.Free) {
        await db.company.update({
          where: { id: ctx.activeCompanyId },
          data: {
            planTier: PlanTier.Free,
            planPurchasedAt: now,
            planExpiresAt: null,
          },
        });
      } else {
        // Paid plan selected — record intent, keep tier as-is (likely 'free').
        // The App Owner activates the paid tier via /api/oversight/subscription.
        await db.company.update({
          where: { id: ctx.activeCompanyId },
          data: {
            planNotes: `Bruger anmodede om: ${planId} (${planTier}) — afventer App-ejer aktivering`,
          },
        });
      }
    }

    // Audit log
    await auditLog({
      action: 'CREATE',
      entityType: 'User',
      entityId: ctx.id,
      userId: ctx.id,
      companyId: ctx.activeCompanyId,
      changes: {
        planChosen: { old: null, new: planTier },
        planId: { old: null, new: planId },
      },
      metadata: requestMetadata(request),
    });

    logger.info(
      `[TRIAL] User ${user.email} chose plan ${planId} (tier: ${planTier}). trialClaimedAt set.`,
    );

    return NextResponse.json({
      success: true,
      planId,
      planTier,
      paidPlan: planTier !== PlanTier.Free,
      message: planTier === PlanTier.Free
        ? 'Du har nu fuld adgang — gratis så længe din omsætning er under 50.000 kr.'
        : 'Din plan-anmodning er registreret. App-ejeren aktiverer den betalte plan.',
    });
  } catch (error) {
    logger.error('[TRIAL START] Error:', error);
    return NextResponse.json(
      { error: 'Kunne ikke aktivere din plan. Prøv igen senere.' },
      { status: 500 },
    );
  }
});
