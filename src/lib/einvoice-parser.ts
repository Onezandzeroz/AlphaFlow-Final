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

  // 2. Find the root invoice element
  // UBL namespace: may be wrapped in {urn:oasis:names:specification:ubl:schema:xsd:Invoice-2}Invoice
  let invoiceRoot = first(parsed['Invoice']) as Record<string, unknown> | undefined;
  if (!invoiceRoot) {
    // Try to find it by iterating keys
    for (const key of Object.keys(parsed)) {
      if (key.toLowerCase().includes('invoice')) {
        invoiceRoot = first(parsed[key]) as Record<string, unknown>;
        break;
      }
    }
  }

  if (!invoiceRoot) {
    return {
      data: null,
      errors: ['No Invoice element found in XML. Expected UBL 2.1 Invoice document.'],
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

  // Invoice type code
  const typeCodeRaw = getText(first(cbc['cbc:InvoiceTypeCode']));
  const documentType: EInvoiceTypeCode = VALID_TYPE_CODES.includes(typeCodeRaw as EInvoiceTypeCode)
    ? (typeCodeRaw as EInvoiceTypeCode)
    : '380';
  if (typeCodeRaw && !VALID_TYPE_CODES.includes(typeCodeRaw as EInvoiceTypeCode)) {
    warnings.push(`Unknown InvoiceTypeCode "${typeCodeRaw}" — defaulting to 380 (invoice)`);
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

  // ── LINE ITEMS (InvoiceLine) ────────────────────────────────

  const lineItems: ParsedLineItem[] = [];
  const invoiceLines = first(cac['cac:InvoiceLine']) as
    | Record<string, unknown>[]
    | Record<string, unknown>
    | undefined;

  const lineArray = Array.isArray(invoiceLines)
    ? invoiceLines
    : invoiceLines
      ? [invoiceLines]
      : [];

  for (const line of lineArray) {
    const lineId = getText(first(line['cbc:ID'])) ?? '';
    const lineNote = getText(first(line['cbc:Note']));

    // Price line (InvoicedQuantity, LineExtensionAmount, Price)
    const quantity = toNum(getText(first(line['cbc:InvoicedQuantity'])));
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
    const invoicedQtyUnitCode = getText(
      first(line['cbc:InvoicedQuantity']?.['@_unitCode'] ?? line['cbc:InvoicedQuantity'])
    );
    const unitCode = invoicedQtyUnitCode || unitCodeRaw || 'C62';

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
      if (taxAmount > 0 && quantity > 0) {
        vatPercent = Math.round((taxAmount / (lineAmount - taxAmount)) * 100);
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
    taxExclusiveAmount,
    taxAmount,
    taxInclusiveAmount,
    payableAmount,
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
