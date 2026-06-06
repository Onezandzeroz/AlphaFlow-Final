import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { logger } from '@/lib/logger';

/**
 * GET /api/hermes/tenants
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
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const tenants = companies.map((company) => ({
      companyId: company.id,
      companyName: company.name,
      hermesEnabled: company.hermesAgent?.enabled ?? false,
      dataAccessEnabled: company.hermesAgent?.dataAccessEnabled ?? false,
    }));

    return NextResponse.json({ tenants });
  } catch (error) {
    logger.error('[HERMES TENANTS] Failed to list Hermes tenants:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
