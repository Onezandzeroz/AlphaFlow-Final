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
 * - NemHandel eDelivery registration (via Sproom Access Point)
 *
 * NemHandel eDelivery (since 2023 transition):
 * - Follows Peppol AS4 specifications with Danish extensions
 * - MitID Erhverv certificate required (handled by Sproom)
 * - Receiving AP performs schema + schematron validation
 * - MLR/AR mandatory if schematron validation fails
 * - Uses eDelivery SML (EC) + NHR SMP (Nemhandelsregisteret)
 * - All senders must be capable of receiving MLR/AR
 *
 * Dependencies:
 * - Prisma (PostgreSQL via Neon) for persistence
 * - NemHandelClient for NHR/SMP lookup and simulation
 * - SproomClient for Peppol + NemHandel eDelivery submission
 * - generateOIOUBL for XML invoice generation
 * - auditLog for immutable audit trail (Danish Bookkeeping Law §10-12)
 */

import { EInvoiceSendChannel, EInvoiceSendStatus, EInvoiceFormat, ReceivedInvoiceStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditLog } from '@/lib/audit';
import { generateOIOUBL, type OIOUBLInvoiceData } from '@/lib/oioubl-generator';
import { validateOIOUBL } from '@/lib/oioubl-validator';
import { NemHandelClient } from '@/lib/nemhandel-client';
import { sproomClient } from '@/lib/sproom-client';
import { assignVoucherNumberIfPosted } from '@/lib/voucher-number';

// ─── ACCESS POINT SELECTION ────────────────────────────────────────
//
// AlphaFlow uses Sproom as its sole Access Point. Sproom supports BOTH
// Peppol and NemHandel, so a single child-company per tenant covers
// both networks.
//
// When Sproom is configured (SPROOM_API_TOKEN in .env),
// sends go through Sproom. Otherwise AlphaFlow falls back to simulation
// mode (NemHandelClient mock) — no real delivery.
//
// Sproom accepts raw OIOUBL XML directly: no JSON Pure mode conversion,
// no test-receiver override — the customer's real CVR is used as the
// routing endpoint.

export type AccessPoint = 'sproom' | 'simulation';

export function getActiveAccessPoint(): AccessPoint {
  return sproomClient.isConfigured ? 'sproom' : 'simulation';
}

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
  // Storecove (LEGACY — kept in the DB schema for backward compat, no
  // longer used by active code). These remain null going forward.
  storecoveConnected: boolean;
  storecoveApiKeyId: string | null;
  storecoveLegalEntityId: number | null;
  storecoveConnectedAt: string | null;
  // Sproom (Access Point — Peppol + NemHandel)
  sproomChildCompanyId: string | null;
  sproomConnectedAt: string | null;
  sproomNemHandelRegistered: boolean;
  sproomPeppolRegistered: boolean;
  // Platform-configured Access Point ('sproom' | 'simulation').
  // Sproom is the only AP — 'simulation' indicates Sproom isn't configured
  // (no SPROOM_API_TOKEN in .env) and sends will be
  // simulated locally instead of delivered.
  activeAccessPoint: AccessPoint;
}

// ─── CONSTANTS ─────────────────────────────────────────────────────

/** Maximum number of retry attempts for failed sends */
const MAX_RETRIES = 3;

/** Retry delay in minutes (5 minutes) */
const RETRY_DELAY_MINUTES = 5;

/** NemHandel client singleton — used ONLY for simulation fallback when
 * Sproom is not configured. In production (Sproom configured), the
 * Sproom path handles real delivery, so this client runs in simulation
 * mode regardless. */
