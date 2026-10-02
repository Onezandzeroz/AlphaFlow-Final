/**
 * Bank Connection Auto-Sync Scheduler
 *
 * Polls BankConnection rows where nextSyncAt <= now AND status = 'ACTIVE'
 * and triggers performSync for each. Designed to run as a cron job
 * (e.g. via node-cron or PM2 ecosystem).
 *
 * The scheduler ensures that bank transactions are automatically fetched
 * for connections that have:
 *   - status = 'ACTIVE' (Tink OAuth consent completed)
 *   - syncFrequency != 'manual' (user hasn't opted out)
 *   - nextSyncAt <= current time (scheduled time has arrived)
 *
 * Usage:
 *   Can be called from a cron route, or imported and called directly.
 *   The scheduler uses a system user ID for audit logging.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

const SYSTEM_USER_ID = 'system-bank-sync-scheduler';

/**
 * Run one cycle of the auto-sync scheduler.
 * Finds all active bank connections with nextSyncAt <= now and syncs them.
 *
 * This function is idempotent — if called multiple times in quick succession,
 * the nextSyncAt update prevents duplicate syncs.
 *
 * @returns Number of connections synced
 */
export async function runBankSyncCycle(): Promise<number> {
  const now = new Date();

  // Find all connections that are due for sync
  const dueConnections = await db.bankConnection.findMany({
    where: {
      status: 'ACTIVE',
      nextSyncAt: { lte: now },
      syncFrequency: { not: 'manual' },
    },
    select: {
      id: true,
      companyId: true,
      syncFrequency: true,
      bankName: true,
    },
  });

  if (dueConnections.length === 0) {
    return 0;
  }

  logger.info(
    `[BankSyncScheduler] Found ${dueConnections.length} connection(s) due for sync`,
  );

  let syncedCount = 0;

  for (const conn of dueConnections) {
    try {
      // Dynamically import to avoid circular dependency
      const { performSync } = await import('@/app/api/bank-connections/route');

      logger.info(
        `[BankSyncScheduler] Syncing ${conn.bankName} (conn=${conn.id}, company=${conn.companyId})`,
      );

      // Set nextSyncAt to null BEFORE sync to prevent duplicate runs
      // if the scheduler fires again while sync is in progress
      const nextSyncAt = calculateNextSync(conn.syncFrequency);
      await db.bankConnection.update({
        where: { id: conn.id },
        data: { nextSyncAt },
      });

      await performSync(conn.id, SYSTEM_USER_ID);
      syncedCount++;
    } catch (error) {
      logger.error(
        `[BankSyncScheduler] Sync failed for ${conn.bankName} (conn=${conn.id}):`,
        error,
      );

      // On failure, set nextSyncAt to retry in 1 hour
      const retryAt = new Date();
      retryAt.setHours(retryAt.getHours() + 1);
      await db.bankConnection.update({
        where: { id: conn.id },
        data: { nextSyncAt: retryAt },
      }).catch(() => {});
    }
  }

  logger.info(
    `[BankSyncScheduler] Cycle complete: ${syncedCount}/${dueConnections.length} synced successfully`,
  );

  return syncedCount;
}

/**
 * Calculate the next sync time based on frequency.
 */
function calculateNextSync(frequency: string): Date {
  const next = new Date();
  if (frequency === 'hourly') {
    next.setHours(next.getHours() + 1);
  } else if (frequency === 'daily') {
    next.setDate(next.getDate() + 1);
    next.setHours(6, 0, 0, 0); // 6 AM next day
  } else {
    // Default: daily at 6 AM
    next.setDate(next.getDate() + 1);
    next.setHours(6, 0, 0, 0);
  }
  return next;
}
