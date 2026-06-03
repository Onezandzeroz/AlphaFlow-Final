import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { requireTokenPayAccess } from '@/lib/tokenpay';
import { requirePermission, tenantFilter, Permission } from '@/lib/rbac';
import { generateAnnualReportXBRL } from '@/lib/annual-report-xbrl';
import { logger } from '@/lib/logger';

/**
 * GET /api/reports/annual-xbrl?year=2026
 *
 * Generates and downloads a Danish annual report iXBRL (Regnskab Special format).
 * Requires: authenticated session, REPORTS_EXPORT permission, TokenPay access.
 *
 * Query params:
 *   - year (required): The fiscal year to generate the report for
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require REPORTS_EXPORT permission
    const permDenied = requirePermission(ctx, Permission.REPORTS_EXPORT);
    if (permDenied) return permDenied;

    // Require TokenPay access
    const accessDenied = await requireTokenPayAccess(ctx.id);
    if (accessDenied) return accessDenied;

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
    const companyId = ctx.activeCompanyId;
    if (!companyId) {
      return NextResponse.json(
        { error: 'No active company selected' },
        { status: 400 },
      );
    }

    const company = await db.company.findUnique({
      where: { id: companyId },
      select: { name: true, cvrNumber: true },
    });

    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 },
      );
    }

    // Generate the iXBRL document
    logger.info(`[Annual-XBRL] Generating Regnskab Special iXBRL for ${company.name} ${year}`);
    const xbrlContent = await generateAnnualReportXBRL(
      companyId,
      year,
      company.name,
      company.cvrNumber,
    );

    // Return as downloadable XML
    const filename = `Aarsregnskab_Special_${company.name.replace(/\s+/g, '_')}_${year}.xbrl`;

    return new NextResponse(xbrlContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error('[Annual-XBRL] Error generating annual report XBRL:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate annual report XBRL',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
