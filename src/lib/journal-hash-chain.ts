/**
 * Cryptographic Hash-Chain Integrity for Posted Journal Entries & Transactions
 *
 * Implements Bogføringsloven §10-12 + BEK 97 Bilag 1, 2, e (Rows 11, 15):
 * "bogførte transaktioner ikke kan ændres, tilbagedateres eller slettes"
 * (posted transactions cannot be changed, backdated, or deleted).
 *
 * DESIGN
 * ────────────────────────────────────────────────────────────────────
 * Each POSTED JournalEntry (and each Transaction) carries:
 *   • recordHash   — SHA-256(canonical(entry fields + lines) || previousHash)
 *   • previousHash — recordHash of the previous POSTED entry in the chain
 *   • hashedAt     — when the hash was computed (audit timestamp)
 *
 * The chain is per-tenant: each company has its own independent chain.
 * Walking the chain lets an auditor detect ANY mutation of a posted entry
 * (because recomputing the hash from current DB fields won't match the
 * stored recordHash) or any reordering/insertion (because previousHash
 * won't match the previous entry's recordHash).
 *
 * WHEN SEALING HAPPENS
 * ────────────────────────────────────────────────────────────────────
 * Sealing (computing + storing the hash) happens AT the POSTED transition,
 * inside the same db.$transaction that flips the status. This means the
 * entry never exists in a "posted but unsealed" state from the perspective
 * of an outside connection — the COMMIT makes both visible atomically.
 *
 * BACKDATING PREVENTION
 * ────────────────────────────────────────────────────────────────────
 * Before sealing, the caller checks the FiscalPeriod table for a CLOSED
 * period covering the entry's date. If found, the request is rejected with
 * HTTP 400. See assertNotClosedFiscalPeriod() below.
 *
 * DATABASE-LEVEL IMMUTABILITY
 * ────────────────────────────────────────────────────────────────────
 * Once recordHash is set, the row is fully immutable: PostgreSQL triggers
 * (prisma/journal-immutability.sql) block UPDATE and DELETE on rows where
 * status = 'POSTED' AND recordHash IS NOT NULL. The hash itself therefore
 * cannot be silently recomputed by a compromised DB connection.
 */

import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// Prisma.Decimal is the runtime Decimal type for @db.Decimal columns.
// Note: Prisma's TypeScript types show these fields as Decimal, but the
// db.ts decimalSerializer extension converts them to native numbers at
// query time. We accept either form defensively.
type Decimal = Prisma.Decimal;

// ─── Prisma transaction client type (same pattern as voucher-number.ts) ────
type PrismaTransaction = Parameters<Parameters<typeof db.$transaction>[0]>[0];

// ─── Hash input shapes ───────────────────────────────────────────────────

export interface HashableJournalLine {
  accountId: string;
  debit: number | Decimal;
  credit: number | Decimal;
  vatCode?: string | null;
}

export interface HashableJournalEntry {
  date: Date | string;
  description: string;
  reference?: string | null;
  voucherNumber?: string | null;
  lines: HashableJournalLine[];
}

export interface HashableTransaction {
  date: Date | string;
  type: string;
  amount: number | Decimal;
  currency: string;
  description: string;
  vatPercent: number | Decimal;
  documentType?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Normalize a Decimal/number/string to a deterministic string for hashing.
 * Uses 2 decimal places so 100, 100.0, 100.00 all hash identically.
 */
function normalizeAmount(value: number | Decimal | string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const num = typeof value === 'number' ? value : Number(value);
  if (!isFinite(num)) return String(value);
  return num.toFixed(2);
}

/**
 * Normalize a Date or ISO string to a canonical ISO string for hashing.
 */
function normalizeDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString();
}

/**
 * Sort lines deterministically by accountId + debit + credit so reordering
 * lines doesn't change the hash. The order is stable across DB reloads.
 */
function sortLines(lines: HashableJournalLine[]): HashableJournalLine[] {
  return [...lines].sort((a, b) => {
    if (a.accountId !== b.accountId) return a.accountId < b.accountId ? -1 : 1;
    const da = Number(normalizeAmount(a.debit));
    const db = Number(normalizeAmount(b.debit));
    if (da !== db) return da - db;
    const ca = Number(normalizeAmount(a.credit));
    const cb = Number(normalizeAmount(b.credit));
    return ca - cb;
  });
}

// ─── 1) JournalEntry hash computation (pure function) ────────────────────

/**
 * Compute the SHA-256 recordHash for a JournalEntry.
 *
 * Canonical form (UTF-8):
 *   previousHash|ISO(date)|description|reference|voucherNumber|line1||line2||...
 *
 * where each line is `accountId:debit:credit:vatCode` (amounts at 2dp).
 * Lines are sorted by (accountId, debit, credit) for determinism.
 */
