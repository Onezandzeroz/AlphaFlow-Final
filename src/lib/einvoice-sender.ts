/**
 * E-Invoice Send Management Library
 *
 * Core abstraction for sending outgoing e-invoices via NemHandel
 * eDelivery and Peppol BIS Billing 3.0 networks.
 *
 * Provides:
 * - Queueing e-invoice sends with automatic format detection
 * - Processing queued sends (called by mini-service or cron)
 * - Retry logic with exponential backoff scheduling
 * - Cancel pending sends
 * - Full send history tracking
 * - Company e-invoice configuration management
 * - NemHandel eDelivery registration (via Storecove Access Point)
 *
 * NemHandel eDelivery (since 2023 transition):
 * - Follows Peppol AS4 specifications with Danish extensions
 * - MitID Erhverv certificate required (handled by Storecove)
 * - Receiving AP performs schema + schematron validation
 * - MLR/AR mandatory if schematron validation fails
 * - Uses eDelivery SML (EC) + NHR SMP (Nemhandelsregisteret)
 * - All senders must be capable of receiving MLR/AR
 *
 * Dependencies:
 * - Prisma (PostgreSQL via Neon) for persistence
 * - NemHandelClient for NHR/SMP lookup and simulation
 * - StorecoveClient for Peppol + NemHandel eDelivery submission
 * - generateOIOUBL for XML invoice generation
 * - auditLog for immutable audit trail (Danish Bookkeeping Law §10-12)
 */

import { EInvoiceSendChannel, EInvoiceSendStatus, EInvoiceFormat } from '@prisma/client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditLog } from '@/lib/audit';
import { generateOIOUBL, type OIOUBLInvoiceData } from '@/lib/oioubl-generator';
import { NemHandelClient } from '@/lib/nemhandel-client';
import { storecoveClient, StorecoveClient } from '@/lib/storecove-client';

// ─── TYPES ────────────────────────────────────────────────────────

/** Serializable e-invoice sending record (dates as ISO strings) */
export interface EInvoiceSending {
  id: string;
  invoiceId: string;
  channel: string;
  format: string;
  recipientName: string;
  recipientCvr: string | null;
  recipientEAN: string | null;
  recipientEndpointId: string | null;
  status: string;
  sentAt: string | null;
  deliveredAt: string | null;
  acceptedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: string | null;
  messageId: string | null;
  responseXml: string | null;
  sentBy: string;
  createdAt: string;
  updatedAt: string;
  companyId: string;
  storecoveSubmissionId: string | null;
  storecoveStorecoveId: string | null;
}

/** Serializable company e-invoice configuration */
export interface CompanyEInvoiceConfig {
  enabled: boolean;
  defaultChannel: string | null;
  endpointId: string | null;
  gln: string | null;
  peppolAs4Id: string | null;
  registrationNo: string | null;
  registeredAt: string | null;
  autoSendOnFinalize: boolean;
  deliveryMode: 'manual' | 'automatic' | null;
  // Storecove
  storecoveConnected: boolean;
  storecoveApiKeyId: string | null;
  storecoveLegalEntityId: number | null;
  storecoveConnectedAt: string | null;
}

// ─── CONSTANTS ─────────────────────────────────────────────────────

/** Maximum number of retry attempts for failed sends */
const MAX_RETRIES = 3;

/** Retry delay in minutes (5 minutes) */
const RETRY_DELAY_MINUTES = 5;

/** NemHandel client singleton (simulation mode controlled by NEMHANDEL_SIMULATION_MODE env var) */
const nemHandelClient = new NemHandelClient({
  simulationMode: process.env.NEMHANDEL_SIMULATION_MODE !== 'false',
});

// ─── HELPERS ──────────────────────────────────────────────────────

/**
 * Generate a unique message ID for tracking e-invoice sends
 * Format: MSG-<timestamp>-<random>
 */
function generateMessageId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `MSG-${timestamp}-${random}`;
}

/**
 * Map send channel to OIOUBL format
 */
function channelToFormat(channel: EInvoiceSendChannel): EInvoiceFormat {
  switch (channel) {
    case EInvoiceSendChannel.NEMHANDEL_OIOUBL:
      return EInvoiceFormat.OIOUBL;
    case EInvoiceSendChannel.PEPPOL_BIS:
      return EInvoiceFormat.PEPPOL_BIS;
    case EInvoiceSendChannel.STORECOVE:
      return EInvoiceFormat.PEPPOL_BIS;
    default:
      return EInvoiceFormat.OIOUBL;
  }
}

/**
 * Convert a Prisma EInvoiceSending record to a serializable EInvoiceSending object
 */
