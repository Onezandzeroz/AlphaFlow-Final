import { create } from 'xmlbuilder2';

/**
 * OIOUBL 2.1 / Peppol BIS Billing 3.0 XML Generator
 *
 * Generates valid UBL 2.1 Invoice XML for Danish e-invoicing via:
 *   - NemHandel eDelivery (OIOUBL 2.1 format — Danish-to-Danish)
 *   - Peppol network (Peppol BIS Billing 3.0 — cross-border)
 *
 * The OIOUBL 2.1 format follows the official Erhvervsstyrelsen example at
 *   docs/SBD-OIOUBL-Invoice-valid.xml
 * It uses NES Profile 5 Basic Billing (Invoice + CreditNote only) for
 * maximum compatibility — Procurement-BilSim requires ApplicationResponse
 * support which AlphaFlow doesn't currently have.
 */

export interface OIOUBLInvoiceData {
  // Invoice identification
  invoiceId: string;
  issueDate: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD
  invoiceTypeCode?: '380' | '381' | '384' | '389'; // Invoice type: 380=Commercial, 381=Credit note, 384=Corrected, 389=Self-billed
  // For credit notes (381): the original invoice number being credited.
  // Surfaced in cac:BillingReference. Falls back to the credit note's own ID.
  originalInvoiceNumber?: string;

  /**
   * Output format — controls the CustomizationID/ProfileID pair and all
   * downstream OIOUBL-specific attributes:
   *
   *   'OIOUBL'    (default) — Danish NemHandel eDelivery format.
   *     CustomizationID = 'OIOUBL-2.1'      (literal string per the official
   *                                          Erhvervsstyrelsen example)
   *     ProfileID      = { @schemeID: 'urn:oioubl:id:profileid-1.2',
   *                        @schemeAgencyID: '320',
   *                        #: 'urn:www.nesubl.eu:profiles:profile5:ver2.0' }
   *                       (NES Profile 5 Basic Billing — Invoice + CreditNote only)
   *     InvoiceTypeCode = { @listAgencyID: '320',
   *                        @listID: 'urn:oioubl:codelist:invoicetypecode-1.1',
   *                        #: '380' | '381' | ... }
   *     AddressFormatCode = StructuredDK (cbc:AddressFormatCode in PostalAddress)
   *     PaymentChannelCode = DK:BANK (cbc:PaymentChannelCode in PaymentMeans)
   *     EndpointID       = @schemeID="DK:CVR" + DK-prefixed CVR value
   *     PartyTaxScheme/CompanyID = @schemeID="DK:SE" + DK-prefixed CVR
   *     TaxScheme/ID     = { @schemeAgencyID: '320',
   *                          @schemeID: 'urn:oioubl:id:taxschemeid-1.1',
   *                          #: '63' }  (Danish VAT code)
   *     TaxCategory/ID   = { @schemeAgencyID: '320',
   *                          @schemeID: 'urn:oioubl:id:taxcategoryid-1.1',
   *                          #: 'StandardRated' | 'ZeroRated' | ... }
   *     SellersItemIdentification/ID = @schemeAgencyID="9" @schemeID="GTIN"
   *                                     + GTIN value (when line.gtin is set)
   *     InvoiceLine      = includes cac:OrderLineReference, line-level
   *                        cac:TaxTotal, Price with BaseQuantity +
   *                        OrderableUnitFactorRate
   *
   *   'PEPPOL_BIS' — Peppol BIS Billing 3.0 (EN 16931 + Peppol extension).
   *     CustomizationID = 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0'
   *     ProfileID      = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0'  (plain string)
   *     InvoiceTypeCode = plain string ('380' | '381' | ...)
   *     (No AddressFormatCode, no PaymentChannelCode)
   *     EndpointID = @schemeID="0184" + bare CVR
   *     PartyTaxScheme/CompanyID = plain DK-prefixed VAT (e.g., "DK30518330")
   *     TaxScheme/ID = plain string 'VAT'
   *     TaxCategory/ID = plain string 'S' | 'Z' | ...
   *     (No SellersItemIdentification, no line-level TaxTotal)
   *
   * IMPORTANT — the OIOUBL CustomizationID is the LITERAL string
   * "OIOUBL-2.1" (NOT a URN, NOT "OIOUBL-2.02"). Sproom uses this to
   * identify the document as OIOUBL format. Using a URN like
   * "urn:oioubl:invoice:1.0" causes Sproom to return
   * "cannot find format for document".
   *
   * The OIOUBL format requires STRICTER attributes than Peppol BIS 3 —
   * each codelist/ID element needs @listID/@listAgencyID or
   * @schemeID/@schemeAgencyID attributes. Omitting them causes Sproom
   * schematron errors:
   *   - Missing @schemeID on ProfileID → "[W-LIB003] Invalid schemeID"
   *   - Missing @listID on InvoiceTypeCode → "[W-INV010] Invalid listID"
   *   - ... (many more)
   *
   * The choice must match the receiving network: NemHandel expects OIOUBL,
   * Peppol expects Peppol BIS 3. Setting the wrong format will cause the
   * receiving AP to reject the document.
   */
  format?: 'OIOUBL' | 'PEPPOL_BIS';

  /**
   * Buyer reference (cbc:BuyerReference). Peppol BIS 3 / EN 16931 rule
   * R003 requires a buyer reference OR a purchase order reference
   * (cac:OrderReference). If unset, the generator falls back to the
   * customer's identifier (CVR) so the document is always R003-compliant.
   * Wire a real value here once the Invoice model has a PO/buyer-reference field.
   */
  buyerReference?: string;
  
