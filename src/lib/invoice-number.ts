/**
 * Sequential Invoice Number Generator for AlphaFlow
 *
 * Generates human-readable, sequential invoice numbers in the format
 * AF-0001, AF-0002, AF-0003, etc. Zero-padded to 4 digits.
 *
 * Uses an atomic SQL UPDATE ... RETURNING on a single-row InvoiceCounter
 * table, which is fully concurrency-safe under PostgreSQL's MVCC.
 *
 * Usage:
 *   const invNumber = await generateSequentialInvoiceNumber();
 *   // => "AF-0001"
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

/** Format a number as a zero-padded invoice suffix (e.g. 42 → "AF-0042") */
function formatInvoiceNumber(n: number): string {
  return `AF-${String(n).padStart(4, '0')}`;
}

/**
 * Atomically increment the InvoiceCounter and return the next sequential
 * invoice number string (e.g. "AF-0001").
 *
 * The InvoiceCounter table is a single-row singleton. On the very first
 * call the row is created via upsert. Subsequent calls use an atomic
 * UPDATE ... SET next_number = next_number + 1 RETURNING.
 *
 * This is safe under concurrent access — PostgreSQL serialises the UPDATE
 * on the same row so two simultaneous calls will never get the same number.
 */
export async function generateSequentialInvoiceNumber(): Promise<string> {
  // Ensure the singleton row exists (idempotent upsert)
  await db.invoiceCounter.upsert({
    where: { id: 'singleton' },
    update: {}, // no-op if exists
    create: { id: 'singleton', nextNumber: 1 },
  });

  // Atomic increment + return new value
  // Using $queryRaw for the atomic UPDATE ... RETURNING
  const result = await db.$queryRaw<Array<{ next_number: number }>>`
    UPDATE "InvoiceCounter"
    SET "nextNumber" = "nextNumber" + 1, "updatedAt" = NOW()
    WHERE id = 'singleton'
    RETURNING "nextNumber" AS next_number
  `;

  const nextNumber = result[0]?.next_number;
  if (nextNumber == null) {
    // Fallback: shouldn't happen, but if it does, log and return a UUID-based fallback
    logger.error('[INVOICE-NUMBER] Failed to increment counter — returning fallback');
    return `AF-${Date.now().toString(36).toUpperCase()}`;
  }

  const invoiceNumber = formatInvoiceNumber(nextNumber);
  logger.info(`[INVOICE-NUMBER] Generated ${invoiceNumber}`);
  return invoiceNumber;
}
