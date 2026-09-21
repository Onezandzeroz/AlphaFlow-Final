/**
 * GET /api/journal-entries/verify-numbering
 *
 * Auditor endpoint: tjekker om bilagsnumrene er fortløbende uden huller
 * for den aktive tenant. Påkrævet af Bogføringsloven §14 + BEK 97 Bilag 2,
 * række 11 — "fortløbende, entydig bilagsnummerering".
 *
 * Forskellig fra /api/journal-entries/verify-integrity (som verificerer
 * hash-chain integritet — at bilag ikke er blevet tamperet med). Denne
 * route verificerer SEKVENS-integritet — at der ikke er huller i numrene.
 *
 * Hvor huller kan opstå:
 *   - En transaction der inkrementerer sekvensen (nextJournalSequence) men
 *     ruller tilbage før bilaget oprettes. PostgreSQL increment er ikke
 *     transactional for sequences i praksis — rollback "forbruger" nummeret.
 *   - Manuel DB-manipulation (sjældent, men muligt)
 *   - Fremtidige kodefejl
 *
 * Response (200):
 *   {
 *     report: {
 *       totalChecked: number,           // antal POSTED bilag undersøgt
 *       yearBreakdown: Array<{
 *         year: number,
 *         count: number,
 *         minSeq: number,                // laveste sekvens (f.eks. 1)
 *         maxSeq: number,                // højeste sekvens (f.eks. 42)
 *         expectedCount: number,         // maxSeq - minSeq + 1
 *         gaps: Array<{                 // huller i serien
 *           fromSeq: number,
 *           toSeq: number,
 *           count: number               // toSeq - fromSeq + 1
 *         }>,
 *         duplicates: Array<{            // sjældent — samme nummer brugt 2+ gange
 *           voucherNumber: string,
 *           count: number
 *         }>,
 *         outOfOrder: Array<{           // bilag der er bogført "efter" et lavere nummer
 *           voucherNumber: string,
 *           date: string,
 *           expectedAfter: string
 *         }>,
 *       }>,
 *       totalGaps: number,
 *       totalDuplicates: number,
 *       totalOutOfOrder: number,
 *     },
 *     verifiedAt: string,
 *     companyId: string
 *   }
 *
 * RBAC: DATA_READ (VIEWER+, ACCOUNTANT, ADMIN, OWNER, AUDITOR). SuperDev
 * oversight tilladt (read-only verification på tværs af tenants).
 *
 * Rate-limited til 2/min per user — gap-detection er en tung query der
 * loader alle POSTED entries for tenanten.
 */

