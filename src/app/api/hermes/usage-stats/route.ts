import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { logger } from '@/lib/logger';

/**
 * GET /api/hermes/usage-stats
 *
 * SuperDev-only. Returns LIVE per-tenant usage counters (minute/hour/day/month)
 * from the hermes-agent service, merged with company names from the DB.
 *
 * The hermes-agent exposes GET /admin/stats (protected by HERMES_ADMIN_KEY).
 * This route proxies that call and enriches each entry with the company name
 * so the oversight page can display a human-readable company list.
 *
 * Tenants with no usage yet (never chatted) appear with zeroed counters.
 */

const HERMES_SERVICE_PORT = process.env.HERMES_SERVICE_PORT || '3004';
const HERMES_ADMIN_KEY = process.env.HERMES_ADMIN_KEY || process.env.OPENROUTER_API_KEY || '';

interface AgentUsageEntry {
  tenantId: string;
  config: {
    enabled: boolean;
    burst: number;
    hour: number;
    day: number;
    month: number;
  };
  usage: {
    minute: { used: number; limit: number; resetsInSeconds: number };
    hour: { used: number; limit: number; resetsInSeconds: number };
    day: { used: number; limit: number; resetsInSeconds: number };
    month: { used: number; limit: number; resetsInSeconds: number };
  };
}

export const GET = withGuard(routeConfig['/api/hermes/usage-stats'].GET!, async (request, ctx) => {
  try {
    // 1. Fetch all companies (for names + to ensure every tenant appears,
    //    even those with zero usage that hermes-agent hasn't seen yet).
    const companies = await db.company.findMany({
      select: {
        id: true,
        name: true,
        companyType: true,
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

    // 2. Fetch live usage from hermes-agent (best-effort).
    //    If the service is unreachable, we still return the tenant list
    //    with zeroed usage so the oversight page renders.
    let agentStats: AgentUsageEntry[] = [];
    if (HERMES_ADMIN_KEY) {
      try {
        const res = await fetch(
          `http://localhost:${HERMES_SERVICE_PORT}/admin/stats`,
          {
            headers: { 'Authorization': `Bearer ${HERMES_ADMIN_KEY}` },
            // Short timeout — the oversight page should not hang if
            // hermes-agent is restarting.
            signal: AbortSignal.timeout(5000),
          },
        );
        if (res.ok) {
          const data = await res.json();
          agentStats = Array.isArray(data.tenants) ? data.tenants : [];
        } else {
          logger.warn('[HERMES USAGE-STATS] hermes-agent returned non-OK', { status: res.status });
        }
      } catch (err) {
        // hermes-agent may be down/restarting — degrade gracefully
        logger.warn('[HERMES USAGE-STATS] Could not reach hermes-agent, returning zeroed usage', err);
      }
    }

    // 3. Build a lookup map: tenantId -> live usage from agent
    const usageMap = new Map<string, AgentUsageEntry>();
    for (const entry of agentStats) {
      usageMap.set(entry.tenantId, entry);
    }

    // 4. Merge: company names + live usage (zeroed if agent hasn't seen tenant)
    const tenants = companies.map((company) => {
      const live = usageMap.get(company.id)
      const cfg = company.hermesAgent
      const config = {
        enabled: cfg?.rateLimitEnabled ?? true,
        burst: cfg?.rateLimitBurst ?? 10,
        hour: cfg?.rateLimitHour ?? 40,
        day: cfg?.rateLimitDay ?? 120,
        month: cfg?.rateLimitMonth ?? 2000,
      }
      return {
        companyId: company.id,
        companyName: company.name,
        companyType: company.companyType ?? null,
        hermesEnabled: cfg?.enabled ?? false,
        config,
        usage: live
          ? live.usage
          : {
              minute: { used: 0, limit: config.burst, resetsInSeconds: 60 },
              hour: { used: 0, limit: config.hour, resetsInSeconds: 3600 },
              day: { used: 0, limit: config.day, resetsInSeconds: 86400 },
              month: { used: 0, limit: config.month, resetsInSeconds: 2592000 },
            },
      }
    })

    return NextResponse.json({ tenants });
  } catch (error) {
    logger.error('[HERMES USAGE-STATS] Failed to fetch usage stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
