-- ============================================================
-- JournalEntry, JournalEntryLine & Transaction Database-Level
-- Immutability Protection
-- ============================================================
--
-- Purpose: Enforce immutability of ALL journal entries, lines, and
--          transactions at the database level, in compliance with
--          Bogføringsloven §10-12 (Danish Bookkeeping Act) and
--          BEK 97 Bilag 1, 2, e (Row 11, 15):
--          "bogførte transaktioner ikke kan ændres, tilbagedateres
--           eller slettes" — posted transactions cannot be changed,
--          backdated, or deleted.
--
-- IMPORTANT: POSTED journal entries and sealed transactions are fully
-- protected. DRAFT entries may be hard-deleted (user discards a draft).
-- Sealed transactions may not be deleted — use soft-cancel instead.
--
-- ADMIN BYPASS: Administrative operations (demo reset, tenant import,
-- backup restore) may bypass triggers by setting a session variable:
--   SET LOCAL app.immutability_bypass = 'true';
--   -- perform deletes --
--   COMMIT;  -- session variable auto-resets
--
-- Deployment:
--   bun run scripts/apply-immutability.ts
--   -- OR manually via psql:
--   psql $DATABASE_URL -f prisma/journal-immutability.sql
--
-- Verification:
--   SELECT tgname, tgrelid::regclass, tgtype
--   FROM pg_trigger
--   WHERE tgname IN (
--     'prevent_journal_entry_delete_all',
--     'prevent_journal_entry_update_sealed',
--     'prevent_journal_entry_line_delete_all',
--     'prevent_journal_entry_line_update_sealed',
--     'prevent_transaction_delete_all',
--     'prevent_transaction_update_sealed'
--   );
--
-- Expected: 6 rows
--
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- 0. Helper: check if admin bypass is active
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION _immutability_bypass_active()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN current_setting('app.immutability_bypass', true) = 'true';
EXCEPTION WHEN OTHERS THEN
    -- Variable not set → bypass not active
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE;


-- ════════════════════════════════════════════════════════════════
-- 1. JournalEntry — NO hard deletes, UPDATE only before sealing
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION journal_entry_immutable_guard()
RETURNS TRIGGER AS $$
BEGIN
    IF _immutability_bypass_active() THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD;  ELSE RETURN NEW; END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        -- Block hard deletes on POSTED entries.
        -- DRAFT entries may be hard-deleted (user discards a draft).
        IF OLD.status = 'POSTED' THEN
            RAISE EXCEPTION
              'JournalEntry immutability violation: DELETE not permitted on POSTED entries (Bogføringsloven §10-12). Entry ID: %. Cancel or reverse instead.',
              OLD.id;
        END IF;

        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- POSTED rows are protected once sealed (recordHash IS NOT NULL).
        -- The window before sealing (recordHash IS NULL) exists only inside
        -- the posting transaction for voucher number + hash assignment.
        IF OLD.status = 'POSTED' AND OLD."recordHash" IS NOT NULL THEN
            RAISE EXCEPTION
              'JournalEntry immutability violation: UPDATE not permitted on sealed POSTED entries (Bogføringsloven §10-12). Entry ID: %, voucher: %',
              OLD.id, COALESCE(OLD."voucherNumber", '<none>');
        END IF;

        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;


-- 1a. Prevent UPDATE on sealed POSTED JournalEntry rows
DROP TRIGGER IF EXISTS prevent_journal_entry_update_sealed ON "JournalEntry";
CREATE TRIGGER prevent_journal_entry_update_sealed
    BEFORE UPDATE ON "JournalEntry"
    FOR EACH ROW
    EXECUTE FUNCTION journal_entry_immutable_guard();

-- 1b. Prevent DELETE on ALL JournalEntry rows
DROP TRIGGER IF EXISTS prevent_journal_entry_delete_all ON "JournalEntry";
CREATE TRIGGER prevent_journal_entry_delete_all
    BEFORE DELETE ON "JournalEntry"
    FOR EACH ROW
    EXECUTE FUNCTION journal_entry_immutable_guard();


-- ════════════════════════════════════════════════════════════════
-- 2. JournalEntryLine — DELETE only on DRAFT, UPDATE only before sealing
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION journal_entry_line_immutable_guard()
RETURNS TRIGGER AS $$
DECLARE
    parent_hash TEXT;
