import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { logger } from '@/lib/logger';

/**
 * GET /api/hermes/config
 *
 * Returns the Hermes agent configuration for the current user's active company.
 * Available to all authenticated users (VIEWER+).
 *
 * Response:
 * {
 *   "hermesConfig": {
 *     "enabled": false,
 *     "dataAccessEnabled": false,
 *     "personality": "professional",
 *     "greeting": null
 *   }
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!ctx.activeCompanyId) {
      return NextResponse.json(
        { error: 'No active company selected. Please select a company.' },
        { status: 400 }
      );
    }

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
}