  // Supplier/Seller information
  supplier: {
    id: string;
    name: string;
    streetAddress?: string;
    city?: string;
    postalCode?: string;
    country?: string; // ISO country code, e.g., 'DK'
    vatNumber?: string; // Without country prefix
    contactEmail?: string;
    contactPhone?: string;
  };
  
  // Customer/Buyer information
  customer: {
    id: string;
    /**
     * Peppol endpoint scheme for the customer (e.g. '0184' for Danish
     * CVR, 'DK:DIGST' for Digitalstyrelsen B2G test receiver).
     * Defaults to '0184' (Danish CVR) if not set. Used in
     * <cbc:EndpointID schemeID="..."> and <cac:PartyIdentification>.
     * NOTE: For OIOUBL format, this is overridden to 'DK:CVR' (the
     * OIOUBL-standard scheme ID for Danish CVR).
     */
    endpointScheme?: string;
    name: string;
    streetAddress?: string;
    city?: string;
    postalCode?: string;
    country?: string;
    vatNumber?: string;
    contactEmail?: string;
    contactPhone?: string;
  };
  
  // Invoice line items
  lines: Array<{
    id: string;
    description: string;
    quantity: number;
    unitCode: string; // e.g., 'EA' (Each), 'HUR' (Hour), 'KGM' (Kilogram)
    unitPrice: number; // Price per unit excluding VAT
    vatPercent: number;
    vatCategoryCode: string; // 'S' = Standard rate, 'Z' = Zero rate, 'E' = Exempt
    /**
     * Optional GTIN/EAN item identifier. When set on the OIOUBL branch,
     * emitted as cac:SellersItemIdentification/cbc:ID with
     * @schemeAgencyID="9" @schemeID="GTIN" per the official example.
     * AlphaFlow's Invoice model has no GTIN field yet, so this is
     * currently undefined in practice.
     */
    gtin?: string;
  }>;
  
  // Totals
  taxTotal: number; // Total VAT amount
  payableAmount: number; // Total including VAT
  taxExclusiveAmount: number; // Total excluding VAT
  taxInclusiveAmount: number; // Total including VAT
  
  // Payment information
  paymentMeansCode?: string; // e.g., '42' = Payment to bank account (DK-R-005)
  paymentAccountId?: string; // Bank account number (IBAN or local)
  // Danish bank registration number (registreringsnummer, 4-digit bank code).
  // DK-R-006: mandatory for Danish suppliers when PaymentMeansCode is 31 or 42.
  // Emitted in cac:PayeeFinancialAccount/cac:FinancialInstitutionBranch/cbc:ID.
  bankRegistration?: string;
  paymentReference?: string; // Payment reference/KID
  
  // Currency
  currencyCode: string; // e.g., 'DKK'
}

// Default supplier information for testing
export const DEFAULT_SUPPLIER: OIOUBLInvoiceData['supplier'] = {
  id: 'DK12345678',
  name: 'Dansk Bogholderi ApS',
  streetAddress: 'Hovedgaden 123',
  city: 'København',
  postalCode: '1000',
  country: 'DK',
  vatNumber: 'DK12345678',
  contactEmail: 'info@danskbogholderi.dk',
  contactPhone: '+45 12 34 56 78',
};

// Default customer information for testing
export const DEFAULT_CUSTOMER: OIOUBLInvoiceData['customer'] = {
  id: 'CUST001',
  name: 'Kunde ApS',
  streetAddress: 'Strøget 45',
  city: 'Aarhus',
  postalCode: '8000',
  country: 'DK',
  vatNumber: 'DK87654321',
  contactEmail: 'kunde@example.dk',
};

// ─── OIOUBL HELPER FUNCTIONS ─────────────────────────────────────

/**
 * Ensure a CVR/VAT value has the "DK" country prefix.
 *
 * For OIOUBL schemeID="DK:CVR" and schemeID="DK:SE", the value MUST
 * start with "DK" (e.g., "DK16356706"). AlphaFlow stores the bare CVR
 * (e.g., "16356706") — this helper adds the prefix when missing.
 *
 * If the value already starts with "DK" (case-insensitive), it's returned
 * unchanged (no double-prefix). If the value is empty/undefined, returns undefined.
 */
function ensureDkPrefix(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.toUpperCase().startsWith('DK')) return trimmed;
  return `DK${trimmed}`;
}

/**
 * Map Peppol BIS / UN/ECE 5301 VAT category codes to OIOUBL 2.1 tax
 * category IDs (codelist urn:oioubl:codelist:taxcategoryid-1.1).
 *
 * OIOUBL uses full names instead of single letters:
 *   S  → StandardRated (standard rate, e.g., 25% Danish VAT)
 *   Z  → ZeroRated (zero rate)
 *   E  → ExemptFromTax (exempt from VAT)
 *   AE → ReverseCharge (VAT reverse charge)
 *   K  → ConditionalExemptFromTax (intra-community supply)
 *   G  → FreeExportItemTax (export outside EU)
 *   O  → OutsideScopeTax (not subject to VAT)
 *
 * Default: StandardRated (safest for non-zero VAT).
 */
