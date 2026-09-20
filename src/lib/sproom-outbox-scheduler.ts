/**
 * Sproom Outbox Status Poller (Safety-Net Scheduler — OUTBOUND)
 *
 * Sproom-modtageren (`sproom-inbox-scheduler.ts`) poller hvert 5 min for
 * INBOUND DocumentReceived events. Denne scheduler er dens OUTBOUND modstykke:
 * den poller afsendte dokumenter for DocumentStatusChanged events der måtte
 * være blevet missede af webhook-handleren (GAP I-4 fix).
 *
 * Hvornår en sending bliver poller:
 *   - status i { SENT, IN_TRANSIT, DELIVERED, PENDING_APPROVAL }
 *     (dvs. documentet er kommet ind i Sproom-netværket men endnu ikke i en
 *     terminal state som ACCEPTED/REJECTED/PAID/FAILED)
 *   - OG updatedAt er ældre end 10 minutter siden (så vi ikke poller noget
 *      der netop er opdateret via en webhook)
 *
 * For hver kandidat-sending:
 *   1. Hent childCompanyId fra sending.company
 *   2. Hent getDocumentState(documentId) fra Sproom (fuld state-history)
 *   3. applyStateHistory(sendingId, states, 'sproom_poller') — persisterer
 *      alle nye state-entries via tracker-modulet (idempotent).
 *   4. Hvis tracker rapporterer changed → emit einvoice-event toast.
 *
 * Auto-retry: sendings med status=FAILED og nextRetryAt <= now() bliver
 * automatisk retry-via processEInvoiceSend (op til maxRetries).
 *
 * Started from `src/instrumentation.ts` alongside the other schedulers.
 * Idempotent (internal `_schedulerStarted` flag). Disabled via
 * DISABLE_SPROOM_OUTBOX_SCHEDULER=true env var. Schedule configurable via
 * SPROOM_OUTBOX_CRON_SCHEDULE (defaults to every 10 minutes).
 */

import cron, { type ScheduledTask } from 'node-cron';
import { logger } from '@/lib/logger';
import { db } from '@/lib/db';
import { sproomClient } from '@/lib/sproom-client';
import { applyStateHistory } from '@/lib/einvoice-status-tracker';
import { notifyEInvoiceEvent } from '@/lib/notify-einvoice-event';

// ─── State ────────────────────────────────────────────────────────────────

const scheduledTasks: ScheduledTask[] = [];
let _schedulerStarted = false;

// In-memory dedup: track documentIds the poller has recently checked, so we
// don't hammer Sproom's getDocumentState endpoint on every cycle for the
// same slow-moving sending. Keyed by `${sendingId}:${documentId}`. Cleared
// when it grows past the cap.
const recentlyChecked = new Set<string>();
const RECENTLY_CHECKED_CAP = 5000;

function dedupKey(sendingId: string, documentId: string): string {
  return `${sendingId}:${documentId}`;
}

function markChecked(sendingId: string, documentId: string): void {
  const key = dedupKey(sendingId, documentId);
  if (recentlyChecked.has(key)) return;
  if (recentlyChecked.size >= RECENTLY_CHECKED_CAP) {
    recentlyChecked.clear();
  }
  recentlyChecked.add(key);
}

// ─── Poll one sending ──────────────────────────────────────────────────

/**
 * Poll one sending's Sproom state-history and apply any new transitions
 * via the tracker. Returns counts for logging.
 */
