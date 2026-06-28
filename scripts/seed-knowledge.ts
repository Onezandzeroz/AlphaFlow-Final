// ============================================================
// seed-knowledge.ts — Seed the RAG knowledge base with initial docs
// ============================================================
// Run AFTER: setup-pgvector.sql + bun run db:push + knowledge-service started
//
// Usage:
//   bun run scripts/seed-knowledge.ts
//
// Reads docs/BRUGSVEJLEDNING.md and sends it to the knowledge-service
// for chunking + embedding. Safe to re-run (idempotent by title —
// updates existing doc if found).
// ============================================================

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const KNOWLEDGE_SERVICE_PORT = process.env.KNOWLEDGE_SERVICE_PORT || '3006'
const HERMES_ADMIN_KEY = process.env.HERMES_ADMIN_KEY || process.env.OPENROUTER_API_KEY || ''

interface SeedDoc {
  filePath: string
  title: string
  category: string
  description: string
}

const SEED_DOCS: SeedDoc[] = [
  {
    filePath: 'docs/BRUGSVEJLEDNING.md',
    title: 'AlphaFlow Brugsvejledning',
    category: 'manual',
    description: 'Komplet brugermanual for AlphaFlow — kontoplan, journalposter, fakturering, moms, bankafstemning, rapportering, SAF-T, OIOUBL, backup, brugerstyring, 2FA, e-faktura, årsregnskab, fremmedvaluta.',
  },
]

async function seedDoc(doc: SeedDoc): Promise<void> {
  const fullPath = resolve(process.cwd(), doc.filePath)
  if (!existsSync(fullPath)) {
    console.warn(`[Seed] Skipping — file not found: ${fullPath}`)
    return
  }

  const content = readFileSync(fullPath, 'utf-8')
  console.log(`[Seed] "${doc.title}" — ${content.length} chars, reading...`)

  // Check if a doc with this title already exists
  const listRes = await fetch(`/api/documents?XTransformPort=${KNOWLEDGE_SERVICE_PORT}`, {
    headers: { 'Authorization': `Bearer ${HERMES_ADMIN_KEY}` },
  })
  let existingId: string | null = null
  if (listRes.ok) {
    const data = await listRes.json()
    const found = (data.documents || []).find((d: any) => d.title === doc.title)
    if (found) {
      existingId = found.id
      console.log(`[Seed] Found existing "${doc.title}" (${found.chunkCount} chunks) — will update.`)
    }
  }

  // Create or update
  const url = existingId
    ? `/api/documents/${existingId}?XTransformPort=${KNOWLEDGE_SERVICE_PORT}`
    : `/api/documents?XTransformPort=${KNOWLEDGE_SERVICE_PORT}`
  const method = existingId ? 'PUT' : 'POST'

  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${HERMES_ADMIN_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: doc.title,
      content,
      category: doc.category,
      tenantId: null,  // global — visible to all tenants
      description: doc.description,
      source: 'seed',
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`Failed to seed "${doc.title}": ${res.status} ${errText}`)
  }

  const data = await res.json()
  console.log(`[Seed] ✓ "${doc.title}" — ${data.chunkCount} chunks indexed`)
}

async function main(): Promise<void> {
  if (!HERMES_ADMIN_KEY) {
    console.error('[Seed] HERMES_ADMIN_KEY (or OPENROUTER_API_KEY) not set — cannot authenticate to knowledge-service.')
    process.exit(1)
  }

  console.log(`[Seed] Seeding ${SEED_DOCS.length} document(s) to knowledge-service on port ${KNOWLEDGE_SERVICE_PORT}...`)
  console.log('')

  let success = 0
  let failed = 0
  for (const doc of SEED_DOCS) {
    try {
      await seedDoc(doc)
      success++
    } catch (err: any) {
      console.error(`[Seed] ✗ ${doc.title}: ${err.message}`)
      failed++
    }
  }

  console.log('')
  console.log(`[Seed] Done. Success: ${success}, Failed: ${failed}`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('[Seed] Fatal error:', err)
  process.exit(1)
})
