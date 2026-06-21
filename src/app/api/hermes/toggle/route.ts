import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { auditLog, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { notifyDataChange } from '@/lib/notify-data-change';
import { hasFeature, Feature } from '@/lib/plan-features';

/**
 * POST /api/hermes/toggle
 *
 * Enable or disable Hermes AI for a company.
 *
 * Access rules:
 *   - SuperDev (App Owner): can toggle Hermes for ANY company (override)
 *   - Owner/Admin: can toggle Hermes for their OWN company IF their plan
 *     tier includes the Hermes feature (Pro, Business, Business Extended)
 *   - Lower tiers (Free, Månedlig): 403 — Hermes is not in their plan
 */
export const POST = withGuard(routeConfig['/api/hermes/toggle'].POST!, async (request, ctx) => {
  try {
    // Parse request body
    const body = await request.json();
    const { companyId, enabled } = body as { companyId?: string; enabled?: boolean };

    if (!companyId || typeof companyId !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid companyId' },
        { status: 400 }
      );
    }

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing or invalid enabled flag' },
        { status: 400 }
      );
    }

    // SuperDev can toggle Hermes for any company. Non-SuperDev can only
    // toggle for their own active company AND only if their plan includes
    // the Hermes feature.
    if (!ctx.isSuperDev) {
      if (companyId !== ctx.activeCompanyId) {
        return NextResponse.json(
          { error: 'You can only toggle Hermes for your own company.' },
          { status: 403 }
        );
      }

      // Check that the tenant's plan includes Hermes
      if (!hasFeature(ctx, Feature.Hermes)) {
        return NextResponse.json(
          {
            error: 'Hermes AI requires a Pro plan or higher. Upgrade to enable Hermes.',
            code: 'PLAN_FEATURE_REQUIRED',
            feature: 'HERMES',
          },
          { status: 403 }
        );
      }
    }

    // Verify the company exists
    const company = await db.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });

    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }

    // Upsert the HermesAgent record
    const hermesAgent = await db.hermesAgent.upsert({
      where: { companyId },
      create: { companyId, enabled },
      update: { enabled },
      select: { id: true, enabled: true },
    });

    // Audit log the change
    await auditLog({
      action: 'UPDATE',
      entityType: 'System',
      entityId: hermesAgent.id,
      userId: ctx.id,
      companyId,
      performedByUserId: ctx.id,
      changes: { enabled: { old: !enabled, new: enabled } },
      metadata: {
        ...requestMetadata(request),
        source: 'hermes_toggle',
        companyName: company.name,
      },
    });

    logger.info('[HERMES TOGGLE] Hermes toggled', {
      companyId,
      companyName: company.name,
      enabled,
      performedBy: ctx.id,
    });

    // Notify all connected clients in this company that the Hermes config
    // changed, so the HermesProvider re-fetches immediately instead of
    // waiting for the (now removed) 60s polling.
    notifyDataChange({
      scope: 'hermes-config',
      companyId,
      action: 'toggle',
    }).catch(() => { /* non-critical */ });

    return NextResponse.json({ success: true, enabled: hermesAgent.enabled });
  } catch (error) {
    logger.error('[HERMES TOGGLE] Failed to toggle Hermes:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
