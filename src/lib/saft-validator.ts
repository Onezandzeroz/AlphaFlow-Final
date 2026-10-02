import { logger } from '@/lib/logger';
import { VALID_VAT_PERCENTAGES } from '@/lib/vat-utils';
// SAF-T Danish Schema Validation Utility
// Validates mandatory elements according to Danish SAF-T Financial DK v2.1
// (Danish_SAF-T_Financial_Schema_v_2_1.xsd, Erhvervsstyrelsen 2026-07-03)

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  summary: {
    totalChecks: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}

export interface ValidationError {
  code: string;
  message: string;
  path: string;
  severity: 'error' | 'warning';
  suggestion?: string;
}

// Mandatory tags for SAF-T Financial DK v2.1
const MANDATORY_HEADER_TAGS = [
  { path: 'AuditFileVersion', description: 'SAF-T version (must be 2.1)' },
  { path: 'AuditFileCountry', description: 'Country code (must be DK)' },
  { path: 'AuditFileDateCreated', description: 'Creation timestamp' },
  { path: 'SoftwareCompanyName', description: 'Software vendor name' },
  { path: 'SoftwareID', description: 'Software identifier' },
  { path: 'CompanyID', description: 'Company identification number (CVR)' },
  { path: 'Company/RegistrationNumber', description: 'Company registration number' },
  { path: 'Company/Name', description: 'Company name' },
];

const MANDATORY_MASTERFILE_TAGS = [
  { path: 'GeneralLedgerAccounts', description: 'Chart of accounts' },
  { path: 'TaxTable', description: 'VAT code definitions (renamed from TaxCodeTable in v2.1)' },
];

// SAF-T v2.1 namespace (urn:StandardAuditFile-Taxation-Financial:DK)
const SAFT_V21_NAMESPACE = 'urn:StandardAuditFile-Taxation-Financial:DK';

// Valid AccountType values per XSD v2.1 (closed enum)
const VALID_ACCOUNT_TYPES = ['Asset', 'Liability', 'Sale', 'Expense', 'Other'];

// VAT code validation for Danish rates — imported from vat-utils (single source of truth)
// const VALID_DANISH_VAT_RATES moved to VALID_VAT_PERCENTAGES in vat-utils.ts

// CVR number format (8 digits, optionally prefixed with DK)
const CVR_PATTERN = /^(DK)?\d{8}$/;

/**
 * Validates a SAF-T XML document structure using regex-based parsing
 * This works in both browser and Node.js environments
 */
