/**
 * One-time script: Delete the old demo company (CVR 29876543) and optionally
 * clean up any orphaned demo data. After running this, entering demo mode in
 * the UI will create a fresh demo company with CVR 41250313 + seed data.
 *
 * Usage:
 *   bun run scripts/reset-demo-company.ts
 *
 * Or with dry-run (just shows what would be deleted):
 *   DRY_RUN=1 bun run scripts/reset-demo-company.ts
 */

import { db } from '@/lib/db';

async function main() {
  const dryRun = process.env.DRY_RUN === '1';

  console.log('=== Reset Demo Company ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will delete)'}`);
  console.log('');

  // Find the old demo company (CVR 29876543)
  const oldDemoCompanies = await db.company.findMany({
    where: {
      cvrNumber: '29876543',
    },
    select: {
      id: true,
      name: true,
      cvrNumber: true,
      isDemo: true,
      isActive: true,
      createdAt: true,
      _count: {
        select: {
          transactions: true,
          invoices: true,
          contacts: true,
          journalEntries: true,
          accounts: true,
          vatSubmissions: true,
        },
      },
    },
  });

  if (oldDemoCompanies.length === 0) {
    console.log('✓ No companies found with CVR 29876543 — nothing to delete.');
    console.log('  (The old demo company may have already been removed.)');

    // Also check if there's already a company with the new CVR (41250313)
    const newDemo = await db.company.findFirst({
      where: { cvrNumber: '41250313' },
      select: { id: true, name: true, isDemo: true, createdAt: true },
    });
    if (newDemo) {
      console.log(`\n  A company with CVR 41250313 already exists:`);
      console.log(`    Name: ${newDemo.name}`);
      console.log(`    isDemo: ${newDemo.isDemo}`);
      console.log(`    Created: ${newDemo.createdAt}`);
      console.log(`    → You're already set up. No action needed.`);
    } else {
      console.log(`\n  No company with CVR 41250313 found yet.`);
      console.log(`  → Enter demo mode in the UI to create a fresh demo company.`);
    }
    return;
  }

  console.log(`Found ${oldDemoCompanies.length} company/companies with CVR 29876543:`);
  for (const c of oldDemoCompanies) {
    console.log(`  - ID: ${c.id}`);
    console.log(`    Name: ${c.name}`);
    console.log(`    isDemo: ${c.isDemo}, isActive: ${c.isActive}`);
    console.log(`    Created: ${c.createdAt}`);
    console.log(`    Related data:`);
    console.log(`      transactions: ${c._count.transactions}`);
    console.log(`      invoices: ${c._count.invoices}`);
    console.log(`      contacts: ${c._count.contacts}`);
    console.log(`      journalEntries: ${c._count.journalEntries}`);
    console.log(`      accounts: ${c._count.accounts}`);
    console.log(`      vatSubmissions: ${c._count.vatSubmissions}`);
  });

  if (dryRun) {
    console.log('\n[DRY RUN] No changes made. Run without DRY_RUN=1 to actually delete.');
    return;
  }

  // Delete the old demo company/companies (cascade deletes all related data
  // because the schema uses onDelete: Cascade on the Company relations)
  console.log('\nDeleting...');
  for (const c of oldDemoCompanies) {
    try {
      await db.company.delete({ where: { id: c.id } });
      console.log(`  ✓ Deleted company "${c.name}" (ID: ${c.id}) + all related data`);
    } catch (err) {
      console.error(`  ✗ Failed to delete company ${c.id}: ${err instanceof Error ? err.message : String(err)}`);
      console.error('    This may happen if there are foreign-key constraints without cascade.');
      console.error('    Try running: bun x prisma db push --force-reset (WARNING: resets ALL data)');
    }
  }

  console.log('\n✓ Done. The old demo company has been removed.');
  console.log('  Next step: Log into AlphaFlow and click "Enter demo mode"');
  console.log('  — this will create a fresh demo company with CVR 41250313 + seed data.');
}

main()
  .catch((err) => {
    console.error('Script failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
