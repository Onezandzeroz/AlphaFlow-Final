/**
 * Database client for PostgreSQL (Neon)
 *
 * Uses DATABASE_URL environment variable for the connection string.
 * Prisma schema defines: url = env("DATABASE_URL")
 *
 * Includes a Prisma extension that automatically converts Decimal fields
 * to JavaScript numbers on every query, ensuring JSON serialization works
 * correctly in API responses.
 *
 * NOTE: Prisma's generated types still show Decimal fields as Prisma.Decimal.
 * At runtime, the decimalSerializer extension converts them to native numbers.
 * For TypeScript arithmetic, use Number() cast: Number(line.debit) || 0
 */

import { PrismaClient } from '@prisma/client'
import { Prisma } from '@prisma/client'

/**
 * Recursively converts Prisma.Decimal objects to numbers for JSON-safe output.
 * Handles: objects, arrays, Date objects (kept as-is for ISO string conversion),
 * Decimal instances (converted to number), and primitives.
 *
 * IMPORTANT: In Prisma v6+, the Decimal constructor name is minified (e.g. "i"),
 * so we detect Decimal instances by their decimal.js internal structure:
 *   - `d` (number[]): array of digit groups
 *   - `e` (number): exponent
 *   - `s` (number): sign (1 or -1)
 * This is more reliable than constructor.name or instanceof checks.
 */
function isDecimalLike(obj: unknown): boolean {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false
  const o = obj as Record<string, unknown>
  return Array.isArray(o.d) && typeof o.e === 'number' && typeof o.s === 'number'
}

function serializeDecimal(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'number' || typeof obj === 'boolean' || typeof obj === 'string') return obj
  if (obj instanceof Date) return obj
  // Detect Prisma.Decimal via decimal.js internal structure (works even when constructor name is minified)
  if (isDecimalLike(obj)) {
    return Number((obj as { toNumber: () => number }).toNumber())
  }
  if (Array.isArray(obj)) return obj.map(serializeDecimal)
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(obj)) {
      result[key] = serializeDecimal((obj as Record<string, unknown>)[key])
    }
    return result
  }
  return obj
}

/**
 * Prisma client extension that transparently serializes Decimal fields to numbers.
 * This ensures all API responses can be JSON.stringify'd without losing data.
 */
const decimalExtension = Prisma.defineExtension({
  name: 'decimalSerializer',
  query: {
    $allModels: {
      $allOperations: async ({ args, query, model, operation }) => {
        const result = await query(args)
        return serializeDecimal(result)
      },
    },
  },
})

// Singleton pattern for development (prevents multiple connections)
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createDbClient> | undefined
}

// ─── NEON CONNECTION RESILIENCE ─────────────────────────────────
//
// Neon (Postgres serverless) suspends idle compute after ~5 min of
// inactivity. The next request hits a closed connection and fails with
// errors like:
//   - "Error in PostgreSQL connection: Error { kind: Closed, cause: None }"
//   - PrismaClientKnownRequestError with code P1001 / P1002 / P1008
//
// This retry extension wraps every query: on a transient connection
// error it waits briefly (200ms) and retries, up to 3 attempts. The
// first successful retry wakes Neon's compute so subsequent queries
// succeed immediately.
//
// Retries only on these signals (safe — never retries constraint
// violations or business-logic errors):
//   - connection closed / reset / timed out
//   - Prisma codes P1001 (can't reach DB), P1002 (connection lost),
//     P1008 (timed out), P1017 (server closed connection)
//   - Transaction Already Rolled Back (TARB) during nested transactions

const RETRYABLE_PRISMA_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017'])
const MAX_DB_RETRIES = 3
const RETRY_DELAY_MS = 200

function isRetryableError(error: unknown): boolean {
  if (error == null) return false
  // Prisma known errors carry a `code` property (P1xxx)
  if (typeof error === 'object' && 'code' in error) {
    const code = (error as { code: string }).code
    if (RETRYABLE_PRISMA_CODES.has(code)) return true
  }
  // Network-level errors: closed / reset / timed out
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : ''
  return (
    /connection.*closed/i.test(msg) ||
    /connection.*reset/i.test(msg) ||
    /timed?\s*out/i.test(msg) ||
    /kind:\s*["']?Closed/i.test(msg) ||
    /ECONNRESET|EPIPE|ETIMEDOUT/.test(msg) ||
    /Transaction\s+already\s+rolled\s+back/i.test(msg)
  )
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Query extension that transparently retries transient connection errors
 * (Neon idle-suspend, network blips). Runs AFTER the decimal serializer
 * so both concerns stay isolated.
 */
const retryExtension = Prisma.defineExtension({
  name: 'neonConnectionRetry',
  query: {
    $allModels: {
      $allOperations: async ({ args, query }) => {
        let lastError: unknown
        for (let attempt = 1; attempt <= MAX_DB_RETRIES; attempt++) {
          try {
            return await query(args)
          } catch (error) {
            lastError = error
            if (attempt === MAX_DB_RETRIES || !isRetryableError(error)) {
              throw error
            }
            // Brief backoff: 200ms, 400ms. Keeps latency low while
            // giving Neon's cold-start a moment to complete.
            await sleep(RETRY_DELAY_MS * attempt)
          }
        }
        // Should be unreachable, but keep TS happy.
        throw lastError
      },
    },
  },
})

function createDbClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
    .$extends(decimalExtension)
    .$extends(retryExtension)
}

export const db = globalForPrisma.prisma ?? createDbClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
