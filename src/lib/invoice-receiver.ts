/**
 * Shared e-invoice receiving logic.
 *
 * Used by BOTH:
 *  - Manual XML upload  → POST /api/invoices/receive  (authenticated user)
 *  - Storecove webhook  → POST /api/storecove/webhook  (no user, system event)
 *
 * Erhvervsstyrelsen requires a platform to both SEND and RECEIVE e-invoices.
 * This module is the single source of truth for the receive-and-store path:
 * parse UBL 2.1 / OIOUBL XML → validate → persist ReceivedInvoice → generate
 * MLR / ApplicationResponse → audit log → notify frontend.
 *
 * Idempotency: ReceivedInvoice has @@unique([companyId, invoiceNumber]).
 * If Storecove retries a webhook (up to 5 days), the duplicate is detected and
 * returned as `{ duplicate: true }` without error, so the webhook returns 200
 * and Storecove stops retrying.
 */

import { db } from '@/lib/db';
import { auditLog } from '@/lib/audit';
import { parseEInvoiceXml, mapDocumentTypeToDbValue, mapFormatToDbValue } from '@/lib/einvoice-parser';
import { generateApplicationResponse, generateMessageLevelResponse } from '@/lib/einvoice-response';
import { logger } from '@/lib/logger';
import { notifyDataChange } from '@/lib/notify-data-change';

export type ReceiveSource = 'manual_upload' | 'storecove_webhook';

export interface StoreReceivedInvoiceParams {
  /** Tenant that owns the received invoice. */
  companyId: string;
  /** User who imported it. `null` for system/webhook delivery. */
  userId: string | null;
  /** Raw UBL 2.1 / OIOUBL XML string. */
  xml: string;
  /** Where this invoice came from. */
  source: ReceiveSource;
  /** Storecove document GUID (when source = storecove_webhook). */
  documentGuid?: string;
  /** Audit metadata (IP, user-agent, webhook event id, etc.). */
  auditMeta?: Record<string, unknown>;
}

export interface StoreReceivedInvoiceResult {
  success: boolean;
  /** Present on success or duplicate. */
  invoice?: { id: string; invoiceNumber: string };
  /** True when the invoice number already exists for this tenant (idempotent). */
  duplicate?: boolean;
  error?: string;
  validationErrors?: string[];
  warnings?: string[];
}

/**
 * Parse an e-invoice XML, persist it as a ReceivedInvoice, generate the
 * matching response (MLR for Peppol BIS 3.0, ApplicationResponse for OIOUBL),
 * write an audit log entry, and notify the frontend.
 *
 * Safe to call from an unauthenticated context (webhook) — pass `userId: null`.
 */
