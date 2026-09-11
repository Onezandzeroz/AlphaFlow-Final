/**
 * E-Invoice Send Worker — background poller
 *
 * WHY THIS EXISTS
 * ───────────────
 * `queueEInvoiceSend()` (src/lib/einvoice-sender.ts) only creates a
 * PENDING `EInvoiceSending` row. The function that actually transmits
 * to Storecove — `processEInvoiceSend(sendingId)` — is never auto-
 * invoked by any cron or mini-service in the current codebase.
 *
 * This worker closes that gap: it polls for PENDING rows every few
 * seconds and transmits them. Run it as a background process (PM2
 * or `bun --hot`) alongside the Next.js app. Once running, the full
 * send → Storecove → webhook status flow works end-to-end from the
 * UI alone — no manual CLI trigger needed per send.
 *
 * USAGE
 * ─────
 *   # Foreground (testing / watching logs)
 *   bun scripts/einvoice-send-worker.ts
 *
 *   # PM2 (production / persistent)
 *   pm2 start "bun scripts/einvoice-send-worker.ts" --name alphaflow-einvoice-worker
 *   pm2 logs alphaflow-einvoice-worker
 *
 *   # Stop
 *   pm2 stop alphaflow-einvoice-worker
 *
 * PREREQUISITES
 * ─────────────
 *  - .env populated with STORECOVE_API_URL / STORECOVE_API_KEY /
 *    STORECOVE_WEBHOOK_SECRET (sandbox values) + DATABASE_URL
 *  - `bun install` has run (Prisma Client generated via postinstall)
 *
 * BEHAVIOUR
 * ─────────
 *  - Polls every POLL_INTERVAL_MS (default 5s) for PENDING sends.
 *  - Processes each found send sequentially (avoids concurrent
 *    Storecove API rate limits).
 *  - On failure, processEInvoiceSend() marks the row FAILED and
 *    increments retryCount; the row won't be picked up again until
 *    the user clicks "Forsøg igen" in the UI (which resets to PENDING).
 *  - Graceful shutdown on SIGINT/SIGTERM.
 *
 * NOTE: This is both a testing helper AND a production worker. In
 * production, run it under PM2 with restart policy. It replaces the
 * one-shot `scripts/process-einvoice-send.ts` for ongoing operation.
 */

import { db } from '../src/lib/db';
import { processEInvoiceSend } from '../src/lib/einvoice-sender';

// ─── Config ────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 5000; // 5 seconds
const SHUTDOWN_TIMEOUT_MS = 30000; // 30s graceful shutdown

// ─── State ─────────────────────────────────────────────────────────
let shuttingDown = false;
let processing = false;

// ─── Helpers ───────────────────────────────────────────────────────

function log(level: 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  const metaStr = meta ? ' ' + JSON.stringify(meta) : '';
  console[level === 'info' ? 'log' : level](`[einvoice-worker ${ts}] ${msg}${metaStr}`);
}

async function pollAndProcess(): Promise<void> {
  if (processing || shuttingDown) return;
  processing = true;

  try {
    // Find all PENDING sends, oldest first
    const pending = await db.eInvoiceSending.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, invoiceId: true, channel: true, companyId: true },
    });

    if (pending.length === 0) return;

    log('info', `Found ${pending.length} PENDING send(s), transmitting...`);

    for (const send of pending) {
      if (shuttingDown) break;

      try {
        log('info', `Transmitting ${send.id}`, {
          invoiceId: send.invoiceId,
          channel: send.channel,
        });
        await processEInvoiceSend(send.id);
        log('info', `Transmitted ${send.id} — status now DELIVERED (or FAILED)`);
      } catch (err) {
        // processEInvoiceSend already marks the row FAILED on error,
        // so this is just logging. The row won't be retried automatically.
        log('error', `Failed to transmit ${send.id}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    log('error', 'Poll cycle failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    processing = false;
  }
}

// ─── Main loop ─────────────────────────────────────────────────────

async function main() {
  // Safety: refuse to run without the API key (would silently simulate)
  if (!process.env.STORECOVE_API_KEY) {
    log('error', 'STORECOVE_API_KEY is not set in .env. Worker will not run.');
    log('error', 'Without it, processEInvoiceSend runs in SIMULATION mode and never calls the Storecove sandbox.');
    process.exit(1);
  }

  log('info', 'E-invoice send worker started', {
    pollInterval: `${POLL_INTERVAL_MS}ms`,
    storecoveApiUrl: process.env.STORECOVE_API_URL || 'https://api.storecove.com/v2 (default)',
  });

  // Immediate first poll, then interval
  await pollAndProcess();
  const interval = setInterval(pollAndProcess, POLL_INTERVAL_MS);

  // ─── Graceful shutdown ──────────────────────────────────────────
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log('info', `${signal} received, shutting down...`);

    clearInterval(interval);

    // Wait for in-flight processing to finish (with timeout)
    const start = Date.now();
    while (processing && Date.now() - start < SHUTDOWN_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, 500));
    }

    if (processing) {
      log('warn', 'Shutdown timeout reached, forcing exit (in-flight send may be incomplete)');
    }

    await db.$disconnect();
    log('info', 'Worker stopped');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  log('error', 'Fatal startup error', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
