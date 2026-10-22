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
 *     + BinarySecurityToken (DirectReference key identifier)
 *   - Format: SOAP 1.1 document/literal XML
 *   - Namespace: urn:oio:skat:nemvirksomhed:ws:1.0.0
 *
 * The RSU (AlphaFlow) submits a DRAFT. The legal entity (the customer company)
 * must then approve via MitID on TastSelv Erhverv through the returned deep link.
 * After approval, the receipt can be fetched via MomsangivelseKvitteringHent.
 *
 * The SOAP envelope structure matches the official sample requests from
 * https://github.com/skat/rsu-b2b-sample-client-java (src/test/resources/*_Document.xml
 * and assets/full-sample-request.xml):
 *   - HovedOplysninger lives INSIDE <soap:Body> (within the *_I request element),
 *     NOT in the SOAP header. The SOAP header contains only <wsse:Security>.
 *   - <soap:Body> carries a wsu:Id so it can be referenced by the signature.
 *
 * References:
 *   - https://github.com/skat/rsu-b2b-sample-client-java
 *   - Target namespace: urn:oio:skat:nemvirksomhed:ws:1.0.0
 *
 * Environment variables (see .env.example + docs/SKAT-setup.md):
 *   SKAT_ENV                                    = "test" | "production"
 *   SKAT_ENDPOINT_VIRKSOMHEDKALENDERHENT       = https://<host>/VirksomhedKalenderHent
 *   SKAT_ENDPOINT_MODTAGMOMSANGIVELSEFORELOEBIG = https://<host>/ModtagMomsangivelseForeloebig
 *   SKAT_ENDPOINT_MOMSANGIVELSEKVITTERINGHENT  = https://<host>/MomsangivelseKvitteringHent
 *   SKAT_KEYSTORE_PATH                          = /path/to/client.p12 (PKCS12) — or SKAT_CERT_PATH + SKAT_KEY_PATH (PEM)
 *   SKAT_KEYSTORE_PASSWORD / SKAT_KEY_PASSWORD = keystore + key passphrase
 *   SKAT_TRUSTSTORE_PATH                        = /path/to/ca-bundle.pem (SKAT server CA)
 *   ALPHAFLOW_CVR                               = AlphaFlow's own CVR (the RSU identifier)
 *
 * When credentials are not configured, all calls return a simulated response
 * so the UI flow can be tested end-to-end without real certificates.
 */

import https from 'https';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';
import { loadSkatCredentials, isSkatCredentialsConfigured, type SkatCredentials } from '@/lib/skat-keystore';
import { signSoapEnvelope } from '@/lib/skat-ws-security';
import { VAT_RATE_MAP } from '@/lib/vat-codes';

// ─── Configuration ────────────────────────────────────────────────────

const SKAT_ENV = process.env.SKAT_ENV || 'test';

const ENDPOINTS = {
  virksomhedKalenderHent: process.env.SKAT_ENDPOINT_VIRKSOMHEDKALENDERHENT || '',
  modtagMomsangivelseForeloebig: process.env.SKAT_ENDPOINT_MODTAGMOMSANGIVELSEFORELOEBIG || '',
  momsangivelseKvitteringHent: process.env.SKAT_ENDPOINT_MOMSANGIVELSEKVITTERINGHENT || '',
};

/** SOAPAction for each service (from the WSDL soap:operation). */
const SOAP_ACTIONS: Record<string, string> = {
  virksomhedKalenderHent: 'getVirksomhedKalenderHent',
  modtagMomsangivelseForeloebig: 'getModtagMomsangivelseForeloebig',
  momsangivelseKvitteringHent: 'getMomsangivelseKvitteringHent',
};

/**
 * Check if SKAT SOAP/mTLS credentials + endpoints are configured.
 * When false, all calls fall back to simulation mode.
 */
export function hasSkatCredentials(): boolean {
  return !!(
    ENDPOINTS.virksomhedKalenderHent &&
    ENDPOINTS.modtagMomsangivelseForeloebig &&
    ENDPOINTS.momsangivelseKvitteringHent &&
    isSkatCredentialsConfigured()
  );
}

// ─── Types (unchanged — preserved for backward compatibility) ───────────

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
  fieldName: string;
  value: number;
}

export interface SkatVatSubmissionResult {
  transactionIdentifier: string;
  deepLink: string | null;
  advisoryCode: string | null;
  responseXml: string;
  /** SKAT business error code if the submission was rejected (e.g. '475').
   *  When this is non-null, the submission was NOT accepted by SKAT —
   *  transactionIdentifier will be empty and no receipt can be fetched. */
  skatErrorCode: string | null;
  /** Human-readable error text from SKAT (e.g. 'F0475, Der findes ingen angivelser...') */
  skatErrorMessage: string | null;
}

