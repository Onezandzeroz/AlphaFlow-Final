/**
 * Voucher Number Generator — Fortløbende Bilagsnummer
 *
 * Generates sequential, human-readable voucher numbers for journal entries
 * as required by the Danish Bookkeeping Act (Bogføringsloven §14 + BEK 97
 * Bilag 2, række 11).
 *
 * Format: {journalPrefix}-{year}-{seq:04d}
 * Example: BIL-2026-0001, BIL-2026-0002, ...
 *
 * The voucher number is assigned atomically within a database transaction
 * to guarantee sequential ordering without gaps (no race conditions).
 *
 * Voucher numbers are ONLY assigned when a journal entry's status becomes
 * POSTED (not for DRAFT entries). This ensures that the numbering follows
 * the actual booking sequence, not the creation sequence.
 *
 * ─── Year-rollover (GAP V-2 fix) ──────────────────────────────────────
 * If the current calendar year differs from Company.currentYear, the
 * sequence resets to 1 and currentYear is updated. This mirrors the
 * year-rollover logic already used for invoices (invoices/route.ts:159).
 *
 * Example: tenant created in 2026, first voucher in 2027 → BIL-2027-0001
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// Transaction client type from Prisma
type PrismaTransactionClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * Generate the next sequential voucher number for a company.
 * MUST be called within a $transaction for atomicity.
 *
 * @param tx - Prisma transaction client (from db.$transaction callback)
 * @param companyId - The company ID to generate a voucher number for
 * @returns The generated voucher number (e.g., "BIL-2026-0001")
 * @throws Error if company not found
 */
export async function generateVoucherNumber(
  tx: PrismaTransactionClient,
  companyId: string
): Promise<string> {
  const company = await tx.company.findUnique({
    where: { id: companyId },
    select: { journalPrefix: true, nextJournalSequence: true, currentYear: true },
  });

  if (!company) throw new Error('Company not found');

  const prefix = company.journalPrefix || 'BIL';
  const actualYear = new Date().getFullYear();

  // ── Year-rollover check (GAP V-2 fix) ──
  //
  // If Company.currentYear is stale (different from the actual calendar
  // year), the sequence resets to 1 and currentYear is updated. This
  // ensures voucher numbers reflect the year they were actually booked.
  //
  // Edge case: if a tenant backdates entries to the previous year after
  // the rollover has happened, those entries will get the NEW year's
  // sequence. This is acceptable — Bogføringsloven requires the number
  // to follow the booking sequence, not the entry date. If the tenant
  // needs to book entries in an old year, they should close the old
  // year last (via year-end-closing) before the rollover triggers.
  const yearRolled = company.currentYear !== actualYear;
  const year = yearRolled ? actualYear : (company.currentYear || actualYear);
  const seq = yearRolled ? 1 : company.nextJournalSequence;
  const voucherNumber = `${prefix}-${year}-${String(seq).padStart(4, '0')}`;

  // Atomic update — increments sequence + syncs currentYear in one shot.
  // If yearRolled, the sequence resets to 1 → next call gets seq=2.
  await tx.company.update({
    where: { id: companyId },
    data: {
      nextJournalSequence: seq + 1,
      currentYear: year,
    },
  });

  if (yearRolled) {
    logger.info(
      `[VOUCHER] Year rollover detected — sequence reset to 1 for ${year}. Previous: ${company.currentYear} #${company.nextJournalSequence}`,
      { companyId, previousYear: company.currentYear, newYear: year }
    );
  }

  logger.info(`[VOUCHER] Generated voucher number: ${voucherNumber} for company ${companyId}`);

  return voucherNumber;
}

/**
 * Preview the next voucher number WITHOUT consuming it.
 *
 * Used by the UI to show "Next voucher number: BIL-2026-0042" in the
 * journal entry form, so the user knows what number their entry will get
 * when posted. Pure read — does NOT increment the sequence.
 *
 * Note: the returned number is a PREDICTION. Under concurrent load, two
 * users may both see "BIL-2026-0042" — only the first to commit will
 * actually get it. The second will get 0043. This is acceptable for
 * preview purposes.
 *
 * @param companyId - The company ID to preview the next voucher for
 * @returns The predicted voucher number (e.g., "BIL-2026-0001")
 */
export async function previewNextVoucherNumber(
  companyId: string
): Promise<string> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { journalPrefix: true, nextJournalSequence: true, currentYear: true },
  });

  if (!company) {
    return '—';
  }

  const prefix = company.journalPrefix || 'BIL';
  const actualYear = new Date().getFullYear();
  // Apply same year-rollover logic as generateVoucherNumber for consistency
  const yearRolled = company.currentYear !== actualYear;
  const year = yearRolled ? actualYear : (company.currentYear || actualYear);
  const seq = yearRolled ? 1 : company.nextJournalSequence;

  return `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
}

/**
 * Assign a voucher number to a journal entry if its status is POSTED.
 * This is a convenience function that checks the status before assigning.
 *
 * @param tx - Prisma transaction client
 * @param journalEntryId - The journal entry ID
 * @param companyId - The company ID
 * @param status - The current/new status of the journal entry
 * @returns The assigned voucher number, or null if not POSTED
 */
export async function assignVoucherNumberIfPosted(
  tx: PrismaTransactionClient,
  journalEntryId: string,
  companyId: string,
  status: string
): Promise<string | null> {
  if (status !== 'POSTED') return null;

  const voucherNumber = await generateVoucherNumber(tx, companyId);
  await tx.journalEntry.update({
    where: { id: journalEntryId },
    data: { voucherNumber },
  });

  return voucherNumber;
}
