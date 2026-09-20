/**
 * Server-side e-invoice lifecycle notifier.
 *
 * After the Sproom webhook (push) or the inbox poller (pull) records an
 * e-invoice/e-creditnote event — an inbound received document or an outbound
 * status transition (DELIVERED / ACCEPTED / REJECTED / FAILED) — the handler
 * calls notifyEInvoiceEvent() to push a dedicated 'einvoice-event' to all
 * connected clients in the same company. The EInvoiceEventNotifier client
 * component listens for this event and:
 *   1. Fires a sonner toast with supplier/recipient + invoiceNumber + status.
 *   2. Bumps the relevant data-sync scope so subscribed UI indicators refresh
 *      (the received-invoice inbox badge, the e-invoice send-status popup).
 *
 * This is a fire-and-forget server-to-server call to the notification
 * WebSocket service (port 3001). If the WS service is down, the call fails
 * silently — clients catch up on the next poll / page focus.
 *
 * NOTE: this is SEPARATE from notifyDataChange() (which emits the generic
 * 'data-changed' invalidation event). Both are called from the webhook/puller
 * — data-changed refreshes subscribed lists, einvoice-event shows the toast.
 */

import { logger } from '@/lib/logger';

const WS_SERVICE_PORT = process.env.NOTIFICATION_WS_PORT || '3001';

/** Direction of the e-invoice event relative to the tenant. */
export type EInvoiceEventDirection = 'inbound' | 'outbound';

/**
 * Lifecycle status carried in the event. For inbound this is always
 * 'RECEIVED'; for outbound it mirrors the EInvoiceSendStatus enum values.
 */
export type EInvoiceEventStatus =
  | 'RECEIVED' // inbound: a document arrived
  | 'SENT' // outbound: Sproom accepted the XML (201 Created)
  | 'IN_TRANSIT' // outbound: Sproom is transmitting to recipient AP
  | 'DELIVERED' // outbound: delivered to the receiving AP / recipient
  | 'PENDING_APPROVAL' // outbound: recipient has the doc, awaiting accept/reject
  | 'ACCEPTED' // outbound: recipient acknowledged
  | 'REJECTED' // outbound: recipient rejected
  | 'PAID' // outbound: tenant marked the invoice PAID locally (PAID-syntese)
  | 'FAILED' // outbound: transmission / validation error
  | 'CANCELLED';

export interface EInvoiceEventPayload {
  /** Company whose clients should receive the toast. */
  companyId: string;
  /** Inbound = received into the tenant's inbox; outbound = tenant sent it. */
  direction: EInvoiceEventDirection;
  /** The new lifecycle status. */
  status: EInvoiceEventStatus;
  /** Invoice/creditnote number (from XML for inbound, from the Invoice row for outbound). */
  invoiceNumber?: string | null;
  /**
   * The OTHER party's name — the supplier for inbound, the recipient for
   * outbound. Shown prominently in the toast.
   */
  counterpartyName?: string | null;
  /** INVOICE | CREDIT_NOTE | CORRECTED | SELF_BILLED (inbound only). */
  documentType?: string | null;
  /** Payable amount (inbound) — formatted string to avoid number-precision issues. */
  amount?: string | null;
  /** Currency code, e.g. 'DKK'. */
  currency?: string | null;
  /** Outbound: the EInvoiceSending row id (for deep-link / status popup). */
  sendingId?: string | null;
  /** Inbound: the ReceivedInvoice row id (for deep-link / inbox). */
  receivedInvoiceId?: string | null;
}

/**
 * Broadcast a single e-invoice lifecycle event to all clients in the given
 * company. Non-throwing — failures are logged at warn level and swallowed.
 */
export async function notifyEInvoiceEvent(
  payload: EInvoiceEventPayload,
): Promise<void> {
  try {
    // SECURITY (U-5): /broadcast endpoint requires HERMES_ADMIN_KEY auth
    const adminKey =
      process.env.HERMES_ADMIN_KEY || process.env.OPENROUTER_API_KEY || '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (adminKey) headers['Authorization'] = `Bearer ${adminKey}`;

    const res = await fetch(`http://localhost:${WS_SERVICE_PORT}/broadcast`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'EINVOICE_EVENT',
        companyId: payload.companyId,
        direction: payload.direction,
        status: payload.status,
        invoiceNumber: payload.invoiceNumber ?? null,
        counterpartyName: payload.counterpartyName ?? null,
        documentType: payload.documentType ?? null,
        amount: payload.amount ?? null,
        currency: payload.currency ?? null,
        sendingId: payload.sendingId ?? null,
        receivedInvoiceId: payload.receivedInvoiceId ?? null,
      }),
      signal: AbortSignal.timeout(2000),
    });

    if (!res.ok) {
      logger.warn(
        `[EInvoiceEvent] broadcast returned ${res.status} for companyId=${payload.companyId} direction=${payload.direction} status=${payload.status}`,
      );
    }
  } catch (err) {
    // WS service might be down — non-critical. Clients catch up on next poll.
    logger.warn(
      `[EInvoiceEvent] Failed to broadcast e-invoice event (companyId=${payload.companyId}, direction=${payload.direction}, status=${payload.status}):`,
      err,
    );
  }
}
