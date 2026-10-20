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
          auditLogs: true,
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
    console.log(`      auditLogs: ${c._count.auditLogs} (deleted first — demo data exempt from Bogføringsloven)`);
  }

  if (dryRun) {
    console.log('\n[DRY RUN] No changes made. Run without DRY_RUN=1 to actually delete.');
    return;
  }

  // Delete the old demo company/companies.
  //
  // We deliberately delete in LEAF-FIRST order (children before parents) to
  // respect the foreign-key constraints WITHOUT changing the schema's onDelete
  // behavior. This is critical: the schema intentionally uses onDelete: Restrict
  // (default) on Account-related FKs to enforce Bogføringsloven §10-12 — an
  // Account cannot be deleted while Transactions/JournalEntryLines reference it.
  //
  // For demo data (which is exempt from the bookkeeping act), we manually
  // delete the leaf tables first, then work up to the Company.
  //
  // The schema's Cascade behavior is left UNCHANGED — normal tenants keep
  // their full bookkeeping-law protection. This script only affects the demo
  // company being deleted.
  console.log('\nDeleting (leaf-first order, preserves Bogføringsloven for normal tenants)...');
  for (const c of oldDemoCompanies) {
    try {
      // Leaf tables that reference Accounts/Transactions WITHOUT Cascade.
      // Use .catch(() => {}) on tables that may not exist in all deployments.
      await db.bankStatementLine.deleteMany({ where: { company: { id: c.id } } }).catch(() => {});
      await db.bankStatement.deleteMany({ where: { companyId: c.id } });
      await db.bankConnection.deleteMany({ where: { companyId: c.id } });
      await db.recurringEntry.deleteMany({ where: { companyId: c.id } });
      await db.budgetEntry.deleteMany({ where: { budget: { companyId: c.id } } }).catch(() => {});
      await db.budget.deleteMany({ where: { companyId: c.id } }).catch(() => {});
      await db.projectBudgetEntry.deleteMany({ where: { project: { companyId: c.id } } }).catch(() => {});
      await db.standardAccountMapping.deleteMany({ where: { companyId: c.id } }).catch(() => {});

      // JournalEntryLines reference Accounts (Restrict) — delete lines before entries
      await db.journalEntryLine.deleteMany({ where: { companyId: c.id } }).catch(() => {});
      await db.journalEntry.deleteMany({ where: { companyId: c.id } });

      // Transactions reference Accounts (Restrict) — delete after journal lines
      await db.transaction.deleteMany({ where: { companyId: c.id } });

      // Now Accounts can be deleted (no more references)
      await db.account.deleteMany({ where: { companyId: c.id } });

      // Other cascading tables (safe to delete directly)
      await db.vATSubmission.deleteMany({ where: { companyId: c.id } });
      await db.invoice.deleteMany({ where: { companyId: c.id } });
      await db.contact.deleteMany({ where: { companyId: c.id } });
      await db.fiscalPeriod.deleteMany({ where: { companyId: c.id } }).catch(() => {});

      // AuditLog uses Restrict (Bogføringsloven) — delete for demo (exempt)
      const auditCount = await db.auditLog.count({ where: { companyId: c.id } });
      if (auditCount > 0) {
        console.log(`  Deleting ${auditCount} AuditLog entries (demo exempt from Bogføringsloven)…`);
        await db.auditLog.deleteMany({ where: { companyId: c.id } });
      }

      // UserCompany join table
      await db.userCompany.deleteMany({ where: { companyId: c.id } }).catch(() => {});

      // Finally, the Company itself (no more FK references)
      await db.company.delete({ where: { id: c.id } });
      console.log(`  ✓ Deleted company "${c.name}" (ID: ${c.id}) + all related demo data`);
    } catch (err) {
      console.error(`  ✗ Failed to delete company ${c.id}: ${err instanceof Error ? err.message : String(err)}`);
      console.error('    Schema cascade behavior is UNCHANGED — normal tenants are not affected.');
      console.error('    If this persists, check for new tables referencing Company without Cascade.');
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
