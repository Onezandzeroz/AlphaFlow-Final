import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateAnnualReportCSV } from '@/lib/annual-report-csv';
import { logger } from '@/lib/logger';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

/**
 * GET /api/reports/annual-csv?year=2026
 *
 * Generates and downloads a Danish annual report CSV (Regnskab Basis format).
 * Requires: authenticated session, REPORTS_EXPORT permission, TokenPay access.
 *
 * Query params:
 *   - year (required): The fiscal year to generate the report for
 */
export const GET = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, requireTokenPay: true, permissions: [Permission.REPORTS_EXPORT] },
  async (request, ctx) => {
    try {
      // Parse year parameter
      const { searchParams } = new URL(request.url);
      const yearParam = searchParams.get('year');

      if (!yearParam) {
        return NextResponse.json(
          { error: 'Missing required query parameter: year' },
          { status: 400 },
        );
      }

      const year = parseInt(yearParam, 10);
      if (isNaN(year) || year < 1900 || year > 2100) {
        return NextResponse.json(
          { error: 'Invalid year parameter. Must be a number between 1900 and 2100.' },
          { status: 400 },
        );
      }

      // Verify company exists
      const companyId = ctx.activeCompanyId!;
      const company = await db.company.findUnique({
        where: { id: companyId },
        select: { name: true, cvrNumber: true },
      });

      // Generate the CSV
      logger.info(`[Annual-CSV] Generating Regnskab Basis CSV for ${company?.name} ${year}`);
      const csvContent = await generateAnnualReportCSV(companyId, year);

      // Return as downloadable CSV with UTF-8 BOM
      const filename = `Aarsregnskab_Basis_${company?.name?.replace(/\s+/g, '_') || 'company'}_${year}.csv`;

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    } catch (error) {
      logger.error('[Annual-CSV] Error generating annual report CSV:', error);
      return NextResponse.json(
        {
          error: 'Failed to generate annual report CSV',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 },
      );
    }
  }
);
