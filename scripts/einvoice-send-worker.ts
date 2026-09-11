/**
 * E-Invoice Send Worker — background poller (OPTIONAL)
 *
 * ──────────────────────────────────────────────────────────────────
 * STATUS: This worker is NO LONGER REQUIRED for normal operation.
 *
 * As of the latest update, the send-einvoice API route
 * (src/app/api/invoices/[id]/send-einvoice/route.ts) now transmits
 * to Storecove SYNCHRONOUSLY (inline) when the user clicks Send.
 * The PENDING row is created AND transmitted in the same request,
 * so the user sees DELIVERED/FAILED status immediately — no
 * background worker needed.
 *
 * This worker is kept as a FALLBACK for edge cases:
 *   - If a send was created but processEInvoiceSend() crashed before
 *     completing (e.g. server restart mid-request), the row stays
 *     PENDING. This worker picks it up.
 *   - If you want belt-and-suspenders reliability for production.
 *
 * USAGE (optional, only if you want the fallback):
 *   pm2 start "bun scripts/einvoice-send-worker.ts" --name alphaflow-einvoice-worker
 *
 * If you DON'T start it, sends still work — they just won't have a
 * safety net for interrupted transmissions.
 * ──────────────────────────────────────────────────────────────────
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
