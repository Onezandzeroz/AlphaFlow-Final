import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { auditLog, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';

/**
 * POST /api/company/toggle-2fa
 *
 * Toggles the company-level 2FA requirement.
 * Requires COMPANY_EDIT_SETTINGS permission.
 */
export const POST = withGuard(routeConfig['/api/company/toggle-2fa'].POST!, async (request, ctx) => {
  try {
    // Rate limiting
    const clientIp = getClientIp(request);
    const { allowed } = rateLimit(`toggle-2fa:${ctx.id}:${clientIp}`, {
      maxRequests: 5,
      windowMs: 60 * 1000,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { enabled } = body;

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'A boolean "enabled" field is required' },
        { status: 400 }
      );
    }

    // Fetch the company
    const company = await db.company.findUnique({
      where: { id: ctx.activeCompanyId },
      select: {
        id: true,
        name: true,
        twoFactorRequired: true,
      },
    });

    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }

    if (enabled) {
      // ─── ENABLE: check that ALL tenant members have 2FA ──────

      // Fetch all members (excluding SuperDev users who bypass 2FA)
      const members = await db.userCompany.findMany({
        where: {
          companyId: company.id,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              businessName: true,
              isSuperDev: true,
              twoFactorEnabled: true,
            },
          },
        },
      });

      // Find members without 2FA (excluding SuperDev)
      const nonCompliantMembers = members
        .filter(m => !m.user.isSuperDev && !m.user.twoFactorEnabled)
        .map(m => ({
          userId: m.user.id,
          email: m.user.email,
          name: m.user.businessName || m.user.email,
          role: m.role,
        }));

      if (nonCompliantMembers.length > 0) {
        return NextResponse.json(
          {
            error: 'Cannot enable organization-wide 2FA. The following members do not have 2FA enabled:',
            nonCompliantMembers,
            totalMembers: members.filter(m => !m.user.isSuperDev).length,
            compliantCount: members.filter(m => !m.user.isSuperDev && m.user.twoFactorEnabled).length,
          },
          { status: 400 }
        );
      }

      // All members are compliant — enable tenant-wide 2FA
      await db.company.update({
        where: { id: company.id },
        data: { twoFactorRequired: true },
      });

      logger.info(`[2FA] Tenant-wide 2FA ENABLED for company ${company.id} (${company.name}) by user ${ctx.id}`);
    } else {
      // ─── DISABLE: simply set to false ─────────────────────────
      await db.company.update({
        where: { id: company.id },
        data: { twoFactorRequired: false },
      });

      logger.info(`[2FA] Tenant-wide 2FA DISABLED for company ${company.id} (${company.name}) by user ${ctx.id}`);
    }

    // Audit log
    await auditLog({
      action: 'TWO_FACTOR_TENANT_TOGGLE',
      entityType: 'Company',
      entityId: company.id,
      userId: ctx.id,
      companyId: company.id,
      metadata: {
        ...requestMetadata(request),
        twoFactorRequired: enabled,
        previousValue: company.twoFactorRequired,
      },
    });

    return NextResponse.json({
      twoFactorRequired: enabled,
      companyName: company.name,
    });
  } catch (error) {
    logger.error('[2FA] Toggle company 2FA error:', error);
    return NextResponse.json(
      { error: 'Failed to toggle organization 2FA setting' },
      { status: 500 }
    );
  }
});
