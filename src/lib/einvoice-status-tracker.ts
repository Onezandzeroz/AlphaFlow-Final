/**
 * EInvoice Status Tracker — unified Sproom-status-mapping + event-historik-applier.
 *
 * Dette er det centrale bibliotek der oversætter Sproom's DocumentStatusType
 * (53 værdier) til AlphaFlow's EInvoiceSendStatus (12 værdier), persisterer
 * hver transition til EInvoiceSendEvent-tabellen, og opdaterer EInvoiceSending
 * med den nye status + tilhørende timestamps + sproomRawStatus.
 *
 * Designmål:
 *   1. Ét sted at mappe Sproom → AlphaFlow (tidigere dupliceret i webhook +
 *      sproom-client.mapStatusToAlphaFlow — nu samlet her).
 *   2. Persistent event-historik (GAP I-3 fix — Sproom's getDocumentState()
 *      data persisters NU i stedet for at smides væk).
 *   3. Granulær raw status (GAP I-11 fix — sproomRawStatus gemmes på sending).
 *   4. Idempotente transitions (samme status flere gange = no-op, ikke duplikat-events).
 *   5. PAID-syntese — når en Invoice markeres PAID lokalt, syntetiseres det
 *      over på alle dens EInvoiceSendings der er i ACCEPTED/DELIVERED state.
 *
 * Brugere:
 *   - src/app/api/sproom/webhook/route.ts (DocumentStatusChanged events)
 *   - src/lib/sproom-outbox-scheduler.ts (safety-net poller)
 *   - src/lib/einvoice-sender.ts (local_send event ved successful transmit)
 *   - src/app/api/invoices/[id]/route.ts (local_paid syntese ved PATCH paidDate)
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditLog } from '@/lib/audit';
import { Prisma } from '@prisma/client';
import {
  type SproomDocumentStatus,
  type SproomDocumentStateEntry,
} from '@/lib/sproom-client';

// ─── Types ────────────────────────────────────────────────────────────

/** The 12-value AlphaFlow enum (mirrors Prisma EInvoiceSendStatus). */
export type EInvoiceSendStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'PENDING_APPROVAL'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED';

/** Where this status observation came from. */
export type EInvoiceEventSource =
  | 'sproom_webhook' // DocumentStatusChanged webhook (push)
  | 'sproom_poller' // outbox safety-net poller (pull)
  | 'local_send' // processEInvoiceSend succeeded
  | 'local_paid' // PAID-syntese (Invoice marked PAID locally)
  | 'local_retry' // retry attempt logged
  | 'local_cancel'; // user cancelled the sending

/** Result returned by applyStatusTransition — what changed. */
export interface StatusTransitionResult {
  sendingId: string;
  previousStatus: EInvoiceSendStatus | null;
  newStatus: EInvoiceSendStatus;
  /** True if the status actually changed (false = same status, no-op). */
  changed: boolean;
  /** True if a new EInvoiceSendEvent row was created. */
  eventCreated: boolean;
  /** The mapped AlphaFlow status — useful for toast notifications. */
  mappedStatus: EInvoiceSendStatus;
  /** The raw Sproom state string (preserved for the UI). */
  sproomRawState: string | null;
}

// ─── Status Mapping (GAP I-6 + I-11 fix) ──────────────────────────────
//
// Sproom's DocumentStatusType har ~53 værdier. Vi mapper til 12 AlphaFlow-
// buckets. Vigtigt: vi skiller PENDING_APPROVAL (modtager har ikke taget
// stilling endnu) fra ACCEPTED (modtager har godkendt) — det var en bug i
// den gamle mapping (sproom-client.ts:2106 mappede PendingApproval → ACCEPTED).