function serializeSending(record: {
  id: string;
  invoiceId: string;
  channel: EInvoiceSendChannel;
  format: EInvoiceFormat;
  recipientName: string;
  recipientCvr: string | null;
  recipientEAN: string | null;
  recipientEndpointId: string | null;
  status: EInvoiceSendStatus;
  sentAt: Date | null;
  deliveredAt: Date | null;
  acceptedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: Date | null;
  messageId: string | null;
  responseXml: string | null;
  sentBy: string;
  createdAt: Date;
  updatedAt: Date;
  companyId: string;
  storecoveSubmissionId: string | null;
  storecoveStorecoveId: string | null;
}): EInvoiceSending {
  return {
    id: record.id,
    invoiceId: record.invoiceId,
    channel: record.channel as string,
    format: record.format as string,
    recipientName: record.recipientName,
    recipientCvr: record.recipientCvr,
    recipientEAN: record.recipientEAN,
    recipientEndpointId: record.recipientEndpointId,
    status: record.status as string,
    sentAt: record.sentAt?.toISOString() ?? null,
    deliveredAt: record.deliveredAt?.toISOString() ?? null,
    acceptedAt: record.acceptedAt?.toISOString() ?? null,
    errorCode: record.errorCode,
    errorMessage: record.errorMessage,
    retryCount: record.retryCount,
    maxRetries: record.maxRetries,
    nextRetryAt: record.nextRetryAt?.toISOString() ?? null,
    messageId: record.messageId,
    responseXml: record.responseXml,
    sentBy: record.sentBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    companyId: record.companyId,
    storecoveSubmissionId: record.storecoveSubmissionId,
    storecoveStorecoveId: record.storecoveStorecoveId,
  };
}

/**
 * Build OIOUBL invoice data from an Invoice and Company record
 */
function buildOIOUBLData(
  invoice: {
    invoiceNumber: string;
    customerName: string;
    customerAddress?: string | null;
    customerEmail?: string | null;
    customerPhone?: string | null;
    customerCvr?: string | null;
    issueDate: Date;
    dueDate: Date;
    lineItems: unknown;
    subtotal: unknown;
    vatTotal: unknown;
    total: unknown;
    currency: string;
    notes?: string | null;
    bankName?: string;
    bankAccount?: string;
    bankIban?: string | null;
  },
  company: {
    name: string;
    address: string;
    email: string;
    phone: string;
    cvrNumber: string;
    bankName?: string;
    bankAccount?: string;
    bankIban?: string | null;
  },
): OIOUBLInvoiceData {
  // Parse line items from JSON
  const lines = (Array.isArray(invoice.lineItems) ? invoice.lineItems : []) as Array<{
    description?: string;
    name?: string;
    quantity?: number;
    unitCode?: string;
    unitPrice?: number;
    price?: number;
    vatPercent?: number;
    vatRate?: number;
  }>;

  const currencyCode = invoice.currency || 'DKK';
  const subtotal = Number(invoice.subtotal) || 0;
  const vatTotal = Number(invoice.vatTotal) || 0;
  const total = Number(invoice.total) || 0;

  return {
    invoiceId: invoice.invoiceNumber,
    issueDate: invoice.issueDate.toISOString().slice(0, 10),
    dueDate: invoice.dueDate.toISOString().slice(0, 10),
    invoiceTypeCode: '380',
    supplier: {
      id: company.cvrNumber || 'DK00000000',
      name: company.name,
      streetAddress: company.address || undefined,
      city: undefined,
      country: 'DK',
      vatNumber: company.cvrNumber ? `DK${company.cvrNumber}` : undefined,
      contactEmail: company.email || undefined,
      contactPhone: company.phone || undefined,
    },
    customer: {
      id: invoice.customerCvr || `CUST-${invoice.invoiceNumber}`,
      name: invoice.customerName,
      streetAddress: invoice.customerAddress || undefined,
      city: undefined,
      country: 'DK',
      vatNumber: invoice.customerCvr ? `DK${invoice.customerCvr}` : undefined,
      contactEmail: invoice.customerEmail || undefined,
    },
    lines: lines.map((line, index) => ({
      id: String(index + 1),
      description: line.description || line.name || 'Linje',
      quantity: Number(line.quantity) || 1,
      unitCode: line.unitCode || 'EA',
      unitPrice: Number(line.unitPrice) || Number(line.price) || 0,
      vatPercent: Number(line.vatPercent) || Number(line.vatRate) || 25,
      vatCategoryCode: (Number(line.vatPercent) || Number(line.vatRate) || 25) === 0 ? 'Z' : 'S',
    })),
    taxTotal: vatTotal,
    payableAmount: total,
    taxExclusiveAmount: subtotal,
    taxInclusiveAmount: total,
    paymentMeansCode: '30',
    paymentAccountId: invoice.bankIban || company.bankIban || company.bankAccount || undefined,
    currencyCode,
  };
}

// ─── PUBLIC API ───────────────────────────────────────────────────

