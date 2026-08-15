/**
 * GET /api/journal-entries/verify-integrity
 *
 * Auditor endpoint: walks the cryptographic hash chain for the active
 * tenant and returns a report of any tampered or chain-broken POSTED
 * journal entries.
 *
 * Required by Danish Business Authority compliance review (Krav 11, 15,
 * rows 11 + 15 — Bogføringsloven §10-12 + BEK 97 Bilag 1, 2, e):
 *   "bogførte transaktioner ikke kan ændres, tilbagedateres eller slettes"
 *
 * RBAC: any user with DATA_READ permission (VIEWER, ACCOUNTANT, ADMIN,
 * OWNER, plus AUDITOR — the explicit audit role). SuperDev always passes
 * (read-only oversight across tenants is allowed for verification).
 *
 * Rate-limited to 2 requests per minute per user — chain verification is
 * a heavy query that loads every POSTED entry for the tenant with its
 * lines. Two per minute is generous for an interactive auditor dashboard
 * while preventing abuse.
 *
 * Response (200):
 *   {
 *     report: {
 *       totalChecked: number,
 *       valid: number,
 *       broken: number,
 *       brokenEntries: Array<{ entryId, voucherNumber, date, reason }>
 *     },
 *     verifiedAt: string (ISO timestamp),
 *     companyId: string
 *   }
 *
 * Response (429): rate-limited
 * Response (500): internal error
 */

import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { verifyTenantChainIntegrity } from '@/lib/journal-hash-chain';
import { auditLog, requestMetadata } from '@/lib/audit';

// GET /api/journal-entries/verify-integrity — Verify the hash chain for the active tenant
export const GET = withGuard(
  {
    auth: true,
    requireCompany: true,
    // DATA_READ — auditors, accountants, admins, owners all qualify.
    // SuperDev oversight mode is allowed (read-only verification).
    permissions: [Permission.DATA_READ],
  },
  async (request, ctx) => {
    try {
      // Rate limit: 2/min per user. Chain verification is a heavy query.
      const rlKey = `verify-integrity:${ctx.id}`;
      const rl = rateLimit(rlKey, {
        maxRequests: 2,
        windowMs: 60 * 1000,
        message: 'Too many integrity verification requests. Please try again later.',
      });
      if (!rl.allowed) {
        return NextResponse.json(
          {
            error:
              'For mange anmodninger om integritetsverifikation. Prøv igen senere. / Too many integrity verification requests. Please try again later.',
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

      const companyId = ctx.activeCompanyId!;

      // Run the chain walk. The function is defensive (catches DB errors
      // internally and reports them as broken entries with reason strings),
      // but we keep the try/catch as a belt-and-braces safety net.
      let report;
      try {
        report = await verifyTenantChainIntegrity(companyId);
      } catch (verifyError) {
        logger.error('[VERIFY-INTEGRITY] verifyTenantChainIntegrity threw:', verifyError);
        return NextResponse.json(
          {
            error: 'Integritetsverifikation fejlede. / Integrity verification failed.',
            detail: verifyError instanceof Error ? verifyError.message : 'Unknown error',
          },
          { status: 500 },
        );
      }

      // Audit-log the verification run so there's a tamper-evident trail
      // of WHO ran the audit and WHEN. Even if the report finds no
      // broken entries, the fact that an audit was performed is itself
      // a compliance event.
      await auditLog({
        action: 'OVERSIGHT',
        entityType: 'JournalEntry',
        entityId: companyId, // no single entity — use the tenant as the scope
        userId: ctx.id,
        companyId,
        performedByUserId: ctx.id,
        metadata: {
          type: 'hash_chain_verification',
          totalChecked: report.totalChecked,
          valid: report.valid,
          broken: report.broken,
          brokenEntryIds: report.brokenEntries.map((e) => e.entryId),
          ...requestMetadata(request),
        },
      });

      return NextResponse.json({
        report,
        verifiedAt: new Date().toISOString(),
        companyId,
      });
    } catch (error) {
      logger.error('[VERIFY-INTEGRITY] Unexpected error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  },
);
