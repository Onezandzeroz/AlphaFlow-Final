import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext, destroyAllUserSessions } from '@/lib/session';
import { blockOversightMutation } from '@/lib/rbac';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';
import { auditLog } from '@/lib/audit';

/**
 * DELETE /api/auth/delete-account
 *
 * Deactivates the user account instead of permanently deleting it.
 *
 * This design is mandated by Bogføringsloven §10-12, which requires a 5-year
 * immutable audit trail. Hard-deleting a user (and their audit logs via cascade)
 * would violate both:
 *   - The Bookkeeping Act's retention obligation
 *   - GDPR Art. 17(3)(c) exemption where EU/national law overrides the right
 *     to erasure
 *   - The immutability guarantees documented in audit.ts and enforced by
 *     PostgreSQL triggers (prisma/audit-immutability.sql)
 *
 * Deactivation flow:
 *   1. Destroy all active sessions (immediate lockout)
 *   2. Set deactivatedAt timestamp on the User record
 *   3. For companies where the user is the SOLE member:
 *      - Mark company as inactive (isActive = false) but preserve all data
 *   4. Delete only non-accounting, non-audit data:
 *      - Pending invitations sent by this user
 *      - Pending invitations targeting this user's email
 *   5. Record audit log of the deactivation
 *   6. Clear cookies
 *
 * Data that is PRESERVED (never deleted):
 *   - User record (with deactivatedAt set)
 *   - All AuditLog entries
 *   - All accounting data (transactions, invoices, journal entries, etc.)
 *   - Company records (marked inactive if sole member)
 *   - Backup history
 */
export async function DELETE(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

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
        // User is the only member — mark company as inactive (preserve all data)
        await db.company.update({
          where: { id: companyId },
          data: { isActive: false },
        });
        logger.info(`[DEACTIVATE_ACCOUNT] Marked orphaned company ${companyId} as inactive`);

        // Audit log the company deactivation
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
    // Only delete invitations — these are transient, not accounting records.
    // Audit logs are NEVER deleted per Bogføringsloven §10-12.

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
}
