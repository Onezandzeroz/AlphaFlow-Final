/**
 * Plan activation helper (FASE 5 + FASE 6)
 *
 * Shared logic used by both the payment-callback and payment-webhook
 * handlers to activate a paid plan tier after a confirmed Flatpay payment.
 * Also used by the oversight subscription route when the App Owner
 * manually sets a plan tier.
 *
 * Idempotent: if the plan is already activated (or the payment already
 * processed), it's a no-op.
 *
 * FASE 6 ADDITION: After activation, sends the subscription-welcome + payment-
 * receipt emails. The lastReceiptSentAt field on Company prevents duplicate
 * receipts when both the callback and the webhook fire for the same payment
 * (which is the normal case — Frisbii sends both a redirect AND a webhook).
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getBindingMonths, PlanTier, getPlanFeatures, Feature } from '@/lib/plan-features';
import { getPlanPricing } from '@/lib/plan-pricing';
import { sendSubscriptionWelcomeEmail, sendPaymentReceiptEmail } from '@/lib/email-service';
import { generateSequentialInvoiceNumber } from '@/lib/invoice-number';
import { getCurrentTermsVersion } from '@/lib/legal';

/**
 * Ensure HermesAgent exists with enabled=true for Pro+ tiers.
 *
 * When a tenant upgrades to Pro, Business, or Business Extended, Hermes AI
 * is automatically made available (HermesAgent.enabled = true). The tenant
 * owner can then opt in to sharing accounting data via dataAccessEnabled.
 *
 * This is idempotent — if HermesAgent already exists with enabled=true,
 * it's a no-op. If it exists with enabled=false (SuperDev previously
 * disabled it), we DON'T override that — the SuperDev's manual disable
 * takes precedence.
 *
 * For tiers below Pro (Free, Månedlig), Hermes is not included in the
 * feature set, so we don't auto-enable it.
 */
export async function ensureHermesForTier(
  companyId: string,
  tier: PlanTier,
): Promise<void> {
  const features = getPlanFeatures(tier);
  if (!features.has(Feature.Hermes)) {
    // Tier doesn't include Hermes — don't auto-enable
    return;
  }

  try {
    // Check if HermesAgent already exists
    const existing = await db.hermesAgent.findUnique({
      where: { companyId },
      select: { enabled: true },
    });

    if (existing) {
      // Already exists — don't override a manual disable
      if (!existing.enabled) {
        logger.info(`[HERMES AUTO] HermesAgent exists but is disabled for ${companyId} — respecting manual disable`);
      }
      return;
    }

    // Create HermesAgent with enabled=true (auto-activated for Pro+)
    await db.hermesAgent.create({
      data: {
        companyId,
        enabled: true,
        // dataAccessEnabled stays false — the tenant owner must opt in
      },
    });

    logger.info(`[HERMES AUTO] HermesAgent auto-created (enabled=true) for company ${companyId} on tier ${tier}`);
  } catch (error) {
    // Non-critical — Hermes can be enabled manually later
    logger.warn(`[HERMES AUTO] Failed to auto-create HermesAgent for ${companyId}:`, error);
  }
}

/**
 * Activate the plan for a completed payment.
 *
 * Sets:
 *   - Payment.status = 'succeeded' + completedAt
 *   - Company.planTier + planPurchasedAt + planExpiresAt + planActivatedBy
 *   - Clears User.subscriptionRevokedAt for all company members
 *   - Sets User.trialClaimedAt (so the plan prompt doesn't show again)
 *   - Auto-creates HermesAgent (enabled=true) for Pro+ tiers
 *
 * @param paymentId  AlphaFlow's internal Payment.id
 * @param activatedByUserId  The user who triggered the activation (for audit)
 * @returns true if the plan was activated, false if already processed or not found
 */
