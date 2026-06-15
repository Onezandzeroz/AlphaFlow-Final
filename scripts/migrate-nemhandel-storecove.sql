-- ═══════════════════════════════════════════════════════════════════
-- AlphaFlow — NemHandel / Storecove Schema Migration
-- ═══════════════════════════════════════════════════════════════════
-- This script adds the missing columns introduced by the NemHandel/
-- Storecove feature commits to an existing PostgreSQL database.
--
-- ROOT CAUSE: The Prisma schema was updated with new columns for
-- e-invoice delivery mode and Storecove Access Point integration,
-- but `prisma db push` was never run, causing all Company queries
-- to fail with "column does not exist" errors.
--
-- USAGE (choose one):
--   Option A: Run this SQL directly against your Neon database:
--     psql "<DATABASE_URL>" -f scripts/migrate-nemhandel-storecove.sql
--
--   Option B (recommended): Run Prisma's built-in sync:
--     npx prisma db push
--     (or: bunx prisma db push)
--
-- Both options produce the same result. Option B is preferred because
-- it also handles enum values and indexes automatically.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Company table: E-invoice delivery mode ────────────────────
-- Determines how e-invoices are delivered: 'manual' or 'automatic'
-- NULL means the user hasn't chosen a delivery mode yet.
ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "einvoiceDeliveryMode" TEXT;

-- ─── 2. Company table: Storecove Access Point integration ────────
ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "storecoveConnected"   BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "storecoveApiKeyId"    TEXT;

ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "storecoveLegalEntityId" INTEGER;

ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "storecoveConnectedAt" TIMESTAMP(3);

ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "storecoveLastTestedAt" TIMESTAMP(3);

-- ─── 3. EInvoiceSending table: Storecove tracking fields ─────────
ALTER TABLE "EInvoiceSending"
  ADD COLUMN IF NOT EXISTS "storecoveSubmissionId" TEXT;

ALTER TABLE "EInvoiceSending"
  ADD COLUMN IF NOT EXISTS "storecoveStorecoveId"  TEXT;

-- ─── 4. EInvoiceSendChannel enum: Add STORECOVE value ────────────
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction
-- in older PostgreSQL versions. If this fails, run it separately:
--   ALTER TYPE "EInvoiceSendChannel" ADD VALUE 'STORECOVE';
-- Or just use `npx prisma db push` which handles this correctly.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'EInvoiceSendChannel' AND e.enumlabel = 'STORECOVE'
  ) THEN
    ALTER TYPE "EInvoiceSendChannel" ADD VALUE 'STORECOVE';
  END IF;
END$$;

COMMIT;
