-- ============================================================
-- pgvector Setup for Hermes RAG Knowledge Base
-- ============================================================
-- Run this ONCE on your Neon PostgreSQL database before running
-- `bun run db:push` (which creates the KnowledgeDocument/KnowledgeChunk
-- tables). This script enables the vector extension required by the
-- KnowledgeChunk.embedding column (vector(1536)).
--
-- How to run:
--   Option A (Neon dashboard):  Copy this into the Neon SQL editor and run
--   Option B (psql):             psql "$DATABASE_URL" -f scripts/setup-pgvector.sql
--   Option C (bunx):             bunx prisma db execute --file scripts/setup-pgvector.sql --schema prisma/schema.prisma
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- Enable the pgvector extension (shipped with Neon by default)
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify it's enabled
DO $$
BEGIN
  RAISE NOTICE 'pgvector extension is now enabled. You can run `bun run db:push` to create the knowledge tables.';
END $$;