export function validateSAFT(xmlContent: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  let totalChecks = 0;
  let passed = 0;

  // Check if XML is empty or null
  if (!xmlContent || xmlContent.trim().length === 0) {
    errors.push({
      code: 'EMPTY_XML',
      message: 'XML content is empty',
      path: 'document',
      severity: 'error',
      suggestion: 'Provide valid XML content',
    });
    return createResult(errors, warnings, totalChecks, passed);
  }

  // 1. Validate root element
  totalChecks++;
  if (!xmlContent.includes('<AuditFile')) {
    errors.push({
      code: 'MISSING_ROOT',
      message: 'Missing root element AuditFile',
      path: 'root',
      severity: 'error',
      suggestion: 'Add <AuditFile> as root element with proper namespace',
    });
  } else {
    passed++;
    
    // Check namespace — must be the official v2.1 namespace
    totalChecks++;
    if (!xmlContent.includes(SAFT_V21_NAMESPACE)) {
      errors.push({
        code: 'INVALID_NAMESPACE',
        message: `Missing or incorrect SAF-T namespace. Must be: ${SAFT_V21_NAMESPACE}`,
        path: 'AuditFile',
        severity: 'error',
        suggestion: `Add xmlns="${SAFT_V21_NAMESPACE}"`,
      });
    } else {
      passed++;
    }

    // Check AuditFileVersion is 2.1
    totalChecks++;
    const versionMatch = xmlContent.match(/<AuditFileVersion>([^<]+)<\/AuditFileVersion>/);
    if (versionMatch && versionMatch[1].trim() !== '2.1') {
      errors.push({
        code: 'INVALID_VERSION',
        message: `AuditFileVersion must be "2.1", found "${versionMatch[1].trim()}"`,
        path: 'Header/AuditFileVersion',
        severity: 'error',
        suggestion: 'Set <AuditFileVersion>2.1</AuditFileVersion>',
      });
    } else if (versionMatch) {
      passed++;
    }
  }

  // 2. Validate Header section
  totalChecks++;
  if (!xmlContent.includes('<Header>')) {
    errors.push({
      code: 'MISSING_HEADER',
      message: 'Missing mandatory Header section',
      path: 'AuditFile',
      severity: 'error',
      suggestion: 'Add <Header> element with required company and period information',
    });
  } else {
    // Extract header content
    const headerMatch = xmlContent.match(/<Header>([\s\S]*?)<\/Header>/);
    const headerContent = headerMatch ? headerMatch[1] : '';

    MANDATORY_HEADER_TAGS.forEach((tag) => {
      totalChecks++;
      const tagPattern = new RegExp(`<${tag.path.includes('/') ? tag.path.split('/').pop() : tag.path}>([^<]*)</${tag.path.split('/').pop()}>`, 'i');
      if (!tagPattern.test(headerContent) && !tagPattern.test(xmlContent)) {
        errors.push({
          code: 'MISSING_HEADER_TAG',
          message: `Missing mandatory header field: ${tag.description}`,
          path: `Header/${tag.path}`,
          severity: 'error',
          suggestion: `Add <${tag.path.split('/').pop()}> element`,
        });
      } else {
        passed++;
      }
    });

    // Validate AuditFileVersion
    totalChecks++;
    const versionMatch = xmlContent.match(/<AuditFileVersion>([^<]*)<\/AuditFileVersion>/);
    if (versionMatch) {
      const version = versionMatch[1].trim();
      if (version !== '1.0') {
        warnings.push({
          code: 'VERSION_WARNING',
          message: `SAF-T version ${version} may not be compatible with Danish requirements`,
          path: 'Header/AuditFileVersion',
          severity: 'warning',
          suggestion: 'Use version 1.0 for Danish SAF-T compliance',
        });
      } else {
        passed++;
      }
    }

    // Validate AuditFileCountry
    totalChecks++;
    const countryMatch = xmlContent.match(/<AuditFileCountry>([^<]*)<\/AuditFileCountry>/);
    if (countryMatch) {
      const country = countryMatch[1].trim();
      if (country !== 'DK') {
        errors.push({
          code: 'INVALID_COUNTRY',
          message: `Country code ${country} is not valid for Danish SAF-T`,
          path: 'Header/AuditFileCountry',
          severity: 'error',
          suggestion: 'Use "DK" for Danish SAF-T files',
        });
      } else {
        passed++;
      }
    }

    // Validate CompanyID (CVR format)
    totalChecks++;
    const companyIdMatch = xmlContent.match(/<CompanyID>([^<]*)<\/CompanyID>/);
    if (companyIdMatch) {
      const companyId = companyIdMatch[1].trim();
      if (!CVR_PATTERN.test(companyId)) {
        warnings.push({
          code: 'CVR_FORMAT_WARNING',
          message: 'CompanyID does not match Danish CVR format (8 digits, optionally prefixed with DK)',
          path: 'Header/CompanyID',
          severity: 'warning',
          suggestion: 'Use format DK12345678 or 12345678',
        });
      } else {
        passed++;
      }
    }

    // Validate period dates
    totalChecks++;
    const periodStartMatch = xmlContent.match(/<PeriodStart>([^<]*)<\/PeriodStart>/);
    const periodEndMatch = xmlContent.match(/<PeriodEnd>([^<]*)<\/PeriodEnd>/);
    if (periodStartMatch && periodEndMatch) {
      const startDate = new Date(periodStartMatch[1].trim());
      const endDate = new Date(periodEndMatch[1].trim());
      if (startDate > endDate) {
        errors.push({
          code: 'INVALID_PERIOD',
          message: 'Period start date is after end date',
          path: 'Header/SelectionCriteria',
          severity: 'error',
          suggestion: 'Ensure period start date is before or equal to end date',
        });
      } else {
        passed++;
      }
    }
  }

  // 3. Validate MasterFiles section
  totalChecks++;
  if (!xmlContent.includes('<MasterFiles>')) {
    errors.push({
      code: 'MISSING_MASTERFILES',
      message: 'Missing mandatory MasterFiles section',
      path: 'AuditFile',
      severity: 'error',
      suggestion: 'Add <MasterFiles> element with chart of accounts and tax codes',
    });
  } else {
    MANDATORY_MASTERFILE_TAGS.forEach((tag) => {
      totalChecks++;
      if (!xmlContent.includes(`<${tag.path}>`)) {
        errors.push({
          code: 'MISSING_MASTERFILE_TAG',
          message: `Missing mandatory master file: ${tag.description}`,
          path: `MasterFiles/${tag.path}`,
          severity: 'error',
          suggestion: `Add <${tag.path}> element`,
        });
      } else {
        passed++;
      }
    });

    // Validate at least one account exists
    totalChecks++;
    const accountMatches = xmlContent.match(/<Account>/g);
    if (!accountMatches || accountMatches.length === 0) {
      errors.push({
        code: 'NO_ACCOUNTS',
        message: 'No accounts defined in GeneralLedgerAccounts',
        path: 'MasterFiles/GeneralLedgerAccounts',
        severity: 'error',
        suggestion: 'Add at least one account entry',
      });
    } else {
      passed++;
    }

    // Validate tax codes — v2.1 uses <TaxTable><TaxCodeDetails><TaxCode>
    totalChecks++;
    const taxCodeMatches = xmlContent.match(/<TaxCode>[^<]*<\/TaxCode>/g);
    if (!taxCodeMatches || taxCodeMatches.length === 0) {
      warnings.push({
        code: 'NO_TAX_CODES',
        message: 'No tax codes defined in TaxTable',
        path: 'MasterFiles/TaxTable',
        severity: 'warning',
        suggestion: 'Add TaxCodeDetails entries for VAT rates used in transactions',
      });
    } else {
      passed++;
    }

    // Validate AccountType values match the v2.1 XSD enum
    totalChecks++;
    const accountTypeMatches = xmlContent.match(/<AccountType>([^<]*)<\/AccountType>/g);
    if (accountTypeMatches) {
      const invalidTypes: string[] = [];
      for (const match of accountTypeMatches) {
        const value = match.replace(/<\/?AccountType>/g, '').trim();
        if (!VALID_ACCOUNT_TYPES.includes(value)) {
          invalidTypes.push(value);
        }
      }
      if (invalidTypes.length > 0) {
        errors.push({
          code: 'INVALID_ACCOUNT_TYPE',
          message: `Invalid AccountType value(s): ${invalidTypes.join(', ')}. Valid values: ${VALID_ACCOUNT_TYPES.join(', ')}`,
          path: 'MasterFiles/GeneralLedgerAccounts/Account/AccountType',
          severity: 'error',
          suggestion: `Use one of: ${VALID_ACCOUNT_TYPES.join(', ')}`,
        });
      } else {
        passed++;
      }
    }
  }

  // 4. Validate GeneralLedgerEntries totals (v2.1: NumberOfEntries/TotalDebit/TotalCredit are direct children)
  totalChecks++;
  if (!xmlContent.includes('<GeneralLedgerEntries>')) {
    errors.push({
      code: 'MISSING_GENERAL_LEDGER_ENTRIES',
      message: 'Missing mandatory GeneralLedgerEntries section',
      path: 'AuditFile',
      severity: 'error',
      suggestion: 'Add <GeneralLedgerEntries> with NumberOfEntries, TotalDebit, TotalCredit',
    });
  } else {
    passed++;

    // Validate debit/credit balance in GeneralLedgerEntries
    totalChecks++;
    const totalDebitMatch = xmlContent.match(/<TotalDebit>([^<]*)<\/TotalDebit>/);
    const totalCreditMatch = xmlContent.match(/<TotalCredit>([^<]*)<\/TotalCredit>/);
    if (totalDebitMatch && totalCreditMatch) {
      const totalDebit = parseFloat(totalDebitMatch[1]);
      const totalCredit = parseFloat(totalCreditMatch[1]);
      if (Math.abs(totalDebit - totalCredit) > 0.02) {
        errors.push({
          code: 'BALANCE_MISMATCH',
          message: `Total debit (${totalDebit.toFixed(2)}) does not equal total credit (${totalCredit.toFixed(2)}). Difference: ${(totalDebit - totalCredit).toFixed(2)}`,
          path: 'GeneralLedgerEntries',
          severity: 'error',
          suggestion: 'All journal entries must be balanced (debits = credits)',
        });
      } else {
        passed++;
      }
    }
  }

  // 5. Check for transactions
  totalChecks++;
  const transactionMatches = xmlContent.match(/<Transaction>/g);
  if (transactionMatches && transactionMatches.length > 0) {
    passed++;
  }

  // 6. Validate Customers section (should have real contacts, not just placeholders)
  totalChecks++;
  const customerMatches = xmlContent.match(/<Customer>/g);
  if (!customerMatches || customerMatches.length === 0) {
    warnings.push({
      code: 'NO_CUSTOMERS',
      message: 'No customers defined in MasterFiles/Customers',
      path: 'MasterFiles/Customers',
      severity: 'warning',
      suggestion: 'Add customer records for all contacts used in invoices',
    });
  } else {
    // Check for placeholder customers
    totalChecks++;
    const hasPlaceholderCustomer = xmlContent.includes('General Customers');
    if (hasPlaceholderCustomer) {
      warnings.push({
        code: 'PLACEHOLDER_CUSTOMER',
        message: 'Placeholder customer "General Customers" detected. Consider using real contact data.',
        path: 'MasterFiles/Customers',
        severity: 'warning',
        suggestion: 'Use actual contact records from the Contacts module instead of placeholders',
      });
    } else {
      passed++;
    }
  }

  // 7. Validate Suppliers section (should exist with company info)
  totalChecks++;
  if (!xmlContent.includes('<Suppliers>') && !xmlContent.includes('<Supplier>')) {
    warnings.push({
      code: 'NO_SUPPLIERS',
      message: 'No Suppliers section found in MasterFiles',
      path: 'MasterFiles/Suppliers',
      severity: 'warning',
      suggestion: 'Add supplier records for vendor contacts',
    });
  } else {
    passed++;
  }

  // 8. Validate TaxRegistrationNumber
  totalChecks++;
  const taxRegMatch = xmlContent.match(/<TaxRegistrationNumber>([^<]*)<\/TaxRegistrationNumber>/);
  if (taxRegMatch) {
    const taxReg = taxRegMatch[1].trim();
    if (!CVR_PATTERN.test(taxReg)) {
      warnings.push({
        code: 'TAX_REG_FORMAT',
        message: 'TaxRegistrationNumber does not match CVR format (8 digits)',
        path: 'Header/TaxRegistrationNumber',
        severity: 'warning',
        suggestion: 'Use format DK12345678 or 12345678',
      });
    } else {
      passed++;
    }
  }

  // 9. Validate SoftwareVersion
  totalChecks++;
  if (!xmlContent.includes('<SoftwareVersion>')) {
    warnings.push({
      code: 'MISSING_SOFTWARE_VERSION',
      message: 'SoftwareVersion element is missing',
      path: 'Header/SoftwareVersion',
      severity: 'warning',
      suggestion: 'Add <SoftwareVersion> element (e.g., "1.0.0")',
    });
  } else {
    passed++;
  }

  // 10. Validate XML declaration
  totalChecks++;
  if (!xmlContent.startsWith('<?xml')) {
    warnings.push({
      code: 'MISSING_XML_DECLARATION',
      message: 'XML declaration is missing (should start with <?xml version="1.0"?>)',
      path: 'document',
      severity: 'warning',
      suggestion: 'Ensure XML starts with proper declaration',
    });
  } else {
    passed++;
  }

  // 11. Validate date format consistency (ISO 8601)
  totalChecks++;
  const isoDatePattern = /\d{4}-\d{2}-\d{2}/;
  const dateFields = xmlContent.match(/<(?:TransactionDate|InvoiceDate|PeriodStart|PeriodEnd|AuditFileDateCreated)>([^<]+)<\/[^>]+>/g);
  if (dateFields) {
    const invalidDates = dateFields.filter(f => !isoDatePattern.test(f));
    if (invalidDates.length > 0) {
      errors.push({
        code: 'INVALID_DATE_FORMAT',
        message: `${invalidDates.length} date field(s) do not use ISO 8601 format (YYYY-MM-DD)`,
        path: 'multiple',
        severity: 'error',
        suggestion: 'All dates must be in YYYY-MM-DD format',
      });
    } else {
      passed++;
    }
  }

  // 12. Validate GeneralLedgerEntries structure
  totalChecks++;
  if (!xmlContent.includes('<GeneralLedgerEntries>') && xmlContent.includes('<Transaction>')) {
    errors.push({
      code: 'MISSING_GL_ENTRIES',
      message: 'Transactions found but GeneralLedgerEntries wrapper is missing',
      path: 'AuditFile',
      severity: 'error',
      suggestion: 'Wrap all transactions in <GeneralLedgerEntries><Journal>...</Journal></GeneralLedgerEntries>',
    });
  } else if (xmlContent.includes('<GeneralLedgerEntries>')) {
    passed++;
  }

  // ── Referential integrity checks (XSD xs:key / xs:keyref constraints) ──
  // These mirror the 13 xs:key + ~30 xs:keyref constraints in the official
  // Danish_SAF-T_Financial_Schema_v_2_1.xsd. A regex-based validator can't
  // fully replicate XSD validation, but it catches the most common violations.

  // 13. Collect all defined AccountIDs from MasterFiles
  const masterFilesMatch = xmlContent.match(/<MasterFiles>([\s\S]*?)<\/MasterFiles>/);
  const masterFilesContent = masterFilesMatch ? masterFilesMatch[1] : '';

  const definedAccountIDs = new Set<string>();
  const accountIDMatches = masterFilesContent.match(/<AccountID>([^<]+)<\/AccountID>/g);
  if (accountIDMatches) {
    for (const m of accountIDMatches) {
      definedAccountIDs.add(m.replace(/<\/?AccountID>/g, '').trim());
    }
  }

  // Collect all referenced AccountIDs from GeneralLedgerEntries lines
  const glEntriesMatch = xmlContent.match(/<GeneralLedgerEntries>([\s\S]*?)<\/GeneralLedgerEntries>/);
  const glEntriesContent = glEntriesMatch ? glEntriesMatch[1] : '';

  const referencedAccountIDs = new Set<string>();
  const glAccountRefs = glEntriesContent.match(/<AccountID>([^<]+)<\/AccountID>/g);
  if (glAccountRefs) {
    for (const m of glAccountRefs) {
      referencedAccountIDs.add(m.replace(/<\/?AccountID>/g, '').trim());
    }
  }

  // Check: every referenced AccountID must exist in MasterFiles
  totalChecks++;
  if (definedAccountIDs.size > 0 && referencedAccountIDs.size > 0) {
    const dangling = Array.from(referencedAccountIDs).filter(id => !definedAccountIDs.has(id));
    if (dangling.length > 0) {
      errors.push({
        code: 'DANGLING_ACCOUNT_REF',
        message: `${dangling.length} AccountID(s) referenced in transactions but not defined in MasterFiles/GeneralLedgerAccounts: ${dangling.slice(0, 5).join(', ')}${dangling.length > 5 ? '...' : ''}`,
        path: 'GeneralLedgerEntries/Journal/Transaction/Lines/Line/AccountID',
        severity: 'error',
        suggestion: 'Ensure every AccountID used in transactions is defined in <MasterFiles><GeneralLedgerAccounts><Account>',
      });
    } else {
      passed++;
    }
  }

  // 14. Collect CustomerIDs + SupplierIDs and check references in SourceDocuments
  const definedCustomerIDs = new Set<string>();
  const customerIDMatches = masterFilesContent.match(/<CustomerID>([^<]+)<\/CustomerID>/g);
  if (customerIDMatches) {
    for (const m of customerIDMatches) {
      definedCustomerIDs.add(m.replace(/<\/?CustomerID>/g, '').trim());
    }
  }

  const definedSupplierIDs = new Set<string>();
  const supplierIDMatches = masterFilesContent.match(/<SupplierID>([^<]+)<\/SupplierID>/g);
  if (supplierIDMatches) {
    for (const m of supplierIDMatches) {
      definedSupplierIDs.add(m.replace(/<\/?SupplierID>/g, '').trim());
    }
  }

  // Check CustomerID references in SalesInvoices
  const sourceDocsMatch = xmlContent.match(/<SourceDocuments>([\s\S]*?)<\/SourceDocuments>/);
  const sourceDocsContent = sourceDocsMatch ? sourceDocsMatch[1] : '';

  const referencedCustomerIDs = new Set<string>();
  const invoiceCustomerRefs = sourceDocsContent.match(/<CustomerID>([^<]+)<\/CustomerID>/g);
  if (invoiceCustomerRefs) {
    for (const m of invoiceCustomerRefs) {
      referencedCustomerIDs.add(m.replace(/<\/?CustomerID>/g, '').trim());
    }
  }

  totalChecks++;
  if (definedCustomerIDs.size > 0 && referencedCustomerIDs.size > 0) {
    const dangling = Array.from(referencedCustomerIDs).filter(id => !definedCustomerIDs.has(id));
    if (dangling.length > 0) {
      errors.push({
        code: 'DANGLING_CUSTOMER_REF',
        message: `${dangling.length} CustomerID(s) referenced in invoices but not defined in MasterFiles/Customers: ${dangling.slice(0, 5).join(', ')}`,
        path: 'SourceDocuments/SalesInvoices/Invoice/CustomerID',
        severity: 'error',
        suggestion: 'Ensure every CustomerID in invoices is defined in <MasterFiles><Customers><Customer>',
      });
    } else {
      passed++;
    }
  }

  // 15. Collect defined TaxCodes and check references in transactions
  const definedTaxCodes = new Set<string>();
  const taxCodeDefMatches = masterFilesContent.match(/<TaxCodeDetails>[\s\S]*?<TaxCode>([^<]+)<\/TaxCode>/g);
  if (taxCodeDefMatches) {
    for (const m of taxCodeDefMatches) {
      const codeMatch = m.match(/<TaxCode>([^<]+)<\/TaxCode>/);
      if (codeMatch) definedTaxCodes.add(codeMatch[1].trim());
    }
  }

  // Collect referenced TaxCodes from transactions + invoices
  const referencedTaxCodes = new Set<string>();
  const allTaxCodeRefs = (glEntriesContent + sourceDocsContent).match(/<TaxCode>([^<]+)<\/TaxCode>/g);
  if (allTaxCodeRefs) {
    for (const m of allTaxCodeRefs) {
      referencedTaxCodes.add(m.replace(/<\/?TaxCode>/g, '').trim());
    }
  }

  totalChecks++;
  if (definedTaxCodes.size > 0 && referencedTaxCodes.size > 0) {
    const dangling = Array.from(referencedTaxCodes).filter(code => !definedTaxCodes.has(code));
    if (dangling.length > 0) {
      errors.push({
        code: 'DANGLING_TAXCODE_REF',
        message: `${dangling.length} TaxCode(s) referenced in transactions/invoices but not defined in MasterFiles/TaxTable: ${dangling.join(', ')}`,
        path: 'GeneralLedgerEntries + SourceDocuments',
        severity: 'error',
        suggestion: 'Ensure every TaxCode used is defined in <MasterFiles><TaxTable><TaxCodeDetails>',
      });
    } else {
      passed++;
    }
  }

  return createResult(errors, warnings, totalChecks, passed);
}

