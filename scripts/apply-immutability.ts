/**
 * Apply ALL Database-Level Immutability Protection
 *
 * This script applies PostgreSQL triggers that prevent:
 *   - ALL hard DELETEs on JournalEntry, JournalEntryLine, Transaction
 *   - UPDATEs on sealed JournalEntry rows
 *   - UPDATEs on JournalEntryLine rows belonging to sealed entries
 *   - UPDATEs on sealed Transaction rows
 *   - ALL UPDATEs and DELETEs on AuditLog
 *
 * In compliance with Bogføringsloven §10-12 (Danish Bookkeeping Act).
 *
 * Usage:
 *   bun run scripts/apply-immutability.ts
 *
 * After applying, verify with:
 *   SELECT tgname, tgrelid::regclass
 *   FROM pg_trigger
 *   WHERE tgname LIKE 'prevent_%'
 *   ORDER BY tgrelid::regclass, tgname;
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// Load .env.local if present
try {
  const dotenv = await import('dotenv');
  dotenv.config({ path: join(process.cwd(), '.env.local') });
} catch {
  // dotenv not available, rely on environment
}

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set.');
  console.error('Set it in .env.local or pass it as an environment variable.');
  process.exit(1);
}

const sqlFiles = [
  { name: 'JournalEntry + JournalEntryLine + Transaction', path: 'prisma/journal-immutability.sql' },
  { name: 'AuditLog', path: 'prisma/audit-immutability.sql' },
];

async function applyImmutability() {
  let client: any;

  try {
    const { Client } = await import('pg');
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();

    console.log('Connected to PostgreSQL database.\n');
    console.log('═'.repeat(60));
    console.log('  DATABASE-LEVEL IMMUTABILITY PROTECTION');
    console.log('  Bogføringsloven §10-12 Compliance');
    console.log('═'.repeat(60));
    console.log();

    for (const file of sqlFiles) {
      console.log(`▸ Applying: ${file.name}...`);
      const sqlPath = join(process.cwd(), file.path);
      const sql = readFileSync(sqlPath, 'utf-8');
      await client.query(sql);
      console.log(`  ✅ Applied successfully`);
      console.log();
    }

    // Verify all triggers
    const result = await client.query(`
      SELECT tgname, tgrelid::regclass AS table_name,
             CASE tgtype
               WHEN 3 THEN 'BEFORE UPDATE'
               WHEN 5 THEN 'BEFORE DELETE'
               ELSE 'OTHER'
             END AS trigger_type
      FROM pg_trigger
      WHERE tgname IN (
        'prevent_journal_entry_delete_all',
        'prevent_journal_entry_update_sealed',
        'prevent_journal_entry_line_delete_all',
        'prevent_journal_entry_line_update_sealed',
        'prevent_transaction_delete_all',
        'prevent_transaction_update_sealed',
        'prevent_audit_update',
        'prevent_audit_delete'
      )
      ORDER BY tgrelid::regclass, tgname;
    `);

    console.log('═'.repeat(60));
    console.log(`  ACTIVE IMMUTABILITY TRIGGERS (${result.rows.length})`);
    console.log('═'.repeat(60));
    console.log();

    let currentTable = '';
    for (const row of result.rows) {
      if (row.table_name !== currentTable) {
        currentTable = row.table_name;
        console.log(`  📋 ${currentTable}`);
      }
      console.log(`     • ${row.trigger_type} → ${row.tgname}`);
    }
    console.log();

    if (result.rows.length >= 8) {
      console.log('✅ All immutability triggers are active.');
      console.log('   Hard DELETEs and sealed UPDATEs are now blocked at the DB level.');
      console.log('   Even direct database access (Neon console, psql) will be rejected.\n');
    } else {
      console.error(`⚠️  WARNING: Expected 8+ triggers, found ${result.rows.length}`);
      process.exit(1);
    }
  } catch (error: any) {
    console.error('❌ ERROR applying immutability triggers:', error.message);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

applyImmutability();
