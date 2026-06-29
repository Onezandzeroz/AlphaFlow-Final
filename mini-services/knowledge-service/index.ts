// ============================================================
// index.ts — Knowledge Service (RAG for Hermes)
// ============================================================
// HTTP API for document management + semantic search.
// Used by:
//   - hermes-agent: GET /search (retrieval before LLM call)
//   - Next.js admin API: GET/POST/PUT/DELETE /documents (SuperDev UI)
//
// Auth: shared secret via Authorization: Bearer <HERMES_ADMIN_KEY>
// (same key as hermes-agent — simplifies config).
//
// Endpoints:
//   GET    /health                    — liveness check (no auth)
//   GET    /search?q=...&tenantId=... — semantic search (used by hermes-agent)
//   GET    /documents                 — list all (with chunk counts)
//   GET    /documents/:id             — get one document (full content)
//   POST   /documents                 — create + embed (async)
//   PUT    /documents/:id             — update content + re-embed
//   DELETE /documents/:id             — delete document + chunks
//   POST   /documents/:id/reindex     — force re-embed
//   GET    /stats                     — index statistics
// ============================================================

// MUST be the very first import — loads root .env before other
// modules cache env vars at evaluation time (e.g., OPENROUTER_API_KEY
// in embedder.ts). Bun only auto-loads .env from cwd, not the parent.
import './load-env'

import { createServer } from 'http'
import { defaultConfig } from './config'
import { getDb, ensurePgvectorExtension, indexDocument, searchChunks } from './db'
import { embedText, embedTexts, embeddingsAvailable, approxTokens } from './embedder'
import { chunkText } from './chunker'

const PORT = process.env.KNOWLEDGE_SERVICE_PORT
  ? parseInt(process.env.KNOWLEDGE_SERVICE_PORT, 10)
  : defaultConfig.port

const HERMES_ADMIN_KEY = process.env.HERMES_ADMIN_KEY || process.env.OPENROUTER_API_KEY || ''

// ─── HTTP helpers ──────────────────────────────────────────

