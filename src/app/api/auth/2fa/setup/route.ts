import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { auditLog, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import {
  generateTOTPSecret,
  encryptSecret,
  generateQRCodeDataURL,
} from '@/lib/two-factor';

/**
 * POST /api/auth/2fa/setup
 *
 * Initiates 2FA setup for the authenticated user.
 * Generates a new TOTP secret and QR code, but does NOT enable 2FA yet.
 * The user must verify a code (via /activate) to complete setup.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Rate limiting: max 5 setup attempts per minute per user
    const clientIp = getClientIp(request);
    const { allowed } = rateLimit(`2fa-setup:${ctx.id}:${clientIp}`, {
      maxRequests: 5,
      windowMs: 60 * 1000,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many 2FA setup attempts. Please try again later.' },
        { status: 429 }
      );
    }

    // Fetch current user 2FA state
    const user = await db.user.findUnique({
      where: { id: ctx.id },
      select: {
        twoFactorEnabled: true,
        twoFactorSecret: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If 2FA is already enabled, user must disable first
    if (user.twoFactorEnabled) {
      return NextResponse.json(
        { error: '2FA is already enabled. Disable it first to set up a new secret.' },
        { status: 400 }
      );
    }

    // Generate new TOTP secret (plain text)
    const plainSecret = generateTOTPSecret();

    // Encrypt and store the secret (don't enable yet — user must verify a code)
    const encryptedSecret = encryptSecret(plainSecret);

    await db.user.update({
      where: { id: ctx.id },
      data: {
        twoFactorSecret: encryptedSecret,
        // Keep twoFactorEnabled = false until the user verifies a code
      },
    });

    // Generate QR code data URL for the authenticator app
    const qrCodeDataUrl = await generateQRCodeDataURL(ctx.email, plainSecret);

    // Audit log
    await auditLog({
      action: 'TWO_FACTOR_SETUP_STARTED',
      entityType: 'User',
      entityId: ctx.id,
      userId: ctx.id,
      companyId: ctx.activeCompanyId,
      metadata: requestMetadata(request),
    });

    logger.info(`[2FA] Setup started for user ${ctx.id} (${ctx.email})`);

    // Return the plain secret (needed for QR display / manual entry)
    // This is the ONLY time the plain secret is ever sent to the client
    return NextResponse.json({
      secret: plainSecret,
      qrCodeDataUrl,
    });
  } catch (error) {
    logger.error('[2FA] Setup error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate 2FA setup' },
      { status: 500 }
    );
  }
}
