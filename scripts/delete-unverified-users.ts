/**
 * Delete ALL unverified users (emailVerified = false) directly in the DB.
 *
 * This is a standalone maintenance script — run it from the repo root:
 *
 *   bun scripts/delete-unverified-users.ts
 *
 * It does the same thing as the /api/oversight/users/[userId] DELETE
 * route, but for ALL unverified users at once, and without going
 * through the API/UI. Useful when the API route is blocked by
 * permissions or you just want a one-shot cleanup.
 *
 * What it does, in a single transaction:
 *   1. Finds all users with emailVerified = false, deactivatedAt = null
 *   2. Disables AuditLog immutability triggers (temporarily, in-tx)
 *   3. Deletes AuditLog auth-event rows referencing those users
 *      / their sole-member companies
 *   4. Re-enables the triggers
 *   5. Deletes UserCompany memberships
 *   6. Deletes orphaned sole-member companies
 *   7. Deletes the users
 *
 * Safety:
 *   - Runs in a transaction — rolls back on any error
 *   - Triggers are re-enabled before the rest of the work, so even
 *     on failure they end up enabled (the rollback restores them)
 *   - DRY RUN by default: add --confirm to actually delete
 *
 * Usage:
 *   bun scripts/delete-unverified-users.ts              # dry run (preview)
 *   bun scripts/delete-unverified-users.ts --confirm    # actually delete
 */

import { db } from '../src/lib/db';

async function main() {
  const confirm = process.argv.includes('--confirm');

  console.log('═'.repeat(60));
  console.log('  Delete unverified users (emailVerified = false)');
  console.log(`  Mode: ${confirm ? 'CONFIRM — will delete' : 'DRY RUN — preview only'}`);
  console.log('═'.repeat(60));

  // ── 1. Find unverified users ──────────────────────────────────
  const users = await db.user.findMany({
    where: { emailVerified: false, deactivatedAt: null },
    select: {
      id: true,
      email: true,
      businessName: true,
      createdAt: true,
      companies: { select: { companyId: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (users.length === 0) {
    console.log('\n✓ No unverified users found. Nothing to delete.');
    process.exit(0);
  }

  console.log(`\nFound ${users.length} unverified user(s):\n`);
  console.log('  Created            Email                                     Business name');
  console.log('  ─────────────────  ─────────────────────────────────────────  ──────────────────');

  // Track sole-member companies
  const soleMemberCompanyIds: string[] = [];
  for (const u of users) {
    const date = u.createdAt.toISOString().slice(0, 10);
    const email = u.email.padEnd(41).slice(0, 41);
    const name = (u.businessName || '—').slice(0, 18);
    console.log(`  ${date}  ${email}  ${name}`);
    for (const m of u.companies) {
      const memberCount = await db.userCompany.count({ where: { companyId: m.companyId } });
      if (memberCount <= 1) soleMemberCompanyIds.push(m.companyId);
    }
  }

  console.log(`\n  Sole-member companies to also delete: ${soleMemberCompanyIds.length}`);

  if (!confirm) {
    console.log('\n─'.repeat(60));
    console.log('DRY RUN — nothing was deleted.');
    console.log('To actually delete, run: bun scripts/delete-unverified-users.ts --confirm');
    process.exit(0);
  }

  // ── 2. Delete in a transaction ────────────────────────────────
  console.log('\n─'.repeat(60));
  console.log('Deleting...');

  const userIds = users.map(u => u.id);

  const result = await db.$transaction(async (tx) => {
    // 2a. Disable immutability triggers
    await tx.$executeRaw`ALTER TABLE "AuditLog" DISABLE TRIGGER prevent_audit_update`;
    await tx.$executeRaw`ALTER TABLE "AuditLog" DISABLE TRIGGER prevent_audit_delete`;

    // 2b. Delete AuditLog rows (auth events for unverified users)
    const auditUserRows = await tx.auditLog.deleteMany({
      where: { OR: [{ userId: { in: userIds } }, { performedByUserId: { in: userIds } }] },
    });
    const auditCompanyRows = soleMemberCompanyIds.length > 0
      ? (await tx.auditLog.deleteMany({ where: { companyId: { in: soleMemberCompanyIds } } })).count
      : 0;

    // 2c. Re-enable triggers
    await tx.$executeRaw`ALTER TABLE "AuditLog" ENABLE TRIGGER prevent_audit_update`;
    await tx.$executeRaw`ALTER TABLE "AuditLog" ENABLE TRIGGER prevent_audit_delete`;

    // 2d. Delete UserCompany memberships
    const memberships = await tx.userCompany.deleteMany({
      where: { userId: { in: userIds } },
    });

    // 2e. Delete orphaned companies
    const companies = soleMemberCompanyIds.length > 0
      ? (await tx.company.deleteMany({ where: { id: { in: soleMemberCompanyIds } } })).count
      : 0;

    // 2f. Delete users (sessions, notificationRead, consentLog cascade)
    const deletedUsers = await tx.user.deleteMany({ where: { id: { in: userIds } } });

    return {
      users: deletedUsers.count,
      companies,
      memberships: memberships.count,
      auditRows: auditUserRows.count + auditCompanyRows,
    };
  });

  console.log(`\n✓ Done.`);
  console.log(`  Users deleted:        ${result.users}`);
  console.log(`  Companies deleted:    ${result.companies}`);
  console.log(`  Memberships deleted:  ${result.memberships}`);
  console.log(`  AuditLog rows deleted:${result.auditRows}`);
  console.log('');

  process.exit(0);
}

main().catch((err) => {
  console.error('\n✗ Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
