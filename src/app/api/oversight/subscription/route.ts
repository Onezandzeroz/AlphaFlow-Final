import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { logger } from '@/lib/logger';
import { auditLog, requestMetadata } from '@/lib/audit';
import { PlanTier, getBindingMonths, frontendPlanIdToTier, ALL_PLAN_TIERS } from '@/lib/plan-features';
import { ensureHermesForTier } from '@/lib/plan-activation';

/**
 * POST /api/oversight/subscription — Manage a tenant's subscription plan.
 *
 * Three actions:
 *
 *   1. { companyId, action: 'setPlan', planId: 'free'|'monthly'|'annual'|'2year'|'3year' }
 *      Activate a specific plan tier. Sets Company.planTier, planPurchasedAt,
 *      planExpiresAt (based on binding period), planActivatedBy. This is the
 *      PRIMARY way paid plans are activated until a payment provider is wired up.
 *
 *   2. { companyId, action: 'revoke' }
 *      Revoke subscription-based write access for all members (sets
 *      User.subscriptionRevokedAt). Does NOT affect .tbkey proofs.
 *
 *   3. { companyId, action: 'restore' }
 *      Restore subscription-based write access (clears subscriptionRevokedAt).
 *
 * SuperDev-only (enforced by route guard).
 */
export const POST = withGuard(routeConfig['/api/oversight/subscription'].POST!, async (request, ctx) => {
  try {
    const body = await request.json();
    const { companyId, action } = body as {
      companyId?: string;
      action?: 'setPlan' | 'revoke' | 'restore';
      planId?: string;
    };

    if (!companyId || !action) {
      return NextResponse.json({ error: 'Missing: companyId, action' }, { status: 400 });
    }

    // ─── Action: setPlan — activate a plan tier ───────────────────
    if (action === 'setPlan') {
      const { planId } = body as { planId?: string };
      if (!planId) {
        return NextResponse.json({ error: 'Missing: planId' }, { status: 400 });
      }
      const newTier = frontendPlanIdToTier(planId);
      const bindingMonths = getBindingMonths(newTier);
      const now = new Date();
      const expiresAt = bindingMonths > 0
        ? new Date(now.getFullYear(), now.getMonth() + bindingMonths, now.getDate())
        : null;

      // Fetch the old plan tier for the audit log
      const company = await db.company.findUnique({
        where: { id: companyId },
        select: { planTier: true, name: true },
      });
      if (!company) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 });
      }

      await db.company.update({
        where: { id: companyId },
        data: {
          planTier: newTier,
          planPurchasedAt: now,
          planExpiresAt: expiresAt,
          planActivatedBy: ctx.id,
          // Clear any previous revocation when activating a paid plan
        },
      });

      // Clear subscriptionRevokedAt for all members (new plan = fresh access)
      await db.user.updateMany({
        where: {
          companies: { some: { companyId } },
          subscriptionRevokedAt: { not: null },
        },
        data: { subscriptionRevokedAt: null },
      });

      // Auto-create HermesAgent (enabled=true) for Pro+ tiers
      await ensureHermesForTier(companyId, newTier);

      await auditLog({
        action: 'UPDATE',
        entityType: 'Company',
        entityId: companyId,
        userId: ctx.id,
        companyId: ctx.activeCompanyId,
        changes: {
          planTier: { old: company.planTier, new: newTier },
          planPurchasedAt: { old: null, new: now.toISOString() },
          planExpiresAt: { old: null, new: expiresAt?.toISOString() ?? null },
        },
        metadata: requestMetadata(request),
      });

      logger.info(
        `[OVERSIGHT] Plan tier set to ${newTier} for company ${company.name} (${companyId}) by ${ctx.email}. Binding: ${bindingMonths} months.`,
      );

      return NextResponse.json({
        success: true,
        action: 'setPlan',
        companyId,
        planTier: newTier,
        planPurchasedAt: now.toISOString(),
        planExpiresAt: expiresAt?.toISOString() ?? null,
      });
    }

    // ─── Action: revoke / restore — member-level access ───────────
    if (action !== 'revoke' && action !== 'restore') {
      return NextResponse.json({ error: 'action must be "setPlan", "revoke", or "restore"' }, { status: 400 });
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

/**
 * GET /api/oversight/subscription — List all tenants with their plan info.
 * Used by the oversight UI to show + manage plan tiers per tenant.
 */
export const GET = withGuard(routeConfig['/api/oversight/subscription'].POST!, async (request) => {
  try {
    const companies = await db.company.findMany({
      where: { isDemo: false },
      select: {
        id: true,
        name: true,
        email: true,
        planTier: true,
        planPurchasedAt: true,
        planExpiresAt: true,
        planActivatedBy: true,
        planNotes: true,
        _count: { select: { members: true } },
      },
      orderBy: { planPurchasedAt: 'desc' },
    });

    return NextResponse.json({
      tenants: companies.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        planTier: c.planTier,
        planPurchasedAt: c.planPurchasedAt?.toISOString() ?? null,
        planExpiresAt: c.planExpiresAt?.toISOString() ?? null,
        planActivatedBy: c.planActivatedBy,
        planNotes: c.planNotes,
        memberCount: c._count.members,
      })),
    });
  } catch (error) {
    logger.error('List subscription tenants error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
