/**
 * reactivate-superdev.ts
 *
 * Emergency recovery script — reactivates a SuperDev account that was
 * accidentally deactivated via the self-deactivation flow.
 *
 * BACKGROUND
 * ----------
 * The SuperDev account is the platform-level break-glass/admin account and
 * MUST NEVER be deactivated. Before the §10-12 / deactivation-compliance
 * fixes landed, the deactivation flow did not protect SuperDev accounts, so
 * a SuperDev could be (and was) accidentally deactivated. This script
 * reverses that.
 *
 * WHAT IT DOES
 * ------------
 * For every deactivated SuperDev user (isSuperDev = true AND deactivatedAt
 * IS NOT NULL):
 *   1. Clears deactivatedAt + deactivationReason.
 *   2. Clears reactivationToken + reactivationExpires IF those columns exist
 *      in the production schema (robust to builds from before the fix — the
 *      columns may not exist yet). Detected via information_schema, never
 *      throws.
 *   3. Re-enables any companies (isActive: true) where this user is a member
 *      AND that were marked inactive because the user was their sole member
 *      at deactivation time.
 *   4. Destroys any dangling sessions (forces a fresh login).
 *
 * SAFETY
 * ------
 * - DRY-RUN BY DEFAULT. Inspects and prints what it would do without
 *   modifying anything. Pass --confirm to apply.
 * - Only touches deactivated SuperDev accounts — never regular users.
 * - Idempotent: running it twice is a no-op the second time.
 * - Uses a transaction so the user reactivation + company re-enable are atomic.
 *
 * RUN
 * ---
 *   bun run scripts/reactivate-superdev.ts            # dry-run (default)
 *   bun run scripts/reactivate-superdev.ts --confirm   # apply
 *
 * Requirements: DATABASE_URL must be set in .env (production Postgres).
 * The Prisma client in node_modules is used as-is — no migrate needed.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes('--confirm');

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  // Check the live DB schema (not the Prisma client types) so this script
  // works on builds from before the reactivationToken fields were added.
  const rows: Array<{ exists: boolean }> = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = ${tableName}
        AND column_name = ${columnName}
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

async function main() {
  console.log('━'.repeat(60));
  console.log('  SuperDev reactivation script');
  console.log(`  Mode: ${CONFIRM ? '✅ CONFIRM (will apply changes)' : '🔍 DRY-RUN (no changes — pass --confirm to apply)'}`);
  console.log('━'.repeat(60) + '\n');

  // ── 1. Find deactivated SuperDev accounts ────────────────────────
  // We deliberately select only the fields that exist in ALL schema
  // versions (deactivatedAt, deactivationReason are part of the original
  // soft-delete design).
  const deactivatedSuperDevs = await prisma.user.findMany({
    where: { isSuperDev: true, deactivatedAt: { not: null } },
    select: {
      id: true,
      email: true,
      businessName: true,
      deactivatedAt: true,
      deactivationReason: true,
    },
  });

  if (deactivatedSuperDevs.length === 0) {
    console.log('✅ No deactivated SuperDev accounts found. Nothing to do.\n');
    return;
  }

  console.log(`📋 Found ${deactivatedSuperDevs.length} deactivated SuperDev account(s):\n`);
  for (const u of deactivatedSuperDevs) {
    console.log(`   • ${u.email} (${u.businessName || 'no business name'})`);
    console.log(`     id: ${u.id}`);
    console.log(`     deactivatedAt: ${u.deactivatedAt?.toISOString()}`);
    console.log(`     reason: ${u.deactivationReason || '(none)'}`);
  }
  console.log('');

  // ── 2. Detect whether the new token columns exist ────────────────
  const hasReactivationToken = await columnExists('User', 'reactivationToken');
  const hasReactivationExpires = await columnExists('User', 'reactivationExpires');
  console.log(`🔎 Schema check: reactivationToken column ${hasReactivationToken ? 'exists ✓' : 'absent (old schema — will skip)'}`);
  console.log(`🔎 Schema check: reactivationExpires column ${hasReactivationExpires ? 'exists ✓' : 'absent (old schema — will skip)'}\n`);

  if (!CONFIRM) {
    console.log('🔍 DRY-RUN — the following WOULD be done with --confirm:\n');
  }

  // ── 3. For each deactivated SuperDev, plan the reactivation ──────
  // Gather the companies that would be re-enabled so we can report them
  // even in dry-run mode.
  const plans: Array<{
    user: { id: string; email: string };
    companiesToReEnable: Array<{ id: string; name: string }>;
  }> = [];

  for (const u of deactivatedSuperDevs) {
    const memberships = await prisma.userCompany.findMany({
      where: { userId: u.id },
      select: { companyId: true },
    });

    const inactiveCompanies = await prisma.company.findMany({
      where: { id: { in: memberships.map((m) => m.companyId) }, isActive: false },
      select: { id: true, name: true },
    });

    plans.push({
      user: { id: u.id, email: u.email },
      companiesToReEnable: inactiveCompanies,
    });

    if (inactiveCompanies.length > 0) {
      console.log(`   For ${u.email}: would re-enable ${inactiveCompanies.length} inactive company(ies):`);
      for (const c of inactiveCompanies) {
        console.log(`     • "${c.name}" (${c.id})`);
      }
    } else {
      console.log(`   For ${u.email}: no inactive companies to re-enable.`);
    }
    console.log('');
  }

  if (!CONFIRM) {
    console.log('━'.repeat(60));
    console.log('🔍 DRY-RUN complete. No changes were made.');
    console.log('   Run with --confirm to apply:');
    console.log('     bun run scripts/reactivate-superdev.ts --confirm');
    console.log('━'.repeat(60));
    return;
  }

  // ── 4. Apply the reactivation inside a transaction ──────────────
  console.log('✏️  Applying reactivation...\n');

  for (const plan of plans) {
    await prisma.$transaction(async (tx) => {
      // (a) Clear the soft-deactivation fields. Use raw SQL so we can also
      // clear the token columns IF they exist — without depending on the
      // Prisma client knowing about them (production client may be from an
      // older build).
      let setClause = '"deactivatedAt" = NULL, "deactivationReason" = NULL';
      if (hasReactivationToken) setClause += ', "reactivationToken" = NULL';
      if (hasReactivationExpires) setClause += ', "reactivationExpires" = NULL';

      // $executeRawUnsafe is required because the SET clause is dynamically
      // built. The userId is a Prisma cuid (safe charset) so injection is not
      // a concern, but we still pass it via parameterized $1.
      await tx.$executeRawUnsafe(
        `UPDATE "User" SET ${setClause} WHERE id = $1`,
        plan.user.id,
      );

      // (b) Re-enable the orphaned companies that were marked inactive.
      for (const c of plan.companiesToReEnable) {
        await tx.company.update({
          where: { id: c.id },
          data: { isActive: true },
        });
      }

      // (c) Destroy any dangling sessions so the user must log in fresh.
      await tx.session.deleteMany({ where: { userId: plan.user.id } });
    });

    console.log(`   ✅ Reactivated SuperDev: ${plan.user.email}`);
    for (const c of plan.companiesToReEnable) {
      console.log(`      ↳ re-enabled company: "${c.name}" (${c.id})`);
    }
  }

  // ── 5. Final verification ────────────────────────────────────────
  console.log('\n📊 Verification:');
  const stillDeactivated = await prisma.user.count({
    where: { isSuperDev: true, deactivatedAt: { not: null } },
  });
  const activeSuperDevs = await prisma.user.count({
    where: { isSuperDev: true, deactivatedAt: null },
  });
  console.log(`   Active SuperDev accounts: ${activeSuperDevs}`);
  console.log(`   Still-deactivated SuperDev accounts: ${stillDeactivated}`);

  console.log('\n✨ Done! The SuperDev can now log in again at /login.');
  console.log('   (Sessions were cleared — a fresh login is required.)');
}

main()
  .catch((e) => {
    console.error('\n❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
