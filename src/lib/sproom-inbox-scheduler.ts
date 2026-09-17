/**
 * Sproom Inbox Puller (Safety-Net Scheduler)
 *
 * The primary inbound path is the Sproom `DocumentReceived` WEBHOOK (push).
 * This scheduler is a SAFETY-NET PULLER that polls each tenant's Sproom
 * inbox every 5 minutes for documents the webhook may have missed (e.g. the
 * platform was down during a webhook delivery, or the webhook signature check
 * rejected a valid event during staging).
 *
 * For each tenant with a configured Sproom child company + e-invoicing
 * enabled, it lists the most recent inbox documents, fetches the XML for any
 * it hasn't processed yet (in-memory dedup Set), and stores them via
 * storeReceivedInvoice (which is idempotent on companyId+invoiceNumber, so
 * duplicates are a no-op). New documents trigger a real-time einvoice-event
 * toast via notifyEInvoiceEvent — identical to the webhook path — so the
 * tenant is notified regardless of whether the doc arrived via push or pull.
 *
 * Started from `src/instrumentation.ts` alongside the other schedulers.
 * Idempotent (internal `_schedulerStarted` flag). Disabled via
 * DISABLE_SPROOM_INBOX_SCHEDULER=true env var. Schedule configurable via
 * SPROOM_INBOX_CRON_SCHEDULE (defaults to every 5 minutes).
 */

import cron, { type ScheduledTask } from 'node-cron';
import { logger } from '@/lib/logger';
import { db } from '@/lib/db';
import { sproomClient } from '@/lib/sproom-client';
import { storeReceivedInvoice } from '@/lib/invoice-receiver';
import { notifyEInvoiceEvent } from '@/lib/notify-einvoice-event';

// ─── State ────────────────────────────────────────────────────────────────

const scheduledTasks: ScheduledTask[] = [];
let _schedulerStarted = false;

// In-memory dedup: track documentIds the puller has already processed so we
// don't re-fetch + re-parse their XML on every poll. Keyed by
// `${companyId}:${documentId}`. storeReceivedInvoice is ALSO idempotent
// (unique on companyId+invoiceNumber), so a Set miss just means an idempotent
// no-op — this is purely an efficiency guard, not a correctness one. Cleared
// when it grows past the cap (any docs re-encountered after a clear are
// idempotent no-ops via the unique constraint).
const processedGuids = new Set<string>();
const PROCESSED_GUIDS_CAP = 5000;

function dedupKey(companyId: string, documentId: string): string {
  return `${companyId}:${documentId}`;
}

function markProcessed(companyId: string, documentId: string): void {
  const key = dedupKey(companyId, documentId);
  if (processedGuids.has(key)) return;
  if (processedGuids.size >= PROCESSED_GUIDS_CAP) {
    processedGuids.clear();
  }
  processedGuids.add(key);
}

// ─── Per-company pull ────────────────────────────────────────────────────

/**
 * Pull + store recent inbox documents for one tenant. Returns counts for
 * logging. Never throws — errors are logged per-document so a single failure
 * doesn't abort the whole company's batch.
 */
