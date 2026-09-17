/**
 * Unified OIOUBL / Peppol BIS Billing 3.0 XML Parser
 *
 * Parses UBL 2.1 Invoice XML into a structured ParsedEInvoice interface.
 * Supports InvoiceTypeCode: 380 (invoice), 381 (credit note), 384 (corrected), 389 (self-billed).
 * Auto-detects format based on CustomizationID / ProfileID values.
 *
 * Dependencies: fast-xml-parser v5 (named export: XMLParser)
 */

import { XMLParser } from 'fast-xml-parser';

// ─── TYPES ───────────────────────────────────────────────────────

export type EInvoiceFormat = 'OIOUBL' | 'PEPPOL_BIS';
export type EInvoiceTypeCode = '380' | '381' | '384' | '389';

export interface ParsedLineItem {
  id: string;
  description: string;
  quantity: number;
  unitCode: string;
  unitPrice: number;
  vatPercent: number;
  vatCategoryCode: string;
  lineAmount: number;
}

export interface ParsedVatSubtotal {
  categoryCode: string;
  percent: number;
  taxAmount: number;
  taxableAmount: number;
}

export interface ParsedEInvoice {
  // Supplier (sender)
  supplierName: string;
  supplierCvr?: string;
  supplierEmail?: string;
  supplierPhone?: string;
  supplierAddress?: string;
  supplierCity?: string;
  supplierCountry?: string;

  // Invoice identification
  invoiceNumber: string;
  issueDate: string; // ISO date string
  dueDate?: string;  // ISO date string

  // Currency
  currencyCode: string;

  // Classification
  format: EInvoiceFormat;
  documentType: EInvoiceTypeCode;
  customizationId?: string;
  profileId?: string;

  // Line items
  lineItems: ParsedLineItem[];

  // VAT subtotals
  vatSubtotals: ParsedVatSubtotal[];

  // Monetary totals
  taxExclusiveAmount: number;
  taxAmount: number;
  taxInclusiveAmount: number;
  payableAmount: number;

  // Payment info
  paymentMeansCode?: string;
  paymentAccountId?: string;
}

export interface ParsedEInvoiceResult {
  data: ParsedEInvoice | null;
  errors: string[];
  warnings: string[];
}

// ─── FORMAT DETECTION ────────────────────────────────────────────

const PEPPOL_CUSTOMIZATION_IDS = [
  'urn:cen.eu:en16931:2017',
  'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0',
  'urn:cen.eu:en16931:2017#conformant#urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
];

const PEPPOL_PROFILE_IDS = [
  'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
  'urn:fdc:peppol.eu:2017:poacc:billing:3.0',
];

const OIOUBL_CUSTOMIZATION_IDS = [
  // Canonical OIOUBL CustomizationID values — these are LITERAL STRINGS,
  // not URNs. The OIOUBL standard uses values like "OIOUBL-2.1" as the
  // CustomizationID. Sproom uses this to identify the document as OIOUBL
  // format. See https://oioubl21.oioubl.dk/classes/en/invoice.html
  //
  // As of Task 37, AlphaFlow generates 'OIOUBL-2.1' (per the official
  // Erhvervsstyrelsen reference example at docs/SBD-OIOUBL-Invoice-valid.xml).
  // The legacy 'OIOUBL-2.02' / 'OIOUBL-2.01' values are kept for
  // backward-compat with documents received from third-party senders
  // that still use the older 2.02 form.
  'oioubl-2.1',
  'oioubl-2.02',
  'oioubl-2.01',
  'oioubl-3.0',
  // Legacy URN-form values (some OIOUBL 1.0 implementations used URNs).
  // Kept for backward compat with older documents.
  'urn:oioubl:invoice:1.0',
  'urn:oioubl:creditnote:1.0',
  'urn:oioubl:invoice:2.02',
  'urn:oioubl:creditnote:2.02',
  'urn:dk:oioubl:sbs:1.0',
  'urn:dk:oioubl:invoice:1.0',
  'urn:dk:oioubl:creditnote:1.0',
];

const VALID_TYPE_CODES: EInvoiceTypeCode[] = ['380', '381', '384', '389'];

// ─── XML PARSER CONFIG ──────────────────────────────────────────

const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: () => true, // always return arrays so we don't need to check
  textNodeName: '#text',
};

const xmlParser = new XMLParser(parserOptions);

// ─── HELPER FUNCTIONS ───────────────────────────────────────────

/**
 * Safely get first element from a value that may be an array, single object, or undefined.
 */
