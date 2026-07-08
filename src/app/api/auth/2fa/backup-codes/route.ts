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
 * GET /api/auth/2fa/backup-codes
 */
export const GET = withGuard({ auth: true }, async (request, ctx) => {
  try {
    const user = await db.user.findUnique({
      where: { id: ctx.id },
      select: { twoFactorBackupCodes: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      hasBackupCodes: !!user.twoFactorBackupCodes,
    });
  } catch (error) {
    logger.error('[2FA] Backup codes GET error:', error);
    return NextResponse.json(
      { error: 'Failed to check backup codes status' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/auth/2fa/backup-codes
 */
export const POST = withGuard({ auth: true }, async (request, ctx) => {
  try {
    // Rate limiting
    const clientIp = getClientIp(request);
    const { allowed } = rateLimit(`2fa-backup-regen:${ctx.id}:${clientIp}`, {
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

    // SuperDev users bypass 2FA verification
    if (!ctx.isSuperDev) {
      // Verify the TOTP code before regenerating
      const plainSecret = decryptSecret(user.twoFactorSecret);
      const valid = verifyTOTP(plainSecret, code);
      if (!valid) {
        logger.warn(`[2FA] Invalid backup code regeneration code for user ${ctx.id} (${ctx.email})`);
        return NextResponse.json(
          { error: 'Invalid verification code. Please try again.' },
          { status: 400 }
        );
      }
    }

    // Generate new backup codes
    const plainBackupCodes = generateBackupCodes();
    const hashedCodes = plainBackupCodes.map(hashBackupCode);
    const encryptedBackupCodes = encryptBackupCodes(hashedCodes);

    // Store new backup codes (replaces old ones)
    await db.user.update({
      where: { id: ctx.id },
      data: {
        twoFactorBackupCodes: encryptedBackupCodes,
        encryptionKeyVersion: getCurrentKeyVersion(),
      },
    });

    // Audit log
    await auditLog({
      action: 'TWO_FACTOR_BACKUP_CODES_REGENERATED',
      entityType: 'User',
      entityId: ctx.id,
      userId: ctx.id,
      companyId: ctx.activeCompanyId,
      metadata: requestMetadata(request),
    });

    logger.info(`[2FA] Backup codes regenerated for user ${ctx.id} (${ctx.email})`);

    // Return plain backup codes — this is the ONLY time they are shown
    return NextResponse.json({
      backupCodes: plainBackupCodes,
    });
  } catch (error) {
    logger.error('[2FA] Backup codes regeneration error:', error);
    return NextResponse.json(
      { error: 'Failed to regenerate backup codes' },
      { status: 500 }
    );
  }
});
