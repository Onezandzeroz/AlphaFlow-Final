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

/**
 * Run one scan cycle. Wrapped in try/catch so the cron schedule never
 * crashes the process. Returns the alerts found (for testing / manual
 * invocation via instrumentation).
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

    // E-mail critical + high alerts (no-op if ALERT_EMAIL_RECIPIENT is unset)
    if (counts.critical > 0 || counts.high > 0) {
      await notifyAlertsViaEmail(alerts);
    }

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
