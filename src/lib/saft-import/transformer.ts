/**
 * SAF-T Transformer
 *
 * Transforms parsed SAF-T objects (from parser.ts) into Prisma-compatible
 * data objects ready for db.account.create(), db.contact.create(), etc.
 *
 * Handles:
 *   - AccountType mapping (SAF-T enum → Prisma enum)
 *   - AccountGroup inference (via account-group-inference.ts)
 *   - VAT code mapping (via saft-vat-codes.ts reverse lookup)
 *   - Country code → Danish name (via country-codes.ts)
 *   - Contact type derivation (CUSTOMER/SUPPLIER/BOTH)
 */

import { AccountType, AccountGroup, ContactType } from '@prisma/client';
import type { ParsedSaftFile, ParsedAccount, ParsedContact, ParsedTaxCode, ParsedTransaction, ParsedLine } from './parser';
import { inferAccountGroup } from './account-group-inference';
import { countryCodeToName } from './country-codes';
import { getSaftVatCodeByStandardCode } from '@/lib/saft-vat-codes';

// ─── Types ────────────────────────────────────────────────────────────

export interface TransformedAccount {
  number: string;
  name: string;
  nameEn: string | null;
  type: AccountType;
  group: AccountGroup;
  description: string | null;
  publicStandardNumber: string | null;
  isActive: boolean;
  isSystem: boolean;
}

export interface TransformedContact {
  name: string;
  cvrNumber: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string;
  type: ContactType;
  isActive: boolean;
  notes: string | null;
}

export interface TransformedJournalEntry {
  date: Date;
  description: string;
  reference: string | null;
  status: 'POSTED';
  cancelled: boolean;
  lines: TransformedJournalEntryLine[];
}

export interface TransformedJournalEntryLine {
  accountNumber: string; // resolved from accountMap
  debit: number;
  credit: number;
  vatCode: string | null; // AlphaFlow VATCode enum value or null
  description: string | null;
}

export interface ImportSummary {
  accounts: number;
  customers: number;
  suppliers: number;
  journalEntries: number;
  journalEntryLines: number;
  unmappedVatCodes: string[];
  warnings: string[];
}

export interface DryRunResult {
  summary: {
    accounts: number;
    customers: number;
    suppliers: number;
    transactions: number;
    lines: number;
  };
  periodCovered: { start: string; end: string };
  sourceSoftware: string;
  existingAccountConflicts: string[];
  unmappedVatCodes: Array<{ sourceCode: string; standardCode?: string; suggestedAlphaFlowCode: string | null }>;
  warnings: string[];
}

// ─── AccountType mapping (SAF-T → Prisma) ─────────────────────────────

const SAFT_TO_PRISMA_TYPE: Record<string, AccountType> = {
  'Asset': 'ASSET',
  'Liability': 'LIABILITY',
  'Sale': 'REVENUE',
  'Expense': 'EXPENSE',
  'Other': 'EQUITY',
};

// ─── VAT code mapping ─────────────────────────────────────────────────

/**
 * Build a VAT code lookup map from the SAF-T TaxTable.
 * Maps source-system TaxCode → AlphaFlow VATCode enum.
 */
export function buildVatCodeMap(taxCodes: ParsedTaxCode[]): Map<string, string | null> {
  const map = new Map<string, string | null>();

  for (const tc of taxCodes) {
    let alphaFlowCode: string | null = null;

    // Strategy 1: Use StandardTaxCode for reverse lookup
    if (tc.standardTaxCode) {
      const mapping = getSaftVatCodeByStandardCode(tc.standardTaxCode);
      if (mapping?.alphaFlowCode) {
        alphaFlowCode = mapping.alphaFlowCode;
      }
    }

    // Strategy 2: Use TaxPercentage + country as heuristic
    if (!alphaFlowCode && tc.taxPercentage !== undefined) {
      const rate = tc.taxPercentage;
      const isOutput = tc.description?.toLowerCase().includes('salg') ||
                       tc.description?.toLowerCase().includes('udgående') ||
                       tc.description?.toLowerCase().includes('output');
      const isInput = tc.description?.toLowerCase().includes('køb') ||
                      tc.description?.toLowerCase().includes('indgående') ||
                      tc.description?.toLowerCase().includes('input');

      if (rate === 25) {
        alphaFlowCode = isInput ? 'K25' : 'S25';
      } else if (rate === 12) {
        alphaFlowCode = isInput ? 'K12' : 'S12';
      } else if (rate === 0) {
        alphaFlowCode = isInput ? 'K0' : 'S0';
      }
    }

    // Strategy 3: Check if the TaxCode itself is already an AlphaFlow code
    if (!alphaFlowCode) {
      const knownCodes = ['S25', 'S12', 'S0', 'SEU', 'K25', 'K12', 'K0', 'KEU', 'KUF', 'NONE'];
      if (knownCodes.includes(tc.taxCode)) {
        alphaFlowCode = tc.taxCode;
      }
    }

    map.set(tc.taxCode, alphaFlowCode);
  }

  return map;
}

