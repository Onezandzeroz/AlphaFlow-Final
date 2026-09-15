import { create } from 'xmlbuilder2';

/**
 * OIOUBL XML Generator for Danish Peppol BIS
 * Generates valid OIOUBL Invoice XML for e-invoicing
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
     */
    endpointScheme?: string;
    name: string;
    streetAddress?: string;
    city?: string;
    postalCode?: string;
    country?: string;
    vatNumber?: string;
    contactEmail?: string;
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

/**
 * Generate tax subtotals grouped by VAT rate
 */
function generateTaxSubtotals(data: OIOUBLInvoiceData): Record<string, unknown>[] | Record<string, unknown> {
  // Group lines by VAT rate + category code
  const vatGroups = new Map<string, { taxable: number; tax: number; percent: number; code: string }>();
  for (const line of data.lines) {
    const key = `${line.vatPercent}-${line.vatCategoryCode}`;
    const lineAmount = Number(line.quantity) * Number(line.unitPrice);
    const vatAmount = lineAmount * Number(line.vatPercent) / 100;
    const group = vatGroups.get(key) || { taxable: 0, tax: 0, percent: line.vatPercent, code: line.vatCategoryCode };
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
      'cbc:ID': group.code,
      'cbc:Percent': group.percent.toString(),
      'cac:TaxScheme': {
        'cbc:ID': 'VAT',
      },
    },
  }));

  // If only one group, return it directly (not as array)
  return subtotals.length === 1 ? subtotals[0] : subtotals;
}

/**
 * Generate OIOUBL Invoice XML string
 */