export async function storeReceivedInvoice(
  params: StoreReceivedInvoiceParams,
): Promise<StoreReceivedInvoiceResult> {
  const { companyId, userId, xml, source, documentGuid, auditMeta } = params;

  // ── 1. Parse the XML ──────────────────────────────────────────────
  const result = parseEInvoiceXml(xml);

  if (!result.data) {
    return {
      success: false,
      error: 'Failed to parse e-invoice XML',
      validationErrors: result.errors,
      warnings: result.warnings,
    };
  }

  const parsed = result.data;

  // ── 2. Idempotency check (webhook retries hit this) ──────────────
  const existing = await db.receivedInvoice.findUnique({
    where: {
      companyId_invoiceNumber: {
        companyId,
        invoiceNumber: parsed.invoiceNumber,
      },
    },
  });

  if (existing) {
    logger.info('[INVOICE_RECEIVER] Duplicate received invoice ignored (idempotent)', {
      companyId,
      invoiceNumber: parsed.invoiceNumber,
      existingId: existing.id,
      source,
      documentGuid: documentGuid ?? null,
    });
    return {
      success: false,
      duplicate: true,
      invoice: { id: existing.id, invoiceNumber: existing.invoiceNumber },
      warnings: result.warnings,
    };
  }

  // ── 3. Generate the response document ────────────────────────────
  // Peppol BIS 3.0 → Message Level Response (MLR)
  // OIOUBL         → ApplicationResponse (AR)
  let responseXml: string | undefined;
  let responseType: string | undefined;

  if (parsed.format === 'PEPPOL_BIS') {
    responseXml = generateMessageLevelResponse({
      messageId: parsed.invoiceNumber,
      responseCode: result.errors.length > 0 ? 'ERROR' : 'OK',
      errors: result.errors,
    });
    responseType = 'MESSAGE_LEVEL_RESPONSE';
  } else {
    const appResponseCode = result.errors.length > 0 ? 'REJECTED' as const : 'ACCEPTED' as const;
    responseXml = generateApplicationResponse({
      invoiceId: parsed.invoiceNumber,
      responseCode: appResponseCode,
      errors: result.errors,
    });
    responseType = 'APPLICATION_RESPONSE';
  }

  // ── 4. Parse dates ───────────────────────────────────────────────
  let dueDate: Date | null = null;
  if (parsed.dueDate) {
    const d = new Date(parsed.dueDate);
    if (!isNaN(d.getTime())) dueDate = d;
  }

  const issueDate = new Date(parsed.issueDate);
  if (isNaN(issueDate.getTime())) {
    return { success: false, error: 'Invalid issue date in XML' };
  }

  // Traceability note for webhook-delivered invoices.
  const notes =
    source === 'storecove_webhook' && documentGuid
      ? `Automatisk modtaget via Storecove webhook · document_guid: ${documentGuid}`
      : undefined;

  // ── 5. Persist ───────────────────────────────────────────────────
  const invoice = await db.receivedInvoice.create({
    data: {
      companyId,
      userId,

      // Supplier info
      supplierName: parsed.supplierName,
      supplierCvr: parsed.supplierCvr ?? null,
      supplierEmail: parsed.supplierEmail ?? null,
      supplierPhone: parsed.supplierPhone ?? null,
      supplierAddress: parsed.supplierAddress ?? null,
      supplierCity: parsed.supplierCity ?? null,
      supplierCountry: parsed.supplierCountry ?? null,

      // Invoice identification
      invoiceNumber: parsed.invoiceNumber,
      issueDate,
      dueDate,
      currencyCode: parsed.currencyCode,

      // Classification
      format: mapFormatToDbValue(parsed.format) as 'OIOUBL' | 'PEPPOL_BIS',
      documentType: mapDocumentTypeToDbValue(parsed.documentType) as
        | 'INVOICE'
        | 'CREDIT_NOTE'
        | 'CORRECTED'
        | 'SELF_BILLED',
      customizationId: parsed.customizationId ?? null,
      profileId: parsed.profileId ?? null,

      // Line items
      lineItems: parsed.lineItems as unknown as Record<string, unknown>[],
      lineCount: parsed.lineItems.length,

      // Totals
      taxExclusiveAmount: parsed.taxExclusiveAmount,
      taxAmount: parsed.taxAmount,
      taxInclusiveAmount: parsed.taxInclusiveAmount,
      payableAmount: parsed.payableAmount,

      // Payment info
      paymentMeansCode: parsed.paymentMeansCode ?? null,
      paymentAccountId: parsed.paymentAccountId ?? null,

      // Raw XML
      rawXml: xml,

      // Response
      responseXml: responseXml ?? null,
      responseType: responseType ?? null,

      // Validation
      validationErrors: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
      validationWarnings: result.warnings.length > 0 ? JSON.stringify(result.warnings) : null,

      // Initial status
      status: 'RECEIVED',

      // Traceability
      notes: notes ?? null,
    },
  });

  // ── 6. Audit log (Bogføringsloven §10-12) ────────────────────────
  await auditLog({
    action: 'CREATE',
    entityType: 'ReceivedInvoice',
    entityId: invoice.id,
    userId,
    companyId,
    changes: {
      invoiceNumber: { old: null, new: parsed.invoiceNumber },
      format: { old: null, new: parsed.format },
      documentType: { old: null, new: parsed.documentType },
      supplierName: { old: null, new: parsed.supplierName },
      supplierCvr: { old: null, new: parsed.supplierCvr ?? null },
      totalAmount: { old: null, new: parsed.payableAmount },
      currency: { old: null, new: parsed.currencyCode },
      lineCount: { old: null, new: parsed.lineItems.length },
      responseType: { old: null, new: responseType },
      source: { old: null, new: source },
      documentGuid: { old: null, new: documentGuid ?? null },
    },
    metadata: auditMeta ?? {
      source,
      timestamp: new Date().toISOString(),
    },
  });

  // ── 7. Notify frontend (live inbox refresh) ──────────────────────
  notifyDataChange({ scope: 'received-invoices', companyId, action: 'create' }).catch(() => {});

  logger.info('[INVOICE_RECEIVER] Stored received e-invoice', {
    invoiceId: invoice.id,
    invoiceNumber: parsed.invoiceNumber,
    companyId,
    source,
    documentGuid: documentGuid ?? null,
    format: parsed.format,
    supplierName: parsed.supplierName,
  });

  return {
    success: true,
    invoice: { id: invoice.id, invoiceNumber: parsed.invoiceNumber },
    warnings: result.warnings,
  };
}
