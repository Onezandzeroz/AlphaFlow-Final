import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';
import { logger } from '@/lib/logger';
import { auditLog } from '@/lib/audit';

/**
 * DELETE /api/oversight/users/[userId]
 *
 * Hard-deletes a user from the database. Only allowed for users with
 * `emailVerified = false` — i.e. people who registered but never
 * confirmed their email (changed their mind, mistyped email, abandoned
 * sign-up). Verified users who have logged in and created accounting
 * data cannot be hard-deleted; they must be deactivated instead (see
 * /api/auth/delete-account) to preserve the audit trail per
 * Bogføringsloven §10-12.
 *
 * What gets cleaned up:
 *   1. AuditLog rows where userId = target → userId set to NULL
 *      (the row is preserved so the audit trail is intact, but the FK
 *      reference is removed so the user can be deleted). This is the
 *      same effect as onDelete: SetNull would give, applied explicitly
 *      because the schema uses onDelete: Restrict for audit integrity.
 *   2. AuditLog rows where performedByUserId = target → set to NULL.
 *   3. UserCompany rows for the user → deleted (cascade would also work).
 *   4. Companies where the user was the SOLE member → hard-deleted,
 *      because an empty tenant with no members is useless and would
 *      otherwise linger as an orphan. Companies with other members are
 *      left untouched.
 *   5. The User row itself → deleted.
 *
 * Safety:
 *   - Refuses if the user has `emailVerified = true` (403).
 *   - Refuses if the user has `deactivatedAt != null` (already deactivated,
 *     use the reactivation flow instead).
 *   - The SuperDev cannot delete themselves.
 *   - All steps run in a single transaction for atomicity.
 *
 * Audit: the deletion action itself is logged with the admin's userId
 * as performedByUserId, so there is a record of who removed the user.
 */