function toOIOUBLTaxCategoryId(code: string | undefined): string {
  switch (code) {
    case 'S':  return 'StandardRated';
    case 'Z':  return 'ZeroRated';
    case 'E':  return 'ExemptFromTax';
    case 'AE': return 'ReverseCharge';
    case 'K':  return 'ConditionalExemptFromTax';
    case 'G':  return 'FreeExportItemTax';
    case 'O':  return 'OutsideScopeTax';
    default:   return 'StandardRated';
  }
}

// ─── OIOUBL BUILDING BLOCKS (structured attribute objects) ────────

/**
 * OIOUBL TaxScheme/ID structured object — Danish VAT (code "63").
 *   <cbc:ID schemeAgencyID="320" schemeID="urn:oioubl:id:taxschemeid-1.1">63</cbc:ID>
 */
const OIOUBL_TAX_SCHEME_ID = {
  '@schemeAgencyID': '320',
  '@schemeID': 'urn:oioubl:id:taxschemeid-1.1',
  '#': '63',
};

/**
 * OIOUBL AddressFormatCode structured object — StructuredDK address format.
 *   <cbc:AddressFormatCode listAgencyID="320" listID="urn:oioubl:codelist:addressformatcode-1.1">StructuredDK</cbc:AddressFormatCode>
 */
const OIOUBL_ADDRESS_FORMAT_CODE = {
  '@listAgencyID': '320',
  '@listID': 'urn:oioubl:codelist:addressformatcode-1.1',
  '#': 'StructuredDK',
};

/**
 * OIOUBL PaymentChannelCode structured object — Danish bank payment channel.
 *   <cbc:PaymentChannelCode listAgencyID="320" listID="urn:oioubl:codelist:paymentchannelcode-1.1">DK:BANK</cbc:PaymentChannelCode>
 */
const OIOUBL_PAYMENT_CHANNEL_CODE = {
  '@listAgencyID': '320',
  '@listID': 'urn:oioubl:codelist:paymentchannelcode-1.1',
  '#': 'DK:BANK',
};

/**
 * Build the OIOUBL InvoiceTypeCode structured object.
 *   <cbc:InvoiceTypeCode listAgencyID="320" listID="urn:oioubl:codelist:invoicetypecode-1.1">380</cbc:InvoiceTypeCode>
 */
function buildOioiublInvoiceTypeCode(typeCode: string) {
  return {
    '@listAgencyID': '320',
    '@listID': 'urn:oioubl:codelist:invoicetypecode-1.1',
    '#': typeCode,
  };
}

/**
 * Build the OIOUBL TaxCategory/ID structured object.
 *   <cbc:ID schemeAgencyID="320" schemeID="urn:oioubl:id:taxcategoryid-1.1">StandardRated</cbc:ID>
 */
function buildOioiublTaxCategoryId(peppolCode: string) {
  return {
    '@schemeAgencyID': '320',
    '@schemeID': 'urn:oioubl:id:taxcategoryid-1.1',
    '#': toOIOUBLTaxCategoryId(peppolCode),
  };
}

/**
 * Build the OIOUBL SellersItemIdentification/ID structured object.
 *   <cbc:ID schemeAgencyID="9" schemeID="GTIN">5712345780121</cbc:ID>
 */
function buildOioiublSellersItemId(gtin: string) {
  return {
    '@schemeAgencyID': '9',
    '@schemeID': 'GTIN',
    '#': gtin,
  };
}

// ─── POSTAL ADDRESS (OIOUBL vs Peppol BIS 3) ──────────────────────

/**
 * Parse a Danish street address string into street name + building number.
 *
 * AlphaFlow stores addresses as a single string (e.g., "Vildvej 234, st."
 * or "Leverandørvej 11"). OIOUBL's StructuredDK format requires separate
 * `cbc:StreetName` and `cbc:BuildingNumber` elements. Sproom's F-LIB035
 * schematron rule rejects StructuredDK addresses that have neither.
 *
 * Danish address formats handled:
 *   "Street 123"             → street="Street", number="123"
 *   "Street 123, 3."         → street="Street", number="123" (floor dropped)
 *   "Street 123A"            → street="Street", number="123A"
 *   "Street 12 A"            → street="Street", number="12 A"
 *   "Street-name 123, st."   → street="Street-name", number="123"
 *
 * If no building number can be parsed, returns the full address as the
 * street name and `buildingNumber: undefined`. The caller should then
 * OMIT the AddressFormatCode element (so the F-LIB035 rule doesn't fire)
 * OR switch to "UnstructuredDK" format.
 */
function parseDanishStreetAddress(address: string | undefined): {
  streetName: string;
  buildingNumber?: string;
} {
  if (!address || !address.trim()) {
    return { streetName: 'Unknown' };
  }
  // Strip floor/apartment info — everything after the first comma.
  // "Vildvej 234, st." → "Vildvej 234"
  const mainAddress = address.split(',')[0].trim();

  // Match pattern: "Street Name 123" or "Street Name 123A" — the
  // building number is the LAST whitespace-separated token that
  // starts with a digit (followed by an optional letter).
  const trailingMatch = mainAddress.match(/^(.+?)\s+(\d+[A-Za-z]?)\s*$/);
  if (trailingMatch) {
    return {
      streetName: trailingMatch[1].trim(),
      buildingNumber: trailingMatch[2],
    };
  }

  // Fallback: try to find a building number anywhere in the address.
  // Useful for formats like "123 Street Name" (rare in DK but defensive).
  const anywhereMatch = mainAddress.match(/\b(\d+[A-Za-z]?)\b/);
  if (anywhereMatch) {
    const num = anywhereMatch[0];
    const idx = mainAddress.indexOf(num);
    const street = mainAddress.substring(0, idx).trim();
    return {
      streetName: street || 'Unknown',
      buildingNumber: num,
    };
  }

  // No building number found — return the full address as street name.
  return { streetName: mainAddress };
}

