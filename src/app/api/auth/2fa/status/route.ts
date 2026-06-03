import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { logger } from '@/lib/logger';

/**
 * GET /api/auth/2fa/status
 *
 * Returns the user's 2FA status and company-level 2FA requirement.
 * Used by the frontend to determine which UI to show (setup, manage, etc.).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

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
      isSuperDev: ctx.isSuperDev, // Frontend can use this to show/hide bypass UI
    });
  } catch (error) {
    logger.error('[2FA] Status error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch 2FA status' },
      { status: 500 }
    );
  }
}