export function computeEntryHash(
  entry: HashableJournalEntry,
  previousHash: string | null
): string {
  const dateIso = normalizeDate(entry.date);
  const ref = entry.reference ?? '';
  const voucher = entry.voucherNumber ?? '';

  const linesPart = sortLines(entry.lines)
    .map(
      (l) =>
        `${l.accountId}:${normalizeAmount(l.debit)}:${normalizeAmount(l.credit)}:${l.vatCode ?? ''}`
    )
    .join('||');

  const canonical = `${previousHash ?? ''}|${dateIso}|${entry.description}|${ref}|${voucher}|${linesPart}`;

  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

// ─── 2) sealJournalEntry — called at POSTED transition ───────────────────

/**
 * Seal a JournalEntry by computing its recordHash and linking it to the
 * previous POSTED entry's recordHash. MUST run inside the same transaction
 * that flips the status to POSTED.
 *
 * @param tx Prisma transaction client (from db.$transaction callback)
 * @param entryId The journal entry ID being sealed
 * @param companyId The tenant that owns the entry
 * @returns { recordHash, previousHash } — the values written to the row
 */
export async function sealJournalEntry(
  tx: PrismaTransaction,
  entryId: string,
  companyId: string
): Promise<{ recordHash: string; previousHash: string | null }> {
  // Find the most-recently-sealed POSTED entry for this tenant — that's
  // our chain link. Ordering by hashedAt (with a tiebreak on id) gives a
  // deterministic "previous" even when multiple entries were sealed in the
  // same millisecond.
  const previous = await tx.journalEntry.findFirst({
    where: {
      companyId,
      status: 'POSTED',
      recordHash: { not: null },
    },
    orderBy: [{ hashedAt: 'desc' }, { id: 'desc' }],
    select: { id: true, recordHash: true },
  });

  const previousHash = previous?.recordHash ?? null;

  // Load the entry being sealed WITH its lines — the hash covers the lines.
  const entry = await tx.journalEntry.findUniqueOrThrow({
    where: { id: entryId },
    include: { lines: true },
  });

  const recordHash = computeEntryHash(
    {
      date: entry.date,
      description: entry.description,
      reference: entry.reference,
      voucherNumber: entry.voucherNumber,
      lines: entry.lines.map((l) => ({
        accountId: l.accountId,
        debit: l.debit as unknown as number,
        credit: l.credit as unknown as number,
        vatCode: l.vatCode as string | null,
      })),
    },
    previousHash
  );

  await tx.journalEntry.update({
    where: { id: entryId },
    data: {
      recordHash,
      previousHash,
      hashedAt: new Date(),
    },
  });

  logger.info(
    `[HASH-CHAIN] Sealed JournalEntry ${entryId} (voucher=${entry.voucherNumber ?? 'n/a'}, prevHash=${previousHash?.slice(0, 12) ?? 'null'}…, hash=${recordHash.slice(0, 12)}…)`
  );

  return { recordHash, previousHash };
}

// ─── 3) verifyJournalEntryIntegrity (auditor — pure function) ────────────

export interface IntegrityVerification {
  valid: boolean;
  computedHash: string;
  storedHash: string | null;
}

/**
 * Recompute the hash for a single entry from its current fields + an
 * expected previousHash, and compare to the stored recordHash.
 *
 * Used by auditors to detect tampering of a single entry. For full
 * chain verification (including link integrity), use verifyTenantChainIntegrity.
 */
export function verifyJournalEntryIntegrity(
  entry: HashableJournalEntry & {
    recordHash: string | null;
    previousHash: string | null;
  },
  expectedPreviousHash: string | null
): IntegrityVerification {
  const computedHash = computeEntryHash(entry, expectedPreviousHash);
  return {
    valid: computedHash === entry.recordHash,
    computedHash,
    storedHash: entry.recordHash,
  };
}

// ─── 4) verifyTenantChainIntegrity (auditor — walks the whole chain) ─────

export interface BrokenEntry {
  entryId: string;
  voucherNumber: string | null;
  date: Date;
  reason: string;
}

export interface ChainIntegrityReport {
  totalChecked: number;
  valid: number;
  broken: number;
  brokenEntries: BrokenEntry[];
}

/**
 * Walk the entire POSTED chain for a tenant and verify every link.
 *
 * For each entry, two checks:
 *   1. The stored `previousHash` matches the previous entry's `recordHash`.
 *      (Detects chain reordering / insertion.)
 *   2. Recomputing the hash from the entry's current fields + the previous
 *      entry's stored recordHash matches the entry's stored `recordHash`.
 *      (Detects mutation of any field included in the canonical form.)
 *
 * Returns a structured report. Auditors call this via the
 * /api/journal-entries/verify-integrity endpoint.
 */
export async function verifyTenantChainIntegrity(
  companyId: string
): Promise<ChainIntegrityReport> {
  const entries = await db.journalEntry.findMany({
    where: {
      companyId,
      status: 'POSTED',
      recordHash: { not: null },
    },
    orderBy: [{ hashedAt: 'asc' }, { id: 'asc' }],
    include: { lines: true },
  });

  const brokenEntries: BrokenEntry[] = [];
  let prevRecordHash: string | null = null;
  let validCount = 0;

  for (const entry of entries) {
    const reasons: string[] = [];

    // Check 1: previousHash link integrity
    if (entry.previousHash !== prevRecordHash) {
      reasons.push(
        `previousHash mismatch: stored=${entry.previousHash?.slice(0, 12) ?? 'null'}…, expected=${prevRecordHash?.slice(0, 12) ?? 'null'}…`
      );
    }

    // Check 2: recompute hash from current fields
    const recomputed = computeEntryHash(
      {
        date: entry.date,
        description: entry.description,
        reference: entry.reference,
        voucherNumber: entry.voucherNumber,
        lines: entry.lines.map((l) => ({
          accountId: l.accountId,
          debit: l.debit as unknown as number,
          credit: l.credit as unknown as number,
          vatCode: l.vatCode as string | null,
        })),
      },
      prevRecordHash // use the previous entry's stored hash (not this entry's previousHash field)
    );

    if (recomputed !== entry.recordHash) {
      reasons.push(
        `recordHash mismatch: stored=${entry.recordHash?.slice(0, 12) ?? 'null'}…, recomputed=${recomputed.slice(0, 12)}…`
      );
    }

    if (reasons.length === 0) {
      validCount++;
    } else {
      brokenEntries.push({
        entryId: entry.id,
        voucherNumber: entry.voucherNumber,
        date: entry.date,
        reason: reasons.join('; '),
      });
    }

    // Advance the chain pointer to this entry's stored hash. If this
    // entry was tampered with, the next entry's previousHash will likely
    // also mismatch — which is exactly what we want to surface.
    prevRecordHash = entry.recordHash;
  }

  return {
    totalChecked: entries.length,
    valid: validCount,
    broken: brokenEntries.length,
    brokenEntries,
  };
}

// ─── 5) Transaction hash computation + sealing ──────────────────────────
//
// Transactions are the simpler "single-leg" bookkeeping record (sales,
// purchases, salaries, bank entries). They don't have a DRAFT→POSTED
// lifecycle — they're created directly in their final state. We seal
// them at creation time using the same SHA-256 chain pattern.

/**
 * Compute the SHA-256 recordHash for a Transaction.
 *
 * Canonical form:
 *   previousHash|ISO(date)|type|amount(2dp)|currency|description|vatPercent(2dp)|documentType
 */
export function computeTransactionHash(
  tx: HashableTransaction,
  previousHash: string | null
): string {
  const canonical =
    `${previousHash ?? ''}|${normalizeDate(tx.date)}|${tx.type}|${normalizeAmount(tx.amount)}` +
    `|${tx.currency}|${tx.description}|${normalizeAmount(tx.vatPercent)}|${tx.documentType ?? ''}`;

  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Seal a Transaction by computing its recordHash and linking it to the
 * previous sealed Transaction in the tenant's chain.
 *
 * MUST run inside the same transaction that creates the Transaction.
 */
export async function sealTransaction(
  tx: PrismaTransaction,
  transactionId: string,
  companyId: string
): Promise<{ recordHash: string; previousHash: string | null }> {
  const previous = await tx.transaction.findFirst({
    where: {
      companyId,
      recordHash: { not: null },
    },
    orderBy: [{ hashedAt: 'desc' }, { id: 'desc' }],
    select: { id: true, recordHash: true },
  });

  const previousHash = previous?.recordHash ?? null;

  const transaction = await tx.transaction.findUniqueOrThrow({
    where: { id: transactionId },
  });

  const recordHash = computeTransactionHash(
    {
      date: transaction.date,
      type: transaction.type,
      amount: transaction.amount as unknown as number,
      currency: transaction.currency,
      description: transaction.description,
      vatPercent: transaction.vatPercent as unknown as number,
      documentType: transaction.documentType,
    },
    previousHash
  );

  await tx.transaction.update({
    where: { id: transactionId },
    data: {
      recordHash,
      previousHash,
      hashedAt: new Date(),
    },
  });

  logger.info(
    `[HASH-CHAIN] Sealed Transaction ${transactionId} (type=${transaction.type}, prevHash=${previousHash?.slice(0, 12) ?? 'null'}…, hash=${recordHash.slice(0, 12)}…)`
  );

  return { recordHash, previousHash };
}

// ─── 6) Backdating prevention helper ────────────────────────────────────

/**
 * Check whether the given date falls inside a CLOSED FiscalPeriod for the
 * tenant. If so, the caller MUST reject the request (HTTP 400) — Danish
 * bookkeeping law forbids posting into closed periods.
 *
 * The FiscalPeriod model has (companyId, year, month) as the unique key.
 * JS months are 0-indexed, so we add 1 when querying.
 *
 * Returns the closed period if found, or null otherwise.
 */
export async function findClosedFiscalPeriod(
  companyId: string,
  entryDate: Date
): Promise<{ id: string; year: number; month: number } | null> {
  const year = entryDate.getFullYear();
  const month = entryDate.getMonth() + 1; // JS: 0-11 → DB: 1-12

  const closed = await db.fiscalPeriod.findFirst({
    where: {
      companyId,
      status: 'CLOSED',
      year,
      month,
    },
    select: { id: true, year: true, month: true },
  });

  return closed;
}

// Re-export Prisma types for callers that need them
export type { Prisma };
