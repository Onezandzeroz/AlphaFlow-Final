/**
 * OIOUBL / Peppol BIS Billing 3.0 Pre-Validation
 *
 * Validates generated OIOUBL XML against Peppol BIS Billing 3.0 rules
 * before submission to the Peppol network. This is a lightweight pre-check
 * — not a full XSD schema or schematron validation.
 *
 * NemHandel eDelivery Note:
 * When routing to NemHandel eDelivery, the receiving Access Point will
 * perform mandatory schema validation (XSD) as part of the AS4
 * transmission process. If schema validation fails, the transmission
 * is rejected. If schematron validation fails after schema validation,
 * a Message Level Response (MLR) / Application Response (AR) MUST be
 * returned to the sender.
 *
 * This pre-validation catches common errors that would cause the
 * receiving AP to reject the invoice, reducing failed transmissions.
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Valid ISO 4217 currency codes (common subset used in Denmark/Nordics + EUR/USD/GBP)
const VALID_CURRENCY_CODES = new Set([
  'DKK', 'EUR', 'SEK', 'NOK', 'ISK', 'GBP', 'USD', 'CHF', 'PLN', 'CZK',
  'CAD', 'AUD', 'JPY', 'CNY', 'TRY', 'BGN', 'RON', 'HRK', 'HUF',
]);

// Valid UN/ECE 5301 VAT category codes for Peppol BIS Billing 3.0
const VALID_VAT_CATEGORY_CODES = new Set([
  'S',   // Standard rate
  'Z',   // Zero rated
  'AE',  // Reverse charge
  'K',   // Intra-community supply
  'G',   // Export outside EU
  'O',   // Not subject to VAT
  'E',   // Exempt from VAT
]);

// Valid UN/ECE 4461 Payment means codes (common subset)
const VALID_PAYMENT_MEANS_CODES = new Set([
  '1',   // Not defined
  '2',   // Instrument not defined
  '3',   // Cheque
  '4',   // Credit transfer
  '5',   // Debit transfer
  '6',   // Standing agreement
  '7',   // Debit card
  '8',   // Credit card
  '9',   // Direct debit
  '10',  // Cash
  '30',  // Credit transfer (specific)
  '42',  // Payment to bank account
  '48',  // Bank card
  '49',  // Direct debit
  '50',  // Standing agreement
  '54',  // Credit card
  '55',  // Debit card
  '57',  // Standing agreement (debit)
  '58',  // SEPA credit transfer
  '59',  // SEPA direct debit
]);

// ISO 8601 date regex (YYYY-MM-DD)
const ISO_DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * Validate an OIOUBL XML string against Peppol BIS Billing 3.0 pre-checks.
 *
 * This performs structural and business-rule validation on the generated XML
 * content. It extracts values using regex rather than a full XML parser
 * to keep the dependency footprint minimal.
 */