export async function activatePlanAfterPayment(
  paymentId: string,
  activatedByUserId: string,
): Promise<boolean> {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { company: { select: { name: true, planTier: true, cvrNumber: true, address: true, email: true } } },
  });

  if (!payment) {
    logger.warn(`[ACTIVATE PLAN] Payment ${paymentId} not found`);
    return false;
  }

  // Idempotency: already processed
  if (payment.status === 'succeeded') {
    logger.info(`[ACTIVATE PLAN] Payment ${paymentId} already succeeded — skipping`);
    return true;
  }

  if (payment.status !== 'pending') {
    logger.warn(`[ACTIVATE PLAN] Payment ${paymentId} has status ${payment.status} — not activating`);
    return false;
  }

  // Mark payment as succeeded
  const now = new Date();
  await db.payment.update({
    where: { id: paymentId },
    data: {
      status: 'succeeded',
      completedAt: now,
    },
  });

  // Compute the binding expiry
  const bindingMonths = getBindingMonths(payment.planTier as PlanTier);
  const expiresAt = bindingMonths > 0
    ? new Date(now.getFullYear(), now.getMonth() + bindingMonths, now.getDate())
    : null;

  // Activate the plan on the company
  // FASE 6: also reset planStatus='active' (in case the plan was previously
  // cancelled/expired/past_due) and clear any cancellation markers. For the
  // monthly plan (no binding), set nextRenewalAt = +1 month so the billing
  // scheduler can send pre-renewal reminders.
  const nextRenewalAt = bindingMonths === 0
    ? new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())
    : expiresAt;

  await db.company.update({
    where: { id: payment.companyId },
    data: {
      planTier: payment.planTier,
      planPurchasedAt: now,
      planExpiresAt: expiresAt,
      planActivatedBy: activatedByUserId,
      // FASE 6 — lifecycle fields
      planStatus: 'active',
      planCancelledAt: null,
      planCancellationReason: null,
      nextRenewalAt,
      lastReminderSentAt: null, // reset so the new cycle's reminders can fire
      lastReceiptSentAt: now,   // we send the receipt below
    },
  });

  // Clear any previous revocation for all company members
  await db.user.updateMany({
    where: {
      companies: { some: { companyId: payment.companyId } },
      subscriptionRevokedAt: { not: null },
    },
    data: { subscriptionRevokedAt: null },
  });

  // Set trialClaimedAt on the purchasing user (so the plan prompt dismisses)
  await db.user.update({
    where: { id: payment.userId },
    data: { trialClaimedAt: now },
  });

  // Auto-create HermesAgent for Pro+ tiers
  await ensureHermesForTier(payment.companyId, payment.planTier as PlanTier);

  // ── FASE 6: send subscription-welcome + payment-receipt emails ──────
  // Fire-and-forget — email failures must NOT roll back the plan activation
  // (the customer has paid; access must be granted). Send failures are logged
  // to EmailLog with status='failed' for retry/audit.
  try {
    const pricing = getPlanPricing(payment.planTier as PlanTier);

    // VAT calculation: prices are exclusive of 25% Danish VAT (B2B standard)
    // payment.amount = the actual charged amount (VAT-inclusive)
    const totalChargedDKK = (payment.amount || pricing.totalAmountInclVatOre) / 100;
    const amountExclVat = totalChargedDKK / 1.25;
    const vatDKK = totalChargedDKK - amountExclVat;

    // Fetch the purchaser's email
    const purchaser = await db.user.findUnique({
      where: { id: payment.userId },
      select: { email: true },
    });

    if (purchaser?.email) {
      const appUrl = process.env.APP_URL || 'https://alphaflow.dk';
      const planName = pricing.descriptionDa;

      // (a) Welcome / confirmation email
      await sendSubscriptionWelcomeEmail(
        purchaser.email,
        {
          planName,
          monthlyPriceDKK: pricing.monthlyPriceDKK,
          bindingMonths,
          startDate: now.toISOString(),
          expiryDate: expiresAt?.toISOString() ?? null,
          termsVersion: getCurrentTermsVersion(),
          appUrl,
        },
        'da',
        payment.companyId,
      ).catch((e) => {
        logger.warn(`[ACTIVATE PLAN] Welcome email failed for ${purchaser.email}:`, e);
      });

      // Generate a sequential invoice number (e.g. AF-0001) and persist it
      let invoiceNumber: string | undefined;
      try {
        invoiceNumber = await generateSequentialInvoiceNumber();
        // Store the invoice number on the Payment record for audit
        await db.payment.update({
          where: { id: paymentId },
          data: { invoiceNumber },
        });
      } catch (invErr) {
        logger.warn(`[ACTIVATE PLAN] Failed to generate sequential invoice number for ${paymentId}:`, invErr);
        // Continue without sequential number — the PDF will fall back to a derived ID
      }

      // (d) Payment receipt email (with PDF invoice attachment)
      await sendPaymentReceiptEmail(
        purchaser.email,
        {
          planName,
          amountDKK: amountExclVat,
          vatDKK,
          totalDKK: totalChargedDKK,
          monthlyPriceDKK: pricing.monthlyPriceDKK,
          bindingMonths,
          paymentDate: now.toISOString(),
          paymentId: payment.id,
          invoiceNumber,
          cardLast4: null, // Frisbii payload may have this in metadata; left null for now
          period: bindingMonths > 0
            ? `${now.toLocaleDateString('da-DK')} – ${expiresAt!.toLocaleDateString('da-DK')}`
            : `${now.toLocaleDateString('da-DK')} – ${nextRenewalAt!.toLocaleDateString('da-DK')}`,
          isRenewal: false, // this is the initial purchase, not a renewal
          // Customer info for PDF invoice
          customerCompanyName: payment.company.name,
          customerEmail: purchaser.email,
          customerCvr: payment.company.cvrNumber || null,
          customerAddress: payment.company.address || null,
        },
        'da',
        payment.companyId,
      ).catch((e) => {
        logger.warn(`[ACTIVATE PLAN] Receipt email failed for ${purchaser.email}:`, e);
      });
    }
  } catch (emailError) {
    // Non-critical — log and continue. The plan IS activated; the customer
    // can always find their receipt in the dashboard.
    logger.warn(`[ACTIVATE PLAN] Email sending failed for payment ${paymentId}:`, emailError);
  }

  logger.info(
    `[ACTIVATE PLAN] Payment ${paymentId} succeeded — activated ${payment.planTier} for company ${payment.company.name}. Binding: ${bindingMonths} months.`,
  );

  return true;
}
