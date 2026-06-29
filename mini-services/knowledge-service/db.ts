// ============================================================
// db.ts — Prisma singleton + pgvector raw SQL helpers
// ============================================================
// The embedding column uses pgvector's `vector(1536)` type, which
// Prisma doesn't natively support. We therefore use Prisma's
// `$queryRaw` / `$executeRaw` for all embedding read/write/search.
//
// Requires the `vector` extension on Neon (run once):
//   CREATE EXTENSION IF NOT EXISTS vector;
//
// The migration is applied via prisma db push (which creates the
// tables), then the extension + vector index are created via a
// raw SQL script (scripts/setup-pgvector.sql).
// ============================================================

import { PrismaClient } from '@prisma/client'

let prisma: PrismaClient | null = null

export function getDb(): PrismaClient {
  if (!prisma) {
    const databaseUrl = process.env.DATABASE_URL
    prisma = new PrismaClient({
      ...(databaseUrl ? { datasourceUrl: databaseUrl } : {}),
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    })
  }
  return prisma
}

// ─── pgvector helpers ──────────────────────────────────────

/**
 * Formats a JS number[] as a pgvector literal: '[0.1,0.2,...]'.
 * Used in raw SQL INSERT/UPDATE for the embedding column.
 */
export function formatVector(vec: number[]): string {
  return '[' + vec.map(v => Number(v.toFixed(6))).join(',') + ']'
}

/**
 * Parses a pgvector string '[0.1,0.2,...]' back to number[].
 * Used when reading embeddings back from the DB (rare — we usually
 * only need the chunk content, not the vector itself).
 */
export function parseVector(vecStr: string): number[] {
  return vecStr.replace(/[\[\]]/g, '').split(',').map(Number)
}

// ─── Document + Chunk operations ───────────────────────────

/**
 * Inserts a document and its embedded chunks in one transaction.
 * Chunks are written with raw SQL so we can set the vector column.
 */
export async function indexDocument(
  documentId: string,
  chunks: Array<{ content: string; chunkIndex: number; tokenCount: number; embedding: number[] }>,
): Promise<void> {
  const db = getDb()

  await db.$transaction(async (tx) => {
    // Delete existing chunks for this document (re-index case)
    await tx.knowledgeChunk.deleteMany({ where: { documentId } })

    // Insert new chunks via raw SQL (Prisma can't write vector type)
    for (const chunk of chunks) {
      const vec = formatVector(chunk.embedding)
      await tx.$executeRaw`
        INSERT INTO "KnowledgeChunk" (id, "documentId", "chunkIndex", content, embedding, "tokenCount", "createdAt")
        VALUES (gen_random_uuid()::text, ${documentId}, ${chunk.chunkIndex}, ${chunk.content}, ${vec}::vector, ${chunk.tokenCount}, NOW())
      `
    }

    // Update document status + chunk count
    await tx.knowledgeDocument.update({
      where: { id: documentId },
      data: { chunkCount: chunks.length, status: 'active', errorMessage: null },
    })
  })
}

/**
 * Semantic search: finds the top-K most similar chunks to a query vector.
 * Combines global knowledge (tenantId IS NULL) with tenant-specific notes.
 *
 * Uses cosine distance (<=> operator). Lower distance = more similar.
 */
