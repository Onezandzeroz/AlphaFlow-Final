import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/session';
import { requirePermission, blockOversightMutation, requireNotDemoCompany, Permission } from '@/lib/rbac';
import { registerNemHandel } from '@/lib/einvoice-sender';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';

// POST /api/company/einvoice-register — Register company in NemHandelsregisteret
export async function POST(request: NextRequest) {
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
}
