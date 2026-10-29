/**
 * Immutability Guard — Runtime Verification + Self-Healing
 *
 * Ensures the PostgreSQL immutability triggers (Bogføringsloven §10-12) are
 * present on the database. Called once from src/instrumentation.ts at every
 * Next.js server boot.
 *
 * WHAT IT DOES:
 *   1. Queries pg_trigger for the 8 expected trigger names.
 *   2. If all 8 are present → logs a one-line confirmation, returns.
 *   3. If any are missing → logs a CRITICAL warning (visible in PM2 logs).
 *   4. If DISABLE_IMMUTABILITY_AUTO_APPLY is unset (default) → re-applies the
 *      trigger SQL files via the `pg` client. This makes the app self-healing:
 *      even if a deploy skipped the db:deploy step, the app fixes itself on
 *      the next boot. The SQL is idempotent (CREATE OR REPLACE FUNCTION +
 *      DROP TRIGGER IF EXISTS + CREATE TRIGGER), so re-applying is safe.
 *   5. If auto-apply is disabled AND triggers are missing → continues to
 *      boot (never blocks startup) but the CRITICAL log line remains so the
 *      operator can see it and fix it manually.
 *
 * WHY THIS EXISTS:
 *   The hash-chain (recordHash) detects tampering AFTER it happens. The
 *   triggers PREVENT tampering at the DB level. Without triggers, a raw
 *   `DELETE FROM "JournalEntry" WHERE id = '...'` succeeds — a direct
 *   Bogføringsloven §10-12 violation. This guard guarantees the triggers
 *   are present on every boot, regardless of how the deploy was performed.
 *
 * NEVER BLOCKS STARTUP:
 *   All errors are caught and logged. The app boots even if the DB is
 *   unreachable — the regular query path will surface connection errors
 *   to users, and the guard will retry on the next boot.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// All 8 immutability triggers that must exist on the database.
// Source of truth: prisma/journal-immutability.sql + prisma/audit-immutability.sql
const REQUIRED_TRIGGERS = [
  // JournalEntry + JournalEntryLine + Transaction (journal-immutability.sql)
  'prevent_journal_entry_delete_all',
  'prevent_journal_entry_update_sealed',
  'prevent_journal_entry_line_delete_all',
  'prevent_journal_entry_line_update_sealed',
  'prevent_transaction_delete_all',
  'prevent_transaction_update_sealed',
  // AuditLog (audit-immutability.sql)
  'prevent_audit_update',
  'prevent_audit_delete',
] as const;

const SQL_FILES_TO_APPLY = [
  'prisma/journal-immutability.sql',
  'prisma/audit-immutability.sql',
];

export interface ImmutabilityGuardResult {
  ok: boolean;
  present: string[];
  missing: string[];
  autoApplied: boolean;
  error?: string;
}

/**
 * Check which immutability triggers are present on the database.
 * Returns the full list of present + missing trigger names.
 *
 * Uses a raw `pg` Client (not Prisma) because Prisma cannot query pg_trigger
 * easily and cannot execute the trigger DDL at all.
 */
