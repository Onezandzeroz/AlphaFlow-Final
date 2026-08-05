import { NextRequest, NextResponse } from 'next/server';
import { withGuard } from '@/lib/route-guard';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditLog, requestMetadata } from '@/lib/audit';
import { frontendPlanIdToTier, PlanTier, getBindingMonths } from '@/lib/plan-features';
import { getPlanPricing } from '@/lib/plan-pricing';
import { createPaymentSession } from '@/lib/flatpay-client';
import { recordConsent } from '@/lib/consent';
import { getCurrentTermsVersion } from '@/lib/legal';

/**
 * POST /api/subscription/create-payment
 *
 * Creates a Flatpay payment session for a paid subscription plan.
 * Called when the user clicks a paid plan (Månedlig / Pro / Business /
 * Business Extended) on the subscription plans prompt — AFTER they have
 * confirmed consent in the consent-confirmation dialog.
 *
 * Request body (FASE 6):
 *   {
 *     planId: 'monthly' | 'annual' | '2year' | '3year',
 *     agreedToTerms: boolean,   // REQUIRED — must be true
 *     consentVersion: string,   // REQUIRED — must match CURRENT_TERMS_VERSION
 *   }
 *
 * Response: { checkoutUrl, paymentId }
 *
 * The frontend redirects the user to `checkoutUrl` (Flatpay's hosted
 * checkout page). After payment, Flatpay redirects back to
 * /api/subscription/payment-callback and sends a webhook to
 * /api/subscription/payment-webhook. The plan is activated only after
 * a confirmed payment.
 *
 * FASE 6 — Consent validation:
 *   Before creating the payment session, we validate that the user has
 *   explicitly agreed to the terms (agreedToTerms === true) and that the
 *   consentVersion matches the current terms version. We then write a
 *   ConsentLog row linked to the resulting Payment — providing the legal
 *   evidence chain from consent → payment → plan activation that the bank
 *   and Card schemes require for recurring billing disputes.
 *
 * For the Free plan, use /api/trial/start instead (no payment needed).
 */
export const POST = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true },
  async (request: NextRequest, ctx) => {
    try {
      const body = await request.json().catch(() => ({}));
      const { planId, agreedToTerms, consentVersion } = body as {
        planId?: string;
        agreedToTerms?: boolean;
        consentVersion?: string;
      };

      if (!planId) {
        return NextResponse.json({ error: 'Missing: planId' }, { status: 400 });
      }

      // ── FASE 6: Consent validation ──────────────────────────────────
      // The user MUST have explicitly agreed to the terms before we create
      // a payment session. This is the legal anchor for recurring billing
      // under Forbrugeraftaleloven §18-19 and Betalingsloven §100-102.
      // Without this, the bank can refuse to settle disputed charges.
      if (!agreedToTerms) {
        return NextResponse.json(
          {
            error: 'Consent required. You must accept the terms before subscribing.',
            code: 'CONSENT_REQUIRED',
          },
          { status: 400 },
        );
      }

      const currentTermsVersion = getCurrentTermsVersion();
      if (!consentVersion || consentVersion !== currentTermsVersion) {
        return NextResponse.json(
          {
            error: 'Outdated or missing consent version. Please reload the page and try again.',
            code: 'CONSENT_VERSION_MISMATCH',
            expected: currentTermsVersion,
            received: consentVersion ?? null,
          },
          { status: 400 },
        );
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

      // The charge amount INCLUDES 25% Danish VAT (B2B standard: display excl., charge incl.)
      const chargeAmountOre = pricing.totalAmountInclVatOre;

      if (chargeAmountOre <= 0) {
        return NextResponse.json({ error: 'Invalid plan pricing' }, { status: 400 });
      }

      // Create a Payment row (status=pending)
      // amount = VAT-inclusive (the actual amount charged to the customer)
      const payment = await db.payment.create({
        data: {
          userId: ctx.id,
          companyId: ctx.activeCompanyId!,
          planTier,
          amount: chargeAmountOre,
          currency: 'DKK',
          bindingMonths,
          status: 'pending',
        },
      });

      // ── FASE 6: Record the consent, linked to this Payment ──────────
      // This creates the legal evidence chain: ConsentLog → Payment →
      // Company.planTier. The consent includes IP + user-agent for forensic
      // evidence in case of a later chargeback dispute.
      try {
        await recordConsent({
          userId: ctx.id,
          companyId: ctx.activeCompanyId!,
          consentType: 'RECURRING_BILLING',
          consentVersion,
          request,
          paymentId: payment.id,
        });
        // Also record Terms-of-Service consent at the same time (the user
        // accepted both in the same checkbox click)
        await recordConsent({
          userId: ctx.id,
          companyId: ctx.activeCompanyId!,
          consentType: 'TERMS_OF_SERVICE',
          consentVersion,
          request,
          paymentId: payment.id,
        });
      } catch (consentError) {
        // Critical — if we can't log consent, we can't legally charge.
        // Roll back the Payment row and refuse to create the session.
        logger.error('[CREATE PAYMENT] Failed to record consent — aborting payment session:', consentError);
        await db.payment.delete({ where: { id: payment.id } }).catch(() => {});
        return NextResponse.json(
          {
            error: 'Could not record consent. Please try again.',
            code: 'CONSENT_LOG_FAILED',
          },
          { status: 500 },
        );
      }

      // Build the URLs Frisbii needs.
      // - acceptUrl: the URL Frisbii redirects the user to on SUCCESS.
      //   This is our server-side callback that verifies the payment status
      //   via the Frisbii API, activates the plan, and redirects to the app.
      // - cancelUrl: the URL Frisbii redirects the user to on CANCEL.
      //   This is the SPA at /login with a payment=cancelled flag.
      //
      // Note: Frisbii webhooks are configured in the Frisbii admin UI
      // (https://app.frisbii.com), not passed in the API call. The webhook
      // URL should be: https://your-domain.com/api/subscription/payment-webhook
      const origin = request.nextUrl.origin;
      const acceptUrl = `${origin}/api/subscription/payment-callback?payment_id=${payment.id}`;
      const cancelUrl = `${origin}/login?payment=cancelled`;

      // Create the charge session with Frisbii (VAT-inclusive amount)
      const session = await createPaymentSession({
        paymentId: payment.id,
        amount: chargeAmountOre,
        currency: 'DKK',
        description: pricing.descriptionDa,
        acceptUrl,
        cancelUrl,
        customerEmail: ctx.email,
        customerHandle: `user-${ctx.id}`,
        // Use the active company name as the customer name (B2B context)
        customerFirstName: ctx.activeCompanyName || undefined,
        customerLastName: ctx.activeCompanyName || undefined,
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
          amount: { old: null, new: chargeAmountOre },
          flatpayPaymentId: { old: null, new: session.flatpayPaymentId },
          consentVersion: { old: null, new: consentVersion },
        },
        metadata: requestMetadata(request),
      });

      logger.info(
        `[SUBSCRIPTION] Payment session created for user ${ctx.email}, plan ${planTier}, amount ${chargeAmountOre} øre (incl. 25% VAT). Payment ID: ${payment.id}. Consent v${consentVersion} logged.`,
      );

      return NextResponse.json({
        checkoutUrl: session.checkoutUrl,
        // Frisbii charge session ID (cs_...) — used by the Overlay Checkout
        // JS SDK: new Reepay.ModalCheckout(sessionId)
        sessionId: session.flatpayPaymentId,
        paymentId: payment.id,
        planTier,
        amount: chargeAmountOre,
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
