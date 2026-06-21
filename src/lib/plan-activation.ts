/**
 * Plan activation helper (FASE 5)
 *
 * Shared logic used by both the payment-callback and payment-webhook
 * handlers to activate a paid plan tier after a confirmed Flatpay payment.
 *
 * Idempotent: if the plan is already activated (or the payment already
 * processed), it's a no-op.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getBindingMonths, type PlanTier } from '@/lib/plan-features';

/**
 * Activate the plan for a completed payment.
 *
 * Sets:
 *   - Payment.status = 'succeeded' + completedAt
 *   - Company.planTier + planPurchasedAt + planExpiresAt + planActivatedBy
 *   - Clears User.subscriptionRevokedAt for all company members
 *   - Sets User.trialClaimedAt (so the plan prompt doesn't show again)
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

  logger.info(
    `[ACTIVATE PLAN] Payment ${paymentId} succeeded — activated ${payment.planTier} for company ${payment.company.name}. Binding: ${bindingMonths} months.`,
  );

  return true;
}
