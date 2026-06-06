import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { destroyAllUserSessions } from '@/lib/session';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';
import { auditLog } from '@/lib/audit';
import { withGuard } from '@/lib/route-guard';

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
      select: { id: true, email: true, deactivatedAt: true },
    });
    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (existingUser.deactivatedAt) {
      return NextResponse.json({ error: 'Account is already deactivated' }, { status: 400 });
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

    // ─── Step 2: Deactivate the user account ─────────────────────────────
    await db.user.update({
      where: { id: userId },
      data: {
        deactivatedAt: new Date(),
        deactivationReason: 'self_request',
      },
    });
    logger.info(`[DEACTIVATE_ACCOUNT] Marked user ${userId} as deactivated`);

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

    return NextResponse.json({
      success: true,
      message: 'Account deactivated. All accounting data and audit logs are preserved per Bogføringsloven §10-12.',
      deactivated: true,
    });
  } catch (error) {
    logger.error('Failed to deactivate account:', error);
    return NextResponse.json({ error: 'Failed to deactivate account' }, { status: 500 });
  }
});
