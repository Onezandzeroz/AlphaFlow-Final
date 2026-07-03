/**
 * VAT Utilities — SINGLE SOURCE OF TRUTH for all VAT data
 *
 * All VAT totals MUST come from JournalEntryLine records where the associated
 * Account.group is OUTPUT_VAT (udgående moms) or INPUT_VAT (indgående moms).
 *
 * The Invoice.vatTotal and Transaction.vatPercent fields are WRITE-ONLY metadata
 * used for document generation (PDF, OIOUBL) — NEVER for financial reporting.
 *
 * VAT Account Mapping (from seed-chart-of-accounts.ts):
 *   OUTPUT_VAT:  4510 (25%), 4520 (12%)
 *   INPUT_VAT:   5410 (25%), 5420 (12%)
 *
 * VAT Code Mapping (Prisma enum):
 *   Output: S25, S12, S0, SEU
 *   Input:  K25, K12, K0, KEU, KUF
 *
 * ⚠️ ARCHITECTURE RULE: No file outside this module may calculate VAT totals
 *    independently. Every consumer MUST call computeVATRegister() or enrich
 *    via enrichTransactionsWithVAT() / enrichInvoicesWithVAT().
 */

import { db } from '@/lib/db';
import { AccountGroup } from '@prisma/client';
// Import the pure (db-free) constants from vat-codes so this server-only
// module can use them internally AND re-export them for backward
// compatibility. Client components MUST import directly from
// '@/lib/vat-codes' to avoid pulling Prisma into the browser bundle.
import {
  VAT_RATE_MAP,
  OUTPUT_VAT_CODES,
  INPUT_VAT_CODES,
  VALID_VAT_PERCENTAGES,
} from '@/lib/vat-codes';
export { VAT_RATE_MAP, OUTPUT_VAT_CODES, INPUT_VAT_CODES, VALID_VAT_PERCENTAGES };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VATCodeSummary {
  code: string;
  rate: number;
  debitTotal: number;
  creditTotal: number;
  netAmount: number;
}

export interface VATRegisterResult {
  outputVAT: VATCodeSummary[];
  inputVAT: VATCodeSummary[];
  totalOutputVAT: number;
  totalInputVAT: number;
  netVATPayable: number;
  /** Net revenue from journal entry lines on REVENUE accounts (4xxx) */
  totalRevenue: number;
  /** Net expenses from journal entry lines on EXPENSE accounts (5xxx/6xxx) */
  totalExpenses: number;
}

// ─── Rounding helper ──────────────────────────────────────────────────────────

export const r2 = (n: number) => Math.round(n * 100) / 100;

// ─── Helper: extract companyId(s) from a tenantFilter-merged whereClause ──────
// The whereClause passed to computeVATRegister() is merged with tenantFilter(ctx),
// which produces either `{ companyId: <id> }` (normal/oversight mode) or
// `{ companyId: { in: [<ids>] } }` (multi-tenant). We need the companyId(s) to
// scope the cancelled-transaction exclusion query to the same tenant(s).
function extractCompanyIds(whereClause: Record<string, unknown>): string[] {
  const v = whereClause.companyId;
  if (typeof v === 'string') return [v];
  if (v && typeof v === 'object' && Array.isArray((v as { in?: unknown }).in)) {
    return (v as { in: unknown[] }).in.filter((x): x is string => typeof x === 'string');
  }
  return [];
}

/**
 * Get the journal-entry reference strings that belong to cancelled transactions
 * for the given company(ies). Returns BOTH the original (`TX-<id8>`) and the
 * reversal (`REVERSAL-TX-<id8>`) references so callers can exclude them from
 * VAT aggregation / drill-down queries.
 *
 * This is exported so that API routes which fetch raw journal entries for
 * display (e.g. /api/vat-register's drill-down table) can apply the SAME
 * exclusion as computeVATRegister(), keeping totals and line items consistent.
 *
 * Returns an empty array if there are no cancelled transactions.
 */
