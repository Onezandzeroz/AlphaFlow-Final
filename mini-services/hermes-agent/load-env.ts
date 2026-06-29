// ============================================================
// load-env.ts — Root .env fallback loader
// ============================================================
// PM2 does NOT auto-load the root .env file. When running
// under PM2 with cwd=mini-services/hermes-agent/, Bun
// only loads .env from that directory — not the project root.
//
// This file MUST be the first import in index.ts so that env
// vars are available before other modules cache them at
// evaluation time.
// ============================================================

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

if (!process.env.DATABASE_URL || !process.env.OPENROUTER_API_KEY) {
  const rootEnvPath = resolve(__dirname, '../../.env')
  if (existsSync(rootEnvPath)) {
    try {
      const envContent = readFileSync(rootEnvPath, 'utf-8')
      for (const line of envContent.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx === -1) continue
        const key = trimmed.slice(0, eqIdx).trim()
        const value = trimmed.slice(eqIdx + 1).trim()
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
      console.log('[HermesAgent] Loaded env vars from root .env')
    } catch (err: any) {
      console.warn('[HermesAgent] Could not read root .env:', err.message)
    }
  }
}