/**
 * Queue an e-invoice for sending via NemHandel or Peppol.
 *
 * Creates an EInvoiceSending record with status PENDING. Validates
 * that the company has e-invoicing enabled and looks up the invoice
 * to populate recipient information.
 *
 * @param params.invoiceId - ID of the Invoice to send
 * @param params.companyId - ID of the sending Company
 * @param params.userId - ID of the user initiating the send
 * @param params.channel - Sending channel (NEMHANDEL_OIOUBL or PEPPOL_BIS)
 * @returns The created EInvoiceSending record
 * @throws Error if company e-invoicing is disabled or invoice not found
 */
export async function queueEInvoiceSend(params: {
  invoiceId: string;
  companyId: string;
  userId: string;
  channel: EInvoiceSendChannel;
}): Promise<EInvoiceSending> {
  const { invoiceId, companyId, userId, channel } = params;

  try {
    // 1. Validate company has e-invoicing enabled
    const company = await db.company.findUnique({
      where: { id: companyId },
      select: {
        einvoiceEnabled: true,
        einvoiceEndpointId: true,
        einvoiceDefaultChannel: true,
        name: true,
        cvrNumber: true,
        address: true,
        email: true,
        phone: true,
        bankName: true,
        bankAccount: true,
        bankIban: true,
        storecoveConnected: true,
        storecoveLegalEntityId: true,
      },
    });

    if (!company) {
      throw new Error(`Company not found: ${companyId}`);
    }

    if (!company.einvoiceEnabled) {
      throw new Error('E-invoicing is not enabled for this company. Enable it in company settings.');
    }

    // 2. Look up the invoice to get recipient info
    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId, companyId },
      select: {
        id: true,
        invoiceNumber: true,
        customerName: true,
        customerAddress: true,
        customerEmail: true,
        customerPhone: true,
        customerCvr: true,
        issueDate: true,
        dueDate: true,
        lineItems: true,
        subtotal: true,
        vatTotal: true,
        total: true,
        currency: true,
        contactId: true,
      },
    });

    if (!invoice) {
      throw new Error(`Invoice not found: ${invoiceId}`);
    }

    // 3. Determine recipient endpoint ID
    const recipientCvr = invoice.customerCvr;
    const recipientEndpointId = recipientCvr ? `0184:${recipientCvr}` : null;

    // 3b. Validate that the recipient has a CVR number for Peppol/NemHandel routing
    if (!recipientCvr || !recipientCvr.trim()) {
      throw new Error(
        'Kunden har intet CVR-nummer. For at sende en e-faktura via Peppol/NemHandel skal kunden have et gyldigt CVR-nummer. Tilføj CVR-nummeret på kunden før du sender.'
      );
    }
    if (!/^\d{8}$/.test(recipientCvr.trim())) {
      throw new Error(
        `Kundens CVR-nummer "${recipientCvr}" er ugyldigt. Et dansk CVR-nummer skal være præcis 8 cifre.`
      );
    }

    // 4. Determine format based on channel
    const format = channelToFormat(channel);

    // 5. Generate unique message ID
    const messageId = generateMessageId();

    // 6. Create the EInvoiceSending record
    const sending = await db.eInvoiceSending.create({
      data: {
        invoiceId,
        companyId,
        channel,
        format,
        recipientName: invoice.customerName,
        recipientCvr,
        recipientEAN: null,
        recipientEndpointId,
        status: EInvoiceSendStatus.PENDING,
        sentBy: userId,
        messageId,
        retryCount: 0,
        maxRetries: MAX_RETRIES,
      },
    });

    logger.info('[EINVOICE_SEND] Queued e-invoice send', {
      sendingId: sending.id,
      invoiceId,
      companyId,
      channel,
      format,
      messageId,
    });

    // 7. Audit trail
    await auditLog({
      action: 'CREATE',
      entityType: 'EInvoiceSending',
      entityId: sending.id,
      userId,
      companyId,
      changes: {
        invoiceId: { old: null, new: invoiceId },
        channel: { old: null, new: channel },
        format: { old: null, new: format },
        recipientName: { old: null, new: invoice.customerName },
        recipientCvr: { old: null, new: recipientCvr },
      },
      metadata: {
        messageId,
        recipientEndpointId,
      },
    });

    return serializeSending(sending);
  } catch (error) {
    logger.error('[EINVOICE_SEND] Failed to queue e-invoice send', error);
    throw error;
  }
}

/**
 * Process a pending or queued e-invoice send.
 *
 * Generates the OIOUBL XML, sends it via NemHandelClient,
 * and updates the sending record status accordingly.
 *
 * In production, this would be called by a mini-service worker
 * or scheduled cron job that picks up pending sends.
 *
 * @param sendingId - ID of the EInvoiceSending record to process
 * @throws Error if sending record not found or not in processable state
 */