export interface SkatReceiptResult {
  transactionIdentifier: string;
  receiptPdfBase64: string | null;
  paymentInfo: {
    amount: number | null;
    dueDate: string | null;
    accountNumber: string | null;
  } | null;
  approved: boolean;
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

// ─── Namespace constants ──────────────────────────────────────────────

const NS_SERVICE = 'urn:oio:skat:nemvirksomhed:ws:1.0.0';
const NS_DATA = 'urn:oio:skat:nemvirksomhed:1.0.0';
const NS_CONTEXT = 'http://rep.oio.dk/skat.dk/basis/kontekst/xml/schemas/2006/09/01/';
const NS_SE = 'http://rep.oio.dk/skat.dk/motor/class/virksomhed/xml/schemas/20080401/';
const NS_WSSE =
  'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';
const NS_WSU =
  'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd';
const NS_SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';

// ─── Helpers ──────────────────────────────────────────────────────────

/** Generate a fresh UUID for TransaktionIdentifikator (required per call). */
function generateTransactionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return randomUUID();
}

/** Current ISO-8601 timestamp for TransaktionTid.
 *
 * SKAT's sample uses local time with offset, e.g. 2023-06-07T10:05:27.694+02:00
 * We use the local timezone offset format to match exactly what SKAT expects.
 * (UTC with 'Z' is also technically valid XML Schema dateTime, but SKAT's
 * Java XMLGregorianCalendar parser is known to prefer the offset format.)
 */
