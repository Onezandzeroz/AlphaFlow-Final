-- ============================================================
-- AuditLog Database-Level Immutability Protection
-- ============================================================
--
-- Purpose: Enforce immutability of the AuditLog table at the
--          database level, in compliance with Bogforingsloven
--          S 10-12 (Danish Bookkeeping Law).
--
-- This SQL creates PostgreSQL triggers that PREVENT any UPDATE
-- or DELETE operation on the "AuditLog" table, even by database
-- administrators or compromised connections.
--
-- Deployment:
--   bun run scripts/apply-audit-immutability.ts
--   -- OR manually via psql:
--   psql $DATABASE_URL -f prisma/audit-immutability.sql
--
-- Verification:
--   SELECT tgname, tgtype FROM pg_trigger
--   WHERE tgrelid = '"AuditLog"'::regclass;
--
-- ============================================================

-- 1. Create trigger function that raises an exception
CREATE OR REPLACE FUNCTION audit_log_immutable_guard()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION
      'AuditLog immutability violation: % operations are not permitted on AuditLog (Bogforingsloven S 10-12)',
      TG_OP;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 2. Prevent UPDATE on AuditLog
DROP TRIGGER IF EXISTS prevent_audit_update ON "AuditLog";
CREATE TRIGGER prevent_audit_update
    BEFORE UPDATE ON "AuditLog"
    FOR EACH ROW
    EXECUTE FUNCTION audit_log_immutable_guard();

-- 3. Prevent DELETE on AuditLog
DROP TRIGGER IF EXISTS prevent_audit_delete ON "AuditLog";
CREATE TRIGGER prevent_audit_delete
    BEFORE DELETE ON "AuditLog"
    FOR EACH ROW
    EXECUTE FUNCTION audit_log_immutable_guard();

-- ============================================================
-- Verification query (run after deployment to confirm)
-- ============================================================
-- Expected result: 2 rows
--   tgname                    | tgtype
--   --------------------------+--------
--   prevent_audit_update      |      3  (BEFORE ROW UPDATE)
--   prevent_audit_delete      |      5  (BEFORE ROW DELETE)