async function checkTriggers(
  databaseUrl: string,
): Promise<{ present: string[]; missing: string[] }> {
  const { Client } = await import('pg');
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    const res = await client.query(
      `SELECT tgname FROM pg_trigger
       WHERE NOT tgisinternal AND tgname = ANY($1::text[])`,
      [REQUIRED_TRIGGERS as unknown as string[]],
    );
    const present = new Set(res.rows.map((r: { tgname: string }) => r.tgname));
    const missing = REQUIRED_TRIGGERS.filter((t) => !present.has(t));
    return { present: Array.from(present), missing };
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Re-apply the immutability trigger SQL files. Idempotent — safe to call
 * on every boot even if triggers already exist (CREATE OR REPLACE FUNCTION,
 * DROP TRIGGER IF EXISTS, CREATE TRIGGER).
 */
async function applyTriggers(databaseUrl: string): Promise<void> {
  const { Client } = await import('pg');
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    for (const relPath of SQL_FILES_TO_APPLY) {
      const absPath = join(process.cwd(), relPath);
      const sql = readFileSync(absPath, 'utf-8');
      await client.query(sql);
    }
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Main entry point — called from instrumentation.ts on every Next.js boot.
 *
 * Behavior is controlled by env vars:
 *   - DISABLE_IMMUTABILITY_GUARD=true     → skip entirely (for dev/test)
 *   - DISABLE_IMMUTABILITY_AUTO_APPLY=true → verify only, never auto-apply
 *
 * Default (production): verify + auto-apply if missing.
 */
export async function verifyAndApplyImmutability(
  databaseUrl: string | undefined,
): Promise<ImmutabilityGuardResult> {
  if (process.env.DISABLE_IMMUTABILITY_GUARD === 'true') {
    return { ok: true, present: [], missing: [], autoApplied: false };
  }

  if (!databaseUrl) {
    // Don't crash — the app may still serve static pages. Log loudly.
    console.error(
      '[IMMUTABILITY-GUARD] CRITICAL: DATABASE_URL not set — cannot verify immutability triggers. ' +
        'Bogføringsloven §10-12 compliance cannot be guaranteed. Set DATABASE_URL in .env.',
    );
    return {
      ok: false,
      present: [],
      missing: Array.from(REQUIRED_TRIGGERS),
      autoApplied: false,
      error: 'DATABASE_URL not set',
    };
  }

  // Step 1 — verify
  let check: { present: string[]; missing: string[] };
  try {
    check = await checkTriggers(databaseUrl);
  } catch (err) {
    // DB unreachable — don't block startup. Log and bail.
    console.error(
      '[IMMUTABILITY-GUARD] Could not verify triggers (DB unreachable):',
      err instanceof Error ? err.message : err,
    );
    return {
      ok: false,
      present: [],
      missing: Array.from(REQUIRED_TRIGGERS),
      autoApplied: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Step 2 — all present, nothing to do
  if (check.missing.length === 0) {
    console.info(
      `[IMMUTABILITY-GUARD] ✓ All ${check.present.length} immutability triggers active (Bogføringsloven §10-12).`,
    );
    return { ok: true, present: check.present, missing: [], autoApplied: false };
  }

  // Step 3 — triggers missing. Log CRITICAL warning.
  console.error(
    `[IMMUTABILITY-GUARD] ❌ CRITICAL: ${check.missing.length}/${REQUIRED_TRIGGERS.length} immutability triggers MISSING: ${check.missing.join(', ')}. ` +
      'POSTED JournalEntry/Transaction/AuditLog rows are NOT protected at the DB level — Bogføringsloven §10-12 violation in progress.',
  );

  // Step 4 — auto-apply unless explicitly disabled
  if (process.env.DISABLE_IMMUTABILITY_AUTO_APPLY === 'true') {
    console.error(
      '[IMMUTABILITY-GUARD] Auto-apply disabled (DISABLE_IMMUTABILITY_AUTO_APPLY=true). ' +
        'Run "bun run immutability:apply" manually to fix.',
    );
    return {
      ok: false,
      present: check.present,
      missing: check.missing,
      autoApplied: false,
    };
  }

  // Step 5 — self-heal: re-apply the trigger SQL
  try {
    console.warn(
      '[IMMUTABILITY-GUARD] Self-healing: re-applying immutability trigger SQL...',
    );
    await applyTriggers(databaseUrl);

    // Re-verify to confirm the fix worked
    const recheck = await checkTriggers(databaseUrl);
    if (recheck.missing.length === 0) {
      console.info(
        `[IMMUTABILITY-GUARD] ✓ Self-heal successful — all ${recheck.present.length} triggers now active.`,
      );
      return {
        ok: true,
        present: recheck.present,
        missing: [],
        autoApplied: true,
      };
    }
    console.error(
      `[IMMUTABILITY-GUARD] ❌ Self-heal applied SQL but ${recheck.missing.length} triggers still missing: ${recheck.missing.join(', ')}. Manual intervention required.`,
    );
    return {
      ok: false,
      present: recheck.present,
      missing: recheck.missing,
      autoApplied: true,
      error: 'Triggers still missing after re-apply',
    };
  } catch (err) {
    console.error(
      '[IMMUTABILITY-GUARD] ❌ Self-heal FAILED:',
      err instanceof Error ? err.message : err,
    );
    return {
      ok: false,
      present: check.present,
      missing: check.missing,
      autoApplied: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
