/**
 * Instrumentation Hook — Node.js Runtime (Next.js 16)
 *
 * This file runs ONLY in the Node.js runtime — safe to use Node.js APIs
 * like fs, path, crypto, node-cron, prisma, etc. Next.js 16 recognises
 * the runtime-specific dot-notation (`instrumentation.node.ts`) and
 * loads it automatically at server boot, before any request is handled.
 *
 * The Edge runtime has no equivalent file — background services are not
 * started there, which is correct since they all require Node-only
 * modules (node-cron, fs, archiver, prisma).
 *
 * Background services started here:
 *  - Backup scheduler    (Danish Bookkeeping Act / Bogføringsloven §15)
 *  - Recurring scheduler (automatic recurring purchase/invoice execution)
 *
 * Both `startBackupScheduler()` and `startRecurringScheduler()` are
 * idempotent — guarded by an internal `_schedulerStarted` flag — so it
 * is safe if `ensureInitialBackup()` also calls `ensureSchedulerStarted()`
 * later on a tenant's first transaction. No duplicate cron tasks are
 * registered.
 *
 * Both can be disabled via env vars (useful for staging / debugging
 * Neon compute usage):
 *   - DISABLE_BACKUP_SCHEDULER=true
 *   - DISABLE_RECURRING_SCHEDULER=true
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

import { startBackupScheduler, stopBackupScheduler } from '@/lib/backup-scheduler';
import { startRecurringScheduler, stopRecurringScheduler } from '@/lib/recurring-scheduler';
import { logger } from '@/lib/logger';

export async function register(): Promise<void> {
  try {
    logger.info('[INSTRUMENTATION] Node.js runtime — initializing background services');
    startBackupScheduler();
    startRecurringScheduler();
  } catch (error) {
    // Never let instrumentation failure crash the server boot. Background
    // services are important but not critical to serving requests — the
    // app should still start and respond to users.
    logger.error('[INSTRUMENTATION] Failed to initialize background services:', error);
  }
}

export async function unregister(): Promise<void> {
  try {
    logger.info('[INSTRUMENTATION] Server shutting down — stopping background services');
    stopBackupScheduler();
    stopRecurringScheduler();
  } catch (error) {
    // Best-effort cleanup — never let unregister throw during shutdown.
    logger.error('[INSTRUMENTATION] Error during unregister:', error);
  }
}
