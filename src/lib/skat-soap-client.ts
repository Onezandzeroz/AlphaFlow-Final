/**
 * SKAT RSU B2B SOAP Client — NemVirksomhed Momsindberetning Integration
 *
 * Implements the 3 SOAP web services from Skattestyrelsen's RSU B2B Gateway:
 *   1. VirksomhedKalenderHent        — get VAT periods + deadlines for a SE-number
 *   2. ModtagMomsangivelseForeloebig — submit a DRAFT VAT return (17 fields)
 *   3. MomsangivelseKvitteringHent   — fetch receipt (PDF) after user approval
 *
 * Architecture:
 *   - Transport: HTTPS with mutual TLS (mTLS) using a VOCES3 System (S1) certificate
 *   - Message security: WS-Security XML signature (rsa-sha1) over Timestamp + Body
 *   - Format: SOAP 1.1 document/literal XML
 *   - Namespace: urn:oio:skat:nemvirksomhed:ws:1.0.0
 *
 * The RSU (AlphaFlow) submits a DRAFT. The legal entity (the customer company)
 * must then approve it via MitID on TastSelv Erhverv through the returned deep link.
 * After approval, the receipt can be fetched via MomsangivelseKvitteringHent.
 *
 * References:
 *   - https://github.com/skat/rsu-b2b-sample-client-java
 *   - Target namespace: urn:oio:skat:nemvirksomhed:ws:1.0.0
 *
 * Onboarding steps (organizational, not code):
 *   1. Email momsapi@sktst.dk with AlphaFlow's CVR to get test endpoints + test VOCES3 cert
 *   2. Order a VOCES3 System (S1) certificate from MitID Erhverv for production
 *   3. Each customer company must delegate "Nemvirksomhed – adgang for systemudbyder"
 *      to AlphaFlow's CVR on skat.dk (one-time per customer)
 *
 * Environment variables:
 *   SKAT_ENV                                    = "test" | "production"
 *   SKAT_ENDPOINT_VIRKSOMHEDKALENDERHENT       = https://<host>/VirksomhedKalenderHent
 *   SKAT_ENDPOINT_MODTAGMOMSANGIVELSEFORELOEBIG = https://<host>/ModtagMomsangivelseForeloebig
 *   SKAT_ENDPOINT_MOMSANGIVELSEKVITTERINGHENT  = https://<host>/MomsangivelseKvitteringHent
 *   SKAT_KEYSTORE_PATH                          = /path/to/client-keystore.jks (or .p12)
 *   SKAT_KEYSTORE_PASSWORD                      = keystore password
 *   SKAT_KEY_PASSWORD                           = private key password
 *   SKAT_CERT_ALIAS                             = cert alias in keystore (the S1 cert)
 *   SKAT_TRUSTSTORE_PATH                        = /path/to/client-truststore.jks
 *   SKAT_TRUSTSTORE_PASSWORD                    = truststore password
 *   ALPHAFLOW_CVR                               = AlphaFlow's own CVR (the RSU identifier)
 *
 * When endpoints are not configured, all calls return a simulated response
 * so the UI flow can be tested without real certificates.
 */

import { logger } from '@/lib/logger';

// ─── Configuration ────────────────────────────────────────────────────

const SKAT_ENV = process.env.SKAT_ENV || 'test';

const ENDPOINTS = {
  virksomhedKalenderHent: process.env.SKAT_ENDPOINT_VIRKSOMHEDKALENDERHENT || '',
  modtagMomsangivelseForeloebig: process.env.SKAT_ENDPOINT_MODTAGMOMSANGIVELSEFORELOEBIG || '',
  momsangivelseKvitteringHent: process.env.SKAT_ENDPOINT_MOMSANGIVELSEKVITTERINGHENT || '',
};

const KEYSTORE_PATH = process.env.SKAT_KEYSTORE_PATH || '';
const KEYSTORE_PASSWORD = process.env.SKAT_KEYSTORE_PASSWORD || '';
const KEY_PASSWORD = process.env.SKAT_KEY_PASSWORD || '';
const CERT_ALIAS = process.env.SKAT_CERT_ALIAS || '';
const TRUSTSTORE_PATH = process.env.SKAT_TRUSTSTORE_PATH || '';
const TRUSTSTORE_PASSWORD = process.env.SKAT_TRUSTSTORE_PASSWORD || '';
const ALPHAFLOW_CVR = process.env.ALPHAFLOW_CVR || '';

