import { NextResponse } from 'next/server';
import {
  storecoveClient,
  StorecoveWebhookEvent,
  StorecoveReceivedDocumentWebhookEvent,
  StorecoveSubmissionWebhookEvent,
} from '@/lib/storecove-client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditLog } from '@/lib/audit';
import { storeReceivedInvoice } from '@/lib/invoice-receiver';

// POST /api/storecove/webhook — Receive Storecove webhook events (NO AUTH)
//
// This endpoint is called by Storecove servers, not by authenticated users.
// Authenticity is verified via HMAC-SHA256 signature (fail-closed when no
// secret is configured).
//
// Two event families are handled:
//
//  1. OUTBOUND — invoice_submission.status_changed / .created / legal_entity.updated
//     → update the EInvoiceSending delivery status (delivered / accepted / rejected).
//
//  2. INBOUND  — received_document
//     → fetch the received e-invoice XML from Storecove, resolve the tenant,
//       parse + store it as a ReceivedInvoice so it appears in the tenant's
//       e-invoice inbox. This is the receive half required by Erhvervsstyrelsen.
//
// Idempotency: Storecove retries on non-2xx for up to 5 days. We always return
// 200 after verifying the signature, and the store layer de-duplicates by
// (companyId, invoiceNumber) so retries are safe.