export async function processEInvoiceSend(sendingId: string): Promise<void> {
  try {
    // 1. Fetch the sending record
    const sending = await db.eInvoiceSending.findUnique({
      where: { id: sendingId },
      include: {
        invoice: true,
        company: {
          select: {
            id: true,
            name: true,
            cvrNumber: true,
            address: true,
            email: true,
            phone: true,
            bankName: true,
            bankAccount: true,
            bankIban: true,
            einvoiceEnabled: true,
            einvoiceEndpointId: true,
            einvoiceGLN: true,
            storecoveConnected: true,
            storecoveLegalEntityId: true,
          },
        },
      },
    });

    if (!sending) {
      throw new Error(`EInvoiceSending record not found: ${sendingId}`);
    }

    // 2. Validate status is processable
    if (
      sending.status !== EInvoiceSendStatus.PENDING &&
      sending.status !== EInvoiceSendStatus.QUEUED
    ) {
      throw new Error(
        `Cannot process e-invoice send with status: ${sending.status}. Must be PENDING or QUEUED.`,
      );
    }

    // 3. Update status to SENDING
    await db.eInvoiceSending.update({
      where: { id: sendingId },
      data: {
        status: EInvoiceSendStatus.SENDING,
        sentAt: new Date(),
      },
    });

    logger.info('[EINVOICE_SEND] Processing e-invoice send', {
      sendingId,
      invoiceId: sending.invoiceId,
      channel: sending.channel,
    });

    // 4. Generate OIOUBL XML from invoice data
    const invoiceData = buildOIOUBLData(sending.invoice, sending.company);
    const xmlContent = generateOIOUBL(invoiceData);

    logger.info('[EINVOICE_SEND] Generated OIOUBL XML', {
      sendingId,
      xmlLength: xmlContent.length,
    });

    // 5. Send via appropriate access point
    let result: { success: boolean; messageId?: string; errorCode?: string; errorMessage?: string; responseXml?: string };

    if (sending.channel === EInvoiceSendChannel.STORECOVE || 
        (sending.channel === EInvoiceSendChannel.PEPPOL_BIS && sending.company.storecoveConnected)) {
      // ── Storecove Access Point (Peppol + NemHandel eDelivery) ──
      // When routeToNemhandel is true, Storecove handles:
      //   - MitID Erhverv certificate signing (required by NemHandel)
      //   - AS4 transmission to receiving AP
      //   - Schema validation at receiving AP (required before transport ack)
      //   - Schematron validation before forwarding downstream
      //   - MLR/AR response if schematron validation fails
      const parsedEndpoint = sending.recipientEndpointId
        ? StorecoveClient.parseEndpointId(sending.recipientEndpointId)
        : null;
      
      const storecoveResult = await storecoveClient.submitInvoice(xmlContent, {
        legalEntityId: sending.company.storecoveLegalEntityId ?? undefined,
        receiverScheme: parsedEndpoint?.scheme,
        receiverIdentifier: parsedEndpoint?.identifier,
        routeToNemhandel: sending.channel === EInvoiceSendChannel.STORECOVE,
      });

      result = {
        success: storecoveResult.success,
        messageId: storecoveResult.messageId,
        errorCode: storecoveResult.errorCode,
        errorMessage: storecoveResult.errorMessage,
      };

      // Store Storecove tracking IDs
      if (storecoveResult.success) {
        await db.eInvoiceSending.update({
          where: { id: sendingId },
          data: {
            storecoveSubmissionId: storecoveResult.submissionId,
            storecoveStorecoveId: storecoveResult.storecoveId,
          },
        });
      }

      logger.info('[EINVOICE_SEND] Submitted via Storecove Access Point', {
        sendingId,
        storecoveSubmissionId: storecoveResult.submissionId,
        channel: sending.channel,
      });
    } else {
      // ── NemHandel Client (simulation only — use Storecove for production) ──
      // The NemHandelClient is used for NHR/SMP participant lookup and
      // simulation mode only. For production NemHandel eDelivery,
      // always use the Storecove channel which handles AS4/MitID.
      const recipientCvr = sending.recipientCvr || sending.company.cvrNumber;
      result = await nemHandelClient.sendInvoice(xmlContent, recipientCvr);
    }

    // 6. Handle result
    if (result.success) {
      // Successful delivery
      await db.eInvoiceSending.update({
        where: { id: sendingId },
        data: {
          status: EInvoiceSendStatus.DELIVERED,
          deliveredAt: new Date(),
          messageId: result.messageId || sending.messageId,
          responseXml: result.responseXml || null,
        },
      });

      // Also update the Invoice status to SENT if it was DRAFT
      await db.invoice.updateMany({
        where: {
          id: sending.invoiceId,
          status: 'DRAFT',
        },
        data: { status: 'SENT' },
      });

      logger.info('[EINVOICE_SEND] E-invoice delivered successfully', {
        sendingId,
        messageId: result.messageId,
      });

      // Audit trail
      await auditLog({
        action: 'UPDATE',
        entityType: 'EInvoiceSending',
        entityId: sendingId,
        userId: sending.sentBy,
        companyId: sending.companyId,
        changes: {
          status: { old: 'PENDING', new: 'DELIVERED' },
          deliveredAt: { old: null, new: new Date().toISOString() },
          messageId: { old: sending.messageId, new: result.messageId },
        },
      });
    } else {
      // Failed delivery
      const nextRetryAt =
        sending.retryCount < sending.maxRetries
          ? new Date(Date.now() + RETRY_DELAY_MINUTES * 60 * 1000)
          : null;

      await db.eInvoiceSending.update({
        where: { id: sendingId },
        data: {
          status: EInvoiceSendStatus.FAILED,
          errorCode: result.errorCode || 'SEND_UNKNOWN_ERROR',
          errorMessage: result.errorMessage || 'Unknown error during e-invoice sending',
          nextRetryAt,
        },
      });

      logger.error('[EINVOICE_SEND] E-invoice delivery failed', {
        sendingId,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        retryCount: sending.retryCount,
        willRetry: !!nextRetryAt,
      });

      // Audit trail
      await auditLog({
        action: 'UPDATE',
        entityType: 'EInvoiceSending',
        entityId: sendingId,
        userId: sending.sentBy,
        companyId: sending.companyId,
        changes: {
          status: { old: 'PENDING', new: 'FAILED' },
          errorCode: { old: null, new: result.errorCode || 'SEND_UNKNOWN_ERROR' },
          errorMessage: { old: null, new: result.errorMessage },
        },
        metadata: {
          retryCount: sending.retryCount,
          willRetry: !!nextRetryAt,
          nextRetryAt: nextRetryAt?.toISOString() ?? null,
        },
      });
    }
  } catch (error) {
    logger.error('[EINVOICE_SEND] Error processing e-invoice send', error);

    // Attempt to mark as failed if we have the sendingId
    try {
      const sending = await db.eInvoiceSending.findUnique({
        where: { id: sendingId },
        select: { status: true, companyId: true, sentBy: true, retryCount: true, maxRetries: true },
      });

      if (sending && sending.status !== EInvoiceSendStatus.CANCELLED) {
        const nextRetryAt =
          sending.retryCount < sending.maxRetries
            ? new Date(Date.now() + RETRY_DELAY_MINUTES * 60 * 1000)
            : null;

        await db.eInvoiceSending.update({
          where: { id: sendingId },
          data: {
            status: EInvoiceSendStatus.FAILED,
            errorCode: 'PROCESSING_ERROR',
            errorMessage: error instanceof Error ? error.message : 'Unknown processing error',
            nextRetryAt,
          },
        });
      }
    } catch (updateError) {
      logger.error('[EINVOICE_SEND] Failed to update error state', updateError);
    }

    throw error;
  }
}

