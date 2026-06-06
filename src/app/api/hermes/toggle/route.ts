import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { auditLog, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';

/**
 * POST /api/hermes/toggle
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

    return NextResponse.json({ success: true, enabled: hermesAgent.enabled });
  } catch (error) {
    logger.error('[HERMES TOGGLE] Failed to toggle Hermes:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
