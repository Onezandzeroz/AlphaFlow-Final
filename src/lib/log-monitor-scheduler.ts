/**
 * Log Monitor Scheduler
 *
 * Runs the AuditLog security scan daily at 06:00 Europe/Copenhagen and
 * optionally e-mails critical/high alerts to the configured recipient.
 *
 * Started from `src/instrumentation.ts` alongside the backup, recurring
 * and billing schedulers. Follows the EXACT same pattern (idempotent
 * `_schedulerStarted` flag, node-cron `ScheduledTask[]` for graceful
 * shutdown, disabled via env var, startup catch-up run after a delay).
 *
 * Required by Danish Business Authority compliance review (Krav 18):
 *   "Hvor ofte gennemgås logs" — daily automated scan + weekly manual
 *   review by the SuperDev.
 *
 * Disabled via DISABLE_LOG_MONITOR_SCHEDULER=true env var.
 */

import cron, { type ScheduledTask } from 'node-cron';
import { logger } from '@/lib/logger';
import { scanAuditLogForAlerts, notifyAlertsViaEmail } from '@/lib/log-monitor';

// ─── State ────────────────────────────────────────────────────────────────

const scheduledTasks: ScheduledTask[] = [];
let _schedulerStarted = false;
// Timestamp the log-monitor scheduler was (re)started — used to suppress
// the daily digest email on the platform's start/restart day so frequent
// restarts during development don't spam the SuperDev. The first email is
// sent at the 06:00 check on the day AFTER the (re)start.
let _bootedAt: Date | null = null;

// ─── Boot-day helpers ─────────────────────────────────────────────────────

/**
 * Return the calendar date of `date` in Europe/Copenhagen as 'YYYY-MM-DD'.
 * Uses Intl.DateTimeFormat (DST-safe) so the comparison is always against
 * the Copenhagen calendar day — matching the 06:00 Europe/Copenhagen cron.
 */