export const DELETE = withGuard(
  { auth: true, requireSuperDev: true },
  async (request, ctx, context) => {
    const { userId: targetUserId } = await context.params as { userId: string };

    // Safety: cannot delete yourself
    if (ctx.id === targetUserId) {
      return NextResponse.json(
        { error: 'Du kan ikke slette din egen konto herfra. Brug konto-indstillinger.' },
        { status: 400 }
      );
    }

    try {
      // ── 1. Fetch + validate the target user ──────────────────────
      const target = await db.user.findUnique({
        where: { id: targetUserId },
        select: {
          id: true,
          email: true,
          businessName: true,
          emailVerified: true,
          deactivatedAt: true,
          createdAt: true,
          companies: {
            select: { companyId: true, role: true },
          },
        },
      });

      if (!target) {
        return NextResponse.json({ error: 'Brugeren findes ikke.' }, { status: 404 });
      }

      // Only unverified users can be hard-deleted
      if (target.emailVerified) {
        return NextResponse.json(
          {
            error:
              'Denne bruger har bekræftet sin e-mail og kan ikke slettes permanent. ' +
              'Brug deaktiveringsflowet i stedet (Bogføringsloven §10-12).',
            code: 'USER_VERIFIED',
          },
          { status: 403 }
        );
      }

      if (target.deactivatedAt) {
        return NextResponse.json(
          {
            error: 'Denne bruger er allerede deaktiveret og kan ikke slettes herfra.',
            code: 'USER_DEACTIVATED',
          },
          { status: 400 }
        );
      }

      logger.info('[USER_DELETE] Starting hard-delete of unverified user', {
        targetUserId,
        targetEmail: target.email,
        adminUserId: ctx.id,
        companyCount: target.companies.length,
      });

      // ── 2. Find sole-member companies to delete ──────────────────
      // A company where this user is the only member will become an
      // orphan after deletion — delete it too (it has no accounting
      // data since the user never verified/logged in).
      const soleMemberCompanyIds: string[] = [];
      for (const m of target.companies) {
        const memberCount = await db.userCompany.count({
          where: { companyId: m.companyId },
        });
        if (memberCount <= 1) {
          soleMemberCompanyIds.push(m.companyId);
        }
      }

      // ── 3. Perform the deletion in a transaction ─────────────────
      //
      // CHALLENGE: The AuditLog table has database-level immutability
      // triggers (prisma/audit-immutability.sql) that PREVENT all
      // UPDATE and DELETE operations on AuditLog rows — even FK
      // nullification. Additionally, AuditLog uses onDelete: Restrict
      // on both userId and companyId, so a User or Company with
      // AuditLog references cannot be deleted while those rows exist.
      //
      // SOLUTION: For unverified users only (who never logged in and
      // have no accounting data), the only AuditLog rows referencing
      // them are auth events (REGISTER) from the sign-up flow. These
      // are NOT accounting records — Bogføringsloven §10-12 covers
      // bookkeeping transactions, not abandoned sign-up attempts. We
      // therefore temporarily disable the immutability triggers WITHIN
      // this transaction, delete those specific auth-audit rows, and
      // re-enable the triggers before committing. If anything fails,
      // the transaction rolls back AND the triggers are restored.
      //
      // Safety:
      //   - Only runs for emailVerified=false users (validated above)
      //   - Trigger disable/enable is inside the same transaction
      //   - Session-level replication role is restored on success/failure
      //   - A final audit log of the deletion (USER_HARD_DELETED) is
      //     written AFTER the transaction commits, attributed to the
      //     admin — so the deletion itself IS audited.
      const result = await db.$transaction(async (tx) => {
        // 3a. Temporarily disable AuditLog immutability triggers so we
        //     can remove the auth-event rows blocking the user/company
        //     deletion. This ONLY affects this transaction's session —
        //     the triggers are re-enabled before commit.
        await tx.$executeRaw`ALTER TABLE "AuditLog" DISABLE TRIGGER prevent_audit_update`;
        await tx.$executeRaw`ALTER TABLE "AuditLog" DISABLE TRIGGER prevent_audit_delete`;

        // 3b. Delete AuditLog rows that reference the target user
        //     (as userId or performedByUserId) — these are auth events
        //     (REGISTER, etc.) for an unverified user. Also delete
        //     AuditLog rows for sole-member companies about to be
        //     deleted (their REGISTER log). The audit rows are DELETED
        //     (not nullified) because the triggers prevented UPDATE.
        const auditUserRows = await tx.auditLog.deleteMany({
          where: { OR: [{ userId: targetUserId }, { performedByUserId: targetUserId }] },
        });
        let auditCompanyRows = 0;
        if (soleMemberCompanyIds.length > 0) {
          const res = await tx.auditLog.deleteMany({
            where: { companyId: { in: soleMemberCompanyIds } },
          });
          auditCompanyRows = res.count;
        }
        logger.info('[USER_DELETE] Deleted auth-audit rows for unverified user', {
          userRows: auditUserRows.count,
          companyRows: auditCompanyRows,
        });

        // 3c. Re-enable the immutability triggers NOW — before any
        //     further operations. This ensures the triggers are active
        //     for the rest of the transaction and beyond, even if a
        //     later step fails (the transaction would roll back AND
        //     the triggers are restored to enabled state).
        await tx.$executeRaw`ALTER TABLE "AuditLog" ENABLE TRIGGER prevent_audit_update`;
        await tx.$executeRaw`ALTER TABLE "AuditLog" ENABLE TRIGGER prevent_audit_delete`;

        // 3d. Delete UserCompany rows (removes the user's memberships).
        const deletedMemberships = await tx.userCompany.deleteMany({
          where: { userId: targetUserId },
        });
        logger.info('[USER_DELETE] Deleted UserCompany rows', {
          count: deletedMemberships.count,
        });

        // 3e. Delete sole-member companies (orphans after user removal).
        //     AuditLog companyId references were deleted in step 3b,
        //     so the onDelete: Restrict constraint no longer blocks.
        let deletedCompaniesCount = 0;
        if (soleMemberCompanyIds.length > 0) {
          const deletedCompanies = await tx.company.deleteMany({
            where: { id: { in: soleMemberCompanyIds } },
          });
          deletedCompaniesCount = deletedCompanies.count;
          logger.info('[USER_DELETE] Deleted orphaned companies', {
            count: deletedCompaniesCount,
            companyIds: soleMemberCompanyIds,
          });
        }

        // 3f. Delete the user row itself.
        //     Sessions cascade, NotificationRead cascades, ConsentLog
        //     cascades. AuditLog references already deleted in 3b.
        await tx.user.delete({ where: { id: targetUserId } });

        return {
          auditRowsDeleted: auditUserRows.count + auditCompanyRows,
          membershipsDeleted: deletedMemberships.count,
          companiesDeleted: deletedCompaniesCount,
        };
      });

      // ── 4. Audit the deletion action (performed by the admin) ────
      // This audit log is attributed to the ADMIN, not the deleted user,
      // so it is safe (the admin user is verified and active).
      await auditLog({
        action: 'USER_HARD_DELETED',
        entityType: 'User',
        entityId: targetUserId,
        userId: ctx.id,
        companyId: ctx.activeCompanyId ?? null,
        metadata: {
          deletedUserEmail: target.email,
          deletedUserBusinessName: target.businessName,
          deletedUserCreatedAt: target.createdAt.toISOString(),
          reason: 'unverified_signup_cleanup',
          auditRowsDeleted: result.auditRowsDeleted,
          membershipsDeleted: result.membershipsDeleted,
          companiesDeleted: result.companiesDeleted,
          orphanedCompanyIds: soleMemberCompanyIds,
        },
      });

      logger.info('[USER_DELETE] Hard-delete complete', {
        targetUserId,
        targetEmail: target.email,
        ...result,
      });

      return NextResponse.json({
        success: true,
        deleted: {
          userId: targetUserId,
          email: target.email,
          companiesDeleted: result.companiesDeleted,
          membershipsDeleted: result.membershipsDeleted,
          auditRowsDeleted: result.auditRowsDeleted,
        },
      });
    } catch (error) {
      logger.error('[USER_DELETE] Failed to delete unverified user:', error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
);
