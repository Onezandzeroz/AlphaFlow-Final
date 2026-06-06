import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { logger } from '@/lib/logger';
import { grantTrial } from '@/lib/tokenpay';
import { tokenpay } from '@/lib/tokenpay';

/**
 * POST /api/oversight/trial — Set or cancel trial for all members of a company.
 */
export const POST = withGuard(routeConfig['/api/oversight/trial'].POST!, async (request, ctx) => {
  try {
    const body = await request.json();
    const { companyId, action, days } = body as {
      companyId?: string;
      action?: 'set' | 'cancel';
      days?: number;
    };

    if (!companyId || !action) {
      return NextResponse.json({ error: 'Missing: companyId, action' }, { status: 400 });
    }
    if (action === 'set' && (!days || ![30, 60].includes(days))) {
      return NextResponse.json({ error: 'days must be 30 or 60' }, { status: 400 });
    }

    // Fetch all members of the company with their user data
    const members = await db.userCompany.findMany({
      where: { companyId },
      include: { user: { select: { id: true, email: true, businessName: true } } },
    });

    if (members.length === 0) {
      return NextResponse.json({ error: 'No members found for this company' }, { status: 404 });
    }

    const results: Array<{
      userId: string;
      email: string;
      success: boolean;
      error?: string;
    }> = [];

    for (const member of members) {
      const { user } = member;
      try {
        if (action === 'set') {
          await grantTrial(user.id, user.email, user.businessName || undefined, days);
          results.push({ userId: user.id, email: user.email, success: true });
        } else {
          // Cancel trial: override to read_only
          await tokenpay.overrideAccess(user.id, 'read_only');
          results.push({ userId: user.id, email: user.email, success: true });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        results.push({ userId: user.id, email: user.email, success: false, error: msg });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    logger.info(
      `[OVERSIGHT] Trial ${action} for company ${companyId}: ${succeeded} succeeded, ${failed} failed`,
    );

    return NextResponse.json({
      success: failed === 0,
      affected: members.length,
      succeeded,
      failed,
      results,
    });
  } catch (error) {
    logger.error('Oversight trial management error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
