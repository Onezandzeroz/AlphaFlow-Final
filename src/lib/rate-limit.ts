/**
 * Rate limiting utility (in-memory, per IP)
 *
 * Protects authentication endpoints from brute force attacks.
 * Uses a sliding window counter approach.
 *
 * NOTE: This is an in-memory implementation with inherent limitations:
 * - Rate limits reset on server restart (an attacker could provoke a restart)
 * - Limits apply only to the current single instance (no cross-instance coordination)
 *
 * These limitations are mitigated by Caddy-level rate limiting (see Caddyfile
 * `rate_limit` directive) which persists across restarts and serves as the
 * first defense layer. This in-memory module provides finer-grained limits
 * on sensitive endpoints (login, 2FA, password reset) as a second layer.
 *
 * For multi-instance deployments, consider migrating to a persistent store
 * (Redis, database-backed) for this layer.
 */

import { registerCache } from '@/lib/cache-registry';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}

// Register with the central cache registry so a single 10-minute sweep
// also evicts expired entries even when traffic is low (the local
// cleanup() above only runs when a request triggers rateLimit()).
registerCache('rate-limit', () => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
});

export interface RateLimitConfig {
  /** Maximum number of requests in the window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Custom error message */
  message?: string;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 10,
  windowMs: 60 * 1000, // 1 minute
  message: 'Too many requests. Please try again later.',
};

/**
 * Check if a request should be rate limited
 * Returns true if the request is allowed, false if rate limited
 */
export function rateLimit(
  key: string,
  config: Partial<RateLimitConfig> = {}
): { allowed: boolean; remaining: number; resetAt: number } {
  cleanup();

  const { maxRequests, windowMs, message } = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    // New window
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: maxRequests - 1, resetAt };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}

/**
 * Get IP address from request headers
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}