function createResult(
  errors: ValidationError[],
  warnings: ValidationError[],
  totalChecks: number,
  passed: number
): ValidationResult {
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    summary: {
      totalChecks,
      passed,
      failed: errors.length,
      warnings: warnings.length,
    },
  };
}

/**
 * Validates transaction data before SAF-T generation
 */
export function validateTransactionData(transactions: Array<{
  id: string;
  date: Date | string;
  amount: number;
  description: string;
  vatPercent: number;
}>): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Allow empty transactions - this is valid for periods with no activity
  if (transactions.length === 0) {
    return { valid: true, errors: [], warnings: ['No transactions in selected period'] };
  }

  transactions.forEach((t, index) => {
    const prefix = `Transaction ${index + 1}:`;

    if (!t.id || t.id.trim() === '') {
      errors.push(`${prefix} Missing transaction ID`);
    }

    if (!t.date) {
      errors.push(`${prefix} Missing transaction date`);
    } else {
      const date = new Date(t.date);
      if (isNaN(date.getTime())) {
        errors.push(`${prefix} Invalid date format`);
      }
    }

    if (typeof t.amount !== 'number' || isNaN(t.amount)) {
      errors.push(`${prefix} Invalid amount (must be a number)`);
    }

    if (!t.description || t.description.trim() === '') {
      warnings.push(`${prefix} Missing description`);
    }

    if (typeof t.vatPercent !== 'number' || isNaN(t.vatPercent)) {
      errors.push(`${prefix} Invalid VAT percentage`);
    } else if (!(VALID_VAT_PERCENTAGES as readonly number[]).includes(t.vatPercent)) {
      warnings.push(`${prefix} VAT rate ${t.vatPercent}% is not a standard Danish rate (0%, 12%, or 25%)`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Log validation results
 */
export function logValidationResults(result: ValidationResult, context: string = 'SAF-T Validation'): void {
  logger.info(`\n=== ${context} ===`);
  logger.info(`Status: ${result.isValid ? '✓ VALID' : '✗ INVALID'}`);
  logger.info(`Summary: ${result.summary.passed}/${result.summary.totalChecks} checks passed`);
  logger.info(`Errors: ${result.errors.length}, Warnings: ${result.warnings.length}`);
  
  if (result.errors.length > 0) {
    logger.info('\nErrors:');
    result.errors.forEach((e, i) => {
      logger.info(`  ${i + 1}. [${e.code}] ${e.path}: ${e.message}`);
      if (e.suggestion) logger.info(`     → ${e.suggestion}`);
    });
  }
  
  if (result.warnings.length > 0) {
    logger.info('\nWarnings:');
    result.warnings.forEach((w, i) => {
      logger.info(`  ${i + 1}. [${w.code}] ${w.path}: ${w.message}`);
      if (w.suggestion) logger.info(`     → ${w.suggestion}`);
    });
  }
  
  logger.info('='.repeat(40));
}
