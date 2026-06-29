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
//
// NOTE: We run `prisma generate` from the PROJECT ROOT (not
// the mini-service directory). The generated client is output
// to ROOT/node_modules/.prisma/client/, which is where
// @prisma/client looks for it via Node module resolution.
// ============================================================

import { execSync } from 'child_process'
import { resolve, dirname } from 'path'
import { existsSync } from 'fs'

const __dirname = dirname(new URL(import.meta.url).pathname)
const projectRoot = resolve(__dirname, '../..')
const schemaPath = resolve(projectRoot, 'prisma/schema.prisma')
const clientIndexPath = resolve(projectRoot, 'node_modules/.prisma/client/index.js')

// ── Run prisma generate from the PROJECT ROOT ────────────────
// This ensures the generated client lands in the ROOT
// node_modules/.prisma/client/ where @prisma/client expects it.
// Strategy: always run generate — it's fast (~100ms) when the
// client already exists, and avoids complex version-checking.
// If generate fails, retry once (transient issues).
// If client still doesn't exist after generate, exit with a
// clear error instead of crashing on import with ENOENT.
console.log('[Knowledge Boot] Ensuring Prisma client is generated...')

function runGenerate(): boolean {
  try {
    execSync(`bunx prisma generate --schema="${schemaPath}"`, {
      stdio: 'pipe',
      cwd: projectRoot,
      timeout: 60_000,
    })
    return true
  } catch {
    return false
  }
}

const clientAlreadyExists = existsSync(clientIndexPath)
if (clientAlreadyExists) {
  // Client exists — run generate anyway (fast no-op if up-to-date)
  runGenerate()
  console.log('[Knowledge Boot] Prisma client ready')
} else {
  // Client missing — need to generate. Retry once on failure.
  const ok = runGenerate()
  if (!ok) {
    console.warn('[Knowledge Boot] First generate attempt failed, retrying in 2s...')
    execSync('sleep 2', { stdio: 'pipe' })
    const retryOk = runGenerate()
    if (!retryOk) {
      console.error('[Knowledge Boot] prisma generate failed twice — cannot start service.')
      console.error('[Knowledge Boot] Try running manually: cd ~/var/www/AlphaFlow-Final && bunx prisma generate')
      process.exit(1)
    }
  }

  // Verify the client file actually exists now
  if (!existsSync(clientIndexPath)) {
    console.error('[Knowledge Boot] prisma generate reported success but client file not found:')
    console.error(`[Knowledge Boot]   Expected: ${clientIndexPath}`)
    console.error('[Knowledge Boot] This may be a schema output path issue. Try running manually:')
    console.error('[Knowledge Boot]   cd ~/var/www/AlphaFlow-Final && bunx prisma generate')
    process.exit(1)
  }

  console.log('[Knowledge Boot] Prisma client generated successfully')
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