const nemHandelClient = new NemHandelClient({ simulationMode: true });

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
 * Map send channel to OIOUBL format.
 *
 * The UI exposes three e-invoice channels to the user:
 *   - 'OIOUBL'    (alias for NEMHANDEL_OIOUBL) — Danish NemHandel format
 *   - 'PEPPOL'    (alias for PEPPOL_BIS)       — International Peppol BIS 3
 *   - 'STORECOVE' (legacy alias for Sproom)    — "Auto" — let Sproom pick
 *
 * The STORECOVE channel is the default in the send dialog when the
 * tenant hasn't set a default. All three channels route through Sproom,
 * which accepts both OIOUBL 2.1 and Peppol BIS 3 XML and delivers via the
 * appropriate network (Peppol for international recipients, NemHandel
 * for Danish recipients — Sproom routes based on the recipient's
 * registration).
 *
 * As of Task 37, native OIOUBL 2.1 format generation is implemented
 * based on the official Erhvervsstyrelsen reference example at
 * docs/SBD-OIOUBL-Invoice-valid.xml — ALL required OIOUBL attributes
 * (listID, listAgencyID, schemeID, schemeAgencyID on the relevant
 * codelist/ID elements, DK-prefixed CVR values for schemeID="DK:CVR"
 * and schemeID="DK:SE", AddressFormatCode, PaymentChannelCode, etc.)
 * are now emitted by the generator's OIOUBL branch.
 *
 * Channel → format mapping:
 *   - STORECOVE (default/auto)        → OIOUBL (Danish-to-Danish default)
 *   - NEMHANDEL_OIOUBL               → OIOUBL (explicit OIOUBL channel)
 *   - PEPPOL_BIS                     → PEPPOL_BIS (explicit Peppol channel)
 *   - default (unknown channel)      → OIOUBL (safe Danish default)
 *
 * The "Auto" STORECOVE channel defaults to OIOUBL because the majority
 * of AlphaFlow's sends are Danish-to-Danish (where OIOUBL is the native
 * NemHandel format). For cross-border sends, the user should select the
 * PEPPOL channel explicitly. The inbox format label now correctly shows
 * "OIOUBL" for Danish sends and "Peppol BIS" for cross-border sends.
 */
function channelToFormat(channel: EInvoiceSendChannel): EInvoiceFormat {
  switch (channel) {
    case EInvoiceSendChannel.NEMHANDEL_OIOUBL:
      // Native OIOUBL 2.1 format — Danish NemHandel eDelivery.
      return EInvoiceFormat.OIOUBL;
    case EInvoiceSendChannel.PEPPOL_BIS:
      // Peppol BIS Billing 3.0 — cross-border sends via Peppol network.
      return EInvoiceFormat.PEPPOL_BIS;
    case EInvoiceSendChannel.STORECOVE:
      // "Auto" channel — default to OIOUBL (Danish NemHandel). The vast
      // majority of AlphaFlow sends are Danish-to-Danish where OIOUBL is
      // the native format. Sproom routes correctly based on the
      // recipient's registration regardless of the document format.
      return EInvoiceFormat.OIOUBL;
    default:
      // Unknown channel — safe Danish default.
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
 *
 * @param invoice   - Invoice record (with line items, totals, customer info)
 * @param company   - Sender company (CVR, bank details, contact info)
 * @param format    - Output format: 'OIOUBL' (default, NemHandel eDelivery)
 *                    or 'PEPPOL_BIS' (Peppol BIS Billing 3.0 for cross-border).
 *                    Derived from the EInvoiceSending.format field which
 *                    in turn is derived from the channel via channelToFormat().
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
    // Document type distinguishes commercial invoices (INVOICE) from credit
    // notes (CREDIT_NOTE). Credit notes must be transmitted as OIOUBL/Peppol
    // type 381 (Credit note) — not 380 (Commercial invoice) — per Bilag 2,
    // 1, c and Bilag 2, 2, c.
    documentType?: string | null;
    // For credit notes: the invoice number of the original invoice being
    // credited. Surfaced in cac:BillingReference by the OIOUBL generator.
    originalInvoiceNumber?: string | null;
  },
  company: {
    name: string;
    address: string;
    email: string;
    phone: string;
    cvrNumber: string;
    bankName?: string;
    bankAccount?: string;
    bankRegistration?: string;
    bankIban?: string | null;
  },
  format?: 'OIOUBL' | 'PEPPOL_BIS',
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
    invoiceTypeCode: invoice.documentType === 'CREDIT_NOTE' ? '381' : '380',
    originalInvoiceNumber: invoice.documentType === 'CREDIT_NOTE'
      ? (invoice.originalInvoiceNumber || undefined)
      : undefined,
    // Pass through to the generator so it picks the right
    // CustomizationID/ProfileID pair. Default 'OIOUBL' preserves the
    // Danish NemHandel format on domestic sends; 'PEPPOL_BIS' for
    // cross-border Peppol sends.
    format: format ?? 'OIOUBL',
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
      contactPhone: invoice.customerPhone || undefined,
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
    paymentMeansCode: '42',
    // OIOUBL F-LIB131: PayeeFinancialAccount/ID must be ≤10 chars.
    // Peppol BIS 3 accepts the full IBAN (18 chars for DK).
    // For OIOUBL, prefer the separate bankAccount (BBAN) field. If
    // missing, extract the BBAN from the IBAN (last 10 chars of a
    // Danish IBAN). For PEPPOL_BIS, use the IBAN directly.
    paymentAccountId:
      format === 'PEPPOL_BIS'
        ? (invoice.bankIban || company.bankIban || company.bankAccount || undefined)
        : (company.bankAccount || extractBbanFromIban(company.bankIban) || extractBbanFromIban(invoice.bankIban) || undefined),
    // DK-R-006: bankRegistration (4-digit registreringsnummer) goes in
    // FinancialInstitutionBranch/ID. If not directly populated, extract
    // from the IBAN (positions 4-7 of a Danish IBAN).
    bankRegistration:
      company.bankRegistration || extractRegFromIban(company.bankIban) || undefined,
    currencyCode,
  };
}