// ─── Transform functions ──────────────────────────────────────────────

export function transformAccount(
  acc: ParsedAccount,
): TransformedAccount {
  const type = SAFT_TO_PRISMA_TYPE[acc.accountType] || 'ASSET';
  const group = inferAccountGroup(acc.accountId, acc.accountType, acc.standardAccountId);

  return {
    number: acc.accountId,
    name: acc.accountDescription.substring(0, 255),
    nameEn: null,
    type,
    group,
    description: null,
    publicStandardNumber: acc.standardAccountId || null,
    isActive: true,
    isSystem: false,
  };
}

export function transformContact(
  contact: ParsedContact,
  existingCvrs: Set<string>,
): TransformedContact {
  const country = contact.address?.country
    ? countryCodeToName(contact.address.country)
    : 'Danmark';

  // Determine contact type — if CVR appears in both customers and suppliers, set BOTH
  let type: ContactType = contact.type === 'CUSTOMER' ? 'CUSTOMER' : 'SUPPLIER';
  if (contact.registrationNumber && existingCvrs.has(contact.registrationNumber)) {
    type = 'BOTH';
  }

  return {
    name: contact.name.substring(0, 255),
    cvrNumber: contact.registrationNumber || null,
    email: contact.email || null,
    phone: contact.phone || null,
    address: contact.address?.streetName || null,
    city: contact.address?.city || null,
    postalCode: contact.address?.postalCode || null,
    country,
    type,
    isActive: true,
    notes: `Importeret fra SAF-T (ID: ${contact.id})`,
  };
}

export function transformTransaction(
  tx: ParsedTransaction,
  vatCodeMap: Map<string, string | null>,
): TransformedJournalEntry {
  const lines: TransformedJournalEntryLine[] = tx.lines.map((line) => {
    const vatCode = line.taxCode ? vatCodeMap.get(line.taxCode) ?? null : null;
    return {
      accountNumber: line.accountId,
      debit: line.debitAmount || 0,
      credit: line.creditAmount || 0,
      vatCode,
      description: line.description || null,
    };
  });

  return {
    date: new Date(tx.transactionDate),
    description: tx.description || tx.transactionId,
    reference: tx.transactionId,
    status: 'POSTED',
    cancelled: false,
    lines,
  };
}

// ─── Dry-run analysis ────────────────────────────────────────────────

export function analyzeForDryRun(
  parsed: ParsedSaftFile,
  existingAccountNumbers: string[],
): DryRunResult {
  const vatCodeMap = buildVatCodeMap(parsed.masterFiles.taxCodes);

  // Find unmapped VAT codes
  const unmappedVatCodes: DryRunResult['unmappedVatCodes'] = [];
  const seenUnmapped = new Set<string>();
  for (const tc of parsed.masterFiles.taxCodes) {
    const mapped = vatCodeMap.get(tc.taxCode);
    if (!mapped && !seenUnmapped.has(tc.taxCode)) {
      seenUnmapped.add(tc.taxCode);
      unmappedVatCodes.push({
        sourceCode: tc.taxCode,
        standardCode: tc.standardTaxCode,
        suggestedAlphaFlowCode: mapped,
      });
    }
  }

  // Find existing account conflicts
  const existingSet = new Set(existingAccountNumbers);
  const existingAccountConflicts = parsed.masterFiles.accounts
    .map((a) => a.accountId)
    .filter((id) => existingSet.has(id));

  // Count totals
  let totalLines = 0;
  let totalTransactions = 0;
  for (const journal of parsed.generalLedgerEntries.journals) {
    totalTransactions += journal.transactions.length;
    for (const tx of journal.transactions) {
      totalLines += tx.lines.length;
    }
  }

  // Detect VAT codes used in lines that are unmapped
  const warnings: string[] = [];
  const usedInLines = new Set<string>();
  for (const journal of parsed.generalLedgerEntries.journals) {
    for (const tx of journal.transactions) {
      for (const line of tx.lines) {
        if (line.taxCode) {
          usedInLines.add(line.taxCode);
        }
      }
    }
  }
  for (const code of usedInLines) {
    if (!vatCodeMap.get(code)) {
      warnings.push(`VAT code "${code}" is used in transactions but has no mapping — lines will be imported without VAT code`);
    }
  }

  return {
    summary: {
      accounts: parsed.masterFiles.accounts.length,
      customers: parsed.masterFiles.customers.length,
      suppliers: parsed.masterFiles.suppliers.length,
      transactions: totalTransactions,
      lines: totalLines,
    },
    periodCovered: {
      start: parsed.header.selectionStartDate,
      end: parsed.header.selectionEndDate,
    },
    sourceSoftware: parsed.header.softwareCompanyName
      ? `${parsed.header.softwareCompanyName} ${parsed.header.softwareVersion}`
      : 'Unknown',
    existingAccountConflicts,
    unmappedVatCodes,
    warnings,
  };
}
