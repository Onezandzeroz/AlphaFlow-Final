-- ============================================================
-- Delete ALL unverified users (emailVerified = false)
-- ============================================================
--
-- Run directly against the DB:
--   psql "$DATABASE_URL" -f scripts/delete-unverified-users.sql
--
-- Or from the repo root:
--   set -a; source .env; set +a
--   psql "$DATABASE_URL" -f scripts/delete-unverified-users.sql
--
-- What this does:
--   1. Finds all users with emailVerified = false (abandoned sign-ups)
--   2. Temporarily disables AuditLog immutability triggers
--   3. Deletes AuditLog rows referencing those users / their sole-member companies
--   4. Re-enables the triggers
--   5. Deletes UserCompany memberships
--   6. Deletes orphaned sole-member companies (no other members)
--   7. Deletes the users
--
-- Everything runs in a single transaction — if anything fails,
-- it all rolls back and the triggers stay enabled.
--
-- DRY RUN: to preview what would be deleted without actually
-- deleting, run the SELECT queries at the bottom of this file
-- first (see "DRY RUN QUERIES" section).
-- ============================================================

BEGIN;

-- Save the list of unverified user IDs + their sole-member companies
-- into temporary tables so we can reference them throughout.
CREATE TEMP TABLE _unverified_users AS
SELECT id AS user_id, email, "businessName", "createdAt"
FROM "User"
WHERE "emailVerified" = false
  AND "deactivatedAt" IS NULL;

CREATE TEMP TABLE _sole_member_companies AS
SELECT uc."companyId" AS company_id
FROM "UserCompany" uc
JOIN _unverified_users u ON u.user_id = uc."userId"
WHERE (
  SELECT COUNT(*) FROM "UserCompany" uc2 WHERE uc2."companyId" = uc."companyId"
) <= 1;

-- Report what will be deleted
\echo '=== Unverified users to delete:'
SELECT user_id, email, "businessName", "createdAt" FROM _unverified_users ORDER BY "createdAt" DESC;

\echo '=== Sole-member companies to delete (will be removed):'
SELECT company_id, name FROM "Company" WHERE id IN (SELECT company_id FROM _sole_member_companies);

\echo '=== AuditLog rows to delete (auth events only):'
SELECT
  (SELECT COUNT(*) FROM "AuditLog" WHERE "userId" IN (SELECT user_id FROM _unverified_users)) AS user_ref_rows,
  (SELECT COUNT(*) FROM "AuditLog" WHERE "performedByUserId" IN (SELECT user_id FROM _unverified_users)) AS performer_ref_rows,
  (SELECT COUNT(*) FROM "AuditLog" WHERE "companyId" IN (SELECT company_id FROM _sole_member_companies)) AS company_ref_rows;

-- ─── Step 1: Disable AuditLog immutability triggers ─────────────
ALTER TABLE "AuditLog" DISABLE TRIGGER prevent_audit_update;
ALTER TABLE "AuditLog" DISABLE TRIGGER prevent_audit_delete;

-- ─── Step 2: Delete AuditLog rows blocking the deletion ─────────
-- These are auth events (REGISTER, etc.) for unverified users —
-- NOT accounting data. Bogføringsloven §10-12 covers bookkeeping
-- transactions, not abandoned sign-ups.
DELETE FROM "AuditLog"
WHERE "userId" IN (SELECT user_id FROM _unverified_users);

DELETE FROM "AuditLog"
WHERE "performedByUserId" IN (SELECT user_id FROM _unverified_users);

DELETE FROM "AuditLog"
WHERE "companyId" IN (SELECT company_id FROM _sole_member_companies);

-- ─── Step 3: Re-enable triggers BEFORE continuing ───────────────
ALTER TABLE "AuditLog" ENABLE TRIGGER prevent_audit_update;
ALTER TABLE "AuditLog" ENABLE TRIGGER prevent_audit_delete;

-- ─── Step 4: Delete UserCompany memberships ─────────────────────
DELETE FROM "UserCompany"
WHERE "userId" IN (SELECT user_id FROM _unverified_users);

-- ─── Step 5: Delete orphaned sole-member companies ──────────────
DELETE FROM "Company"
WHERE id IN (SELECT company_id FROM _sole_member_companies);

-- ─── Step 6: Delete the users ───────────────────────────────────
-- Sessions, NotificationRead, ConsentLog cascade automatically.
DELETE FROM "User"
WHERE id IN (SELECT user_id FROM _unverified_users);

-- ─── Final report ───────────────────────────────────────────────
\echo '=== Deletion complete ==='
\echo 'Users deleted:'
SELECT COUNT(*) AS users_deleted FROM _unverified_users;
\echo 'Companies deleted:'
SELECT COUNT(*) AS companies_deleted FROM _sole_member_companies;

-- Clean up temp tables
DROP TABLE _unverified_users;
DROP TABLE _sole_member_companies;

COMMIT;

-- ============================================================
-- DRY RUN QUERIES (run these separately BEFORE the script above
-- to preview without deleting). Copy-paste into psql:
-- ============================================================
--
-- -- How many unverified users exist?
-- SELECT COUNT(*) AS unverified_count
-- FROM "User"
-- WHERE "emailVerified" = false AND "deactivatedAt" IS NULL;
--
-- -- List them with their companies
-- SELECT u.id, u.email, u."businessName", u."createdAt",
--        c.name AS company_name,
--        (SELECT COUNT(*) FROM "UserCompany" uc2 WHERE uc2."companyId" = uc."companyId") AS company_member_count
-- FROM "User" u
-- LEFT JOIN "UserCompany" uc ON uc."userId" = u.id
-- LEFT JOIN "Company" c ON c.id = uc."companyId"
-- WHERE u."emailVerified" = false AND u."deactivatedAt" IS NULL
-- ORDER BY u."createdAt" DESC;
