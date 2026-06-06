import { NextResponse } from 'next/server';
import { withGuard } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { getCompanyEInvoiceSettings, updateCompanyEInvoiceSettings } from '@/lib/einvoice-sender';
import type { CompanyEInvoiceConfig } from '@/lib/einvoice-sender';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';

const guard = routeConfig['/api/company/einvoice-settings'];

// GET /api/company/einvoice-settings — Get company e-invoice settings
export const GET = withGuard(guard.GET!, async (request, ctx) => {
  try {
    const settings = await getCompanyEInvoiceSettings(ctx.activeCompanyId!);

    return NextResponse.json({ settings });
  } catch (error) {
    logger.error('[EINVOICE_SETTINGS_API] Failed to fetch e-invoice settings:', error);
    return NextResponse.json(
      { error: 'Kunne ikke hente e-faktura indstillinger' },
      { status: 500 }
    );
  }
});

// PUT /api/company/einvoice-settings — Update company e-invoice settings
export const PUT = withGuard(guard.PUT!, async (request, ctx) => {
  try {
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

    const settings = await updateCompanyEInvoiceSettings(ctx.activeCompanyId!, updateData);

    // Audit trail for settings update
    await auditCreate(
      ctx.id,
      'Company' as never,
      ctx.activeCompanyId!,
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
});
