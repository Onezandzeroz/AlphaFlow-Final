import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { logger } from '@/lib/logger';

/**
 * GET /api/hermes/config
 */
export const GET = withGuard(routeConfig['/api/hermes/config'].GET!, async (request, ctx) => {
  try {
    const hermesAgent = await db.hermesAgent.findUnique({
      where: { companyId: ctx.activeCompanyId },
      select: {
        enabled: true,
        dataAccessEnabled: true,
        personality: true,
        greeting: true,
      },
    });

    // If no HermesAgent record exists, return defaults
    const hermesConfig = hermesAgent ?? {
      enabled: false,
      dataAccessEnabled: false,
      personality: 'professional',
      greeting: null,
    };

    return NextResponse.json({ hermesConfig });
  } catch (error) {
    logger.error('[HERMES CONFIG] Failed to fetch Hermes config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
