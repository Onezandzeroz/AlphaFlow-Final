import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withGuard } from '@/lib/route-guard';

/**
 * GET /api/auth/2fa/status
 */
export const GET = withGuard({ auth: true }, async (request, ctx) => {
  try {
    // Fetch user 2FA status
    const user = await db.user.findUnique({
      where: { id: ctx.id },
      select: {
        twoFactorEnabled: true,
        twoFactorBackupCodes: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch company-level 2FA requirement
    let companyRequiresTwoFactor = false;

    if (ctx.activeCompanyId) {
      const company = await db.company.findUnique({
        where: { id: ctx.activeCompanyId },
        select: { twoFactorRequired: true },
      });

      if (company) {
        companyRequiresTwoFactor = company.twoFactorRequired;
      }
    }

    return NextResponse.json({
      twoFactorEnabled: user.twoFactorEnabled,
      hasBackupCodes: !!user.twoFactorBackupCodes,
      companyRequiresTwoFactor,
      isSuperDev: ctx.isSuperDev,
    });
  } catch (error) {
    logger.error('[2FA] Status error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch 2FA status' },
      { status: 500 }
    );
  }
});
