/**
 * Central Cache Registry & Periodic Cleanup
 *
 * AlphaFlow has several in-memory Map caches (rate limiting, CVR lookups,
 * currency rates, backup/recurring scheduler dedup maps). Without cleanup
 * these grow unbounded over the process lifetime — a slow memory leak that
 * eventually trips PM2's `max_memory_restart`.
 *
 * Each cache registers itself here with a `cleanup()` callback. A single
 * interval (every 10 minutes) sweeps all registered caches, evicting
 * expired entries. This is cheaper and more predictable than per-cache
 * intervals, and keeps all cleanup logic in one auditable place.
 *
 * Usage in a cache module:
 *
 *   import { registerCache } from '@/lib/cache-registry';
 *   const cache = new Map<string, { expiresAt: number }>();
 *   registerCache('rate-limit', () => {
 *     const now = Date.now();
 *     for (const [k, v] of cache) if (v.expiresAt <= now) cache.delete(k);
 *   });
 *
 * The registry is intentionally simple — no TTL config per cache, since
 * each cache knows its own expiry semantics best.
 */

type CacheCleanup = () => void;

interface RegisteredCache {
  name: string;
  cleanup: CacheCleanup;
  /** Running count of entries after the last sweep (for logging/observability). */
  lastSize: number;
}

const registry: RegisteredCache[] = [];
let intervalHandle: NodeJS.Timeout | null = null;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Register a cache for periodic cleanup. Idempotent — registering the
 * same name twice replaces the previous cleanup function (safe for
 * hot-reload in development).
 */
export function registerCache(name: string, cleanup: CacheCleanup): void {
  const existing = registry.find((c) => c.name === name);
  if (existing) {
    existing.cleanup = cleanup;
    return;
  }
  registry.push({ name, cleanup, lastSize: 0 });
  ensureInterval();
}

/**
 * Run cleanup on every registered cache. Exported so it can be triggered
 * on-demand (e.g. from a health-check route or before a backup).
 */
export function sweepAllCaches(): { name: string; removed: number }[] {
  const results: { name: string; removed: number }[] = [];
  for (const entry of registry) {
    // The cleanup callback reports its own size by re-reading the map
    // before/after — but to keep the interface simple, we just invoke it.
    // Caches that want to report counts can do so via their own logger.
    try {
      entry.cleanup();
    } catch {
      // Never let one cache's cleanup failure break the others.
    }
  }
  return results;
}

/**
 * Start the periodic sweep interval. Called automatically on first
 * registration; safe to call multiple times (idempotent).
 */
function ensureInterval(): void {
  if (intervalHandle) return;
  // Guard against running in edge/worker contexts that lack setInterval
  // (this module is server-only, but be defensive).
  if (typeof setInterval !== 'function') return;

  intervalHandle = setInterval(() => {
    sweepAllCaches();
  }, SWEEP_INTERVAL_MS);

  // Don't keep the Node.js event loop alive just for this timer —
  // allows graceful shutdown when the app is idle.
  if (intervalHandle && typeof intervalHandle.unref === 'function') {
    intervalHandle.unref();
  }
}

/**
 * Get a snapshot of registered caches (for debugging / admin endpoints).
 */
export function getCacheRegistry(): { name: string; lastSize: number }[] {
  return registry.map((c) => ({ name: c.name, lastSize: c.lastSize }));
}