/**
 * Build the cac:PostalAddress block. For OIOUBL, includes the
 * AddressFormatCode element (StructuredDK) and emits it FIRST per the
 * UBL 2.1 schema sequence. For Peppol BIS 3, omits AddressFormatCode.
 *
 * F-LIB035 schematron rule (Sproom): if AddressFormatCode = StructuredDK,
 * the address MUST have either a BuildingNumber or a Postbox element.
 * To comply:
 *   - Parse the building number from the street address.
 *   - If parsing succeeds → emit StructuredDK + StreetName + BuildingNumber.
 *   - If parsing fails → OMIT AddressFormatCode entirely (so the rule
 *     doesn't fire). The address is still valid OIOUBL, just unstructured.
 */
function buildPostalAddress(
  data: { streetAddress?: string; city?: string; postalCode?: string; country?: string },
  currencyCode: string,
  isPeppolBis: boolean,
): Record<string, unknown> {
  void currencyCode; // reserved for future use (no currency in PostalAddress)
  const parsed = parseDanishStreetAddress(data.streetAddress);
  const hasBuildingNumber = !!parsed.buildingNumber;

  return {
    // Only emit AddressFormatCode=StructuredDK when we have a BuildingNumber
    // to satisfy F-LIB035. If parsing failed, OMIT AddressFormatCode so
    // the rule doesn't fire (the address is still valid OIOUBL).
    ...(!isPeppolBis && hasBuildingNumber
      ? { 'cbc:AddressFormatCode': OIOUBL_ADDRESS_FORMAT_CODE }
      : {}),
    'cbc:StreetName': parsed.streetName,
    // Emit BuildingNumber only when we successfully parsed one.
    ...(!isPeppolBis && parsed.buildingNumber
      ? { 'cbc:BuildingNumber': parsed.buildingNumber }
      : {}),
    'cbc:CityName': data.city || 'Unknown',
    'cbc:PostalZone': data.postalCode || '0000',
    'cac:Country': {
      'cbc:IdentificationCode': data.country || 'DK',
    },
  };
}

// ─── TAX SUBTOTALS ───────────────────────────────────────────────

/**
 * Generate tax subtotals grouped by VAT rate. For OIOUBL, the TaxCategory/ID
 * is a structured object with @schemeAgencyID + @schemeID + value (StandardRated/
 * ZeroRated/etc.). For Peppol BIS 3, it's a plain string ('S', 'Z', etc.).
 *
 * The TaxScheme/ID for OIOUBL uses the structured object form (Danish VAT code 63
 * with schemeID/schemeAgencyID attributes). For Peppol BIS 3, plain 'VAT'.
 */
function generateTaxSubtotals(
  data: OIOUBLInvoiceData,
  isPeppolBis: boolean,
): Record<string, unknown>[] | Record<string, unknown> {
  // Group lines by VAT rate + category code
  const vatGroups = new Map<string, { taxable: number; tax: number; percent: number; code: string }>();
  for (const line of data.lines) {
    const key = `${line.vatPercent}-${line.vatCategoryCode}`;
    const lineAmount = Number(line.quantity) * Number(line.unitPrice);
    const vatAmount = lineAmount * Number(line.vatPercent) / 100;
    const group = vatGroups.get(key) || {
      taxable: 0,
      tax: 0,
      percent: line.vatPercent,
      code: line.vatCategoryCode,
    };
    group.taxable += lineAmount;
    group.tax += vatAmount;
    vatGroups.set(key, group);
  }

  const subtotals = Array.from(vatGroups.values()).map(group => ({
    'cbc:TaxableAmount': {
      '@currencyID': data.currencyCode,
      '#': group.taxable.toFixed(2),
    },
    'cbc:TaxAmount': {
      '@currencyID': data.currencyCode,
      '#': group.tax.toFixed(2),
    },
    'cac:TaxCategory': {
      'cbc:ID': isPeppolBis ? group.code : buildOioiublTaxCategoryId(group.code),
      'cbc:Percent': group.percent.toString(),
      'cac:TaxScheme': {
        'cbc:ID': isPeppolBis ? 'VAT' : OIOUBL_TAX_SCHEME_ID,
        ...(isPeppolBis ? {} : { 'cbc:Name': 'Moms' }),
      },
    },
  }));

  // If only one group, return it directly (not as array)
  return subtotals.length === 1 ? subtotals[0] : subtotals;
}

// ─── MAIN GENERATOR ───────────────────────────────────────────────

/**
 * Generate OIOUBL Invoice XML string.
 *
 * The format field on `data` selects between the OIOUBL 2.1 format
 * (Danish NemHandel, default) and the Peppol BIS 3 format (cross-border).
 * Defaults to OIOUBL when unset.
 */
