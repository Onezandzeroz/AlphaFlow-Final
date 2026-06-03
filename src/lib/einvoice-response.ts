/**
 * E-invoice XML Response Generators
 *
 * Generates three types of XML responses for e-invoice reception:
 * 1. ApplicationResponse (OIOUBL) — UBL 2.1 standard
 * 2. MessageLevelResponse (Peppol) — Peppol messaging
 * 3. InvoiceResponse (Peppol) — Per-line invoice response
 *
 * Dependencies: xmlbuilder2 (create function)
 */

import { create } from 'xmlbuilder2';

// ─── UBL NAMESPACES ─────────────────────────────────────────────

const UBL_NS = 'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2';
const CAC_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
const CBC_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';

const PEPPOL_MSG_NS = 'urn:oasis:names:specification:ubl:schema:xsd:MessageLevelResponse-2.1';
const PEPPOL_INV_NS = 'urn:oasis:names:specification:ubl:schema:xsd:InvoiceResponse-2.1';

// ─── HELPERS ────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `AR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

// ─── 1. APPLICATION RESPONSE (OIOUBL) ──────────────────────────

/**
 * Generate UBL 2.1 ApplicationResponse XML for OIOUBL invoices.
 * Used for N9 requirement.
 */
export function generateApplicationResponse(params: {
  invoiceId: string;
  responseCode: 'ACCEPTED' | 'REJECTED' | 'PARTIALLY_ACCEPTED';
  errors?: string[];
}): string {
  const { invoiceId, responseCode, errors = [] } = params;

  const now = nowIso();
  const responseId = generateId();

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('ApplicationResponse')
    .att('xmlns', UBL_NS)
    .att(`xmlns:cac`, CAC_NS)
    .att(`xmlns:cbc`, CBC_NS);

  // UBLVersionID
  doc.ele('cbc:UBLVersionID').txt('2.1').up();

  // CustomizationID
  doc.ele('cbc:CustomizationID').txt('urn:oioubl:applicationresponse:1.0').up();

  // ProfileID
  doc.ele('cbc:ProfileID').txt('urn:oioubl:profil: faktura:1.0').up();

  // ID
  doc.ele('cbc:ID').txt(responseId).up();

  // IssueDate
  doc.ele('cbc:IssueDate').txt(now.slice(0, 10)).up();

  // IssueTime
  doc.ele('cbc:IssueTime').txt(now.slice(11, 19)).up();

  // ── DocumentResponse ─────────────────────────────────────────
  const dr = doc.ele('cac:DocumentResponse');

  // DocumentReference (referencing the received invoice)
  dr.ele('cac:DocumentReference')
    .ele('cbc:ID').txt(invoiceId).up()
    .ele('cbc:DocumentTypeCode').txt('380').up()
    .up();

  // Response
  const resp = dr.ele('cac:Response');

  // ResponseCode
  resp.ele('cbc:ResponseCode').txt(responseCode).up();

  // Description
  resp.ele('cbc:Description')
    .txt(
      responseCode === 'ACCEPTED'
        ? 'Faktura modtaget og accepteret'
        : responseCode === 'REJECTED'
          ? 'Faktura afvist'
          : 'Faktura delvist accepteret'
    )
    .up();

  // Add error details if rejected
  if ((responseCode === 'REJECTED' || responseCode === 'PARTIALLY_ACCEPTED') && errors.length > 0) {
    for (const error of errors) {
      resp.ele('cac:Status')
        .ele('cbc:ConditionCode').txt('REJECTED').up()
        .ele('cbc:Description').txt(error).up()
        .up();
    }
  }

  return doc.end({ prettyPrint: true });
}

// ─── 2. MESSAGE LEVEL RESPONSE (PEPPOL) ──────────────────────────

/**
 * Generate Peppol MessageLevelResponse XML.
 * Used for N12 requirement.
 */