export async function POST(request: Request) {
  try {
    // ── 1. Read raw body + verify signature ────────────────────────
    const rawBody = await request.text();

    const signature = request.headers.get('X-Storecove-Signature');
    if (!signature) {
      logger.warn('[STORECOVE_WEBHOOK] Missing X-Storecove-Signature header');
      return NextResponse.json({ error: 'Missing signature header' }, { status: 401 });
    }

    if (!storecoveClient.verifyWebhookSignature(rawBody, signature)) {
      logger.warn('[STORECOVE_WEBHOOK] Invalid webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // ── 2. Parse the webhook event ─────────────────────────────────
    let event: StorecoveWebhookEvent;
    try {
      event = JSON.parse(rawBody) as StorecoveWebhookEvent;
    } catch {
      logger.warn('[STORECOVE_WEBHOOK] Failed to parse webhook payload');
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    logger.info('[STORECOVE_WEBHOOK] Received webhook event', {
      event: event.event,
      timestamp: event.timestamp,
    });

    // ── 3. Dispatch on event type ──────────────────────────────────
    if (event.event === 'received_document') {
      return await handleReceivedDocument(event);
    }

    if (event.event === 'invoice_submission.status_changed') {
      return await handleSubmissionStatusChanged(event);
    }

    // invoice_submission.created + legal_entity.updated — acknowledged, not actioned.
    logger.info('[STORECOVE_WEBHOOK] Ignoring non-actionable event', { event: event.event });
    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error('[STORECOVE_WEBHOOK] Failed to process webhook:', error);
    // Return 200 to prevent Storecove from retrying on internal errors.
    // Status catch-up happens via polling (getSubmissionStatus) if needed.
    return NextResponse.json({ received: true });
  }
}

// ─── INBOUND: received_document ────────────────────────────────────
//
// Storecove received an e-invoice addressed to one of our legal entities.
// We fetch the XML, resolve the tenant, parse, and store it.

async function handleReceivedDocument(event: StorecoveReceivedDocumentWebhookEvent) {
  const { document_guid, legal_entity_id, tenant_id, parseable } = event.data;

  logger.info('[STORECOVE_WEBHOOK] Processing received_document', {
    document_guid,
    legal_entity_id: legal_entity_id ?? null,
    tenant_id: tenant_id ?? null,
    parseable: parseable ?? null,
  });

  // ── Resolve the tenant (Company) ────────────────────────────────
  // Resolution order:
  //   1. legal_entity_id → Company.storecoveLegalEntityId
  //   2. tenant_id (if it's our Company.id cuid) → Company.id
  //   3. Fetch received document JSON → match recipient endpoint
  //      (scheme:identifier) → Company.einvoiceEndpointId / cvrNumber
  const company = await resolveTenant(event.data);

  if (!company) {
    // No tenant owns this legal entity / endpoint. Return 200 so Storecove
    // stops retrying — the document remains available in the Storecove
    // dashboard for manual retrieval. Logged at error for ops visibility.
    logger.error('[STORECOVE_WEBHOOK] Could not resolve tenant for received document', {
      document_guid,
      legal_entity_id: legal_entity_id ?? null,
      tenant_id: tenant_id ?? null,
    });
    return NextResponse.json({ received: true, warning: 'tenant_unresolved' });
  }

  // ── Fetch the original XML ──────────────────────────────────────
  const xml = await storecoveClient.getReceivedDocumentOriginal(document_guid);

  if (!xml) {
    logger.error('[STORECOVE_WEBHOOK] Could not fetch received document XML', {
      document_guid,
      companyId: company.id,
    });
    // Return 200 — Storecove will retry, and the document is also in their
    // dashboard. Returning non-2xx would cause 5 days of retries.
    return NextResponse.json({ received: true, warning: 'document_fetch_failed' });
  }

  // ── Parse + store (idempotent) ──────────────────────────────────
  const result = await storeReceivedInvoice({
    companyId: company.id,
    userId: null,
    xml,
    source: 'storecove_webhook',
    documentGuid: document_guid,
    auditMeta: {
      source: 'storecove_webhook',
      document_guid,
      legal_entity_id: legal_entity_id ?? null,
      tenant_id: tenant_id ?? null,
      webhook_timestamp: event.timestamp,
    },
  });

  if (result.duplicate) {
    logger.info('[STORECOVE_WEBHOOK] Received document was a duplicate (idempotent skip)', {
      document_guid,
      companyId: company.id,
      invoiceId: result.invoice?.id,
    });
  } else if (!result.success) {
    logger.error('[STORECOVE_WEBHOOK] Failed to store received document', {
      document_guid,
      companyId: company.id,
      error: result.error,
      validationErrors: result.validationErrors,
    });
  } else {
    logger.info('[STORECOVE_WEBHOOK] Received document stored successfully', {
      document_guid,
      companyId: company.id,
      invoiceId: result.invoice?.id,
      invoiceNumber: result.invoice?.invoiceNumber,
    });
  }

  // Always 200 — Storecove should not retry. Duplicates + parse failures are
  // logged and the raw XML is retained in Storecove's dashboard.
  return NextResponse.json({ received: true, stored: result.success, duplicate: result.duplicate ?? false });
}

/**
 * Resolve which Company (tenant) a received document belongs to.
 *
 * Tries, in order:
 *  1. legal_entity_id  → Company.storecoveLegalEntityId
 *  2. tenant_id        → Company.id (if it matches our cuid format)
 *  3. Fetched document JSON recipient endpoint → Company.einvoiceEndpointId
 *     (e.g. "0184:12345678") or Company.cvrNumber
 */
async function resolveTenant(data: {
  legal_entity_id?: number;
  tenant_id?: string;
  receiver_scheme?: string;
  receiver_identifier?: string;
  document_guid: string;
}) {
  // 1. By legal_entity_id
  if (data.legal_entity_id != null) {
    const company = await db.company.findFirst({
      where: { storecoveLegalEntityId: data.legal_entity_id },
      select: { id: true, cvrNumber: true, einvoiceEndpointId: true, storecoveLegalEntityId: true },
    });
    if (company) {
      logger.info('[STORECOVE_WEBHOOK] Tenant resolved by legal_entity_id', {
        companyId: company.id,
        legalEntityId: data.legal_entity_id,
      });
      return company;
    }
  }

  // 2. By tenant_id (if it looks like our cuid)
  if (data.tenant_id && /^c[a-z0-9]{20,}$/i.test(data.tenant_id)) {
    const company = await db.company.findUnique({
      where: { id: data.tenant_id },
      select: { id: true, cvrNumber: true, einvoiceEndpointId: true, storecoveLegalEntityId: true },
    });
    if (company) {
      logger.info('[STORECOVE_WEBHOOK] Tenant resolved by tenant_id', {
        companyId: company.id,
      });
      return company;
    }
  }

  // 3. By recipient endpoint from the webhook payload itself
  if (data.receiver_scheme && data.receiver_identifier) {
    const endpointId = `${data.receiver_scheme}:${data.receiver_identifier}`;
    const company = await db.company.findFirst({
      where: {
        OR: [
          { einvoiceEndpointId: endpointId },
          { cvrNumber: data.receiver_identifier },
        ],
      },
      select: { id: true, cvrNumber: true, einvoiceEndpointId: true, storecoveLegalEntityId: true },
    });
    if (company) {
      logger.info('[STORECOVE_WEBHOOK] Tenant resolved by receiver endpoint', {
        companyId: company.id,
        endpointId,
      });
      return company;
    }
  }

  // 4. Last resort: fetch the document JSON and read the recipient endpoint
  const docJson = await storecoveClient.getReceivedDocumentJson(data.document_guid);
  if (docJson) {
    // legal_entity_id may be present in the JSON even if absent from the webhook
    if (docJson.legal_entity_id != null) {
      const company = await db.company.findFirst({
        where: { storecoveLegalEntityId: docJson.legal_entity_id },
        select: { id: true, cvrNumber: true, einvoiceEndpointId: true, storecoveLegalEntityId: true },
      });
      if (company) {
        logger.info('[STORECOVE_WEBHOOK] Tenant resolved by legal_entity_id (from document JSON)', {
          companyId: company.id,
          legalEntityId: docJson.legal_entity_id,
        });
        return company;
      }
    }
    if (docJson.recipient?.scheme && docJson.recipient?.identifier) {
      const endpointId = `${docJson.recipient.scheme}:${docJson.recipient.identifier}`;
      const company = await db.company.findFirst({
        where: {
          OR: [
            { einvoiceEndpointId: endpointId },
            { cvrNumber: docJson.recipient.identifier },
          ],
        },
        select: { id: true, cvrNumber: true, einvoiceEndpointId: true, storecoveLegalEntityId: true },
      });
      if (company) {
        logger.info('[STORECOVE_WEBHOOK] Tenant resolved by recipient endpoint (from document JSON)', {
          companyId: company.id,
          endpointId,
        });
        return company;
      }
    }
  }

  return null;
}

// ─── OUTBOUND: invoice_submission.status_changed ───────────────────

async function handleSubmissionStatusChanged(
  event: StorecoveSubmissionWebhookEvent,
) {
  const submissionId = event.data.id;
  const status = event.data.status;
  const now = new Date();

  // Look up the EInvoiceSending by storecoveSubmissionId
  const sending = await db.eInvoiceSending.findFirst({
    where: { storecoveSubmissionId: submissionId },
  });

  if (!sending) {
    logger.warn('[STORECOVE_WEBHOOK] No EInvoiceSending found for submission ID', {
      submissionId,
    });
    // Return 200 anyway — Storecove will retry on non-2xx responses
    return NextResponse.json({ received: true });
  }

  let updateData: Record<string, unknown> = {};
  let newStatus: string;

  switch (status) {
    case 'delivered':
      newStatus = 'DELIVERED';
      updateData = { status: 'DELIVERED', deliveredAt: now };
      break;

    case 'accepted':
      newStatus = 'ACCEPTED';
      updateData = { status: 'ACCEPTED', acceptedAt: now };
      break;

    case 'rejected':
      newStatus = 'REJECTED';
      updateData = {
        status: 'REJECTED',
        errorMessage: event.data.rejection_reason || 'Recipient rejected the invoice',
      };
      break;

    case 'undeliverable':
    case 'expired':
    case 'failed':
      newStatus = 'FAILED';
      updateData = {
        status: 'FAILED',
        errorMessage: event.data.rejection_reason || `Invoice delivery ${status}`,
      };
      break;

    case 'processing':
      newStatus = 'SENDING';
      updateData = { status: 'SENDING' };
      break;

    default:
      logger.warn('[STORECOVE_WEBHOOK] Unknown status received', { status });
      return NextResponse.json({ received: true });
  }

  // Update the EInvoiceSending record
  await db.eInvoiceSending.update({
    where: { id: sending.id },
    data: updateData,
  });

  // Audit trail for the status change.
  // Attribute to the user who initiated the send (sending.sentBy) — this
  // preserves the original behaviour where the delivery event is tied to the
  // user who sent the invoice, not an anonymous system actor.
  await auditLog({
    action: 'UPDATE',
    entityType: 'EInvoiceSending',
    entityId: sending.id,
    userId: sending.sentBy,
    companyId: sending.companyId,
    changes: {
      status: { old: sending.status, new: newStatus },
    },
    metadata: {
      source: 'storecove_webhook',
      storecoveSubmissionId: submissionId,
      storecoveStorecoveId: String(event.data.storecove_id),
      storecoveStatus: status,
      rejectionReason: event.data.rejection_reason || null,
      timestamp: event.timestamp,
    },
  });

  logger.info('[STORECOVE_WEBHOOK] Updated EInvoiceSending status', {
    sendingId: sending.id,
    previousStatus: sending.status,
    newStatus,
    storecoveStatus: status,
    companyId: sending.companyId,
  });

  return NextResponse.json({ received: true });
}