function nowTransactionTime(): string {
  const d = new Date();
  // Get local timezone offset in minutes, convert to ±HH:MM
  const offsetMin = -d.getTimezoneOffset(); // positive for east of UTC
  const sign = offsetMin >= 0 ? '+' : '-';
  const absMin = Math.abs(offsetMin);
  const hh = String(Math.floor(absMin / 60)).padStart(2, '0');
  const mm = String(absMin % 60).padStart(2, '0');
  // Build local time string (without timezone) then append offset
  const localStr = d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + 'T' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0') + ':' +
    String(d.getSeconds()).padStart(2, '0') + '.' +
    String(d.getMilliseconds()).padStart(3, '0');
  return localStr + sign + hh + ':' + mm;
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
 * Contains a unique transaction ID + timestamp. Placed INSIDE the Body.
 *
 * IMPORTANT: SKAT's sample requests use the DEFAULT xmlns (no prefix) for
 * HovedOplysninger and its children, NOT a namespace prefix. The default
 * namespace is declared on the parent *_I element. Using a prefix like
 * `ns:` causes SKAT's schema validation to fail with
 * "Failed to invoke method" (HTTP 500).
 *
 * Structure (from SKAT's signed sample — assets/full-sample-request.xml):
 *   <HovedOplysninger>
 *     <TransaktionIdentifikator>UUID</TransaktionIdentifikator>
 *     <TransaktionTid>2023-06-07T10:05:27.694+02:00</TransaktionTid>
 *   </HovedOplysninger>
 */
function buildHovedOplysninger(): string {
  return (
    `<HovedOplysninger>` +
    `<TransaktionIdentifikator>${generateTransactionId()}</TransaktionIdentifikator>` +
    `<TransaktionTid>${nowTransactionTime()}</TransaktionTid>` +
    `</HovedOplysninger>`
  );
}

/**
 * Build a complete UNSIGNED SOAP envelope with:
 *   - An empty <wsse:Security> placeholder in the header (populated by the signer)
 *   - <soap:Body wsu:Id="id-<uuid>"> containing the service request
 *
 * The service request body MUST include HovedOplysninger as its first child.
 *
 * Namespace declarations on the *_I element match SKAT's official signed
 * sample (assets/full-sample-request.xml) exactly:
 *   - xmlns (default) = context namespace (so HovedOplysninger needs no prefix)
 *   - xmlns:ns2 = SE namespace (VirksomhedSENummerIdentifikator)
 *   - xmlns:ns3 = data namespace (AngivelseTypeNavn, MomsAngivelse* fields)
 *   - xmlns:ns4 = service namespace (the *_I element itself + Angivelse wrapper)
 *
 * @param serviceName - The service name (e.g. "ModtagMomsangivelseForeloebig")
 * @param requestBodyXml - The inner request XML (the children of <ServiceName_I>)
 */
function buildSoapEnvelope(serviceName: string, requestBodyXml: string): string {
  const bodyId = `id-${randomUUID()}`;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap:Envelope xmlns:soap="${NS_SOAP}" ` +
    `xmlns:wsse="${NS_WSSE}" xmlns:wsu="${NS_WSU}">` +
    `<soap:Header>` +
    // Empty Security placeholder — the signer inserts BinarySecurityToken + Timestamp + Signature
    `<wsse:Security soap:mustUnderstand="1"></wsse:Security>` +
    `</soap:Header>` +
    `<soap:Body wsu:Id="${bodyId}">` +
    // Namespace declarations match SKAT's sample: default xmlns = context, ns4 = service
    `<ns4:${serviceName}_I ` +
    `xmlns="${NS_CONTEXT}" ` +
    `xmlns:ns2="${NS_SE}" ` +
    `xmlns:ns3="${NS_DATA}" ` +
    `xmlns:ns4="${NS_SERVICE}">` +
    requestBodyXml +
    `</ns4:${serviceName}_I>` +
    `</soap:Body>` +
    `</soap:Envelope>`
  );
}

// ─── Service 1: VirksomhedKalenderHent ────────────────────────────────

/**
 * Build the SOAP request body for VirksomhedKalenderHent.
 * Fetches VAT periods + deadlines for a given SE-number and date range.
 *
 * Structure (from src/test/resources/VirksomhedKalenderHent_I_Document.xml):
 *   <HovedOplysninger>...</HovedOplysninger>
 *   <VirksomhedSENummerIdentifikator>12345678</VirksomhedSENummerIdentifikator>
 *   <AngivelseTypeNavn>Moms</AngivelseTypeNavn>
 *   <AngivelseBetalingFristHentFra>
 *     <SoegeDatoFraDate>2018-01-01</SoegeDatoFraDate>
 *     <SoegeDatoTilDate>2018-12-31</SoegeDatoTilDate>
 *   </AngivelseBetalingFristHentFra>
 */
export function buildVirksomhedKalenderHentRequest(
  seNumber: string,
  dateFrom: string,
  dateTo: string,
): string {
  const body =
    buildHovedOplysninger() +
    `<ns2:VirksomhedSENummerIdentifikator>${escapeXml(seNumber)}</ns2:VirksomhedSENummerIdentifikator>` +
    `<ns3:AngivelseTypeNavn>Moms</ns3:AngivelseTypeNavn>` +
    `<ns4:AngivelseBetalingFristHentFra>` +
    `<ns3:SoegeDatoFraDate>${escapeXml(dateFrom)}</ns3:SoegeDatoFraDate>` +
    `<ns3:SoegeDatoTilDate>${escapeXml(dateTo)}</ns3:SoegeDatoTilDate>` +
    `</ns4:AngivelseBetalingFristHentFra>`;
  return buildSoapEnvelope('VirksomhedKalenderHent', body);
}

/**
 * Parse the VirksomhedKalenderHent SOAP response.
 *
 * SKAT's response format (from real test environment):
 *   <urn:AngivelseFrekvensListe>
 *     <urn:AngivelseFrekvens>
 *       <urn1:AngivelseFrekvensForholdGyldigFraDate>2014-01-02</...>
 *       <urn1:AngivelseFrekvensTypeCode>8</...>   ← 8=quarterly, 7=monthly, 10=yearly
 *       <urn:AngivelseBetalingFristDatoListe>
 *         <urn:AngivelseBetalingFristDato>
 *           <urn1:AngivelseFristKalenderFristDato>2026-03-02</...>  ← Q1 deadline
 *           <urn1:AngivelseFristKalenderBetalingDato>2026-03-02</...>
 *         </urn:AngivelseBetalingFristDato>
 *         <urn:AngivelseBetalingFristDato>
 *           <urn1:AngivelseFristKalenderFristDato>2026-06-01</...>  ← Q2 deadline
 *           ...
 *
 * SKAT does NOT return period start/end dates — only deadlines. We derive
 * the period from the deadline: a Q1 deadline (March) → period Jan-Mar.
 */
export function parseVirksomhedKalenderHentResponse(responseXml: string): SkatVatCalendarResult {
  const seMatch = responseXml.match(/VirksomhedSENummerIdentifikator[^>]*>(\d+)</);
  const seNumber = seMatch ? seMatch[1] : '';

  // Extract the frequency code (8=quarterly, 7=monthly, 10=yearly)
  const freqMatch = responseXml.match(/AngivelseFrekvensTypeCode[^>]*>(\d+)</);
  const frequencyCode = freqMatch ? freqMatch[1].padStart(2, '0') : '08'; // default quarterly

  // Extract all deadline dates (AngivelseFristKalenderFristDato)
  const deadlineMatches = responseXml.matchAll(
    /AngivelseFristKalenderFristDato[^>]*>(\d{4}-\d{2}-\d{2})</g,
  );

  const periods: SkatVatPeriod[] = [];
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  for (const match of deadlineMatches) {
    const deadlineStr = match[1];
    const deadlineDate = new Date(deadlineStr);

    // Derive the period from the deadline month:
    // Deadline in March (month 3) → Q1 (Jan-Mar)
    // Deadline in June (month 6) → Q2 (Apr-Jun)
    // Deadline in September (month 9) → Q3 (Jul-Sep)
    // Deadline in December (month 12) → Q4 (Oct-Dec)
    const deadlineMonth = deadlineDate.getMonth() + 1; // 1-12
    const year = deadlineDate.getFullYear();

    let periodStart: string;
    let periodEnd: string;

    if (frequencyCode === '10') {
      // Yearly
      periodStart = `${year}-01-01`;
      periodEnd = `${year}-12-31`;
    } else if (frequencyCode === '07') {
      // Monthly — period is the month before the deadline
      periodStart = `${year}-${String(deadlineMonth).padStart(2, '0')}-01`;
      const lastDay = new Date(year, deadlineMonth, 0).getDate();
      periodEnd = `${year}-${String(deadlineMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    } else {
      // Quarterly (default, code '08' or '8')
      // Deadline in month 3 → Q1 (months 1-3)
      // Deadline in month 6 → Q2 (months 4-6)
      // Deadline in month 9 → Q3 (months 7-9)
      // Deadline in month 12 → Q4 (months 10-12)
      // Handle case where deadline is early next month (e.g. April 1 → Q1)
      let qMonth = deadlineMonth;
      if (qMonth === 4 && deadlineDate.getDate() <= 2) qMonth = 3; // April 1-2 → Q1
      if (qMonth === 7 && deadlineDate.getDate() <= 2) qMonth = 6; // July 1-2 → Q2
      if (qMonth === 10 && deadlineDate.getDate() <= 2) qMonth = 9; // Oct 1-2 → Q3
      if (qMonth === 1 && deadlineDate.getDate() <= 2) qMonth = 12; // Jan 1-2 → Q4 previous year

      if (qMonth <= 3) {
        periodStart = `${year}-01-01`;
        periodEnd = `${year}-03-31`;
      } else if (qMonth <= 6) {
        periodStart = `${year}-04-01`;
        periodEnd = `${year}-06-30`;
      } else if (qMonth <= 9) {
        periodStart = `${year}-07-01`;
        periodEnd = `${year}-09-30`;
      } else {
        periodStart = `${year}-10-01`;
        periodEnd = `${year}-12-31`;
      }
    }

    // A period is "open" if its deadline hasn't passed yet
    const isOpen = deadlineStr >= todayStr;

    periods.push({
      periodStart,
      periodEnd,
      deadline: deadlineStr,
      frequencyCode,
      isOpen,
    });
  }

  // Sort periods chronologically by periodStart
  periods.sort((a, b) => a.periodStart.localeCompare(b.periodStart));

  return {
    seNumber,
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
 * Build the SOAP request body for ModtagMomsangivelseForeloebig.
 * Submits a DRAFT VAT return with the 17 VAT field values.
 *
 * Structure (from src/test/resources/ModtagMomsangivelseForeloebig_I_Document.xml):
 *   <HovedOplysninger>...</HovedOplysninger>
 *   <Angivelse>
 *     <AngiverVirksomhedSENummer>
 *       <VirksomhedSENummerIdentifikator>12345678</...>
 *     </AngiverVirksomhedSENummer>
 *     <Angivelsesoplysninger>
 *       <AngivelsePeriodeFraDato>2018-01-01</...>
 *       <AngivelsePeriodeTilDato>2018-03-31</...>
 *     </Angivelsesoplysninger>
 *     <Angivelsesafgifter>
 *       <MomsAngivelseAfgiftTilsvarBeloeb>1500</...>
 *       ... 16 more fields ...
 *     </Angivelsesafgifter>
 *   </Angivelse>
 */
export function buildModtagMomsangivelseForeloebigRequest(
  seNumber: string,
  periodFrom: string,
  periodTo: string,
  vatFields: Record<string, number>,
): string {
  // Build the Angivelsesafgifter block — emit ALL 17 fields (even zeros).
  // SKAT's official sample (ModtagMomsangivelseForeloebig_I_Document.xml)
  // includes all 17 fields, even when empty. While the XSD marks them
  // minOccurs="0" (optional), emitting all 17 defensively rules out
  // F0475 being caused by a missing required field.
  // ns3 = data namespace (MomsAngivelse* fields, AngivelsePeriodeFraDato)
  // ns4 = service namespace (Angivelse wrapper, AngiverVirksomhedSENummer, Angivelsesoplysninger)
  // ns2 = SE namespace (VirksomhedSENummerIdentifikator)
  //
  // IMPORTANT: SKAT's XSD defines all MomsAngivelse* fields as xs:integer (NOT xs:decimal).
  // This means values must be formatted as integers without decimal points:
  //   CORRECT: <MomsAngivelseSalgsMomsBeloeb>2000</MomsAngivelseSalgsMomsBeloeb>
  //   WRONG:   <MomsAngivelseSalgsMomsBeloeb>2000.00</MomsAngivelseSalgsMomsBeloeb>
  // Using .toFixed(2) caused "BEA-382505: OSB Validate action failed validation"
  const afgifterXml = VAT_FIELD_NAMES
    .map((fieldName) => {
      const val = vatFields[fieldName] ?? 0;
      return `<ns3:${fieldName}>${Math.round(val)}</ns3:${fieldName}>`;
    })
    .join('');

  const body =
    buildHovedOplysninger() +
    `<ns4:Angivelse>` +
    `<ns4:AngiverVirksomhedSENummer>` +
    `<ns2:VirksomhedSENummerIdentifikator>${escapeXml(seNumber)}</ns2:VirksomhedSENummerIdentifikator>` +
    `</ns4:AngiverVirksomhedSENummer>` +
    `<ns4:Angivelsesoplysninger>` +
    `<ns3:AngivelsePeriodeFraDato>${escapeXml(periodFrom)}</ns3:AngivelsePeriodeFraDato>` +
    `<ns3:AngivelsePeriodeTilDato>${escapeXml(periodTo)}</ns3:AngivelsePeriodeTilDato>` +
    `</ns4:Angivelsesoplysninger>` +
    `<ns4:Angivelsesafgifter>${afgifterXml}</ns4:Angivelsesafgifter>` +
    `</ns4:Angivelse>`;

  return buildSoapEnvelope('ModtagMomsangivelseForeloebig', body);
}

/**
 * Parse the ModtagMomsangivelseForeloebig SOAP response.
 *
 * SKAT returns HTTP 200 for both success AND business errors (e.g. F0475).
 * The difference is in the SOAP body's SvarStruktur:
 *   - SUCCESS: contains <AdvisStruktur> with <AdvisIdentifikator> (5001/5002)
 *     + <Dybtlink> with the MitID approval URL
 *   - BUSINESS ERROR: contains <FejlStruktur> with <FejlIdentifikator> + <FejlTekst>
 *
 * Advisory codes (per SKAT's Java reference ServiceTestAction.java):
 *   5001 = ordinary draft (normal angivelse)
 *   5002 = subsequent declaration (efterangivelse)
 *
 * This parser checks for both and populates skatErrorCode/skatErrorMessage
 * when a business error is present, so the caller can set status=ERROR
 * instead of status=SUBMITTED.
 */
export function parseModtagMomsangivelseForeloebigResponse(responseXml: string): SkatVatSubmissionResult {
  // Check for SKAT business error (FejlStruktur)
  const errorCodeMatch = responseXml.match(/FejlIdentifikator[^>]*>(\d+)</);
  // FejlTekst may contain commas, spaces, and Danish characters — use [\s\S] to match any char
  const errorTextMatch = responseXml.match(/FejlTekst[^>]*>([\s\S]*?)<\/(?:\w+:)?FejlTekst/);
  const skatErrorCode = errorCodeMatch ? errorCodeMatch[1] : null;
  const skatErrorMessage = errorTextMatch ? errorTextMatch[1].trim() : null;

  // The TransaktionIdentifier may be spelled with 'd' or 'k' depending on the SKAT version
  const txIdMatch = responseXml.match(
    /<(?:ns\d+:)?TransaktionIdentif[ik]er[^>]*>([0-9a-fA-F-]{36})<\/(?:ns\d+:)?TransaktionIdentif[ik]er>/,
  );
  const deepLinkMatch = responseXml.match(/UrlIndicator[^>]*>(https?:\/\/[^<]+)<\/UrlIndicator/);
  // Advisory code: SKAT uses AdvisIdentifikator (not AdvisoryKode) inside AdvisStruktur
  const advisoryMatch = responseXml.match(/AdvisIdentifikator[^>]*>(\d+)<\/(?:\w+:)?AdvisIdentifikator/);

  return {
    transactionIdentifier: txIdMatch ? txIdMatch[1] : '',
    deepLink: deepLinkMatch ? deepLinkMatch[1] : null,
    advisoryCode: advisoryMatch ? advisoryMatch[1] : null,
    skatErrorCode,
    skatErrorMessage,
    responseXml,
  };
}

// ─── Service 3: MomsangivelseKvitteringHent ───────────────────────────

/**
 * Build the SOAP request body for MomsangivelseKvitteringHent.
 * Fetches the receipt (PDF) after the legal entity has approved the draft
 * in TastSelv Erhverv. Returns error 4810 if not yet approved.
 *
 * Structure (from src/test/resources/MomsangivelseKvitteringHent_I_Document.xml):
 *   <HovedOplysninger>...</HovedOplysninger>
 *   <TransaktionIdentifier>42C8FE92-...</TransaktionIdentifier>
 *   <Angiver>
 *     <VirksomhedSENummerIdentifikator>12345678</...>
 *   </Angiver>
 *
 * @param transactionIdentifier - The draft's transaction ID (from the submission response)
 * @param seNumber - Optional SE-number for the Angiver block (the reporting company)
 */
export function buildMomsangivelseKvitteringHentRequest(
  transactionIdentifier: string,
  seNumber?: string,
): string {
  const body =
    buildHovedOplysninger() +
    `<ns3:TransaktionIdentifier>${escapeXml(transactionIdentifier)}</ns3:TransaktionIdentifier>` +
    (seNumber
      ? `<ns4:Angiver>` +
        `<ns2:VirksomhedSENummerIdentifikator>${escapeXml(seNumber)}</ns2:VirksomhedSENummerIdentifikator>` +
        `</ns4:Angiver>`
      : '');

  return buildSoapEnvelope('MomsangivelseKvitteringHent', body);
}

/**
 * Parse the MomsangivelseKvitteringHent SOAP response.
 *
 * Response structure (per MomsangivelseKvitteringHent_O.xsd + Java reference):
 *   <HovedOplysningerSvar>
 *     <SvarStruktur>
 *       <AdvisStruktur> OR <FejlStruktur>   ← SvarStruktur can contain either or both
 *         <AdvisIdentifikator>4810</...>     ← Advis (info) codes
 *         <AdvisTekst>...</...>
 *       </AdvisStruktur>
 *       <FejlStruktur>
 *         <FejlIdentifikator>...</...>      ← Error codes
 *       </FejlStruktur>
 *     </SvarStruktur>
 *   </HovedOplysningerSvar>
 *   <PDFkvittering>
 *     <DokumentFilIndholdData>base64-pdf</...>   ← The actual PDF receipt
 *   </PDFkvittering>
 *   <Betalingsoplysninger>
 *     <OCRLinie>
 *       <OCRKontoNummerIdentifikator>...</...>   ← Payment account number
 *     </OCRLinie>
 *     <BetalingIkkeBetaltBeloeb>1234.56</...>    ← Amount to pay
 *     <AngivelseFristKalenderBetalingDato>2026-03-02</...>  ← Payment deadline
 *   </Betalingsoplysninger>
 *
 * Advisory codes (per ServiceTestAction.java:122-131):
 *   4810 = VAT return has yet to be approved in TastSelv (not yet MitID-approved)
 *   4812 = other advisory on receipt
 *
 * Returns approved=false with errorCode when 4810/4812 advisory is present.
 */
export function parseMomsangivelseKvitteringHentResponse(responseXml: string): SkatReceiptResult {
  // Check for advis codes (4810 = not yet approved, 4812 = other advis)
  // These are in <AdvisStruktur><AdvisIdentifikator> (NOT FejlKode)
  const advisMatch = responseXml.match(/AdvisIdentifikator[^>]*>(\d+)<\/(?:\w+:)?AdvisIdentifikator/);
  const advisCode = advisMatch ? advisMatch[1] : null;

  // Also check for error codes (FejlIdentifikator) — these indicate hard failures
  const errorCodeMatch = responseXml.match(/FejlIdentifikator[^>]*>(\d+)</);
  const errorCode = errorCodeMatch ? errorCodeMatch[1] : null;

  // 4810 = not yet MitID-approved, 4811 = rejected, 4812 = other advis, 4813 = other error
  const blockingCode = advisCode || errorCode;
  if (blockingCode === '4810' || blockingCode === '4811' || blockingCode === '4812' || blockingCode === '4813') {
    return {
      transactionIdentifier: '',
      receiptPdfBase64: null,
      paymentInfo: null,
      approved: false,
      errorCode: blockingCode,
      responseXml,
    };
  }

  // Extract PDF receipt: <PDFkvittering><DokumentFilIndholdData>base64</...>
  const pdfMatch = responseXml.match(
    /DokumentFilIndholdData[^>]*>([A-Za-z0-9+/=\s]+)<\/(?:\w+:)?DokumentFilIndholdData/,
  );
  const receiptPdfBase64 = pdfMatch ? pdfMatch[1].replace(/\s+/g, '') : null;

  // Extract payment info from <Betalingsoplysninger>:
  //   <BetalingIkkeBetaltBeloeb> = amount to pay
  //   <AngivelseFristKalenderBetalingDato> = payment deadline
  //   <OCRKontoNummerIdentifikator> = account number for payment
  const amountMatch = responseXml.match(/BetalingIkkeBetaltBeloeb[^>]*>([\d.,]+)</);
  const dueDateMatch = responseXml.match(/AngivelseFristKalenderBetalingDato[^>]*>(\d{4}-\d{2}-\d{2})</);
  const accountMatch = responseXml.match(/OCRKontoNummerIdentifikator[^>]*>(\d+)</);

  // Extract advisory text if present (e.g. "Dette er en efterangivelse")
  const advisTextMatch = responseXml.match(/AdvisTekst[^>]*>([\s\S]*?)<\/(?:\w+:)?AdvisTekst/);
  const advisText = advisTextMatch ? advisTextMatch[1].trim() : null;

  const hasPdf = !!receiptPdfBase64;
  const hasPaymentInfo = !!(amountMatch || dueDateMatch || accountMatch);

  // Approved = we got either a PDF or payment info (no blocking advis/error code)
  const approved = hasPdf || hasPaymentInfo;

  return {
    transactionIdentifier: '',
    receiptPdfBase64,
    paymentInfo: hasPaymentInfo ? {
      amount: amountMatch ? parseFloat(amountMatch[1].replace(/\./g, '').replace(',', '.')) : null,
      dueDate: dueDateMatch ? dueDateMatch[1] : null,
      accountNumber: accountMatch ? accountMatch[1] : null,
    } : null,
    approved,
    errorCode: null,
    responseXml,
  };
}

// ─── HTTP Transport (mTLS + WS-Security) ─────────────────────────────

/** Loaded credentials are cached by the keystore module. */
let cachedCredentials: SkatCredentials | null = null;

function getCredentials(): SkatCredentials {
  if (!cachedCredentials) {
    cachedCredentials = loadSkatCredentials();
  }
  return cachedCredentials;
}

/**
 * Send a signed SOAP request to a SKAT endpoint via mutual TLS.
 *
 * Pipeline:
 *   1. Load VOCES3 credentials (cert + private key) from the keystore
 *   2. Sign the SOAP envelope with WS-Security (BinarySecurityToken + Timestamp + Signature)
 *   3. POST over HTTPS with mTLS (client cert + key, SKAT server CA verified)
 *
 * @param endpointKey - Which endpoint to use ("modtagMomsangivelseForeloebig", etc.)
 * @param soapXml - The UNSIGNED SOAP envelope (with empty <wsse:Security> + wsu:Id'd Body)
 * @returns The SOAP response XML body
 * @throws SkatApiError on transport, TLS, or HTTP errors
 */
async function sendSoapRequest(endpointKey: string, soapXml: string): Promise<string> {
  const endpointUrl = ENDPOINTS[endpointKey as keyof typeof ENDPOINTS];
  if (!endpointUrl) {
    throw new SkatApiError(
      'SKAT_ENDPOINT_NOT_CONFIGURED',
      `The endpoint for ${endpointKey} is not configured. ` +
        `Set the SKAT_ENDPOINT_* environment variable. See docs/SKAT-setup.md.`,
    );
  }

  let credentials: SkatCredentials;
  try {
    credentials = getCredentials();
  } catch (err) {
    throw new SkatApiError(
      'SKAT_CREDENTIAL_LOAD_FAILED',
      'Could not load SKAT mTLS credentials: ' +
        (err instanceof Error ? err.message : String(err)),
    );
  }

  // Sign the envelope with WS-Security
  let signedXml: string;
  try {
    signedXml = signSoapEnvelope(soapXml, credentials);
  } catch (err) {
    throw new SkatApiError(
      'SKAT_SIGNING_FAILED',
      'Failed to sign the SOAP envelope with WS-Security: ' +
        (err instanceof Error ? err.message : String(err)),
    );
  }

  logger.info(
    `[SKAT-Transport] POST ${endpointUrl} (env=${SKAT_ENV}, ` +
      `signed=${signedXml.length} bytes, action=${SOAP_ACTIONS[endpointKey]})`,
  );

  // Build the HTTPS request options for mTLS.
  // `cert` + `key` work for PEM; `pfx` works for PKCS12. We support both.
  const tlsOptions: https.RequestOptions = credentials.pfxBuffer
    ? { pfx: credentials.pfxBuffer, passphrase: credentials.passphrase || undefined }
    : { cert: credentials.certPem, key: credentials.keyPem, passphrase: credentials.passphrase || undefined };

  if (credentials.caPem) {
    tlsOptions.ca = credentials.caPem;
    tlsOptions.rejectUnauthorized = true;
  } else {
    // No custom truststore: use system CAs. In the test environment SKAT uses a
    // private CA, so SKAT_TRUSTSTORE_PATH should be set. We keep strict verification.
    tlsOptions.rejectUnauthorized = true;
  }

  const options: https.RequestOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': `"${SOAP_ACTIONS[endpointKey] || ''}"`,
      'Content-Length': Buffer.byteLength(signedXml, 'utf8'),
    },
    // 3-minute timeout (matches the Java client's ConnectionTimeout="180000")
    timeout: 180000,
    ...tlsOptions,
  };

  // Perform the HTTPS POST and collect the response
  const { statusCode, body } = await new Promise<{ statusCode: number; body: string }>(
    (resolve, reject) => {
      const req = https.request(endpointUrl, options, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode || 0, body: data });
        });
      });

      req.on('error', (err: NodeJS.ErrnoException) => {
        // Map common mTLS / network errors to actionable codes
        let code = 'SKAT_TRANSPORT_ERROR';
        if (err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || err.code === 'CERT_HAS_EXPIRED') {
          code = 'SKAT_TLS_CERT_INVALID';
        } else if (err.code === 'ECONNREFUSED') {
          code = 'SKAT_CONNECTION_REFUSED';
        } else if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
          code = 'SKAT_CONNECTION_TIMEOUT';
        }
        reject(new SkatApiError(code, `HTTPS request to ${endpointUrl} failed: ${err.message}`));
      });

      req.on('timeout', () => {
        req.destroy(new Error('Request timed out after 180s'));
      });

      req.write(signedXml);
      req.end();
    },
  );

  if (statusCode === 0 || statusCode >= 500) {
    // Log the full response body for server errors (helps diagnose SKAT faults)
    logger.error(`[SKAT-Transport] Server error HTTP ${statusCode}: ${body.substring(0, 1000)}`);
    throw new SkatApiError(
      'SKAT_SERVER_ERROR',
      `SKAT returned HTTP ${statusCode}. Response: ${body.substring(0, 1000)}`,
    );
  }

  if (statusCode >= 400) {
    // 4xx — likely a SOAP fault or auth failure
    logger.warn(`[SKAT-Transport] Client error HTTP ${statusCode}: ${body.substring(0, 1000)}`);
    throw new SkatApiError(
      'SKAT_CLIENT_ERROR',
      `SKAT returned HTTP ${statusCode}. Response: ${body.substring(0, 1000)}`,
    );
  }

  logger.info(`[SKAT-Transport] Response: HTTP ${statusCode}, ${body.length} bytes`);
  return body;
}

