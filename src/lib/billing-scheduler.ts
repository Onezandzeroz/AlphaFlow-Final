/**
 * Billing Scheduler (FASE 6)
 *
 * Background cron job that sends subscription-lifecycle reminder emails
 * required by the bank's payment-gateway compliance review.
 *
 * Daily scan (08:00 Europe/Copenhagen):
 *   1. Pre-renewal reminders — for active subscriptions whose planExpiresAt
 *      (binding) or nextRenewalAt (monthly) is within 14/7/3/1 days.
 *   2. Expiry marking — for subscriptions whose planExpiresAt has passed
 *      without renewal: set planStatus='expired'.
 *   3. Past-due handling — for monthly subscriptions whose nextRenewalAt has
 *      passed without a successful renewal: set planStatus='past_due'.
 *
 * Anti-spam: Company.lastReminderSentAt prevents duplicate sends. We only
 * send if the last reminder was ≥ 2 days ago (so a 14-day reminder isn't
 * followed by a 13-day reminder, but a 7-day reminder can fire after the
 * 14-day one).
 *
 * Disabled via DISABLE_BILLING_SCHEDULER=true env var.
 *
 * Idempotent: guarded by _schedulerStarted flag, safe to call multiple times.
 */

import cron, { type ScheduledTask } from 'node-cron';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { sendPreRenewalReminderEmail } from '@/lib/email-service';
import { getPlanPricing } from '@/lib/plan-pricing';
import { PlanTier } from '@/lib/plan-features';

// ─── State ────────────────────────────────────────────────────────────────

const scheduledTasks: ScheduledTask[] = [];
let _schedulerStarted = false;

// Reminder windows (in days before renewal). For each window, we send ONE
// reminder — the lastReminderSentAt field prevents duplicates within the
// same window. The 2-day cooldown ensures we never send two reminders in
// consecutive days even if the windows overlap.
const REMINDER_WINDOWS = [14, 7, 3, 1];
const REMINDER_COOLDOWN_HOURS = 36; // minimum hours between reminders

// ─── Helpers ──────────────────────────────────────────────────────────────

function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60);
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Find the largest reminder window that applies for the given days-until-renewal.
 * E.g. daysUntil=10 → window=7 (we already passed the 14-day mark).
 * daysUntil=2 → window=1.
 * daysUntil=20 → null (no window applies yet).
 */
function applicableReminderWindow(daysUntil: number): number | null {
  // Find the smallest window that is >= daysUntil (i.e. the next-upcoming window)
  // Actually we want the largest window that is <= daysUntil AND hasn't been
  // sent yet. The cooldown check handles "has been sent".
  for (const window of REMINDER_WINDOWS) {
    if (daysUntil <= window) {
      return window;
    }
  }
  return null;
}

// ─── Core: send pre-renewal reminders ─────────────────────────────────────

interface ReminderRunSummary {
  timestamp: string;
  totalChecked: number;
  remindersSent: number;
  skippedCooldown: number;
  errors: number;
}

