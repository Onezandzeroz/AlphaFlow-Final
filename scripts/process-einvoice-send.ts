/**
 * Manual e-invoice send worker (Sandbox / testing helper)
 *
 * WHY THIS EXISTS
 * ───────────────
 * `queueEInvoiceSend()` (src/lib/einvoice-sender.ts) only creates an
 * `EInvoiceSending` row with status `PENDING`. The function that actually
 * transmits the invoice to Storecove — `processEInvoiceSend(sendingId)` —
 * is NOT invoked by any cron job or mini-service worker in the current
 * codebase. The design intent (see comment at einvoice-sender.ts:459)
 * was for a worker to pick up PENDING rows, but that worker was never built.
 *
 * In production this gap will be filled by a real worker. For SANDBOX
 * TESTING against the Storecove test network, this script lets you
 * manually trigger transmission of a single queued send so the full
 * send → Storecove → Peppol test-network → webhook status flow can be
 * exercised end-to-end.
 *
 * USAGE
 * ─────
 *   bun scripts/process-einvoice-send.ts <sendingId>
 *
 * PREREQUISITES
 * ─────────────
 *  - .env populated with STORECOVE_API_URL / STORECOVE_API_KEY /
 *    STORECOVE_WEBHOOK_SECRET (sandbox values) + DATABASE_URL
 *  - `bun install` has run (Prisma Client generated via postinstall)
 *  - A PENDING EInvoiceSending row exists (created by POST
 *    /api/invoices/[id]/send-einvoice from the Send e-faktura dialog)
 *
 * WHAT IT DOES
 * ────────────
 *  1. Loads env vars (Bun auto-loads .env).
 *  2. Calls processEInvoiceSend(sendingId), which:
 *       - generates the OIOUBL/Peppol BIS XML,
 *       - submits it to Storecove via POST /invoice_submissions,
 *       - stores storecoveSubmissionId / storecoveStorecoveId,
 *       - sets status DELIVERED (or FAILED on error),
 *       - flips the Invoice from DRAFT → SENT on success.
 *  3. Prints the resulting EInvoiceSending row and exits.
 *
 * After running, open the invoice's "Afsendelseshistorik" / "Send history"
 * dialog in the UI to see the DELIVERED status and Storecove submission ID.
 * Further status changes (ACCEPTED / REJECTED) arrive asynchronously via
 * the Storecove webhook (POST /api/storecove/webhook).
 *
 * NOTE: This is a testing helper, not a production worker. A production
 * deployment should replace this with a scheduled worker (PM2 cron /
 * systemd timer / BullMQ) that polls for PENDING rows and calls
 * processEInvoiceSend() with backoff and concurrency control.
 */

import { processEInvoiceSend } from '../src/lib/einvoice-sender';

async function main() {
  const sendingId = process.argv[2];

  if (!sendingId) {
    console.error(
      'Usage: bun scripts/process-einvoice-send.ts <sendingId>\n\n' +
        'Example: bun scripts/process-einvoice-send.ts abc123-sending-id\n\n' +
        'Find the sendingId in the invoice\'s "Afsendelseshistorik" dialog, ' +
        'or query: SELECT id, status FROM "EInvoiceSending" WHERE status = \'PENDING\';'
    );
    process.exit(1);
  }

  // Safety check: refuse to run if Storecove is not configured (would
  // silently fall back to simulation mode and never hit the real sandbox).
  if (!process.env.STORECOVE_API_KEY) {
    console.error(
      'ERROR: STORECOVE_API_KEY is not set in .env.\n' +
        'Without it, processEInvoiceSend runs in SIMULATION mode and never\n' +
        'calls the Storecove sandbox. Set the sandbox API key in .env first.'
    );
    process.exit(1);
  }

  console.log(`[process-einvoice-send] Transmitting sending ${sendingId} to Storecove...`);
  console.log(
    `[process-einvoice-send] API URL: ${process.env.STORECOVE_API_URL || 'https://api.storecove.com/v2 (default)'}`
  );

  try {
    await processEInvoiceSend(sendingId);
    console.log(`[process-einvoice-send] Done. Check the invoice send history for the updated status.`);
    process.exit(0);
  } catch (error) {
    console.error('[process-einvoice-send] Failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