function copenhagenDateKey(date: Date): string {
  // en-CA locale formats as 'YYYY-MM-DD' which is directly comparable as a
  // string (lexicographic order = chronological order for zero-padded dates).
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Copenhagen',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * True when `now` falls on the same Copenhagen calendar day as the scheduler
 * (re)start. Used to skip the daily digest email on the start/restart day.
 * Returns false if the boot timestamp is unknown (defensive: don't suppress
 * if we can't determine the boot day).
 */
function isBootDay(now: Date = new Date()): boolean {
  if (!_bootedAt) return false;
  return copenhagenDateKey(_bootedAt) === copenhagenDateKey(now);
}

/**
 * Run one scan cycle. Wrapped in try/catch so the cron schedule never
 * crashes the process. Returns the alerts found (for testing / manual
 * invocation via instrumentation).
 *
 * BEHAVIOUR:
 *   - Scans AuditLog for the last 24 hours (all tenants, no company filter).
 *   - Sends a daily digest email to ALERT_EMAIL_RECIPIENT, EXCEPT on the
 *     platform's start/restart day (see isBootDay). Skipping the email on
 *     the boot day prevents the startup catch-up run + the same-day 06:00
 *     cron from spamming the SuperDev during frequent dev restarts. The
 *     first email is sent at the 06:00 check on the day AFTER the (re)start.
 *     The scan still runs on the boot day (alerts are logged server-side);
 *     only the email is suppressed.
 *   - When sending (non-boot day):
 *     • If there are critical/high alerts → full alert table + details.
 *     • If there are NO critical/high alerts → "all nominal" email
 *       confirming no incidents were observed and the application is
 *       operating normally.
 *   - This ensures the SuperDev receives a daily status email every 24h
 *     (once past the boot day) regardless of whether incidents occurred,
 *     so they know the monitor is running and the system is healthy.
 */
export async function runLogMonitorCycle(): Promise<
  ReturnType<typeof scanAuditLogForAlerts>
> {
  const startedAt = new Date().toISOString();
  logger.info(`[LOG-MONITOR-SCHEDULER] Daily scan started at ${startedAt}`);

  try {
    const alerts = await scanAuditLogForAlerts({ sinceHours: 24 });

    const counts = {
      critical: alerts.filter((a) => a.severity === 'critical').length,
      high: alerts.filter((a) => a.severity === 'high').length,
      medium: alerts.filter((a) => a.severity === 'medium').length,
      low: alerts.filter((a) => a.severity === 'low').length,
    };

    logger.info(
      `[LOG-MONITOR-SCHEDULER] Scan complete: ${alerts.length} alert(s) ` +
        `(critical=${counts.critical}, high=${counts.high}, ` +
        `medium=${counts.medium}, low=${counts.low})`,
      alerts.map((a) => ({
        category: a.category,
        severity: a.severity,
        count: a.count,
      })),
    );

    // ── Boot-day suppression ──────────────────────────────────────
    // Skip the daily digest email when today is the platform's start/restart
    // day. Frequent restarts during development would otherwise spam the
    // SuperDev with one catch-up email per restart (plus the same-day 06:00
    // cron). The first email is sent at the 06:00 check on the day AFTER the
    // (re)start. The scan above still ran — alerts are logged server-side —
    // only the email is suppressed on the boot day.
    if (isBootDay()) {
      logger.info(
        '[LOG-MONITOR-SCHEDULER] Skipping daily digest email — today is the platform start/restart day. ' +
          'First email will be sent at the 06:00 check tomorrow.',
      );
      return alerts;
    }

    // Send the daily digest email — even if there are no alerts. This
    // ensures the SuperDev gets a "system nominal" confirmation every 24h
    // (once past the boot day), so they know the monitor is alive and running.
    // notifyAlertsViaEmail handles both cases (incidents vs. all clear).
    await notifyAlertsViaEmail(alerts);

    return alerts;
  } catch (error) {
    // Defensive: the scan function itself is try/catch'd, but we keep
    // this as a belt-and-braces safety net so the cron can never crash
    // the Next.js process.
    logger.error('[LOG-MONITOR-SCHEDULER] Uncaught error in scan cycle:', error);
    return [];
  }
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Start the log-monitor scheduler. Idempotent — safe to call multiple times.
 * Runs daily at 06:00 Europe/Copenhagen.
 *
 * Disabled via DISABLE_LOG_MONITOR_SCHEDULER=true env var (useful for tests/dev).
 */
export function startLogMonitorScheduler(): void {
  if (_schedulerStarted) return;
  if (process.env.DISABLE_LOG_MONITOR_SCHEDULER === 'true') {
    logger.info(
      '[LOG-MONITOR-SCHEDULER] Disabled by DISABLE_LOG_MONITOR_SCHEDULER env var',
    );
    return;
  }

  _schedulerStarted = true;
  _bootedAt = new Date();

  // Daily at 06:00 Europe/Copenhagen. 0 6 * * * = "at 06:00 every day".
  // Danish Business Authority (Erhvervsstyrelsen) requires documented log
  // review frequency — daily automated scan + weekly manual review.
  const task = cron.schedule(
    '0 6 * * *',
    () => {
      runLogMonitorCycle().catch((err) => {
        logger.error(
          '[LOG-MONITOR-SCHEDULER] Uncaught error in daily cycle:',
          err,
        );
      });
    },
    {
      timezone: 'Europe/Copenhagen',
    },
  );

  scheduledTasks.push(task);

  // Run once on startup (after a short delay so we don't block boot) — this
  // catches any alerts that were missed while the server was down. We use
  // a 60-second delay to avoid racing with Prisma client connection setup
  // and to defer to the higher-priority backup/billing schedulers.
  setTimeout(() => {
    runLogMonitorCycle().catch((err) => {
      logger.error('[LOG-MONITOR-SCHEDULER] Startup catch-up run failed:', err);
    });
  }, 60_000);

  logger.info(
    '[LOG-MONITOR-SCHEDULER] Started — daily at 06:00 Europe/Copenhagen. Catch-up run in 60s.',
  );
}

/**
 * Stop the log-monitor scheduler. Idempotent.
 */
export function stopLogMonitorScheduler(): void {
  if (!_schedulerStarted) return;
  _schedulerStarted = false;

  for (const task of scheduledTasks) {
    task.stop();
  }
  scheduledTasks.length = 0;

  logger.info('[LOG-MONITOR-SCHEDULER] Stopped');
}
