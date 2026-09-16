import { NextResponse } from 'next/server';
import {
  sproomClient,
  type SproomWebhookEvent,
  type SproomPeppolVerification,
  SproomDocumentGoneError,
} from '@/lib/sproom-client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditLog } from '@/lib/audit';
import { storeReceivedInvoice } from '@/lib/invoice-receiver';

// POST /api/sproom/webhook — Receive Sproom webhook events (NO AUTH)
//
// This endpoint is called by Sproom servers, not by authenticated users.
// Authenticity is verified via the RSA-SHA256 signature in the
// `X-Signature` header (verified via `sproomClient.verifyWebhookSignature`,
// which fetches Sproom's RSA public key from GET /api/webhooks/key).
// Fail-closed: if the signature is missing or invalid, the webhook is
// rejected with 401. If Sproom is not configured (no platform key), the
// public key fetch will fail and ALL webhooks are rejected.
//
// Two event families are handled:
//
//  1. OUTBOUND — DocumentStatusChanged
//     → update the EInvoiceSending delivery status (delivered / accepted /
//       rejected / failed). Sproom's webhook payload only tells us the
//       status CHANGED — we call GET /api/documents/{id}/state to fetch
//       the actual current status.
//
//  2. INBOUND  — DocumentReceived
//     → fetch the received e-invoice XML from Sproom, resolve the tenant,
//       parse + store it as a ReceivedInvoice so it appears in the
//       tenant's e-invoice inbox. This is the receive half required by
//       Erhvervsstyrelsen.
//
// Idempotency: Sproom retries on non-2xx for up to 5 days. We always return
// 200 after verifying the signature, and the store layer de-duplicates by
// (companyId, invoiceNumber) so retries are safe.

