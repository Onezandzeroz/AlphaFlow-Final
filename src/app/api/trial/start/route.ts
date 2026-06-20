import { NextRequest, NextResponse } from 'next/server';
import { withGuard } from '@/lib/route-guard';
import { db } from '@/lib/db';
import { grantTrial } from '@/lib/tokenpay';
import { logger } from '@/lib/logger';
import { auditLog, requestMetadata } from '@/lib/audit';

// ─── POST /api/trial/start ─────────────────────────────────────────
// Confirm the user's plan choice on first login.
//
// Called when the user actively clicks the Free plan on the subscription
// plans prompt. The act of choosing a plan is what unlocks access — the
// backend revenue-gate (see lib/revenue-check.ts) grants full read_write
// access for tenants whose total revenue is ≤ 50.000 kr.
//
// This route's primary job is to record that the user has made an active
// choice (trialClaimedAt). A long TokenPay trial (365 days) is ALSO granted
// as a safety net so that access still works if the revenue check is ever
// unavailable — but the revenue gate is the real authority.
//
// Rules:
//   - Each user can only self-claim ONCE (tracked by trialClaimedAt).
//   - The app owner can still grant additional trials via oversight settings.
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

    // Check if user has already claimed their one-time trial
    const user = await db.user.findUnique({
      where: { id: ctx.id },
      select: { id: true, email: true, businessName: true, trialClaimedAt: true },
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

    // Mark that the user has actively chosen a plan.
    // This is the key flag the revenue-gate checks before granting free-tier
    // access — without it, a brand-new user is NOT given access and still
    // sees the plan prompt.
    await db.user.update({
      where: { id: ctx.id },
      data: { trialClaimedAt: new Date() },
    });

    // Grant a long TokenPay trial as a SAFETY NET. The revenue gate is the
    // real authority, but if it ever fails (DB error, etc.) the user should
    // still have working access. 365 days keeps this net active without
    // interfering with the revenue-based model.
    let trialExpiry: string | null = null;
    try {
      const result = await grantTrial(ctx.id, user.email, user.businessName || undefined, 365);
      trialExpiry = result.trialExpiry;
    } catch (trialError) {
      // Non-fatal: the revenue gate still grants access. Log and continue.
      logger.warn(
        `[TRIAL] TokenPay grantTrial failed for ${user.email} (revenue gate still active):`,
        trialError,
      );
    }

    // Audit log
    await auditLog({
      action: 'CREATE',
      entityType: 'User',
      entityId: ctx.id,
      userId: ctx.id,
      companyId: ctx.activeCompanyId,
      changes: { planChosen: { old: null, new: trialExpiry ?? 'revenue-tier' } },
      metadata: requestMetadata(request),
    });

    logger.info(
      `[TRIAL] User ${user.email} chose a plan. trialClaimedAt set. Revenue gate now active.`,
    );

    return NextResponse.json({
      success: true,
      trialExpiry,
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
