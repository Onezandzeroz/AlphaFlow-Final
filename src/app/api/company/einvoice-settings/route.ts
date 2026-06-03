import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/session';
import { requirePermission, blockOversightMutation, requireNotDemoCompany, Permission } from '@/lib/rbac';
import { getCompanyEInvoiceSettings, updateCompanyEInvoiceSettings } from '@/lib/einvoice-sender';
import type { CompanyEInvoiceConfig } from '@/lib/einvoice-sender';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';

// GET /api/company/einvoice-settings — Get company e-invoice settings
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const forbidden = requirePermission(ctx, Permission.COMPANY_VIEW_SETTINGS);
    if (forbidden) return forbidden;

    if (!ctx.activeCompanyId) {
      return NextResponse.json({ error: 'No active company' }, { status: 400 });
    }

    const settings = await getCompanyEInvoiceSettings(ctx.activeCompanyId);

    return NextResponse.json({ settings });
  } catch (error) {
    logger.error('[EINVOICE_SETTINGS_API] Failed to fetch e-invoice settings:', error);
    return NextResponse.json(
      { error: 'Kunne ikke hente e-faktura indstillinger' },
      { status: 500 }
    );
  }
}

// PUT /api/company/einvoice-settings — Update company e-invoice settings
export async function PUT(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    const forbidden = requirePermission(ctx, Permission.COMPANY_EDIT_SETTINGS);
    if (forbidden) return forbidden;

    if (!ctx.activeCompanyId) {
      return NextResponse.json({ error: 'No active company' }, { status: 400 });
    }

    const body = await request.json();

    // Validate that the body contains at least one known field
    const allowedFields: (keyof CompanyEInvoiceConfig)[] = [
      'enabled',
      'defaultChannel',
      'endpointId',
      'gln',
      'peppolAs4Id',
      'autoSendOnFinalize',
    ];

    const updateData: Partial<CompanyEInvoiceConfig> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'Ingen gyldige felter at opdatere. Gyldige felter: ' + allowedFields.join(', ') },
        { status: 400 }
      );
    }

    const settings = await updateCompanyEInvoiceSettings(ctx.activeCompanyId, updateData);

    // Audit trail for settings update
    await auditCreate(
      ctx.id,
      'Company' as never,
      ctx.activeCompanyId,
      { action: 'einvoice_settings_update', changes: updateData },
      requestMetadata(request),
      ctx.activeCompanyId
    );

    logger.info(`[EINVOICE_SETTINGS_API] Updated e-invoice settings`, {
      companyId: ctx.activeCompanyId,
      userId: ctx.id,
      changedFields: Object.keys(updateData),
    });

    return NextResponse.json({ settings });
  } catch (error) {
    logger.error('[EINVOICE_SETTINGS_API] Failed to update e-invoice settings:', error);
    const message = error instanceof Error ? error.message : 'Kunne ikke opdatere e-faktura indstillinger';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
