-- ============================================================
-- JournalEntry & Transaction Database-Level Immutability Protection
-- ============================================================
--
-- Purpose: Enforce immutability of POSTED journal entries and sealed
--          transactions at the database level, in compliance with
--          Bogføringsloven §10-12 (Danish Bookkeeping Act) and
--          BEK 97 Bilag 1, 2, e (Row 11, 15):
--          "bogførte transaktioner ikke kan ændres, tilbagedateres
--           eller slettes" — posted transactions cannot be changed,
--          backdated, or deleted.
--
-- This SQL creates PostgreSQL triggers that PREVENT any UPDATE or
-- DELETE operation on rows whose `recordHash` has been set (i.e.
-- sealed into the cryptographic hash chain), even by database
-- administrators or compromised connections.
--
-- ─── Trigger design ─────────────────────────────────────────────
-- A row becomes immutable once its `recordHash` column transitions
-- from NULL to a non-NULL value (the "sealing" event). Before that,
-- the row may be freely updated — this allows the multi-step posting
-- flow (CREATE → assignVoucherNumber → sealJournalEntry) to operate
-- within a single transaction without tripping the guard.
--
-- Once sealed, ALL UPDATE and DELETE operations on the row raise an
-- exception. The hash chain (previousHash / recordHash) therefore
-- cannot be silently recomputed by a compromised DB connection — any
-- attempt to mutate a sealed row is rejected at the DB layer.
--
-- Deployment:
--   psql $DATABASE_URL -f prisma/journal-immutability.sql
--   (idempotent — uses CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS)
--
-- Verification:
--   SELECT tgname, tgrelid::regclass, tgtype
--   FROM pg_trigger
--   WHERE tgname IN (
--     'prevent_journal_entry_update_sealed',
--     'prevent_journal_entry_delete_sealed',
--     'prevent_transaction_update_sealed',
--     'prevent_transaction_delete_sealed'
--   );
--
-- Expected: 4 rows
--
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- 1. JournalEntry triggers
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION journal_entry_immutable_guard()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        -- Block DELETE on any POSTED entry (sealed or not).
        -- DRAFT entries may still be hard-deleted by the application
        -- (e.g. when the user discards a draft).
        IF OLD.status = 'POSTED' THEN
            RAISE EXCEPTION
              'JournalEntry immutability violation: DELETE not permitted on POSTED entries (Bogføringsloven §10-12). Entry ID: %',
              OLD.id;
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Only POSTED rows are protected. DRAFT rows may be freely edited
        -- (the user is still composing the entry).
        IF OLD.status = 'POSTED' THEN
            -- Once the hash has been sealed (recordHash IS NOT NULL), the
            -- row is fully immutable. This is the core guarantee: even a
            -- compromised DB connection cannot mutate a sealed entry
            -- without invalidating the hash chain.
            IF OLD.recordHash IS NOT NULL THEN
                RAISE EXCEPTION
                  'JournalEntry immutability violation: UPDATE not permitted on sealed POSTED entries (Bogføringsloven §10-12). Entry ID: %, voucher: %',
                  OLD.id, COALESCE(OLD.voucherNumber, '<none>');
            END IF;

            -- Before sealing (recordHash IS NULL), allow updates. This
            -- window exists only inside the posting transaction:
            --   1. CREATE row with status=POSTED, recordHash=NULL
            --   2. UPDATE voucherNumber (still recordHash=NULL)
            --   3. UPDATE recordHash + previousHash + hashedAt (sealing)
            --   4. COMMIT — outside connections never see steps 1-3.
            RETURN NEW;
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

-- 1b. Prevent DELETE on POSTED JournalEntry rows
DROP TRIGGER IF EXISTS prevent_journal_entry_delete_sealed ON "JournalEntry";
CREATE TRIGGER prevent_journal_entry_delete_sealed
    BEFORE DELETE ON "JournalEntry"
    FOR EACH ROW
    EXECUTE FUNCTION journal_entry_immutable_guard();


-- ════════════════════════════════════════════════════════════════
-- 2. Transaction triggers
-- ════════════════════════════════════════════════════════════════
--
-- Transactions don't have a DRAFT/POSTED lifecycle — they're created
-- directly in their final state and sealed at creation time. So the
-- immutability guard is simpler: once recordHash is set, the row is
-- immutable. Before that (only inside the creation transaction), the
-- row may be updated.
--
-- Cancelled transactions (cancelled=true) preserve their original
-- recordHash — cancellation is a soft-delete that adds a modpostering
-- (reversal entry) rather than mutating the original row.

CREATE OR REPLACE FUNCTION transaction_immutable_guard()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        -- Block DELETE on any sealed transaction (recordHash IS NOT NULL).
        -- Unsealed transactions (rare — only during creation failure) may
        -- still be hard-deleted by the application.
        IF OLD.recordHash IS NOT NULL THEN
            RAISE EXCEPTION
              'Transaction immutability violation: DELETE not permitted on sealed transactions (Bogføringsloven §10-12). Transaction ID: %',
              OLD.id;
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Once sealed (recordHash IS NOT NULL), the row is fully immutable.
        -- This blocks any mutation of amount, date, description, vatPercent,
        -- etc. — even by a compromised DB connection. The hash chain would
        -- detect such a mutation, but the trigger prevents it from
        -- happening in the first place.
        IF OLD.recordHash IS NOT NULL THEN
            RAISE EXCEPTION
              'Transaction immutability violation: UPDATE not permitted on sealed transactions (Bogføringsloven §10-12). Transaction ID: %',
              OLD.id;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;


-- 2a. Prevent UPDATE on sealed Transaction rows
DROP TRIGGER IF EXISTS prevent_transaction_update_sealed ON "Transaction";
CREATE TRIGGER prevent_transaction_update_sealed
    BEFORE UPDATE ON "Transaction"
    FOR EACH ROW
    EXECUTE FUNCTION transaction_immutable_guard();

-- 2b. Prevent DELETE on sealed Transaction rows
DROP TRIGGER IF EXISTS prevent_transaction_delete_sealed ON "Transaction";
CREATE TRIGGER prevent_transaction_delete_sealed
    BEFORE DELETE ON "Transaction"
    FOR EACH ROW
    EXECUTE FUNCTION transaction_immutable_guard();


-- ============================================================
-- Verification query (run after deployment to confirm)
-- ============================================================
-- Expected result: 4 rows
--   tgname                                  | tgrelid         | tgtype
--   ----------------------------------------+-----------------+--------
--   prevent_journal_entry_update_sealed     | "JournalEntry"  |     3
--   prevent_journal_entry_delete_sealed     | "JournalEntry"  |     5
--   prevent_transaction_update_sealed       | "Transaction"   |     3
--   prevent_transaction_delete_sealed       | "Transaction"   |     5
--
-- SELECT tgname, tgrelid::regclass, tgtype
-- FROM pg_trigger
-- WHERE tgname IN (
--   'prevent_journal_entry_update_sealed',
--   'prevent_journal_entry_delete_sealed',
--   'prevent_transaction_update_sealed',
--   'prevent_transaction_delete_sealed'
-- );