async function pullInboxForCompany(company: {
  id: string;
  sproomChildCompanyId: string;
}): Promise<{ fetched: number; stored: number }> {
  let fetched = 0;
  let stored = 0;

  let docs: Awaited<ReturnType<typeof sproomClient.listDocuments>>;
  try {
    // Page 1 (most recent ~20 documents). A date filter isn't applied because
    // the in-memory dedup Set + storeReceivedInvoice's idempotency make
    // re-processing cheap (no-op). For high-volume tenants the webhook
    // remains the primary path; this is just a safety net.
    docs = await sproomClient.listDocuments(0, undefined, {
      childCompanyId: company.sproomChildCompanyId,
    });
  } catch (err) {
    logger.warn('[SPROOM-INBOX] listDocuments failed', {
      companyId: company.id,
      childCompanyId: company.sproomChildCompanyId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { fetched: 0, stored: 0 };
  }

  for (const doc of docs) {
    const documentId = doc.documentId;
    if (!documentId) continue;
    if (processedGuids.has(dedupKey(company.id, documentId))) continue; // seen by this puller

    // Per-document try/catch: a single document's failure must NOT abort the
    // rest of the company's batch. markProcessed is called only on a
    // successful store (or an un-fetchable document) — a throw leaves the doc
    // UN-marked so the next poll retries it (transient errors resolve;
    // persistent failures stay in Sproom's dashboard for manual retrieval).
    try {
      // Fetch the XML — try NemHandel-native format first (preserves OIOUBL),
      // then Peppol BIS 3, then the legacy 'xml' endpoint. Mirrors the
      // webhook's format-order rationale (see handleReceivedDocument).
      let xml: string | null = null;
      for (const fmt of ['OioUbl2', 'PeppolBis3', 'xml'] as const) {
        try {
          const raw = await sproomClient.getDocument(documentId, fmt, {
            childCompanyId: company.sproomChildCompanyId,
          });
          if (raw) {
            xml =
              typeof raw === 'string'
                ? raw
                : Buffer.from(raw).toString('utf-8');
            break;
          }
        } catch {
          // Format unavailable / conversion failed — try the next format.
        }
      }

      if (!xml) {
        // Un-fetchable (e.g. 410 document gone) — mark so we don't hammer
        // Sproom every poll. The document remains in Sproom's dashboard for
        // manual retrieval; the webhook is the primary inbound path.
        markProcessed(company.id, documentId);
        logger.warn('[SPROOM-INBOX] Could not fetch document XML (all formats)', {
          companyId: company.id,
          documentId,
        });
        continue;
      }
      fetched++;

      // storeReceivedInvoice is idempotent (unique on companyId+invoiceNumber),
      // so re-storing a webhook-already-received document is a no-op. It also
      // emits the data-changed invalidation event internally.
      const result = await storeReceivedInvoice({
        companyId: company.id,
        userId: null,
        xml,
        source: 'ap_poller',
        documentGuid: documentId,
        auditMeta: {
          source: 'ap_poller',
          document_guid: documentId,
        },
      });

      // Mark processed once stored (success OR duplicate) so we don't
      // re-fetch XML next poll. A throw ABOVE (fetch or store) skips this —
      // the doc stays un-marked so the next poll retries.
      markProcessed(company.id, documentId);

      // Only toast for NEW (non-duplicate) documents — duplicates are either
      // webhook retries or webhook-then-puller overlap, and must not re-toast.
      if (result.success && result.invoice?.id && !result.duplicate) {
        stored++;
        try {
          const received = await db.receivedInvoice.findUnique({
            where: { id: result.invoice.id },
            select: {
              supplierName: true,
              invoiceNumber: true,
              documentType: true,
              payableAmount: true,
              currencyCode: true,
            },
          });
          if (received) {
            await notifyEInvoiceEvent({
              companyId: company.id,
              direction: 'inbound',
              status: 'RECEIVED',
              invoiceNumber: received.invoiceNumber,
              counterpartyName: received.supplierName,
              documentType: received.documentType,
              amount: received.payableAmount?.toString() ?? null,
              currency: received.currencyCode,
              receivedInvoiceId: result.invoice.id,
            });
          }
        } catch (err) {
          logger.warn('[SPROOM-INBOX] notifyEInvoiceEvent failed', {
            companyId: company.id,
            documentId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (err) {
      // Per-doc safety net — log + continue to the next document. The doc is
      // NOT marked processed, so the next poll will retry it.
      logger.warn('[SPROOM-INBOX] Per-document processing failed', {
        companyId: company.id,
        documentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { fetched, stored };
}

// ─── Cycle (all tenants) ─────────────────────────────────────────────────

/**
 * Run one pull cycle across all tenants with a configured Sproom child
 * company + e-invoicing enabled. Wrapped in try/catch so the cron never
 * crashes the process. Returns aggregate counts for logging/testing.
 */
export async function runSproomInboxCycle(): Promise<{
  companies: number;
  fetched: number;
  stored: number;
}> {
  if (!sproomClient?.isConfigured) {
    // Sproom not configured (e.g. dev/staging) — skip silently.
    return { companies: 0, fetched: 0, stored: 0 };
  }

  const companies = await db.company.findMany({
    where: {
      sproomChildCompanyId: { not: null },
      einvoiceEnabled: true,
      isActive: true,
    },
    select: { id: true, sproomChildCompanyId: true },
  });

  let totalFetched = 0;
  let totalStored = 0;
  for (const company of companies) {
    if (!company.sproomChildCompanyId) continue;
    try {
      const { fetched, stored } = await pullInboxForCompany({
        id: company.id,
        sproomChildCompanyId: company.sproomChildCompanyId,
      });
      totalFetched += fetched;
      totalStored += stored;
    } catch (err) {
      logger.warn('[SPROOM-INBOX] pullInboxForCompany failed', {
        companyId: company.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info(
    `[SPROOM-INBOX] Cycle complete — companies=${companies.length} fetched=${totalFetched} stored=${totalStored}`,
  );
  return { companies: companies.length, fetched: totalFetched, stored: totalStored };
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Start the Sproom inbox puller. Idempotent — safe to call multiple times.
 * Runs every 5 minutes by default (configurable via SPROOM_INBOX_CRON_SCHEDULE).
 *
 * Disabled via DISABLE_SPROOM_INBOX_SCHEDULER=true env var.
 */
export function startSproomInboxScheduler(): void {
  if (_schedulerStarted) return;
  if (process.env.DISABLE_SPROOM_INBOX_SCHEDULER === 'true') {
    logger.info(
      '[SPROOM-INBOX] Disabled by DISABLE_SPROOM_INBOX_SCHEDULER env var',
    );
    return;
  }
  _schedulerStarted = true;

  const schedule = process.env.SPROOM_INBOX_CRON_SCHEDULE || '*/5 * * * *';

  const task = cron.schedule(schedule, () => {
    runSproomInboxCycle().catch((err) => {
      logger.error('[SPROOM-INBOX] Uncaught error in inbox cycle:', err);
    });
  });
  scheduledTasks.push(task);

  logger.info(
    `[SPROOM-INBOX] Started — pulling every ${schedule} (safety-net for the DocumentReceived webhook)`,
  );
}

/**
 * Stop the Sproom inbox puller. Idempotent.
 */
export function stopSproomInboxScheduler(): void {
  if (!_schedulerStarted) return;
  _schedulerStarted = false;

  for (const task of scheduledTasks) {
    task.stop();
  }
  scheduledTasks.length = 0;

  logger.info('[SPROOM-INBOX] Stopped');
}