const STATUS_MAP: Record<SproomDocumentStatus, EInvoiceSendStatus> = {
  // ── Pre-send / Sproom-modtagelse ──
  Created: 'SENT',
  EndpointAdded: 'SENT',
  SchematronEnrichmentIsDone: 'SENT',
  ReturnedToSchematronEnrichment: 'SENT',

  // ── In-network transmission ──
  TransmissionStarted: 'IN_TRANSIT',
  Sent: 'DELIVERED', // Sproom 'Sent' = dokument sendt til modtager AP
  Received: 'DELIVERED', // Modtaget af modtager AP
  TransmissionCompleted: 'DELIVERED', // Fuldført transmission

  // ── Recipient action ──
  PendingApproval: 'PENDING_APPROVAL',
  Approved: 'ACCEPTED',
  Rejected: 'REJECTED',
  ApplicationReponseBusinessReject: 'REJECTED',
  ApplicationReponseProfileReject: 'REJECTED',
  ApplicationReponseTechnicalReject: 'REJECTED',

  // ── Validation errors (mapped to FAILED with preserved rawState) ──
  EndpointNotFound: 'FAILED',
  OIOSchemaValidationError: 'FAILED',
  SchematronValidationError: 'FAILED',
  CustomValidationError: 'FAILED',
  DuplicateFileError: 'FAILED',
  SenderMismatchError: 'FAILED',
  DeliveryRestrictionError: 'FAILED',

  // ── Transmission errors ──
  Error: 'FAILED',
  ErrorMax: 'FAILED',
  ErrorMin: 'FAILED',
  RuntimeError: 'FAILED',
  SendError: 'FAILED',
  SendNemHandelError: 'FAILED',
  SendSproomError: 'FAILED',
  SendToFinishOperatorError: 'FAILED',
  ErrorProcessingAttachments: 'FAILED',

  // ── AP-specific send errors ──
  SendEvenexError: 'FAILED',
  SendPageroError: 'FAILED',
  SendBaswareError: 'FAILED',
  SendInExChangeError: 'FAILED',
  SendLetterError: 'FAILED',
  SendStatOilError: 'FAILED',
  SendIbisticError: 'FAILED',
  SendEbuilderError: 'FAILED',
  SendTietoError: 'FAILED',
  SendSwedbankError: 'FAILED',

  // ── Incomplete / package errors ──
  Incomplete: 'FAILED',
  IncompleteReturned: 'FAILED',
  IncompletePackage: 'FAILED',

  // ── Limits ──
  SendLimitExceeded: 'FAILED',
  SendLimitIncreased: 'SENT', // limit raised — doc can proceed
  ReceiveLimitExceeded: 'FAILED',
  ReceiveLimitIncreased: 'SENT',

  // ── Subscription / cancellation ──
  CustomerNotSubscribedToBilsim: 'FAILED',
  CustomerNotSubscribedToUts: 'FAILED',
  Canceled: 'CANCELLED',
  Deleted: 'CANCELLED',
  TestModeError: 'FAILED',
  Timeout: 'FAILED',

  // ── Misc / terminal ──
  Internal: 'FAILED',
};

/**
 * Convert a Sproom status string to PascalCase.
 *
 * Sproom's REST API (getDocumentState) returns status names in PascalCase
 * (e.g. "TransmissionStarted", "Sent", "Approved"), BUT webhook payloads
 * send them in camelCase (e.g. "transmissionStarted", "sent", "approved").
 *
 * The STATUS_MAP below uses PascalCase keys (matching the SproomDocumentStatus
 * type). This helper normalises both formats so lookups succeed regardless of
 * which Sproom surface the status came from.
 *
 * Examples:
 *   "transmissionStarted"  → "TransmissionStarted"
 *   "sent"                 → "Sent"
 *   "TransmissionStarted"  → "TransmissionStarted" (unchanged)
 *   "applicationReponseBusinessReject" → "ApplicationReponseBusinessReject"
 */
