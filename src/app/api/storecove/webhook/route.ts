import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import {
  storecoveClient,
  StorecoveWebhookEvent,
  StorecoveReceivedDocumentWebhookEvent,
  StorecoveSubmissionWebhookEvent,
} from '@/lib/storecove-client';
import { sproomClient } from '@/lib/sproom-client';
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
    // ── 1. Read raw body + verify authenticity ─────────────────────
    //
    // AlphaFlow supports webhooks from BOTH Access Point providers:
    //
    //  A) Sproom — RSA signature in X-Signature header.
    //     Sproom signs the webhook body with SHA256withRSA.
    //     The RSA public key is fetched from GET /api/webhooks/key.
    //     Verified via sproomClient.verifyWebhookSignature().
    //
    //  B) Storecove — static shared-secret HTTP header.
    //     Header: X-Alphaflow-Webhook-Secret = <STORECOVE_WEBHOOK_SECRET>
    //     Compared with crypto.timingSafeEqual (fail-closed).
    //
    //  C) Simulation — when no AP is configured, accept all (dev only).
    //
    // Auth method is auto-detected based on which headers are present.
    const rawBody = await request.text();

    // ── 1a. Try Sproom RSA signature first ──
    const sproomSignature = request.headers.get('X-Signature');
    let authenticated = false;

    if (sproomSignature && sproomClient?.isConfigured) {
      try {
        authenticated = await sproomClient.verifyWebhookSignature(rawBody, sproomSignature);
        if (authenticated) {
          logger.info('[WEBHOOK] Authenticated via Sproom RSA signature');
        }
      } catch (err) {
        logger.warn('[WEBHOOK] Sproom signature verification failed', { error: err instanceof Error ? err.message : String(err) });
      }
    }

    // ── 1b. Try Storecove shared-secret header ──
    if (!authenticated) {
      const sharedSecretHeader = request.headers.get('X-Alphaflow-Webhook-Secret');
      const webhookSecret = process.env.STORECOVE_WEBHOOK_SECRET;

      if (sharedSecretHeader && webhookSecret) {
        const bufferA = Buffer.from(sharedSecretHeader);
        const bufferB = Buffer.from(webhookSecret);
        if (bufferA.length === bufferB.length && bufferA.length > 0) {
          authenticated = timingSafeEqual(bufferA, bufferB);
        }
        if (!authenticated) {
          logger.warn('[WEBHOOK] Invalid shared-secret header value');
        }
      }
    }

    // ── 1c. Fail-closed if no auth method succeeded ──
    if (!authenticated) {
      logger.error('[WEBHOOK] REJECTED: No valid Sproom signature or Storecove shared-secret');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── 2. Parse the webhook event ─────────────────────────────────
    const rawEvent = JSON.parse(rawBody) as Record<string, unknown>;

    logger.info('[WEBHOOK] Received webhook event', {
      event_type: rawEvent.event_type,
      event: rawEvent.event,
      type: rawEvent.type,
      documentId: rawEvent.documentId,
      eventType: rawEvent.eventType,
      timestamp: rawEvent.timestamp,
      guid: rawEvent.guid || rawEvent.document_guid || rawEvent.documentId,
    });

    // ── 3. Dispatch on event type (supports BOTH Sproom and Storecove) ──
    //
    // SPROOM webhook format:
    //   { "type": "DocumentReceived", "documentId": "<guid>", ... }
    //   { "type": "DocumentStatusChanged", "documentId": "<guid>", ... }
    //
    // STORECOVE webhook format:
    //   { "event_type": "received_document", "document_guid": "<guid>", ... }
    //   { "event_type": "document_submission", "event": "succeeded", "guid": "<guid>", ... }
    //
    const eventType = rawEvent.event_type as string | undefined;
    const eventSub = rawEvent.event as string | undefined;
    const sproomType = rawEvent.type as string | undefined;
    const documentId = (rawEvent.documentId || rawEvent.document_guid || rawEvent.guid) as string | undefined;

    // ── Inbound: document received ──
    // Sproom: type="DocumentReceived"
    // Storecove: event_type="received_document"
    if (sproomType === 'DocumentReceived' || eventType === 'received_document' || eventSub === 'received_document') {
      return await handleReceivedDocument({
        document_guid: documentId,
        documentId,
        event_type: eventType,
        event: eventSub || sproomType || '',
        type: sproomType,
        tenant_id: rawEvent.tenant_id as string | undefined,
        parseable: rawEvent.parseable as boolean | undefined,
        data: rawEvent.data as Record<string, unknown> | undefined,
      } as unknown as StorecoveReceivedDocumentWebhookEvent);
    }

    // ── Outbound: document status changed ──
    // Sproom: type="DocumentStatusChanged"
    // Storecove: event_type="document_submission"
    if (sproomType === 'DocumentStatusChanged' || eventType === 'document_submission' || eventSub === 'invoice_submission.status_changed') {
      return await handleSubmissionStatusChanged({
        event_type: eventType,
        event: eventSub || sproomType || '',
        type: sproomType,
        guid: documentId,
        documentId,
        details: rawEvent.details as string | undefined,
        tenant_id: rawEvent.tenant_id as string | undefined,
        data: rawEvent.data as Record<string, unknown> | undefined,
      } as unknown as StorecoveSubmissionWebhookEvent);
    }

    // Other events — acknowledged, not actioned.
    logger.info('[WEBHOOK] Ignoring non-actionable event', {
      event_type: eventType,
      event: eventSub,
      sproomType,
    });
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
  // Support both Storecove and Sproom webhook formats:
  // - Storecove: document_guid (top-level or under data)
  // - Sproom: documentId (top-level)
  const document_guid = event.document_guid || event.data?.document_guid || (event as any).documentId;
  const legal_entity_id = event.data?.legal_entity_id;
  const tenant_id = event.tenant_id || event.data?.tenant_id;
  const parseable = event.parseable ?? event.data?.parseable;

  if (!document_guid) {
    logger.error('[WEBHOOK] received_document missing document ID', {
      event_type: event.event_type,
      event: event.event,
      type: (event as any).type,
      tenant_id,
    });
    return NextResponse.json({ received: true, error: 'missing_document_id' });
  }

  logger.info('[WEBHOOK] Processing received document', {
    document_guid,
    legal_entity_id: legal_entity_id ?? null,
    tenant_id: tenant_id ?? null,
    parseable: parseable ?? null,
    source: (event as any).type ? 'sproom' : 'storecove',
  });

  // ── Resolve the tenant (Company) ────────────────────────────────
  const company = await resolveTenant({
    legal_entity_id,
    tenant_id,
    document_guid,
    receiver_scheme: event.data?.receiver_scheme,
    receiver_identifier: event.data?.receiver_identifier,
  });

  if (!company) {
    logger.error('[WEBHOOK] Could not resolve tenant for received document', {
      document_guid,
      legal_entity_id: legal_entity_id ?? null,
      tenant_id: tenant_id ?? null,
    });
    return NextResponse.json({ received: true, warning: 'tenant_unresolved' });
  }

  // ── Fetch the original XML ──────────────────────────────────────
  // Use the active Access Point to fetch the document.
  // - Sproom: GET /api/documents/{documentId}/xml
  // - Storecove: GET /received_documents/{guid}/original
  let xml: string | null = null;

  if (sproomClient?.isConfigured) {
    try {
      const raw = await sproomClient.getDocument(document_guid, 'xml');
      xml = raw ? (typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf-8')) : null;
    } catch (err) {
      logger.error('[WEBHOOK] Sproom getDocument failed', { document_guid, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (!xml && storecoveClient) {
    try {
      xml = await storecoveClient.getReceivedDocumentOriginal(document_guid);
    } catch (err) {
      logger.error('[WEBHOOK] Storecove getReceivedDocumentOriginal failed', { document_guid, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (!xml) {
    logger.error('[WEBHOOK] Could not fetch received document XML', {
      document_guid,
      companyId: company.id,
    });
    return NextResponse.json({ received: true, warning: 'document_fetch_failed' });
  }

  // ── Parse + store (idempotent) ──────────────────────────────────
  const result = await storeReceivedInvoice({
    companyId: company.id,
    userId: null,
    xml,
    source: 'ap_webhook',
    documentGuid: document_guid,
    auditMeta: {
      source: 'ap_webhook',
      document_guid,
      legal_entity_id: legal_entity_id ?? null,
      tenant_id: tenant_id ?? null,
      webhook_timestamp: (event as any).timestamp,
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
  // Support both Storecove and Sproom webhook formats:
  // - Storecove: guid (top-level), event = sub-event (succeeded, failed, etc.)
  // - Sproom: documentId (top-level), type = "DocumentStatusChanged"
  //           Need to fetch document state via GET /api/documents/{id}/state
  const submissionId = event.guid || event.data?.id || (event as any).documentId || '';
  const sproomType = (event as any).type;
  const now = new Date();

  // ── For Sproom: fetch the document state to get the actual status ──
  // Sproom's DocumentStatusChanged webhook just tells us the status changed;
  // we need to call GET /api/documents/{id}/state to get the actual status.
  let status: string | undefined = event.event;
  let details: string | undefined = event.details;

  if (sproomType === 'DocumentStatusChanged' && sproomClient?.isConfigured && submissionId) {
    try {
      const states = await sproomClient.getDocumentState(submissionId);
      if (states && states.length > 0) {
        const latest = states[states.length - 1]; // last entry = most recent
        status = latest.state || undefined;
        details = latest.message || undefined;
        logger.info('[WEBHOOK] Sproom document state fetched', {
          submissionId,
          status,
          message: details,
        });
      }
    } catch (err) {
      logger.warn('[WEBHOOK] Sproom getDocumentState failed', {
        submissionId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Continue with the event type as fallback
      status = 'Sent'; // Assume sent if we can't fetch state
    }
  }

  // Map Storecove sub-events to AlphaFlow EInvoiceSendStatus
  let newStatus: string;
  let updateData: Record<string, unknown> = {};
  let dbStatus: string | null = null;

  switch (status) {
    // ── Storecove statuses ──
    case 'succeeded':
      newStatus = 'DELIVERED';
      dbStatus = 'DELIVERED';
      updateData = { status: 'DELIVERED', deliveredAt: now };
      break;

    case 'accepted':
      newStatus = 'ACCEPTED';
      dbStatus = 'ACCEPTED';
      updateData = { status: 'ACCEPTED', acceptedAt: now };
      break;

    case 'rejected':
      newStatus = 'REJECTED';
      dbStatus = 'REJECTED';
      updateData = { status: 'REJECTED', errorMessage: details || 'Recipient rejected the invoice' };
      break;

    case 'failed':
    case 'undeliverable':
    case 'expired':
    case 'no_action_taken':
      newStatus = 'FAILED';
      dbStatus = 'FAILED';
      updateData = { status: 'FAILED', errorMessage: details || `Invoice delivery ${status}` };
      break;

    case 'cleared':
      logger.info('[WEBHOOK] Document cleared (intermediate status)', { submissionId, status });
      return NextResponse.json({ received: true });

    case 'processing':
    case 'in_process':
    case 'started':
    case 'under_query':
    case 'conditionally_accepted':
    case 'partially_paid':
    case 'paid':
      logger.info('[WEBHOOK] Intermediate corner-4 status received', { submissionId, status });
      return NextResponse.json({ received: true });

    // ── Sproom statuses (DocumentStatusType enum) ──
    case 'Sent':
      // Document was sent by Sproom to the receiving AP
      newStatus = 'DELIVERED';
      dbStatus = 'DELIVERED';
      updateData = { status: 'DELIVERED', deliveredAt: now };
      break;

    case 'Received':
      // Document was received by the receiving AP
      newStatus = 'DELIVERED';
      dbStatus = 'DELIVERED';
      updateData = { status: 'DELIVERED', deliveredAt: now };
      break;

    case 'TransmissionCompleted':
      // Transmission completed (final delivery confirmation)
      newStatus = 'DELIVERED';
      dbStatus = 'DELIVERED';
      updateData = { status: 'DELIVERED', deliveredAt: now };
      break;

    case 'Approved':
      // Document was approved by the recipient
      newStatus = 'ACCEPTED';
      dbStatus = 'ACCEPTED';
      updateData = { status: 'ACCEPTED', acceptedAt: now };
      break;

    case 'Rejected':
      // Document was rejected by the recipient
      newStatus = 'REJECTED';
      dbStatus = 'REJECTED';
      updateData = { status: 'REJECTED', errorMessage: details || 'Recipient rejected the invoice' };
      break;

    case 'Error':
    case 'RuntimeError':
    case 'SendError':
    case 'SendNemHandelError':
    case 'SendSproomError':
    case 'SchematronValidationError':
    case 'OIOSchemaValidationError':
    case 'CustomValidationError':
      newStatus = 'FAILED';
      dbStatus = 'FAILED';
      updateData = { status: 'FAILED', errorMessage: details || `Document error: ${status}` };
      break;

    case 'Created':
    case 'EndpointNotFound':
    case 'Incomplete':
    case 'TransmissionStarted':
      // Intermediate statuses — log but don't update
      logger.info('[WEBHOOK] Intermediate status received', { submissionId, status });
      return NextResponse.json({ received: true });

    default:
      // For backward compat with old API format, check event.data.status
      if (event.data?.status) {
        const oldStatus = event.data.status;
        switch (oldStatus) {
          case 'delivered':
            newStatus = 'DELIVERED';
            dbStatus = 'DELIVERED';
            updateData = { status: 'DELIVERED', deliveredAt: now };
            break;
          case 'accepted':
            newStatus = 'ACCEPTED';
            dbStatus = 'ACCEPTED';
            updateData = { status: 'ACCEPTED', acceptedAt: now };
            break;
          case 'rejected':
            newStatus = 'REJECTED';
            dbStatus = 'REJECTED';
            updateData = {
              status: 'REJECTED',
              errorMessage: event.data.rejection_reason || 'Recipient rejected the invoice',
            };
            break;
          case 'undeliverable':
          case 'expired':
          case 'failed':
            newStatus = 'FAILED';
            dbStatus = 'FAILED';
            updateData = {
              status: 'FAILED',
              errorMessage: event.data.rejection_reason || `Invoice delivery ${oldStatus}`,
            };
            break;
          case 'processing':
            newStatus = 'SENDING';
            dbStatus = 'SENDING';
            updateData = { status: 'SENDING' };
            break;
          default:
            logger.warn('[STORECOVE_WEBHOOK] Unknown status received', { status, oldStatus });
            return NextResponse.json({ received: true });
        }
      } else {
        logger.warn('[STORECOVE_WEBHOOK] Unknown status received', { status });
        return NextResponse.json({ received: true });
      }
  }

  if (!submissionId) {
    logger.warn('[STORECOVE_WEBHOOK] No submission GUID in webhook', {
      event_type: event.event_type,
      event: event.event,
    });
    return NextResponse.json({ received: true });
  }

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
      storecoveEvent: status,
      storecoveDetails: event.details || null,
      rejectionReason: event.data?.rejection_reason || null,
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
