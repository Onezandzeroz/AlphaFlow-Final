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
 * must then approve via MitID on TastSelv Erhverv through the returned deep link.
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

export interface SkatVatField {
  /** The 17 MomsAngivelse field names from the XSD, in sequence. */
  fieldName: string;
  value: number;
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
  // crypto.randomUUID is available in Node 19+ and Bun
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback
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
 * production, this is done by a SOAP client library (CXF/WSS4J for Java,
 * or a Node.js soap client with xml-crypto). The signature covers:
 * Timestamp, Body, and BinarySecurityToken.
 *
 * The returned XML is the UNSIGNED body — the signing step wraps it.
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

/**
 * Build the SOAP request XML for VirksomhedKalenderHent.
 * Fetches VAT periods + deadlines for a given SE-number and date range.
 */
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

/**
 * Parse the VirksomhedKalenderHent SOAP response.
 * Extracts periods, deadlines, and frequency codes.
 */
export function parseVirksomhedKalenderHentResponse(responseXml: string): SkatVatCalendarResult {
  // Simple regex-based parsing (avoids full XML parser dependency)
  const seMatch = responseXml.match(/VirksomhedSENummerIdentifikator[^>]*>(\d+)</);
  const periodMatches = responseXml.matchAll(
    /AngivelsePeriodeFraDato>(\d{4}-\d{2}-\d{2})<\/[^>]+>\s*<[^>]*AngivelsePeriodeTilDato>(\d{4}-\d{2}-\d{2})<\/[^>]+>\s*(?:<[^>]*AngivelseFrekvensTypeKode>(\w+)<\/[^>]+>)?/g,
  );

  const periods: SkatVatPeriod[] = [];
  for (const match of periodMatches) {
    periods.push({
      periodStart: match[1],
      periodEnd: match[2],
      deadline: '', // extracted separately if present
      frequencyCode: match[3] || '',
      isOpen: true, // determined by comparing with current date
    });
  }

  return {
    seNumber: seMatch ? seMatch[1] : '',
    periods,
  };
}

// ─── Service 2: ModtagMomsangivelseForeloebig ─────────────────────────

/**
 * The 17 VAT fields in the exact sequence required by the XSD.
 * Each field maps to a specific MomsAngivelse* element.
 */
export const VAT_FIELD_NAMES = [
  'MomsAngivelseAfgiftTilsvarBeloeb',          // 1. Total tax due (positive=pay, negative=refund)
  'MomsAngivelseCO2AfgiftBeloeb',              // 2. CO2 tax (deductible)
  'MomsAngivelseEUKoebBeloeb',                 // 3. Box A – goods (EU acquisitions, ex-VAT)
  'MomsAngivelseEUSalgBeloebVarerBeloeb',      // 4. Box B – goods, EU sales without VAT
  'MomsAngivelseIkkeEUSalgBeloebVarerBeloeb',  // 5. Box B – install/montage, distance sales
  'MomsAngivelseElAfgiftBeloeb',               // 6. Electricity tax (deductible)
  'MomsAngivelseEksportOmsaetningBeloeb',      // 7. Box C – other zero-rated supplies
  'MomsAngivelseGasAfgiftBeloeb',              // 8. Natural gas / town gas tax (deductible)
  'MomsAngivelseKoebsMomsBeloeb',              // 9. Input VAT (purchases)
  'MomsAngivelseKulAfgiftBeloeb',              // 10. Coal tax (deductible)
  'MomsAngivelseMomsEUKoebBeloeb',             // 11. VAT on goods purchased abroad
  'MomsAngivelseMomsEUYdelserBeloeb',          // 12. VAT on services purchased abroad (reverse charge)
  'MomsAngivelseOlieAfgiftBeloeb',             // 13. Oil / bottled gas tax (deductible)
  'MomsAngivelseSalgsMomsBeloeb',              // 14. Output VAT (sales)
  'MomsAngivelseVandAfgiftBeloeb',             // 15. Water tax (deductible)
  'MomsAngivelseEUKoebYdelseBeloeb',           // 16. Box A – services (EU service purchases, ex-VAT)
  'MomsAngivelseEUSalgYdelseBeloeb',           // 17. Box B – services (certain EU service sales ex-VAT)
] as const;

/**
 * Build the SOAP request XML for ModtagMomsangivelseForeloebig.
 * Submits a DRAFT VAT return with the 17 VAT field values.
 */
export function buildModtagMomsangivelseForeloebigRequest(
  seNumber: string,
  periodFrom: string,
  periodTo: string,
  vatFields: Record<string, number>,
): string {
  // Build the Angivelsesafgifter block with the 17 fields in sequence.
  // Only emit fields that have a non-zero value (XSD allows omission).
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

/**
 * Parse the ModtagMomsangivelseForeloebig SOAP response.
 * Extracts the TransaktionIdentifier (for receipt retrieval) and the
 * deep link (Dybtlink) to TastSelv Erhverv.
 */
export function parseModtagMomsangivelseForeloebigResponse(responseXml: string): SkatVatSubmissionResult {
  // The TransaktionIdentifier is in the data namespace (ns2), not the context (ns)
  const txIdMatch = responseXml.match(
    /<(?:ns2:)?TransaktionIdentifier[^>]*>([0-9a-fA-F-]{36})<\/(?:ns2:)?TransaktionIdentifier>/,
  );
  const deepLinkMatch = responseXml.match(/UrlIndicator[^>]*>(https?:\/\/[^<]+)<\/UrlIndicator/);
  // Advisory codes 5001 (ordinary) or 5002 (subsequent declaration)
  const advisoryMatch = responseXml.match(/AdvisoryKode[^>]*>(\d+)<\/AdvisoryKode/);

  return {
    transactionIdentifier: txIdMatch ? txIdMatch[1] : '',
    deepLink: deepLinkMatch ? deepLinkMatch[1] : null,
    advisoryCode: advisoryMatch ? advisoryMatch[1] : null,
    responseXml,
  };
}

// ─── Service 3: MomsangivelseKvitteringHent ───────────────────────────

/**
 * Build the SOAP request XML for MomsangivelseKvitteringHent.
 * Fetches the receipt (PDF) after the legal entity has approved the draft
 * in TastSelv Erhverv. Returns error 4810 if not yet approved.
 */
export function buildMomsangivelseKvitteringHentRequest(
  transactionIdentifier: string,
): string {
  const body = `      <urn1:TransaktionIdentifier>${escapeXml(transactionIdentifier)}</urn1:TransaktionIdentifier>`;
  return buildSoapEnvelope('MomsangivelseKvitteringHent', body);
}

/**
 * Parse the MomsangivelseKvitteringHent SOAP response.
 * Extracts the receipt PDF (base64) and payment information.
 * Returns approved=false with errorCode if the draft is not yet approved.
 */
export function parseMomsangivelseKvitteringHentResponse(responseXml: string): SkatReceiptResult {
  // Check for error codes (4810 = not yet approved, 4811 = rejected, 4812 = no receipt)
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

  // Extract PDF receipt (base64-encoded)
  const pdfMatch = responseXml.match(/KvitteringPdf[^>]*>([A-Za-z0-9+/=]+)<\/KvitteringPdf/);

  // Extract payment info
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

/**
 * Send a signed SOAP request to a SKAT endpoint via mutual TLS.
 *
 * PRODUCTION: This must use a real HTTP client with mTLS support that loads
 * the VOCES3 certificate from the keystore and applies WS-Security XML
 * signature to the SOAP body. In Node.js/Bun, this requires:
 *   - `https.Agent` with `cert`, `key`, `ca` options for mTLS
 *   - `xml-crypto` or similar for WS-Security XML-DSig signing
 *
 * SIMULATION MODE: When no keystore is configured, returns a simulated
 * response so the UI flow can be tested end-to-end.
 *
 * @param endpointUrl - The SKAT SOAP endpoint URL
 * @param soapXml - The unsigned SOAP envelope XML
 * @returns The SOAP response XML
 */
async function sendSoapRequest(endpointUrl: string, soapXml: string): Promise<string> {
  if (!hasSkatCredentials()) {
    throw new SkatApiError(
      'SKAT_CREDENTIALS_MISSING',
      'SKAT mTLS credentials not configured. Set SKAT_KEYSTORE_PATH, SKAT_CERT_ALIAS, ' +
      'and the SKAT_ENDPOINT_* environment variables. See docs/SKAT-setup.md for onboarding.',
    );
  }

  // ── Production path: mTLS + WS-Security signing ──
  // TODO: When real credentials are available, implement:
  //   1. Load VOCES3 cert + private key from keystore (PKCS12/JKS)
  //   2. Sign the SOAP body with xml-crypto (rsa-sha1, WS-Security)
  //   3. Send via https.Agent with cert + key + ca (mTLS)
  //
  // For now, this throws so the caller can fall back to simulation mode.
  // The actual signing + mTLS implementation will be added once we receive
  // the test VOCES3 certificate from Skattestyrelsen.

  throw new SkatApiError(
    'SKAT_MTLS_NOT_IMPLEMENTED',
    'mTLS + WS-Security signing is not yet implemented. This requires the VOCES3 ' +
    'certificate from MitID Erhverv. Contact momsapi@sktst.dk to get test credentials. ' +
    'Once the certificate is available, the sendSoapRequest function will be completed ' +
    'with xml-crypto signing + https.Agent mTLS support.',
  );
}

// ─── Simulated Responses (for UI testing without real certificates) ───

/** Generate a simulated calendar response for UI testing. */
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

/** Generate a simulated VAT submission response for UI testing. */
function simulateModtagMomsangivelseForeloebig(
  seNumber: string,
  periodFrom: string,
  periodTo: string,
): SkatVatSubmissionResult {
  const txId = generateTransactionId();
  return {
    transactionIdentifier: txId,
    deepLink: `https://tastselv.skat.dk/momsindberetning?tx=${txId}&se=${seNumber}&from=${periodFrom}&to=${periodTo}`,
    advisoryCode: '5001', // ordinary draft
    responseXml: `<?xml version="1.0" encoding="UTF-8"?>
<SIMULATED_RESPONSE>
  <TransaktionIdentifier>${txId}</TransaktionIdentifier>
  <Dybtlink>
    <UrlIndicator>https://tastselv.skat.dk/momsindberetning?tx=${txId}</UrlIndicator>
  </Dybtlink>
  <AdvisoryKode>5001</AdvisoryKode>
  <Message>Simulated — no SKAT mTLS credentials configured. This is a mock response for UI testing.</Message>
</SIMULATED_RESPONSE>`,
  };
}

/** Generate a simulated receipt response for UI testing. */
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

/**
 * Service 1: Get the VAT calendar (periods + deadlines) for a SE-number.
 *
 * @param seNumber - The legal entity's SE-number (8 digits)
 * @param dateFrom - Start of search range (YYYY-MM-DD)
 * @param dateTo   - End of search range (YYYY-MM-DD)
 */
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

/**
 * Service 2: Submit a DRAFT VAT return to SKAT.
 *
 * The draft is pre-filled in TastSelv Erhverv. The legal entity must then
 * approve it with MitID via the returned deep link.
 *
 * @param seNumber  - The legal entity's SE-number (8 digits)
 * @param periodFrom - Period start (YYYY-MM-DD)
 * @param periodTo   - Period end (YYYY-MM-DD)
 * @param vatFields  - The 17 VAT field values (keyed by field name)
 */
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

/**
 * Service 3: Fetch the VAT receipt after the legal entity has approved
 * the draft in TastSelv Erhverv.
 *
 * Returns errorCode='4810' if the draft has not yet been approved.
 *
 * @param transactionIdentifier - The ID returned by the draft submission
 */
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

/**
 * Map AlphaFlow's VAT register data to the 17 SKAT MomsAngivelse fields.
 *
 * AlphaFlow's internal VAT codes:
 *   Output (salg): S25 (25%), S12 (12%), S0 (0%), SEU (EU sale, 0%)
 *   Input (køb):   K25 (25%), K12 (12%), K0 (0%), KEU (reverse charge), KUF
 *
 * SKAT's 17 fields (in sequence, see VAT_FIELD_NAMES):
 *   Field 9  = Input VAT (KoebsMoms)
 *   Field 14 = Output VAT (SalgsMoms)
 *   Field 1  = Net tax due (AfgiftTilsvar = SalgsMoms − KoebsMoms)
 *
 * For now, we map the most common fields. Fields for CO2, electricity, gas,
 * coal, oil, water taxes are left as 0 (AlphaFlow doesn't track these yet).
 * EU acquisition/sale boxes (A/B) are also 0 until AlphaFlow tracks EU trade.
 *
 * @param vatRegister - The result from computeVATRegister()
 * @returns The 17 VAT field values keyed by field name
 */
export function mapVatRegisterToSkatFields(vatRegister: {
  totalOutputVAT: number;
  totalInputVAT: number;
  netVATPayable: number;
  outputVAT?: Array<{ code: string; netAmount: number }>;
  inputVAT?: Array<{ code: string; netAmount: number }>;
}): Record<string, number> {
  const fields: Record<string, number> = {};

  // Field 14: Output VAT (SalgsMoms) — total output VAT
  fields['MomsAngivelseSalgsMomsBeloeb'] = Math.max(0, vatRegister.totalOutputVAT);

  // Field 9: Input VAT (KoebsMoms) — total input VAT
  fields['MomsAngivelseKoebsMomsBeloeb'] = Math.max(0, vatRegister.totalInputVAT);

  // Field 1: Total tax due (positive = pay, negative = refund)
  fields['MomsAngivelseAfgiftTilsvarBeloeb'] = vatRegister.netVATPayable;

  // EU trade fields — populated when AlphaFlow tracks EU acquisitions/sales
  // For now these are 0 (omitted from the XML since they're 0)
  // Future: map SEU output → MomsAngivelseEUSalgBeloebVarerBeloeb (box B)
  // Future: map KEU input → MomsAngivelseEUKoebBeloeb (box A)

  return fields;
}