/**
 * Retry a failed e-invoice send.
 *
 * Resets the status to PENDING, increments the retry counter,
 * and schedules the next attempt for 5 minutes from now.
 *
 * @param sendingId - ID of the failed EInvoiceSending record
 * @returns Object indicating success or failure with optional error message
 */
export async function retryEInvoiceSend(
  sendingId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Fetch the sending record
    const sending = await db.eInvoiceSending.findUnique({
      where: { id: sendingId },
    });

    if (!sending) {
      return { success: false, error: `EInvoiceSending record not found: ${sendingId}` };
    }

    // 2. Validate status is FAILED
    if (sending.status !== EInvoiceSendStatus.FAILED) {
      return {
        success: false,
        error: `Cannot retry e-invoice send with status: ${sending.status}. Only FAILED sends can be retried.`,
      };
    }

    // 3. Check retry limit
    if (sending.retryCount >= sending.maxRetries) {
      return {
        success: false,
        error: `Maximum retry attempts (${sending.maxRetries}) reached. Cannot retry.`,
      };
    }

    // 4. Reset to PENDING with incremented retry count
    const nextRetryAt = new Date(Date.now() + RETRY_DELAY_MINUTES * 60 * 1000);

    await db.eInvoiceSending.update({
      where: { id: sendingId },
      data: {
        status: EInvoiceSendStatus.PENDING,
        retryCount: { increment: 1 },
        nextRetryAt,
        errorCode: null,
        errorMessage: null,
        sentAt: null,
      },
    });

    logger.info('[EINVOICE_SEND] Scheduled retry for e-invoice send', {
      sendingId,
      retryCount: sending.retryCount + 1,
      nextRetryAt: nextRetryAt.toISOString(),
    });

    // Audit trail
    await auditLog({
      action: 'UPDATE',
      entityType: 'EInvoiceSending',
      entityId: sendingId,
      userId: sending.sentBy,
      companyId: sending.companyId,
      changes: {
        status: { old: 'FAILED', new: 'PENDING' },
        retryCount: { old: sending.retryCount, new: sending.retryCount + 1 },
        nextRetryAt: { old: null, new: nextRetryAt.toISOString() },
      },
      metadata: { reason: 'manual_retry' },
    });

    return { success: true };
  } catch (error) {
    logger.error('[EINVOICE_SEND] Error retrying e-invoice send', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Cancel a pending e-invoice send.
 *
 * Can only cancel sends that are in PENDING or QUEUED status.
 * Sends that are already SENDING, DELIVERED, or FAILED cannot be cancelled.
 *
 * @param sendingId - ID of the EInvoiceSending record to cancel
 * @throws Error if sending not found or not in cancellable state
 */
export async function cancelEInvoiceSend(sendingId: string): Promise<void> {
  try {
    // 1. Fetch the sending record
    const sending = await db.eInvoiceSending.findUnique({
      where: { id: sendingId },
    });

    if (!sending) {
      throw new Error(`EInvoiceSending record not found: ${sendingId}`);
    }

    // 2. Validate status is cancellable
    if (
      sending.status !== EInvoiceSendStatus.PENDING &&
      sending.status !== EInvoiceSendStatus.QUEUED
    ) {
      throw new Error(
        `Cannot cancel e-invoice send with status: ${sending.status}. Only PENDING or QUEUED sends can be cancelled.`,
      );
    }

    // 3. Update to CANCELLED
    await db.eInvoiceSending.update({
      where: { id: sendingId },
      data: {
        status: EInvoiceSendStatus.CANCELLED,
        nextRetryAt: null,
      },
    });

    logger.info('[EINVOICE_SEND] Cancelled e-invoice send', {
      sendingId,
      invoiceId: sending.invoiceId,
    });

    // 4. Audit trail
    await auditLog({
      action: 'CANCEL',
      entityType: 'EInvoiceSending',
      entityId: sendingId,
      userId: sending.sentBy,
      companyId: sending.companyId,
      metadata: {
        previousStatus: sending.status,
        invoiceId: sending.invoiceId,
      },
    });
  } catch (error) {
    logger.error('[EINVOICE_SEND] Error cancelling e-invoice send', error);
    throw error;
  }
}

/**
 * Get the full send history for a specific invoice.
 *
 * Returns all EInvoiceSending records for the given invoice,
 * ordered by creation date (newest first).
 *
 * @param invoiceId - ID of the Invoice
 * @param companyId - ID of the Company (tenant isolation)
 * @returns Array of EInvoiceSending records
 */
export async function getInvoiceSendHistory(
  invoiceId: string,
  companyId: string,
): Promise<EInvoiceSending[]> {
  const records = await db.eInvoiceSending.findMany({
    where: { invoiceId, companyId },
    orderBy: { createdAt: 'desc' },
  });

  return records.map(serializeSending);
}

/**
 * ── Channel alias <-> Prisma enum normalisation ──
 *
 * The settings UI (and several invoice dialogs) use short aliases for the
 * default sending channel — 'OIOUBL' and 'PEPPOL' — because those match the
 * document-format vocabulary users already know. The database column
 * `einvoiceDefaultChannel`, however, is typed as the Prisma enum
 * `EInvoiceSendChannel` whose members are NEMHANDEL_OIOUBL | PEPPOL_BIS |
 * STORECOVE.
 *
 * Sending the alias directly to Prisma raises a validation error (the root
 * cause of the "Der opstod en fejl. Prøv igen." toast on the e-delivery
 * onboarding step). These helpers translate at the lib boundary so callers
 * may freely use either the alias or the canonical enum name.
 */
const CHANNEL_ALIAS_TO_ENUM: Record<string, EInvoiceSendChannel> = {
  OIOUBL: 'NEMHANDEL_OIOUBL',
  NEMHANDEL: 'NEMHANDEL_OIOUBL',
  NEMHANDEL_OIOUBL: 'NEMHANDEL_OIOUBL',
  PEPPOL: 'PEPPOL_BIS',
  PEPPOL_BIS: 'PEPPOL_BIS',
  STORECOVE: 'STORECOVE',
};

const ENUM_TO_CHANNEL_ALIAS: Record<EInvoiceSendChannel, string> = {
  NEMHANDEL_OIOUBL: 'OIOUBL',
  PEPPOL_BIS: 'PEPPOL',
  STORECOVE: 'STORECOVE',
};

/**
 * Normalise an incoming channel value (alias OR canonical enum name) to a
 * valid `EInvoiceSendChannel` enum member. Null/empty -> null. Unknown
 * values pass through untouched so Prisma raises a clear validation error
 * (surfaced to the user thanks to api-error-handler).
 */
function normalizeChannelToEnum(
  channel: string | null | undefined,
): EInvoiceSendChannel | null {
  if (!channel) return null;
  const trimmed = channel.trim();
  if (!trimmed) return null;
  // Already a canonical enum value?
  if (trimmed in ENUM_TO_CHANNEL_ALIAS) {
    return trimmed as EInvoiceSendChannel;
  }
  // Try alias mapping (case-insensitive)
  const mapped = CHANNEL_ALIAS_TO_ENUM[trimmed.toUpperCase()];
  if (mapped) return mapped;
  // Unknown — return as-is so Prisma rejects it with a descriptive error
  return trimmed as EInvoiceSendChannel;
}

/**
 * Reverse-map a stored enum value back to the UI alias so the settings
 * Select (and the send-einvoice dialog) can match it against 'OIOUBL' /
 * 'PEPPOL' / 'STORECOVE'.
 */
function enumToChannelAlias(
  channel: EInvoiceSendChannel | null,
): string | null {
  if (!channel) return null;
  return ENUM_TO_CHANNEL_ALIAS[channel] ?? channel;
}

/**
 * Get the e-invoice configuration for a company.
 *
 * Returns all e-invoicing settings including channel preferences,
 * endpoint IDs, and NemHandelsregisteret registration info.
 *
 * @param companyId - ID of the Company
 * @returns Company e-invoice configuration
 * @throws Error if company not found
 */
export async function getCompanyEInvoiceSettings(
  companyId: string,
): Promise<CompanyEInvoiceConfig> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: {
      einvoiceEnabled: true,
      einvoiceDefaultChannel: true,
      einvoiceEndpointId: true,
      einvoiceGLN: true,
      einvoicePeppolAs4Id: true,
      einvoiceRegistrationNo: true,
      einvoiceRegisteredAt: true,
      einvoiceAutoSendOnFinalize: true,
      einvoiceDeliveryMode: true,
      storecoveConnected: true,
      storecoveApiKeyId: true,
      storecoveLegalEntityId: true,
      storecoveConnectedAt: true,
    },
  });

  if (!company) {
    throw new Error(`Company not found: ${companyId}`);
  }

  return {
    enabled: company.einvoiceEnabled,
    defaultChannel: enumToChannelAlias(company.einvoiceDefaultChannel),
    endpointId: company.einvoiceEndpointId ?? null,
    gln: company.einvoiceGLN ?? null,
    peppolAs4Id: company.einvoicePeppolAs4Id ?? null,
    registrationNo: company.einvoiceRegistrationNo ?? null,
    registeredAt: company.einvoiceRegisteredAt?.toISOString() ?? null,
    autoSendOnFinalize: company.einvoiceAutoSendOnFinalize,
    deliveryMode: (company.einvoiceDeliveryMode as 'manual' | 'automatic' | null) ?? null,
    storecoveConnected: company.storecoveConnected,
    storecoveApiKeyId: company.storecoveApiKeyId,
    storecoveLegalEntityId: company.storecoveLegalEntityId,
    storecoveConnectedAt: company.storecoveConnectedAt?.toISOString() ?? null,
  };
}

