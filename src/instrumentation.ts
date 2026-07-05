/**
 * Instrumentation Hook — Base Entry Point (Next.js 16)
 *
 * WHY THIS FILE EXISTS:
 * Next.js 16.1's file detection regex is `^instrumentation\.(ts|tsx|js|jsx)$`.
 * This file is the canonical entry point that Next.js reliably loads at boot
 * in ALL runtimes. We guard the Node-only startup code with a runtime check
 * so it doesn't crash the Edge runtime.
 *
 * HISTORY: A previous `instrumentation.node.ts` file existed in this project,
 * based on the assumption that Next.js 16 supports a runtime-specific
 * `.node.ts` variant. It does NOT — the regex above does not match
 * `instrumentation.node.ts`, so that file was never loaded. This caused the
 * backup scheduler to not start at boot, missing backup windows until a user
 * manually visited the backup page (which triggered a lazy-start fallback).
 * The dead file has been removed; this is the sole instrumentation entry point.
 *
 * Background services started here (Node runtime only):
 *  - Backup scheduler    (Danish Bookkeeping Act / Bogføringsloven §15)
 *  - Recurring scheduler (automatic recurring purchase/invoice execution)
 *
 * Both are idempotent — guarded by internal `_schedulerStarted` flags — so
 * duplicate calls are safe.
 *
 * Both can be disabled via env vars:
 *   - DISABLE_BACKUP_SCHEDULER=true
 *   - DISABLE_RECURRING_SCHEDULER=true
 *
 * NOTE ON IMPORTS: ALL imports here are dynamic (inside register/unregister),
 * including `logger`. This is intentional — a static top-level import of
 * `logger` pulls `process.stderr` into the Edge instrumentation bundle,
 * triggering "Node.js API not supported in Edge Runtime" build warnings.
 * Dynamic imports after the NEXT_RUNTIME guard keep the Edge bundle clean.
 */

export async function register(): Promise<void> {
  // Only start background services in the Node.js runtime.
  // The Edge runtime cannot use node-cron, fs, prisma, etc.
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  try {
    // Dynamic imports — including logger — so Node-only modules are NOT
    // statically pulled into the Edge instrumentation bundle.
    const { logger } = await import('@/lib/logger');
    const { startBackupScheduler } = await import('@/lib/backup-scheduler');
    const { startRecurringScheduler } = await import('@/lib/recurring-scheduler');

    logger.info('[INSTRUMENTATION] Node.js runtime — initializing background services');
    startBackupScheduler();
    startRecurringScheduler();
    logger.info('[INSTRUMENTATION] Background services initialized successfully');
  } catch (error) {
    // Never let instrumentation failure crash the server boot. Background
    // services are important but not critical to serving requests — the
    // app should still start and respond to users.
    console.error('[INSTRUMENTATION] Failed to initialize background services:', error);
  }
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
