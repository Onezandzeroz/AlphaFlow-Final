import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { logger } from '@/lib/logger';

/**
 * GET /api/hermes/tenants
 *
 * Returns all companies with their Hermes enabled status.
 * ONLY available to isSuperDev users (App Owner).
 *
 * Response:
 * {
 *   "tenants": [
 *     { "companyId": "...", "companyName": "...", "hermesEnabled": false, "dataAccessEnabled": false },
 *     ...
 *   ]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require SuperDev (App Owner) access
    if (!ctx.isSuperDev) {
      return NextResponse.json(
        { error: 'Forbidden: App Owner access required' },
        { status: 403 }
      );
    }

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
}
