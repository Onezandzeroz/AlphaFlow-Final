import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditLog } from '@/lib/audit';
import { withGuard } from '@/lib/route-guard';

/**
 * POST /api/auth/reactivate-account
 *
 * Reactivates a previously-deactivated account using the single-use
 * reactivation token that was emailed to the user at deactivation time.
 *
 * This reverses a self-deactivation: it clears `deactivatedAt`,
 * re-enables any companies that were marked inactive because the user was
 * their sole member, and clears the token so it can't be reused.
 *
 * Body: { token: string }
 *
 * The token is valid for 30 days from the deactivation timestamp. After
 * expiry, the user must contact support — there is no self-service path
 * beyond the 30-day window.
 *
 * This endpoint is PUBLIC (no auth) — the whole point is that a logged-out,
 * deactivated user can recover their account via the email link.
 */
export const POST = withGuard({ auth: false }, async (request: NextRequest) => {
  try {
    const { token } = await request.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Reactivation token is required.' },
        { status: 400 },
      );
    }

    // Look up the user by the reactivation token.
    const user = await db.user.findUnique({
      where: { reactivationToken: token },
      select: {
        id: true,
        email: true,
        deactivatedAt: true,
        reactivationExpires: true,
        isSuperDev: true,
      },
    });

    if (!user) {
      // Token doesn't match any user. Could be already-used (token cleared on
      // reactivation), typoed, or fabricated. Don't reveal which.
      return NextResponse.json(
        { error: 'Ugyldigt eller allerede brugt reaktiveringslink. Hvis dit link er mere end 30 dage gammelt, skal du kontakte support.' },
        { status: 400 },
      );
    }

    // Token must belong to an actually-deactivated account.
    if (!user.deactivatedAt) {
      return NextResponse.json(
        { error: 'Denne konto er allerede aktiv.' },
        { status: 400 },
      );
    }

    // Check expiry.
    if (user.reactivationExpires && user.reactivationExpires < new Date()) {
      logger.warn(`[REACTIVATE_ACCOUNT] Expired reactivation token for user ${user.id} (${user.email})`);
      return NextResponse.json(
        { error: 'Reaktiveringslinket er udløbet (gyldigt i 30 dage). Kontakt support for at få genaktiveret din konto.' },
        { status: 400 },
      );
    }

    // ── Reactivate the user account ──
    await db.user.update({
      where: { id: user.id },
      data: {
        deactivatedAt: null,
        deactivationReason: null,
        reactivationToken: null,
        reactivationExpires: null,
      },
    });
    logger.info(`[REACTIVATE_ACCOUNT] Reactivated user ${user.id} (${user.email})`);

    // ── Reactivate orphaned companies that were marked inactive because ──
    // this user was their sole member at deactivation time. We only flip
    // companies back to active that are currently inactive AND where this
    // user is still a member — we never touch companies the user doesn't own.
    const memberships = await db.userCompany.findMany({
      where: { userId: user.id },
      select: { companyId: true },
    });

    let reactivatedCompanyCount = 0;
    for (const { companyId } of memberships) {
      const company = await db.company.findUnique({
        where: { id: companyId },
        select: { id: true, isActive: true },
      });
      if (company && !company.isActive) {
        await db.company.update({
          where: { id: companyId },
          data: { isActive: true },
        });
        reactivatedCompanyCount++;
        await auditLog({
          action: 'UPDATE',
          entityType: 'Company',
          entityId: companyId,
          companyId,
          userId: user.id,
          changes: { isActive: { old: false, new: true } },
          metadata: { reason: 'account_reactivated', reactivatedUserId: user.id },
        });
      }
    }

    await auditLog({
      action: 'UPDATE',
      entityType: 'User',
      entityId: user.id,
      userId: user.id,
      metadata: {
        reason: 'account_reactivated',
        reactivatedCompanies: reactivatedCompanyCount,
        timestamp: new Date().toISOString(),
      },
    });

    logger.info(
      `[REACTIVATE_ACCOUNT] Reactivation complete for user ${user.id} — ${reactivatedCompanyCount} company(ies) re-enabled`,
    );

    return NextResponse.json({
      success: true,
      message: 'Din konto er blevet genaktiveret. Du kan nu logge ind igen.',
      reactivated: true,
      email: user.email,
    });
  } catch (error) {
    logger.error('Reactivate account error:', error);
    return NextResponse.json(
      { error: 'Failed to reactivate account.' },
      { status: 500 },
    );
  }
});
