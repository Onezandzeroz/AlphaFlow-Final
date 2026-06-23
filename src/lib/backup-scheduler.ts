/**
 * Backup Scheduler for AlphaAi Accounting — v2 (Robust)
 *
 * Implements Danish Bookkeeping Law §15 compliance:
 * - Automated hourly/daily/weekly/monthly backups via cron
 * - First-data-triggered initial backup (fires when tenant first inputs data)
 * - Automatic retention cleanup per policy
 * - Per-tenant cron health monitoring (green/red light indicator)
 *
 * v2 Robustness improvements:
 * - DB-based CronExecution log: every cycle is persisted, survives restarts
 * - Startup catch-up: detects missed cron windows and runs them immediately
 * - Retry with exponential backoff: failed backups retry up to 3 times
 * - DB-based health: cron health survives server restarts
 * - Overlap guard: prevents concurrent runs of the same job type
 * - Graceful shutdown: running cycles complete before process exits
 *
 * Architecture:
 * - Scheduler starts on Next.js server boot (via instrumentation.ts)
 * - Iterates all active companies with data on each schedule tick
 * - Each tenant's cron health is tracked independently
 * - Per-company dedup: skips if a backup of the same type already exists
 *   within the last N minutes (prevents rapid re-runs in dev)
 */

import cron, { type ScheduledTask } from 'node-cron';
import { db } from '@/lib/db';
import { runAutomaticBackup, cleanupExpiredBackups, BackupType } from '@/lib/backup-engine';
import { logger } from '@/lib/logger';

// ─── In-memory dedup tracking ───────────────────────────────────────────────
// Prevents creating duplicate backups of the same type within a cooldown window
// for the same company. Key = `${companyId}:${backupType}`
const LAST_AUTO_BACKUP: Map<string, number> = new Map();

// Cooldown periods (ms) per backup type – avoids hammering disk during dev restarts
const COOLDOWN_MS: Record<BackupType, number> = {
  hourly:  30 * 60 * 1000,       // 30 minutes
  daily:   22 * 60 * 1000,       // 22 hours
  weekly:  6  * 24 * 60 * 1000,  // 6 days
  monthly: 28 * 24 * 60 * 1000,  // 28 days
  manual:  5 * 60 * 1000,        // 5 minutes
};

// Track which companies already received their first-data backup
// so we don't re-trigger on every subsequent write
const FIRST_BACKUP_DONE: Set<string> = new Set();

// ─── Per-Tenant Cron Health Monitoring ──────────────────────────────────────
// Each tenant (company) has its own set of cron health entries.
// Key = `${companyId}:${backupType}`

interface CronHealthEntry {
  type: BackupType;
  lastRunAt: string | null;
  lastStatus: 'success' | 'error' | 'never' | 'skipped';
  consecutiveErrors: number;
  errorMessage: string | null;
}

// Per-company health map: `${companyId}:${backupType}` → CronHealthEntry
const companyCronHealth: Map<string, CronHealthEntry> = new Map();

// Track which companies have been triggered by a first transaction
const TRIGGERED_COMPANIES: Set<string> = new Set();

// ─── Overlap guard ──────────────────────────────────────────────────────────
// Prevents concurrent runs of the same job type (e.g., two hourly backups
// running at the same time if the previous one is slow)
const runningJobs: Set<string> = new Set();

// ─── Retry with exponential backoff ─────────────────────────────────────────
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 5000;   // 5 seconds
const RETRY_MAX_MS = 60000;   // 1 minute

function getRetryDelay(attempt: number): number {
  return Math.min(RETRY_BASE_MS * Math.pow(2, attempt), RETRY_MAX_MS);
}

/**
 * Run a function with retry + exponential backoff.
 * Returns true if the function succeeded within MAX_RETRIES attempts.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = MAX_RETRIES,
): Promise<{ result: T | null; succeeded: boolean; attempts: number }> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return { result, succeeded: true, attempts: attempt + 1 };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        const delay = getRetryDelay(attempt);
        logger.warn(`[BACKUP-SCHEDULER] ${label} attempt ${attempt + 1} failed, retrying in ${delay}ms: ${lastError.message}`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  logger.error(`[BACKUP-SCHEDULER] ${label} failed after ${maxRetries + 1} attempts: ${lastError?.message}`);
  return { result: null, succeeded: false, attempts: maxRetries + 1 };
}

/**
 * Get or create a cron health entry for a specific company + backup type.
 * Lazily created on first access.
 */