/**
 * Extract the Danish BBAN account number (≤10 chars) from an IBAN.
 *
 * Danish IBAN format (18 chars total):
 *   "DK" + 2 check digits + 4 bank code (registration) + 10 account number
 *   Example: "DK12 3456 7890 1234 56" → account = "7890123456"
 *
 * OIOUBL's F-LIB131 schematron rule limits PayeeFinancialAccount/ID to
 * 10 characters — so the full IBAN (18 chars) can't be used directly.
 * We extract the last 10 chars (the BBAN account number) when the
 * separate bankAccount field isn't populated.
 *
 * For non-Danish IBANs or malformed input, returns the original
 * (will fail F-LIB131 but at least surface a value for diagnosis).
 */
function extractBbanFromIban(iban?: string | null): string | undefined {
  if (!iban) return undefined;
  const clean = iban.replace(/\s+/g, '').toUpperCase();
  // Danish IBAN: starts with "DK" and is exactly 18 chars
  if (clean.startsWith('DK') && clean.length === 18) {
    return clean.substring(8); // last 10 chars = account number
  }
  return clean;
}

/**
 * Extract the Danish bank registration number (4-digit "registreringsnummer")
 * from an IBAN. Used when company.bankRegistration isn't directly populated.
 *
 * Danish IBAN positions (0-indexed):
 *   0-1: "DK" country code
 *   2-3: check digits
 *   4-7: bank code (registreringsnummer, 4 digits)
 *   8-17: account number (10 digits)
 */
