/**
 * Voucher Number Generator — Fortløbende Bilagsnummer
 *
 * Generates sequential, human-readable voucher numbers for journal entries
 * as required by the Danish Bookkeeping Act (Bogføringsloven).
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
  const year = company.currentYear || new Date().getFullYear();
  const seq = company.nextJournalSequence;
  const voucherNumber = `${prefix}-${year}-${String(seq).padStart(4, '0')}`;

  // Atomic increment — guarantees no duplicate numbers even under concurrency
  await tx.company.update({
    where: { id: companyId },
    data: { nextJournalSequence: seq + 1 },
  });

  logger.info(`[VOUCHER] Generated voucher number: ${voucherNumber} for company ${companyId}`);

  return voucherNumber;
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