function toPascalCase(s: string): string {
  if (!s || typeof s !== 'string') return s;
  // Already starts uppercase → assume PascalCase, return as-is
  if (s[0] === s[0].toUpperCase() && s[0] !== s[0].toLowerCase()) {
    return s;
  }
  // camelCase → PascalCase (uppercase first letter only — the rest is
  // already correct camelCase which matches our PascalCase keys).
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Map a Sproom document status to AlphaFlow's EInvoiceSendStatus.
 *
 * Accepts BOTH PascalCase (REST API) and camelCase (webhook payloads) —
 * the toPascalCase helper normalises before lookup.
 *
 * Returns 'SENT' as a safe default for unknown Sproom states (so we don't
 * accidentally downgrade a successfully-sent document to PENDING).
 */
export function mapSproomStatus(
  sproomStatus: SproomDocumentStatus | string,
): EInvoiceSendStatus {
  const normalized = toPascalCase(sproomStatus);
  const mapped = STATUS_MAP[normalized as SproomDocumentStatus];
  if (mapped) return mapped;
  // Unknown Sproom status — log + default to SENT (don't downgrade)
  logger.warn('[STATUS-TRACKER] Unknown Sproom status — defaulting to SENT', {
    sproomStatus,
    normalized,
  });
  return 'SENT';
}

/**
 * Check whether a Sproom status is terminal (no further transitions expected).
 */
export function isTerminalAlphaFlowStatus(status: EInvoiceSendStatus): boolean {
  return (
    status === 'ACCEPTED' ||
    status === 'REJECTED' ||
    status === 'PAID' ||
    status === 'FAILED' ||
    status === 'CANCELLED'
  );
}

/**
 * Check whether a status transition is "forward" (progress).
 * Used by the outbox poller to avoid downgrading a sending
 * (e.g. if a late webhook arrives with an earlier status than what we have).
 */
const STATUS_ORDER: EInvoiceSendStatus[] = [
  'PENDING',
  'QUEUED',
  'SENDING',
  'SENT',
  'IN_TRANSIT',
  'DELIVERED',
  'PENDING_APPROVAL',
  'ACCEPTED',
  'PAID',
];
const STATUS_RANK: Record<EInvoiceSendStatus, number> = STATUS_ORDER.reduce(
  (acc, s, i) => {
    acc[s] = i;
    return acc;
  },
  {} as Record<EInvoiceSendStatus, number>,
);
// FAILED, REJECTED, CANCELLED are terminal side-states (rank = -1)
STATUS_RANK.FAILED = -1;
STATUS_RANK.REJECTED = -1;
STATUS_RANK.CANCELLED = -1;

export function isForwardTransition(
  from: EInvoiceSendStatus,
  to: EInvoiceSendStatus,
): boolean {
  // Same status = no-op (not a regression)
  if (from === to) return true;
  // Going to a terminal side-state (FAILED/REJECTED/CANCELLED) is always allowed
  if (STATUS_RANK[to] === -1) return true;
  // Coming from a terminal side-state — don't override (terminal is final)
  if (STATUS_RANK[from] === -1) return false;
  // Otherwise: forward only if rank increases
  return STATUS_RANK[to] > STATUS_RANK[from];
}

// ─── Timestamp field per status ───────────────────────────────────────

function timestampFieldFor(status: EInvoiceSendStatus): string | null {
  switch (status) {
    case 'SENDING':
      return 'sentAt';
    case 'IN_TRANSIT':
      return 'inTransitAt';
    case 'DELIVERED':
      return 'deliveredAt';
    case 'PENDING_APPROVAL':
      return 'pendingApprovalAt';
    case 'ACCEPTED':
      return 'acceptedAt';
    case 'REJECTED':
      return 'rejectedAt';
    case 'PAID':
      return 'paidAt';
    default:
      return null;
  }
}

// ─── Core: applyStatusTransition ──────────────────────────────────────

export interface ApplyTransitionInput {
  sendingId: string;
  /** The Sproom state entry (from webhook payload or getDocumentState response). */
  sproomState: SproomDocumentStatus | string;
  /** Numeric Sproom status code (optional, from state-entry.statusCode). */
  sproomStatusCode?: number | null;
  /** Delivery type: 'sproom' (NemHandel) or 'peppol'. */
  deliveryType?: string | null;
  /** Human-readable message (from state-entry.message or webhook reason). */
  message?: string | null;
  /** Schematron validation errors (from state-entry.failedProperties). */
  failedProperties?: SproomDocumentStateEntry['failedProperties'];
  /** When the event occurred (Sproom dateTime, or now() for local events). */
  eventTimestamp?: Date;
  /** Where this observation came from. */
  source: EInvoiceEventSource;
  /** Free-form metadata for forensics. */
  metadata?: Record<string, unknown>;
}

/**
 * Apply a Sproom status transition to an EInvoiceSending — the unified entry
 * point used by both webhook + poller.
 *
 * Behaviour:
 *   1. Loads the sending.
 *   2. Maps the Sproom status to AlphaFlow's enum.
 *   3. Idempotency check: if sending.status === newStatus AND an event with
 *      the same sproomRawState already exists, no-op.
 *   4. Creates an EInvoiceSendEvent row (append-only audit trail).
 *   5. Updates EInvoiceSending: status, sproomRawStatus, relevant timestamp.
 *   6. Audit-logs the transition.
 *
 * Returns the transition result (used by caller for toast notifications).
 */
export async function applyStatusTransition(
  input: ApplyTransitionInput,
): Promise<StatusTransitionResult | null> {
  const {
    sendingId,
    sproomState,
    sproomStatusCode,
    deliveryType,
    message,
    failedProperties,
    eventTimestamp,
    source,
    metadata,
  } = input;

  const newStatus = mapSproomStatus(sproomState);
  const ts = eventTimestamp ?? new Date();

  // Load the sending (we need previousStatus for audit + idempotency check)
  const sending = await db.eInvoiceSending.findUnique({
    where: { id: sendingId },
    select: {
      id: true,
      status: true,
      sproomRawStatus: true,
      companyId: true,
      sentBy: true,
      invoiceId: true,
      recipientName: true,
    },
  });

  if (!sending) {
    logger.warn('[STATUS-TRACKER] EInvoiceSending not found', { sendingId });
    return null;
  }

  const previousStatus = sending.status as EInvoiceSendStatus;

  // ── Idempotency check 1: dedupe by (sendingId, sproomRawState, sproomStatusCode, eventTimestamp) ──
  //
  // Both the webhook handler (push) AND the outbox poller (pull) can observe
  // the SAME Sproom state-entry — they arrive within seconds of each other.
  // Without this check, we'd create duplicate EInvoiceSendEvent rows for the
  // exact same Sproom state transition.
  //
  // The composite key (sendingId + sproomRawState + sproomStatusCode + eventTimestamp)
  // uniquely identifies a Sproom state-entry observation:
  //   - sendingId: which sending it belongs to
  //   - sproomRawState: the Sproom status name (e.g. 'transmissionStarted')
  //   - sproomStatusCode: the numeric code (e.g. 301) — distinguishes states
  //     with the same name but different codes (rare, but possible)
  //   - eventTimestamp: the Sproom-reported dateTime — identical for the same
  //     state-entry regardless of whether we observe it via webhook or poller
  //
  // If an event with the same composite key already exists, skip creation.
  // The sending's current status may already be correct (if webhook processed
  // first) or may need updating (if poller processed first and webhook arrives
  // later with the same state — the regression guard below handles that).
  const existingEvent = await db.eInvoiceSendEvent.findFirst({
    where: {
      sendingId,
      sproomRawState: sproomState,
      sproomStatusCode: sproomStatusCode ?? null,
      eventTimestamp: ts,
    },
    select: { id: true, status: true, source: true },
  });

  if (existingEvent) {
    // Already processed this exact Sproom state-entry — no-op (no duplicate event,
    // no duplicate status update, no duplicate audit log, no duplicate toast).
    logger.info('[STATUS-TRACKER] Duplicate state-entry ignored (already processed)', {
      sendingId,
      sproomState,
      sproomStatusCode: sproomStatusCode ?? null,
      eventTimestamp: ts.toISOString(),
      existingEventId: existingEvent.id,
      existingSource: existingEvent.source,
    });
    return {
      sendingId,
      previousStatus,
      newStatus: previousStatus, // unchanged
      changed: false,
      eventCreated: false,
      mappedStatus: newStatus,
      sproomRawState: sproomState,
    };
  }

  // ── Idempotency check 2: same status + same raw state on the sending = no-op ──
  // (This catches the case where the sending was already updated to this exact
  // status+rawState — e.g. via a different code path or manual update.)
  if (
    previousStatus === newStatus &&
    sending.sproomRawStatus === sproomState
  ) {
    return {
      sendingId,
      previousStatus,
      newStatus,
      changed: false,
      eventCreated: false,
      mappedStatus: newStatus,
      sproomRawState: sproomState,
    };
  }

  // ── Idempotency check 3: regression guard ──
  // Don't downgrade a sending (e.g. ACCEPTED → DELIVERED if a late webhook
  // arrives). Terminal statuses (FAILED/REJECTED/CANCELLED/PAID) are final.
  if (!isForwardTransition(previousStatus, newStatus)) {
    logger.info('[STATUS-TRACKER] Ignoring non-forward transition', {
      sendingId,
      previousStatus,
      newStatus,
      sproomState,
    });
    return {
      sendingId,
      previousStatus,
      newStatus: previousStatus, // keep previous
      changed: false,
      eventCreated: false,
      mappedStatus: newStatus,
      sproomRawState: sproomState,
    };
  }

  // ── Persist the event (append-only audit trail) ──
  // We always create an event row — even if the status didn't change —
  // because the raw Sproom state may have changed (e.g. SENT → SENT with
  // different statusCode). This preserves the full timeline.
  await db.eInvoiceSendEvent.create({
    data: {
      sendingId,
      status: newStatus,
      sproomRawState: sproomState,
      sproomStatusCode: sproomStatusCode ?? null,
      deliveryType: deliveryType ?? null,
      message: message ?? null,
      // Prisma JSON fields don't accept `null` directly — use DbNull sentinel
      // for explicit null (vs JsonNull which means "JSON value null").
      failedProperties: failedProperties
        ? (failedProperties as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
      source,
      eventTimestamp: ts,
      metadata: metadata
        ? (metadata as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
    },
  });

  // ── Update the sending ──
  const updateData: Record<string, unknown> = {
    status: newStatus,
    sproomRawStatus: sproomState,
  };

  // Set the relevant timestamp field (don't overwrite if already set —
  // first occurrence is the canonical timestamp).
  const tsField = timestampFieldFor(newStatus);
  if (tsField) {
    updateData[tsField] = ts;
  }

  // For failure states, persist error message + code on the sending
  // (so the UI can show the reason without joining to events).
  if (newStatus === 'FAILED' || newStatus === 'REJECTED') {
    if (message) updateData.errorMessage = message;
    if (sproomState) updateData.errorCode = sproomState;
  }

  await db.eInvoiceSending.update({
    where: { id: sendingId },
    data: updateData,
  });

  // ── Audit log ──
  await auditLog({
    action: 'UPDATE',
    entityType: 'EInvoiceSending',
    entityId: sendingId,
    userId: sending.sentBy,
    companyId: sending.companyId,
    changes: {
      status: { old: previousStatus, new: newStatus },
      sproomRawStatus: { old: sending.sproomRawStatus, new: sproomState },
    },
    metadata: {
      source,
      sproomState,
      sproomStatusCode: sproomStatusCode ?? null,
      deliveryType: deliveryType ?? null,
      message: message ?? null,
      eventTimestamp: ts.toISOString(),
      ...(metadata ?? {}),
    },
  });

  logger.info('[STATUS-TRACKER] Transition applied', {
    sendingId,
    previousStatus,
    newStatus,
    sproomState,
    source,
  });

  return {
    sendingId,
    previousStatus,
    newStatus,
    changed: true,
    eventCreated: true,
    mappedStatus: newStatus,
    sproomRawState: sproomState,
  };
}

// ─── Local events (no Sproom state) ───────────────────────────────────

/**
 * Record a local event — used when AlphaFlow itself initiates a status
 * change (not driven by Sproom). Examples:
 *   - local_send: processEInvoiceSend succeeded → status SENT
 *   - local_paid: Invoice marked PAID → PAID-syntese on all sendings
 *   - local_retry: retry attempt logged
 *   - local_cancel: user cancelled
 */
export async function applyLocalTransition(input: {
  sendingId: string;
  status: EInvoiceSendStatus;
  message?: string | null;
  source: EInvoiceEventSource;
  eventTimestamp?: Date;
  metadata?: Record<string, unknown>;
}): Promise<StatusTransitionResult | null> {
  const { sendingId, status, message, source, eventTimestamp, metadata } = input;
  const ts = eventTimestamp ?? new Date();

  const sending = await db.eInvoiceSending.findUnique({
    where: { id: sendingId },
    select: {
      id: true,
      status: true,
      companyId: true,
      sentBy: true,
      invoiceId: true,
      recipientName: true,
    },
  });

  if (!sending) {
    logger.warn('[STATUS-TRACKER] EInvoiceSending not found for local transition', {
      sendingId,
      source,
    });
    return null;
  }

  const previousStatus = sending.status as EInvoiceSendStatus;

  // Idempotency: same status = no-op (but still log event for audit)
  if (previousStatus === status) {
    // Still record the event (e.g. a re-send attempt that resulted in same status)
    await db.eInvoiceSendEvent.create({
      data: {
        sendingId,
        status,
        sproomRawState: null, // local event — no Sproom counterpart
        sproomStatusCode: null,
        deliveryType: null,
        message: message ?? null,
        failedProperties: Prisma.DbNull,
        source,
        eventTimestamp: ts,
        metadata: metadata
          ? (metadata as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
      },
    });
    return {
      sendingId,
      previousStatus,
      newStatus: status,
      changed: false,
      eventCreated: true,
      mappedStatus: status,
      sproomRawState: null,
    };
  }

  // Forward-check (terminal statuses are final — local PAID can override though,
  // since PAID-syntese explicitly upgrades ACCEPTED → PAID).
  if (!isForwardTransition(previousStatus, status) && status !== 'PAID') {
    logger.info('[STATUS-TRACKER] Ignoring non-forward local transition', {
      sendingId,
      previousStatus,
      newStatus: status,
      source,
    });
    return {
      sendingId,
      previousStatus,
      newStatus: previousStatus,
      changed: false,
      eventCreated: false,
      mappedStatus: status,
      sproomRawState: null,
    };
  }

  // Persist event + update sending
  await db.eInvoiceSendEvent.create({
    data: {
      sendingId,
      status,
      sproomRawState: null,
      sproomStatusCode: null,
      deliveryType: null,
      message: message ?? null,
      failedProperties: Prisma.DbNull,
      source,
      eventTimestamp: ts,
      metadata: metadata
        ? (metadata as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
    },
  });

  const updateData: Record<string, unknown> = {
    status,
  };
  const tsField = timestampFieldFor(status);
  if (tsField) updateData[tsField] = ts;
  if (message && (status === 'FAILED' || status === 'REJECTED')) {
    updateData.errorMessage = message;
  }

  await db.eInvoiceSending.update({
    where: { id: sendingId },
    data: updateData,
  });

  await auditLog({
    action: 'UPDATE',
    entityType: 'EInvoiceSending',
    entityId: sendingId,
    userId: sending.sentBy,
    companyId: sending.companyId,
    changes: {
      status: { old: previousStatus, new: status },
    },
    metadata: {
      source,
      message: message ?? null,
      eventTimestamp: ts.toISOString(),
      ...(metadata ?? {}),
    },
  });

  logger.info('[STATUS-TRACKER] Local transition applied', {
    sendingId,
    previousStatus,
    newStatus: status,
    source,
  });

  return {
    sendingId,
    previousStatus,
    newStatus: status,
    changed: true,
    eventCreated: true,
    mappedStatus: status,
    sproomRawState: null,
  };
}

// ─── PAID-syntese (Invoice → EInvoiceSending) ─────────────────────────

/**
 * Apply PAID-syntese to all EInvoiceSendings for an Invoice.
 *
 * When a tenant marks an Invoice as PAID locally (via PATCH /api/invoices/[id]
 * with paidDate), this function upgrades all EInvoiceSendings for that invoice
 * from ACCEPTED/DELIVERED/PENDING_APPROVAL → PAID. This closes the loop:
 * tenants see the full lifecycle SENT → DELIVERED → ACCEPTED → PAID in the
 * timeline, even though Sproom itself doesn't know about payments.
 *
 * Idempotent: sendings already in PAID state are skipped.
 */
export async function applyPaidSyntese(
  invoiceId: string,
  paidAt: Date,
  paidByUserId?: string,
): Promise<{ upgraded: number; skipped: number }> {
  // Find all sendings for this invoice that are in a PAID-eligible state
  const eligibleSendings = await db.eInvoiceSending.findMany({
    where: {
      invoiceId,
      status: { in: ['ACCEPTED', 'DELIVERED', 'PENDING_APPROVAL'] },
    },
    select: { id: true, status: true, companyId: true, sentBy: true },
  });

  let upgraded = 0;
  let skipped = 0;

  for (const sending of eligibleSendings) {
    try {
      const result = await applyLocalTransition({
        sendingId: sending.id,
        status: 'PAID',
        message: 'Invoice marked as paid locally',
        source: 'local_paid',
        eventTimestamp: paidAt,
        metadata: { invoiceId, paidByUserId },
      });
      if (result?.changed) {
        upgraded++;
      } else {
        skipped++;
      }
    } catch (err) {
      logger.warn('[STATUS-TRACKER] PAID-syntese failed for sending', {
        invoiceId,
        sendingId: sending.id,
        error: err instanceof Error ? err.message : String(err),
      });
      skipped++;
    }
  }

  logger.info('[STATUS-TRACKER] PAID-syntese applied', {
    invoiceId,
    upgraded,
    skipped,
    eligible: eligibleSendings.length,
  });

  return { upgraded, skipped };
}

// ─── Batch helper (used by poller) ────────────────────────────────────

/**
 * Apply a full state-history to a sending — used by the outbox poller when
 * it fetches getDocumentState() and gets an array of state entries.
 *
 * Applies each entry in chronological order (oldest first). Idempotency
 * is handled per-entry inside applyStatusTransition.
 */
export async function applyStateHistory(
  sendingId: string,
  states: SproomDocumentStateEntry[],
  source: EInvoiceEventSource,
): Promise<{
  applied: number;
  changed: number;
  finalStatus: EInvoiceSendStatus | null;
}> {
  // Sort by dateTime ascending (oldest first) — if dateTime is missing,
  // preserve array order (Sproom already returns chronological).
  const sorted = [...states].sort((a, b) => {
    const aT = a.dateTime ? new Date(a.dateTime).getTime() : 0;
    const bT = b.dateTime ? new Date(b.dateTime).getTime() : 0;
    return aT - bT;
  });

  let applied = 0;
  let changed = 0;
  let finalStatus: EInvoiceSendStatus | null = null;

  for (const entry of sorted) {
    try {
      const result = await applyStatusTransition({
        sendingId,
        sproomState: entry.state,
        sproomStatusCode: entry.statusCode,
        deliveryType: entry.deliveryType,
        message: entry.message,
        failedProperties: entry.failedProperties,
        eventTimestamp: entry.dateTime ? new Date(entry.dateTime) : new Date(),
        source,
      });
      if (result) {
        applied++;
        if (result.changed) changed++;
        finalStatus = result.newStatus;
      }
    } catch (err) {
      logger.warn('[STATUS-TRACKER] Failed to apply state entry', {
        sendingId,
        state: entry.state,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { applied, changed, finalStatus };
}
