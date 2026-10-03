/**
 * SAF-T XML Parser
 *
 * Parses a SAF-T Financial DK v2.1 XML file into typed JavaScript objects
 * using fast-xml-parser (already installed in AlphaFlow).
 *
 * Parsing order follows the XSD structure:
 *   1. Header (company info, period, software)
 *   2. MasterFiles (accounts, customers, suppliers, tax table)
 *   3. GeneralLedgerEntries (journal entries with lines)
 *   4. SourceDocuments (optional: sales/purchase invoices)
 *
 * The parser is namespace-agnostic (handles both namespaced and non-namespaced
 * elements) and returns plain objects that the transformer can map to Prisma models.
 */

import { XMLParser } from 'fast-xml-parser';

// ─── Types ────────────────────────────────────────────────────────────

export interface ParsedSaftFile {
  header: ParsedHeader;
  masterFiles: ParsedMasterFiles;
  generalLedgerEntries: ParsedGeneralLedgerEntries;
  sourceDocuments?: ParsedSourceDocuments;
}

export interface ParsedHeader {
  auditFileVersion: string;
  auditFileCountry: string;
  auditFileDateCreated: string;
  softwareCompanyName: string;
  softwareID: string;
  softwareVersion: string;
  company: ParsedCompany;
  defaultCurrencyCode: string;
  selectionStartDate: string;
  selectionEndDate: string;
}

export interface ParsedCompany {
  registrationNumber: string;
  name: string;
  address?: ParsedAddress;
  taxRegistrationNumber?: string;
  bankAccountIBAN?: string;
  email?: string;
  phone?: string;
}

export interface ParsedAddress {
  streetName?: string;
  number?: string;
  city?: string;
  postalCode?: string;
  country?: string;
}

export interface ParsedMasterFiles {
  accounts: ParsedAccount[];
  customers: ParsedContact[];
  suppliers: ParsedContact[];
  taxCodes: ParsedTaxCode[];
}

export interface ParsedAccount {
  accountId: string;
  accountDescription: string;
  standardAccountId?: string;
  accountType: string; // Asset|Liability|Sale|Expense|Other
  openingDebitBalance?: number;
  openingCreditBalance?: number;
  closingDebitBalance?: number;
  closingCreditBalance?: number;
}

export interface ParsedContact {
  id: string; // CustomerID or SupplierID
  registrationNumber?: string;
  name: string;
  address?: ParsedAddress;
  phone?: string;
  email?: string;
  type: 'CUSTOMER' | 'SUPPLIER';
}

export interface ParsedTaxCode {
  taxCode: string;
  standardTaxCode?: string;
  description: string;
  effectiveDate: string;
  taxPercentage?: number;
  country?: string;
}

export interface ParsedGeneralLedgerEntries {
  numberOfEntries: number;
  totalDebit: number;
  totalCredit: number;
  journals: ParsedJournal[];
}

export interface ParsedJournal {
  journalId: string;
  description: string;
  type: string;
  transactions: ParsedTransaction[];
}

export interface ParsedTransaction {
  transactionId: string;
  period: number;
  periodYear: number;
  transactionDate: string;
  description: string;
  systemEntryDate: string;
  glPostingDate: string;
  systemId: string;
  customerId?: string;
  supplierId?: string;
  sourceDocumentId?: string;
  lines: ParsedLine[];
}

export interface ParsedLine {
  recordId?: string;
  accountId: string;
  description?: string;
  debitAmount?: number;
  creditAmount?: number;
  currencyCode?: string;
  currencyAmount?: number;
  exchangeRate?: number;
  taxCode?: string;
  taxAmount?: number;
}

export interface ParsedSourceDocuments {
  salesInvoices: ParsedInvoice[];
  purchaseInvoices: ParsedInvoice[];
}

export interface ParsedInvoice {
  invoiceNo: string;
  customerId?: string;
  supplierId?: string;
  customerName?: string;
  invoiceDate: string;
  invoiceType: string;
  glPostingDate: string;
  transactionId: string;
  lines: ParsedInvoiceLine[];
}

export interface ParsedInvoiceLine {
  lineNumber: string;
  accountId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxCode?: string;
  lineAmount: number;
}

