/**
 * Instrumentation Hook (Next.js 16)
 *
 * Runs once per server lifecycle. We use the OFFICIAL single-file pattern with a
 * `process.env.NEXT_RUNTIME` guard plus dynamic imports, rather than a separate
 * `instrumentation.node.ts` file. Reasons:
 *
 *  1. The runtime-specific dot-notation file (`instrumentation.node.ts`) is not
 *     reliably recognised across Next.js 16 patch releases. Relying on it meant
 *     the backup scheduler sometimes never started at boot — it only started
 *     lazily on a tenant's first transaction, and was silent after a PM2 restart
 *     until the next write. The single-file + NEXT_RUNTIME pattern is the
 *     documented, stable convention and is guaranteed to run at boot.
 *
 *  2. Dynamic imports keep Node-only modules (node-cron, fs, archiver, prisma)
 *     out of the Edge runtime bundle, avoiding the webpack "Module not found"
 *     errors that previously forced the no-op split.
 *
 * Background services started here:
 *  - Backup scheduler   (Danish Bookkeeping Act / Bogføringsloven §15 compliance)
 *  - Recurring scheduler (automatic recurring purchase/invoice execution)
 *
 * Both `startBackupScheduler()` and `startRecurringScheduler()` are idempotent
 * (guarded by an internal `_schedulerStarted` flag), so it is safe if
 * `ensureInitialBackup()` also calls `ensureSchedulerStarted()` later on a
 * tenant's first transaction — no duplicate cron tasks are registered.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

export async function register(): Promise<void> {
  // Only run in the Node.js runtime. The Edge runtime cannot use fs, node-cron,
  // prisma, etc., so we skip background services there entirely.
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  // Dynamic import so Node-only modules are NOT statically pulled into the
  // Edge/instrumentation bundle (prevents webpack "Module not found" errors).
  const { logger } = await import('@/lib/logger');
  const { startBackupScheduler } = await import('@/lib/backup-scheduler');
  const { startRecurringScheduler } = await import('@/lib/recurring-scheduler');

  logger.info('[INSTRUMENTATION] Node.js runtime detected — initializing background services');
  startBackupScheduler();
  startRecurringScheduler();
}

export async function unregister(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  try {
    const { logger } = await import('@/lib/logger');
    const { stopBackupScheduler } = await import('@/lib/backup-scheduler');
    const { stopRecurringScheduler } = await import('@/lib/recurring-scheduler');

    logger.info('[INSTRUMENTATION] Server shutting down — stopping background services');
    stopBackupScheduler();
    stopRecurringScheduler();
  } catch (error) {
    // Best-effort cleanup — never let unregister throw during shutdown.
    console.error('[INSTRUMENTATION] Error during unregister:', error);
  }
}