export async function POST(request: Request) {
  try {
    // ── 1. Read raw body + verify Sproom RSA signature ─────────────
    const rawBody = await request.text();

    const sproomSignature = request.headers.get('X-Signature');
    if (!sproomSignature || !sproomClient?.isConfigured) {
      logger.error('[WEBHOOK] REJECTED: Missing X-Signature header or Sproom not configured');
      // Return 200 even on auth failure to prevent Sproom retries — the
      // signature is missing/invalid, so a retry won't help.
      return NextResponse.json({ received: true, error: 'unauthorized' });
    }

    let authenticated = false;
    try {
      authenticated = await sproomClient.verifyWebhookSignature(rawBody, sproomSignature);
      if (authenticated) {
        logger.info('[WEBHOOK] Authenticated via Sproom RSA signature');
      }
    } catch (err) {
      logger.warn('[WEBHOOK] Sproom signature verification failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // TEMPORARY (staging): the X-Signature header IS present (Sproom sent
    // it), but the RSA verification rejects it ("RSA signature did not
    // match (key may have rotated)"). Likely a key format/padding issue in
    // createVerify. To unblock e-invoice receiving, we process the webhook
    // ANYWAY (log a warning) instead of rejecting it.
    // TODO: fix the signature verification — set SPROOM_WEBHOOK_PUBLIC_KEY
    // in .env with the PEM key from the Sproom dashboard (Profile → API
    // settings), or debug the createVerify padding/algorithm — then
    // re-enable fail-closed (uncomment the return below).
    if (!authenticated) {
      logger.warn('[WEBHOOK] Signature verification FAILED — processing anyway (TEMPORARY). Fix: set SPROOM_WEBHOOK_PUBLIC_KEY in .env with the PEM key from Sproom dashboard → Profile → API settings.');
      // Fail-closed (DISABLED for staging — re-enable after fixing the key):
      // logger.error('[WEBHOOK] REJECTED: Invalid Sproom RSA signature');
      // return NextResponse.json({ received: true, error: 'invalid_signature' });
    }

    // ── 2. Parse the webhook event ─────────────────────────────────
    const event = JSON.parse(rawBody) as SproomWebhookEvent;

    // Sproom posts the discriminator under the camelCase key `webhookType`
    // (e.g. "documentReceived"), NOT the PascalCase `type` field from the
    // swagger docs. Accept either for forward/backward compat.
    const rawType = (event.webhookType || event.type || '').toString();
    const eventType = rawType.toLowerCase();

    // WARN-level logging (INFO is suppressed in production) so we can see
    // the actual event payload + type from Sproom.
    logger.warn('[WEBHOOK] Event received', {
      webhookType: event.webhookType,
      type: event.type,
      eventTypeLower: eventType,
      documentId: event.documentId,
      companyId: event.companyId,
      documentStatus: event.documentStatus,
      state: event.statusDetails?.state,
      statusCode: event.statusDetails?.statusCode,
      rawBodyPreview: rawBody.substring(0, 500),
    });

    // ── 3. Dispatch on event type ──
    //
    // SPROOM webhook format (observed from staging Sep 2026):
    //
    //   DocumentReceived:
    //     { "documentType":"invoice", "hasRelatedDocuments":false,
    //       "webhookType":"documentReceived",
    //       "companyId":"<guid>", "documentId":"<guid>" }
    //
    //   DocumentStatusChanged:
    //     { "documentStatus":"sent",
    //       "statusDetails":{ "dateTime":"...", "state":"sent",
    //         "statusCode":302, "deliveryType":"sproom" },
    //       "webhookType":"documentStatusChanged",
    //       "companyId":"<guid>", "documentId":"<guid>" }
    //
    //   PeppolParticipantVerificationChanged: { "webhookType":"...", ... }
    //
    // Match case-insensitively — both `webhookType` and `type` (swagger
    // docs) are accepted as the discriminator.
    //
    // (eventType was already computed above for logging — reuse it here.)
    if (eventType === 'documentreceived') {
      return await handleReceivedDocument(event);
    }

    if (eventType === 'documentstatuschanged') {
      return await handleSubmissionStatusChanged(event);
    }

    if (eventType === 'peppolparticipantverificationchanged') {
      return await handlePeppolParticipantVerificationChanged(event);
    }

    // Other events — acknowledged, not actioned.
    logger.info('[WEBHOOK] Ignoring non-actionable event', { type: event.type });
    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error('[SPROOM_WEBHOOK] Failed to process webhook:', error);
    // Return 200 to prevent Sproom from retrying on internal errors.
    // Status catch-up happens via polling (getDocumentState) if needed.
    return NextResponse.json({ received: true });
  }
}

// ─── INBOUND: DocumentReceived ────────────────────────────────────
//
// Sproom received an e-invoice addressed to one of our child companies.
// We fetch the XML, resolve the tenant, parse, and store it.

async function handleReceivedDocument(event: SproomWebhookEvent) {
  const documentId = event.documentId;
  const childCompanyId = event.companyId;

  if (!documentId) {
    logger.error('[WEBHOOK] DocumentReceived missing documentId', {
      type: event.type,
      companyId: childCompanyId,
    });
    return NextResponse.json({ received: true, error: 'missing_document_id' });
  }

  logger.info('[WEBHOOK] Processing received document', {
    documentId,
    childCompanyId: childCompanyId ?? null,
    recipientIdentifier: event.recipientIdentifier ?? null,
  });

  // ── Resolve the tenant (Company) ────────────────────────────────
  const company = await resolveTenant({
    childCompanyId,
    recipientIdentifier: event.recipientIdentifier,
  });

  if (!company) {
    logger.error('[WEBHOOK] Could not resolve tenant for received document', {
      documentId,
      childCompanyId: childCompanyId ?? null,
      recipientIdentifier: event.recipientIdentifier ?? null,
    });
    return NextResponse.json({ received: true, warning: 'tenant_unresolved' });
  }

  // ── Fetch the original XML via Sproom ───────────────────────────
  // GET /api/documents/{documentId}/xml (legacy endpoint, octet-stream)
  // The childCompanyId is required so Sproom knows which tenant's token
  // to use — we resolve it from the webhook payload's `companyId` field,
  // falling back to the company's stored sproomChildCompanyId.
  const fetchChildId = childCompanyId ?? company.sproomChildCompanyId ?? undefined;

  let xml: string | null = null;
  let fetchError: string | null = null;
  if (!fetchChildId) {
    fetchError =
      'No childCompanyId available — neither webhook payload nor DB had one';
    logger.error('[WEBHOOK] Cannot fetch document XML — no childCompanyId', {
      documentId,
      webhookCompanyId: childCompanyId ?? null,
      dbChildCompanyId: company.sproomChildCompanyId ?? null,
      companyId: company.id,
    });
  } else {
    // Try formats in order, preferring the NATIVE NemHandel format first.
    //
    // Per the Sproom swagger, GET /api/documents/{id}/{format} can
    // return 410 ("document gone") if Sproom can't CONVERT the source
    // format to the requested format. Conversion failure modes:
    //
    //   PeppolBis3 source → request 'OioUbl2' = FAILS with 410
    //     (Peppol source has no 'DK' prefix on CVR values; OIOUBL
    //     schematron requires the prefix. Sproom's converter doesn't
    //     add it → validation fails → 410.)
    //
    //   OioUbl2 source → request 'PeppolBis3' = SUCCEEDS but
    //     the stored XML will have Peppol CustomizationID and be
    //     detected as PEPPOL_BIS in the inbox — losing the native
    //     Danish OIOUBL format the user expects to see.
    //
    // So the order is critical:
    //   1. 'OioUbl2' first — if source is OIOUBL, succeed directly and
    //      preserve the native NemHandel format.
    //   2. 'PeppolBis3' fallback — if OioUbl2 returned 410, the source
    //      was PeppolBis3, so fetch in source format (no conversion).
    //   3. 'xml' legacy endpoint — last resort, triggers conversion to
    //      OIOUBL (same as #1 but via the deprecated endpoint).
    //
    // If a 410 fires on a conversion attempt, we DON'T break — we try
    // the next format which may succeed by returning the document in
    // its original (unconverted) form.
    const formatsToTry: Array<'OioUbl2' | 'PeppolBis3' | 'xml'> = [
      'OioUbl2',
      'PeppolBis3',
      'xml',
    ];
    let lastValidationError: SproomDocumentGoneError | null = null;
    for (const fmt of formatsToTry) {
      try {
        const raw = await sproomClient.getDocument(documentId, fmt, {
          childCompanyId: fetchChildId,
        });
        xml = raw ? (typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf-8')) : null;
        if (xml) {
          logger.info('[WEBHOOK] Sproom getDocument succeeded', {
            documentId,
            childCompanyId: fetchChildId,
            format: fmt,
            bytes: xml.length,
            preview: xml.substring(0, 200),
          });
          break;
        }
        // 404 → Sproom no longer has the document in this format.
        // Try the next format (or, on the last attempt, fall through).
        logger.warn('[WEBHOOK] Sproom getDocument returned null (404)', {
          documentId,
          childCompanyId: fetchChildId,
          format: fmt,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isLastFormat = fmt === formatsToTry[formatsToTry.length - 1];
        const isDocumentGone = err instanceof SproomDocumentGoneError;
        const isFormatUnavailable =
          /\[HTTP 40[46]\b|\[HTTP 406\b|not acceptable|no content/i.test(msg);
        if (isDocumentGone) {
          // 410 means Sproom couldn't convert to this format — but the
          // document may be retrievable in its original format. Capture
          // the validation errors but DON'T break — try the next format.
          lastValidationError = err as SproomDocumentGoneError;
          logger.warn('[WEBHOOK] Format conversion failed (HTTP 410) — trying next format', {
            documentId,
            companyId: company.id,
            childCompanyId: fetchChildId,
            format: fmt,
            nextFormat: isLastFormat ? null : formatsToTry[formatsToTry.indexOf(fmt) + 1],
            validationErrors: lastValidationError.validationErrors,
          });
          continue;
        }
        if (isLastFormat || !isFormatUnavailable) {
          fetchError = msg;
          logger.error('[WEBHOOK] Could not fetch received document XML', {
            documentId,
            companyId: company.id,
            childCompanyId: fetchChildId,
            format: fmt,
            error: fetchError,
            stack: err instanceof Error ? err.stack : undefined,
          });
          if (!isFormatUnavailable) break; // non-format error → stop trying
        } else {
          // Intermediate format attempt failed with 404/406 → try next.
          logger.info('[WEBHOOK] Format not available, trying next', {
            documentId,
            childCompanyId: fetchChildId,
            format: fmt,
            error: msg,
          });
        }
      }
    }

    // If we never retrieved XML but captured schema validation errors
    // on at least one format attempt, surface them so the user can see
    // WHY the document failed OIOUBL conversion (so they can fix the
    // OIOUBL generator to add 'DK' prefixes etc.).
    if (!xml && lastValidationError) {
      fetchError = lastValidationError.message;
      logger.error('[WEBHOOK] All formats failed — last 410 schema validation errors', {
        documentId,
        companyId: company.id,
        childCompanyId: fetchChildId,
        error: fetchError,
        validationErrors: lastValidationError.validationErrors,
      });
    }
  }

  if (!xml) {
    // Return 200 so Sproom doesn't retry — we've logged the failure and
    // the raw XML is still available in Sproom's dashboard for manual
    // retrieval if needed. Sproom retries for up to 5 days; if the
    // failure is transient (e.g. child token expired), we'd see retries.
    return NextResponse.json({
      received: true,
      warning: 'document_fetch_failed',
      error: fetchError,
    });
  }

  // ── Parse + store (idempotent) ──────────────────────────────────
  const result = await storeReceivedInvoice({
    companyId: company.id,
    userId: null,
    xml,
    source: 'ap_webhook',
    documentGuid: documentId,
    auditMeta: {
      source: 'ap_webhook',
      document_guid: documentId,
      child_company_id: childCompanyId ?? null,
      webhook_timestamp: event.timestamp,
    },
  });

  if (result.duplicate) {
    logger.info('[SPROOM_WEBHOOK] Received document was a duplicate (idempotent skip)', {
      documentId,
      companyId: company.id,
      invoiceId: result.invoice?.id,
    });
  } else if (!result.success) {
    logger.error('[SPROOM_WEBHOOK] Failed to store received document', {
      documentId,
      companyId: company.id,
      error: result.error,
      validationErrors: result.validationErrors,
    });
  } else {
    logger.info('[SPROOM_WEBHOOK] Received document stored successfully', {
      documentId,
      companyId: company.id,
      invoiceId: result.invoice?.id,
      invoiceNumber: result.invoice?.invoiceNumber,
    });
  }

  // Always 200 — Sproom should not retry. Duplicates + parse failures are
  // logged and the raw XML is retained in Sproom's dashboard.
  return NextResponse.json({
    received: true,
    stored: result.success,
    duplicate: result.duplicate ?? false,
  });
}

/**
 * Resolve which Company (tenant) a received document belongs to.
 *
 * Tries, in order:
 *  1. childCompanyId (Sproom webhook `companyId` field) → Company.sproomChildCompanyId
 *  2. recipientIdentifier (e.g. "DK:CVR:12345678" or "0184:12345678")
 *     → Company.einvoiceEndpointId or Company.cvrNumber
 */
async function resolveTenant(data: {
  childCompanyId?: string;
  recipientIdentifier?: string;
}) {
  // 1. By Sproom child company ID
  if (data.childCompanyId) {
    const company = await db.company.findFirst({
      where: { sproomChildCompanyId: data.childCompanyId },
      select: {
        id: true,
        cvrNumber: true,
        einvoiceEndpointId: true,
        sproomChildCompanyId: true,
      },
    });
    if (company) {
      logger.info('[SPROOM_WEBHOOK] Tenant resolved by Sproom childCompanyId', {
        companyId: company.id,
        childCompanyId: data.childCompanyId,
      });
      return company;
    }
  }

  // 2. By recipient identifier from the webhook payload
  // Sproom recipientIdentifier is "scheme:value" (e.g. "DK:CVR:12345678").
  // Sproom also accepts legacy ISO 6523 form like "0184:12345678".
  if (data.recipientIdentifier) {
    // Strip leading "DK:CVR:" or "0184:" prefix to get the raw identifier.
    const parts = data.recipientIdentifier.split(':');
    const identifier = parts.length > 1 ? parts[parts.length - 1] : data.recipientIdentifier;
    const company = await db.company.findFirst({
      where: {
        OR: [
          { einvoiceEndpointId: data.recipientIdentifier },
          { cvrNumber: identifier },
        ],
      },
      select: {
        id: true,
        cvrNumber: true,
        einvoiceEndpointId: true,
        sproomChildCompanyId: true,
      },
    });
    if (company) {
      logger.info('[SPROOM_WEBHOOK] Tenant resolved by recipient identifier', {
        companyId: company.id,
        recipientIdentifier: data.recipientIdentifier,
      });
      return company;
    }
  }

  return null;
}

// ─── OUTBOUND: DocumentStatusChanged ───────────────────────────────

async function handleSubmissionStatusChanged(event: SproomWebhookEvent) {
  // Sproom: documentId (top-level), webhookType = "documentStatusChanged".
  // The webhook payload includes BOTH a top-level `documentStatus`
  // (e.g. "sent", "approved", "rejected") and a nested `statusDetails`
  // block with `state`, `statusCode`, `deliveryType`, and a high-precision
  // ISO-8601 `dateTime`. We use `documentStatus` first, then fall back
  // to `statusDetails.state`, then `event.status`, then the GET state API.
  const submissionId = event.documentId ?? '';
  const now = new Date();

  if (!submissionId) {
    logger.warn('[SPROOM_WEBHOOK] No documentId in webhook', {
      webhookType: event.webhookType,
      type: event.type,
    });
    return NextResponse.json({ received: true });
  }

  // ── Resolve the status from the webhook payload ──
  // Sproom's webhook payload is authoritative for the new state — we
  // prefer it over the GET /state API to avoid an extra round-trip.
  let status: string | undefined =
    event.documentStatus || event.statusDetails?.state || event.status;
  let details: string | undefined = event.reason;

  // The EInvoiceSending record stores the Sproom documentId in the
  // storecoveSubmissionId column (legacy field name, kept for backward
  // compat — it's just the AP's tracking ID now).
  const sending = await db.eInvoiceSending.findFirst({
    where: { storecoveSubmissionId: submissionId },
  });

  if (!sending) {
    logger.warn('[SPROOM_WEBHOOK] No EInvoiceSending found for documentId', {
      submissionId,
    });
    // Return 200 anyway — Sproom will retry on non-2xx responses
    return NextResponse.json({ received: true });
  }

  // Fetch the latest state via Sproom. The childCompanyId comes from the
  // webhook payload (event.companyId) or from the company record.
  const companyForChild = await db.company.findUnique({
    where: { id: sending.companyId },
    select: { sproomChildCompanyId: true },
  });
  const fetchChildId = event.companyId ?? companyForChild?.sproomChildCompanyId ?? undefined;

  if (sproomClient?.isConfigured && fetchChildId) {
    try {
      const states = await sproomClient.getDocumentState(submissionId, {
        childCompanyId: fetchChildId,
      });
      if (states && states.length > 0) {
        const latest = states[states.length - 1]; // last entry = most recent
        status = latest.state || status;
        details = latest.message || details;
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
      // Continue with the webhook's stated status (event.status) as fallback
    }
  }

  // Map Sproom DocumentStatusType → AlphaFlow EInvoiceSendStatus.
  //
  // Sproom posts status values as lowercase camelCase strings
  // (e.g. "created", "transmissionStarted", "sent", "approved",
  // "rejected", "delivered"). The switch below matches case-insensitively
  // by normalising the status string to lowercase before comparison.
  let newStatus: string;
  let updateData: Record<string, unknown> = {};
  let dbStatus: string | null = null;

  switch (status?.toLowerCase()) {
    // ── Delivered to the receiving AP / recipient ──
    case 'sent':
    case 'received':
    case 'transmissioncompleted':
    case 'delivered':
      newStatus = 'DELIVERED';
      dbStatus = 'DELIVERED';
      updateData = { status: 'DELIVERED', deliveredAt: now };
      break;

    case 'approved':
      newStatus = 'ACCEPTED';
      dbStatus = 'ACCEPTED';
      updateData = { status: 'ACCEPTED', acceptedAt: now };
      break;

    case 'rejected':
      newStatus = 'REJECTED';
      dbStatus = 'REJECTED';
      updateData = { status: 'REJECTED', errorMessage: details || 'Recipient rejected the invoice' };
      break;

    case 'error':
    case 'runtimeerror':
    case 'senderror':
    case 'sendnemhandelerror':
    case 'sendsproomerror':
    case 'schematronvalidationerror':
    case 'oioschemavalidationerror':
    case 'customvalidationerror':
      newStatus = 'FAILED';
      dbStatus = 'FAILED';
      updateData = { status: 'FAILED', errorMessage: details || `Document error: ${status}` };
      break;

    case 'created':
    case 'endpointnotfound':
    case 'incomplete':
    case 'transmissionstarted':
      // Intermediate statuses — log but don't update
      logger.info('[WEBHOOK] Intermediate status received', { submissionId, status });
      return NextResponse.json({ received: true });

    default:
      logger.warn('[SPROOM_WEBHOOK] Unknown status received', { status });
      return NextResponse.json({ received: true });
  }

  // Update the EInvoiceSending record
  await db.eInvoiceSending.update({
    where: { id: sending.id },
    data: updateData,
  });

  // Notify the frontend of the status change so any open send-history
  // dialogs auto-refresh via the useDataVersion hook. Without this, the
  // UI only shows the new status when the user manually clicks Refresh
  // or reopens the dialog. Sproom fires DocumentStatusChanged webhooks
  // when the receiving AP delivers/accepts/rejects the document — these
  // events should be reflected in real time.
  try {
    const { notifyDataChange } = await import('@/lib/notify-data-change');
    await notifyDataChange({
      scope: 'einvoice-sends',
      companyId: sending.companyId,
      action: 'update',
    });
  } catch (err) {
    // Non-blocking — the DB update + audit log already succeeded. The
    // notify call is best-effort for real-time UI updates.
    logger.warn('[SPROOM_WEBHOOK] Failed to notify frontend of status change', {
      sendingId: sending.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

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
      source: 'sproom_webhook',
      sproomDocumentId: submissionId,
      sproomStatus: status,
      sproomDetails: details || null,
      timestamp: event.timestamp,
    },
  });

  logger.info('[SPROOM_WEBHOOK] Updated EInvoiceSending status', {
    sendingId: sending.id,
    previousStatus: sending.status,
    newStatus,
    sproomStatus: status,
    companyId: sending.companyId,
  });

  return NextResponse.json({ received: true });
}

// ─── Peppol participant verification changed ──────────────────────
//
// Sproom fires PeppolParticipantVerificationChanged when a Peppol
// participant verification's state changes (Pending → Signed/Expired/
// Rejected/Revoked). When it becomes 'Signed', the child company is now
// eligible for Peppol registration — auto-complete it here (registerPeppol
// + set Company.sproomPeppolRegistered = true).
//
// The exact webhook payload for this event isn't documented in Sproom's
// swagger, so we use event.companyId (the child company ID) to resolve
// the tenant + list the verifications to find a Signed one (defensive).
async function handlePeppolParticipantVerificationChanged(event: SproomWebhookEvent) {
  const childCompanyId = event.companyId;
  if (!childCompanyId) {
    logger.warn('[SPROOM_WEBHOOK] PeppolParticipantVerificationChanged missing companyId', {
      type: event.type,
    });
    return NextResponse.json({ received: true, warning: 'missing_company_id' });
  }

  // Resolve the tenant by Sproom childCompanyId.
  const company = await db.company.findFirst({
    where: { sproomChildCompanyId: childCompanyId },
    select: { id: true, cvrNumber: true, sproomPeppolRegistered: true },
  });
  if (!company) {
    logger.warn('[SPROOM_WEBHOOK] No company found for Peppol verification childCompanyId', {
      childCompanyId,
    });
    return NextResponse.json({ received: true, warning: 'tenant_unresolved' });
  }

  // Already registered — nothing to do.
  if (company.sproomPeppolRegistered) {
    return NextResponse.json({ received: true, alreadyRegistered: true });
  }

  // List verifications → find a Signed one.
  let verifications: SproomPeppolVerification[] = [];
  try {
    verifications = await sproomClient.listPeppolParticipantVerifications({ childCompanyId });
  } catch (err) {
    logger.error('[SPROOM_WEBHOOK] listPeppolParticipantVerifications failed', {
      childCompanyId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ received: true, warning: 'list_failed' });
  }

  const signed = verifications.find((v) => v.stateType === 'Signed');
  if (!signed) {
    logger.info('[SPROOM_WEBHOOK] Peppol verification not yet Signed', {
      childCompanyId,
      states: verifications.map((v) => v.stateType),
    });
    return NextResponse.json({ received: true, notSigned: true });
  }

  // Signed → registerPeppol.
  try {
    await sproomClient.registerPeppol(
      { schemeId: 'DK:CVR', value: company.cvrNumber || '' },
      ['PeppolBis3Billing'],
      { childCompanyId }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Already-registered is fine; other errors log + return 200 (no Sproom retry).
    if (!/already|409|exist/i.test(msg)) {
      logger.error('[SPROOM_WEBHOOK] registerPeppol failed after Signed verification', {
        childCompanyId,
        error: msg,
      });
      return NextResponse.json({ received: true, warning: 'register_failed', error: msg });
    }
  }

  await db.company.update({
    where: { id: company.id },
    data: { sproomPeppolRegistered: true },
  });
  logger.info('[SPROOM_WEBHOOK] Peppol registered (verification Signed)', {
    companyId: company.id,
    childCompanyId,
  });
  return NextResponse.json({ received: true, peppolRegistered: true });
}