export async function getCancelledTxReferences(companyIds: string[]): Promise<string[]> {
  if (companyIds.length === 0) return [];
  const cancelledTxs = await db.transaction.findMany({
    where: { cancelled: true, companyId: { in: companyIds } },
    select: { id: true },
  });
  const refs: string[] = [];
  for (const tx of cancelledTxs) {
    const shortId = tx.id.slice(0, 8);
    refs.push(`TX-${shortId}`);
    refs.push(`REVERSAL-TX-${shortId}`);
  }
  return refs;
}

// ─── CORE: computeVATRegister — the single source of truth for VAT totals ───

/**
 * Compute VAT register totals from journal entries for a given period.
 *
 * This is the ONLY function that should produce VAT totals for reporting.
 * Both the /api/vat-register endpoint and the server-side CSV export
 * call this function to ensure consistency.
 *
 * CANCELLED TRANSACTIONS ARE EXCLUDED:
 * The accounting model uses reversal entries (modposteringer) rather than
 * flagging the original journal entry as `cancelled`. This means the original
 * JE stays POSTED + not-cancelled, and a separate reversal JE (reference
 * `REVERSAL-TX-<id8>`) with swapped debit/credit is created to neutralise it.
 *
 * That design works for the ledger (both entries net to zero), BUT for VAT
 * reporting it breaks when the cancellation crosses a VAT period boundary:
 * the original VAT lands in period A, the reversal in period B, so neither
 * period nets to zero. To make VAT totals correct and fail-proof regardless
 * of when the cancellation happened, we explicitly exclude BOTH the original
 * and reversal JEs of any cancelled transaction from the aggregation.
 *
 * @param whereClause - Prisma JournalEntryWhereInput (must include status: 'POSTED',
 *                      cancelled: false, and date range). The caller adds tenantFilter.
 */