// ─── Simulated Responses (for UI testing without real certificates) ───

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
    skatErrorCode: null,
    skatErrorMessage: null,
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
  const responseXml = await sendSoapRequest('virksomhedKalenderHent', soapXml);
  return parseVirksomhedKalenderHentResponse(responseXml);
}

/**
 * Service 2: Submit a DRAFT VAT return to SKAT.
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
  const responseXml = await sendSoapRequest('modtagMomsangivelseForeloebig', soapXml);
  return parseModtagMomsangivelseForeloebigResponse(responseXml);
}

/**
 * Service 3: Fetch the VAT receipt after the legal entity has approved
 * the draft in TastSelv Erhverv.
 *
 * Returns errorCode='4810' if the draft has not yet been approved.
 *
 * @param transactionIdentifier - The ID returned by the draft submission
 * @param seNumber - The reporting company's SE-number (recommended — included
 *                   in the <Angiver> block so SKAT can identify the reporter)
 */
export async function getMomsangivelseKvitteringHent(
  transactionIdentifier: string,
  seNumber?: string,
): Promise<SkatReceiptResult> {
  logger.info(`[SKAT] MomsangivelseKvitteringHent: txId=${transactionIdentifier}, SE=${seNumber || '(none)'}`);

  if (!hasSkatCredentials()) {
    logger.info('[SKAT] SIMULATED MomsangivelseKvitteringHent (no mTLS credentials)');
    return simulateMomsangivelseKvitteringHent(transactionIdentifier);
  }

  const soapXml = buildMomsangivelseKvitteringHentRequest(transactionIdentifier, seNumber);
  const responseXml = await sendSoapRequest('momsangivelseKvitteringHent', soapXml);
  return parseMomsangivelseKvitteringHentResponse(responseXml);
}

