import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createSession } from '@/lib/session';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { auditLog, requestMetadata } from '@/lib/audit';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';
import {
  decryptSecret,
  decryptBackupCodes,
  verifyTOTP,
  verifyBackupCode,
  consumeBackupCode,
  encryptBackupCodes,
  isValidTOTPFormat,
  isValidBackupCodeFormat,
} from '@/lib/two-factor';
import { getCurrentKeyVersion } from '@/lib/crypto';
import { withGuard } from '@/lib/route-guard';

/**
 * POST /api/auth/2fa/verify-login
 *
 * NO session required — the user is in the 2FA challenge step of login.
 */
export const POST = withGuard({ auth: false }, async (request: NextRequest) => {
  try {
    // Rate limiting: max 10 verification attempts per minute per IP
    const clientIp = getClientIp(request);
    const { allowed } = rateLimit(`2fa-verify-login:${clientIp}`, {
      maxRequests: 10,
      windowMs: 60 * 1000,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many verification attempts. Please try again in 1 minute.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { email, code, backupCode } = body;

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    if (!code && !backupCode) {
      return NextResponse.json(
        { error: 'A TOTP code or backup code is required' },
        { status: 400 }
      );
    }

    // Validate formats
    if (code && !isValidTOTPFormat(code)) {
      return NextResponse.json(
        { error: 'Invalid TOTP code format. Must be 6 digits.' },
        { status: 400 }
      );
    }

    if (backupCode && !isValidBackupCodeFormat(backupCode)) {
      return NextResponse.json(
        { error: 'Invalid backup code format. Must be 8 alphanumeric characters.' },
        { status: 400 }
      );
    }

    // Find user by email
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        id: true,
        email: true,
        businessName: true,
        emailVerified: true,
        isSuperDev: true,
        demoModeEnabled: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
        twoFactorBackupCodes: true,
      },
    });

    if (!user || !user.twoFactorEnabled) {
      return NextResponse.json(
        { error: 'Invalid verification code' },
        { status: 401 }
      );
    }

    if (!user.twoFactorSecret) {
      logger.error(`[2FA] User ${user.id} has 2FA enabled but no secret stored`);
      return NextResponse.json(
        { error: 'Invalid verification code' },
        { status: 401 }
      );
    }

    const plainSecret = decryptSecret(user.twoFactorSecret);
    let usedBackupCode = false;
    let codeValid = false;

    // Verify TOTP code
    if (code && verifyTOTP(plainSecret, code)) {
      codeValid = true;
    }

    // Verify backup code
    if (!codeValid && backupCode && user.twoFactorBackupCodes) {
      try {
        const hashedCodes = decryptBackupCodes(user.twoFactorBackupCodes);
        if (verifyBackupCode(backupCode, hashedCodes)) {
          codeValid = true;
          usedBackupCode = true;

          // Consume (remove) the used backup code
          const remainingCodes = consumeBackupCode(hashedCodes, backupCode);
          await db.user.update({
            where: { id: user.id },
            data: {
              twoFactorBackupCodes: remainingCodes.length > 0
                ? encryptBackupCodes(remainingCodes)
                : null,
              encryptionKeyVersion: getCurrentKeyVersion(),
            },
          });
        }
      } catch (error) {
        logger.error(`[2FA] Failed to decrypt/verify backup codes for user ${user.id}:`, error);
      }
    }

    if (!codeValid) {
      logger.warn(`[2FA] Invalid login verification for user ${user.id} (${user.email}), IP: ${clientIp}`);

      // Audit log failed 2FA attempt
      const userCompanyForAudit = await db.userCompany.findFirst({
        where: { userId: user.id },
        select: { companyId: true },
      });
      await auditLog({
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        userId: user.id,
        companyId: userCompanyForAudit?.companyId ?? null,
        metadata: {
          ...requestMetadata(request),
          reason: 'invalid_2fa_code',
          method: backupCode ? 'backup_code' : 'totp',
        },
      });

      return NextResponse.json(
        { error: 'Invalid verification code' },
        { status: 401 }
      );
    }

    // ─── Verification successful — create session ───────────────────

    const token = await createSession(user.id, request);

    // Set session cookie
    const cookieStore = await cookies();
    const isHttps = request.headers.get('x-forwarded-proto') === 'https';
    cookieStore.set('session', token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    // Audit log successful 2FA verification
    const sessionForAudit = await db.session.findUnique({
      where: { token },
      select: { activeCompanyId: true },
    });
    await auditLog({
      action: 'LOGIN_2FA_VERIFIED',
      entityType: 'User',
      entityId: user.id,
      userId: user.id,
      companyId: sessionForAudit?.activeCompanyId ?? null,
      metadata: {
        ...requestMetadata(request),
        method: usedBackupCode ? 'backup_code' : 'totp',
      },
    });

    logger.info(`[2FA] Login verified for user ${user.id} (${user.email}) via ${usedBackupCode ? 'backup code' : 'TOTP'}`);

    // ─── Build full user response (same shape as login response) ─────

    const session = await db.session.findUnique({
      where: { token },
      select: { activeCompanyId: true },
    });

    let activeCompanyId: string | null = session?.activeCompanyId ?? null;
    let activeCompanyRole: string | null = null;
    let activeCompanyName: string | null = null;
    let isDemoCompany = false;

    if (activeCompanyId) {
      const userCompany = await db.userCompany.findUnique({
        where: {
          userId_companyId: {
            userId: user.id,
            companyId: activeCompanyId,
          },
        },
        select: { role: true, company: { select: { name: true, isDemo: true, cvrNumber: true } } },
      });
      activeCompanyRole = userCompany?.role ?? null;
      activeCompanyName = userCompany?.company.name ?? null;
      isDemoCompany = userCompany?.company.isDemo === true && userCompany?.company.cvrNumber === '29876543';
    }

    // Fetch user's companies for the selector
    const companies = await db.userCompany.findMany({
      where: { userId: user.id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            isDemo: true,
            isActive: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    // Check if any App Owner exists
    const existingAppOwner = await db.user.findFirst({
      where: { isSuperDev: true },
      select: { id: true },
    });
    const hasAppOwner = existingAppOwner !== null;

    const displayCompanyName = (user.isSuperDev && activeCompanyName === 'AlphaAi')
      ? 'AlphaAi - App-owner'
      : activeCompanyName;

    const effectiveEmailVerified = user.isSuperDev ? true : (user.emailVerified ?? false);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        emailVerified: effectiveEmailVerified,
        businessName: user.businessName,
        demoModeEnabled: user.demoModeEnabled ?? false,
        isSuperDev: user.isSuperDev,
        hasAppOwner,
        isFirstLogin: false,
        activeCompanyId,
        activeCompanyRole,
        isDemoCompany,
        activeCompanyName: displayCompanyName,
        companies: companies.map(c => ({
          id: c.company.id,
          name: c.company.name === 'AlphaAi' && user.isSuperDev
            ? 'AlphaAi - App-owner'
            : c.company.name,
          role: c.role,
          isDemo: c.company.isDemo,
          isActive: c.company.isActive,
        })),
      },
      usedBackupCode,
    });
  } catch (error) {
    logger.error('[2FA] Verify login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
