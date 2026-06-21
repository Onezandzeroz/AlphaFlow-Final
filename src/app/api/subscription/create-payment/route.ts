import { NextRequest, NextResponse } from 'next/server';
import { withGuard } from '@/lib/route-guard';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditLog, requestMetadata } from '@/lib/audit';
import { frontendPlanIdToTier, PlanTier, getBindingMonths } from '@/lib/plan-features';
import { getPlanPricing } from '@/lib/plan-pricing';
import { createPaymentSession } from '@/lib/flatpay-client';

/**
 * POST /api/subscription/create-payment
 *
 * Creates a Flatpay payment session for a paid subscription plan.
 * Called when the user clicks a paid plan (Månedlig / Pro / Business /
 * Business Extended) on the subscription plans prompt.
 *
 * Request body: { planId: 'monthly' | 'annual' | '2year' | '3year' }
 *
 * Response: { checkoutUrl, paymentId }
 *
 * The frontend redirects the user to `checkoutUrl` (Flatpay's hosted
 * checkout page). After payment, Flatpay redirects back to
 * /api/subscription/payment-callback and sends a webhook to
 * /api/subscription/payment-webhook. The plan is activated only after
 * a confirmed payment.
 *
 * For the Free plan, use /api/trial/start instead (no payment needed).
 */
export const POST = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true },
  async (request: NextRequest, ctx) => {
    try {
      const body = await request.json().catch(() => ({}));
      const { planId } = body as { planId?: string };

      if (!planId) {
        return NextResponse.json({ error: 'Missing: planId' }, { status: 400 });
      }

      const planTier = frontendPlanIdToTier(planId);

      // Free plan should not go through payment — use /api/trial/start
      if (planTier === PlanTier.Free) {
        return NextResponse.json(
          { error: 'Free plan does not require payment. Use /api/trial/start.' },
          { status: 400 }
        );
      }

      // Compute the amount + description
      const pricing = getPlanPricing(planTier);
      const bindingMonths = getBindingMonths(planTier);

      if (pricing.totalAmountOre <= 0) {
        return NextResponse.json({ error: 'Invalid plan pricing' }, { status: 400 });
      }

      // Create a Payment row (status=pending)
      const payment = await db.payment.create({
        data: {
          userId: ctx.id,
          companyId: ctx.activeCompanyId!,
          planTier,
          amount: pricing.totalAmountOre,
          currency: 'DKK',
          bindingMonths,
          status: 'pending',
        },
      });

      // Build the URLs Flatpay needs
      const origin = request.nextUrl.origin;
      const returnUrl = `${origin}/api/subscription/payment-callback?payment_id=${payment.id}`;
      const webhookUrl = `${origin}/api/subscription/payment-webhook`;

      // Create the payment session with Flatpay
      const session = await createPaymentSession({
        paymentId: payment.id,
        amount: pricing.totalAmountOre,
        currency: 'DKK',
        description: pricing.descriptionDa,
        returnUrl,
        webhookUrl,
        customerEmail: ctx.email,
      });

      // Store Flatpay's payment ID + checkout URL on the Payment row
      await db.payment.update({
        where: { id: payment.id },
        data: {
          flatpayPaymentId: session.flatpayPaymentId,
          flatpaySessionUrl: session.checkoutUrl,
        },
      });

      // Audit log
      await auditLog({
        action: 'CREATE',
        entityType: 'Payment',
        entityId: payment.id,
        userId: ctx.id,
        companyId: ctx.activeCompanyId,
        changes: {
          planTier: { old: null, new: planTier },
          amount: { old: null, new: pricing.totalAmountOre },
          flatpayPaymentId: { old: null, new: session.flatpayPaymentId },
        },
        metadata: requestMetadata(request),
      });

      logger.info(
        `[SUBSCRIPTION] Payment session created for user ${ctx.email}, plan ${planTier}, amount ${pricing.totalAmountOre} øre. Payment ID: ${payment.id}`,
      );

      return NextResponse.json({
        checkoutUrl: session.checkoutUrl,
        paymentId: payment.id,
        planTier,
        amount: pricing.totalAmountOre,
        currency: 'DKK',
      });
    } catch (error) {
      logger.error('[CREATE PAYMENT] Error:', error);
      return NextResponse.json(
        { error: 'Kunne ikke oprette betalingssession. Prøv igen senere.' },
        { status: 500 },
      );
    }
  }
);
