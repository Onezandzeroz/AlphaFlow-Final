import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { logger } from '@/lib/logger';
import { auditLog, requestMetadata } from '@/lib/audit';

/**
 * POST /api/oversight/subscription — Revoke or restore subscription-based
 * (revenue-gate) write access for all members of a company.
 *
 * Body:
 *   { companyId: string, action: 'revoke' | 'restore' }
 *
 * This ONLY affects the revenue-based free tier (subscription access).
 * A tenant with a valid .tbkey proof retains write access regardless —
 * revocation here does not touch TokenPay/.tbkey state.
 *
 * SuperDev-only (enforced by route guard).
 */
export const POST = withGuard(routeConfig['/api/oversight/subscription'].POST!, async (request, ctx) => {
  try {
    const body = await request.json();
    const { companyId, action } = body as {
      companyId?: string;
      action?: 'revoke' | 'restore';
    };

    if (!companyId || !action) {
      return NextResponse.json({ error: 'Missing: companyId, action' }, { status: 400 });
    }
    if (action !== 'revoke' && action !== 'restore') {
      return NextResponse.json({ error: 'action must be "revoke" or "restore"' }, { status: 400 });
    }

    // Fetch all members of the company
    const members = await db.userCompany.findMany({
      where: { companyId },
      select: { userId: true },
    });

    if (members.length === 0) {
      return NextResponse.json({ error: 'No members found for this company' }, { status: 404 });
    }

    const userIds = members.map((m) => m.userId);
    const now = new Date();

    // Apply revocation / restoration to every member
    await db.user.updateMany({
      where: { id: { in: userIds } },
      data: action === 'revoke'
        ? { subscriptionRevokedAt: now }
        : { subscriptionRevokedAt: null },
    });

    // Audit log
    await auditLog({
      action: 'UPDATE',
      entityType: 'User',
      entityId: companyId,
      userId: ctx.id,
      companyId: ctx.activeCompanyId,
      changes: {
        subscriptionAccess: {
          old: action === 'revoke' ? 'granted' : 'revoked',
          new: action === 'revoke' ? 'revoked' : 'granted',
        },
        affectedMembers: { old: null, new: userIds.length },
      },
      metadata: requestMetadata(request),
    });

    logger.info(
      `[OVERSIGHT] Subscription access ${action === 'revoke' ? 'revoked' : 'restored'} for company ${companyId}: ${userIds.length} members`,
    );

    return NextResponse.json({
      success: true,
      action,
      affected: userIds.length,
    });
  } catch (error) {
    logger.error('Oversight subscription management error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
