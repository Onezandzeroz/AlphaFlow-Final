/**
 * Account Group Inference
 *
 * SAF-T AccountType has only 5 values (Asset, Liability, Sale, Expense, Other).
 * AlphaFlow needs an AccountGroup (21 values) for VAT register aggregation,
 * reporting, and bank reconciliation.
 *
 * This module infers the most likely AccountGroup from:
 *   1. StandardAccountID (if present) → lookup in OFFICIAL_STANDARD_CHART
 *   2. Account number range heuristics (Danish standard chart ranges)
 *   3. AccountType fallback
 */

import { AccountGroup } from '@prisma/client';
import { OFFICIAL_STANDARD_CHART } from '@/lib/official-standard-chart';

/**
 * Infer AccountGroup from a SAF-T account's properties.
 *
 * @param accountNumber - The account number (e.g. "1100")
 * @param saftType - SAF-T AccountType (Asset|Liability|Sale|Expense|Other)
 * @param standardAccountId - Optional official standard account number
 * @returns The inferred AccountGroup
 */
export function inferAccountGroup(
  accountNumber: string,
  saftType: string,
  standardAccountId?: string | null,
): AccountGroup {
  // Strategy 1: Look up StandardAccountID in official chart
  if (standardAccountId) {
    const officialAccount = OFFICIAL_STANDARD_CHART.find(
      (a) => a.number === standardAccountId,
    );
    if (officialAccount) {
      const group = mapOfficialTypeToGroup(officialAccount.type);
      if (group) return group;
    }
  }

  // Strategy 2: Account number range heuristics (Danish FSR-38 ranges)
  const num = parseInt(accountNumber, 10);

  // 1xxx: Assets
  if (num >= 1000 && num <= 1999) {
    if (num === 1000) return 'CASH';
    if (num >= 1100 && num <= 1199) return 'BANK';
    if (num >= 1200 && num <= 1299) return 'RECEIVABLES';
    if (num >= 1300 && num <= 1499) return 'INVENTORY';
    if (num >= 1500 && num <= 1799) return 'FIXED_ASSETS';
    return 'OTHER_ASSETS';
  }

  // 2xxx: Liabilities
  if (num >= 2000 && num <= 2999) {
    if (num >= 2000 && num <= 2199) return 'PAYABLES';
    if (num >= 2200 && num <= 2399) return 'OUTPUT_VAT';
    if (num >= 2400 && num <= 2599) return 'SHORT_TERM_DEBT';
    if (num >= 2600 && num <= 2799) return 'LONG_TERM_DEBT';
    return 'OTHER_LIABILITIES';
  }

  // 3xxx: Equity
  if (num >= 3000 && num <= 3999) {
    if (num >= 3000 && num <= 3099) return 'SHARE_CAPITAL';
    return 'RETAINED_EARNINGS';
  }

  // 4xxx: Revenue (sales)
  if (num >= 4000 && num <= 4999) {
    return 'SALES_REVENUE';
  }

  // 5xxx: Revenue (other) + VAT
  if (num >= 5000 && num <= 5999) {
    if (num >= 5500 && num <= 5599) return 'OUTPUT_VAT';
    if (num >= 5600 && num <= 5699) return 'INPUT_VAT';
    return 'OTHER_REVENUE';
  }

  // 6xxx: Expenses (cost of goods + purchases)
  if (num >= 6000 && num <= 6999) {
    if (num >= 6000 && num <= 6499) return 'COST_OF_GOODS';
    if (num >= 6500 && num <= 6799) return 'INPUT_VAT';
    if (num >= 6800 && num <= 6999) return 'PERSONNEL';
    return 'COST_OF_GOODS';
  }

  // 7xxx-8xxx: Operating expenses
  if (num >= 7000 && num <= 8999) {
    if (num >= 7000 && num <= 7199) return 'PERSONNEL';
    if (num >= 7800 && num <= 7899) return 'FINANCIAL_INCOME';
    if (num >= 7900 && num <= 7999) return 'FINANCIAL_EXPENSE';
    return 'OTHER_OPERATING';
  }

  // 9xxx: Financial + tax
  if (num >= 9000 && num <= 9999) {
    if (num >= 9200 && num <= 9399) return 'FINANCIAL_INCOME';
    if (num >= 9400 && num <= 9599) return 'FINANCIAL_EXPENSE';
    if (num >= 9500 && num <= 9599) return 'TAX';
    return 'OTHER_OPERATING';
  }

  // Strategy 3: Fallback by AccountType
  return fallbackByType(saftType);
}

function mapOfficialTypeToGroup(type: string): AccountGroup | null {
  switch (type) {
    case 'Asset': return 'OTHER_ASSETS';
    case 'Liability': return 'OTHER_LIABILITIES';
    case 'Sale': return 'SALES_REVENUE';
    case 'Expense': return 'OTHER_OPERATING';
    case 'Equity': return 'SHARE_CAPITAL';
    default: return null;
  }
}

function fallbackByType(saftType: string): AccountGroup {
  switch (saftType) {
    case 'Asset': return 'OTHER_ASSETS';
    case 'Liability': return 'OTHER_LIABILITIES';
    case 'Sale': return 'OTHER_REVENUE';
    case 'Expense': return 'OTHER_OPERATING';
    case 'Other': return 'RETAINED_EARNINGS';
    default: return 'OTHER_OPERATING';
  }
}