function getCompanyHealthEntry(companyId: string, type: BackupType): CronHealthEntry {
  const key = `${companyId}:${type}`;
  let entry = companyCronHealth.get(key);
  if (!entry) {
    entry = {
      type,
      lastRunAt: null,
      lastStatus: 'never',
      consecutiveErrors: 0,
      errorMessage: null,
    };
    companyCronHealth.set(key, entry);
  }
  return entry;
}

/**
 * Mark a company as triggered by its first transaction.
 * This transitions the company from "idle" to "pending" state.
 */
function markCompanyTriggered(companyId: string): void {
  TRIGGERED_COMPANIES.add(companyId);
}

function updateCompanyCronHealthSuccess(companyId: string, type: BackupType): void {
  const entry = getCompanyHealthEntry(companyId, type);
  entry.lastRunAt = new Date().toISOString();
  entry.lastStatus = 'success';
  entry.consecutiveErrors = 0;
  entry.errorMessage = null;
}

function updateCompanyCronHealthError(companyId: string, type: BackupType, error: string): void {
  const entry = getCompanyHealthEntry(companyId, type);
  entry.lastRunAt = new Date().toISOString();
  entry.lastStatus = 'error';
  entry.consecutiveErrors += 1;
  entry.errorMessage = error;
}

function updateCompanyCronHealthSkipped(companyId: string, type: BackupType): void {
  const entry = getCompanyHealthEntry(companyId, type);
  entry.lastRunAt = new Date().toISOString();
  entry.lastStatus = 'skipped';
}

/**
 * Get the cron health status for a SPECIFIC tenant (company).
 *
 * Four states:
 * - idle:      No transaction has occurred yet for this tenant.
 * - pending:   First transaction triggered initial backups, still in progress.
 * - healthy:   At least one backup succeeded, no errors.
 * - unhealthy: Scheduler has errors for this tenant.
 */