function sendJson(res: any, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function readBody(req: any): Promise<string> {
  let body = ''
  for await (const chunk of req) body += chunk
  return body
}

function checkAuth(req: any): boolean {
  if (!HERMES_ADMIN_KEY) return false
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  return token === HERMES_ADMIN_KEY
}

// ─── Document handlers ─────────────────────────────────────

interface CreateDocBody {
  title: string
  content: string
  category?: string
  tenantId?: string | null
  description?: string
  source?: string
}

/**
 * Creates a document, chunks it, embeds the chunks, and stores everything.
 * Embedding is synchronous (caller waits) — for large docs this may take
 * a few seconds. The document is marked "processing" during embed.
 */
async function handleCreateDocument(body: CreateDocBody): Promise<{ id: string; chunkCount: number }> {
  const db = getDb()

  if (!body.title?.trim() || !body.content?.trim()) {
    throw new Error('title and content are required')
  }

  // Create document in "processing" state
  const doc = await db.knowledgeDocument.create({
    data: {
      title: body.title.trim(),
      content: body.content,
      category: body.category || 'general',
      tenantId: body.tenantId || null,
      description: body.description || null,
      source: body.source || 'manual',
      status: 'processing',
    },
  })

  try {
    // Chunk + embed
    const chunks = chunkText(body.content)
    if (chunks.length === 0) {
      throw new Error('No chunks generated — document content is empty after processing')
    }

    // Batch embed (up to 100 per call)
    const allEmbeddings: number[][] = []
    for (let i = 0; i < chunks.length; i += 100) {
      const batch = chunks.slice(i, i + 100)
      const embeddings = await embedTexts(batch.map(c => c.content))
      allEmbeddings.push(...embeddings)
    }

    // Store with vectors
    const chunksWithEmbeddings = chunks.map((c, i) => ({
      ...c,
      embedding: allEmbeddings[i],
    }))

    await indexDocument(doc.id, chunksWithEmbeddings)

    console.log(`[KnowledgeService] Indexed "${doc.title}": ${chunks.length} chunks`)
    return { id: doc.id, chunkCount: chunks.length }
  } catch (err: any) {
    // Mark document as errored
    await db.knowledgeDocument.update({
      where: { id: doc.id },
      data: { status: 'error', errorMessage: err.message || String(err) },
    })
    throw err
  }
}

/**
 * Updates a document's content and re-embeds all chunks.
 */
async function handleUpdateDocument(id: string, body: Partial<CreateDocBody>): Promise<{ chunkCount: number }> {
  const db = getDb()
  const existing = await db.knowledgeDocument.findUnique({ where: { id } })
  if (!existing) throw new Error('Document not found')

  const newContent = body.content ?? existing.content
  const newTitle = body.title ?? existing.title
  const newCategory = body.category ?? existing.category
  const newTenantId = body.tenantId !== undefined ? body.tenantId : existing.tenantId
  const newDescription = body.description !== undefined ? body.description : existing.description

  // Update metadata
  await db.knowledgeDocument.update({
    where: { id },
    data: {
      title: newTitle,
      category: newCategory,
      tenantId: newTenantId,
      description: newDescription,
      status: 'processing',
      errorMessage: null,
    },
  })

  // Re-chunk + re-embed
  const chunks = chunkText(newContent)
  const allEmbeddings: number[][] = []
  for (let i = 0; i < chunks.length; i += 100) {
    const batch = chunks.slice(i, i + 100)
    const embeddings = await embedTexts(batch.map(c => c.content))
    allEmbeddings.push(...embeddings)
  }

  const chunksWithEmbeddings = chunks.map((c, i) => ({
    ...c,
    embedding: allEmbeddings[i],
  }))

  // Also update the full content field
  await db.knowledgeDocument.update({
    where: { id },
    data: { content: newContent },
  })

  await indexDocument(id, chunksWithEmbeddings)
  console.log(`[KnowledgeService] Re-indexed "${newTitle}": ${chunks.length} chunks`)
  return { chunkCount: chunks.length }
}

// ─── HTTP server ───────────────────────────────────────────

const httpServer = createServer(async (req, res) => {
  const url = req.url || ''
  const method = req.method || 'GET'

  try {
    // ─── /health (no auth) ───
    if (url === '/health' && method === 'GET') {
      sendJson(res, 200, {
        status: 'ok',
        service: 'knowledge-service',
        port: PORT,
        embeddingsAvailable: embeddingsAvailable(),
        embeddingModel: defaultConfig.embeddingModel,
      })
      return
    }

    // ─── Auth gate for everything else ───
    if (!checkAuth(req)) {
      sendJson(res, 401, { error: 'Unauthorized — invalid or missing admin key' })
      return
    }

    // ─── GET /search?q=...&tenantId=... ───
    if (url.startsWith('/search') && method === 'GET') {
      const u = new URL(url, 'http://localhost')
      const q = u.searchParams.get('q') || ''
      const tenantId = u.searchParams.get('tenantId')  // null if not provided
      const topK = parseInt(u.searchParams.get('topK') || String(defaultConfig.topK), 10)
      const maxDistance = parseFloat(u.searchParams.get('maxDistance') || String(defaultConfig.similarityThreshold))

      if (!q.trim()) {
        sendJson(res, 400, { error: 'Missing query parameter "q"' })
        return
      }
      if (!embeddingsAvailable()) {
        sendJson(res, 503, { error: 'Embeddings unavailable — set OPENAI_API_KEY or OPENROUTER_API_KEY' })
        return
      }

      const queryEmbedding = await embedText(q)
      const results = await searchChunks(queryEmbedding, {
        tenantId: tenantId || null,
        topK,
        maxDistance,
      })

      // Build the context string for the LLM
      const contextBlocks = results.map((r, i) => `### ${r.title} (udsnit ${i + 1})\n${r.content}`)
      const context = contextBlocks.join('\n\n---\n\n')

      sendJson(res, 200, {
        query: q,
        results: results.map(r => ({
          documentId: r.documentId,
          title: r.title,
          content: r.content,
          distance: Number(r.distance.toFixed(4)),
        })),
        context,
        totalTokens: approxTokens(context),
      })
      return
    }

    // ─── GET /documents ───
    if (url === '/documents' && method === 'GET') {
      const db = getDb()
      const u = new URL(url, 'http://localhost')
      const tenantFilter = u.searchParams.get('tenantId')  // 'global' = only global; specific id = that tenant; absent = all
      const docs = await db.knowledgeDocument.findMany({
        where: tenantFilter === 'global'
          ? { tenantId: null }
          : tenantFilter
            ? { tenantId: tenantFilter }
            : undefined,
        select: {
          id: true, title: true, category: true, tenantId: true, description: true,
          source: true, chunkCount: true, status: true, errorMessage: true,
          createdAt: true, updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      })
      sendJson(res, 200, { documents: docs })
      return
    }

    // ─── GET /documents/:id ───
    const getMatch = url.match(/^\/documents\/([^/?]+)$/)
    if (getMatch && method === 'GET') {
      const db = getDb()
      const doc = await db.knowledgeDocument.findUnique({
        where: { id: decodeURIComponent(getMatch[1]) },
        select: {
          id: true, title: true, content: true, category: true, tenantId: true,
          description: true, source: true, chunkCount: true, status: true,
          errorMessage: true, createdAt: true, updatedAt: true,
        },
      })
      if (!doc) {
        sendJson(res, 404, { error: 'Document not found' })
        return
      }
      sendJson(res, 200, { document: doc })
      return
    }

    // ─── POST /documents ───
    if (url === '/documents' && method === 'POST') {
      const body = JSON.parse(await readBody(req)) as CreateDocBody
      const result = await handleCreateDocument(body)
      sendJson(res, 201, { success: true, id: result.id, chunkCount: result.chunkCount })
      return
    }

    // ─── PUT /documents/:id ───
    const putMatch = url.match(/^\/documents\/([^/?]+)$/)
    if (putMatch && method === 'PUT') {
      const body = JSON.parse(await readBody(req)) as Partial<CreateDocBody>
      const result = await handleUpdateDocument(decodeURIComponent(putMatch[1]), body)
      sendJson(res, 200, { success: true, chunkCount: result.chunkCount })
      return
    }

    // ─── DELETE /documents/:id ───
    const delMatch = url.match(/^\/documents\/([^/?]+)$/)
    if (delMatch && method === 'DELETE') {
      const db = getDb()
      const id = decodeURIComponent(delMatch[1])
      // Chunks cascade-delete via schema relation
      await db.knowledgeDocument.delete({ where: { id } })
      console.log(`[KnowledgeService] Deleted document ${id}`)
      sendJson(res, 200, { success: true })
      return
    }

    // ─── POST /documents/:id/reindex ───
    const reindexMatch = url.match(/^\/documents\/([^/?]+)\/reindex$/)
    if (reindexMatch && method === 'POST') {
      const db = getDb()
      const id = decodeURIComponent(reindexMatch[1])
      const doc = await db.knowledgeDocument.findUnique({ where: { id } })
      if (!doc) {
        sendJson(res, 404, { error: 'Document not found' })
        return
      }
      const result = await handleUpdateDocument(id, { content: doc.content })
      sendJson(res, 200, { success: true, chunkCount: result.chunkCount })
      return
    }

    // ─── GET /stats ───
    if (url === '/stats' && method === 'GET') {
      const db = getDb()
      const [totalDocs, totalChunks, byStatus] = await Promise.all([
        db.knowledgeDocument.count(),
        db.knowledgeChunk.count(),
        db.knowledgeDocument.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
      ])
      sendJson(res, 200, {
        documents: totalDocs,
        chunks: totalChunks,
        byStatus: byStatus.reduce((acc, s) => ({ ...acc, [s.status]: s._count._all }), {}),
        embeddingsAvailable: embeddingsAvailable(),
        embeddingModel: defaultConfig.embeddingModel,
      })
      return
    }

    // ─── 404 ───
    sendJson(res, 404, { error: 'Not found' })
  } catch (err: any) {
    console.error('[KnowledgeService] Error:', err.message || err)
    sendJson(res, 500, { error: err.message || 'Internal server error' })
  }
})

// ─── Start ─────────────────────────────────────────────────

async function start(): Promise<void> {
  // Ensure pgvector extension exists before accepting requests
  if (process.env.DATABASE_URL) {
    try {
      await ensurePgvectorExtension()
    } catch {
      console.error('[KnowledgeService] Continuing despite pgvector error — search will fail until fixed')
    }
  } else {
    console.warn('[KnowledgeService] DATABASE_URL not set — DB operations will fail')
  }

  httpServer.listen(PORT, () => {
    console.log(`[KnowledgeService] 📚 RAG knowledge service running on port ${PORT}`)
    console.log(`[KnowledgeService]    Embedding model : ${defaultConfig.embeddingModel} (${defaultConfig.embeddingDims} dims)`)
    console.log(`[KnowledgeService]    Embeddings ready: ${embeddingsAvailable() ? 'yes' : 'NO — set OPENAI_API_KEY or OPENROUTER_API_KEY'}`)
    console.log(`[KnowledgeService]    Retrieval       : topK=${defaultConfig.topK}, maxDistance=${defaultConfig.similarityThreshold}`)
  })
}

start().catch((err) => {
  console.error('[KnowledgeService] Fatal startup error:', err)
  process.exit(1)
})

// ─── Graceful shutdown ─────────────────────────────────────

function shutdown(signal: string): void {
  console.log(`[KnowledgeService] Received ${signal}, shutting down...`)
  httpServer.close(() => {
    console.log('[KnowledgeService] Server closed')
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