import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { tenantFilter, Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { auditLog, requestMetadata } from '@/lib/audit';

interface VoucherGap {
  fromSeq: number;
  toSeq: number;
  count: number;
}

interface VoucherDuplicate {
  voucherNumber: string;
  count: number;
}

interface OutOfOrderEntry {
  voucherNumber: string;
  date: string;
  expectedAfter: string;
}

interface YearBreakdown {
  year: number;
  count: number;
  minSeq: number;
  maxSeq: number;
  expectedCount: number;
  gaps: VoucherGap[];
  duplicates: VoucherDuplicate[];
  outOfOrder: OutOfOrderEntry[];
}

interface NumberingReport {
  totalChecked: number;
  yearBreakdown: YearBreakdown[];
  totalGaps: number;
  totalDuplicates: number;
  totalOutOfOrder: number;
}

/**
 * Parse a voucher number into (year, seq).
 *
 * Supports TWO formats:
 *   1. Legacy: "BIL-2026-0042" → { year: 2026, seq: 42 }
 *   2. New:    "42"             → { year: <booking year from entry.date>, seq: 42 }
 *
 * For the new plain-numeric format, the year is derived from the entry's
 * booking date (passed as the `fallbackYear` parameter) since the number
 * itself doesn't carry year information.
 *
 * Returns null if the format doesn't match either pattern.
 */
function parseVoucherNumber(
  voucherNumber: string,
  fallbackYear?: number,
): { year: number; seq: number } | null {
  // Try legacy format first: "PREFIX-YYYY-NNNN"
  const legacyMatch = voucherNumber.match(/^(.+)-(\d{4})-(\d+)$/);
  if (legacyMatch) {
    return {
      year: parseInt(legacyMatch[2], 10),
      seq: parseInt(legacyMatch[3], 10),
    };
  }
  // New format: just a number "42"
  if (/^\d+$/.test(voucherNumber)) {
    return {
      year: fallbackYear ?? new Date().getFullYear(),
      seq: parseInt(voucherNumber, 10),
    };
  }
  return null;
}

/**
 * Detect gaps in a sorted sequence of numbers.
 * Returns array of {fromSeq, toSeq, count} for each gap found.
 *
 * Example: [1, 2, 4, 5, 8] → [{fromSeq: 3, toSeq: 3, count: 1}, {fromSeq: 6, toSeq: 7, count: 2}]
 */
function detectGaps(sortedSeqs: number[]): VoucherGap[] {
  const gaps: VoucherGap[] = [];
  for (let i = 1; i < sortedSeqs.length; i++) {
    const prev = sortedSeqs[i - 1];
    const curr = sortedSeqs[i];
    if (curr > prev + 1) {
      const fromSeq = prev + 1;
      const toSeq = curr - 1;
      gaps.push({ fromSeq, toSeq, count: toSeq - fromSeq + 1 });
    }
  }
  return gaps;
}

export const GET = withGuard(
  {
    auth: true,
    requireCompany: true,
    permissions: [Permission.DATA_READ],
  },
  async (request, ctx) => {
    try {
      // Rate limit: 2/min per user.
      const rlKey = `verify-numbering:${ctx.id}`;
      const rl = rateLimit(rlKey, {
        maxRequests: 2,
        windowMs: 60 * 1000,
        message: 'Too many numbering verification requests. Please try again later.',
      });
      if (!rl.allowed) {
        return NextResponse.json(
          {
            error:
              'For mange anmodninger om nummereringsverifikation. Prøv igen senere. / Too many numbering verification requests.',
            retryAfter: rl.resetAt,
          },
          {
            status: 429,
            headers: {
              'Retry-After': String(
                Math.ceil((rl.resetAt - Date.now()) / 1000),
              ),
            },
          },
        );
      }

      // ── Load all POSTED entries with voucherNumber for this tenant ──
      // Sorted by createdAt (booking sequence) — not by voucherNumber.
      // This lets us detect both gaps AND out-of-order assignment.
      const entries = await db.journalEntry.findMany({
        where: {
          ...tenantFilter(ctx),
          status: 'POSTED',
          voucherNumber: { not: null },
          cancelled: false,
        },
        select: {
          id: true,
          voucherNumber: true,
          date: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      // ── Group by year (parsed from voucherNumber) ──
      const byYear = new Map<number, Array<{
        id: string;
        voucherNumber: string;
        seq: number;
        date: Date;
        createdAt: Date;
      }>>();

      let unparseableCount = 0;
      for (const entry of entries) {
        // For new plain-numeric format, derive year from entry.date
        const fallbackYear = entry.date ? new Date(entry.date).getFullYear() : undefined;
        const parsed = parseVoucherNumber(entry.voucherNumber!, fallbackYear);
        if (!parsed) {
          unparseableCount++;
          logger.warn('[VERIFY-NUMBERING] Unparseable voucherNumber', {
            entryId: entry.id,
            voucherNumber: entry.voucherNumber,
          });
          continue;
        }
        const arr = byYear.get(parsed.year) ?? [];
        arr.push({
          id: entry.id,
          voucherNumber: entry.voucherNumber!,
          seq: parsed.seq,
          date: entry.date,
          createdAt: entry.createdAt,
        });
        byYear.set(parsed.year, arr);
      }

      // ── Build per-year breakdown ──
      const yearBreakdown: YearBreakdown[] = [];
      let totalGaps = 0;
      let totalDuplicates = 0;
      let totalOutOfOrder = 0;

      for (const [year, yearEntries] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
        // Detect duplicates — group by voucherNumber, find counts > 1
        const counts = new Map<string, number>();
        for (const e of yearEntries) {
          counts.set(e.voucherNumber, (counts.get(e.voucherNumber) ?? 0) + 1);
        }
        const duplicates: VoucherDuplicate[] = [];
        for (const [voucherNumber, count] of counts) {
          if (count > 1) {
            duplicates.push({ voucherNumber, count });
          }
        }

        // Detect gaps — sort by seq, find missing numbers
        const seqs = yearEntries.map((e) => e.seq).sort((a, b) => a - b);
        const minSeq = seqs.length > 0 ? seqs[0] : 0;
        const maxSeq = seqs.length > 0 ? seqs[seqs.length - 1] : 0;
        const expectedCount = maxSeq - minSeq + 1;
        const gaps = detectGaps(seqs);

        // Detect out-of-order — entries where createdAt is BEFORE an entry
        // with a LOWER seq number (i.e. a higher seq was assigned first).
        // This can happen if transactions commit out-of-order due to
        // concurrency, or if backdated entries get a newer seq.
        const outOfOrder: OutOfOrderEntry[] = [];
        let maxSeqSoFar = 0;
        for (const e of yearEntries) {
          // yearEntries is sorted by createdAt asc
          if (e.seq < maxSeqSoFar) {
            outOfOrder.push({
              voucherNumber: e.voucherNumber,
              date: e.date.toISOString(),
              expectedAfter: `BIL-${year}-${String(maxSeqSoFar).padStart(4, '0')}`,
            });
          }
          if (e.seq > maxSeqSoFar) {
            maxSeqSoFar = e.seq;
          }
        }

        yearBreakdown.push({
          year,
          count: yearEntries.length,
          minSeq,
          maxSeq,
          expectedCount,
          gaps,
          duplicates,
          outOfOrder,
        });

        totalGaps += gaps.reduce((sum, g) => sum + g.count, 0);
        totalDuplicates += duplicates.length;
        totalOutOfOrder += outOfOrder.length;
      }

      const report: NumberingReport = {
        totalChecked: entries.length,
        yearBreakdown,
        totalGaps,
        totalDuplicates,
        totalOutOfOrder,
      };

      // Audit log the verification
      await auditLog({
        action: 'OVERSIGHT',
        entityType: 'JournalEntry',
        entityId: 'verify-numbering',
        userId: ctx.id,
        companyId: ctx.activeCompanyId,
        changes: {},
        metadata: {
          source: 'verify-numbering',
          endpoint: '/api/journal-entries/verify-numbering',
          totalChecked: entries.length,
          totalGaps,
          totalDuplicates,
          totalOutOfOrder,
          unparseableCount,
          ...requestMetadata(request),
        },
      });

      logger.info('[VERIFY-NUMBERING] Completed', {
        companyId: ctx.activeCompanyId,
        totalChecked: entries.length,
        totalGaps,
        totalDuplicates,
        totalOutOfOrder,
        unparseableCount,
      });

      return NextResponse.json({
        report,
        verifiedAt: new Date().toISOString(),
        companyId: ctx.activeCompanyId,
        unparseableCount,
      });
    } catch (error) {
      logger.error('[VERIFY-NUMBERING] Failed:', error);
      return NextResponse.json(
        { error: 'Kunne ikke verificere bilagsnummerering' },
        { status: 500 },
      );
    }
  },
);
