import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { auditLog, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { notifyDataChange } from '@/lib/notify-data-change';

/**
 * Hermes per-tenant rate limit configuration.
 *
 * GET  /api/hermes/rate-limits         — list all tenants with their rate-limit config
 * PUT  /api/hermes/rate-limits         — update one tenant's rate-limit config
 *
 * Both routes are SuperDev-only (App Owner oversight). After a PUT, the
 * hermes-agent service is notified (POST /admin/invalidate) so its 60s
 * config cache is cleared and the new limits take effect immediately.
 */

const HERMES_SERVICE_PORT = process.env.HERMES_SERVICE_PORT || '3004';
const HERMES_ADMIN_KEY = process.env.HERMES_ADMIN_KEY || process.env.OPENROUTER_API_KEY || '';

// Defaults (must match mini-services/hermes-agent/rate-limiter.ts)
const DEFAULTS = { enabled: true, burst: 10, hour: 40, day: 120, month: 2000 };

/** Validate and clamp a rate-limit config payload. Returns null if invalid. */
function validateConfig(body: unknown): {
  enabled: boolean;
  burst: number;
  hour: number;
  day: number;
  month: number;
} | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;

  const companyId = b.companyId;
  if (typeof companyId !== 'string' || !companyId) return null;

  const enabled = b.enabled === undefined ? DEFAULTS.enabled : b.enabled;
  if (typeof enabled !== 'boolean') return null;

  // Clamp integers to safe positive ranges.
  const clamp = (v: unknown, def: number, max: number): number => {
    const n = typeof v === 'number' ? Math.floor(v) : def;
    if (!Number.isFinite(n) || n < 0) return def;
    return Math.min(n, max);
  };

  return {
    enabled,
    burst: clamp(b.burst, DEFAULTS.burst, 1000),     // max 1000/min
    hour: clamp(b.hour, DEFAULTS.hour, 10_000),       // max 10k/hour
    day: clamp(b.day, DEFAULTS.day, 100_000),         // max 100k/day
    month: clamp(b.month, DEFAULTS.month, 1_000_000), // max 1M/month
  };
}

// ─── GET: list all tenants with rate-limit config ────────────────

export const GET = withGuard(routeConfig['/api/hermes/rate-limits'].GET!, async (request, ctx) => {
  try {
    const companies = await db.company.findMany({
      include: {
        hermesAgent: {
          select: {
            enabled: true,
            rateLimitEnabled: true,
            rateLimitBurst: true,
            rateLimitHour: true,
            rateLimitDay: true,
            rateLimitMonth: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const tenants = companies.map((company) => ({
      companyId: company.id,
      companyName: company.name,
      companyType: company.companyType ?? null,
      hermesEnabled: company.hermesAgent?.enabled ?? false,
      rateLimits: {
        enabled: company.hermesAgent?.rateLimitEnabled ?? DEFAULTS.enabled,
        burst: company.hermesAgent?.rateLimitBurst ?? DEFAULTS.burst,
        hour: company.hermesAgent?.rateLimitHour ?? DEFAULTS.hour,
        day: company.hermesAgent?.rateLimitDay ?? DEFAULTS.day,
        month: company.hermesAgent?.rateLimitMonth ?? DEFAULTS.month,
      },
    }));

    return NextResponse.json({ tenants });
  } catch (error) {
    logger.error('[HERMES RATE-LIMITS] Failed to list rate-limit configs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// ─── PUT: update one tenant's rate-limit config ──────────────────

export const PUT = withGuard(routeConfig['/api/hermes/rate-limits'].PUT!, async (request, ctx) => {
  try {
    const body = await request.json();

    // Extract companyId separately (it's required but not part of the clamped config)
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const companyId = (body as Record<string, unknown>).companyId;
    if (typeof companyId !== 'string' || !companyId) {
      return NextResponse.json({ error: 'Missing companyId' }, { status: 400 });
    }

    const config = validateConfig(body);
    if (!config) {
      return NextResponse.json({ error: 'Invalid rate-limit configuration' }, { status: 400 });
    }

    // Verify the company exists and fetch the existing rate-limit config
    // (needed for the audit log's `old` value).
    const company = await db.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        hermesAgent: {
          select: {
            id: true,
            rateLimitEnabled: true,
            rateLimitBurst: true,
            rateLimitHour: true,
            rateLimitDay: true,
            rateLimitMonth: true,
          },
        },
      },
    });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Capture the previous config (defaults if no HermesAgent record exists yet)
    const oldConfig = company.hermesAgent
      ? {
          enabled: company.hermesAgent.rateLimitEnabled,
          burst: company.hermesAgent.rateLimitBurst,
          hour: company.hermesAgent.rateLimitHour,
          day: company.hermesAgent.rateLimitDay,
          month: company.hermesAgent.rateLimitMonth,
        }
      : { ...DEFAULTS };

    // Upsert the HermesAgent record with the new rate-limit config
    const updated = await db.hermesAgent.upsert({
      where: { companyId },
      create: {
        companyId,
        rateLimitEnabled: config.enabled,
        rateLimitBurst: config.burst,
        rateLimitHour: config.hour,
        rateLimitDay: config.day,
        rateLimitMonth: config.month,
      },
      update: {
        rateLimitEnabled: config.enabled,
        rateLimitBurst: config.burst,
        rateLimitHour: config.hour,
        rateLimitDay: config.day,
        rateLimitMonth: config.month,
      },
      select: {
        id: true,
        rateLimitEnabled: true,
        rateLimitBurst: true,
        rateLimitHour: true,
        rateLimitDay: true,
        rateLimitMonth: true,
      },
    });

    // Audit log the change (requires both `old` and `new`)
    await auditLog({
      action: 'UPDATE',
      entityType: 'System',
      entityId: updated.id,
      userId: ctx.id,
      companyId,
      performedByUserId: ctx.id,
      changes: { rateLimits: { old: oldConfig, new: config } },
      metadata: {
        ...requestMetadata(request),
        source: 'hermes_rate_limits',
        companyName: company.name,
      },
    });

    logger.info('[HERMES RATE-LIMITS] Updated rate limits', {
      companyId,
      companyName: company.name,
      config,
      performedBy: ctx.id,
    });

    // Notify hermes-agent to clear its config cache so the new limits
    // take effect immediately (instead of waiting up to 60s).
    // Non-blocking — cache TTL is the fallback.
    if (HERMES_ADMIN_KEY) {
      fetch(`/api/admin/invalidate?XTransformPort=${HERMES_SERVICE_PORT}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${HERMES_ADMIN_KEY}`,
        },
        body: JSON.stringify({ tenantId: companyId }),
      }).catch(() => { /* non-critical — cache TTL will catch up */ });
    }

    // Notify connected clients in this company that Hermes config changed
    notifyDataChange({
      scope: 'hermes-config',
      companyId,
      action: 'update',
    }).catch(() => { /* non-critical */ });

    return NextResponse.json({ success: true, rateLimits: updated });
  } catch (error) {
    logger.error('[HERMES RATE-LIMITS] Failed to update rate limits:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