/** Check if SKAT SOAP/mTLS credentials are configured. */
export function hasSkatCredentials(): boolean {
  return !!(
    ENDPOINTS.virksomhedKalenderHent &&
    ENDPOINTS.modtagMomsangivelseForeloebig &&
    ENDPOINTS.momsangivelseKvitteringHent &&
    KEYSTORE_PATH &&
    CERT_ALIAS
  );
}

// ─── Types ────────────────────────────────────────────────────────────

export interface SkatVatPeriod {
  periodStart: string;  // YYYY-MM-DD
  periodEnd: string;    // YYYY-MM-DD
  deadline: string;     // YYYY-MM-DD
  frequencyCode: string; // "07"=monthly, "08"=quarterly, "10"=yearly
  isOpen: boolean;      // period is open for reporting
}

export interface SkatVatCalendarResult {
  seNumber: string;
  periods: SkatVatPeriod[];
}

export interface SkatVatSubmissionResult {
  /** SKAT's transaction identifier — needed for receipt retrieval. */
  transactionIdentifier: string;
  /** Deep link to TastSelv Erhverv where the user approves with MitID. */
  deepLink: string | null;
  /** Advisory code: 5001 = ordinary draft, 5002 = subsequent declaration. */
  advisoryCode: string | null;
  /** Full SOAP response XML (for audit trail). */
  responseXml: string;
}

export interface SkatReceiptResult {
  transactionIdentifier: string;
  /** PDF receipt as base64-encoded string (if available). */
  receiptPdfBase64: string | null;
  /** Payment information. */
  paymentInfo: {
    amount: number | null;
    dueDate: string | null;
    accountNumber: string | null;
  } | null;
  /** True if the draft has been approved and a receipt exists. */
  approved: boolean;
  /** Error code if not approved (e.g. 4810 = not yet approved). */
  errorCode: string | null;
  responseXml: string;
}

export class SkatApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'SkatApiError';
    this.code = code;
  }
}

// ─── SOAP Envelope Builders ───────────────────────────────────────────

const NS_SERVICE = 'urn:oio:skat:nemvirksomhed:ws:1.0.0';
const NS_DATA = 'urn:oio:skat:nemvirksomhed:1.0.0';
const NS_CONTEXT = 'http://rep.oio.dk/skat.dk/basis/kontekst/xml/schemas/2006/09/01/';
const NS_SE = 'http://rep.oio.dk/skat.dk/motor/class/virksomhed/xml/schemas/20080401/';

/** Generate a fresh UUID for TransaktionIdentifikator (required per call). */
function generateTransactionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Current ISO-8601 timestamp for TransaktionTid. */
function nowIso(): string {
  return new Date().toISOString();
}

/** Escape XML special characters in text content. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build the HovedOplysninger (context) block required by every request.
 * Contains a unique transaction ID + timestamp.
 */
function buildHovedOplysninger(): string {
  return `    <ns:HovedOplysninger xmlns:ns="${NS_CONTEXT}">
      <ns:TransaktionIdentifikator>${generateTransactionId()}</ns:TransaktionIdentifikator>
      <ns:TransaktionTid>${nowIso()}</ns:TransaktionTid>
    </ns:HovedOplysninger>`;
}

/**
 * Build a complete SOAP envelope with WS-Security header placeholder.
 *
 * NOTE: The actual XML-DSig signature must be applied by the HTTP client
 * that has access to the VOCES3 private key (mTLS + WS-Security). In
 * production, this is done by a SOAP client library with xml-crypto.
 * The signature covers: Timestamp, Body, and BinarySecurityToken.
 */