async function pollSendingStatus(sending: {
  id: string;
  storecoveSubmissionId: string | null;
  companyId: string;
  invoiceId: string;
  recipientName: string;
  status: string;
}): Promise<{ applied: number; changed: number; finalStatus: string | null }> {
  if (!sending.storecoveSubmissionId) {
    // No Sproom document ID — can't poll state. This happens for sends that
    // failed before Sproom returned a 201 (e.g. simulation mode).
    return { applied: 0, changed: 0, finalStatus: null };
  }

  // Resolve child company ID for impersonation token
  const company = await db.company.findUnique({
    where: { id: sending.companyId },
    select: { sproomChildCompanyId: true },
  });
  if (!company?.sproomChildCompanyId) {
    // Tenant's Sproom child company not configured — can't fetch state.
    return { applied: 0, changed: 0, finalStatus: null };
  }

  markChecked(sending.id, sending.storecoveSubmissionId);

  // Fetch the full state-history from Sproom
  let states: Awaited<ReturnType<typeof sproomClient.getDocumentState>> = [];
  try {
    states = await sproomClient.getDocumentState(sending.storecoveSubmissionId, {
      childCompanyId: company.sproomChildCompanyId,
    });
  } catch (err) {
    logger.warn('[SPROOM-OUTBOX] getDocumentState failed', {
      sendingId: sending.id,
      documentId: sending.storecoveSubmissionId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { applied: 0, changed: 0, finalStatus: null };
  }

  if (!states || states.length === 0) {
    return { applied: 0, changed: 0, finalStatus: null };
  }

  // Apply the state-history via the tracker (idempotent, persists events)
  const result = await applyStateHistory(
    sending.id,
    states,
    'sproom_poller',
  );

  // If status changed, emit a real-time toast so the tenant is notified
  // (mirrors the webhook path — for missed webhooks this is the only signal).
  if (result.changed > 0 && result.finalStatus) {
    try {
      const invoice = await db.invoice.findUnique({
        where: { id: sending.invoiceId },
        select: { invoiceNumber: true },
      });
      await notifyEInvoiceEvent({
        companyId: sending.companyId,
        direction: 'outbound',
        status: result.finalStatus as any,
        invoiceNumber: invoice?.invoiceNumber ?? null,
        counterpartyName: sending.recipientName || null,
        sendingId: sending.id,
      });
    } catch (err) {
      logger.warn('[SPROOM-OUTBOX] notifyEInvoiceEvent failed', {
        sendingId: sending.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    applied: result.applied,
    changed: result.changed,
    finalStatus: result.finalStatus,
  };
}

// ─── Auto-retry failed sendings ────────────────────────────────────────

/**
 * Auto-retry sendings with status=FAILED and nextRetryAt <= now().
 * Mirrors the retry logic in retryEInvoiceSend (einvoice-sender.ts:999)
 * but invoked automatically by the scheduler instead of manually by the user.
 */
async function autoRetryFailedSendings(): Promise<{ retried: number }> {
  const now = new Date();

  // Find sendings due for retry. We can't filter by retryCount < maxRetries
  // in SQL (since maxRetries varies per row), so we fetch candidates and
  // filter in JS — the cap (take: 20) keeps this cheap.
  const dueSendings = await db.eInvoiceSending.findMany({
    where: {
      status: 'FAILED',
      nextRetryAt: { lte: now },
    },
    select: {
      id: true,
      retryCount: true,
      maxRetries: true,
      companyId: true,
      invoiceId: true,
      recipientName: true,
    },
    take: 20, // cap per cycle to avoid overload
  });

  // Filter to retryCount < maxRetries
  const eligible = dueSendings.filter((s) => s.retryCount < s.maxRetries);
  if (eligible.length === 0) {
    return { retried: 0 };
  }

  // Dynamic import to avoid circular dependency at module load time
  const { retryEInvoiceSend } = await import('@/lib/einvoice-sender');

  let retried = 0;
  for (const sending of eligible) {
    try {
      await retryEInvoiceSend(sending.id);
      retried++;
      logger.info('[SPROOM-OUTBOX] Auto-retried failed sending', {
        sendingId: sending.id,
        retryCount: sending.retryCount + 1,
      });
    } catch (err) {
      logger.warn('[SPROOM-OUTBOX] Auto-retry failed for sending', {
        sendingId: sending.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { retried };
}

// ─── Cycle (all tenants) ─────────────────────────────────────────────────

/**
 * Run one outbox cycle across all tenants. Polls every non-terminal sending
 * whose updatedAt is older than the staleness threshold. Wrapped in try/catch
 * so the cron never crashes the process.
 */
export async function runSproomOutboxCycle(): Promise<{
  polled: number;
  applied: number;
  changed: number;
  retried: number;
}> {
  if (!sproomClient?.isConfigured) {
    // Sproom not configured (e.g. dev/staging without token) — skip silently.
    return { polled: 0, applied: 0, changed: 0, retried: 0 };
  }

  // Auto-retry failed sendings first (before polling — so retried sends
  // get picked up by the polling step below in the same cycle if Sproom
  // accepts them quickly).
  const retryResult = await autoRetryFailedSendings();

  // Find all non-terminal sendings older than the staleness threshold.
  // Non-terminal = still in-flight (waiting for Sproom to deliver or recipient
  // to ack/reject). Terminal states (ACCEPTED/REJECTED/PAID/FAILED/CANCELLED)
  // are excluded — they're done.
  const stalenessMinutes = 10;
  const stalenessCutoff = new Date(Date.now() - stalenessMinutes * 60 * 1000);

  const candidates = await db.eInvoiceSending.findMany({
    where: {
      status: { in: ['SENT', 'IN_TRANSIT', 'DELIVERED', 'PENDING_APPROVAL'] },
      updatedAt: { lt: stalenessCutoff },
      storecoveSubmissionId: { not: null },
    },
    select: {
      id: true,
      storecoveSubmissionId: true,
      companyId: true,
      invoiceId: true,
      recipientName: true,
      status: true,
      updatedAt: true,
    },
    take: 50, // cap per cycle to avoid Sproom rate limits
    orderBy: { updatedAt: 'asc' }, // oldest first — most likely stale
  });

  let totalApplied = 0;
  let totalChanged = 0;

  for (const sending of candidates) {
    // Skip recently-checked (dedup)
    if (
      sending.storecoveSubmissionId &&
      recentlyChecked.has(dedupKey(sending.id, sending.storecoveSubmissionId))
    ) {
      continue;
    }

    try {
      const result = await pollSendingStatus({
        id: sending.id,
        storecoveSubmissionId: sending.storecoveSubmissionId,
        companyId: sending.companyId,
        invoiceId: sending.invoiceId,
        recipientName: sending.recipientName,
        status: sending.status,
      });
      totalApplied += result.applied;
      totalChanged += result.changed;
    } catch (err) {
      logger.warn('[SPROOM-OUTBOX] pollSendingStatus failed', {
        sendingId: sending.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info(
    `[SPROOM-OUTBOX] Cycle complete — polled=${candidates.length} applied=${totalApplied} changed=${totalChanged} retried=${retryResult.retried}`,
  );
  return {
    polled: candidates.length,
    applied: totalApplied,
    changed: totalChanged,
    retried: retryResult.retried,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Start the Sproom outbox status poller. Idempotent — safe to call multiple
 * times. Runs every 10 minutes by default (configurable via
 * SPROOM_OUTBOX_CRON_SCHEDULE).
 *
 * Disabled via DISABLE_SPROOM_OUTBOX_SCHEDULER=true env var.
 */
export function startSproomOutboxScheduler(): void {
  if (_schedulerStarted) return;
  if (process.env.DISABLE_SPROOM_OUTBOX_SCHEDULER === 'true') {
    logger.info(
      '[SPROOM-OUTBOX] Disabled by DISABLE_SPROOM_OUTBOX_SCHEDULER env var',
    );
    return;
  }
  _schedulerStarted = true;

  const schedule = process.env.SPROOM_OUTBOX_CRON_SCHEDULE || '*/10 * * * *';

  const task = cron.schedule(schedule, () => {
    runSproomOutboxCycle().catch((err) => {
      logger.error('[SPROOM-OUTBOX] Uncaught error in outbox cycle:', err);
    });
  });
  scheduledTasks.push(task);

  logger.info(
    `[SPROOM-OUTBOX] Started — polling every ${schedule} (safety-net for the DocumentStatusChanged webhook)`,
  );
}

/**
 * Stop the Sproom outbox status poller. Idempotent.
 */
export function stopSproomOutboxScheduler(): void {
  if (!_schedulerStarted) return;
  _schedulerStarted = false;

  for (const task of scheduledTasks) {
    task.stop();
  }
  scheduledTasks.length = 0;

  logger.info('[SPROOM-OUTBOX] Stopped');
}
