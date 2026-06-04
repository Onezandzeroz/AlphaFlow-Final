/**
 * Apply AuditLog Database-Level Immutability Protection
 *
 * This script applies PostgreSQL triggers that prevent UPDATE and DELETE
 * on the AuditLog table, enforcing immutability at the database level
 * in compliance with Bogforingsloven §10-12.
 *
 * Usage:
 *   bun run scripts/apply-audit-immutability.ts
 *
 * Or with a specific DATABASE_URL:
 *   DATABASE_URL=postgresql://... bun run scripts/apply-audit-immutability.ts
 *
 * After applying, verify with:
 *   SELECT tgname FROM pg_trigger WHERE tgrelid = '"AuditLog"'::regclass;
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

// Read the SQL file
const sqlPath = join(process.cwd(), 'prisma', 'audit-immutability.sql');
const sql = readFileSync(sqlPath, 'utf-8');

// We need to use pg directly since Prisma doesn't support DDL triggers easily
async function applyImmutability() {
  let client: any;

  try {
    // Dynamic import of pg
    const { Client } = await import('pg');
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();

    console.log('Connected to PostgreSQL database.');
    console.log('Applying AuditLog immutability triggers...\n');

    await client.query(sql);

    // Verify the triggers were created
    const result = await client.query(`
      SELECT tgname, tgtype
      FROM pg_trigger
      WHERE tgrelid = '"AuditLog"'::regclass
        AND tgname IN ('prevent_audit_update', 'prevent_audit_delete');
      ORDER BY tgname;
    `);

    if (result.rows.length === 2) {
      console.log('✅ SUCCESS: AuditLog immutability triggers applied.\n');
      console.log('Active triggers:');
      for (const row of result.rows) {
        const op = row.tgname === 'prevent_audit_update' ? 'UPDATE' : 'DELETE';
        console.log(`   • ${row.tgname} — blocks ${op} on "AuditLog"`);
      }
      console.log('\nAuditLog is now immutable at the database level (Bogføringsloven §10-12).');
    } else {
      console.error('⚠️  WARNING: Expected 2 triggers, found', result.rows.length);
      console.error('Trigger rows:', result.rows);
      process.exit(1);
    }
  } catch (error: any) {
    // Check if the error is because triggers already exist with the same definition
    if (error.message?.includes('already exists')) {
      console.log('ℹ️  Triggers already exist — this is expected if the script was run before.');
      console.log('The DROP TRIGGER IF EXISTS at the top ensures idempotent execution.');
    } else {
      console.error('❌ ERROR applying immutability triggers:', error.message);
      process.exit(1);
    }
  } finally {
    if (client) {
      await client.end();
    }
  }
}

applyImmutability();