function buildSoapEnvelope(serviceName: string, bodyContent: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:urn="${NS_SERVICE}"
               xmlns:urn1="${NS_DATA}">
  <soap:Header>
    <urn:${serviceName}>
${buildHovedOplysninger()}
    </urn:${serviceName}>
  </soap:Header>
  <soap:Body>
    <urn:${serviceName}_I>
${bodyContent}
    </urn:${serviceName}_I>
  </soap:Body>
</soap:Envelope>`;
}

// ─── Service 1: VirksomhedKalenderHent ────────────────────────────────

export function buildVirksomhedKalenderHentRequest(
  seNumber: string,
  dateFrom: string,
  dateTo: string,
): string {
  const body = `      <urn1:AngiverVirksomhedSENummer>
        <urn1:VirksomhedSENummerIdentifikator xmlns:ns1="${NS_SE}">${escapeXml(seNumber)}</urn1:VirksomhedSENummerIdentifikator>
      </urn1:AngiverVirksomhedSENummer>
      <urn1:Angivelsestype> Moms </urn1:Angivelsestype>
      <urn1:DatoFra>${escapeXml(dateFrom)}</urn1:DatoFra>
      <urn1:DatoTil>${escapeXml(dateTo)}</urn1:DatoTil>`;
  return buildSoapEnvelope('VirksomhedKalenderHent', body);
}

export function parseVirksomhedKalenderHentResponse(responseXml: string): SkatVatCalendarResult {
  const seMatch = responseXml.match(/VirksomhedSENummerIdentifikator[^>]*>(\d+)</);
  const periodMatches = responseXml.matchAll(
    /AngivelsePeriodeFraDato>(\d{4}-\d{2}-\d{2})<\/[^>]+>\s*<[^>]*AngivelsePeriodeTilDato>(\d{4}-\d{2}-\d{2})<\/[^>]+>\s*(?:<[^>]*AngivelseFrekvensTypeKode>(\w+)<\/[^>]+>)?/g,
  );

  const periods: SkatVatPeriod[] = [];
  for (const match of periodMatches) {
    periods.push({
      periodStart: match[1],
      periodEnd: match[2],
      deadline: '',
      frequencyCode: match[3] || '',
      isOpen: true,
    });
  }

  return {
    seNumber: seMatch ? seMatch[1] : '',
    periods,
  };
}

// ─── Service 2: ModtagMomsangivelseForeloebig ─────────────────────────

export const VAT_FIELD_NAMES = [
  'MomsAngivelseAfgiftTilsvarBeloeb',
  'MomsAngivelseCO2AfgiftBeloeb',
  'MomsAngivelseEUKoebBeloeb',
  'MomsAngivelseEUSalgBeloebVarerBeloeb',
  'MomsAngivelseIkkeEUSalgBeloebVarerBeloeb',
  'MomsAngivelseElAfgiftBeloeb',
  'MomsAngivelseEksportOmsaetningBeloeb',
  'MomsAngivelseGasAfgiftBeloeb',
  'MomsAngivelseKoebsMomsBeloeb',
  'MomsAngivelseKulAfgiftBeloeb',
  'MomsAngivelseMomsEUKoebBeloeb',
  'MomsAngivelseMomsEUYdelserBeloeb',
  'MomsAngivelseOlieAfgiftBeloeb',
  'MomsAngivelseSalgsMomsBeloeb',
  'MomsAngivelseVandAfgiftBeloeb',
  'MomsAngivelseEUKoebYdelseBeloeb',
  'MomsAngivelseEUSalgYdelseBeloeb',
] as const;

export function buildModtagMomsangivelseForeloebigRequest(
  seNumber: string,
  periodFrom: string,
  periodTo: string,
  vatFields: Record<string, number>,
): string {
  const afgifterXml = VAT_FIELD_NAMES
    .filter((fieldName) => vatFields[fieldName] !== undefined && vatFields[fieldName] !== 0)
    .map((fieldName) => `      <urn1:${fieldName}>${vatFields[fieldName].toFixed(2)}</urn1:${fieldName}>`)
    .join('\n');

  const body = `      <urn1:AngiverVirksomhedSENummer>
        <urn1:VirksomhedSENummerIdentifikator xmlns:ns1="${NS_SE}">${escapeXml(seNumber)}</urn1:VirksomhedSENummerIdentifikator>
      </urn1:AngiverVirksomhedSENummer>
      <urn1:Angivelsesoplysninger>
        <urn1:AngivelsePeriodeFraDato>${escapeXml(periodFrom)}</urn1:AngivelsePeriodeFraDato>
        <urn1:AngivelsePeriodeTilDato>${escapeXml(periodTo)}</urn1:AngivelsePeriodeTilDato>
      </urn1:Angivelsesoplysninger>
      <urn1:Angivelsesafgifter>
${afgifterXml}
      </urn1:Angivelsesafgifter>`;

  return buildSoapEnvelope('ModtagMomsangivelseForeloebig', body);
}

export function parseModtagMomsangivelseForeloebigResponse(responseXml: string): SkatVatSubmissionResult {
  const txIdMatch = responseXml.match(
    /<(?:ns2:)?TransaktionIdentifier[^>]*>([0-9a-fA-F-]{36})<\/(?:ns2:)?TransaktionIdentifier>/,
  );
  const deepLinkMatch = responseXml.match(/UrlIndicator[^>]*>(https?:\/\/[^<]+)<\/UrlIndicator/);
  const advisoryMatch = responseXml.match(/AdvisoryKode[^>]*>(\d+)<\/AdvisoryKode/);

  return {
    transactionIdentifier: txIdMatch ? txIdMatch[1] : '',
    deepLink: deepLinkMatch ? deepLinkMatch[1] : null,
    advisoryCode: advisoryMatch ? advisoryMatch[1] : null,
    responseXml,
  };
}

// ─── Service 3: MomsangivelseKvitteringHent ───────────────────────────

export function buildMomsangivelseKvitteringHentRequest(
  transactionIdentifier: string,
): string {
  const body = `      <urn1:TransaktionIdentifier>${escapeXml(transactionIdentifier)}</urn1:TransaktionIdentifier>`;
  return buildSoapEnvelope('MomsangivelseKvitteringHent', body);
}

export function parseMomsangivelseKvitteringHentResponse(responseXml: string): SkatReceiptResult {
  const errorCodeMatch = responseXml.match(/FejlKode[^>]*>(\d+)<\/FejlKode/);
  const errorCode = errorCodeMatch ? errorCodeMatch[1] : null;

  if (errorCode === '4810' || errorCode === '4811' || errorCode === '4812' || errorCode === '4813') {
    return {
      transactionIdentifier: '',
      receiptPdfBase64: null,
      paymentInfo: null,
      approved: false,
      errorCode,
      responseXml,
    };
  }

  const pdfMatch = responseXml.match(/KvitteringPdf[^>]*>([A-Za-z0-9+/=]+)<\/KvitteringPdf/);
  const amountMatch = responseXml.match(/Beloeb[^>]*>([\d.]+)<\/Beloeb/);
  const dueDateMatch = responseXml.match(/ForfaldDato[^>]*>(\d{4}-\d{2}-\d{2})<\/ForfaldDato/);
  const accountMatch = responseXml.match(/KontoNummer[^>]*>(\d+)<\/KontoNummer/);

  return {
    transactionIdentifier: '',
    receiptPdfBase64: pdfMatch ? pdfMatch[1] : null,
    paymentInfo: (amountMatch || dueDateMatch || accountMatch) ? {
      amount: amountMatch ? parseFloat(amountMatch[1]) : null,
      dueDate: dueDateMatch ? dueDateMatch[1] : null,
      accountNumber: accountMatch ? accountMatch[1] : null,
    } : null,
    approved: true,
    errorCode: null,
    responseXml,
  };
}

// ─── HTTP Transport (mTLS) ────────────────────────────────────────────

async function sendSoapRequest(endpointUrl: string, soapXml: string): Promise<string> {
  if (!hasSkatCredentials()) {
    throw new SkatApiError(
      'SKAT_CREDENTIALS_MISSING',
      'SKAT mTLS credentials not configured. Set SKAT_KEYSTORE_PATH, SKAT_CERT_ALIAS, ' +
      'and the SKAT_ENDPOINT_* environment variables.',
    );
  }

  // PRODUCTION: Load VOCES3 cert from keystore, sign SOAP body with xml-crypto,
  // send via https.Agent with cert + key + ca (mTLS).
  // This will be completed once the VOCES3 test certificate is received from Skattestyrelsen.
  throw new SkatApiError(
    'SKAT_MTLS_NOT_IMPLEMENTED',
    'mTLS + WS-Security signing is not yet implemented. This requires the VOCES3 ' +
    'certificate from MitID Erhverv. Contact momsapi@sktst.dk to get test credentials.',
  );
}

// ─── Simulated Responses ──────────────────────────────────────────────

function simulateVirksomhedKalenderHent(seNumber: string, year: number): SkatVatCalendarResult {
  return {
    seNumber,
    periods: [
      { periodStart: `${year}-01-01`, periodEnd: `${year}-03-31`, deadline: `${year}-04-01`, frequencyCode: '08', isOpen: true },
      { periodStart: `${year}-04-01`, periodEnd: `${year}-06-30`, deadline: `${year}-07-01`, frequencyCode: '08', isOpen: true },
      { periodStart: `${year}-07-01`, periodEnd: `${year}-09-30`, deadline: `${year}-10-01`, frequencyCode: '08', isOpen: true },
      { periodStart: `${year}-10-01`, periodEnd: `${year}-12-31`, deadline: `${year + 1}-01-01`, frequencyCode: '08', isOpen: true },
    ],
  };
}

function simulateModtagMomsangivelseForeloebig(
  seNumber: string,
  periodFrom: string,
  periodTo: string,
): SkatVatSubmissionResult {
  const txId = generateTransactionId();
  return {
    transactionIdentifier: txId,
    deepLink: `https://tastselv.skat.dk/momsindberetning?tx=${txId}&se=${seNumber}&from=${periodFrom}&to=${periodTo}`,
    advisoryCode: '5001',
    responseXml: `<?xml version="1.0" encoding="UTF-8"?>
<SIMULATED_RESPONSE>
  <TransaktionIdentifier>${txId}</TransaktionIdentifier>
  <Dybtlink>
    <UrlIndicator>https://tastselv.skat.dk/momsindberetning?tx=${txId}</UrlIndicator>
  </Dybtlink>
  <AdvisoryKode>5001</AdvisoryKode>
  <Message>Simulated — no SKAT mTLS credentials configured.</Message>
</SIMULATED_RESPONSE>`,
  };
}

