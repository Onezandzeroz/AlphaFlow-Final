// ============================================================
// rate-limiter.ts — Per-tenant rate limiting for Hermes chat
// ============================================================
// Enforces 4 sliding windows per tenant:
//   - burst  (per minute) — flood / script protection
//   - hour   (per hour)   — sustained-use cap
//   - day    (per day)    — fair-use quota
//   - month  (per month)  — cost predictability
//
// CONFIG is read from the database (HermesAgent model) with a
// 60-second in-memory cache so the chat handler isn't blocked
// by a DB round-trip on every message. Updates made via the
// App Owner oversight page (Next.js API → DB) propagate within
// the cache TTL.
//
// COUNTERS are in-memory only. They reset on window rollover and
// on service restart. This is acceptable for "current window"
// usage display; persistent billing counters are out of scope.
//
// When DATABASE_URL is not set (Mock mode), default limits are
// used and no DB calls are made.
// ============================================================

import { getPrismaClient } from './database-tenant-provider'

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

export interface RateLimitConfig {
  enabled: boolean
  burst: number   // max requests per minute
  hour: number    // max requests per hour
  day: number     // max requests per day
  month: number   // max requests per month
}

export type RateLimitWindow = 'minute' | 'hour' | 'day' | 'month'

export interface RateLimitCheckResult {
  allowed: boolean
  /** Which window denied the request (only when allowed=false) */
  window?: RateLimitWindow
  /** Configured limit for the denied window */
  limit?: number
  /** Current count in the denied window */
  used?: number
  /** Seconds until the denied window resets */
  retryAfterSeconds?: number
}

export interface TenantUsage {
  tenantId: string
  config: RateLimitConfig
  usage: {
    minute: { used: number; limit: number; resetsInSeconds: number }
    hour: { used: number; limit: number; resetsInSeconds: number }
    day: { used: number; limit: number; resetsInSeconds: number }
    month: { used: number; limit: number; resetsInSeconds: number }
  }
}

// ──────────────────────────────────────────────────────────
// Defaults
// ──────────────────────────────────────────────────────────

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  enabled: true,
  burst: 10,
  hour: 40,
  day: 120,
  month: 2000,
}

// Window durations in milliseconds
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const MONTH_MS = 30 * DAY_MS // approximate (30-day rolling window)

// ──────────────────────────────────────────────────────────
// Internal: per-tenant counter state
// ──────────────────────────────────────────────────────────

interface WindowCounter {
  windowStart: number  // timestamp (ms) when this window began
  count: number
}

interface TenantCounters {
  minute: WindowCounter
  hour: WindowCounter
  day: WindowCounter
  month: WindowCounter
}

function freshCounters(now: number): TenantCounters {
  return {
    minute: { windowStart: now, count: 0 },
    hour: { windowStart: now, count: 0 },
    day: { windowStart: now, count: 0 },
    month: { windowStart: now, count: 0 },
  }
}

/** Rolls over a window counter if its duration has elapsed. */
function rollover(wc: WindowCounter, now: number, durationMs: number): WindowCounter {
  if (now - wc.windowStart >= durationMs) {
    return { windowStart: now, count: 0 }
  }
  return wc
}

/** Seconds remaining until a window resets. */
function resetsIn(wc: WindowCounter, now: number, durationMs: number): number {
  const elapsed = now - wc.windowStart
  const remaining = durationMs - elapsed
  return Math.max(0, Math.ceil(remaining / 1000))
}

// ──────────────────────────────────────────────────────────
// TenantRateLimiter
// ──────────────────────────────────────────────────────────

const CONFIG_CACHE_TTL_MS = 60_000 // 60 seconds

interface ConfigCacheEntry {
  config: RateLimitConfig
  ts: number
}

export class TenantRateLimiter {
  private configCache = new Map<string, ConfigCacheEntry>()
  private counters = new Map<string, TenantCounters>()
  private readonly useDatabase: boolean

  constructor() {
    this.useDatabase = !!process.env.DATABASE_URL
  }

  // ─── Config ─────────────────────────────────────────────

  /**
   * Returns the rate-limit config for a tenant.
   * Reads from DB (cached 60s) when DATABASE_URL is set,
   * otherwise returns DEFAULT_RATE_LIMIT_CONFIG.
   */
  async getConfig(tenantId: string): Promise<RateLimitConfig> {
    // 1. Cache hit?
    const cached = this.configCache.get(tenantId)
    if (cached && Date.now() - cached.ts < CONFIG_CACHE_TTL_MS) {
      return cached.config
    }

    // 2. Read from DB (or default)
    let config: RateLimitConfig
    if (this.useDatabase) {
      config = await this.readConfigFromDb(tenantId)
    } else {
      config = { ...DEFAULT_RATE_LIMIT_CONFIG }
    }

    this.configCache.set(tenantId, { config, ts: Date.now() })
    return config
  }

  /**
   * Forces a config refresh on the next getConfig() call.
   * Called after the oversight page updates a tenant's limits.
   */
  invalidateConfig(tenantId: string): void {
    this.configCache.delete(tenantId)
  }

