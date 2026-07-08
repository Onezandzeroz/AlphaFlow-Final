import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { auditLog, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import {
  decryptSecret,
  verifyTOTP,
  isValidTOTPFormat,
  generateBackupCodes,
  hashBackupCode,
  encryptBackupCodes,
} from '@/lib/two-factor';
import { getCurrentKeyVersion } from '@/lib/crypto';
import { withGuard } from '@/lib/route-guard';

/**
 * POST /api/auth/2fa/activate
 */
export const POST = withGuard({ auth: true }, async (request, ctx) => {
  try {
    // Rate limiting
    const clientIp = getClientIp(request);
    const { allowed } = rateLimit(`2fa-activate:${ctx.id}:${clientIp}`, {
      maxRequests: 10,
      windowMs: 60 * 1000,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many verification attempts. Please try again later.' },
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

    // Fetch the user's stored (encrypted) TOTP secret
    const user = await db.user.findUnique({
      where: { id: ctx.id },
      select: {
        twoFactorSecret: true,
        twoFactorEnabled: true,
      },
    });

    if (!user || !user.twoFactorSecret) {
      return NextResponse.json(
        { error: 'No pending 2FA setup found. Please start the setup process first.' },
        { status: 400 }
      );
    }

    if (user.twoFactorEnabled) {
      return NextResponse.json(
        { error: '2FA is already enabled.' },
        { status: 400 }
      );
    }

    // Decrypt the secret
    const plainSecret = decryptSecret(user.twoFactorSecret);

    // Verify the TOTP code
    const valid = verifyTOTP(plainSecret, code);
    if (!valid) {
      logger.warn(`[2FA] Invalid activation code for user ${ctx.id} (${ctx.email})`);
      return NextResponse.json(
        { error: 'Invalid verification code. Please try again.' },
        { status: 400 }
      );
    }

    // Generate backup codes
    const plainBackupCodes = generateBackupCodes();
    const hashedCodes = plainBackupCodes.map(hashBackupCode);
    const encryptedBackupCodes = encryptBackupCodes(hashedCodes);

    // Activate 2FA and store backup codes
    await db.user.update({
      where: { id: ctx.id },
      data: {
        twoFactorEnabled: true,
        twoFactorEnabledAt: new Date(),
        twoFactorBackupCodes: encryptedBackupCodes,
        encryptionKeyVersion: getCurrentKeyVersion(),
      },
    });

    // Audit log
    await auditLog({
      action: 'TWO_FACTOR_ACTIVATED',
      entityType: 'User',
      entityId: ctx.id,
      userId: ctx.id,
      companyId: ctx.activeCompanyId,
      metadata: requestMetadata(request),
    });

    logger.info(`[2FA] Activated for user ${ctx.id} (${ctx.email})`);

    // Return plain backup codes — this is the ONLY time they are shown
    return NextResponse.json({
      backupCodes: plainBackupCodes,
    });
  } catch (error) {
    logger.error('[2FA] Activate error:', error);
    return NextResponse.json(
      { error: 'Failed to activate 2FA' },
      { status: 500 }
    );
  }
});
