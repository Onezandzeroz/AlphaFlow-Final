/**
 * Annual Report CSV Generator — Regnskab Basis (Erhvervsstyrelsen compliant)
 *
 * Generates a CSV file in the official "Regnskab Basis" format required by
 * Erhvervsstyrelsen for upload of annual accounts.
 *
 * Format specification (Version 3, opdateret 5. marts 2026):
 *   https://erhvervsstyrelsen.dk/vejledning-upload-af-regnskabsfil-i-regnskab-basis
 *
 * Format rules:
 *   - Header row: KONTONUMMER_20260101;KONTONAVN_20260101;VAERDI_20260101
 *   - One row per official standard account (2026 Standardkontoplan)
 *   - Separator: semikolon (;)
 *   - Encoding: UTF-8 (med eller uden BOM — vi bruger BOM for Excel-kompatibilitet)
 *   - Values: kun heltal (ingen decimaler, ingen tusindtalsseparator)
 *   - Fortegn: Debet = positivt (+ eller intet), Kredit = negativt (-)
 *   - Ingen sektionsheadere, sum-linjer, totaler eller tekst-intro/footer
 *   - Blokerede klasse A-konti filtreres fra (37 specifikke konti)
 *
 * Data source: Posted, non-cancelled journal entries for a given year.
 * AlphaFlow's FSR-based accounts are mapped to official 2026 standard account
 * numbers via FSR_TO_OFFICIAL_MAPPING (src/lib/fsr-official-mapping.ts).
 *
 * Exports: generateAnnualReportCSV(companyId, year) → CSV string
 */

import { db } from '@/lib/db';
import { AccountGroup, AccountType } from '@prisma/client';
import { FSR_TO_OFFICIAL_MAPPING } from '@/lib/fsr-official-mapping';
import { OFFICIAL_STANDARD_CHART } from '@/lib/official-standard-chart';

// ─── Rounding helper ─────────────────────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100;

// ─── Types ────────────────────────────────────────────────────────────────

interface AccountAggregate {
  number: string;
  name: string;
  type: AccountType;
  group: AccountGroup;
  debit: number;
  credit: number;
  netBalance: number;
}

// ─── Erhvervsstyrelsen Regnskab Basis compliance ──────────────────────────

/**
 * Version-suffiks for header-rækken.
 * For regnskabsår 2026 bruges version 20260101 af standardkontoplanen.
 */
const STANDARDKONTOPLAN_VERSION = '20260101';

/**
 * Blokerede klasse A-konti der IKKE må optræde i en Regnskab Basis CSV
 * (jf. Erhvervsstyrelsen vejledning kapitel 5 — disse konti er forbeholdt
 * regnskabsklasse A virksomheder og vil få filen afvist hvis de optræder).
 *
 * Kilde: https://erhvervsstyrelsen.dk/vejledning-upload-af-regnskabsfil-i-regnskab-basis
 */
const BLOCKED_CLASS_A_ACCOUNTS: ReadonlySet<string> = new Set([
  '1450', '1805', '1807', '2085', '2170', '2240', '2265', '2266', '2295', '2430',
  '2548', '2550', '2567', '2580', '3095', '3097', '3099',
  // 5682-5690 (9 konti)
  '5682', '5683', '5684', '5685', '5686', '5687', '5688', '5689', '5690',
  // 6915-6924 (10 konti)
  '6915', '6916', '6917', '6918', '6919', '6920', '6921', '6922', '6923', '6924',
]);

/**
 * Official standard account lookup (number → name).
 * Bruges til at få det korrekte kontonavn fra 2026 Standardkontoplanen.
 */
const OFFICIAL_ACCOUNT_NAMES: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const acc of OFFICIAL_STANDARD_CHART) {
    m.set(acc.number, acc.name);
  }
  return m;
})();

// ─── Core: Generate Annual Report CSV (Erhvervsstyrelsen compliant) ───────

/**
 * Generate a Regnskab Basis CSV for a company for a given year.
 *
 * Output format (Erhvervsstyrelsen compliant):
 *   KONTONUMMER_20260101;KONTONAVN_20260101;VAERDI_20260101
 *   1010;Salg af varer og ydelser;-100000
 *   1610;Varekøb;0
 *   ...
 *
 * @param companyId - The company's database ID
 * @param year - The fiscal year (e.g., 2026)
 * @returns CSV string in Regnskab Basis format
 */