export function generateMessageLevelResponse(params: {
  messageId: string;
  responseCode: 'OK' | 'ERROR';
  errors?: string[];
}): string {
  const { messageId, responseCode, errors = [] } = params;

  const now = nowIso();
  const responseId = generateId();

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('MessageLevelResponse')
    .att('xmlns', PEPPOL_MSG_NS)
    .att(`xmlns:cac`, CAC_NS)
    .att(`xmlns:cbc`, CBC_NS);

  // UBLVersionID
  doc.ele('cbc:UBLVersionID').txt('2.1').up();

  // CustomizationID
  doc.ele('cbc:CustomizationID')
    .txt('urn:fdc:peppol.eu:2017:poacc:billing:3.0:message:level:response')
    .up();

  // ProfileID
  doc.ele('cbc:ProfileID')
    .txt('urn:fdc:peppol.eu:2017:poacc:billing:01:1.0')
    .up();

  // ID
  doc.ele('cbc:ID').txt(responseId).up();

  // IssueDate
  doc.ele('cbc:IssueDate').txt(now.slice(0, 10)).up();

  // IssueTime
  doc.ele('cbc:IssueTime').txt(now.slice(11, 19)).up();

  // ── MessageLevelResponseDocumentReference ────────────────────
  doc.ele('cac:MessageLevelResponseDocumentReference')
    .ele('cbc:ID').txt(messageId).up()
    .up();

  // ── Response ────────────────────────────────────────────────
  const resp = doc.ele('cac:Response');

  resp.ele('cbc:ResponseCode').txt(responseCode).up();

  resp.ele('cbc:Description')
    .txt(
      responseCode === 'OK'
        ? 'E-faktura modtaget uden fejl'
        : 'E-faktura modtaget med fejl'
    )
    .up();

  // Add error details
  if (responseCode === 'ERROR' && errors.length > 0) {
    for (const error of errors) {
      resp.ele('cac:Status')
        .ele('cbc:ConditionCode').txt('REJECTED').up()
        .ele('cbc:Description').txt(error).up()
        .up();
    }
  }

  return doc.end({ prettyPrint: true });
}

// ─── 3. INVOICE RESPONSE (PEPPOL) ──────────────────────────────

/**
 * Generate Peppol InvoiceResponse XML with per-line response codes.
 * Used for N13 requirement.
 */
export function generateInvoiceResponse(params: {
  invoiceId: string;
  responseCode: 'OK' | 'ERROR';
  lineResponses?: Array<{
    lineId: string;
    code: 'OK' | 'ERROR';
    description?: string;
  }>;
}): string {
  const { invoiceId, responseCode, lineResponses = [] } = params;

  const now = nowIso();
  const responseId = generateId();

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('InvoiceResponse')
    .att('xmlns', PEPPOL_INV_NS)
    .att(`xmlns:cac`, CAC_NS)
    .att(`xmlns:cbc`, CBC_NS);

  // UBLVersionID
  doc.ele('cbc:UBLVersionID').txt('2.1').up();

  // CustomizationID
  doc.ele('cbc:CustomizationID')
    .txt('urn:fdc:peppol.eu:2017:poacc:billing:3.0:invoice:response')
    .up();

  // ProfileID
  doc.ele('cbc:ProfileID')
    .txt('urn:fdc:peppol.eu:2017:poacc:billing:01:1.0')
    .up();

  // ID
  doc.ele('cbc:ID').txt(responseId).up();

  // IssueDate
  doc.ele('cbc:IssueDate').txt(now.slice(0, 10)).up();

  // IssueTime
  doc.ele('cbc:IssueTime').txt(now.slice(11, 19)).up();

  // ── InvoiceDocumentReference ─────────────────────────────────
  doc.ele('cac:InvoiceDocumentReference')
    .ele('cbc:ID').txt(invoiceId).up()
    .up();

  // ── InvoiceLineResponse ───────────────────────────────────────
  if (lineResponses.length > 0) {
    for (const lr of lineResponses) {
      const lineResp = doc.ele('cac:InvoiceLineResponse');

      lineResp.ele('cbc:LineID').txt(lr.lineId).up();

      const lrResponse = lineResp.ele('cac:Response');
      lrResponse.ele('cbc:ResponseCode').txt(lr.code).up();

      if (lr.description) {
        lrResponse.ele('cbc:Description').txt(lr.description).up();
      }

      lrResponse.ele('cac:Status')
        .ele('cbc:ConditionCode').txt(lr.code === 'OK' ? 'ORIGINAL' : 'REJECTED').up()
        .up();

      lrResponse.up();
      lineResp.up();
    }
  } else {
    // No line responses — add a single document-level response
    const resp = doc.ele('cac:Response');
    resp.ele('cbc:ResponseCode').txt(responseCode).up();

    resp.ele('cbc:Description')
      .txt(
        responseCode === 'OK'
          ? 'Faktura accepteret i sin helhed'
          : 'Faktura afvist i sin helhed'
      )
      .up();

    resp.ele('cac:Status')
      .ele('cbc:ConditionCode').txt(responseCode === 'OK' ? 'ORIGINAL' : 'REJECTED').up()
      .up();

    resp.up();
  }

  return doc.end({ prettyPrint: true });
}