/**
 * Update company e-invoice settings.
 *
 * Accepts a partial settings object and merges it with existing settings.
 * Only the provided fields are updated.
 *
 * @param companyId - ID of the Company
 * @param settings - Partial settings object with fields to update
 * @returns Updated company e-invoice configuration
 * @throws Error if company not found
 */
export async function updateCompanyEInvoiceSettings(
  companyId: string,
  settings: Partial<CompanyEInvoiceConfig>,
): Promise<CompanyEInvoiceConfig> {
  // Build Prisma update data from partial settings
  const updateData: Record<string, unknown> = {};

  if (settings.enabled !== undefined) {
    updateData.einvoiceEnabled = settings.enabled;
  }
  if (settings.defaultChannel !== undefined) {
    // Normalise UI aliases ('OIOUBL'/'PEPPOL') to canonical Prisma enum
    // members (NEMHANDEL_OIOUBL / PEPPOL_BIS / STORECOVE).
    updateData.einvoiceDefaultChannel = normalizeChannelToEnum(settings.defaultChannel);
  }
  if (settings.endpointId !== undefined) {
    updateData.einvoiceEndpointId = settings.endpointId;
  }
  if (settings.gln !== undefined) {
    updateData.einvoiceGLN = settings.gln;
  }
  if (settings.peppolAs4Id !== undefined) {
    updateData.einvoicePeppolAs4Id = settings.peppolAs4Id;
  }
  if (settings.autoSendOnFinalize !== undefined) {
    updateData.einvoiceAutoSendOnFinalize = settings.autoSendOnFinalize;
  }
  if (settings.deliveryMode !== undefined) {
    updateData.einvoiceDeliveryMode = settings.deliveryMode;
  }
  if (settings.storecoveConnected !== undefined) {
    updateData.storecoveConnected = settings.storecoveConnected;
  }
  if (settings.storecoveLegalEntityId !== undefined) {
    updateData.storecoveLegalEntityId = settings.storecoveLegalEntityId;
  }

  // Get old settings for audit trail
  const oldSettings = await getCompanyEInvoiceSettings(companyId);

  // Perform update
  const company = await db.company.update({
    where: { id: companyId },
    data: updateData,
    select: {
      einvoiceEnabled: true,
      einvoiceDefaultChannel: true,
      einvoiceEndpointId: true,
      einvoiceGLN: true,
      einvoicePeppolAs4Id: true,
      einvoiceRegistrationNo: true,
      einvoiceRegisteredAt: true,
      einvoiceAutoSendOnFinalize: true,
      einvoiceDeliveryMode: true,
      storecoveConnected: true,
      storecoveApiKeyId: true,
      storecoveLegalEntityId: true,
      storecoveConnectedAt: true,
    },
  });

  const newSettings: CompanyEInvoiceConfig = {
    enabled: company.einvoiceEnabled,
    defaultChannel: enumToChannelAlias(company.einvoiceDefaultChannel),
    endpointId: company.einvoiceEndpointId ?? null,
    gln: company.einvoiceGLN ?? null,
    peppolAs4Id: company.einvoicePeppolAs4Id ?? null,
    registrationNo: company.einvoiceRegistrationNo ?? null,
    registeredAt: company.einvoiceRegisteredAt?.toISOString() ?? null,
    autoSendOnFinalize: company.einvoiceAutoSendOnFinalize,
    deliveryMode: (company.einvoiceDeliveryMode as 'manual' | 'automatic' | null) ?? null,
    storecoveConnected: company.storecoveConnected,
    storecoveApiKeyId: company.storecoveApiKeyId,
    storecoveLegalEntityId: company.storecoveLegalEntityId,
    storecoveConnectedAt: company.storecoveConnectedAt?.toISOString() ?? null,
  };

  logger.info('[EINVOICE_SETTINGS] Updated company e-invoice settings', {
    companyId,
    changes: Object.keys(updateData),
  });

  return newSettings;
}