export async function searchChunks(
  queryEmbedding: number[],
  options: {
    tenantId?: string | null  // null = global only; string = global + this tenant
    topK?: number
    maxDistance?: number  // similarity threshold (default 0.5)
  } = {},
): Promise<Array<{ id: string; content: string; documentId: string; title: string; distance: number }>> {
  const db = getDb()
  const topK = options.topK ?? 5
  const maxDistance = options.maxDistance ?? 0.5
  const vec = formatVector(queryEmbedding)

  // Build the tenant filter: global docs + (optionally) one tenant's private docs
  // Use Prisma.sql for safe parameterized queries
  const tenantId = options.tenantId || null

  // Raw SQL: join KnowledgeChunk + KnowledgeDocument, filter by tenant,
  // compute cosine distance, filter by threshold, order by similarity, limit K.
  const results = tenantId
    ? await db.$queryRaw<Array<{
        id: string
        content: string
        documentId: string
        title: string
        distance: number
      }>>`
        SELECT c.id, c.content, c."documentId", d.title,
               (c.embedding <=> ${vec}::vector) AS distance
        FROM "KnowledgeChunk" c
        JOIN "KnowledgeDocument" d ON d.id = c."documentId"
        WHERE d.status = 'active'
          AND (d."tenantId" IS NULL OR d."tenantId" = ${tenantId})
          AND c.embedding IS NOT NULL
          AND (c.embedding <=> ${vec}::vector) < ${maxDistance}
        ORDER BY c.embedding <=> ${vec}::vector
        LIMIT ${topK}
      `
    : await db.$queryRaw<Array<{
        id: string
        content: string
        documentId: string
        title: string
        distance: number
      }>>`
        SELECT c.id, c.content, c."documentId", d.title,
               (c.embedding <=> ${vec}::vector) AS distance
        FROM "KnowledgeChunk" c
        JOIN "KnowledgeDocument" d ON d.id = c."documentId"
        WHERE d.status = 'active'
          AND d."tenantId" IS NULL
          AND c.embedding IS NOT NULL
          AND (c.embedding <=> ${vec}::vector) < ${maxDistance}
        ORDER BY c.embedding <=> ${vec}::vector
        LIMIT ${topK}
      `

  return results
}

/**
 * Checks if the pgvector extension is already installed.
 * Returns true if the extension exists, false otherwise.
 */
async function isPgvectorInstalled(): Promise<boolean> {
  const db = getDb()
  try {
    const result = await db.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `
    return result.length > 0
  } catch {
    return false
  }
}

/**
 * Ensures the pgvector extension exists. Called on service startup.
 * Idempotent — safe to call multiple times.
 *
 * On Neon, the application role may not have CREATE EXTENSION privileges.
 * If the extension is already installed (by the owner role), this succeeds
 * instantly. If not, we provide clear instructions for manual setup.
 */
export async function ensurePgvectorExtension(): Promise<void> {
  // First check if the extension is already installed — this always works
  // regardless of the role's privileges.
  if (await isPgvectorInstalled()) {
    console.log('[KnowledgeService] pgvector extension OK (already installed)')
    return
  }

  // Extension not found — try to create it (may fail if role lacks privileges)
  const db = getDb()
  try {
    await db.$executeRaw`CREATE EXTENSION IF NOT EXISTS vector`
    console.log('[KnowledgeService] pgvector extension created successfully')
  } catch (err: any) {
    const msg = err.message || String(err)
    console.error('[KnowledgeService] Failed to create pgvector extension:', msg)

    // Provide actionable guidance based on common error patterns
    if (msg.includes('permission denied') || msg.includes('must be owner')) {
      console.error(`
  ┌─────────────────────────────────────────────────────────────────┐
  │  pgvector requires CREATE EXTENSION privileges.                │
  │                                                                 │
  │  On Neon (recommended):                                         │
  │    1. Open your Neon dashboard → SQL Editor                    │
  │    2. Run: CREATE EXTENSION IF NOT EXISTS vector;              │
  │    3. Use the database OWNER role (not a read-only role)       │
  │                                                                 │
  │  On self-hosted PostgreSQL:                                     │
  │    sudo -u postgres psql -d your_db -c "CREATE EXTENSION vector;"│
  │                                                                 │
  │  The extension only needs to be created once. After that,      │
  │  this service will start normally.                              │
  └─────────────────────────────────────────────────────────────────┘`)
    } else if (msg.includes('could not open extension control file')) {
      console.error(`
  ┌─────────────────────────────────────────────────────────────────┐
  │  pgvector is not installed on this PostgreSQL instance.        │
  │                                                                 │
  │  On Neon: pgvector is pre-installed — use the SQL Editor to    │
  │    run: CREATE EXTENSION IF NOT EXISTS vector;                 │
  │                                                                 │
  │  On self-hosted PostgreSQL:                                     │
  │    Ubuntu/Debian: sudo apt install postgresql-16-pgvector      │
  │    Then: CREATE EXTENSION IF NOT EXISTS vector;                │
  └─────────────────────────────────────────────────────────────────┘`)
    } else {
      console.error('                  Run manually: CREATE EXTENSION IF NOT EXISTS vector;')
    }
    throw err
  }
}