export async function generateAnnualReportCSV(
  companyId: string,
  year: number,
): Promise<string> {
  // ── Fetch all posted, non-cancelled journal entries up to and including the year ──
  // Balance sheet accounts are cumulative, so we need all-time entries.
  // Income statement accounts are per-year, but we fetch all-time and filter
  // to the target year for P&L accounts below.
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

  // All-time entries (for balance sheet — cumulative)
  const allTimeEntries = await db.journalEntry.findMany({
    where: {
      companyId,
      status: 'POSTED',
      cancelled: false,
      date: { lte: yearEnd },
    },
    include: {
      lines: {
        include: { account: true },
      },
    },
  });

  // Year-only entries (for income statement — current year only)
  const yearEntries = allTimeEntries.filter(
    (e) => e.date >= yearStart && e.date <= yearEnd,
  );

  // ── Aggregate by AlphaFlow FSR account number ──
  // We build two maps: one for the current year (P&L accounts) and one for
  // all-time (balance sheet accounts). Then we map each FSR account to its
  // official 2026 standard account number and aggregate by official number.
  const yearAccountMap = aggregateAccounts(yearEntries);
  const allTimeAccountMap = aggregateAccounts(allTimeEntries);

  // ── Map FSR accounts → official 2026 standard account numbers ──
  // Each FSR account maps to one official account; multiple FSR accounts may
  // map to the same official account (e.g. 4000 + 4100 both → 1010).
  // We aggregate the net balance per official account number.
  //
  // Sign convention (Erhvervsstyrelsen):
  //   - Debet-nature accounts (ASSET, EXPENSE): positive balance = debet → positiv værdi
  //   - Kredit-nature accounts (REVENUE, LIABILITY, EQUITY): positive balance = kredit → NEGATIV værdi
  //
  // This matches the official example: account 1010 (Salg) shows -8598542 (kredit → negativ),
  // account 1410 (Varelager) shows +657125 (debet → positiv).
  const officialBalances = new Map<string, number>();

  // Helper: process a map of FSR aggregates into officialBalances
  const processMap = (map: Map<string, AccountAggregate>, isIncomeStatement: boolean) => {
    for (const acc of map.values()) {
      // Determine if this account is a P&L account (income statement) or balance sheet account
      const isPLAccount =
        acc.type === AccountType.REVENUE ||
        acc.type === AccountType.EXPENSE ||
        acc.group === AccountGroup.TAX ||
        acc.group === AccountGroup.OUTPUT_VAT ||
        acc.group === AccountGroup.INPUT_VAT;

      // Skip P&L accounts in the all-time map (they should only come from yearMap)
      // Skip balance sheet accounts in the year map (they should only come from allTimeMap)
      if (isIncomeStatement && !isPLAccount) continue;
      if (!isIncomeStatement && isPLAccount) continue;

      // Map FSR → official
      const officialNumber = FSR_TO_OFFICIAL_MAPPING[acc.number];
      if (!officialNumber) {
        // FSR account ikke i mapping-tabellen — skip (kan ikke placeres på standardkontoplan)
        continue;
      }

      // Skip blocked class A accounts
      if (BLOCKED_CLASS_A_ACCOUNTS.has(officialNumber)) continue;

      // Compute net balance with correct sign
      // netBalance is already computed as: kredit-debit for REVENUE/EQUITY/LIABILITY, debit-kredit for ASSET/EXPENSE
      // For the CSV: debet-accounts → positive, kredit-accounts → negative
      let value: number;
      if (acc.type === AccountType.REVENUE || acc.type === AccountType.LIABILITY || acc.type === AccountType.EQUITY) {
        // Kredit-nature: netBalance = credit - debit (positive if credit > debit)
        // Erhvervsstyrelsen: kredit = negativt fortegn
        value = -acc.netBalance;
      } else {
        // Debet-nature (ASSET, EXPENSE): netBalance = debit - credit (positive if debit > credit)
        // Erhvervsstyrelsen: debet = positivt fortegn
        value = acc.netBalance;
      }

      // Round to integer (Erhvervsstyrelsen kræver heltal)
      const intValue = Math.round(value);

      // Aggregate into officialBalances
      const existing = officialBalances.get(officialNumber) || 0;
      officialBalances.set(officialNumber, existing + intValue);
    }
  };

  processMap(yearAccountMap, true);   // P&L accounts from current year only
  processMap(allTimeAccountMap, false); // Balance sheet accounts from all-time

  // ── Build CSV ──
  const lines: string[] = [];

  // Header row (required format)
  const header = `KONTONUMMER_${STANDARDKONTOPLAN_VERSION};KONTONAVN_${STANDARDKONTOPLAN_VERSION};VAERDI_${STANDARDKONTOPLAN_VERSION}`;
  // Prepend UTF-8 BOM to the header line (for Excel compatibility — BOM er tilladt men ikke påkrævet)
  lines.push('\uFEFF' + header);

  // Sort official account numbers numerically (as integers where possible, else lexicographically)
  const sortedNumbers = Array.from(officialBalances.keys()).sort((a, b) => {
    const an = parseInt(a, 10);
    const bn = parseInt(b, 10);
    if (Number.isNaN(an) || Number.isNaN(bn)) return a.localeCompare(b);
    return an - bn;
  });

  // One row per official account
  for (const officialNumber of sortedNumbers) {
    const value = officialBalances.get(officialNumber)!;
    const name = OFFICIAL_ACCOUNT_NAMES.get(officialNumber) || '';
    // Value as integer (no decimals, no thousand separator)
    // 0 values are included (Erhvervsstyrelsen accepts zero-value rows)
    const valueStr = value === 0 ? '0' : String(value);
    lines.push(`${officialNumber};${name};${valueStr}`);
  }

  return lines.join('\n');
}

// ─── Helper: Aggregate journal entries by account ─────────────────────────

function aggregateAccounts(
  entries: Array<{
    lines: Array<{
      accountId: string;
      debit: unknown;
      credit: unknown;
      account: { number: string; name: string; type: AccountType; group: AccountGroup };
    }>;
  }>,
): Map<string, AccountAggregate> {
  const accountMap = new Map<string, AccountAggregate>();

  for (const entry of entries) {
    for (const line of entry.lines) {
      const accountId = line.accountId;
      const existing = accountMap.get(accountId) || {
        number: line.account.number,
        name: line.account.name,
        type: line.account.type,
        group: line.account.group,
        debit: 0,
        credit: 0,
        netBalance: 0,
      };

      existing.debit += Number(line.debit) || 0;
      existing.credit += Number(line.credit) || 0;
      accountMap.set(accountId, existing);
    }
  }

  // Calculate net balance for each account
  for (const acc of accountMap.values()) {
    acc.debit = r2(acc.debit);
    acc.credit = r2(acc.credit);

    if (acc.type === AccountType.REVENUE || acc.type === AccountType.EQUITY || acc.type === AccountType.LIABILITY) {
      acc.netBalance = r2(acc.credit - acc.debit);
    } else {
      // ASSET, EXPENSE
      acc.netBalance = r2(acc.debit - acc.credit);
    }
  }

  return accountMap;
}