  private async readConfigFromDb(tenantId: string): Promise<RateLimitConfig> {
    try {
      const db = getPrismaClient()
      const agent = await db.hermesAgent.findUnique({
        where: { companyId: tenantId },
        select: {
          rateLimitEnabled: true,
          rateLimitBurst: true,
          rateLimitHour: true,
          rateLimitDay: true,
          rateLimitMonth: true,
        },
      })
      if (!agent) return { ...DEFAULT_RATE_LIMIT_CONFIG }
      return {
        enabled: agent.rateLimitEnabled,
        burst: agent.rateLimitBurst,
        hour: agent.rateLimitHour,
        day: agent.rateLimitDay,
        month: agent.rateLimitMonth,
      }
    } catch (err: any) {
      console.error(`[RateLimiter] Failed to read config for ${tenantId}:`, err.message || err)
      return { ...DEFAULT_RATE_LIMIT_CONFIG }
    }
  }

  // ─── Counters ──────────────────────────────────────────

  private getCounters(tenantId: string): TenantCounters {
    let c = this.counters.get(tenantId)
    if (!c) {
      c = freshCounters(Date.now())
      this.counters.set(tenantId, c)
    }
    return c
  }

  /**
   * Checks whether a request is allowed WITHOUT incrementing counters.
   * Call record() after a successful response to count the request.
   *
   * Rollover is performed here so windows reset lazily.
   */
  async check(tenantId: string): Promise<RateLimitCheckResult> {
    const config = await this.getConfig(tenantId)
    if (!config.enabled) return { allowed: true }

    const now = Date.now()
    const c = this.getCounters(tenantId)

    // Rollover all windows
    c.minute = rollover(c.minute, now, MINUTE_MS)
    c.hour = rollover(c.hour, now, HOUR_MS)
    c.day = rollover(c.day, now, DAY_MS)
    c.month = rollover(c.month, now, MONTH_MS)

    // Check most-restrictive-first; return the FIRST violation.
    const checks: Array<{ w: RateLimitWindow; wc: WindowCounter; limit: number; dur: number }> = [
      { w: 'minute', wc: c.minute, limit: config.burst, dur: MINUTE_MS },
      { w: 'hour', wc: c.hour, limit: config.hour, dur: HOUR_MS },
      { w: 'day', wc: c.day, limit: config.day, dur: DAY_MS },
      { w: 'month', wc: c.month, limit: config.month, dur: MONTH_MS },
    ]

    for (const chk of checks) {
      if (chk.wc.count >= chk.limit) {
        return {
          allowed: false,
          window: chk.w,
          limit: chk.limit,
          used: chk.wc.count,
          retryAfterSeconds: resetsIn(chk.wc, now, chk.dur),
        }
      }
    }

    return { allowed: true }
  }

  /**
   * Increments all four window counters by 1.
   * Call this ONLY after a successful LLM response (not on errors),
   * so failed requests don't consume a tenant's quota.
   */
  record(tenantId: string): void {
    const now = Date.now()
    const c = this.getCounters(tenantId)
    c.minute = rollover(c.minute, now, MINUTE_MS)
    c.hour = rollover(c.hour, now, HOUR_MS)
    c.day = rollover(c.day, now, DAY_MS)
    c.month = rollover(c.month, now, MONTH_MS)
    c.minute.count += 1
    c.hour.count += 1
    c.day.count += 1
    c.month.count += 1
  }

  // ─── Stats (for oversight page) ────────────────────────

  /**
   * Returns the current usage + config for a single tenant.
   */
  async getUsage(tenantId: string): Promise<TenantUsage> {
    const config = await this.getConfig(tenantId)
    const now = Date.now()
    const c = this.getCounters(tenantId)
    c.minute = rollover(c.minute, now, MINUTE_MS)
    c.hour = rollover(c.hour, now, HOUR_MS)
    c.day = rollover(c.day, now, DAY_MS)
    c.month = rollover(c.month, now, MONTH_MS)

    return {
      tenantId,
      config,
      usage: {
        minute: { used: c.minute.count, limit: config.burst, resetsInSeconds: resetsIn(c.minute, now, MINUTE_MS) },
        hour: { used: c.hour.count, limit: config.hour, resetsInSeconds: resetsIn(c.hour, now, HOUR_MS) },
        day: { used: c.day.count, limit: config.day, resetsInSeconds: resetsIn(c.day, now, DAY_MS) },
        month: { used: c.month.count, limit: config.month, resetsInSeconds: resetsIn(c.month, now, MONTH_MS) },
      },
    }
  }

  /**
   * Returns usage for ALL tenants that have any counter state.
   * Tenants never seen by the rate liminter are omitted (they have 0 usage).
   * Used by the HTTP /admin/stats endpoint for the oversight page.
   */
  async getAllUsage(): Promise<TenantUsage[]> {
    const tenantIds = Array.from(this.counters.keys())
    return Promise.all(tenantIds.map((id) => this.getUsage(id)))
  }
}

// ──────────────────────────────────────────────────────────
// Singleton
// ──────────────────────────────────────────────────────────

let singleton: TenantRateLimiter | null = null

export function getRateLimiter(): TenantRateLimiter {
  if (!singleton) {
    singleton = new TenantRateLimiter()
    console.log(`[RateLimiter] Initialized (mode: ${process.env.DATABASE_URL ? 'database-backed' : 'defaults/in-memory'})`)
  }
  return singleton
}