/**
 * Register a company in Nemhandelsregisteret (NHR).
 *
 * Validates that the company has a CVR number and generates
 * an endpoint ID if not already set. Registration in NHR makes
 * the company discoverable via the NemHandel eDelivery SMP.
 *
 * Note: For NemHandel eDelivery, senders MUST also register as
 * receivers of MLR/AR (Message Level Response / Application Response),
 * as the receiving AP is required to return MLR/AR if schematron
 * validation fails.
 *
 * Currently simulated — in production, registration is handled
 * through the NHR portal or via Storecove onboarding.
 *
 * On success, stores the registration number and timestamp
 * on the Company record.
 *
 * @param companyId - ID of the Company to register
 * @param userId - ID of the user performing the registration
 * @returns Object containing the registration number
 * @throws Error if company not found or registration fails
 */
export async function registerNemHandel(
  companyId: string,
  userId: string,
): Promise<{ registrationNo: string }> {
  try {
    // 1. Fetch company with required fields
    const company = await db.company.findUnique({
      where: { id: companyId },
      select: {
        cvrNumber: true,
        einvoiceEndpointId: true,
        einvoiceRegistrationNo: true,
        name: true,
      },
    });

    if (!company) {
      throw new Error(`Company not found: ${companyId}`);
    }

    // 2. Validate CVR number exists
    if (!company.cvrNumber) {
      throw new Error('Company CVR number is required for NemHandelsregisteret registration.');
    }

    // 3. Determine endpoint ID (use existing or generate from CVR)
    const endpointId = company.einvoiceEndpointId || `0184:${company.cvrNumber}`;

    // 4. Call NemHandelClient to register (simulated)
    const registrationNo = await nemHandelClient.registerCompany(
      company.cvrNumber,
      endpointId,
    );

    // 5. Update company record with registration info
    await db.company.update({
      where: { id: companyId },
      data: {
        einvoiceRegistrationNo: registrationNo,
        einvoiceRegisteredAt: new Date(),
        einvoiceEndpointId: endpointId,
        einvoiceEnabled: true, // Auto-enable e-invoicing on registration
      },
    });

    logger.info('[EINVOICE_NEMHANDEL] Company registered in NemHandelsregisteret', {
      companyId,
      registrationNo,
      endpointId,
    });

    // 6. Audit trail
    await auditLog({
      action: 'CREATE',
      entityType: 'Company',
      entityId: companyId,
      userId,
      companyId,
      changes: {
        einvoiceRegistrationNo: { old: null, new: registrationNo },
        einvoiceRegisteredAt: { old: null, new: new Date().toISOString() },
        einvoiceEndpointId: { old: company.einvoiceEndpointId, new: endpointId },
        einvoiceEnabled: { old: false, new: true },
      },
      metadata: {
        action: 'nemhandel_registration',
        cvrNumber: company.cvrNumber,
      },
    });

    return { registrationNo };
  } catch (error) {
    logger.error('[EINVOICE_NEMHANDEL] Failed to register company in NemHandelsregisteret', error);
    throw error;
  }
}
