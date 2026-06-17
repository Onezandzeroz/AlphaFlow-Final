import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { auditLog, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { notifyDataChange } from '@/lib/notify-data-change';

/**
 * POST /api/hermes/data-access
 */
export const POST = withGuard(routeConfig['/api/hermes/data-access'].POST!, async (request, ctx) => {
  try {
    // Parse request body
    const body = await request.json();
    const { enabled } = body as { enabled?: boolean };

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing or invalid enabled flag' },
        { status: 400 }
      );
    }

    // Check that Hermes is enabled for this company
    const hermesAgent = await db.hermesAgent.findUnique({
      where: { companyId: ctx.activeCompanyId! },
      select: {
        id: true,
        enabled: true,
        dataAccessEnabled: true,
      },
    });

    if (!hermesAgent) {
      return NextResponse.json(
        { error: 'Hermes is not enabled for this company' },
        { status: 400 }
      );
    }

    if (!hermesAgent.enabled) {
      return NextResponse.json(
        { error: 'Hermes is not enabled for this company' },
        { status: 400 }
      );
    }

    // Update the dataAccessEnabled flag
    const previousDataAccess = hermesAgent.dataAccessEnabled;
    const updatedAgent = await db.hermesAgent.update({
      where: { companyId: ctx.activeCompanyId! },
      data: { dataAccessEnabled: enabled },
      select: { id: true, dataAccessEnabled: true },
    });

    // Audit log the change
    await auditLog({
      action: 'UPDATE',
      entityType: 'System',
      entityId: updatedAgent.id,
      userId: ctx.id,
      companyId: ctx.activeCompanyId,
      performedByUserId: ctx.id,
      changes: {
        dataAccessEnabled: { old: previousDataAccess, new: enabled },
      },
      metadata: {
        ...requestMetadata(request),
        source: 'hermes_data_access_toggle',
        companyName: ctx.activeCompanyName,
      },
    });

    logger.info('[HERMES DATA-ACCESS] Data access toggled', {
      companyId: ctx.activeCompanyId,
      companyName: ctx.activeCompanyName,
      dataAccessEnabled: enabled,
      performedBy: ctx.id,
    });

    // Notify all connected clients in this company that the Hermes config
    // changed (data access affects what Hermes can show).
    notifyDataChange({
      scope: 'hermes-config',
      companyId: ctx.activeCompanyId!,
      action: 'toggle',
    }).catch(() => { /* non-critical */ });

    return NextResponse.json({ success: true, dataAccessEnabled: updatedAgent.dataAccessEnabled });
  } catch (error) {
    logger.error('[HERMES DATA-ACCESS] Failed to toggle data access:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
