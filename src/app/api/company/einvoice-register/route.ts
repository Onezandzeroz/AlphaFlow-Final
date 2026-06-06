import { NextResponse } from 'next/server';
import { withGuard } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { registerNemHandel } from '@/lib/einvoice-sender';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';

// POST /api/company/einvoice-register — Register company in NemHandelsregisteret
export const POST = withGuard(routeConfig['/api/company/einvoice-register'].POST!, async (request, ctx) => {
  try {
    const result = await registerNemHandel(ctx.activeCompanyId, ctx.id);

    // Audit trail for registration
    await auditCreate(
      ctx.id,
      'Company' as never,
      ctx.activeCompanyId,
      {
        action: 'nemhandel_registration',
        registrationNo: result.registrationNo,
      },
      requestMetadata(request),
      ctx.activeCompanyId
    );

    logger.info(`[EINVOICE_REGISTER_API] Company registered in NemHandelsregisteret`, {
      companyId: ctx.activeCompanyId,
      userId: ctx.id,
      registrationNo: result.registrationNo,
    });

    return NextResponse.json({
      registrationNo: result.registrationNo,
      registeredAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('[EINVOICE_REGISTER_API] Failed to register company:', error);
    const message = error instanceof Error ? error.message : 'Kunne ikke registrere virksomhed i NemHandelsregisteret';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
