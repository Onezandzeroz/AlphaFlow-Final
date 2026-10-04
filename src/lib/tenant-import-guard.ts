import { db } from '@/lib/db';

/**
 * tenant-import-guard.ts
 *
 * Bogføringsloven §10-12 compliance guard for one-time import flows
 * (SAF-T import — "Import fra anden udbyder").
 *
 * Background
 * ----------
 * The SAF-T import path (`POST /api/import-saft`) wipes ALL existing tenant
 * data (accounts, journal entries, lines, transactions, contacts, invoices,
 * bank statements, budgets, fiscal periods) and re-creates it from a
 * third-party SAF-T XML file. To insert/replace the new data it must run
 * with `SET LOCAL app.immutability_bypass = 'true'`, which suspends the
 * database-level immutability triggers defined in
 * `prisma/journal-immutability.sql`.
 *
 * That bypass is legitimate ONLY for a first-time migration into a tenant
 * that holds no booked data yet. Once a tenant has even a single sealed
 * POSTED journal entry, a sealed transaction, or a closed fiscal period,
 * those records are protected by Bogføringsloven §10-12 ("bogførte
 * transaktioner ikke kan ændres, tilbagedateres eller slettes") and MUST
 * NOT be overwritten.
 *
 * This guard is therefore consulted BEFORE the immutability bypass is
 * activated. If the tenant is populated, the import is refused with HTTP
 * 409 `TENANT_ALREADY_POPULATED` and the DB triggers remain fully in
 * force — so §10-12 is respected at both the application and database
 * layers.
 */

export interface TenantPopulationCounts {
  /** POSTED journal entries (status = 'POSTED'). These are booked data. */
  postedJournalEntries: number;
  /** Sealed transactions (recordHash IS NOT NULL) — immutable per §10-12. */
  sealedTransactions: number;
  /** Closed fiscal periods (status = 'CLOSED') — period lock is in effect. */
  closedFiscalPeriods: number;
}

export interface TenantPopulation {
  /** true → tenant already holds §10-12-protected data; import must be refused. */
  isPopulated: boolean;
  /** Danish human-readable summary. */
  summaryDa: string;
  /** English human-readable summary. */
  summaryEn: string;
  /** Machine-readable counts. */
  counts: TenantPopulationCounts;
}

/**
 * Inspect a tenant and report whether it already holds booked/bookkeeping
 * data protected by Bogføringsloven §10-12.
 *
 * A tenant is considered "populated" if ANY of the following is > 0:
 *   - POSTED journal entries (status = 'POSTED')
 *   - sealed transactions (recordHash IS NOT NULL)
 *   - closed fiscal periods (status = 'CLOSED')
 *
 * DRAFT journal entries (no recordHash, status = 'DRAFT') are NOT counted —
 * they are not yet booked and may be discarded, so a tenant that only holds
 * drafts is still eligible for import.
 *
 * @param companyId The tenant to inspect.
 * @returns A {@link TenantPopulation} describing the tenant's state.
 */
export async function getTenantPopulation(companyId: string): Promise<TenantPopulation> {
  const [postedJournalEntries, sealedTransactions, closedFiscalPeriods] = await Promise.all([
    db.journalEntry.count({
      where: { companyId, status: 'POSTED' },
    }),
    db.transaction.count({
      where: { companyId, recordHash: { not: null } },
    }),
    db.fiscalPeriod.count({
      where: { companyId, status: 'CLOSED' },
    }),
  ]);

  const counts: TenantPopulationCounts = {
    postedJournalEntries,
    sealedTransactions,
    closedFiscalPeriods,
  };

  const isPopulated =
    postedJournalEntries > 0 || sealedTransactions > 0 || closedFiscalPeriods > 0;

  const summaryDa = isPopulated
    ? `Virksomheden indeholder allerede bogførte data (${postedJournalEntries} bogført${postedJournalEntries === 1 ? '' : 'e'} journalpost${postedJournalEntries === 1 ? 'er' : 'er'}, ${sealedTransactions} forseglet${sealedTransactions === 1 ? '' : 'e'} postering${sealedTransactions === 1 ? '' : 'er'}, ${closedFiscalPeriods} lukket${closedFiscalPeriods === 1 ? '' : 'e'} regnskabsperiode${closedFiscalPeriods === 1 ? '' : 'r'}). Import afvist jf. Bogføringsloven §10-12.`
    : 'Virksomheden indeholder ingen bogførte data — import er tilladt (førstegangs overflytning fra andet system).';

  const summaryEn = isPopulated
    ? `This tenant already contains booked data (${postedJournalEntries} posted journal ${postedJournalEntries === 1 ? 'entry' : 'entries'}, ${sealedTransactions} sealed ${sealedTransactions === 1 ? 'transaction' : 'transactions'}, ${closedFiscalPeriods} closed fiscal ${closedFiscalPeriods === 1 ? 'period' : 'periods'}). Import refused per the Danish Bookkeeping Act §10-12.`
    : 'This tenant contains no booked data — import is allowed (first-time migration from another system).';

  return { isPopulated, summaryDa, summaryEn, counts };
}