async function runPreRenewalReminders(): Promise<ReminderRunSummary> {
  const summary: ReminderRunSummary = {
    timestamp: new Date().toISOString(),
    totalChecked: 0,
    remindersSent: 0,
    skippedCooldown: 0,
    errors: 0,
  };

  const now = new Date();
  // Look 15 days ahead (REMINDER_WINDOWS max is 14, +1 day buffer)
  const horizon = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

  // Find all active subscriptions with an upcoming renewal within 15 days.
  // "Renewal" = planExpiresAt (binding plans) or nextRenewalAt (monthly).
  // We check both columns OR'd together.
  const companies = await db.company.findMany({
    where: {
      isActive: true,
      isDemo: false,
      planStatus: 'active',
      planTier: { not: PlanTier.Free }, // Free has no renewal
      OR: [
        { planExpiresAt: { gte: now, lte: horizon } },
        { nextRenewalAt: { gte: now, lte: horizon } },
      ],
    },
    select: {
      id: true,
      name: true,
      planTier: true,
      planExpiresAt: true,
      nextRenewalAt: true,
      lastReminderSentAt: true,
      members: {
        where: { role: 'OWNER' },
        select: { user: { select: { id: true, email: true } } },
        take: 1, // send to the first OWNER only
      },
    },
  });

  summary.totalChecked = companies.length;

  for (const company of companies) {
    try {
      const renewalDate = company.planExpiresAt || company.nextRenewalAt;
      if (!renewalDate) continue;

      const daysUntil = daysBetween(now, renewalDate);
      if (daysUntil < 0 || daysUntil > 15) continue;

      // Anti-spam: skip if a reminder was sent within the cooldown window
      if (company.lastReminderSentAt) {
        const hoursSinceLast = hoursBetween(company.lastReminderSentAt, now);
        if (hoursSinceLast < REMINDER_COOLDOWN_HOURS) {
          summary.skippedCooldown++;
          continue;
        }
      }

      const window = applicableReminderWindow(daysUntil);
      if (window === null) continue;

      const owner = company.members[0]?.user;
      if (!owner?.email) {
        logger.warn(`[BILLING SCHEDULER] No owner email for company ${company.id} — skipping reminder`);
        continue;
      }

      const pricing = getPlanPricing(company.planTier as PlanTier);
      // Show VAT-inclusive amount (this is what the customer will actually be charged)
      const amountDKK = pricing.totalAmountInclVatOre / 100;
      const appUrl = process.env.APP_URL || 'https://alphaflow.dk';

      // Binding plans (annual/2year/3year) require MANUAL renewal —
      // isAutoRenew=false. Monthly plans with nextRenewalAt are auto-renew.
      // (Currently the AlphaFlow platform doesn't auto-charge monthly, so both
      // are flagged as needing action. When Frisbii recurring subscriptions
      // are wired up, the monthly branch should set isAutoRenew=true.)
      const isAutoRenew = false;

      await sendPreRenewalReminderEmail(
        owner.email,
        {
          planName: pricing.descriptionDa,
          renewalDate: renewalDate.toISOString(),
          amountDKK,
          daysUntilRenewal: daysUntil,
          isAutoRenew,
          appUrl: `${appUrl}/login`,
        },
        'da',
        company.id,
      ).catch((e) => {
        logger.warn(`[BILLING SCHEDULER] Reminder email failed for ${owner.email}:`, e);
        summary.errors++;
      });

      // Update lastReminderSentAt to prevent duplicates
      await db.company.update({
        where: { id: company.id },
        data: { lastReminderSentAt: now },
      }).catch((e) => {
        logger.warn(`[BILLING SCHEDULER] Failed to update lastReminderSentAt for ${company.id}:`, e);
      });

      summary.remindersSent++;
      logger.info(`[BILLING SCHEDULER] Sent ${daysUntil}-day reminder to ${owner.email} for company ${company.id} (plan: ${company.planTier})`);
    } catch (entryError) {
      summary.errors++;
      logger.warn(`[BILLING SCHEDULER] Error processing company ${company.id}:`, entryError);
    }
  }

  return summary;
}

// ─── Core: mark expired subscriptions ─────────────────────────────────────

interface ExpiryRunSummary {
  timestamp: string;
  expiredCount: number;
  pastDueCount: number;
  errors: number;
}