function first<T>(value: T | T[] | undefined): T | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Safely get text from a node that may be nested, an array, or an object with #text.
 */
function getText(node: unknown): string | undefined {
  if (node == null) return undefined;
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (typeof node === 'object' && '#text' in (node as Record<string, unknown>)) {
    return String((node as Record<string, unknown>)['#text']);
  }
  return undefined;
}

/**
 * Parse a numeric string to number, returning 0 if unparseable.
 */
function toNum(value: string | number | undefined | null): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return isNaN(n) ? 0 : n;
}

/**
 * Try to find a postal address node and extract city from it.
 */
function extractAddressInfo(
  addressNode: unknown
): { address?: string; city?: string; country?: string } {
  if (!addressNode || typeof addressNode !== 'object') return {};
  const addr = addressNode as Record<string, unknown>;

  // StreetName + AdditionalStreetName
  const streetName = getText(first(addr['StreetName']));
  const additionalStreet = getText(first(addr['AdditionalStreetName']));
  const cityName = getText(first(addr['CityName']));
  const country = getText(
    first(first(addr['Country'])?.['IdentificationCode'])
  );

  let address: string | undefined;
  if (streetName) {
    address = additionalStreet
      ? `${streetName}, ${additionalStreet}`
      : streetName;
  }

  return { address, city: cityName ?? undefined, country: country ?? undefined };
}

// ─── MAIN PARSER FUNCTION ────────────────────────────────────────

