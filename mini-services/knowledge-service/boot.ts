// ============================================================
// boot.ts — Prisma auto-generate + service start
// ============================================================
// PM2 runs: `bun boot.ts` (instead of `bun index.ts`)
//
// This wrapper ensures the Prisma client is generated before
// the service imports @prisma/client. Bun does NOT run
// postinstall scripts by default, so `prisma generate` from
// package.json often never executes on the server.
//
// IMPORTANT: This file must NOT use top-level await, because
// PM2's ProcessContainerForkBun.js uses require() to load it,
// and require() cannot handle async ESM modules.
// ============================================================

import { existsSync } from 'fs'
import { execSync } from 'child_process'
import { resolve, dirname } from 'path'

const __dirname = dirname(new URL(import.meta.url).pathname)
const clientPath = resolve(__dirname, 'node_modules/.prisma/client')
const schemaPath = resolve(__dirname, '../../prisma/schema.prisma')

// Try to verify the existing Prisma client is functional.
// A stale or version-mismatched client can exist but still throw
// "@prisma/client did not initialize yet" at runtime.
let clientReady = false
try {
  const clientIndex = resolve(clientPath, 'index.js')
  if (existsSync(clientIndex)) {
    // Try loading it — if this throws, the client is stale/corrupt
    require(resolve(clientPath))
    clientReady = true
    console.log('[Knowledge Boot] Prisma client found and valid — skipping generate')
  }
} catch {
  console.log('[Knowledge Boot] Existing Prisma client is stale or incompatible — regenerating...')
}

if (!clientReady) {
  console.log('[Knowledge Boot] Running prisma generate...')
  try {
    // Use bunx (not npx) since we're running under Bun.
    // bunx prefers locally-installed packages.
    execSync(`bunx prisma generate --schema="${schemaPath}"`, {
      stdio: 'inherit',
      cwd: __dirname,
      timeout: 60_000,
    })
    console.log('[Knowledge Boot] Prisma client generated successfully')
  } catch (err) {
    console.error('[Knowledge Boot] prisma generate failed! The service will not be able to use the database.')
    console.error('[Knowledge Boot] Try running manually: cd mini-services/knowledge-service && bunx prisma generate --schema=../../prisma/schema.prisma')
    // Continue anyway — the user might fix it and restart
  }
}

// Import and start the real service.
// CRITICAL: Use an IIFE, NOT top-level await.
// PM2's ProcessContainerForkBun.js uses require() to load this file,
// and require() cannot handle async ESM modules (top-level await).
;(async () => {
  await import('./index')
})().catch(err => {
  console.error('[Knowledge Boot] Fatal startup error:', err)
  process.exit(1)
})