export async function getCronHealth(companyId: string): Promise<{
  status: 'idle' | 'pending' | 'healthy' | 'unhealthy';
  entries: CronHealthEntry[];
  schedulerRunning: boolean;
  lastCheckedAt: string;
  summary: string;
}> {
  const schedulerRunning = scheduledTasks.length > 0;

  // Get or create entries for all backup types for this company
  const entries = SCHEDULES.map((s) => getCompanyHealthEntry(companyId, s.type));

  let hasError = false;
  let errorMessages: string[] = [];

  for (const entry of entries) {
    if (entry.lastStatus === 'error') {
      hasError = true;
      if (entry.errorMessage) errorMessages.push(`${entry.type}: ${entry.errorMessage}`);
    }
  }

  const anyBackupSucceeded = entries.some((e) => e.lastStatus === 'success');

  // Also check CronExecution DB for recent errors (survives restarts)
  const recentErrors = await db.cronExecution.count({
    where: {
      jobType: { startsWith: 'backup_' },
      companyId,
      status: 'error',
      startedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  }).catch(() => 0);

  if (recentErrors > 0 && !hasError) {
    hasError = true;
    errorMessages.push(`${recentErrors} error(s) in last 24h (from DB log)`);
  }

  // Check DB for existing completed automatic backups as the authoritative source
  // This survives server restarts and is independent of in-memory state.
  const existingBackups = await db.backup.count({
    where: { companyId, triggerType: 'automatic', status: 'completed' },
  }).catch(() => 0);

  // If DB has backups but in-memory doesn't know about this company,
  // restore the triggered state so cron health is consistent.
  if (existingBackups > 0 && !TRIGGERED_COMPANIES.has(companyId)) {
    markCompanyTriggered(companyId);
  }

  // Determine state — each tenant is evaluated independently
  let status: 'idle' | 'pending' | 'healthy' | 'unhealthy';
  let summary: string;

  if (!TRIGGERED_COMPANIES.has(companyId) && existingBackups === 0) {
    // This company has never had data or a backup — truly idle
    status = 'idle';
    summary = 'Waiting for first transaction';
  } else if (hasError) {
    status = 'unhealthy';
    summary = `${errorMessages.length} schedule(s) with errors`;
  } else if (!anyBackupSucceeded && existingBackups === 0) {
    // Triggered by transaction but backups still in progress
    status = 'pending';
    summary = 'Creating initial backups...';
  } else {
    status = 'healthy';
    summary = 'All schedules running normally';
  }

  return {
    status,
    entries,
    schedulerRunning,
    lastCheckedAt: new Date().toISOString(),
    summary,
  };
}

// ─── Cron expressions ───────────────────────────────────────────────────────
// These match the retention policy in backup-engine.ts

const SCHEDULES: { type: BackupType; cron: string; label: string; jobType: string }[] = [
  { type: 'hourly',  cron: '5 * * * *',       label: 'Hourly backup',  jobType: 'backup_hourly' },
  { type: 'daily',   cron: '15 2 * * *',       label: 'Daily backup',   jobType: 'backup_daily' },
  { type: 'weekly',  cron: '30 3 * * 1',       label: 'Weekly backup',  jobType: 'backup_weekly' },
  { type: 'monthly', cron: '0 4 1 * *',        label: 'Monthly backup', jobType: 'backup_monthly' },
];

// ─── Scheduled tasks (for cleanup on shutdown) ──────────────────────────────
const scheduledTasks: ScheduledTask[] = [];

/**
 * Get all active companies that have actual tenant data.
 * A company is considered to have data if it has any transactions,
 * journal entries, or invoices.
 */
async function getActiveCompaniesWithData(): Promise<{ userId: string; companyId: string }[]> {
  // Get distinct companies that have actual data, with one OWNER/ADMIN user per company
  // Using a subquery to pick the first matching user per company avoids duplicates
  const companiesWithData = await db.$queryRaw<Array<{ userId: string; companyId: string }>>`
    SELECT DISTINCT ON (uc."companyId") uc."userId", uc."companyId"
    FROM "UserCompany" uc
    JOIN "Company" c ON c.id = uc."companyId"
    WHERE (
      EXISTS (SELECT 1 FROM "Transaction" t WHERE t."companyId" = uc."companyId" AND t."cancelled" = false LIMIT 1)
      OR EXISTS (SELECT 1 FROM "JournalEntry" je WHERE je."companyId" = uc."companyId" LIMIT 1)
      OR EXISTS (SELECT 1 FROM "Invoice" i WHERE i."companyId" = uc."companyId" LIMIT 1)
    )
    AND uc."role" IN ('OWNER', 'ADMIN')
    ORDER BY uc."companyId", uc."joinedAt" ASC
  `;

  return companiesWithData;
}

// ─── DB Execution Logging ────────────────────────────────────────────────────

/**
 * Log a cron execution to the database.
 * This persists across server restarts and enables catch-up logic.
 */
async function logCronExecution(params: {
  jobType: string;
  companyId?: string;
  status: 'success' | 'error' | 'skipped' | 'partial';
  companiesTotal?: number;
  companiesSuccess?: number;
  companiesError?: number;
  companiesSkipped?: number;
  errorMessage?: string;
  startedAt: Date;
  catchup?: boolean;
}): Promise<void> {
  try {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - params.startedAt.getTime();
    await db.cronExecution.create({
      data: {
        jobType: params.jobType,
        companyId: params.companyId,
        status: params.status,
        companiesTotal: params.companiesTotal ?? 0,
        companiesSuccess: params.companiesSuccess ?? 0,
        companiesError: params.companiesError ?? 0,
        companiesSkipped: params.companiesSkipped ?? 0,
        errorMessage: params.errorMessage,
        startedAt: params.startedAt,
        finishedAt,
        durationMs,
        catchup: params.catchup ?? false,
      },
    });
  } catch (error) {
    // Don't let logging failures crash the scheduler
    logger.error('[BACKUP-SCHEDULER] Failed to log cron execution:', error);
  }
}

/**
 * Check if a cron job was missed while the server was down.
 * Returns true if the job should have run but didn't (no DB record exists).
 */
async function wasJobMissed(jobType: string, expectedIntervalMs: number): Promise<boolean> {
  try {
    const lastRun = await db.cronExecution.findFirst({
      where: { jobType, status: { in: ['success', 'partial'] } },
      orderBy: { startedAt: 'desc' },
    });

    if (!lastRun) {
      // Never ran before — only catch up if there are companies with data
      const companiesCount = await getActiveCompaniesWithData();
      return companiesCount.length > 0;
    }

    const timeSinceLastRun = Date.now() - lastRun.startedAt.getTime();
    return timeSinceLastRun > expectedIntervalMs * 1.5; // 50% grace period
  } catch (error) {
    logger.error(`[BACKUP-SCHEDULER] Failed to check if ${jobType} was missed:`, error);
    return false; // Don't run catch-up if we can't verify
  }
}

// Expected intervals for each backup type (for catch-up detection)
const EXPECTED_INTERVALS: Record<string, number> = {
  backup_hourly:  60 * 60 * 1000,          // 1 hour
  backup_daily:   24 * 60 * 60 * 1000,      // 24 hours
  backup_weekly:  7 * 24 * 60 * 60 * 1000,  // 7 days
  backup_monthly: 30 * 24 * 60 * 60 * 1000,  // 30 days
  backup_cleanup: 24 * 60 * 60 * 1000,      // 24 hours
  recurring_entries: 24 * 60 * 60 * 1000,   // 24 hours
};

/**
 * Run scheduled backups for all companies with data.
 * Updates per-company cron health independently.
 * Logs execution to DB for persistent tracking.
 *
 * @param backupType - The type of backup to create
 * @param bypassCooldown - If true, ignore cooldown checks (used on startup/catch-up)
 * @param isCatchup - If true, marks the execution as a catch-up run
 */
async function runScheduledBackupCycle(
  backupType: BackupType,
  bypassCooldown = false,
  isCatchup = false,
): Promise<void> {
  const jobType = `backup_${backupType}`;
  const startedAt = new Date();

  // Overlap guard: prevent concurrent runs of the same job type
  if (runningJobs.has(jobType)) {
    logger.warn(`[BACKUP-SCHEDULER] ${backupType} cycle already running — skipping this tick`);
    return;
  }
  runningJobs.add(jobType);

  try {
    const companies = await getActiveCompaniesWithData();

    if (companies.length === 0) {
      logger.debug(`[BACKUP-SCHEDULER] ${backupType} cycle: no companies with data found`);
      await logCronExecution({ jobType, status: 'skipped', startedAt, catchup: isCatchup });
      return;
    }

    let totalSuccess = 0;
    let totalSkip = 0;
    let totalError = 0;
    let firstError: string | null = null;

    for (const { userId, companyId } of companies) {
      // Dedup check: skip if we already backed up this company recently
      if (!bypassCooldown) {
        const key = `${companyId}:${backupType}`;
        const lastRun = LAST_AUTO_BACKUP.get(key) ?? 0;
        const cooldown = COOLDOWN_MS[backupType];

        if (Date.now() - lastRun < cooldown) {
          totalSkip++;
          continue;
        }
      }

      // Also skip if this company already has a completed backup of this type
      if (bypassCooldown) {
        const existingCount = await db.backup.count({
          where: { companyId, backupType, triggerType: 'automatic', status: 'completed' },
        });
        if (existingCount > 0) {
          totalSkip++;
          LAST_AUTO_BACKUP.set(`${companyId}:${backupType}`, Date.now());
          // Mark existing backups as success for this tenant's health
          updateCompanyCronHealthSuccess(companyId, backupType);
          continue;
        }
      }

      // Run backup with retry
      const { succeeded, attempts } = await withRetry(
        () => runAutomaticBackup(userId, companyId, backupType),
        `${backupType} backup for company ${companyId}`,
      );

      if (succeeded) {
        LAST_AUTO_BACKUP.set(`${companyId}:${backupType}`, Date.now());
        updateCompanyCronHealthSuccess(companyId, backupType);
        markCompanyTriggered(companyId);
        totalSuccess++;
        if (attempts > 1) {
          logger.info(`[BACKUP-SCHEDULER] ${backupType} backup for company ${companyId} succeeded after ${attempts} attempts`);
        }
      } else {
        const msg = `Failed after ${attempts} attempts`;
        updateCompanyCronHealthError(companyId, backupType, msg);
        totalError++;
        if (!firstError) firstError = msg;
      }
    }

    const status = totalError > 0 ? (totalSuccess > 0 ? 'partial' : 'error') : 'success';
    await logCronExecution({
      jobType,
      status,
      companiesTotal: companies.length,
      companiesSuccess: totalSuccess,
      companiesError: totalError,
      companiesSkipped: totalSkip,
      errorMessage: firstError,
      startedAt,
      catchup: isCatchup,
    });

    logger.info(
      `[BACKUP-SCHEDULER] ${backupType} cycle${isCatchup ? ' (catch-up)' : ''} complete: ${totalSuccess} backed up, ${totalSkip} skipped, ${totalError} errors`,
      { total: companies.length, success: totalSuccess, skipped: totalSkip, errors: totalError }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await logCronExecution({ jobType, status: 'error', errorMessage: msg, startedAt, catchup: isCatchup });
    logger.error(`[BACKUP-SCHEDULER] ${backupType} cycle error:`, error);
  } finally {
    runningJobs.delete(jobType);
  }
}

/**
 * Start all backup cron schedules.
 * Called once from instrumentation.ts on server startup.
 */
export function startBackupScheduler(): void {
  if (process.env.DISABLE_BACKUP_SCHEDULER === 'true') {
    logger.info('[BACKUP-SCHEDULER] Disabled via DISABLE_BACKUP_SCHEDULER env');
    return;
  }

  logger.info('[BACKUP-SCHEDULER] Starting backup automation (v2 robust)...');

  // Hydrate TRIGGERED_COMPANIES from database so companies with existing
  // backups are not incorrectly shown as "idle" after a server restart.
  hydrateTriggeredCompanies().catch((err) => {
    logger.error('[BACKUP-SCHEDULER] Failed to hydrate triggered companies:', err);
  });

  for (const { type, cron: cronExpr, label } of SCHEDULES) {
    if (!cron.validate(cronExpr)) {
      logger.error(`[BACKUP-SCHEDULER] Invalid cron expression for ${label}: ${cronExpr}`);
      continue;
    }

    const task = cron.schedule(cronExpr, () => {
      runScheduledBackupCycle(type);
    });

    scheduledTasks.push(task);
    logger.info(`[BACKUP-SCHEDULER] Scheduled "${label}" (${type}): ${cronExpr}`);
  }

  // Also run a full cleanup cycle daily at 03:00
  const cleanupTask = cron.schedule('0 3 * * *', async () => {
    const startedAt = new Date();
    if (runningJobs.has('backup_cleanup')) {
      logger.warn('[BACKUP-SCHEDULER] Cleanup already running — skipping');
      return;
    }
    runningJobs.add('backup_cleanup');
    try {
      const companies = await getActiveCompaniesWithData();
      let totalCleaned = 0;
      for (const { companyId } of companies) {
        const n = await cleanupExpiredBackups(companyId);
        totalCleaned += n;
      }
      if (totalCleaned > 0) {
        logger.info(`[BACKUP-SCHEDULER] Daily cleanup: removed ${totalCleaned} expired backups`);
      }
      await logCronExecution({
        jobType: 'backup_cleanup',
        status: 'success',
        companiesTotal: companies.length,
        companiesSuccess: companies.length,
        startedAt,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      await logCronExecution({ jobType: 'backup_cleanup', status: 'error', errorMessage: msg, startedAt });
      logger.error('[BACKUP-SCHEDULER] Daily cleanup error:', error);
    } finally {
      runningJobs.delete('backup_cleanup');
    }
  });
  scheduledTasks.push(cleanupTask);

  // ── Startup catch-up: detect and run missed cron windows ──────────────
  // After a server reboot or crash, some cron windows may have been missed.
  // This checks each schedule against the last DB execution log and runs
  // any missed jobs immediately.
  setTimeout(() => {
    runStartupCatchup();
  }, 10000); // 10-second delay to let DB connections warm up

  logger.info(`[BACKUP-SCHEDULER] Active with ${scheduledTasks.length} scheduled tasks`);
}

/**
 * On startup, check if any cron windows were missed while the server was down.
 * For each missed job, run it immediately as a catch-up.
 *
 * This is the KEY improvement that makes the scheduler robust across reboots:
 * - Server crashes at 02:00, daily backup was scheduled for 02:15
 * - Server restarts at 08:00
 * - detectMissedRuns() sees no backup_daily execution since >24h ago
 * - Runs the daily backup immediately as a catch-up
 */
async function runStartupCatchup(): Promise<void> {
  logger.info('[BACKUP-SCHEDULER] Checking for missed cron windows...');

  let catchupsRun = 0;
  for (const { type, jobType } of SCHEDULES) {
    const expectedInterval = EXPECTED_INTERVALS[jobType];
    if (!expectedInterval) continue;

    const missed = await wasJobMissed(jobType, expectedInterval);
    if (missed) {
      logger.info(`[BACKUP-SCHEDULER] Catch-up: ${type} backup was missed — running now`);
      await runScheduledBackupCycle(type, true, true); // bypassCooldown, isCatchup
      catchupsRun++;
    }
  }

  if (catchupsRun > 0) {
    logger.info(`[BACKUP-SCHEDULER] Startup catch-up complete: ${catchupsRun} missed job(s) executed`);
  } else {
    logger.info('[BACKUP-SCHEDULER] No missed cron windows detected');
  }
}

/**
 * Stop all backup cron schedules.
 * Called on server shutdown.
 */
export function stopBackupScheduler(): void {
  for (const task of scheduledTasks) {
    task.stop();
  }
  scheduledTasks.length = 0;
  logger.info('[BACKUP-SCHEDULER] Stopped all scheduled tasks');
}

/**
 * Ensure the first automatic backup is created for a company
 * after its first data input (transaction, journal entry, or invoice).
 *
 * This is the "first tenant transaction" trigger:
 * - Fire-and-forget (non-blocking)
 * - Deduplicated: only runs once per company per server lifetime
 * - Creates ALL backup types (hourly, daily, weekly, monthly) as the initial baseline
 * - Also ensures the cron scheduler is started if not already running
 * - Updates per-company cron health independently
 * - Retries each backup type up to MAX_RETRIES times
 *
 * Call this from data-mutating API routes (POST /transactions,
 * POST /journal-entries, POST /invoices, etc.)
 */
export function ensureInitialBackup(companyId: string, userId: string): void {
  if (FIRST_BACKUP_DONE.has(companyId)) {
    return;
  }
  FIRST_BACKUP_DONE.add(companyId);

  // Mark THIS specific company as triggered (idle → pending)
  markCompanyTriggered(companyId);

  // Ensure the global cron scheduler is running
  ensureSchedulerStarted();

  // Fire-and-forget — don't block the API response
  setImmediate(async () => {
    try {
      const [txCount, jeCount, invCount] = await Promise.all([
        db.transaction.count({ where: { companyId, cancelled: false } }),
        db.journalEntry.count({ where: { companyId } }),
        db.invoice.count({ where: { companyId } }),
      ]);

      if (txCount + jeCount + invCount === 0) {
        logger.debug(`[BACKUP-SCHEDULER] Company ${companyId} has no data yet, skipping initial backup`);
        return;
      }

      logger.info(`[BACKUP-SCHEDULER] First data detected for company ${companyId} — creating initial backups (all types)`);
      let successCount = 0;
      for (const type of ['hourly', 'daily', 'weekly', 'monthly'] as BackupType[]) {
        try {
          const existingType = await db.backup.count({
            where: { companyId, backupType: type, triggerType: 'automatic', status: 'completed' },
          });
          if (existingType > 0) {
            logger.debug(`[BACKUP-SCHEDULER] Company ${companyId} already has ${type} backup, skipping`);
            LAST_AUTO_BACKUP.set(`${companyId}:${type}`, Date.now());
            updateCompanyCronHealthSuccess(companyId, type);
            successCount++;
            continue;
          }

          // Run with retry for initial backup
          const { succeeded, attempts } = await withRetry(
            () => runAutomaticBackup(userId, companyId, type),
            `Initial ${type} backup for company ${companyId}`,
          );

          if (succeeded) {
            LAST_AUTO_BACKUP.set(`${companyId}:${type}`, Date.now());
            updateCompanyCronHealthSuccess(companyId, type);
            successCount++;
            logger.info(`[BACKUP-SCHEDULER] Initial ${type} backup succeeded for company ${companyId}${attempts > 1 ? ` (after ${attempts} attempts)` : ''}`);
          } else {
            updateCompanyCronHealthError(companyId, type, `Failed after ${attempts} attempts`);
            logger.error(`[BACKUP-SCHEDULER] Initial ${type} backup failed for company ${companyId} after ${attempts} attempts`);
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          updateCompanyCronHealthError(companyId, type, msg);
          logger.error(`[BACKUP-SCHEDULER] Initial ${type} backup failed for company ${companyId}:`, error);
        }
      }
      logger.info(`[BACKUP-SCHEDULER] Initial backups complete for company ${companyId}: ${successCount}/4 succeeded`);
    } catch (error) {
      logger.error(`[BACKUP-SCHEDULER] Initial backup failed for company ${companyId}:`, error);
    }
  });
}

/**
 * Get the current scheduler status for display in the UI.
 */
export function getSchedulerStatus(): {
  running: boolean;
  tasksCount: number;
  firstBackupCompanies: number;
  schedules: { type: BackupType; cron: string; label: string; humanReadable: string }[];
} {
  return {
    running: scheduledTasks.length > 0,
    tasksCount: scheduledTasks.length,
    firstBackupCompanies: FIRST_BACKUP_DONE.size,
    schedules: SCHEDULES.map((s) => {
      let humanReadable: string;
      switch (s.type) {
        case 'hourly':  humanReadable = 'Hver time (minut 5)'; break;
        case 'daily':   humanReadable = 'Daglig kl. 02:15'; break;
        case 'weekly':  humanReadable = 'Ugentlig (mandag kl. 03:30)'; break;
        case 'monthly': humanReadable = 'Månedlig (1. kl. 04:00)'; break;
        default:        humanReadable = s.type; break;
      }
      return { ...s, humanReadable };
    }),
  };
}

/**
 * Hydrate TRIGGERED_COMPANIES from the database.
 * Queries for all companies that have at least one completed automatic backup.
 * This ensures that after server restarts, existing tenants with backup history
 * are not incorrectly reported as "idle" (waiting for first transaction).
 */
async function hydrateTriggeredCompanies(): Promise<void> {
  try {
    const companiesWithBackups = await db.backup.findMany({
      where: { triggerType: 'automatic', status: 'completed' },
      select: { companyId: true },
      distinct: ['companyId'],
    });
    for (const { companyId } of companiesWithBackups) {
      TRIGGERED_COMPANIES.add(companyId);
    }
    logger.info(
      `[BACKUP-SCHEDULER] Hydrated ${companiesWithBackups.length} companies with existing backups into triggered state`,
    );
  } catch (error) {
    logger.error('[BACKUP-SCHEDULER] hydrateTriggeredCompanies error:', error);
  }
}

// ─── Lazy-start singleton ─────────────────────────────────────────────────
let _schedulerStarted = false;

/**
 * Ensure the backup scheduler has been started.
 * Safe to call multiple times — only starts once.
 * Used by ensureInitialBackup as a fallback when instrumentation isn't available.
 */
export function ensureSchedulerStarted(): void {
  if (_schedulerStarted) return;
  if (process.env.DISABLE_BACKUP_SCHEDULER === 'true') return;
  _schedulerStarted = true;
  startBackupScheduler();
}