export async function computeVATRegister(
  whereClause: Record<string, unknown>,
): Promise<VATRegisterResult> {
  // ── Exclude journal entries belonging to cancelled transactions ──────
  const companyIds = extractCompanyIds(whereClause);
  const excludedReferences = await getCancelledTxReferences(companyIds);

  // Merge the exclusion into the caller's whereClause without mutating it.
  const effectiveWhere: Record<string, unknown> = { ...whereClause };
  if (excludedReferences.length > 0) {
    effectiveWhere.reference = { notIn: excludedReferences };
  }

  const entries = await db.journalEntry.findMany({
    where: effectiveWhere,
    include: {
      lines: {
        include: { account: true },
      },
    },
    orderBy: { date: 'asc' },
  });

  // Aggregate lines by VAT code — only lines on OUTPUT_VAT / INPUT_VAT accounts
  const vatCodeMap = new Map<string, { debitTotal: number; creditTotal: number }>();

  for (const entry of entries) {
    for (const line of entry.lines) {
      const accountGroup = line.account?.group as AccountGroup | undefined;
      if (accountGroup !== 'OUTPUT_VAT' && accountGroup !== 'INPUT_VAT') continue;

      const code = line.vatCode || 'NONE';
      const existing = vatCodeMap.get(code) || { debitTotal: 0, creditTotal: 0 };
      existing.debitTotal += Number(line.debit) || 0;
      existing.creditTotal += Number(line.credit) || 0;
      vatCodeMap.set(code, existing);
    }
  }

  // Build output VAT summary
  const outputVAT: VATCodeSummary[] = [];
  let totalOutputVAT = 0;

  for (const code of OUTPUT_VAT_CODES) {
    const data = vatCodeMap.get(code);
    if (data && (data.debitTotal > 0 || data.creditTotal > 0)) {
      const netAmount = r2(data.creditTotal - data.debitTotal);
      totalOutputVAT += netAmount;
      outputVAT.push({
        code,
        rate: VAT_RATE_MAP[code],
        debitTotal: r2(data.debitTotal),
        creditTotal: r2(data.creditTotal),
        netAmount,
      });
    }
  }

  // Build input VAT summary
  const inputVAT: VATCodeSummary[] = [];
  let totalInputVAT = 0;

  for (const code of INPUT_VAT_CODES) {
    const data = vatCodeMap.get(code);
    if (data && (data.debitTotal > 0 || data.creditTotal > 0)) {
      const netAmount = r2(data.debitTotal - data.creditTotal);
      totalInputVAT += netAmount;
      inputVAT.push({
        code,
        rate: VAT_RATE_MAP[code],
        debitTotal: r2(data.debitTotal),
        creditTotal: r2(data.creditTotal),
        netAmount,
      });
    }
  }

  totalOutputVAT = r2(totalOutputVAT);
  totalInputVAT = r2(totalInputVAT);
  const netVATPayable = r2(totalOutputVAT - totalInputVAT);

  // Also compute net revenue and expenses from the journal entries.
  // Revenue accounts (SALES_REVENUE, OTHER_REVENUE): natural balance is credit → net = credit - debit
  // Expense accounts (COST_OF_GOODS, PERSONNEL, OTHER_OPERATING, FINANCIAL_EXPENSE): natural balance is debit → net = debit - credit
  let totalRevenue = 0;
  let totalExpenses = 0;

  const REVENUE_GROUPS: string[] = ['SALES_REVENUE', 'OTHER_REVENUE'];
  const EXPENSE_GROUPS: string[] = ['COST_OF_GOODS', 'PERSONNEL', 'OTHER_OPERATING', 'FINANCIAL_EXPENSE'];

  for (const entry of entries) {
    for (const line of entry.lines) {
      const accountGroup = line.account?.group as string | undefined;
      if (!accountGroup) continue;

      if (REVENUE_GROUPS.includes(accountGroup)) {
        totalRevenue += (Number(line.credit) || 0) - (Number(line.debit) || 0);
      } else if (EXPENSE_GROUPS.includes(accountGroup)) {
        totalExpenses += (Number(line.debit) || 0) - (Number(line.credit) || 0);
      }
    }
  }

  totalRevenue = r2(totalRevenue);
  totalExpenses = r2(totalExpenses);

  return {
    outputVAT,
    inputVAT,
    totalOutputVAT,
    totalInputVAT,
    netVATPayable,
    totalRevenue,
    totalExpenses,
  };
}

// ─── Per-transaction enrichment ───────────────────────────────────────────────

/**
 * Enrich transactions with journal-entry-derived VAT data.
 *
 * For each transaction, looks up the journal entry created alongside it
 * (by reference `TX-{id}` for purchases) and extracts the VAT amount
 * and VAT code from the journal entry lines on OUTPUT_VAT / INPUT_VAT accounts.
 *
 * Returns a Map<Transaction.id, { vatAmount, vatCode, vatRate }>
 * so the caller can use journal-derived data for display.
 *
 * IMPORTANT: If no journal entry is found for a transaction, that transaction
 * will NOT appear in the returned map. Callers must NOT fall back to
 * `amount × vatPercent / 100` — if enrichment is missing, the correct VAT
 * is already captured in the summary totals via computeVATRegister().
 */