// ─── Parser ───────────────────────────────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: true,
  parseAttributeValue: true,
  trimValues: true,
  isArray: (name) => {
    // Always treat these as arrays (even if single element)
    const arrayElements = new Set([
      'Account', 'Customer', 'Supplier', 'TaxCodeDetails', 'TaxTableEntry',
      'Journal', 'Transaction', 'Line', 'TaxInformation',
      'Invoice', 'Address', 'Contact',
    ]);
    return arrayElements.has(name);
  },
});

/**
 * Parse a SAF-T XML string into typed JavaScript objects.
 */
export function parseSaftXml(xmlContent: string): ParsedSaftFile {
  const parsed = parser.parse(xmlContent);
  const auditFile = parsed.AuditFile || parsed[':AuditFile'] || parsed;

  // ── Header ──
  const header = extractHeader(auditFile.Header || auditFile[':Header']);

  // ── MasterFiles ──
  const masterFiles = extractMasterFiles(auditFile.MasterFiles || auditFile[':MasterFiles']);

  // ── GeneralLedgerEntries ──
  const generalLedgerEntries = extractGeneralLedgerEntries(
    auditFile.GeneralLedgerEntries || auditFile[':GeneralLedgerEntries'],
  );

  // ── SourceDocuments (optional) ──
  const sourceDocuments = extractSourceDocuments(
    auditFile.SourceDocuments || auditFile[':SourceDocuments'],
  );

  return { header, masterFiles, generalLedgerEntries, sourceDocuments };
}

// ─── Extraction helpers ───────────────────────────────────────────────

function val(node: any, key: string): any {
  if (!node) return undefined;
  // Handle namespaced elements
  return node[key] ?? node[`:${key}`] ?? node[`urn:${key}`] ?? undefined;
}

function text(node: any): string | undefined {
  if (node === undefined || node === null) return undefined;
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (node['#text']) return String(node['#text']);
  return undefined;
}

function num(node: any): number | undefined {
  const t = text(node);
  if (t === undefined) return undefined;
  const n = parseFloat(t);
  return isNaN(n) ? undefined : n;
}

function extractHeader(header: any): ParsedHeader {
  const company = val(header, 'Company') || {};
  const address = val(company, 'Address') || {};
  const addressArr = Array.isArray(address) ? address[0] : address;
  const selectionCriteria = val(header, 'SelectionCriteria') || {};

  return {
    auditFileVersion: text(val(header, 'AuditFileVersion')) || '2.1',
    auditFileCountry: text(val(header, 'AuditFileCountry')) || 'DK',
    auditFileDateCreated: text(val(header, 'AuditFileDateCreated')) || '',
    softwareCompanyName: text(val(header, 'SoftwareCompanyName')) || '',
    softwareID: text(val(header, 'SoftwareID')) || '',
    softwareVersion: text(val(header, 'SoftwareVersion')) || '',
    company: {
      registrationNumber: text(val(company, 'RegistrationNumber')) || text(val(company, 'CVR')) || '',
      name: text(val(company, 'Name')) || '',
      address: extractAddress(addressArr),
      taxRegistrationNumber: text(val(val(company, 'TaxRegistration'), 'TaxRegistrationNumber')),
      bankAccountIBAN: text(val(val(company, 'BankAccount'), 'IBANNumber')),
      email: text(val(header, 'EmailAddress')),
      phone: text(val(header, 'TelephoneNumber')),
    },
    defaultCurrencyCode: text(val(header, 'DefaultCurrencyCode')) || 'DKK',
    selectionStartDate: text(val(selectionCriteria, 'SelectionStartDate')) || '',
    selectionEndDate: text(val(selectionCriteria, 'SelectionEndDate')) || '',
  };
}

function extractAddress(addr: any): ParsedAddress | undefined {
  if (!addr) return undefined;
  return {
    streetName: text(val(addr, 'StreetName')),
    number: text(val(addr, 'Number')),
    city: text(val(addr, 'City')),
    postalCode: text(val(addr, 'PostalCode')),
    country: text(val(addr, 'Country')),
  };
}