function simulateMomsangivelseKvitteringHent(txId: string): SkatReceiptResult {
  return {
    transactionIdentifier: txId,
    receiptPdfBase64: null,
    paymentInfo: { amount: 0, dueDate: null, accountNumber: null },
    approved: true,
    errorCode: null,
    responseXml: `<?xml version="1.0" encoding="UTF-8"?>
<SIMULATED_RECEIPT>
  <TransaktionIdentifier>${txId}</TransaktionIdentifier>
  <Message>Simulated receipt — no real SKAT credentials configured.</Message>
</SIMULATED_RECEIPT>`,
  };
}

// ─── Public API ────────────────────────────────────────────────────────

export async function getVirksomhedKalenderHent(
  seNumber: string,
  dateFrom: string,
  dateTo: string,
): Promise<SkatVatCalendarResult> {
  logger.info(`[SKAT] VirksomhedKalenderHent: SE=${seNumber}, ${dateFrom} → ${dateTo}`);

  if (!hasSkatCredentials()) {
    const year = parseInt(dateFrom.substring(0, 4), 10);
    logger.info('[SKAT] SIMULATED VirksomhedKalenderHent (no mTLS credentials)');
    return simulateVirksomhedKalenderHent(seNumber, year);
  }

  const soapXml = buildVirksomhedKalenderHentRequest(seNumber, dateFrom, dateTo);
  const responseXml = await sendSoapRequest(ENDPOINTS.virksomhedKalenderHent, soapXml);
  return parseVirksomhedKalenderHentResponse(responseXml);
}

