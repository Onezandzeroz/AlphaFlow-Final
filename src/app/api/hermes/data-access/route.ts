import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { requirePermission, Permission, blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';
import { auditLog, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';

/**
 * POST /api/hermes/data-access
 *
 * Toggles whether Hermes can access the tenant's accounting data.
 * Available to OWNER or ADMIN of the active company.
 *
 * Body: { enabled: boolean }
 *
 * Response: { "success": true, "dataAccessEnabled": true }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Block oversight mutations
    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    // Block demo company mutations
    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    // Require COMPANY_EDIT_SETTINGS permission (OWNER or ADMIN)
    const denied = requirePermission(ctx, Permission.COMPANY_EDIT_SETTINGS);
    if (denied) return denied;

    // Require active company
    if (!ctx.activeCompanyId) {
      return NextResponse.json(
        { error: 'No active company selected. Please select a company.' },
        { status: 400 }
      );
    }

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
      where: { companyId: ctx.activeCompanyId },
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
      where: { companyId: ctx.activeCompanyId },
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

    return NextResponse.json({ success: true, dataAccessEnabled: updatedAgent.dataAccessEnabled });
  } catch (error) {
    logger.error('[HERMES DATA-ACCESS] Failed to toggle data access:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
