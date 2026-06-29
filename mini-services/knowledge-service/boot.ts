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

import { existsSync, readFileSync } from 'fs'
import { execSync } from 'child_process'
import { resolve, dirname } from 'path'

const __dirname = dirname(new URL(import.meta.url).pathname)
const clientPath = resolve(__dirname, 'node_modules/.prisma/client')
const schemaPath = resolve(__dirname, '../../prisma/schema.prisma')

// ── Validate existing Prisma client ──────────────────────────
// Check version alignment between the @prisma/client runtime
// and the generated client. If they don't match, force regeneration.
let clientReady = false
try {
  const clientIndex = resolve(clientPath, 'index.js')
  if (existsSync(clientIndex)) {
    const runtimePkgPath = resolve(__dirname, 'node_modules/@prisma/client/package.json')
    const generatedPkgPath = resolve(clientPath, 'package.json')

    let runtimeVersion = 'unknown'
    let generatedVersion = 'unknown'

    if (existsSync(runtimePkgPath)) {
      try {
        runtimeVersion = JSON.parse(readFileSync(runtimePkgPath, 'utf-8')).version || 'unknown'
      } catch { /* ignore */ }
    }

    if (existsSync(generatedPkgPath)) {
      try {
        generatedVersion = JSON.parse(readFileSync(generatedPkgPath, 'utf-8')).version || 'unknown'
      } catch { /* ignore */ }
    }

    if (runtimeVersion !== 'unknown' && generatedVersion !== 'unknown' && runtimeVersion === generatedVersion) {
      clientReady = true
      console.log(`[Knowledge Boot] Prisma client OK (v${runtimeVersion}) — skipping generate`)
    } else if (runtimeVersion !== 'unknown' && generatedVersion !== 'unknown' && runtimeVersion !== generatedVersion) {
      console.log(`[Knowledge Boot] Prisma version mismatch: runtime=@prisma/client@${runtimeVersion}, generated=v${generatedVersion} — regenerating...`)
    } else {
      // Can't determine versions — try require() as a fallback.
      try {
        require(resolve(clientPath))
        clientReady = true
        console.log('[Knowledge Boot] Prisma client found — skipping generate')
      } catch {
        console.log('[Knowledge Boot] Existing Prisma client failed to load — regenerating...')
      }
    }
  }
} catch (err: any) {
  console.log(`[Knowledge Boot] Prisma client validation error: ${err.message} — regenerating...`)
}

if (!clientReady) {
  console.log('[Knowledge Boot] Running prisma generate...')
  try {
    execSync(`bunx prisma generate --schema="${schemaPath}"`, {
      stdio: 'inherit',
      cwd: __dirname,
      timeout: 60_000,
    })
    console.log('[Knowledge Boot] Prisma client generated successfully')
  } catch (err) {
    console.error('[Knowledge Boot] prisma generate failed! The service will not be able to use the database.')
    console.error('[Knowledge Boot] Try running manually: cd mini-services/knowledge-service && bunx prisma generate --schema=../../prisma/schema.prisma')
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