export function generateOIOUBL(data: OIOUBLInvoiceData): string {
  // ── Resolve format → (CustomizationID, ProfileID, InvoiceTypeCode) ──
  //
  // Default to OIOUBL — the function name says so, and Danish-to-Danish
  // sends via NemHandel expect OIOUBL format. Callers that need to send
  // cross-border via Peppol should pass `format: 'PEPPOL_BIS'` explicitly.
  //
  // IMPORTANT — the OIOUBL CustomizationID is a LITERAL STRING, not a URN:
  //   "OIOUBL-2.1" (per the official Erhvervsstyrelsen example — Task 37
  //   changed from the older "OIOUBL-2.02" guess to the actual value
  //   used by Erhvervsstyrelsen's reference test file).
  // Sproom uses the CustomizationID to identify the document format. If
  // the value doesn't match the OIOUBL standard's literal string, Sproom
  // returns "cannot find format for document".
  //
  // The ProfileID structure differs between the two formats:
  //   OIOUBL: ProfileID element has @schemeID + @schemeAgencyID attributes
  //           AND a text value (NES Profile 5 URN). Sproom's W-LIB003
  //           schematron rule rejects ProfileID elements that lack the
  //           schemeID attribute.
  //   PEPPOL_BIS: ProfileID is a plain string URN (no attributes).
  const fmt = data.format ?? 'OIOUBL';
  const isPeppolBis = fmt === 'PEPPOL_BIS';
  const customizationId = isPeppolBis
    ? 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0'
    : 'OIOUBL-2.1';
  // ProfileID is an object for OIOUBL (with @schemeID + @schemeAgencyID
  // attributes) and a plain string for Peppol BIS 3 (no attributes).
  // xmlbuilder2 handles both shapes — the `#` key denotes element text
  // when attributes are also present.
  const profileId: string | { '@schemeID': string; '@schemeAgencyID': string; '#': string } =
    isPeppolBis
      ? 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0'
      : {
          // OIOUBL 2.1 — Danish NemHandel eDelivery format.
          // schemeID = the profile naming scheme (1.2 = NES profiles)
          // schemeAgencyID = 320 (Danish Business Authority, ERST)
          // # = the actual profile URN (NES Profile 5 Basic Billing)
          '@schemeID': 'urn:oioubl:id:profileid-1.2',
          '@schemeAgencyID': '320',
          '#': 'urn:www.nesubl.eu:profiles:profile5:ver2.0',
        };

  // InvoiceTypeCode: OIOUBL needs @listAgencyID + @listID attrs (W-INV010),
  // Peppol BIS 3 accepts a plain string.
  const invoiceTypeCode = isPeppolBis
    ? (data.invoiceTypeCode || '380')
    : buildOioiublInvoiceTypeCode(data.invoiceTypeCode || '380');

  // ── DK-prefixed CVR values for OIOUBL scheme IDs ──
  //
  // OIOUBL schemeID="DK:CVR" and schemeID="DK:SE" require the value to
  // start with "DK" (e.g., "DK16356706"). AlphaFlow stores the bare CVR
  // (e.g., "16356706") in `data.supplier.id` / `data.customer.id` and
  // the DK-prefixed VAT (e.g., "DK16356706") in `vatNumber`. We ensure
  // the DK prefix is always present for OIOUBL.
  const supplierIdDk = isPeppolBis
    ? data.supplier.id
    : (ensureDkPrefix(data.supplier.id) || data.supplier.id);
  const supplierVatDk = isPeppolBis
    ? (data.supplier.vatNumber || '')
    : (ensureDkPrefix(data.supplier.vatNumber) || ensureDkPrefix(data.supplier.id) || '');
  const customerIdDk = isPeppolBis
    ? data.customer.id
    : (ensureDkPrefix(data.customer.id) || data.customer.id);

  // EndpointID + PartyIdentification scheme IDs:
  //   OIOUBL   → 'DK:CVR'
  //   PEPPOL_BIS → '0184' (ISO 6523 ICD for Danish CVR)
  const supplierEndpointScheme = isPeppolBis ? '0184' : 'DK:CVR';
  const customerEndpointScheme = isPeppolBis ? (data.customer.endpointScheme || '0184') : 'DK:CVR';

  // PartyTaxScheme CompanyID scheme ID:
  //   OIOUBL → 'DK:SE'  (Danish SE/VAT identifier scheme)
  //   PEPPOL_BIS → plain DK-prefixed string (no @schemeID)
  //   Value: DK-prefixed VAT (e.g., "DK16356706")
  // PartyLegalEntity CompanyID scheme ID:
  //   OIOUBL → 'DK:CVR'  (Danish CVR scheme)
  //   PEPPOL_BIS → '0184'  (ISO 6523 ICD for Danish CVR)
  //   Value: DK-prefixed CVR (OIOUBL) or bare CVR (PEPPOL_BIS — DK-R-014)

  // ── BUILD INVOICE OBJECT ──
  const invoice = {
    Invoice: {
      '@xmlns': 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
      '@xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
      '@xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',

      // ── Document identification ───────────────────────────────
      'cbc:UBLVersionID': '2.1',
      'cbc:CustomizationID': customizationId,
      'cbc:ProfileID': profileId,
      'cbc:ID': data.invoiceId,
      'cbc:IssueDate': data.issueDate,

      // DueDate MUST come right after IssueDate per the UBL 2.1 schema
      // sequence (position 8, before DocumentCurrencyCode at position 10).
      // Emitting it AFTER DocumentCurrencyCode causes Sproom's XSD validation
      // to reject the document: "invalid child element 'DueDate' ... expected:
      // TaxCurrencyCode, PricingCurrencyCode, ...". Not emitted for credit
      // notes (381) — they have no due date.
      ...(data.dueDate && data.invoiceTypeCode !== '381' && { 'cbc:DueDate': data.dueDate }),

      // InvoiceTypeCode — OIOUBL needs @listAgencyID + @listID attrs
      // (W-INV010 schematron rule), Peppol BIS 3 accepts a plain string.
      // The UBL 2.1 / Peppol BIS 3 XSD lax-allows it — sequence-validated
      // known elements skip past it, so its position relative to DueDate
      // is not sequence-critical.
      'cbc:InvoiceTypeCode': invoiceTypeCode,
      'cbc:DocumentCurrencyCode': data.currencyCode,

      // PEPPOL-EN16931-R003 requires a buyer reference (cbc:BuyerReference)
      // OR a purchase order reference (cac:OrderReference). The Invoice
      // model has no explicit PO/buyer-reference field, so we emit a
      // BuyerReference using the customer's identifier (CVR) — the buyer's
      // identifier serves as a routing reference and satisfies R003.
      // OIOUBL also accepts BuyerReference (it's optional in UBL 2.1).
      'cbc:BuyerReference': data.buyerReference || data.customer.id,

      // ── Credit note: BillingReference ────────────────────────
      ...(data.invoiceTypeCode === '381' && {
        'cac:BillingReference': {
          'cbc:InvoiceDocumentReference': {
            'cbc:ID': data.originalInvoiceNumber || data.invoiceId,
          },
        },
      }),
      
      // ── Supplier/Seller Party ────────────────────────────────
      'cac:AccountingSupplierParty': {
        'cac:Party': {
          // EndpointID — OIOUBL: @schemeID="DK:CVR" + DK-prefixed value
          //                PEPPOL_BIS: @schemeID="0184" + bare CVR
          'cbc:EndpointID': {
            '@schemeID': supplierEndpointScheme,
            '#': supplierIdDk,
          },
          'cac:PartyIdentification': {
            'cbc:ID': {
              '@schemeID': supplierEndpointScheme,
              '#': supplierIdDk,
            },
          },
          'cac:PartyName': {
            'cbc:Name': data.supplier.name,
          },
          // PostalAddress — OIOUBL includes AddressFormatCode (StructuredDK)
          'cac:PostalAddress': buildPostalAddress(data.supplier, data.currencyCode, isPeppolBis),
          // PartyTaxScheme — OIOUBL: @schemeID="DK:SE" on CompanyID,
          //                          TaxScheme/ID = structured { schemeID, 63 }
          //                        PEPPOL_BIS: plain CompanyID + plain 'VAT'
          'cac:PartyTaxScheme': {
            'cbc:CompanyID': isPeppolBis
              ? supplierVatDk
              : {
                  '@schemeID': 'DK:SE',
                  '#': supplierVatDk,
                },
            'cac:TaxScheme': {
              'cbc:ID': isPeppolBis ? 'VAT' : OIOUBL_TAX_SCHEME_ID,
              ...(isPeppolBis ? {} : { 'cbc:Name': 'Moms' }),
            },
          },
          'cac:PartyLegalEntity': {
            'cbc:RegistrationName': data.supplier.name,
            // DK-R-014 (Peppol BIS 3): PartyLegalEntity/CompanyID must
            // specify schemeID="0184" (DK CVR). The value is the bare
            // 8-digit CVR (data.supplier.id).
            // OIOUBL: @schemeID="DK:CVR" + DK-prefixed CVR value.
            'cbc:CompanyID': {
              '@schemeID': isPeppolBis ? '0184' : 'DK:CVR',
              '#': isPeppolBis ? data.supplier.id : supplierIdDk,
            },
          },
          ...(data.supplier.contactEmail || data.supplier.contactPhone
            ? {
                // UBL 2.1 Contact sequence: ID, Name, Telephone, Telefax,
                // ElectronicMail, Note, OtherCommunication. Telephone MUST
                // come before ElectronicMail — emitting ElectronicMail first
                // caused Sproom's XSD to reject with "invalid child element
                // 'Telephone' ... expected: Note / OtherCommunication".
                //
                // OIOUBL F-INV051 (Sproom): AccountingSupplierParty/Contact/ID
                // must contain a value when the Contact element is present.
                // We use the supplier's CVR (data.supplier.id) as a synthetic
                // contact identifier — AlphaFlow doesn't track individual
                // contact persons, just the company.
                'cac:Contact': {
                  'cbc:ID': data.supplier.id || '1',
                  'cbc:Name': data.supplier.name,
                  ...(data.supplier.contactPhone && {
                    'cbc:Telephone': data.supplier.contactPhone,
                  }),
                  ...(data.supplier.contactEmail && {
                    'cbc:ElectronicMail': data.supplier.contactEmail,
                  }),
                },
              }
            : {}),
        },
      },
      
      // ── Customer/Buyer Party ────────────────────────────────
      //
      // The official OIOUBL 2.1 example at docs/SBD-OIOUBL-Invoice-valid.xml
      // shows the customer party with ONLY: EndpointID, PartyIdentification,
      // PartyName, PostalAddress, Contact — NO PartyTaxScheme, NO
      // PartyLegalEntity. Both are optional in UBL 2.1 / OIOUBL 2.1.
      //
      // For OIOUBL we match the example (omit PartyTaxScheme + PartyLegalEntity
      // for the customer). For Peppol BIS 3 we keep the previous behavior
      // (PartyLegalEntity always, PartyTaxScheme when customer has VAT).
      'cac:AccountingCustomerParty': {
        'cac:Party': {
          'cbc:EndpointID': {
            '@schemeID': customerEndpointScheme,
            '#': customerIdDk,
          },
          'cac:PartyIdentification': {
            'cbc:ID': {
              '@schemeID': customerEndpointScheme,
              '#': customerIdDk,
            },
          },
          'cac:PartyName': {
            'cbc:Name': data.customer.name,
          },
          'cac:PostalAddress': buildPostalAddress(data.customer, data.currencyCode, isPeppolBis),
          // Peppol BIS 3 only: optional PartyTaxScheme when customer has VAT.
          ...(isPeppolBis && data.customer.vatNumber
            ? {
                'cac:PartyTaxScheme': {
                  'cbc:CompanyID': data.customer.vatNumber,
                  'cac:TaxScheme': {
                    'cbc:ID': 'VAT',
                  },
                },
              }
            : {}),
          // Peppol BIS 3 only: PartyLegalEntity (with CompanyID when CVR present).
          // OIOUBL: omit entirely (matches the official example).
          ...(isPeppolBis
            ? {
                'cac:PartyLegalEntity': {
                  'cbc:RegistrationName': data.customer.name,
                  ...(data.customer.vatNumber && {
                    'cbc:CompanyID': {
                      '@schemeID': '0184',
                      '#': data.customer.id,
                    },
                  }),
                },
              }
            : {}),
          ...(data.customer.contactEmail || data.customer.contactPhone
            ? {
                // OIOUBL F-INV051 (Sproom): AccountingCustomerParty/Contact/ID
                // must contain a value when the Contact element is present.
                // We use the customer's CVR (data.customer.id) as a synthetic
                // contact identifier — AlphaFlow doesn't track individual
                // contact persons, just the company.
                //
                // UBL 2.1 Contact sequence: ID, Name, Telephone, Telefax,
                // ElectronicMail, Note, OtherCommunication.
                'cac:Contact': {
                  'cbc:ID': data.customer.id || '1',
                  'cbc:Name': data.customer.name,
                  ...(data.customer.contactPhone && {
                    'cbc:Telephone': data.customer.contactPhone,
                  }),
                  ...(data.customer.contactEmail && {
                    'cbc:ElectronicMail': data.customer.contactEmail,
                  }),
                },
              }
            : {}),
        },
      },
      
      // ── Payment Means ────────────────────────────────────────
      //
      // OIOUBL adds PaymentChannelCode (DK:BANK) per the official example.
      // The element sequence per UBL 2.1 PaymentMeans schema:
      //   ID, PaymentMeansCode, PaymentDueDate, PaymentChannelCode,
      //   InstructionNote, PaymentID, ... PayeeFinancialAccount
      ...(data.paymentAccountId
        ? {
            'cac:PaymentMeans': {
              // DK-R-005: Danish-allowed PaymentMeansCode set is
              // 1, 10, 31, 42, 48, 49, 50, 58, 59, 93, 97. '30' (Credit
              // transfer, the UN/ECE default) is NOT allowed for Danish
              // suppliers. '42' = "Payment to bank account" (buyer pays
              // into the supplier's bank account) — semantically correct
              // for a standard invoice + DK-R-005 compliant.
              'cbc:PaymentMeansCode': data.paymentMeansCode || '42',
              // OIOUBL only — PaymentChannelCode comes AFTER PaymentDueDate
              // in the UBL 2.1 schema. We emit PaymentDueDate (when present)
              // first, then PaymentChannelCode for OIOUBL.
              ...(data.dueDate && data.invoiceTypeCode !== '381' && {
                'cbc:PaymentDueDate': data.dueDate,
              }),
              ...(isPeppolBis ? {} : { 'cbc:PaymentChannelCode': OIOUBL_PAYMENT_CHANNEL_CODE }),
              'cac:PayeeFinancialAccount': {
                'cbc:ID': data.paymentAccountId,
                ...(data.paymentReference && {
                  'cbc:PaymentNote': data.paymentReference,
                }),
                // DK-R-006: for Danish suppliers with PaymentMeansCode 31/42,
                // the registration account (registreringsnummer, 4-digit bank
                // code) is mandatory. Emitted in FinancialInstitutionBranch/cbc:ID.
                // UBL 2.1 FinancialAccount sequence: ID, ..., PaymentNote,
                // FinancialInstitutionBranch, Country — so it comes AFTER PaymentNote.
                ...(data.bankRegistration && {
                  'cac:FinancialInstitutionBranch': {
                    'cbc:ID': data.bankRegistration,
                  },
                }),
              },
            },
          }
        : {}),
      
      // ── Tax Total ────────────────────────────────────────────
      'cac:TaxTotal': {
        'cbc:TaxAmount': {
          '@currencyID': data.currencyCode,
          '#': data.taxTotal.toFixed(2),
        },
        // Generate TaxSubtotal for each unique VAT rate
        'cac:TaxSubtotal': generateTaxSubtotals(data, isPeppolBis),
      },
      
      // ── Legal Monetary Total ─────────────────────────────────
      'cac:LegalMonetaryTotal': {
        'cbc:LineExtensionAmount': {
          '@currencyID': data.currencyCode,
          '#': data.taxExclusiveAmount.toFixed(2),
        },
        'cbc:TaxExclusiveAmount': {
          '@currencyID': data.currencyCode,
          '#': data.taxExclusiveAmount.toFixed(2),
        },
        'cbc:TaxInclusiveAmount': {
          '@currencyID': data.currencyCode,
          '#': data.taxInclusiveAmount.toFixed(2),
        },
        'cbc:PayableAmount': {
          '@currencyID': data.currencyCode,
          '#': data.payableAmount.toFixed(2),
        },
      },
      
      // ── Invoice Lines ────────────────────────────────────────
      //
      // OIOUBL InvoiceLine includes (per the official example):
      //   ID, InvoicedQuantity, LineExtensionAmount, OrderLineReference,
      //   TaxTotal (with TaxSubtotal + TaxCategory), Item (Description, Name,
      //   SellersItemIdentification when GTIN available), Price (PriceAmount,
      //   BaseQuantity, OrderableUnitFactorRate)
      //
      // Peppol BIS 3 InvoiceLine is simpler:
      //   ID, InvoicedQuantity, LineExtensionAmount, Item (Description, Name,
      //   ClassifiedTaxCategory), Price (PriceAmount only)
      'cac:InvoiceLine': data.lines.map((line) => {
        const lineNetAmount = Number(line.quantity) * Number(line.unitPrice);
        const lineTaxAmount = lineNetAmount * Number(line.vatPercent) / 100;

        return {
          'cbc:ID': line.id,
          'cbc:InvoicedQuantity': {
            '@unitCode': line.unitCode,
            '#': line.quantity.toString(),
          },
          'cbc:LineExtensionAmount': {
            '@currencyID': data.currencyCode,
            '#': lineNetAmount.toFixed(2),
          },
          // OIOUBL only: OrderLineReference with cbc:LineID = line ID.
          ...(isPeppolBis ? {} : {
            'cac:OrderLineReference': {
              'cbc:LineID': line.id,
            },
          }),
          // OIOUBL only: line-level cac:TaxTotal with TaxSubtotal + TaxCategory.
          // The OIOUBL spec requires this; Peppol BIS 3 omits it (uses
          // Item/ClassifiedTaxCategory instead).
          ...(isPeppolBis ? {} : {
            'cac:TaxTotal': {
              'cbc:TaxAmount': {
                '@currencyID': data.currencyCode,
                '#': lineTaxAmount.toFixed(2),
              },
              'cac:TaxSubtotal': {
                'cbc:TaxableAmount': {
                  '@currencyID': data.currencyCode,
                  '#': lineNetAmount.toFixed(2),
                },
                'cbc:TaxAmount': {
                  '@currencyID': data.currencyCode,
                  '#': lineTaxAmount.toFixed(2),
                },
                'cac:TaxCategory': {
                  'cbc:ID': buildOioiublTaxCategoryId(line.vatCategoryCode),
                  'cbc:Percent': line.vatPercent.toString(),
                  'cac:TaxScheme': {
                    'cbc:ID': OIOUBL_TAX_SCHEME_ID,
                    'cbc:Name': 'Moms',
                  },
                },
              },
            },
          }),
          'cac:Item': {
            'cbc:Description': line.description,
            'cbc:Name': line.description,
            // OIOUBL only: SellersItemIdentification with @schemeAgencyID="9"
            // and @schemeID="GTIN" when line.gtin is set. AlphaFlow has no GTIN
            // data currently, so this is skipped in practice — the element is
            // optional in UBL 2.1 / OIOUBL 2.1.
            ...(isPeppolBis ? {} : (line.gtin ? {
              'cac:SellersItemIdentification': {
                'cbc:ID': buildOioiublSellersItemId(line.gtin),
              },
            } : {})),
            // Peppol BIS 3 only: ClassifiedTaxCategory inside Item.
            // OIOUBL uses line-level TaxTotal instead (see above).
            ...(isPeppolBis ? {
              'cac:ClassifiedTaxCategory': {
                'cbc:ID': line.vatCategoryCode,
                'cbc:Percent': line.vatPercent.toString(),
                'cac:TaxScheme': {
                  'cbc:ID': 'VAT',
                },
              },
            } : {}),
          },
          'cac:Price': {
            'cbc:PriceAmount': {
              '@currencyID': data.currencyCode,
              '#': line.unitPrice.toFixed(2),
            },
            // OIOUBL only: BaseQuantity + OrderableUnitFactorRate.
            // UBL 2.1 Price sequence: PriceAmount, BaseQuantity,
            // PricingExchangeRate, OrderableUnitFactorRate, ...
            ...(isPeppolBis ? {} : {
              'cbc:BaseQuantity': {
                '@unitCode': line.unitCode,
                '#': '1',
              },
              'cbc:OrderableUnitFactorRate': '1',
            }),
          },
        };
      }),
    },
  };
  
  // Generate XML
  const doc = create(invoice);
  return doc.end({ prettyPrint: true });
}

/**
 * Get VAT category code based on percentage
 */
export function getVATCategoryCode(vatPercent: number): string {
  if (vatPercent === 0) return 'Z'; // Zero rate
  if (vatPercent === 25) return 'S'; // Standard rate (Danish standard)
  return 'S'; // Standard rate for other percentages
}

/**
 * Generate a unique invoice ID
 */
export function generateInvoiceId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `INV-${timestamp}-${random}`;
}