export async function submitModtagMomsangivelseForeloebig(
  seNumber: string,
  periodFrom: string,
  periodTo: string,
  vatFields: Record<string, number>,
): Promise<SkatVatSubmissionResult> {
  logger.info(
    `[SKAT] ModtagMomsangivelseForeloebig: SE=${seNumber}, ${periodFrom} → ${periodTo}, ` +
    `fields: ${Object.keys(vatFields).length}`,
  );

  if (!hasSkatCredentials()) {
    logger.info('[SKAT] SIMULATED ModtagMomsangivelseForeloebig (no mTLS credentials)');
    return simulateModtagMomsangivelseForeloebig(seNumber, periodFrom, periodTo);
  }

  const soapXml = buildModtagMomsangivelseForeloebigRequest(seNumber, periodFrom, periodTo, vatFields);
  const responseXml = await sendSoapRequest(ENDPOINTS.modtagMomsangivelseForeloebig, soapXml);
  return parseModtagMomsangivelseForeloebigResponse(responseXml);
}

export async function getMomsangivelseKvitteringHent(
  transactionIdentifier: string,
): Promise<SkatReceiptResult> {
  logger.info(`[SKAT] MomsangivelseKvitteringHent: txId=${transactionIdentifier}`);

  if (!hasSkatCredentials()) {
    logger.info('[SKAT] SIMULATED MomsangivelseKvitteringHent (no mTLS credentials)');
    return simulateMomsangivelseKvitteringHent(transactionIdentifier);
  }

  const soapXml = buildMomsangivelseKvitteringHentRequest(transactionIdentifier);
  const responseXml = await sendSoapRequest(ENDPOINTS.momsangivelseKvitteringHent, soapXml);
  return parseMomsangivelseKvitteringHentResponse(responseXml);
}

// ─── VAT Field Mapper ─────────────────────────────────────────────────

export function mapVatRegisterToSkatFields(vatRegister: {
  totalOutputVAT: number;
  totalInputVAT: number;
  netVATPayable: number;
  outputVAT?: Array<{ code: string; netAmount: number }>;
  inputVAT?: Array<{ code: string; netAmount: number }>;
}): Record<string, number> {
  const fields: Record<string, number> = {};

  fields['MomsAngivelseSalgsMomsBeloeb'] = Math.max(0, vatRegister.totalOutputVAT);
  fields['MomsAngivelseKoebsMomsBeloeb'] = Math.max(0, vatRegister.totalInputVAT);
  fields['MomsAngivelseAfgiftTilsvarBeloeb'] = vatRegister.netVATPayable;

  return fields;
}