export function generateOIOUBL(data: OIOUBLInvoiceData): string {
  const invoice = {
    Invoice: {
      '@xmlns': 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
      '@xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
      '@xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
      
      // Document identification
      // CustomizationID: Peppol BIS Billing 3.0 compliant variant (EN 16931 + Peppol extension).
      // The bare 'urn:cen.eu:en16931:2017' is the EN 16931 base — receiving Access Points
      // may reject it. The compliant variant is required for Peppol/NemHandel eDelivery.
      // See: https://docs.peppol.eu/poacc/billing/3.0/rules/ubl-peppol/
      'cbc:UBLVersionID': '2.1',
      'cbc:CustomizationID': 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0',
      'cbc:ProfileID': 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
      'cbc:ID': data.invoiceId,
      'cbc:IssueDate': data.issueDate,

      // DueDate MUST come right after IssueDate per the UBL 2.1 schema
      // sequence (position 8, before DocumentCurrencyCode at position 10).
      // Emitting it AFTER DocumentCurrencyCode causes Sproom's XSD validation
      // to reject the document: "invalid child element 'DueDate' ... expected:
      // TaxCurrencyCode, PricingCurrencyCode, ...". Not emitted for credit
      // notes (381) — they have no due date.
      ...(data.dueDate && data.invoiceTypeCode !== '381' && { 'cbc:DueDate': data.dueDate }),

      // InvoiceTypeCode is an OIOUBL extension (the UBL 2.1 / Peppol BIS 3
      // XSD lax-allows it — sequence-validated known elements skip past it,
      // so its position relative to DueDate is not sequence-critical).
      'cbc:InvoiceTypeCode': data.invoiceTypeCode || '380', // 380=Commercial invoice, 381=Credit note
      'cbc:DocumentCurrencyCode': data.currencyCode,

      // PEPPOL-EN16931-R003 requires a buyer reference (cbc:BuyerReference)
      // OR a purchase order reference (cac:OrderReference). The Invoice
      // model has no explicit PO/buyer-reference field, so we emit a
      // BuyerReference using the customer's identifier (CVR) — the buyer's
      // identifier serves as a routing reference and satisfies R003. Wire
      // data.buyerReference to a real field once the Invoice model has one.
      // UBL 2.1 position: BuyerReference (cbc, ~pos 18) comes after
      // DocumentCurrencyCode and before the cac elements (InvoicePeriod /
      // OrderReference / BillingReference / AccountingSupplierParty).
      'cbc:BuyerReference': data.buyerReference || data.customer.id,

      // Credit note: include original invoice reference (BillingReference).
      // Uses the credited invoice's number when known; falls back to the
      // credit note's own ID for freestanding credit notes.
      ...(data.invoiceTypeCode === '381' && {
        'cac:BillingReference': {
          'cbc:InvoiceDocumentReference': {
            'cbc:ID': data.originalInvoiceNumber || data.invoiceId,
          },
        },
      }),
      
      // Supplier/Seller Party
      'cac:AccountingSupplierParty': {
        'cac:Party': {
          'cbc:EndpointID': {
            '@schemeID': '0184', // CVR number scheme for Denmark
            '#': data.supplier.id,
          },
          'cac:PartyIdentification': {
            'cbc:ID': {
              '@schemeID': '0184',
              '#': data.supplier.id,
            },
          },
          'cac:PartyName': {
            'cbc:Name': data.supplier.name,
          },
          'cac:PostalAddress': {
            'cbc:StreetName': data.supplier.streetAddress || 'Unknown',
            'cbc:CityName': data.supplier.city || 'Unknown',
            'cbc:PostalZone': data.supplier.postalCode || '0000',
            'cac:Country': {
              'cbc:IdentificationCode': data.supplier.country || 'DK',
            },
          },
          'cac:PartyTaxScheme': {
            'cbc:CompanyID': data.supplier.vatNumber || '',
            'cac:TaxScheme': {
              'cbc:ID': 'VAT',
            },
          },
          'cac:PartyLegalEntity': {
            'cbc:RegistrationName': data.supplier.name,
            // DK-R-014: for Danish suppliers, PartyLegalEntity/CompanyID
            // MUST specify schemeID="0184" (DK CVR). The value is the
            // bare 8-digit CVR (data.supplier.id) — NOT the DK-prefixed
            // vatNumber (which is correct for PartyTaxScheme/CompanyID below).
            'cbc:CompanyID': {
              '@schemeID': '0184',
              '#': data.supplier.id,
            },
          },
          ...(data.supplier.contactEmail || data.supplier.contactPhone
            ? {
                // UBL 2.1 Contact sequence: ID, Name, Telephone, Telefax,
                // ElectronicMail, Note, OtherCommunication. Telephone MUST
                // come before ElectronicMail — emitting ElectronicMail first
                // caused Sproom's XSD to reject with "invalid child element
                // 'Telephone' ... expected: Note / OtherCommunication".
                'cac:Contact': {
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
      
      // Customer/Buyer Party
      'cac:AccountingCustomerParty': {
        'cac:Party': {
          'cbc:EndpointID': {
            '@schemeID': data.customer.endpointScheme || '0184',
            '#': data.customer.id,
          },
          'cac:PartyIdentification': {
            'cbc:ID': {
              '@schemeID': data.customer.endpointScheme || '0184',
              '#': data.customer.id,
            },
          },
          'cac:PartyName': {
            'cbc:Name': data.customer.name,
          },
          'cac:PostalAddress': {
            'cbc:StreetName': data.customer.streetAddress || 'Unknown',
            'cbc:CityName': data.customer.city || 'Unknown',
            'cbc:PostalZone': data.customer.postalCode || '0000',
            'cac:Country': {
              'cbc:IdentificationCode': data.customer.country || 'DK',
            },
          },
          ...(data.customer.vatNumber
            ? {
                'cac:PartyTaxScheme': {
                  'cbc:CompanyID': data.customer.vatNumber,
                  'cac:TaxScheme': {
                    'cbc:ID': 'VAT',
                  },
                },
              }
            : {}),
          'cac:PartyLegalEntity': {
            'cbc:RegistrationName': data.customer.name,
            // DK-R-014 (supplier) / equivalent for customer: CompanyID with
            // schemeID="0184" + bare CVR (data.customer.id). Conditional on
            // vatNumber being set (i.e. customerCvr present) so the value is
            // always a real CVR here, never the 'CUST-...' fallback.
            ...(data.customer.vatNumber && {
              'cbc:CompanyID': {
                '@schemeID': '0184',
                '#': data.customer.id,
              },
            }),
          },
          ...(data.customer.contactEmail
            ? {
                'cac:Contact': {
                  'cbc:ElectronicMail': data.customer.contactEmail,
                },
              }
            : {}),
        },
      },
      
      // Payment Means
      ...(data.paymentAccountId
        ? {
            'cac:PaymentMeans': {
              // DK-R-005: Danish-allowed PaymentMeansCode set is
              // 1, 10, 31, 42, 48, 49, 50, 58, 59, 93, 97. '30' (Credit
              // transfer, the UN/ECE default) is NOT allowed for Danish
              // suppliers. '42' = "Payment to bank account" (buyer pays
              // into the supplier's bank account) — semantically correct
              // for a standard invoice + DK-R-005 compliant.
              // ('31' = debit transfer / direct debit — wrong for credit transfer.)
              'cbc:PaymentMeansCode': data.paymentMeansCode || '42',
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
      
      // Tax Total
      'cac:TaxTotal': {
        'cbc:TaxAmount': {
          '@currencyID': data.currencyCode,
          '#': data.taxTotal.toFixed(2),
        },
        // Generate TaxSubtotal for each unique VAT rate
        'cac:TaxSubtotal': generateTaxSubtotals(data),
      },
      
      // Legal Monetary Total
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
      
      // Invoice Lines
      'cac:InvoiceLine': data.lines.map((line) => ({
        'cbc:ID': line.id,
        'cbc:InvoicedQuantity': {
          '@unitCode': line.unitCode,
          '#': line.quantity.toString(),
        },
        'cbc:LineExtensionAmount': {
          '@currencyID': data.currencyCode,
          '#': (Number(line.quantity) * Number(line.unitPrice)).toFixed(2),
        },
        'cac:Item': {
          'cbc:Description': line.description,
          'cbc:Name': line.description,
          'cac:ClassifiedTaxCategory': {
            'cbc:ID': line.vatCategoryCode,
            'cbc:Percent': line.vatPercent.toString(),
            'cac:TaxScheme': {
              'cbc:ID': 'VAT',
            },
          },
        },
        'cac:Price': {
          'cbc:PriceAmount': {
            '@currencyID': data.currencyCode,
            '#': line.unitPrice.toFixed(2),
          },
        },
      })),
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
