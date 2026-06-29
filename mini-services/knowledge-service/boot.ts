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

const __dirname = dirname(new URL(import.meta.url).pathname)
const projectRoot = resolve(__dirname, '../..')
const schemaPath = resolve(projectRoot, 'prisma/schema.prisma')

// ── Run prisma generate from the PROJECT ROOT ────────────────
// This ensures the generated client lands in the ROOT
// node_modules/.prisma/client/ where @prisma/client expects it.
// Always run generate — it's fast (~100ms) when the client
// already exists, and avoids complex version-checking that
// was causing ENOENT errors.
console.log('[Knowledge Boot] Ensuring Prisma client is generated...')
try {
  execSync(`bunx prisma generate --schema="${schemaPath}"`, {
    stdio: 'pipe',  // suppress output when client already exists
    cwd: projectRoot,
    timeout: 60_000,
  })
  console.log('[Knowledge Boot] Prisma client ready')
} catch (err) {
  console.error('[Knowledge Boot] prisma generate failed — service may not work correctly.')
  console.error('[Knowledge Boot] Try running manually: cd ~/var/www/AlphaFlow-Final && bunx prisma generate')
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
