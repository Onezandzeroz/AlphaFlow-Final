import { NextResponse } from 'next/server';
import { withGuard } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { getCompanyEInvoiceSettings, updateCompanyEInvoiceSettings } from '@/lib/einvoice-sender';
import type { CompanyEInvoiceConfig } from '@/lib/einvoice-sender';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { notifyDataChange } from '@/lib/notify-data-change';

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
      'deliveryMode',
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

    // ── Validation: deliveryMode ──
    if (updateData.deliveryMode !== undefined && updateData.deliveryMode !== null) {
      if (updateData.deliveryMode !== 'manual' && updateData.deliveryMode !== 'automatic') {
        return NextResponse.json(
          { error: 'Ugyldig leveringstilstand. Brug "manual" eller "automatic".' },
          { status: 400 }
        );
      }
    }

    // ── Validation: cannot enable e-invoicing (automatic mode) without a valid endpointId ──
    const currentSettings = await getCompanyEInvoiceSettings(ctx.activeCompanyId!);
    const deliveryMode = updateData.deliveryMode ?? currentSettings.deliveryMode;

    if (updateData.enabled === true || deliveryMode === 'automatic') {
      const endpointId = updateData.endpointId ?? currentSettings.endpointId;

      if (!endpointId || !endpointId.trim()) {
        return NextResponse.json(
          { error: 'Kan ikke aktivere automatisk e-faktura uden et EndpointID. Angiv et EndpointID (f.eks. 0184:CVR-nummer).' },
          { status: 400 }
        );
      }

      // Validate endpointId format: must contain scheme:identifier (e.g., "0184:12345678")
      const parts = endpointId.split(':');
      if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
        return NextResponse.json(
          { error: 'Ugyldigt EndpointID-format. Brug format: scheme:identifier (f.eks. 0184:12345678).' },
          { status: 400 }
        );
      }

      // Validate CVR number in endpointId (if scheme is 0184 = DK CVR)
      if (parts[0] === '0184' && !/^\d{8}$/.test(parts[1].trim())) {
        return NextResponse.json(
          { error: 'Ugyldigt CVR-nummer i EndpointID. Et dansk CVR-nummer skal være præcis 8 cifre.' },
          { status: 400 }
        );
      }
    }

    // ── Validation: endpointId format if provided ──
    if (updateData.endpointId !== undefined && updateData.endpointId !== null && updateData.endpointId.trim() !== '') {
      const epParts = updateData.endpointId.split(':');
      if (epParts.length !== 2 || !epParts[0].trim() || !epParts[1].trim()) {
        return NextResponse.json(
          { error: 'Ugyldigt EndpointID-format. Brug format: scheme:identifier (f.eks. 0184:12345678).' },
          { status: 400 }
        );
      }
      if (epParts[0] === '0184' && !/^\d{8}$/.test(epParts[1].trim())) {
        return NextResponse.json(
          { error: 'Ugyldigt CVR-nummer i EndpointID. Et dansk CVR-nummer skal være præcis 8 cifre.' },
          { status: 400 }
        );
      }
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

    notifyDataChange({ scope: 'company-settings', companyId: ctx.activeCompanyId!, action: 'update' }).catch(() => {});

    return NextResponse.json({ settings });
  } catch (error) {
    logger.error('[EINVOICE_SETTINGS_API] Failed to update e-invoice settings:', error);
    const message = error instanceof Error ? error.message : 'Kunne ikke opdatere e-faktura indstillinger';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