// ─── VAT Field Mapper ─────────────────────────────────────────────────

/**
 * Map AlphaFlow's VAT register data to the 17 SKAT MomsAngivelse fields.
 *
 * AlphaFlow's internal VAT codes:
 *   Output (salg): S25 (25%), S12 (12%), S0 (0%), SEU (EU sale, 0% — reverse charge to buyer)
 *   Input (køb):   K25 (25%), K12 (12%), K0 (0%), KEU (EU reverse charge), KUF (non-EU import)
 *
 * SKAT field mapping:
 *   Field 14 (SalgsMoms)    = totalOutputVAT (domestic output VAT)
 *   Field 9  (KoebsMoms)    = totalInputVAT  (deductible input VAT, incl. reverse-charged EU + import)
 *   Field 1  (AfgiftTilsvar)= netVATPayable  (field 14 − field 9)
 *   Field 4  (EUSalgVarer)  = net base of SEU sales (Box B, ex-VAT EU goods sales)
 *   Field 3  (EUKoeb)       = net base of KEU purchases (Box A, ex-VAT EU acquisitions)
 *   Field 11 (MomsEUKoeb)   = VAT on KEU purchases (reverse-charged, also in field 9)
 *
 * The reverse-charge VAT (KEU) appears in BOTH field 11 (output, self-charged)
 * and field 9 (input, deductible) — they cancel out in field 1, which is the
 * correct Danish momsangivelse treatment for EU reverse-charge acquisitions.
 *
 * Fields for CO2, electricity, gas, coal, oil, water taxes remain 0 (AlphaFlow
 * does not track these special excise taxes yet). EU service boxes (16, 17) and
 * field 12 (MomsEUYdelser) are 0 because AlphaFlow's VAT codes don't yet split
 * goods from services for EU trade — this can be extended later.
 *
 * @param vatRegister - The result from computeVATRegister()
 * @returns The VAT field values keyed by field name
 */
