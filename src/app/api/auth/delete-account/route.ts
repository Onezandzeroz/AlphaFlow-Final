import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { destroyAllUserSessions } from '@/lib/session';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';
import { auditLog } from '@/lib/audit';
import { withGuard } from '@/lib/route-guard';
import { sendAccountDeactivatedEmail } from '@/lib/email-service';

/**
 * DELETE /api/auth/delete-account
 */
export const DELETE = withGuard({
  auth: true,
  blockOversight: true,
}, async (request, ctx) => {
  try {
    // Verify user exists and is not already deactivated
    const existingUser = await db.user.findUnique({
      where: { id: ctx.id },
      select: { id: true, email: true, deactivatedAt: true, isSuperDev: true },
    });
    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (existingUser.deactivatedAt) {
      return NextResponse.json({ error: 'Account is already deactivated' }, { status: 400 });
    }

    // ── SuperDev accounts can NEVER be deactivated ────────────────────
    // SuperDev is the platform-level break-glass/admin account. Allowing it
    // to be deactivated would lock the operator out of the entire platform
    // (no oversight access, no admin actions, no way to recover a locked
    // tenant). This guard is intentionally at the API layer so it cannot be
    // bypassed via the UI — even a direct API call is refused.
    if (existingUser.isSuperDev) {
      logger.warn(`[DEACTIVATE_ACCOUNT] Blocked attempt to deactivate SuperDev account ${ctx.id} (${existingUser.email})`);
      await auditLog({
        action: 'DELETE_ATTEMPT',
        entityType: 'User',
        entityId: ctx.id,
        companyId: ctx.activeCompanyId,
        userId: ctx.id,
        metadata: {
          reason: 'superdev_deactivation_blocked',
          blocked: true,
        },
      });
      return NextResponse.json(
        {
          error: 'Denne konto kan ikke deaktiveres. SuperDev-konti er permanent beskyttet mod deaktivering. Kontakt en anden SuperDev eller platform-administratoren, hvis du mener dette er en fejl.',
          code: 'SUPERDEV_PROTECTED',
        },
        { status: 403 },
      );
    }

    const userId = ctx.id;
    const userEmail = existingUser.email;

    // Audit log BEFORE any changes
    await auditLog({
      action: 'ACCOUNT_DEACTIVATED',
      entityType: 'User',
      entityId: userId,
      companyId: ctx.activeCompanyId,
      userId,
      metadata: {
        email: userEmail,
        reason: 'self_request',
        timestamp: new Date().toISOString(),
      },
    });

    logger.info(`[DEACTIVATE_ACCOUNT] Starting deactivation for user ${userId} (${userEmail})`);

    // ─── Step 1: Destroy all sessions ────────────────────────────────────
    await destroyAllUserSessions(userId);
    logger.info(`[DEACTIVATE_ACCOUNT] Destroyed all sessions for user ${userId}`);

    // ─── Step 2: Deactivate the user account + issue a reactivation token ─
    // Generate a single-use, 30-day reactivation token so the user can undo
    // this via the link in the deactivation email.
    const { randomUUID } = await import('crypto');
    const reactivationToken = randomUUID();
    const reactivationExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // +30 days

    await db.user.update({
      where: { id: userId },
      data: {
        deactivatedAt: new Date(),
        deactivationReason: 'self_request',
        reactivationToken,
        reactivationExpires,
      },
    });
    logger.info(`[DEACTIVATE_ACCOUNT] Marked user ${userId} as deactivated (reactivation token issued, expires ${reactivationExpires.toISOString()})`);

    // ─── Step 3: Handle companies where user is sole member ──────────────
    const memberships = await db.userCompany.findMany({
      where: { userId },
      select: { companyId: true },
    });

    for (const { companyId } of memberships) {
      const memberCount = await db.userCompany.count({
        where: { companyId },
      });

      if (memberCount <= 1) {
        await db.company.update({
          where: { id: companyId },
          data: { isActive: false },
        });
        logger.info(`[DEACTIVATE_ACCOUNT] Marked orphaned company ${companyId} as inactive`);

        await auditLog({
          action: 'UPDATE',
          entityType: 'Company',
          entityId: companyId,
          companyId,
          userId,
          changes: { isActive: { old: true, new: false } },
          metadata: { reason: 'sole_member_deactivated', deactivatedUserId: userId },
        });
      }
    }

    // ─── Step 4: Clean up non-accounting, non-audit data ─────────────────
    const sentInvitations = await db.invitation.deleteMany({
      where: { invitedBy: userId },
    });
    logger.info(`[DEACTIVATE_ACCOUNT] Deleted ${sentInvitations.count} invitations sent by user`);

    const receivedInvitations = await db.invitation.deleteMany({
      where: { email: userEmail, status: 'PENDING' },
    });
    logger.info(`[DEACTIVATE_ACCOUNT] Deleted ${receivedInvitations.count} pending invitations for ${userEmail}`);

    // ─── Step 5: Clear cookies ───────────────────────────────────────────
    const cookieStore = await cookies();
    cookieStore.delete('session');
    cookieStore.delete('userId');

    logger.info(`[DEACTIVATE_ACCOUNT] Deactivation complete for user ${userId}`);

    // ─── Step 6: Send the "sad to see you leave" email with reactivation link ─
    // Fire-and-forget: an email send failure must NOT roll back the deactivation.
    // The token is already stored on the user, so support can still recover the
    // account manually if the email never arrives.
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const reactivationUrl = `${appUrl}/login?reactivate=${reactivationToken}`;
    sendAccountDeactivatedEmail(userEmail, reactivationUrl, 'da', ctx.activeCompanyId).catch((emailErr) => {
      logger.warn(`[DEACTIVATE_ACCOUNT] Failed to send reactivation email to ${userEmail} (account ${userId} is still deactivated; token is stored for manual recovery):`, emailErr);
    });

    return NextResponse.json({
      success: true,
      message: 'Account deactivated. All accounting data and audit logs are preserved per Bogføringsloven §10-12. A reactivation link has been sent to your e-mail.',
      deactivated: true,
    });
  } catch (error) {
    logger.error('Failed to deactivate account:', error);
    return NextResponse.json({ error: 'Failed to deactivate account' }, { status: 500 });
  }
});