BEGIN
    IF _immutability_bypass_active() THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD;  ELSE RETURN NEW; END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        -- Block DELETE on lines belonging to sealed entries.
        -- Lines belonging to DRAFT entries may still be deleted (the app
        -- replaces all lines during DRAFT edits via PUT handler).
        SELECT "recordHash" INTO parent_hash
        FROM "JournalEntry"
        WHERE id = OLD."journalEntryId";

        IF parent_hash IS NOT NULL THEN
            RAISE EXCEPTION
              'JournalEntryLine immutability violation: DELETE not permitted on lines belonging to sealed entries (Bogføringsloven §10-12). Line ID: %',
              OLD.id;
        END IF;

        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        SELECT "recordHash" INTO parent_hash
        FROM "JournalEntry"
        WHERE id = OLD."journalEntryId";

        IF parent_hash IS NOT NULL THEN
            RAISE EXCEPTION
              'JournalEntryLine immutability violation: UPDATE not permitted on lines belonging to sealed entries (Bogføringsloven §10-12). Line ID: %',
              OLD.id;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;


-- 2a. Prevent UPDATE on JournalEntryLine rows belonging to sealed entries
DROP TRIGGER IF EXISTS prevent_journal_entry_line_update_sealed ON "JournalEntryLine";
CREATE TRIGGER prevent_journal_entry_line_update_sealed
    BEFORE UPDATE ON "JournalEntryLine"
    FOR EACH ROW
    EXECUTE FUNCTION journal_entry_line_immutable_guard();

-- 2b. Prevent DELETE on JournalEntryLine rows belonging to sealed entries
DROP TRIGGER IF EXISTS prevent_journal_entry_line_delete_all ON "JournalEntryLine";
CREATE TRIGGER prevent_journal_entry_line_delete_all
    BEFORE DELETE ON "JournalEntryLine"
    FOR EACH ROW
    EXECUTE FUNCTION journal_entry_line_immutable_guard();


-- ════════════════════════════════════════════════════════════════
-- 3. Transaction — NO hard deletes, UPDATE only before sealing
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION transaction_immutable_guard()
RETURNS TRIGGER AS $$
BEGIN
    IF _immutability_bypass_active() THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD;  ELSE RETURN NEW; END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        -- Block DELETE on sealed transactions (recordHash IS NOT NULL).
        -- Unsealed transactions may be hard-deleted (e.g. creation failure cleanup).
        IF OLD."recordHash" IS NOT NULL THEN
            RAISE EXCEPTION
              'Transaction immutability violation: DELETE not permitted on sealed transactions (Bogføringsloven §10-12). Transaction ID: %. Cancel or reverse instead.',
              OLD.id;
        END IF;

        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Once sealed (recordHash IS NOT NULL), the row is fully immutable.
        IF OLD."recordHash" IS NOT NULL THEN
            RAISE EXCEPTION
              'Transaction immutability violation: UPDATE not permitted on sealed transactions (Bogføringsloven §10-12). Transaction ID: %',
              OLD.id;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;


-- 3a. Prevent UPDATE on sealed Transaction rows
DROP TRIGGER IF EXISTS prevent_transaction_update_sealed ON "Transaction";
CREATE TRIGGER prevent_transaction_update_sealed
    BEFORE UPDATE ON "Transaction"
    FOR EACH ROW
    EXECUTE FUNCTION transaction_immutable_guard();

-- 3b. Prevent DELETE on ALL Transaction rows
DROP TRIGGER IF EXISTS prevent_transaction_delete_all ON "Transaction";
CREATE TRIGGER prevent_transaction_delete_all
    BEFORE DELETE ON "Transaction"
    FOR EACH ROW
    EXECUTE FUNCTION transaction_immutable_guard();


-- ============================================================
-- Clean up old trigger names from previous version
-- ============================================================
DROP TRIGGER IF EXISTS prevent_journal_entry_delete_sealed ON "JournalEntry";
DROP TRIGGER IF EXISTS prevent_transaction_delete_sealed ON "Transaction";


-- ============================================================
-- Verification query (run after deployment to confirm)
-- ============================================================
-- Expected result: 6 rows + 1 function
--
-- SELECT tgname, tgrelid::regclass, tgtype
-- FROM pg_trigger
-- WHERE tgname IN (
--   'prevent_journal_entry_delete_all',
--   'prevent_journal_entry_update_sealed',
--   'prevent_journal_entry_line_delete_all',
--   'prevent_journal_entry_line_update_sealed',
--   'prevent_transaction_delete_all',
--   'prevent_transaction_update_sealed'
-- );