export function parseEInvoiceXml(xml: string): ParsedEInvoiceResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Parse XML
  let parsed: Record<string, unknown>;
  try {
    parsed = xmlParser.parse(xml) as Record<string, unknown>;
  } catch (err) {
    return {
      data: null,
      errors: [`XML parse error: ${(err as Error).message}`],
      warnings,
    };
  }

  // 2. Find the root document element.
  // UBL 2.1 has TWO separate document types that AlphaFlow can receive:
  //   - <Invoice>         (commercial invoices — InvoiceTypeCode 380/384/389)
  //   - <CreditNote>      (credit notes — OIOUBL credit notes have NO
  //                        InvoiceTypeCode element at all; the document IS
  //                        the type. Peppol BIS 3 still uses <Invoice> with
  //                        InvoiceTypeCode=381 for credit notes.)
  // The XML parser may also wrap the root in a namespaced key like
  // {urn:oasis:names:specification:ubl:schema:xsd:Invoice-2}Invoice.
  let invoiceRoot = first(parsed['Invoice']) as Record<string, unknown> | undefined;
  let rootElementName = 'Invoice';
  if (!invoiceRoot) {
    // Try the CreditNote root (Task 43 — OIOUBL CreditNote is a separate
    // document type, NOT an Invoice with InvoiceTypeCode=381).
    invoiceRoot = first(parsed['CreditNote']) as Record<string, unknown> | undefined;
    if (invoiceRoot) {
      rootElementName = 'CreditNote';
    }
  }
  if (!invoiceRoot) {
    // Try to find a UBL Invoice or CreditNote root by iterating keys —
    // handles namespaced wrappers like
    // {urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2}CreditNote.
    for (const key of Object.keys(parsed)) {
      const lower = key.toLowerCase();
      if (lower.includes('creditnote')) {
        invoiceRoot = first(parsed[key]) as Record<string, unknown>;
        rootElementName = 'CreditNote';
        break;
      }
      if (lower.includes('invoice')) {
        invoiceRoot = first(parsed[key]) as Record<string, unknown>;
        rootElementName = 'Invoice';
        break;
      }
    }
  }

  if (!invoiceRoot) {
    return {
      data: null,
      errors: ['No Invoice or CreditNote element found in XML. Expected a UBL 2.1 Invoice or CreditNote document.'],
      warnings,
    };
  }

  // Ensure invoiceRoot is an object (unwrap array if needed)
  if (Array.isArray(invoiceRoot)) {
    invoiceRoot = invoiceRoot[0] as Record<string, unknown>;
  }

  // ── EXTRACT FIELDS ──────────────────────────────────────────

  const cbc = (invoiceRoot['cbc:UBLVersionID'] != null || invoiceRoot['cbc:ID'] != null)
    ? invoiceRoot
    : {};

  // CustomizationID & ProfileID
  const customizationIdRaw = getText(first(cbc['cbc:CustomizationID']));
  const profileIdRaw = getText(first(cbc['cbc:ProfileID']));

  // Detect format
  const customizationLower = (customizationIdRaw ?? '').toLowerCase();
  const profileLower = (profileIdRaw ?? '').toLowerCase();

  let format: EInvoiceFormat = 'OIOUBL';
  if (
    PEPPOL_CUSTOMIZATION_IDS.some((id) => customizationLower.includes(id.toLowerCase())) ||
    PEPPOL_PROFILE_IDS.some((id) => profileLower.includes(id.toLowerCase()))
  ) {
    format = 'PEPPOL_BIS';
  } else if (
    OIOUBL_CUSTOMIZATION_IDS.some((id) => customizationLower.includes(id.toLowerCase()))
  ) {
    format = 'OIOUBL';
  } else {
    warnings.push(
      `Unknown CustomizationID "${customizationIdRaw}" — defaulting to OIOUBL format detection`
    );
  }

  // Document type detection (Task 43):
  //   - If the root element is <CreditNote>, the document IS a credit note
  //     → documentType = '381' (regardless of whether InvoiceTypeCode is
  //     present — OIOUBL CreditNotes have no InvoiceTypeCode, but a
  //     third-party CreditNote might include one).
  //   - Otherwise, fall back to the InvoiceTypeCode value (380/381/384/389).
  //     For a Peppol BIS 3 credit note, the root is still <Invoice> and
  //     InvoiceTypeCode=381.
  //   - If no InvoiceTypeCode is present and the root is <Invoice>, default
  //     to '380' (commercial invoice).
  const typeCodeRaw = getText(first(cbc['cbc:InvoiceTypeCode']));
  let documentType: EInvoiceTypeCode;
  if (rootElementName === 'CreditNote') {
    documentType = '381';
    if (typeCodeRaw && !VALID_TYPE_CODES.includes(typeCodeRaw as EInvoiceTypeCode)) {
      warnings.push(
        `CreditNote root with unexpected InvoiceTypeCode "${typeCodeRaw}" — using 381 (credit note) anyway`,
      );
    } else if (typeCodeRaw && typeCodeRaw !== '381') {
      warnings.push(
        `CreditNote root with InvoiceTypeCode "${typeCodeRaw}" — using 381 (credit note) per the root element type`,
      );
    }
  } else {
    documentType = VALID_TYPE_CODES.includes(typeCodeRaw as EInvoiceTypeCode)
      ? (typeCodeRaw as EInvoiceTypeCode)
      : '380';
    if (typeCodeRaw && !VALID_TYPE_CODES.includes(typeCodeRaw as EInvoiceTypeCode)) {
      warnings.push(`Unknown InvoiceTypeCode "${typeCodeRaw}" — defaulting to 380 (invoice)`);
    }
  }

  // Invoice ID
  const invoiceNumber = getText(first(cbc['cbc:ID'])) ?? '';
  if (!invoiceNumber) {
    errors.push('Missing required field: cbc:ID (invoice number)');
  }

  // Dates
  const issueDateRaw = getText(first(cbc['cbc:IssueDate']));
  const dueDateRaw = getText(first(cbc['cbc:DueDate']));
  if (!issueDateRaw) {
    errors.push('Missing required field: cbc:IssueDate');
  }

  // Currency
  const currencyCode = getText(first(cbc['cbc:DocumentCurrencyCode'])) ?? 'DKK';

  // ── SUPPLIER (AccountingSupplierParty) ──────────────────────

  const cac = invoiceRoot;

  // Navigate to AccountingSupplierParty > Party
  const supplierPartyNode = first(
    first(
      first(cac['cac:AccountingSupplierParty'])?.['cac:Party']
    )
  ) as Record<string, unknown> | undefined;

  let supplierName = '';
  let supplierCvr: string | undefined;
  let supplierEmail: string | undefined;
  let supplierPhone: string | undefined;
  let supplierAddress: string | undefined;
  let supplierCity: string | undefined;
  let supplierCountry: string | undefined;

  if (supplierPartyNode) {
    // Party name
    const partyNameNode = first(
      first(supplierPartyNode['cac:PartyName'])?.['cbc:Name']
    );
    supplierName = getText(partyNameNode) ?? '';

    if (!supplierName) {
      warnings.push('Supplier party name not found in XML');
    }

    // VAT / CVR from PartyTaxScheme
    const taxScheme = first(
      first(supplierPartyNode['cac:PartyTaxScheme'])
    ) as Record<string, unknown> | undefined;
    if (taxScheme) {
      supplierCvr = getText(first(taxScheme['cbc:CompanyID']));
    }

    // Also check RegistrationAddress for CVR (sometimes in endpoint ID)
    const regAddress = first(
      first(supplierPartyNode['cac:PostalAddress'])
    ) as Record<string, unknown> | undefined;
    if (regAddress) {
      const addrInfo = extractAddressInfo(regAddress);
      supplierAddress = addrInfo.address;
      supplierCity = addrInfo.city;
      supplierCountry = addrInfo.country;
    }

    // Email from Contact
    const contactNode = first(
      first(supplierPartyNode['cac:Contact'])
    ) as Record<string, unknown> | undefined;
    if (contactNode) {
      supplierEmail = getText(first(contactNode['cbc:ElectronicMail']));
      supplierPhone = getText(first(contactNode['cbc:Telephone']));
    }
  } else {
    errors.push('Missing AccountingSupplierParty — supplier information not found');
  }

  // ── LINE ITEMS ─────────────────────────────────────────────
  // UBL 2.1 has two line-item element names depending on the document type:
  //   <Invoice>      → <cac:InvoiceLine>  with <cbc:InvoicedQuantity>
  //   <CreditNote>   → <cac:CreditNoteLine> with <cbc:CreditedQuantity>
  // (Task 43 — OIOUBL credit notes are a separate document type with their
  // own line element. Peppol BIS 3 credit notes are still <Invoice> with
  // <cac:InvoiceLine>, distinguished by InvoiceTypeCode=381.)
  // The parser tries both element names and falls back gracefully.

  const lineItems: ParsedLineItem[] = [];
  // Per-loop quantity key — either 'cbc:InvoicedQuantity' or
  // 'cbc:CreditedQuantity'. Defaults to the value matching the root
  // element type; may be reassigned by the fallback branch below if
  // the document mixes element names unexpectedly.
  let qtyKeyForLoop: 'cbc:InvoicedQuantity' | 'cbc:CreditedQuantity' =
    rootElementName === 'CreditNote' ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity';
  const lineNodeKey = rootElementName === 'CreditNote'
    ? 'cac:CreditNoteLine'
    : 'cac:InvoiceLine';

  let invoiceLines = first(cac[lineNodeKey]) as
    | Record<string, unknown>[]
    | Record<string, unknown>
    | undefined;

  // Fall back to the other line element name (e.g. if a CreditNote document
  // contains InvoiceLine elements anyway, or vice versa — defensive).
  if (!invoiceLines) {
    const fallbackLineKey = rootElementName === 'CreditNote'
      ? 'cac:InvoiceLine'
      : 'cac:CreditNoteLine';
    const fallbackQtyKey = rootElementName === 'CreditNote'
      ? 'cbc:InvoicedQuantity'
      : 'cbc:CreditedQuantity';
    const fallbackLines = first(cac[fallbackLineKey]) as
      | Record<string, unknown>[]
      | Record<string, unknown>
      | undefined;
    if (fallbackLines) {
      invoiceLines = fallbackLines;
      qtyKeyForLoop = fallbackQtyKey;
    }
  }

  const lineArray = Array.isArray(invoiceLines)
    ? invoiceLines
    : invoiceLines
      ? [invoiceLines]
      : [];

  for (const line of lineArray) {
    const lineId = getText(first(line['cbc:ID'])) ?? '';
    const lineNote = getText(first(line['cbc:Note']));

    // Quantity — uses the format-appropriate element name
    // (cbc:InvoicedQuantity for <Invoice>, cbc:CreditedQuantity for
    // <CreditNote>). Falls back to the other name if absent (defensive —
    // some non-conforming implementations mix names).
    let quantityNode = line[qtyKeyForLoop];
    if (!quantityNode) {
      const fallbackQtyKey = qtyKeyForLoop === 'cbc:InvoicedQuantity'
        ? 'cbc:CreditedQuantity'
        : 'cbc:InvoicedQuantity';
      quantityNode = line[fallbackQtyKey];
    }
    const quantity = toNum(getText(first(quantityNode)));
    const lineAmount = toNum(getText(first(line['cbc:LineExtensionAmount'])));

    const priceNode = first(
      first(line['cac:Price'])?.['cbc:PriceAmount']
    );
    const unitPrice = toNum(getText(priceNode));
    const priceAmountNode = first(first(line['cac:Price']));
    const unitCodeRaw = getText(
      first((priceAmountNode as Record<string, unknown> | undefined)?.['cbc:PriceAmount']?.['@_unitCode'] ??
        (priceAmountNode as Record<string, unknown> | undefined)?.['@_unitCode'])
    );
    const quantityUnitCode = getText(
      first((quantityNode as Record<string, unknown> | undefined)?.['@_unitCode'] ?? quantityNode)
    );
    const unitCode = quantityUnitCode || unitCodeRaw || 'C62';

    // Item name / description
    const itemNode = first(line['cac:Item']) as Record<string, unknown> | undefined;
    const itemName = itemNode
      ? getText(first(itemNode['cbc:Name'])) ?? getText(first(itemNode['cbc:Description'])) ?? ''
      : '';
    const itemDesc = itemNode ? getText(first(itemNode['cbc:Description'])) : undefined;

    // VAT info at line level
    let vatPercent = 0;
    let vatCategoryCode = 'S';

    const taxCategoryNode = first(
      first(itemNode?.['cac:ClassifiedTaxCategory'])
    ) as Record<string, unknown> | undefined;

    if (taxCategoryNode) {
      vatPercent = toNum(getText(first(taxCategoryNode['cbc:Percent'])));
      vatCategoryCode = getText(first(taxCategoryNode['cbc:ID'])) ?? 'S';
    }

    // Fall back to line-level TaxTotal if no classified tax category
    const lineTaxTotalNode = first(line['cac:TaxTotal']) as Record<string, unknown> | undefined;
    if (!taxCategoryNode && lineTaxTotalNode) {
      const taxAmount = toNum(getText(first(lineTaxTotalNode['cbc:TaxAmount'])));
      // VAT rate = line VAT / line NET amount. cbc:LineExtensionAmount is
      // exclusive of VAT, so the divisor is `lineAmount` (NOT
      // `lineAmount - taxAmount` — that double-subtracted the VAT and
      // produced wrong rates like 33% instead of 25% for a 25% invoice).
      if (taxAmount > 0 && lineAmount > 0) {
        vatPercent = Math.round((taxAmount / lineAmount) * 100);
      }
    }

    const description = lineNote || itemDesc || itemName;

    lineItems.push({
      id: lineId,
      description: description || `Line ${lineId}`,
      quantity,
      unitCode,
      unitPrice,
      vatPercent,
      vatCategoryCode,
      lineAmount,
    });
  }

  if (lineItems.length === 0) {
    warnings.push('No invoice line items found in XML');
  }

  // ── VAT SUBTOTALS (TaxTotal > TaxSubtotal) ──────────────────

  const vatSubtotals: ParsedVatSubtotal[] = [];
  const taxTotalNode = first(cac['cac:TaxTotal']) as Record<string, unknown> | undefined;
  if (taxTotalNode) {
    const subtotals = first(taxTotalNode['cac:TaxSubtotal']) as
      | Record<string, unknown>[]
      | Record<string, unknown>
      | undefined;

    const subtotalArray = Array.isArray(subtotals)
      ? subtotals
      : subtotals
        ? [subtotals]
        : [];

    for (const sub of subtotalArray) {
      const percent = toNum(getText(first((sub as Record<string, unknown>)['cbc:Percent'])));
      const taxAmount = toNum(getText(first((sub as Record<string, unknown>)['cbc:TaxAmount'])));
      const taxableAmount = toNum(
        getText(first((sub as Record<string, unknown>)['cbc:TaxableAmount']))
      );
      const categoryCode = getText(
        first(
          first((sub as Record<string, unknown>)['cac:TaxCategory'])?.['cbc:ID']
        )
      ) ?? 'S';

      vatSubtotals.push({
        categoryCode,
        percent,
        taxAmount,
        taxableAmount,
      });
    }
  }

  // ── MONETARY TOTALS (LegalMonetaryTotal) ────────────────────

  const monetaryTotalNode = first(
    cac['cac:LegalMonetaryTotal']
  ) as Record<string, unknown> | undefined;

  const taxExclusiveAmount = monetaryTotalNode
    ? toNum(getText(first(monetaryTotalNode['cbc:TaxExclusiveAmount'])))
    : 0;
  const taxAmount = monetaryTotalNode
    ? toNum(getText(first(monetaryTotalNode['cbc:TaxAmount'])))
    : 0;
  const taxInclusiveAmount = monetaryTotalNode
    ? toNum(getText(first(monetaryTotalNode['cbc:TaxInclusiveAmount'])))
    : 0;
  const payableAmount = monetaryTotalNode
    ? toNum(getText(first(monetaryTotalNode['cbc:PayableAmount'])))
    : taxInclusiveAmount;

  // ── Totals robustness: recompute from line items when LegalMonetaryTotal ──
  // is missing or doesn't match the sum of the lines. Some supplier XMLs
  // carry a malformed LegalMonetaryTotal (e.g. TaxExclusiveAmount set to the
  // VAT amount, TaxAmount = 0) — the preview + reports should show the
  // correct computed totals, and the raw XML is still available for
  // inspection. Only overrides on a real mismatch (> 0.50 to tolerate
  // rounding) AND when the recomputed value is non-zero.
  const computedNet = lineItems.reduce((s, l) => s + (l.lineAmount || 0), 0);
  const computedVat = lineItems.reduce(
    (s, l) => s + ((l.lineAmount || 0) * (l.vatPercent || 0)) / 100,
    0,
  );
  const finalTaxExclusive =
    computedNet > 0 && Math.abs(taxExclusiveAmount - computedNet) > 0.5
      ? computedNet
      : taxExclusiveAmount;
  const finalTaxAmount =
    computedVat > 0 && Math.abs(taxAmount - computedVat) > 0.5
      ? computedVat
      : taxAmount;
  const finalTaxInclusive =
    Math.abs(taxInclusiveAmount - (finalTaxExclusive + finalTaxAmount)) > 0.5
      ? finalTaxExclusive + finalTaxAmount
      : taxInclusiveAmount;
  const finalPayable = payableAmount > 0 ? payableAmount : finalTaxInclusive;

  if (!monetaryTotalNode) {
    warnings.push('LegalMonetaryTotal not found — totals may be zero');
  }

  // ── PAYMENT INFO ───────────────────────────────────────────

  let paymentMeansCode: string | undefined;
  let paymentAccountId: string | undefined;

  const paymentMeansNode = first(
    cac['cac:PaymentMeans']
  ) as Record<string, unknown> | undefined;

  if (paymentMeansNode) {
    paymentMeansCode = getText(first(paymentMeansNode['cbc:PaymentMeansCode']));

    // PayeeFinancialAccount
    const payeeAccountNode = first(
      first(paymentMeansNode['cac:PayeeFinancialAccount'])
    ) as Record<string, unknown> | undefined;

    if (payeeAccountNode) {
      paymentAccountId = getText(first(payeeAccountNode['cbc:IBAN']))
        ?? getText(first(payeeAccountNode['cbc:AccountNumber']));
    }
  }

  // ── VALIDATE DUE DATE FOR CREDIT NOTES ──────────────────────

  if (documentType === '381' && dueDateRaw) {
    warnings.push('Credit notes typically do not have a due date — DueDate found and will be ignored');
  }

  // ── BUILD RESULT ────────────────────────────────────────────

  const data: ParsedEInvoice = {
    supplierName: supplierName || 'Ukendt leverandør',
    supplierCvr,
    supplierEmail,
    supplierPhone,
    supplierAddress,
    supplierCity,
    supplierCountry,
    invoiceNumber,
    issueDate: issueDateRaw ?? new Date().toISOString().slice(0, 10),
    dueDate: dueDateRaw ?? undefined,
    currencyCode,
    format,
    documentType,
    customizationId: customizationIdRaw ?? undefined,
    profileId: profileIdRaw ?? undefined,
    lineItems,
    vatSubtotals,
    taxExclusiveAmount: finalTaxExclusive,
    taxAmount: finalTaxAmount,
    taxInclusiveAmount: finalTaxInclusive,
    payableAmount: finalPayable,
    paymentMeansCode,
    paymentAccountId,
  };

  // If we have critical errors, still return the partial data
  // so the caller can decide how to handle it
  if (errors.length > 0 && !data.invoiceNumber) {
    return { data: null, errors, warnings };
  }

  return { data, errors, warnings };
}

// ─── MAP DOCUMENT TYPE TO EINVOICE TYPE ──────────────────────────

/**
 * Map InvoiceTypeCode to the internal EInvoiceType enum string
 * used by the Prisma ReceivedInvoice model.
 */
export function mapDocumentTypeToDbValue(typeCode: EInvoiceTypeCode): string {
  switch (typeCode) {
    case '380': return 'INVOICE';
    case '381': return 'CREDIT_NOTE';
    case '384': return 'CORRECTED';
    case '389': return 'SELF_BILLED';
    default: return 'INVOICE';
  }
}

/**
 * Map detected format to the Prisma EInvoiceFormat enum string.
 */
export function mapFormatToDbValue(format: EInvoiceFormat): string {
  return format === 'PEPPOL_BIS' ? 'PEPPOL_BIS' : 'OIOUBL';
}