export async function enrichTransactionsWithVAT(
  transactions: Array<{
    id: string;
    type: string;
    amount: number | { toNumber(): number };
    description: string;
    vatPercent: number | { toNumber(): number };
    date: string | Date;
  }>,
  companyId: string,
): Promise<Map<string, { vatAmount: number; vatCode: string | null; vatRate: number }>> {
  const txIds = transactions.filter(t => !t.id.startsWith('inv-')).map(t => t.id);

  if (txIds.length === 0) return new Map();

  // Purchase JEs use reference = `TX-{id.slice(0, 8)}`
  const partialRefs = txIds.map(id => `TX-${id.slice(0, 8)}`);

  const journalEntries = await db.journalEntry.findMany({
    where: {
      companyId,
      cancelled: false,
      status: 'POSTED',
      OR: partialRefs.map(ref => ({
        reference: { startsWith: ref, mode: 'insensitive' },
      })),
    },
    include: {
      lines: {
        include: {
          account: { select: { id: true, number: true, group: true } },
        },
      },
    },
  });

  const result = new Map<string, { vatAmount: number; vatCode: string | null; vatRate: number }>();

  for (const je of journalEntries) {
    if (!je.reference?.startsWith('TX-')) continue;

    let vatAmount = 0;
    let vatCode: string | null = null;
    let vatRate = 0;

    for (const line of je.lines) {
      const group = line.account?.group as AccountGroup | undefined;
      const code = line.vatCode;

      if ((group === 'OUTPUT_VAT' || group === 'INPUT_VAT') && code) {
        const net = group === 'OUTPUT_VAT'
          ? (Number(line.credit) || 0) - (Number(line.debit) || 0)
          : (Number(line.debit) || 0) - (Number(line.credit) || 0);

        if (Math.abs(net) > 0.005) {
          vatAmount = Math.round(net * 100) / 100;
          vatCode = code;
          vatRate = VAT_RATE_MAP[code] ?? 0;
        }
      }
    }

    if (vatAmount > 0) {
      const shortRef = je.reference;
      const matchingTx = transactions.find(
        t => t.id.startsWith('inv-') ? false :
          `TX-${t.id.slice(0, 8)}` === shortRef ||
          `TX-${t.id}` === shortRef
      );
      if (matchingTx) {
        result.set(matchingTx.id, { vatAmount, vatCode, vatRate });
      }
    }
  }

  return result;
}

// ─── Per-invoice enrichment ───────────────────────────────────────────────────

/**
 * Derive per-invoice VAT amounts from the journal entries for invoices.
 *
 * Invoice accrual JEs use reference = `{invoiceNumber}`.
 * Cash receipt JEs use reference = `{invoiceNumber}-IND`.
 *
 * Returns a Map<invoiceNumber, { vatAmount, vatCode, vatRate }>.
 * Cash receipt entries (-IND) are skipped since they don't contain VAT lines.
 */
export async function enrichInvoicesWithVAT(
  invoiceNumbers: string[],
  companyId: string,
): Promise<Map<string, { vatAmount: number; vatCode: string | null; vatRate: number }>> {
  if (invoiceNumbers.length === 0) return new Map();

  const journalEntries = await db.journalEntry.findMany({
    where: {
      companyId,
      cancelled: false,
      status: 'POSTED',
      reference: {
        in: invoiceNumbers,
      },
    },
    include: {
      lines: {
        include: {
          account: { select: { id: true, number: true, group: true } },
        },
      },
    },
  });

  const result = new Map<string, { vatAmount: number; vatCode: string | null; vatRate: number }>();

  for (const je of journalEntries) {
    const invNumber = je.reference?.replace(/-IND$/, '');
    if (!invNumber || result.has(invNumber)) continue;
    // Skip cash receipt entries (-IND) — they don't contain VAT lines
    if (je.reference?.endsWith('-IND')) continue;

    let totalVatAmount = 0;
    let primaryCode: string | null = null;
    let primaryRate = 0;

    for (const line of je.lines) {
      const group = line.account?.group as AccountGroup | undefined;
      const code = line.vatCode;

      if ((group === 'OUTPUT_VAT' || group === 'INPUT_VAT') && code) {
        const net = group === 'OUTPUT_VAT'
          ? (Number(line.credit) || 0) - (Number(line.debit) || 0)
          : (Number(line.debit) || 0) - (Number(line.credit) || 0);

        if (Math.abs(net) > 0.005) {
          totalVatAmount += Math.round(net * 100) / 100;
          if (!primaryCode) {
            primaryCode = code;
            primaryRate = VAT_RATE_MAP[code] ?? 0;
          }
        }
      }
    }

    if (totalVatAmount > 0) {
      result.set(invNumber, { vatAmount: totalVatAmount, vatCode: primaryCode, vatRate: primaryRate });
    }
  }

  return result;
}