function extractRegFromIban(iban?: string | null): string | undefined {
  if (!iban) return undefined;
  const clean = iban.replace(/\s+/g, '').toUpperCase();
  if (clean.startsWith('DK') && clean.length === 18) {
    return clean.substring(4, 8); // 4-digit bank code
  }
  return undefined;
}



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
        sproomChildCompanyId: true,
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
        documentType: true,
        originalInvoiceId: true,
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
        invoice: {
          // Select only the fields needed for OIOUBL generation. Includes
          // documentType + originalInvoice relation so credit notes are
          // transmitted as type 381 with a cac:BillingReference.
          // Note: the Invoice model has no bank* fields (those live on
          // Company); buildOIOUBLData falls back to company.bankIban /
          // company.bankAccount for paymentAccountId.
          select: {
            invoiceNumber: true,
            status: true,
            projectId: true,
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
            notes: true,
            documentType: true,
            originalInvoiceId: true,
            originalInvoice: { select: { invoiceNumber: true } },
          },
        },
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
            bankRegistration: true,
            bankIban: true,
            einvoiceEnabled: true,
            einvoiceEndpointId: true,
            einvoiceGLN: true,
            sproomChildCompanyId: true,
            sproomNemHandelRegistered: true,
            sproomPeppolRegistered: true,
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
    // For credit notes (documentType CREDIT_NOTE), resolve the original
    // invoice's number from the originalInvoice relation so it can be
    // surfaced in cac:BillingReference (OIOUBL type 381).
    //
    // Sproom accepts raw OIOUBL XML with the customer's real CVR as the
    // routing endpoint — no sandbox test-receiver override needed.
    const invoiceInput = {
      ...sending.invoice,
      originalInvoiceNumber: sending.invoice.originalInvoice?.invoiceNumber ?? null,
    };
    // Pass the channel-derived format ('OIOUBL' for NemHandel, 'PEPPOL_BIS'
    // for Peppol) so the generator picks the correct CustomizationID/ProfileID
    // pair. Without this, all sends are tagged as Peppol BIS regardless of
    // channel, and Danish NemHandel recipients see the format label wrong
    // in their inbox.
    const sendFormat = (sending.format === 'PEPPOL_BIS' ? 'PEPPOL_BIS' : 'OIOUBL') as
      | 'OIOUBL'
      | 'PEPPOL_BIS';
    const invoiceData = buildOIOUBLData(invoiceInput, sending.company, sendFormat);
    const xmlContent = generateOIOUBL(invoiceData);

    logger.info('[EINVOICE_SEND] Generated OIOUBL XML', {
      sendingId,
      format: sendFormat,
      xmlLength: xmlContent.length,
    });

    // 4b. Pre-validate the OIOUBL XML against Peppol BIS 3 / EN 16931 +
    // Danish DK-R rules. NON-BLOCKING: log issues for diagnostics, but
    // always proceed to Sproom (the authoritative validator). The
    // pre-check is regex-based and produces false positives on some XML
    // formats (e.g. double-counts LineExtensionAmount across
    // LegalMonetaryTotal + InvoiceLine, mis-matches the InvoiceLine tag,
    // mis-captures currency). Blocking on those would prevent valid
    // sends. Sproom's full schematron catches real issues (surfaced via
    // the toast by the Task 8 fix). To re-enable blocking, the validator's
    // regexes need to be fixed against the actual generated XML format.
    const validation = validateOIOUBL(xmlContent);
    if (validation.errors.length > 0 || validation.warnings.length > 0) {
      logger.warn('[EINVOICE_SEND] OIOUBL pre-validation issues (non-blocking — Sproom is authoritative)', {
        sendingId,
        errors: validation.errors,
        warnings: validation.warnings,
      });
    }

    // 5. Send via the active Access Point (Sproom only — simulation fallback)
    let result: { success: boolean; messageId?: string; errorCode?: string; errorMessage?: string; responseXml?: string };

    const ap = getActiveAccessPoint();
    logger.info('[EINVOICE_SEND] Active access point', { sendingId, accessPoint: ap });

    if (ap === 'sproom') {
      // ── SPROOM Access Point (Peppol + NemHandel) ────────────────
      //
      // Sproom accepts raw OIOUBL XML directly — no JSON Pure mode,
      // no base64 encoding, no complex payload structure. Just upload
      // the XML file and Sproom handles:
      //   - AS4 transport (Peppol + NemHandel eDelivery)
      //   - MitID Erhverv certificate signing (for NemHandel)
      //   - SMP/NHR lookup for recipient routing
      //   - Schema + schematron validation
      //   - MLR/AR response on validation failure
      //
      // The child company token is fetched automatically by the
      // sproomClient (cached). We pass the childCompanyId so Sproom
      // knows which tenant is sending.
      const sproomResult = await sproomClient.sendDocument(xmlContent, {
        childCompanyId: sending.company.sproomChildCompanyId ?? undefined,
        requestId: sending.messageId || undefined, // idempotency
      });

      result = {
        success: sproomResult.success,
        messageId: sproomResult.documentId ?? sending.messageId ?? undefined,
        errorCode: sproomResult.errorCode,
        errorMessage: sproomResult.errorMessage,
      };

      // Store Sproom document ID in storecoveSubmissionId (legacy
      // column name — it's the AP tracking ID now, used by the
      // /api/sproom/webhook handler to match status updates).
      if (sproomResult.success && sproomResult.documentId) {
        await db.eInvoiceSending.update({
          where: { id: sendingId },
          data: {
            storecoveSubmissionId: sproomResult.documentId,
          },
        });
      }

      logger.info('[EINVOICE_SEND] Submitted via Sproom Access Point', {
        sendingId,
        sproomDocumentId: sproomResult.documentId,
        channel: sending.channel,
      });

    } else {
      // ── SIMULATION MODE (Sproom not configured) ────────────────
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
      const wasDraft = sending.invoice.status === 'DRAFT';
      await db.invoice.updateMany({
        where: {
          id: sending.invoiceId,
          status: 'DRAFT',
        },
        data: { status: 'SENT' },
      });

      // ── Create accrual journal entry (Tilgodehavende) ──────────
      //
      // When an invoice transitions from DRAFT → SENT, an accrual
      // journal entry MUST be created (debit Tilgodehavende, credit
      // Omsætning + Udgående moms). The PDF email send route
      // (/api/invoices/[id]/send) does this, but the e-invoice path
      // previously did NOT — meaning e-invoiced invoices never
      // appeared in the journal/transactions. This replicates the
      // same logic so both send paths are consistent.
      //
      // Only runs if the invoice was actually DRAFT (first send).
      // Re-sends of an already-SENT invoice don't create duplicate JEs.
      if (wasDraft) {
        try {
          await createInvoiceAccrualJournalEntry(
            sending.invoice,
            sending.companyId,
            sending.sentBy,
          );
          logger.info('[EINVOICE_SEND] Created accrual journal entry for invoice', {
            sendingId,
            invoiceId: sending.invoiceId,
            invoiceNumber: sending.invoice.invoiceNumber,
          });
        } catch (jeError) {
          // Non-fatal: the invoice was sent successfully, but the JE
          // creation failed (e.g. missing chart-of-accounts setup).
          // Log so it can be investigated, but don't fail the send.
          logger.error('[EINVOICE_SEND] Failed to create accrual journal entry', {
            sendingId,
            invoiceId: sending.invoiceId,
            error: jeError instanceof Error ? jeError.message : String(jeError),
          });
        }
      }

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
 * Serializable ReceivedInvoice (inbound e-invoice).
 *
 * Decimal fields are converted to numbers and Date fields to ISO strings
 * so they survive JSON serialisation in the API route layer.
 */
export interface ReceivedInvoiceSummary {
  id: string;
  supplierName: string;
  supplierCvr: string | null;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string | null;
  currencyCode: string;
  format: string;
  documentType: string;
  customizationId: string | null;
  status: string;
  readAt: string | null;
  payableAmount: number;
  taxExclusiveAmount: number;
  taxAmount: number;
  taxInclusiveAmount: number;
  createdAt: string;
  updatedAt: string;
  companyId: string;
  notes: string | null;
  validationErrors: string | null;
  validationWarnings: string | null;
}

/**
 * Helper: serialise a raw Prisma ReceivedInvoice record into the
 * ReceivedInvoiceSummary shape (numbers + ISO strings). Decimal
 * fields are coerced via Number() so they survive JSON.stringify
 * (otherwise decimal.js returns a string from .toJSON()).
 */
function serializeReceived(record: {
  id: string;
  supplierName: string;
  supplierCvr: string | null;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date | null;
  currencyCode: string;
  format: EInvoiceFormat;
  documentType: string;
  customizationId: string | null;
  status: ReceivedInvoiceStatus;
  readAt: Date | null;
  payableAmount: { toNumber(): number } | number;
  taxExclusiveAmount: { toNumber(): number } | number;
  taxAmount: { toNumber(): number } | number;
  taxInclusiveAmount: { toNumber(): number } | number;
  createdAt: Date;
  updatedAt: Date;
  companyId: string;
  notes: string | null;
  validationErrors: string | null;
  validationWarnings: string | null;
}): ReceivedInvoiceSummary {
  const toNum = (v: { toNumber(): number } | number) =>
    typeof v === 'number' ? v : v.toNumber();
  return {
    id: record.id,
    supplierName: record.supplierName,
    supplierCvr: record.supplierCvr,
    invoiceNumber: record.invoiceNumber,
    issueDate: record.issueDate.toISOString(),
    dueDate: record.dueDate?.toISOString() ?? null,
    currencyCode: record.currencyCode,
    format: record.format as string,
    documentType: record.documentType as string,
    customizationId: record.customizationId,
    status: record.status as string,
    readAt: record.readAt?.toISOString() ?? null,
    payableAmount: toNum(record.payableAmount),
    taxExclusiveAmount: toNum(record.taxExclusiveAmount),
    taxAmount: toNum(record.taxAmount),
    taxInclusiveAmount: toNum(record.taxInclusiveAmount),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    companyId: record.companyId,
    notes: record.notes,
    validationErrors: record.validationErrors,
    validationWarnings: record.validationWarnings,
  };
}

/**
 * Get the inbound receive history for a specific invoice number.
 *
 * Looks up ReceivedInvoice records (incoming OIOUBL / Peppol BIS
 * invoices + credit notes) whose `invoiceNumber` matches the given
 * invoice number, scoped to the same tenant (companyId). This lets the
 * send-status popup show BOTH directions of the e-invoice lifecycle:
 * outbound sends (EInvoiceSending) AND inbound receives (ReceivedInvoice).
 *
 * For example: if INV-2026-0008 was sent FROM Virksomhed C and the
 * recipient later sent back a credit note with the same number, both
 * will show up in the popup.
 *
 * @param invoiceNumber - The invoice number to match (cbc:ID in the XML)
 * @param companyId      - ID of the Company (tenant isolation)
 * @returns Array of ReceivedInvoiceSummary records, newest first
 */
export async function getInvoiceReceiveHistory(
  invoiceNumber: string,
  companyId: string,
): Promise<ReceivedInvoiceSummary[]> {
  const records = await db.receivedInvoice.findMany({
    where: { invoiceNumber, companyId },
    orderBy: { createdAt: 'desc' },
  });

  return records.map(serializeReceived);
}

/**
 * ── Channel alias <-> Prisma enum normalisation ──
 *
 * Sproom is the ONLY Access Point. The UI exposes two e-invoice channels:
 *
 *   - 'STORECOVE' (alias, default) → "Sproom (Auto Peppol+NemHandel)"
 *       - Auto-selects OIOUBL for Danish recipients (NemHandel network)
 *       - Auto-selects Peppol BIS 3 for international recipients
 *       - DB enum: EInvoiceSendChannel.STORECOVE (legacy name kept for
 *         backward compat with existing rows — renaming would require a
 *         Prisma migration)
 *
 *   - 'PEPPOL' (alias) → "Sproom (Peppol)"
 *       - Forces Peppol BIS 3 format (cross-border sends)
 *       - DB enum: EInvoiceSendChannel.PEPPOL_BIS
 *
 *   - 'OIOUBL' (alias, settings-only) → "Sproom (Auto Peppol+NemHandel)"
 *       - Same as STORECOVE but goes through the NEMHANDEL_OIOUBL enum
 *       - DB enum: EInvoiceSendChannel.NEMHANDEL_OIOUBL
 *       - Kept as a settings-page option for legacy tenants that
 *         selected it before the channel dropdown was simplified.
 *
 * The settings UI uses short aliases ('OIOUBL' / 'PEPPOL' / 'STORECOVE')
 * because they match the document-format vocabulary users know. The
 * database column `einvoiceDefaultChannel` is typed as the Prisma enum
 * `EInvoiceSendChannel` whose members are NEMHANDEL_OIOUBL | PEPPOL_BIS |
 * STORECOVE. These helpers translate at the lib boundary so callers may
 * freely use either the alias or the canonical enum name.
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
      sproomChildCompanyId: true,
      sproomConnectedAt: true,
      sproomNemHandelRegistered: true,
      sproomPeppolRegistered: true,
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
    sproomChildCompanyId: company.sproomChildCompanyId,
    sproomConnectedAt: company.sproomConnectedAt?.toISOString() ?? null,
    sproomNemHandelRegistered: company.sproomNemHandelRegistered,
    sproomPeppolRegistered: company.sproomPeppolRegistered,
    activeAccessPoint: getActiveAccessPoint(),
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
      sproomChildCompanyId: true,
      sproomConnectedAt: true,
      sproomNemHandelRegistered: true,
      sproomPeppolRegistered: true,
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
    sproomChildCompanyId: company.sproomChildCompanyId,
    sproomConnectedAt: company.sproomConnectedAt?.toISOString() ?? null,
    sproomNemHandelRegistered: company.sproomNemHandelRegistered,
    sproomPeppolRegistered: company.sproomPeppolRegistered,
    activeAccessPoint: getActiveAccessPoint(),
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
 * through the NHR portal or via Sproom onboarding.
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

// ─── INVOICE ACCRUAL JOURNAL ENTRY ─────────────────────────────────
//
// When an invoice is sent (DRAFT → SENT), an accrual journal entry
// must be created to record the receivable (Tilgodehavende), revenue
// (Omsætning), and output VAT (Udgående moms). This is the same logic
// as /api/invoices/[id]/send (PDF email) — extracted here so both the
// PDF and e-invoice send paths use identical accounting.
//
// Journal entry structure:
//   Debit  1200 (Tilgodehavende)     = total gross amount
//   Credit 4100 (Omsætning)          = net amount per line
//   Credit 4510 (Udgående moms 25%)  = VAT 25% amount
//   Credit 4520 (Udgående moms 12%)  = VAT 12% amount

async function createInvoiceAccrualJournalEntry(
  invoice: {
    invoiceNumber: string;
    customerName: string;
    issueDate: Date;
    lineItems: unknown;
    projectId?: string | null;
  },
  companyId: string,
  userId: string,
): Promise<void> {
  const lineItems = (Array.isArray(invoice.lineItems) ? invoice.lineItems : []) as Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    vatPercent: number;
    accountId?: string;
  }>;

  // Standard Danish chart of accounts
  const receivablesAccount = await db.account.findFirst({
    where: { companyId, number: '1200', isActive: true },
  });
  const outputVat25Account = await db.account.findFirst({
    where: { companyId, number: '4510', isActive: true },
  });
  const outputVat12Account = await db.account.findFirst({
    where: { companyId, number: '4520', isActive: true },
  });
  const defaultRevenueAccount = await db.account.findFirst({
    where: { companyId, number: '4100', isActive: true },
  });

  if (!receivablesAccount) {
    logger.warn('[JOURNAL_ENTRY] No receivables account (1200) found — skipping accrual JE');
    return;
  }

  const jeLines: Array<{
    accountId: string;
    debit: number;
    credit: number;
    description: string;
    vatCode?: string | null;
  }> = [];
  let totalGross = 0;
  const vatByRate: Record<number, number> = {};

  for (const item of lineItems) {
    if (!item.description?.trim() || (item.unitPrice ?? 0) <= 0) continue;
    const netAmount = Number(item.quantity) * Number(item.unitPrice);
    const vatAmount = (netAmount * Number(item.vatPercent)) / 100;
    const grossAmount = netAmount + vatAmount;

    const revenueAccountId = item.accountId || defaultRevenueAccount?.id;
    if (revenueAccountId) {
      jeLines.push({
        accountId: revenueAccountId,
        debit: 0,
        credit: netAmount,
        description: item.description,
        vatCode: null,
      });
    }

    if (vatAmount > 0) {
      vatByRate[item.vatPercent] = (vatByRate[item.vatPercent] || 0) + vatAmount;
    }

    totalGross += grossAmount;
  }

  if (totalGross <= 0) return;

  // Debit Tilgodehavende (receivables)
  jeLines.unshift({
    accountId: receivablesAccount.id,
    debit: totalGross,
    credit: 0,
    description: `${invoice.invoiceNumber} – ${invoice.customerName}`,
  });

  // Credit Udgående moms 25%
  if (vatByRate[25] && outputVat25Account) {
    jeLines.push({
      accountId: outputVat25Account.id,
      debit: 0,
      credit: vatByRate[25],
      description: `${invoice.invoiceNumber} – Udgående moms 25%`,
      vatCode: 'S25',
    });
  }

  // Credit Udgående moms 12%
  if (vatByRate[12] && outputVat12Account) {
    jeLines.push({
      accountId: outputVat12Account.id,
      debit: 0,
      credit: vatByRate[12],
      description: `${invoice.invoiceNumber} – Udgående moms 12%`,
      vatCode: 'S12',
    });
  }

  // Validate balanced (debit = credit)
  const totalDebit = jeLines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = jeLines.reduce((s, l) => s + l.credit, 0);

  if (jeLines.length < 2 || Math.abs(totalDebit - totalCredit) >= 0.01) {
    logger.warn('[JOURNAL_ENTRY] Unbalanced JE — skipping', {
      invoiceNumber: invoice.invoiceNumber,
      totalDebit,
      totalCredit,
      lineCount: jeLines.length,
    });
    return;
  }

  // Create the journal entry in a transaction + assign voucher number
  await db.$transaction(async (tx) => {
    const je = await tx.journalEntry.create({
      data: {
        date: invoice.issueDate,
        description: `Tilgodehavende – Faktura ${invoice.invoiceNumber} – ${invoice.customerName}`,
        reference: invoice.invoiceNumber,
        status: 'POSTED',
        userId,
        companyId,
        lines: {
          create: jeLines.map((l) => ({
            companyId,
            accountId: l.accountId,
            debit: l.debit,
            credit: l.credit,
            description: l.description,
            vatCode: (l.vatCode as string | null) ?? null,
            projectId: invoice.projectId ?? null,
          })) as any,
        },
      },
    });
    await assignVoucherNumberIfPosted(tx, je.id, companyId, 'POSTED');
  });
}