export function mapVatRegisterToSkatFields(vatRegister: {
  totalOutputVAT: number;
  totalInputVAT: number;
  netVATPayable: number;
  outputVAT?: Array<{ code: string; netAmount: number }>;
  inputVAT?: Array<{ code: string; netAmount: number }>;
}): Record<string, number> {
  const fields: Record<string, number> = {};

  // ── Core totals ──
  // Field 14: Output VAT (SalgsMoms) — total output VAT (domestic + reverse charge)
  fields['MomsAngivelseSalgsMomsBeloeb'] = Math.max(0, vatRegister.totalOutputVAT);

  // Field 9: Input VAT (KoebsMoms) — total deductible input VAT
  fields['MomsAngivelseKoebsMomsBeloeb'] = Math.max(0, vatRegister.totalInputVAT);

  // Field 1: Total tax due (positive = pay, negative = refund)
  fields['MomsAngivelseAfgiftTilsvarBeloeb'] = vatRegister.netVATPayable;

  // ── EU trade fields (from the per-code breakdown) ──
  const outputByCode = new Map(
    (vatRegister.outputVAT || []).map((v) => [v.code, v.netAmount]),
  );
  const inputByCode = new Map(
    (vatRegister.inputVAT || []).map((v) => [v.code, v.netAmount]),
  );

  // Helper: compute VAT amount from a net base using the code's rate
  const vatFor = (code: string, map: Map<string, number>): number => {
    const net = map.get(code) || 0;
    const rate = VAT_RATE_MAP[code as keyof typeof VAT_RATE_MAP];
    return rate ? net * (rate / 100) : 0;
  };

  // Field 4: Box B — EU goods sales without VAT (SEU = 0% EU sale, reverse charge to buyer)
  const seuNet = outputByCode.get('SEU') || 0;
  if (seuNet !== 0) {
    fields['MomsAngivelseEUSalgBeloebVarerBeloeb'] = Math.max(0, seuNet);
  }

  // Field 3: Box A — EU goods acquisitions, ex-VAT (KEU net base)
  const keuNet = inputByCode.get('KEU') || 0;
  if (keuNet !== 0) {
    fields['MomsAngivelseEUKoebBeloeb'] = Math.max(0, keuNet);
  }

  // Field 11: VAT on goods purchased abroad (KEU reverse charge = self-charged VAT)
  // This is the VAT portion of the EU reverse-charge acquisition. It's also in
  // field 9 as deductible input VAT — the two cancel in field 1.
  const keuVat = vatFor('KEU', inputByCode);
  if (keuVat !== 0) {
    fields['MomsAngivelseMomsEUKoebBeloeb'] = Math.max(0, keuVat);
  }

  return fields;
}
