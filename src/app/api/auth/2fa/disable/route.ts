import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { auditLog, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import {
  decryptSecret,
  verifyTOTP,
  isValidTOTPFormat,
} from '@/lib/two-factor';
import { withGuard } from '@/lib/route-guard';

/**
 * POST /api/auth/2fa/disable
 */
export const POST = withGuard({ auth: true }, async (request, ctx) => {
  try {
    // Rate limiting
    const clientIp = getClientIp(request);
    const { allowed } = rateLimit(`2fa-disable:${ctx.id}:${clientIp}`, {
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
    const { code } = body;

    if (!code || !isValidTOTPFormat(code)) {
      return NextResponse.json(
        { error: 'A valid 6-digit TOTP code is required' },
        { status: 400 }
      );
    }

    // Fetch the user's current state
    const user = await db.user.findUnique({
      where: { id: ctx.id },
      select: {
        twoFactorEnabled: true,
        twoFactorSecret: true,
      },
    });

    if (!user || !user.twoFactorEnabled) {
      return NextResponse.json(
        { error: '2FA is not currently enabled.' },
        { status: 400 }
      );
    }

    if (!user.twoFactorSecret) {
      return NextResponse.json(
        { error: 'No 2FA secret found. Please contact support.' },
        { status: 400 }
      );
    }

    // SuperDev users bypass 2FA requirements — allow disable without verification
    if (!ctx.isSuperDev) {
      // Verify the TOTP code before disabling
      const plainSecret = decryptSecret(user.twoFactorSecret);
      const valid = verifyTOTP(plainSecret, code);
      if (!valid) {
        logger.warn(`[2FA] Invalid disable code for user ${ctx.id} (${ctx.email})`);
        return NextResponse.json(
          { error: 'Invalid verification code. Please try again.' },
          { status: 400 }
        );
      }

      // Check if the user's company requires 2FA
      if (ctx.activeCompanyId) {
        const company = await db.company.findUnique({
          where: { id: ctx.activeCompanyId },
          select: { twoFactorRequired: true },
        });

        if (company?.twoFactorRequired) {
          return NextResponse.json(
            { error: '2FA is required by your organization. Contact your administrator to disable the organization-wide 2FA requirement first.' },
            { status: 403 }
          );
        }
      }
    }

    // Disable 2FA and clear all related fields
    await db.user.update({
      where: { id: ctx.id },
      data: {
        twoFactorSecret: null,
        twoFactorBackupCodes: null,
        twoFactorEnabled: false,
        twoFactorEnabledAt: null,
      },
    });

    // Audit log
    await auditLog({
      action: 'TWO_FACTOR_DISABLED',
      entityType: 'User',
      entityId: ctx.id,
      userId: ctx.id,
      companyId: ctx.activeCompanyId,
      metadata: requestMetadata(request),
    });

    logger.info(`[2FA] Disabled for user ${ctx.id} (${ctx.email})`);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[2FA] Disable error:', error);
    return NextResponse.json(
      { error: 'Failed to disable 2FA' },
      { status: 500 }
    );
  }
});
