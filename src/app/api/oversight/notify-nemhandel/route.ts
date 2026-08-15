/**
 * POST /api/oversight/notify-nemhandel
 *
 * SuperDev-only endpoint that batch-sends the NemHandel registration notice
 * to existing customers. Implements Erhvervsstyrelsen compliance requirement
 * Bilag 2, Row 47 (Krav 8) — the system MUST be able to notify its EXISTING
 * customers about the possibility of being registered in NemHandelsregisteret.
 *
 * Body (all optional):
 *   { companyIds?: string[] }
 *
 *   - If `companyIds` is provided, only those companies' OWNERs are notified.
 *   - If omitted, all active non-demo companies with an OWNER are notified.
 *
 * Response: { success: boolean, notified: number, attempted: number, skipped: number }
 *
 * Rate limited: 1 request per minute per SuperDev to prevent accidental
 * double-broadcasts. The underlying notifyExistingCustomersAboutNemHandel
 * utility is sequential and SMTP-pool-friendly.
 */

import { NextResponse } from 'next/server';
import { withGuard, SUPERDEV_ONLY } from '@/lib/route-guard';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { auditLog, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { notifyExistingCustomersAboutNemHandel } from '@/lib/nemhandel-notification';

export const POST = withGuard(SUPERDEV_ONLY, async (request, ctx) => {
  try {
    // Rate limit: 1 broadcast per minute per IP+user to prevent accidental
    // duplicate batch sends.
    const clientIp = getClientIp(request);
    const rl = rateLimit(`oversight-notify-nemhandel:${ctx.id}:${clientIp}`, {
      maxRequests: 1,
      windowMs: 60 * 1000,
      message: 'Too many NemHandel batch-notify requests. Please wait a minute and try again.',
    });
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: 'Rate-limited: only one NemHandel batch-notify request per minute is allowed.',
          retryAfter: rl.resetAt,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
        },
      );
    }

    // Parse optional companyIds filter
    let companyIds: string[] | undefined;
    try {
      const body = await request.json();
      if (Array.isArray(body?.companyIds)) {
        const filtered: string[] = body.companyIds.filter(
          (id: unknown): id is string => typeof id === 'string' && id.trim().length > 0,
        );
        companyIds = filtered.length > 0 ? filtered : undefined;
      }
    } catch {
      // Body is optional — empty/invalid body just means "notify all".
      companyIds = undefined;
    }

    logger.warn(
      `[OVERSIGHT-NEMHANDEL] SuperDev ${ctx.id} triggered batch NemHandel notice — ` +
        `scope=${companyIds ? `${companyIds.length} companies` : 'all active'}`,
    );

    const result = await notifyExistingCustomersAboutNemHandel(companyIds);

    // Audit the broadcast itself (separate from the per-recipient audit
    // entries written by notifyExistingCustomersAboutNemHandel).
    await auditLog({
      action: 'OVERSIGHT',
      entityType: 'Company',
      entityId: 'batch-nemhandel-notice',
      userId: ctx.id,
      companyId: ctx.activeCompanyId ?? null,
      performedByUserId: ctx.id,
      metadata: {
        ...requestMetadata(request),
        type: 'nemhandel_registration_notice_batch',
        scope: companyIds ? 'filtered' : 'all_active',
        targetCompanyIds: companyIds ?? null,
        attempted: result.attempted,
        notified: result.notified,
        skipped: result.skipped,
      },
    });

    return NextResponse.json({
      success: true,
      notified: result.notified,
      attempted: result.attempted,
      skipped: result.skipped,
    });
  } catch (error) {
    logger.error('[OVERSIGHT-NEMHANDEL] Batch notify failed:', error);
    return NextResponse.json(
      { error: 'Kunne ikke udsende NemHandel-notifikationer' },
      { status: 500 },
    );
  }
});
