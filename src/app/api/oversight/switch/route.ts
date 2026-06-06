import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { auditLog, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';

/**
 * POST /api/oversight/switch — Switch to oversight mode for a specific tenant.
 */
export const POST = withGuard(routeConfig['/api/oversight/switch'].POST!, async (request, ctx) => {
  try {
    const { companyId } = await request.json();
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    // Verify company exists
    const company = await db.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, isActive: true },
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Cannot oversee own company via oversight (just switch normally)
    if (company.id === ctx.activeCompanyId) {
      return NextResponse.json({ error: 'Use normal company switch for your own tenant' }, { status: 400 });
    }

    // Set oversightCompanyId on the session
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const token = cookieStore.get('session')?.value;

    if (!token) {
      return NextResponse.json({ error: 'No session found' }, { status: 401 });
    }

    await db.session.update({
      where: { token },
      data: { oversightCompanyId: companyId },
    });

    // Log single OVERSIGHT audit entry in the target tenant's audit log
    await auditLog({
      action: 'OVERSIGHT',
      entityType: 'Company',
      entityId: companyId,
      userId: ctx.id,
      companyId: companyId,
      performedByUserId: ctx.id,
      metadata: {
        ...requestMetadata(request),
        oversightBy: ctx.email,
        targetCompanyName: company.name,
        targetCompanyId: companyId,
        type: 'oversight_access',
      },
    });

    // Also log in the AlphaAi owner's own tenant
    await auditLog({
      action: 'OVERSIGHT',
      entityType: 'Company',
      entityId: companyId,
      userId: ctx.id,
      companyId: ctx.activeCompanyId,
      performedByUserId: ctx.id,
      metadata: {
        ...requestMetadata(request),
        targetCompanyName: company.name,
        targetCompanyId: companyId,
        type: 'oversight_initiated',
      },
    });

    return NextResponse.json({
      success: true,
      oversightCompanyId: companyId,
      oversightCompanyName: company.name,
      isOversightMode: true,
    });
  } catch (error) {
    logger.error('Switch oversight error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