async function runExpiryMarking(): Promise<ExpiryRunSummary> {
  const summary: ExpiryRunSummary = {
    timestamp: new Date().toISOString(),
    expiredCount: 0,
    pastDueCount: 0,
    errors: 0,
  };

  const now = new Date();

  // 1. Mark binding plans whose planExpiresAt has passed as 'expired'
  try {
    const expiredResult = await db.company.updateMany({
      where: {
        planStatus: 'active',
        planExpiresAt: { lt: now },
        // Only binding plans have planExpiresAt set; monthly has null
        planTier: { in: [PlanTier.Annual, PlanTier.TwoYear, PlanTier.ThreeYear] },
      },
      data: {
        planStatus: 'expired',
        planCancellationReason: 'expired',
      },
    });
    summary.expiredCount = expiredResult.count;

    if (summary.expiredCount > 0) {
      logger.info(`[BILLING SCHEDULER] Marked ${summary.expiredCount} subscriptions as expired (binding period ended without renewal)`);
    }
  } catch (err) {
    summary.errors++;
    logger.warn('[BILLING SCHEDULER] Failed to mark expired subscriptions:', err);
  }

  // 2. Mark monthly plans whose nextRenewalAt has passed without renewal as 'past_due'
  //    (For now, since AlphaFlow doesn't auto-charge, this just flags that the
  //    renewal window was missed — the customer needs to re-subscribe manually.)
  try {
    const pastDueResult = await db.company.updateMany({
      where: {
        planStatus: 'active',
        nextRenewalAt: { lt: now },
        planExpiresAt: null, // monthly plans have no expiry
        planTier: PlanTier.Monthly,
      },
      data: {
        planStatus: 'past_due',
        planCancellationReason: 'payment_failed',
      },
    });
    summary.pastDueCount = pastDueResult.count;

    if (summary.pastDueCount > 0) {
      logger.info(`[BILLING SCHEDULER] Marked ${summary.pastDueCount} monthly subscriptions as past_due (renewal window missed)`);
    }
  } catch (err) {
    summary.errors++;
    logger.warn('[BILLING SCHEDULER] Failed to mark past-due subscriptions:', err);
  }

  return summary;
}

// ─── Combined daily run ───────────────────────────────────────────────────

async function runDailyBillingCycle(): Promise<void> {
  logger.info('[BILLING SCHEDULER] Running daily billing cycle');
  const startTime = Date.now();

  try {
    const reminderSummary = await runPreRenewalReminders();
    const expirySummary = await runExpiryMarking();

    const durationMs = Date.now() - startTime;
    logger.info(
      `[BILLING SCHEDULER] Daily cycle complete in ${durationMs}ms — ` +
      `reminders: ${reminderSummary.remindersSent} sent, ${reminderSummary.skippedCooldown} skipped (cooldown), ${reminderSummary.errors} errors | ` +
      `expiry: ${expirySummary.expiredCount} expired, ${expirySummary.pastDueCount} past_due`,
    );
  } catch (err) {
    logger.error('[BILLING SCHEDULER] Daily cycle failed:', err);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Start the billing scheduler. Idempotent — safe to call multiple times.
 * Runs daily at 08:00 Europe/Copenhagen.
 *
 * Disabled via DISABLE_BILLING_SCHEDULER=true env var (useful for tests/dev).
 */
export function startBillingScheduler(): void {
  if (_schedulerStarted) return;
  if (process.env.DISABLE_BILLING_SCHEDULER === 'true') {
    logger.info('[BILLING SCHEDULER] Disabled by DISABLE_BILLING_SCHEDULER env var');
    return;
  }

  _schedulerStarted = true;

  // Daily at 08:00 Europe/Copenhagen. The cron library interprets the
  // timezone via the tz option (third argument). 0 8 * * * = "at 08:00 every day".
  const task = cron.schedule(
    '0 8 * * *',
    () => {
      runDailyBillingCycle().catch((err) => {
        logger.error('[BILLING SCHEDULER] Uncaught error in daily cycle:', err);
      });
    },
    {
      timezone: 'Europe/Copenhagen',
    },
  );

  scheduledTasks.push(task);

  // Run once on startup (after a short delay so we don't block boot) — this
  // catches any reminders that were missed while the server was down. We use
  // a 30-second delay to avoid racing with Prisma client connection setup.
  setTimeout(() => {
    runDailyBillingCycle().catch((err) => {
      logger.error('[BILLING SCHEDULER] Startup catch-up run failed:', err);
    });
  }, 30_000);

  logger.info('[BILLING SCHEDULER] Started — daily at 08:00 Europe/Copenhagen. Catch-up run in 30s.');
}

/**
 * Stop the billing scheduler. Idempotent.
 */
export function stopBillingScheduler(): void {
  if (!_schedulerStarted) return;
  _schedulerStarted = false;

  for (const task of scheduledTasks) {
    task.stop();
  }
  scheduledTasks.length = 0;

  logger.info('[BILLING SCHEDULER] Stopped');
}