function extractMasterFiles(mf: any): ParsedMasterFiles {
  const gla = val(mf, 'GeneralLedgerAccounts') || {};
  const accountArr = val(gla, 'Account') || [];
  const accounts = (Array.isArray(accountArr) ? accountArr : [accountArr])
    .filter(Boolean)
    .map(extractAccount);

  const customersNode = val(mf, 'Customers');
  const customers = customersNode ? extractContacts(customersNode, 'CUSTOMER') : [];

  const suppliersNode = val(mf, 'Suppliers');
  const suppliers = suppliersNode ? extractContacts(suppliersNode, 'SUPPLIER') : [];

  const taxTable = val(mf, 'TaxTable') || {};
  const taxTableEntries = val(taxTable, 'TaxTableEntry') || [];
  const entriesArr = Array.isArray(taxTableEntries) ? taxTableEntries : [taxTableEntries];
  const taxCodes: ParsedTaxCode[] = [];
  for (const entry of entriesArr.filter(Boolean)) {
    const details = val(entry, 'TaxCodeDetails') || [];
    const detailsArr = Array.isArray(details) ? details : [details];
    for (const detail of detailsArr.filter(Boolean)) {
      taxCodes.push({
        taxCode: text(val(detail, 'TaxCode')) || '',
        standardTaxCode: text(val(detail, 'StandardTaxCode')),
        description: text(val(detail, 'Description')) || '',
        effectiveDate: text(val(detail, 'EffectiveDate')) || '',
        taxPercentage: num(val(detail, 'TaxPercentage')),
        country: text(val(detail, 'Country')),
      });
    }
  }

  return { accounts, customers, suppliers, taxCodes };
}

function extractAccount(acc: any): ParsedAccount {
  return {
    accountId: text(val(acc, 'AccountID')) || '',
    accountDescription: text(val(acc, 'AccountDescription')) || '',
    standardAccountId: text(val(acc, 'StandardAccountID')),
    accountType: text(val(acc, 'AccountType')) || 'Other',
    openingDebitBalance: num(val(acc, 'OpeningDebitBalance')),
    openingCreditBalance: num(val(acc, 'OpeningCreditBalance')),
    closingDebitBalance: num(val(acc, 'ClosingDebitBalance')),
    closingCreditBalance: num(val(acc, 'ClosingCreditBalance')),
  };
}

function extractContacts(node: any, type: 'CUSTOMER' | 'SUPPLIER'): ParsedContact[] {
  const idKey = type === 'CUSTOMER' ? 'Customer' : 'Supplier';
  const contacts = val(node, idKey) || [];
  const arr = Array.isArray(contacts) ? contacts : [contacts];
  return arr.filter(Boolean).map((c: any) => {
    const id = type === 'CUSTOMER'
      ? text(val(c, 'CustomerID'))
      : text(val(c, 'SupplierID'));
    return {
      id: id || '',
      registrationNumber: text(val(c, 'RegistrationNumber')) || text(val(c, 'CVR')),
      name: text(val(c, 'Name')) || '',
      address: extractAddress(val(c, 'Address')),
      phone: text(val(val(c, 'Contact'), 'Telephone')),
      email: text(val(val(c, 'Contact'), 'Email')),
      type,
    };
  });
}

function extractGeneralLedgerEntries(gle: any): ParsedGeneralLedgerEntries {
  const journals = val(gle, 'Journal') || [];
  const journalsArr = Array.isArray(journals) ? journals : [journals];

  return {
    numberOfEntries: num(val(gle, 'NumberOfEntries')) || 0,
    totalDebit: num(val(gle, 'TotalDebit')) || 0,
    totalCredit: num(val(gle, 'TotalCredit')) || 0,
    journals: journalsArr.filter(Boolean).map(extractJournal),
  };
}

function extractJournal(j: any): ParsedJournal {
  const transactions = val(j, 'Transaction') || [];
  const txArr = Array.isArray(transactions) ? transactions : [transactions];
  return {
    journalId: text(val(j, 'JournalID')) || '',
    description: text(val(j, 'Description')) || '',
    type: text(val(j, 'Type')) || 'GL',
    transactions: txArr.filter(Boolean).map(extractTransaction),
  };
}

function extractTransaction(t: any): ParsedTransaction {
  const lines = val(t, 'Line') || [];
  const linesArr = Array.isArray(lines) ? lines : [lines];

  return {
    transactionId: text(val(t, 'TransactionID')) || '',
    period: num(val(t, 'Period')) || 1,
    periodYear: num(val(t, 'PeriodYear')) || new Date().getFullYear(),
    transactionDate: text(val(t, 'TransactionDate')) || '',
    description: text(val(t, 'Description')) || '',
    systemEntryDate: text(val(t, 'SystemEntryDate')) || '',
    glPostingDate: text(val(t, 'GLPostingDate')) || '',
    systemId: text(val(t, 'SystemID')) || 'import',
    customerId: text(val(t, 'CustomerID')),
    supplierId: text(val(t, 'SupplierId')) || text(val(t, 'SupplierID')),
    sourceDocumentId: text(val(t, 'SourceDocumentID')),
    lines: linesArr.filter(Boolean).map(extractLine),
  };
}

