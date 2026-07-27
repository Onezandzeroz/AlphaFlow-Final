import { NextRequest, NextResponse } from 'next/server';
import { withGuard } from '@/lib/route-guard';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditLog, requestMetadata } from '@/lib/audit';
import { sendSubscriptionCancelledEmail } from '@/lib/email-service';
import { getPlanPricing } from '@/lib/plan-pricing';
import type { PlanTier } from '@/lib/plan-features';

/**
 * POST /api/subscription/cancel
 *
 * Cancels the active subscription for the current user's company.
 *
 * Behaviour:
 *   - Sets Company.planStatus = 'cancelled' (does NOT change planTier)
 *   - Sets Company.planCancelledAt = now
 *   - Sets Company.planCancellationReason = 'user_request'
 *   - The user RETAINS access until the binding period ends (planExpiresAt)
 *     or, for monthly plans, until the end of the current period.
 *   - Sends a cancellation-confirmation email to the OWNER.
 *   - Writes an AuditLog entry.
 *
 * Cancellation is NOT a refund. Refunds must be handled manually by the
 * App Owner via /api/oversight/subscription. This endpoint only marks the
 * intent NOT to renew.
 *
 * Auth: requires authenticated user with an active company. The route is
 * restricted to OWNER role (only the owner can cancel the subscription).
 * Demo companies and oversight-mode sessions are blocked.
 *
 * Body:
 *   { reason?: string }  // optional free-text reason from the user
 */
export const POST = withGuard(
  {
    auth: true,
    requireCompany: true,
    blockOversight: true,
    blockDemo: true,
  },
  async (request: NextRequest, ctx) => {
    try {
      // Only the OWNER can cancel the subscription.
      // (SuperDev in their own company resolves to activeCompanyRole='OWNER'
      // via getAuthContext; SuperDev in oversight mode is already blocked by
      // the guard config blockOversight:true.)
      if (ctx.activeCompanyRole !== 'OWNER') {
        return NextResponse.json(
          { error: 'Kun virksomhedens ejer kan opsige abonnementet.' },
          { status: 403 },
        );
      }

      const body = await request.json().catch(() => ({})) as { reason?: string };
      const userReason = body.reason?.trim() || 'user_request';

      // Load the current subscription state
      const company = await db.company.findUnique({
        where: { id: ctx.activeCompanyId! },
        select: {
          id: true,
          name: true,
          planTier: true,
          planStatus: true,
          planPurchasedAt: true,
          planExpiresAt: true,
          nextRenewalAt: true,
          members: {
            where: { role: 'OWNER' },
            select: { user: { select: { id: true, email: true } } },
            take: 1,
          },
        },
      });

      if (!company) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 });
      }

      // Already cancelled? Idempotent — return the existing state
      if (company.planStatus === 'cancelled') {
        return NextResponse.json({
          success: true,
          alreadyCancelled: true,
          message: 'Abonnementet er allerede opsagt.',
          accessUntil: company.planExpiresAt?.toISOString() ?? company.nextRenewalAt?.toISOString() ?? null,
        });
      }

      // Free plan has nothing to cancel
      if (company.planTier === 'free') {
        return NextResponse.json(
          { error: 'Gratisplanen kan ikke opsiges — den er allerede gratis.' },
          { status: 400 },
        );
      }

      // Determine the access-until date:
      //   - Binding plans (annual/2year/3year): access until planExpiresAt
      //   - Monthly: access until nextRenewalAt (end of current paid period)
      const accessUntil = company.planExpiresAt ?? company.nextRenewalAt;
      const now = new Date();

      // Update the company's subscription state
      await db.company.update({
        where: { id: company.id },
        data: {
          planStatus: 'cancelled',
          planCancelledAt: now,
          planCancellationReason: userReason,
          // Clear nextRenewalAt so the billing scheduler doesn't send
          // renewal reminders for a cancelled subscription. planExpiresAt
          // is preserved so we know when to fully deactivate access.
          nextRenewalAt: null,
          lastReminderSentAt: null, // clear — no more reminders
        },
      });

      // Send the cancellation-confirmation email to the OWNER
      try {
        const owner = company.members[0]?.user;
        if (owner?.email) {
          const pricing = getPlanPricing(company.planTier as PlanTier);
          const appUrl = process.env.APP_URL || 'https://alphaflow.dk';

          await sendSubscriptionCancelledEmail(
            owner.email,
            {
              planName: pricing.descriptionDa,
              cancelledDate: now.toISOString(),
              accessUntilDate: accessUntil?.toISOString() ?? null,
              reason: userReason,
              appUrl: `${appUrl}/login`,
            },
            'da',
            company.id,
          ).catch((e) => {
            logger.warn(`[CANCEL SUBSCRIPTION] Email send failed for ${owner.email}:`, e);
          });
        }
      } catch (emailError) {
        // Non-critical — the cancellation IS recorded; email failure is logged
        logger.warn(`[CANCEL SUBSCRIPTION] Email handling error:`, emailError);
      }

      // Audit log
      await auditLog({
        action: 'UPDATE',
        entityType: 'Company',
        entityId: company.id,
        userId: ctx.id,
        companyId: ctx.activeCompanyId,
        changes: {
          planStatus: { old: company.planStatus, new: 'cancelled' },
          planCancelledAt: { old: null, new: now.toISOString() },
          planCancellationReason: { old: null, new: userReason },
        },
        metadata: requestMetadata(request),
      });

      logger.info(
        `[CANCEL SUBSCRIPTION] User ${ctx.email} cancelled ${company.planTier} subscription for company ${company.id}. Access until ${accessUntil?.toISOString() ?? 'end of period'}.`,
      );

      return NextResponse.json({
        success: true,
        planStatus: 'cancelled',
        accessUntil: accessUntil?.toISOString() ?? null,
        message: accessUntil
          ? `Dit abonnement er opsagt. Du beholder adgang indtil ${accessUntil.toLocaleDateString('da-DK')}.`
          : 'Dit abonnement er opsagt. Du beholder adgang indtil udgangen af den nuværende periode.',
      });
    } catch (error) {
      logger.error('[CANCEL SUBSCRIPTION] Error:', error);
      return NextResponse.json(
        { error: 'Kunne ikke opsige abonnementet. Prøv igen senere.' },
        { status: 500 },
      );
    }
  },
);
