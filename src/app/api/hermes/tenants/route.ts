import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { logger } from '@/lib/logger';

/**
 * GET /api/hermes/tenants
 *
 * SuperDev-only. Returns all companies with their HermesAgent config,
 * including per-tenant rate-limit settings (for the oversight page).
 */
export const GET = withGuard(routeConfig['/api/hermes/tenants'].GET!, async (request, ctx) => {
  try {
    // Query all companies with their HermesAgent
    const companies = await db.company.findMany({
      include: {
        hermesAgent: {
          select: {
            enabled: true,
            dataAccessEnabled: true,
            rateLimitEnabled: true,
            rateLimitBurst: true,
            rateLimitHour: true,
            rateLimitDay: true,
            rateLimitMonth: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const tenants = companies.map((company) => ({
      companyId: company.id,
      companyName: company.name,
      companyType: company.companyType ?? null,
      cvrNumber: company.cvrNumber,
      hermesEnabled: company.hermesAgent?.enabled ?? false,
      dataAccessEnabled: company.hermesAgent?.dataAccessEnabled ?? false,
      rateLimits: {
        enabled: company.hermesAgent?.rateLimitEnabled ?? true,
        burst: company.hermesAgent?.rateLimitBurst ?? 10,
        hour: company.hermesAgent?.rateLimitHour ?? 40,
        day: company.hermesAgent?.rateLimitDay ?? 120,
        month: company.hermesAgent?.rateLimitMonth ?? 2000,
      },
    }));

    return NextResponse.json({ tenants });
  } catch (error) {
    logger.error('[HERMES TENANTS] Failed to list Hermes tenants:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
