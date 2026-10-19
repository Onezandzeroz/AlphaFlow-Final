import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  getVirksomhedKalenderHent,
  hasSkatCredentials,
} from '@/lib/skat-soap-client';
import { logger } from '@/lib/logger';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

/**
 * GET /api/vat-report/calendar?year=2026
 *
 * Fetches the SKAT VAT calendar (reporting periods + deadlines) for the
 * active company's CVR/SE-number via VirksomhedKalenderHent.
 *
 * When no mTLS credentials are configured, the SKAT client falls back to
 * simulation mode — the response includes `simulated: true` so the UI can
 * surface that to the user.
 *
 * Requires: authenticated session, REPORTS_VIEW permission.
 *
 * Query params:
 *   - year (optional): Defaults to the current year. Filters the calendar
 *     window to [YYYY-01-01, YYYY-12-31].
 */
export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.REPORTS_VIEW] },
  async (request, ctx) => {
    try {
      const companyId = ctx.activeCompanyId!;

      // Parse optional year filter (defaults to current year)
      const { searchParams } = new URL(request.url);
      const yearParam = searchParams.get('year');
      const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

      if (isNaN(year) || year < 1900 || year > 2100) {
        return NextResponse.json(
          { error: 'Invalid year parameter. Must be a number between 1900 and 2100.' },
          { status: 400 },
        );
      }

      // Resolve the company's CVR/SE-number
      const company = await db.company.findUnique({
        where: { id: companyId },
        select: { cvrNumber: true },
      });

      if (!company || !company.cvrNumber) {
        return NextResponse.json(
          { error: 'The company has no CVR/SE-number configured.' },
          { status: 400 },
        );
      }

      const seNumber = company.cvrNumber;
      const dateFrom = `${year}-01-01`;
      const dateTo = `${year}-12-31`;

      logger.info(
        `[VAT-Calendar API] Fetching SKAT calendar: SE=${seNumber}, ${dateFrom} → ${dateTo}`,
      );

      const calendar = await getVirksomhedKalenderHent(seNumber, dateFrom, dateTo);

      return NextResponse.json({
        calendar,
        simulated: !hasSkatCredentials(),
      });
    } catch (error) {
      logger.error('[VAT-Calendar API] Error fetching SKAT calendar:', error);
      return NextResponse.json(
        {
          error: 'Failed to fetch VAT calendar',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 },
      );
    }
  }
);
