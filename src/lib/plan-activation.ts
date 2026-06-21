/**
 * Plan activation helper (FASE 5)
 *
 * Shared logic used by both the payment-callback and payment-webhook
 * handlers to activate a paid plan tier after a confirmed Flatpay payment.
 * Also used by the oversight subscription route when the App Owner
 * manually sets a plan tier.
 *
 * Idempotent: if the plan is already activated (or the payment already
 * processed), it's a no-op.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getBindingMonths, PlanTier, getPlanFeatures, Feature } from '@/lib/plan-features';

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
    include: { company: { select: { name: true, planTier: true } } },
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
  await db.company.update({
    where: { id: payment.companyId },
    data: {
      planTier: payment.planTier,
      planPurchasedAt: now,
      planExpiresAt: expiresAt,
      planActivatedBy: activatedByUserId,
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

  logger.info(
    `[ACTIVATE PLAN] Payment ${paymentId} succeeded — activated ${payment.planTier} for company ${payment.company.name}. Binding: ${bindingMonths} months.`,
  );

  return true;
}