export function validateOIOUBL(xml: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!xml || typeof xml !== 'string') {
    errors.push('XML content is empty or invalid.');
    return { isValid: false, errors, warnings };
  }

  // ── 1. Basic XML structure ──────────────────────────────────────────
  //
  // UBL 2.1 supports two root document types:
  //   <Invoice>     — commercial invoices (and Peppol BIS 3 credit notes
  //                   which use InvoiceTypeCode=381 to distinguish them).
  //   <CreditNote>  — OIOUBL credit notes (separate document type, NO
  //                   InvoiceTypeCode element). The official Erhvervsstyrelsen
  //                   reference example is at docs/SBD-OIOUBL-CreditNote-valid.xml.
  // Detect the root type up front so we can apply format-specific rules
  // (e.g. accept the absence of InvoiceTypeCode for CreditNote).
  const isCreditNoteRoot = /<CreditNote[\s>]/.test(xml) &&
    xml.includes('xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"');
  const isInvoiceRoot = /<Invoice[\s>]/.test(xml) &&
    xml.includes('xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"');

  if (!isInvoiceRoot && !isCreditNoteRoot) {
    errors.push(
      'Missing root <Invoice> or <CreditNote> element with the correct UBL namespace. ' +
      'Expected <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"> ' +
      'or <CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2">.'
    );
  }

  if (!xml.includes('cbc:UBLVersionID')) {
    errors.push('Missing UBLVersionID element.');
  }

  // ── 2. Supplier (AccountingSupplierParty) ───────────────────────────

  if (!xml.includes('cac:AccountingSupplierParty')) {
    errors.push('Missing AccountingSupplierParty (supplier) element.');
  } else {
    const supplierName = extractElement(xml, 'cac:AccountingSupplierParty', 'cbc:Name');
    if (!supplierName) {
      errors.push('Supplier name is missing or empty.');
    }

    const supplierEndpoint = extractElement(xml, 'cac:AccountingSupplierParty', 'cbc:EndpointID');
    if (!supplierEndpoint) {
      warnings.push('Supplier endpoint ID (CVR/EAN) is missing. Peppol routing may fail.');
    }

    const supplierVat = extractElement(xml, 'cac:AccountingSupplierParty', 'cbc:CompanyID');
    if (!supplierVat) {
      warnings.push('Supplier VAT number (CompanyID) is missing.');
    }
  }

  // ── 3. Customer (AccountingCustomerParty) ───────────────────────────

  if (!xml.includes('cac:AccountingCustomerParty')) {
    errors.push('Missing AccountingCustomerParty (customer) element.');
  } else {
    const customerName = extractElement(xml, 'cac:AccountingCustomerParty', 'cbc:Name');
    if (!customerName) {
      errors.push('Customer name is missing or empty.');
    }

    const customerEndpoint = extractElement(xml, 'cac:AccountingCustomerParty', 'cbc:EndpointID');
    if (!customerEndpoint) {
      warnings.push('Customer endpoint ID (CVR/EAN) is missing. Peppol routing may fail.');
    }
  }

  // ── 4. Line items ───────────────────────────────────────────────────
  //
  // OIOUBL credit notes use <cac:CreditNoteLine> with <cbc:CreditedQuantity>;
  // invoices (and Peppol BIS 3 credit notes) use <cac:InvoiceLine> with
  // <cbc:InvoicedQuantity>. The validator accepts either set of element
  // names and counts whichever is present.
  const invoiceLineCount = countOccurrences(xml, 'cac:InvoiceLine');
  const creditNoteLineCount = countOccurrences(xml, 'cac:CreditNoteLine');
  const totalLineCount = invoiceLineCount + creditNoteLineCount;
  if (totalLineCount === 0) {
    errors.push('Document must contain at least one line item (cac:InvoiceLine or cac:CreditNoteLine).');
  }

  // Validate each invoice line. For OIOUBL CreditNote documents, the
  // quantity element is cbc:CreditedQuantity; for Invoice documents, it's
  // cbc:InvoicedQuantity. The validator extracts whichever is present.
  const quantityTagName = isCreditNoteRoot ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity';
  const lineCountForLoop = isCreditNoteRoot ? creditNoteLineCount : invoiceLineCount;
  for (let i = 0; i < lineCountForLoop; i++) {
    const lineDescription = extractNthElement(xml, 'cbc:Description', i);
    if (!lineDescription) {
      errors.push(`Line ${i + 1}: description is missing.`);
    }

    const lineQuantity = extractNthElement(xml, quantityTagName, i);
    if (!lineQuantity || parseFloat(lineQuantity) <= 0) {
      errors.push(`Line ${i + 1}: quantity must be greater than 0.`);
    }

    const linePrice = extractNthElement(xml, 'cbc:PriceAmount', i);
    if (!linePrice || parseFloat(linePrice) < 0) {
      errors.push(`Line ${i + 1}: unit price must be 0 or greater.`);
    }
  }

  // ── 5. Totals validation ────────────────────────────────────────────
  //
  // CRITICAL: OIOUBL 2.1 vs Peppol BIS 3 / EN 16931 have DIFFERENT
  // semantics for TaxExclusiveAmount (Task 41 root-cause fix for F-INV127):
  //
  //   OIOUBL 2.1:
  //     LineExtensionAmount = sum of line net amounts (pre-tax subtotal)
  //     TaxExclusiveAmount  = TOTAL TAX (= sum of TaxSubtotal/TaxAmount = vatTotal)
  //     TaxInclusiveAmount  = LineExtensionAmount + TaxExclusiveAmount (= total)
  //     PayableAmount       = TaxInclusiveAmount
  //     F-INV127 schematron: Sum(TaxSubtotal/TaxAmount) MUST equal TaxExclusiveAmount.
  //
  //   Peppol BIS 3 / EN 16931:
  //     LineExtensionAmount = sum of line net amounts (pre-tax subtotal)
  //     TaxExclusiveAmount  = pre-tax subtotal (= LineExtensionAmount)
  //     TaxInclusiveAmount  = TaxExclusiveAmount + TaxAmount (= subtotal + vatTotal)
  //     PayableAmount       = TaxInclusiveAmount
  //
  // The validator MUST be format-aware — checking TaxExclusiveAmount ==
  // sum-of-line-amounts is only valid for Peppol BIS 3, NOT for OIOUBL.
  //
  // Format detection: inspect the CustomizationID. The OIOUBL literal
  // string ('OIOUBL-2.1' or legacy 'OIOUBL-2.02') selects OIOUBL
  // semantics; anything else (incl. Peppol BIS 3 URN) selects Peppol
  // BIS 3 semantics.
  const customizationIdForTotals = xml.match(/<cbc:CustomizationID[^>]*>([^<]+)<\/cbc:CustomizationID>/);
  const customizationIdValue = customizationIdForTotals ? customizationIdForTotals[1].trim() : '';
  const isOIOUBLFormat = customizationIdValue === 'OIOUBL-2.1' || customizationIdValue === 'OIOUBL-2.02';

  // Sum only the per-line LineExtensionAmounts (inside InvoiceLine OR
  // CreditNoteLine), NOT the LegalMonetaryTotal/LineExtensionAmount (which
  // is the total of all lines — including it would double-count:
  // total + sum(lines) = 2×total, producing a false "TaxExclusiveAmount
  // mismatch" error). Both element names are accepted (Task 43: OIOUBL
  // CreditNotes use cac:CreditNoteLine instead of cac:InvoiceLine).
  const lineBlockRegex = isCreditNoteRoot
    ? /<cac:CreditNoteLine[\s\S]*?<\/cac:CreditNoteLine>/g
    : /<cac:InvoiceLine[\s\S]*?<\/cac:InvoiceLine>/g;
  let invoiceLineBlocks: string[] = xml.match(lineBlockRegex) ?? [];
  // Fallback: if the document is a CreditNote but for some reason uses
  // InvoiceLine elements (or vice versa), also try the other element name.
  if (invoiceLineBlocks.length === 0) {
    const fallbackRegex = isCreditNoteRoot
      ? /<cac:InvoiceLine[\s\S]*?<\/cac:InvoiceLine>/g
      : /<cac:CreditNoteLine[\s\S]*?<\/cac:CreditNoteLine>/g;
    invoiceLineBlocks = xml.match(fallbackRegex) ?? [];
  }
  const perLineXml = invoiceLineBlocks.join('');
  const lineExtensionAmounts = extractAllValues(perLineXml, 'cbc:LineExtensionAmount');
  const calculatedLineTotal = lineExtensionAmounts.reduce((sum, val) => sum + parseFloat(val || '0'), 0);

  // Extract the LegalMonetaryTotal block — needed for OIOUBL where
  // cbc:LineExtensionAmount appears both in InvoiceLine AND in
  // LegalMonetaryTotal. Without scoping, extractFirstValue would return
  // the line-level value, not the LegalMonetaryTotal value.
  const legalMonetaryTotalBlock = xml.match(/<cac:LegalMonetaryTotal[\s\S]*?<\/cac:LegalMonetaryTotal>/);
  const lmtXml = legalMonetaryTotalBlock ? legalMonetaryTotalBlock[0] : '';
  const lmtLineExtensionAmount = extractFirstValue(lmtXml, 'cbc:LineExtensionAmount');
  const taxExclusiveAmount = extractFirstValue(lmtXml, 'cbc:TaxExclusiveAmount');
  const taxInclusiveAmount = extractFirstValue(lmtXml, 'cbc:TaxInclusiveAmount');
  const payableAmount = extractFirstValue(lmtXml, 'cbc:PayableAmount');
  const taxAmount = extractFirstValue(xml, 'cbc:TaxAmount');

  // Sum of all TaxSubtotal/TaxAmount (used by F-INV127 for OIOUBL).
  // The top-level cac:TaxTotal has one or more cac:TaxSubtotal/cbc:TaxAmount
  // children. We extract them from the first cac:TaxTotal block (skip
  // line-level TaxTotals, which also have TaxSubtotal/TaxAmount).
  const topLevelTaxTotalMatch = xml.match(/<cac:TaxTotal>([\s\S]*?)<\/cac:TaxTotal>/);
  const topLevelTaxTotalXml = topLevelTaxTotalMatch ? topLevelTaxTotalMatch[1] : '';
  const subtotalTaxAmounts = extractAllValues(topLevelTaxTotalXml, 'cbc:TaxAmount');
  // The first cbc:TaxAmount in the TaxTotal block is the top-level TaxAmount;
  // the rest are TaxSubtotal/TaxAmount values. For F-INV127 we want the SUM
  // of the TaxSubtotal/TaxAmount values (which should equal the top-level
  // TaxAmount, AND equal TaxExclusiveAmount in OIOUBL).
  const sumOfSubtotalTaxAmounts = subtotalTaxAmounts.slice(1).reduce(
    (sum, val) => sum + parseFloat(val || '0'),
    0,
  );

  if (taxExclusiveAmount === null) {
    errors.push('Missing TaxExclusiveAmount.');
  } else if (isOIOUBLFormat) {
    // OIOUBL 2.1 semantics (Task 41):
    //   TaxExclusiveAmount = TOTAL TAX (= sum of TaxSubtotal/TaxAmount = vatTotal)
    //   F-INV127: Sum(TaxSubtotal/TaxAmount) MUST equal TaxExclusiveAmount.
    const taxExcl = parseFloat(taxExclusiveAmount);
    if (Math.abs(taxExcl - sumOfSubtotalTaxAmounts) > 0.02) {
      errors.push(
        `[F-INV127] TaxExclusiveAmount (${taxExcl.toFixed(2)}) does not equal ` +
        `sum of TaxTotal/TaxSubtotal/TaxAmount (${sumOfSubtotalTaxAmounts.toFixed(2)}). ` +
        `In OIOUBL 2.1, TaxExclusiveAmount = TOTAL TAX (= vatTotal), NOT the pre-tax subtotal. ` +
        `Official example: LineExtensionAmount=5050.00, TaxExclusiveAmount=1262.50 (= vatTotal).`
      );
    }
    // Also: TaxExclusiveAmount should equal the top-level TaxAmount.
    if (taxAmount !== null) {
      const topTax = parseFloat(taxAmount);
      if (Math.abs(taxExcl - topTax) > 0.02) {
        errors.push(
          `OIOUBL: TaxExclusiveAmount (${taxExcl.toFixed(2)}) does not equal TaxTotal/TaxAmount ` +
          `(${topTax.toFixed(2)}). In OIOUBL 2.1, TaxExclusiveAmount = TOTAL TAX.`
        );
      }
    }
    // TaxInclusiveAmount = LineExtensionAmount + TaxExclusiveAmount
    // (= sum of line amounts + total tax = total).
    if (lmtLineExtensionAmount !== null && taxInclusiveAmount !== null) {
      const lmtLine = parseFloat(lmtLineExtensionAmount);
      const taxIncl = parseFloat(taxInclusiveAmount);
      const expectedIncl = lmtLine + taxExcl;
      if (Math.abs(expectedIncl - taxIncl) > 0.02) {
        errors.push(
          `OIOUBL: TaxInclusiveAmount (${taxIncl.toFixed(2)}) does not equal LineExtensionAmount + ` +
          `TaxExclusiveAmount (${expectedIncl.toFixed(2)} = ${lmtLine.toFixed(2)} + ${taxExcl.toFixed(2)}).`
        );
      }
    }
  } else {
    // Peppol BIS 3 / EN 16931 semantics:
    //   TaxExclusiveAmount = pre-tax subtotal (= sum of line amounts).
    const taxExcl = parseFloat(taxExclusiveAmount);
    if (Math.abs(taxExcl - calculatedLineTotal) > 0.02) {
      errors.push(
        `TaxExclusiveAmount (${taxExcl.toFixed(2)}) does not match sum of line extension amounts ` +
        `(${calculatedLineTotal.toFixed(2)}). Difference: ${(taxExcl - calculatedLineTotal).toFixed(2)}.`
      );
    }
    if (taxAmount !== null && taxInclusiveAmount !== null) {
      const tax = parseFloat(taxAmount);
      const expectedInclusive = taxExcl + tax;
      if (Math.abs(expectedInclusive - parseFloat(taxInclusiveAmount)) > 0.02) {
        errors.push(
          `TaxInclusiveAmount (${parseFloat(taxInclusiveAmount).toFixed(2)}) does not equal ` +
          `TaxExclusiveAmount + TaxAmount (${expectedInclusive.toFixed(2)}).`
        );
      }
    }
  }

  if (taxInclusiveAmount === null) {
    errors.push('Missing TaxInclusiveAmount.');
  }

  if (taxAmount === null) {
    errors.push('Missing TaxAmount (total VAT).');
  } else {
    const tax = parseFloat(taxAmount);
    if (tax < 0) {
      errors.push('TaxAmount must not be negative.');
    }
  }

  if (payableAmount === null) {
    errors.push('Missing PayableAmount.');
  } else {
    const payable = parseFloat(payableAmount);
    if (payable < 0) {
      errors.push('PayableAmount must not be negative.');
    }
    if (taxInclusiveAmount !== null && Math.abs(payable - parseFloat(taxInclusiveAmount)) > 0.02) {
      warnings.push(
        `PayableAmount (${payable.toFixed(2)}) differs from TaxInclusiveAmount (${parseFloat(taxInclusiveAmount).toFixed(2)}). This may indicate allowances or charges.`
      );
    }
  }

  // ── 6. Currency code validation ─────────────────────────────────────

  const currencyMatches = xml.matchAll(/<cbc:DocumentCurrencyCode[^>]*>([^<]+)/g);
  const currencyCodes = new Set<string>();
  for (const match of currencyMatches) {
    const code = match[1].trim();
    currencyCodes.add(code);
    if (!VALID_CURRENCY_CODES.has(code)) {
      errors.push(`Invalid currency code "${code}". Must be a valid ISO 4217 code.`);
    }
  }

  if (currencyCodes.size === 0) {
    errors.push('Missing DocumentCurrencyCode.');
  } else if (currencyCodes.size > 1) {
    warnings.push('Multiple currency codes detected. Peppol BIS Billing 3.0 supports a single currency.');
  }

  // ── 7. VAT category code validation ─────────────────────────────────
  //
  // Peppol BIS 3 / EN 16931 uses single-letter codes (S, Z, AE, E, K, G, O).
  // OIOUBL 2.1 uses full words (StandardRated, ZeroRated, ExemptFromTax,
  // ReverseCharge, ConditionalExemptFromTax, FreeExportItemTax,
  // OutsideScopeTax) — see urn:oioubl:codelist:taxcategoryid-1.1.
  //
  // Format-aware: scan for the appropriate codelist form, and only warn
  // when the format-appropriate codes are absent.
  const OIOUBL_TAX_CATEGORY_IDS = new Set([
    'StandardRated', 'ZeroRated', 'ExemptFromTax', 'ReverseCharge',
    'ConditionalExemptFromTax', 'FreeExportItemTax', 'OutsideScopeTax',
  ]);
  const vatCategoryMatches = xml.matchAll(/cbc:ID[^>]*>([^<]*)<\/cbc:ID/g);
  const vatCategories: string[] = [];
  const oioublTaxCategories: string[] = [];
  for (const match of vatCategoryMatches) {
    const code = match[1].trim();
    // Peppol BIS 3 single/double-letter codes.
    if (/^[A-Z]{1,2}$/.test(code) && !['VAT'].includes(code)) {
      vatCategories.push(code);
      if (!VALID_VAT_CATEGORY_CODES.has(code)) {
        errors.push(`Invalid Peppol BIS 3 VAT category code "${code}". Valid codes: S, Z, AE, K, G, O, E.`);
      }
    }
    // OIOUBL full-word codes.
    if (OIOUBL_TAX_CATEGORY_IDS.has(code)) {
      oioublTaxCategories.push(code);
    }
  }

  if (isOIOUBLFormat) {
    // For OIOUBL: warn if NO OIOUBL full-word tax category codes are found.
    if (oioublTaxCategories.length === 0 && invoiceLineCount > 0) {
      warnings.push(
        'No OIOUBL tax category codes (StandardRated/ZeroRated/etc.) found. ' +
        'OIOUBL 2.1 requires TaxCategory/ID values from urn:oioubl:codelist:taxcategoryid-1.1.'
      );
    }
  } else {
    // For Peppol BIS 3: warn if NO single-letter codes are found.
    if (vatCategories.length === 0 && invoiceLineCount > 0) {
      warnings.push('No VAT category codes found in invoice lines.');
    }
  }

  // ── 8. Payment means validation ─────────────────────────────────────

  const paymentMeansMatch = xml.match(/<cbc:PaymentMeansCode[^>]*>([^<]+)/);
  let meansCode: string | undefined;
  if (paymentMeansMatch) {
    meansCode = paymentMeansMatch[1].trim();
    if (!VALID_PAYMENT_MEANS_CODES.has(meansCode)) {
      errors.push(`Invalid PaymentMeansCode "${meansCode}". Must be a valid UN/ECE 4461 code.`);
    }
  } else if (xml.includes('cac:PaymentMeans')) {
    warnings.push('PaymentMeans element found but PaymentMeansCode is missing.');
  } else {
    warnings.push('No PaymentMeans element found. The invoice may still be valid but payment instructions will be absent.');
  }

  // ── 9. Date format validation ───────────────────────────────────────

  const dateElements = ['cbc:IssueDate', 'cbc:DueDate'];
  for (const element of dateElements) {
    const dateMatch = xml.match(new RegExp(`<${element}[^>]*>([^<]+)</${element}>`));
    if (dateMatch) {
      const dateStr = dateMatch[1].trim();
      if (!ISO_DATE_REGEX.test(dateStr)) {
        errors.push(`${element} "${dateStr}" is not a valid ISO 8601 date (expected YYYY-MM-DD).`);
      }
    }
  }

  // IssueDate is mandatory
  if (!xml.includes('cbc:IssueDate')) {
    errors.push('Missing mandatory IssueDate.');
  }

  // ── 10. ProfileID and CustomizationID ───────────────────────────────

  // Two formats are supported by AlphaFlow's OIOUBL generator:
  //
  //   1. Peppol BIS Billing 3.0 — URN-form CustomizationID
  //      CustomizationID = 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0'
  //      ProfileID      = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0'
  //      Used for cross-border sends via Peppol network.
  //
  //   2. OIOUBL 2.1 — Danish NemHandel format. CustomizationID is a
  //      LITERAL STRING (not a URN).
  //      CustomizationID = 'OIOUBL-2.1'    (per the official Erhvervsstyrelsen
  //                                         reference example at
  //                                         docs/SBD-OIOUBL-Invoice-valid.xml)
  //      ProfileID      = structured object with @schemeID + @schemeAgencyID
  //                       attributes AND a text value (NES Profile 5 URN).
  //                       schemeID = 'urn:oioubl:id:profileid-1.2'
  //                       schemeAgencyID = '320'
  //                       text = 'urn:www.nesubl.eu:profiles:profile5:ver2.0'
  //      Used for Danish-to-Danish sends via NemHandel network.
  //
  // Sproom accepts both formats and uses the CustomizationID to identify
  // the document format. A wrong CustomizationID causes Sproom to return
  // "cannot find format for document" on POST /api/documents.
  const PEPPOL_BIS3_CUSTOMIZATION_ID = 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0';
  const PEPPOL_BIS3_PROFILE_ID = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';
  // As of Task 37, AlphaFlow generates the official 'OIOUBL-2.1' value
  // (per the Erhvervsstyrelsen reference example). The legacy 'OIOUBL-2.02'
  // form is still accepted for backward compat with documents received
  // from third-party senders using the older 2.02 form.
  const OIOUBL_VALID_CUSTOMIZATION_IDS = ['OIOUBL-2.1', 'OIOUBL-2.02'];
  // OIOUBL ProfileID is structured: an element with @schemeID + @schemeAgencyID
  // attributes AND a text value. The schemeID must be one of:
  //   urn:oioubl:id:profileid-1.1, 1.2, 1.3, 1.4, 1.5, 1.6
  // (per Sproom's W-LIB003 schematron rule).
  // AlphaFlow uses schemeID=1.2 with NES Profile 5 Basic Billing:
  //   urn:www.nesubl.eu:profiles:profile5:ver2.0
  // (Invoice + CreditNote only — simplest profile).
  const OIOUBL_PROFILE_SCHEME_IDS = [
    'urn:oioubl:id:profileid-1.1',
    'urn:oioubl:id:profileid-1.2',
    'urn:oioubl:id:profileid-1.3',
    'urn:oioubl:id:profileid-1.4',
    'urn:oioubl:id:profileid-1.5',
    'urn:oioubl:id:profileid-1.6',
  ];

  const customizationMatch = xml.match(/<cbc:CustomizationID[^>]*>([^<]+)<\/cbc:CustomizationID>/);
  if (!customizationMatch) {
    errors.push(
      'Missing CustomizationID. Expected either the Peppol BIS Billing 3.0 compliant variant (' +
      PEPPOL_BIS3_CUSTOMIZATION_ID + ') for Peppol sends, or the OIOUBL 2.1 literal string (' +
      OIOUBL_VALID_CUSTOMIZATION_IDS[0] + ') for NemHandel sends.'
    );
  } else {
    const cid = customizationMatch[1].trim();
    if (cid === 'urn:cen.eu:en16931:2017') {
      errors.push(
        'CustomizationID is the bare EN 16931 base ("urn:cen.eu:en16931:2017"). ' +
        'Peppol BIS Billing 3.0 requires the compliant variant: ' + PEPPOL_BIS3_CUSTOMIZATION_ID + '. ' +
        'Receiving Access Points will reject the bare form.'
      );
    } else if (cid === PEPPOL_BIS3_CUSTOMIZATION_ID) {
      // ✓ Valid Peppol BIS 3 — no warning.
    } else if (OIOUBL_VALID_CUSTOMIZATION_IDS.includes(cid)) {
      // ✓ Valid OIOUBL (either 2.1 or legacy 2.02) — no warning.
    } else {
      warnings.push(
        'CustomizationID "' + cid + '" is not a standard AlphaFlow value. ' +
        'Expected either Peppol BIS 3.0 (' + PEPPOL_BIS3_CUSTOMIZATION_ID + ') or ' +
        'OIOUBL 2.1 (' + OIOUBL_VALID_CUSTOMIZATION_IDS.join(' or ') + '). ' +
        'Sproom may reject the document with "cannot find format for document".'
      );
    }
  }

  // ProfileID check — captures both the @schemeID attribute (if present)
  // AND the element's text value. Sproom's W-LIB003 schematron rule
  // REQUIRES the schemeID attribute on OIOUBL ProfileID elements.
  const profileMatch = xml.match(/<cbc:ProfileID([^>]*)>([^<]+)<\/cbc:ProfileID>/);
  if (!profileMatch) {
    errors.push(
      'Missing ProfileID. Expected either "' + PEPPOL_BIS3_PROFILE_ID +
      '" (Peppol BIS 3, plain string) or a structured OIOUBL ProfileID with ' +
      '@schemeID="urn:oioubl:id:profileid-1.2" + @schemeAgencyID="320" + ' +
      'text="urn:www.nesubl.eu:profiles:profile5:ver2.0" (NES Profile 5).'
    );
  } else {
    const attrs = profileMatch[1] || '';
    const pid = profileMatch[2].trim();

    // Check if this is a Peppol BIS 3 ProfileID (plain URN, no attributes)
    if (pid === PEPPOL_BIS3_PROFILE_ID && !attrs.trim()) {
      // ✓ Valid Peppol BIS 3 ProfileID — no warning.
    } else {
      // OIOUBL ProfileID — must have @schemeID + @schemeAgencyID attributes
      const schemeIdMatch = attrs.match(/schemeID="([^"]+)"/);
      const schemeAgencyMatch = attrs.match(/schemeAgencyID="([^"]+)"/);

      if (!schemeIdMatch) {
        errors.push(
          'ProfileID is missing the @schemeID attribute. Sproom returns ' +
          '"[W-LIB003] Invalid schemeID. Must be one of: ' +
          OIOUBL_PROFILE_SCHEME_IDS.join(', ') + '". ' +
          'AlphaFlow uses schemeID="urn:oioubl:id:profileid-1.2" for NES Profile 5.'
        );
      } else if (!OIOUBL_PROFILE_SCHEME_IDS.includes(schemeIdMatch[1])) {
        warnings.push(
          'ProfileID @schemeID="' + schemeIdMatch[1] + '" is not a standard OIOUBL value. ' +
          'Must be one of: ' + OIOUBL_PROFILE_SCHEME_IDS.join(', ') + '.'
        );
      }

      if (!schemeAgencyMatch) {
        warnings.push(
          'ProfileID is missing the @schemeAgencyID attribute. Expected "320" (Danish Business Authority).'
        );
      } else if (schemeAgencyMatch[1] !== '320') {
        warnings.push(
          'ProfileID @schemeAgencyID="' + schemeAgencyMatch[1] + '" is not "320" (Danish Business Authority).'
        );
      }

      // Check the profile value itself (NES Profile 5 = urn:www.nesubl.eu:profiles:profile5:ver2.0)
      if (schemeIdMatch && schemeIdMatch[1] === 'urn:oioubl:id:profileid-1.2' &&
          pid !== 'urn:www.nesubl.eu:profiles:profile5:ver2.0') {
        warnings.push(
          'ProfileID value "' + pid + '" with schemeID=1.2 is not the standard NES Profile 5 ' +
          '("urn:www.nesubl.eu:profiles:profile5:ver2.0").'
        );
      }
    }
  }

  // ── 10a. InvoiceTypeCode ────────────────────────────────────────────
  //
  // For OIOUBL <Invoice> documents: InvoiceTypeCode is REQUIRED (one of
  // 380, 381, 384, 389). Its absence is a validation error.
  //
  // For OIOUBL <CreditNote> documents: InvoiceTypeCode is OMITTED entirely
  // (Task 43 — OIOUBL credit notes are a separate document type with no
  // InvoiceTypeCode element; emitting InvoiceTypeCode=381 on a CreditNote
  // triggers Sproom's [F-INV011] "Invalid InvoiceTypeCode" schematron
  // rejection). Its absence on a CreditNote root is correct, NOT an error.
  //
  // For Peppol BIS 3 documents: InvoiceTypeCode is REQUIRED (one of
  // 380, 381, ...) — Peppol BIS 3 has no separate CreditNote document
  // type; credit notes are <Invoice> documents with InvoiceTypeCode=381.
  const invoiceTypeMatch = xml.match(/<cbc:InvoiceTypeCode[^>]*>([^<]+)/);
  if (!invoiceTypeMatch) {
    if (isCreditNoteRoot) {
      // OK — OIOUBL CreditNotes have no InvoiceTypeCode (Task 43).
    } else {
      errors.push('Missing InvoiceTypeCode. Value 380 (Commercial invoice) is expected.');
    }
  } else {
    const typeCode = invoiceTypeMatch[1].trim();
    if (typeCode !== '380' && typeCode !== '381' && typeCode !== '384' && typeCode !== '389') {
      warnings.push(`InvoiceTypeCode "${typeCode}" is not standard. Expected 380 (Commercial invoice), 381 (Credit note), 384 (Corrected invoice), or 389 (Self-billed invoice).`);
    }
    // Extra warning: InvoiceTypeCode present on a CreditNote root — Sproom
    // would reject this with [F-INV011]. Recommend removing the element.
    if (isCreditNoteRoot) {
      warnings.push(
        'InvoiceTypeCode is present on a <CreditNote> root element. ' +
        'OIOUBL 2.1 credit notes must NOT have an InvoiceTypeCode — Sproom ' +
        'rejects it with [F-INV011] "Invalid InvoiceTypeCode" because 381 ' +
        'is not in the urn:oioubl:codelist:invoicetypecode-1.1 codelist.'
      );
    }
  }

  // ── 10b. Peppol BIS 3.0 DK-R rules (Danish subset) ────────────────
  // Source: Erhvervsstyrelsen PEPPOL_DK_CIUS v1.17.0 (2026-08-03)
  // These are the active DK-R rules enforced by the Danish CIUS schematron.
  // See: https://docs.peppol.eu/poacc/billing/3.0/rules/ubl-peppol/

  // DK-R-002: Seller Danish CVR required for Danish B2B invoices
  // (checked below in the NemHandel section — supplier EndpointID scheme=0184)

  // DK-R-005/006: Payment means code must be in the allowed Danish set
  // Reuse the paymentMeansMatch from section 7 (line ~258) — it's already parsed.
  // The meansCode variable holds the PaymentMeansCode value.
  if (typeof meansCode !== 'undefined') {
    const ALLOWED_DK_PAYMENT_MEANS = ['1', '10', '31', '42', '48', '49', '50', '58', '59', '93', '97'];
    if (!ALLOWED_DK_PAYMENT_MEANS.includes(meansCode)) {
      errors.push(
        `DK-R-005: PaymentMeansCode "${meansCode}" is not in the Danish allowed set ` +
        `(${ALLOWED_DK_PAYMENT_MEANS.join(', ')}). ` +
        `The Danish CIUS rejects this code (e.g. '30' is not allowed for Danish suppliers — use '42' for payment to bank account).`
      );
    }
  }

  // DK-R-016: CreditNote PayableAmount must not be negative.
  // Applies to BOTH OIOUBL CreditNote root documents AND Peppol BIS 3
  // <Invoice> documents with InvoiceTypeCode=381.
  const typeCodeForTotal = invoiceTypeMatch ? invoiceTypeMatch[1].trim() : '';
  const isCreditNoteForTotalCheck = isCreditNoteRoot || typeCodeForTotal === '381';
  if (isCreditNoteForTotalCheck) {
    const payableMatch = xml.match(/<cbc:PayableAmount[^>]*>([^<]+)<\/cbc:PayableAmount>/);
    if (payableMatch) {
      const payable = parseFloat(payableMatch[1]);
      if (!isNaN(payable) && payable < 0) {
        errors.push(
          'DK-R-016: CreditNote PayableAmount is negative (' + payable.toFixed(2) + '). ' +
          'Danish CIUS requires CreditNote totals to be non-negative.'
        );
      }
    }
  }

  // PEPPOL-EN16931-R003: a buyer reference (cbc:BuyerReference) OR a
  // purchase order reference (cac:OrderReference) MUST be provided.
  if (!xml.includes('cbc:BuyerReference') && !xml.includes('cac:OrderReference')) {
    errors.push(
      'PEPPOL-EN16931-R003: A buyer reference (cbc:BuyerReference) or purchase order reference (cac:OrderReference) MUST be provided.'
    );
  }

  // DK-R-014 (Peppol BIS 3 only): for Danish suppliers using the Peppol
  // BIS 3 format, PartyLegalEntity/CompanyID in AccountingSupplierParty
  // MUST specify schemeID="0184" (DK CVR ISO 6523 ICD).
  //
  // For OIOUBL 2.1, the equivalent uses schemeID="DK:CVR" (the OIOUBL
  // scheme ID — see docs/SBD-OIOUBL-Invoice-valid.xml line 78). The DK-R
  // rules don't apply to OIOUBL; this check is therefore format-aware.
  // Scope the regex to the supplier's PartyLegalEntity (which comes after
  // PartyTaxScheme, so the non-greedy match lands on the right CompanyID).
  const supplierLegalEntityCompanyID = xml.match(/cac:AccountingSupplierParty[\s\S]*?<cac:PartyLegalEntity[\s\S]*?<cbc:CompanyID([^>]*)>/);
  if (supplierLegalEntityCompanyID && !isOIOUBLFormat) {
    const companyIDAttrs = supplierLegalEntityCompanyID[1];
    if (!/\bschemeID="0184"/.test(companyIDAttrs)) {
      errors.push(
        'DK-R-014: Supplier PartyLegalEntity/CompanyID must specify schemeID="0184" (DK CVR-number) for Danish suppliers.'
      );
    }
  }

  // ── 10b. NemHandel eDelivery checks ────────────────────────────────

  // NemHandel eDelivery requires the receiving AP to perform schema
  // validation as part of AS4 transmission. Pre-check common issues
  // that would cause the receiving AP to reject the invoice.

  // Check that supplier endpoint ID uses the correct scheme.
  // Peppol BIS 3: scheme="0184" (ISO 6523 ICD for Danish CVR).
  // OIOUBL 2.1:   scheme="DK:CVR" (OIOUBL scheme ID, per the official
  //               Erhvervsstyrelsen example).
  // The check is format-aware so we don't issue a false warning for valid
  // OIOUBL documents that use "DK:CVR".
  const supplierEndpointScheme = xml.match(/cac:AccountingSupplierParty[\s\S]*?cbc:EndpointID[^>]*@schemeID="([^"]+)"/);
  if (supplierEndpointScheme) {
    const expected = isOIOUBLFormat ? 'DK:CVR' : '0184';
    if (supplierEndpointScheme[1] !== expected) {
      warnings.push(
        `Supplier EndpointID scheme is "${supplierEndpointScheme[1]}" — ` +
        (isOIOUBLFormat
          ? 'OIOUBL 2.1 typically uses scheme "DK:CVR" (Danish CVR).'
          : 'Peppol BIS 3 typically uses scheme "0184" (Danish CVR).')
      );
    }
  }

  // Check that customer endpoint ID uses the correct scheme (format-aware).
  const customerEndpointScheme = xml.match(/cac:AccountingCustomerParty[\s\S]*?cbc:EndpointID[^>]*@schemeID="([^"]+)"/);
  if (customerEndpointScheme) {
    const expected = isOIOUBLFormat ? 'DK:CVR' : '0184';
    if (customerEndpointScheme[1] !== expected) {
      warnings.push(
        `Customer EndpointID scheme is "${customerEndpointScheme[1]}" — ` +
        (isOIOUBLFormat
          ? 'OIOUBL 2.1 typically uses scheme "DK:CVR" (Danish CVR).'
          : 'Peppol BIS 3 typically uses scheme "0184" (Danish CVR).')
      );
    }
  }

  // Warn about OIOUBL 3.0 forthcoming changes
  if (xml.includes('urn:oioubl:invoice:1.0') || xml.includes('urn:oioubl:creditnote:1.0')) {
    warnings.push(
      'OIOUBL 1.0 profiles detected. OIOUBL 3.0 is forthcoming with updated profiles and choreographies. Current profiles remain valid until OIOUBL 3.0 is released.'
    );
  }

  // ── 11. Invoice ID ──────────────────────────────────────────────────

  const invoiceIdMatch = xml.match(/<cbc:ID[^>]*>([^<]+)<\/cbc:ID>/);
  if (!invoiceIdMatch) {
    errors.push('Missing Invoice ID (cbc:ID).');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ── Helper functions ─────────────────────────────────────────────────────

/**
 * Extract the text content of the first occurrence of a nested element.
 * Works for simple cases where the target element appears once within the parent scope.
 */
function extractElement(xml: string, _parentTag: string, targetTag: string): string | null {
  const match = xml.match(new RegExp(`<${escapeRegex(targetTag)}[^>]*>([^<]+)</${escapeRegex(targetTag)}>`, 's'));
  return match ? match[1].trim() : null;
}

/**
 * Extract the text content of the Nth occurrence of an element.
 */
function extractNthElement(xml: string, tag: string, index: number): string | null {
  const regex = new RegExp(`<${escapeRegex(tag)}[^>]*>([^<]+)</${escapeRegex(tag)}>`, 'g');
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    if (count === index) {
      return match[1].trim();
    }
    count++;
  }
  return null;
}

/**
 * Extract the first matching numeric value for an element.
 */
function extractFirstValue(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${escapeRegex(tag)}[^>]*>([^<]+)</${escapeRegex(tag)}>`, 's'));
  return match ? match[1].trim() : null;
}

/**
 * Extract all matching text values for an element.
 */
function extractAllValues(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${escapeRegex(tag)}[^>]*>([^<]+)</${escapeRegex(tag)}>`, 'g');
  const values: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    values.push(match[1].trim());
  }
  return values;
}

/**
 * Count occurrences of a specific tag in the XML.
 */
function countOccurrences(xml: string, tag: string): number {
  const regex = new RegExp(`<${escapeRegex(tag)}[\\s>]`, 'g');
  return (xml.match(regex) || []).length;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