function extractLine(l: any): ParsedLine {
  const debit = val(l, 'DebitAmount');
  const credit = val(l, 'CreditAmount');
  const taxInfo = val(l, 'TaxInformation');
  const taxInfoArr = Array.isArray(taxInfo) ? taxInfo[0] : taxInfo;

  return {
    recordId: text(val(l, 'RecordID')),
    accountId: text(val(l, 'AccountID')) || '',
    description: text(val(l, 'Description')),
    debitAmount: debit ? num(val(debit, 'Amount')) : undefined,
    creditAmount: credit ? num(val(credit, 'Amount')) : undefined,
    currencyCode: debit ? text(val(debit, 'CurrencyCode')) : credit ? text(val(credit, 'CurrencyCode')) : undefined,
    currencyAmount: debit ? num(val(debit, 'CurrencyAmount')) : credit ? num(val(credit, 'CurrencyAmount')) : undefined,
    exchangeRate: debit ? num(val(debit, 'ExchangeRate')) : credit ? num(val(credit, 'ExchangeRate')) : undefined,
    taxCode: taxInfoArr ? text(val(taxInfoArr, 'TaxCode')) : undefined,
    taxAmount: taxInfoArr ? num(val(val(taxInfoArr, 'TaxAmount'), 'Amount')) : undefined,
  };
}

function extractSourceDocuments(sd: any): ParsedSourceDocuments | undefined {
  if (!sd) return undefined;

  const salesInvoicesNode = val(sd, 'SalesInvoices');
  const salesInvoices = salesInvoicesNode ? extractInvoices(salesInvoicesNode, 'sales') : [];

  const purchaseInvoicesNode = val(sd, 'PurchaseInvoices');
  const purchaseInvoices = purchaseInvoicesNode ? extractInvoices(purchaseInvoicesNode, 'purchase') : [];

  return { salesInvoices, purchaseInvoices };
}

function extractInvoices(node: any, kind: 'sales' | 'purchase'): ParsedInvoice[] {
  const invoices = val(node, 'Invoice') || [];
  const arr = Array.isArray(invoices) ? invoices : [invoices];
  return arr.filter(Boolean).map((inv: any) => {
    const customerInfo = val(inv, 'CustomerInfo') || val(inv, 'SupplierInfo') || {};
    const lines = val(inv, 'Line') || [];
    const linesArr = Array.isArray(lines) ? lines : [lines];

    return {
      invoiceNo: text(val(inv, 'InvoiceNo')) || '',
      customerId: kind === 'sales' ? text(val(customerInfo, 'CustomerID')) : undefined,
      supplierId: kind === 'purchase' ? text(val(customerInfo, 'SupplierID')) : undefined,
      customerName: text(val(customerInfo, 'Name')),
      invoiceDate: text(val(inv, 'InvoiceDate')) || '',
      invoiceType: text(val(inv, 'InvoiceType')) || 'Invoice',
      glPostingDate: text(val(inv, 'GLPostingDate')) || '',
      transactionId: text(val(inv, 'TransactionID')) || '',
      lines: linesArr.filter(Boolean).map((l: any) => extractInvoiceLine(l)),
    };
  });
}

function extractInvoiceLine(l: any): ParsedInvoiceLine {
  const taxInfo = val(l, 'TaxInformation');
  const taxInfoArr = Array.isArray(taxInfo) ? taxInfo[0] : taxInfo;

  return {
    lineNumber: text(val(l, 'LineNumber')) || '1',
    accountId: text(val(l, 'AccountID')) || '',
    description: text(val(l, 'Description')) || '',
    quantity: num(val(l, 'Quantity')) || 1,
    unitPrice: num(val(l, 'UnitPrice')) || 0,
    taxCode: taxInfoArr ? text(val(taxInfoArr, 'TaxCode')) : undefined,
    lineAmount: num(val(val(l, 'InvoiceLineAmount'), 'Amount')) || 0,
  };
}
