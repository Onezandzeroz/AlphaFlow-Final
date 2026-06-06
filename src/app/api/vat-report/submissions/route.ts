import { NextResponse } from 'next/server';
import { getVATSubmissions } from '@/lib/vat-submit';
import { logger } from '@/lib/logger';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

/**
 * GET /api/vat-report/submissions?year=2026
 *
 * Lists VAT submissions for the active company, optionally filtered by year.
 * Requires: authenticated session, REPORTS_VIEW permission.
 *
 * Query params:
 *   - year (optional): Filter submissions by year
 */
export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.REPORTS_VIEW] },
  async (request, ctx) => {
    try {
      const companyId = ctx.activeCompanyId!;

      // Parse optional year filter
      const { searchParams } = new URL(request.url);
      const yearParam = searchParams.get('year');
      const year = yearParam ? parseInt(yearParam, 10) : undefined;

      if (yearParam && (isNaN(year!) || year! < 1900 || year! > 2100)) {
        return NextResponse.json(
          { error: 'Invalid year parameter. Must be a number between 1900 and 2100.' },
          { status: 400 },
        );
      }

      // List submissions
      const submissions = await getVATSubmissions(companyId, year);

      return NextResponse.json({ submissions });
    } catch (error) {
      logger.error('[VAT-Submissions API] Error listing submissions:', error);
      return NextResponse.json(
        {
          error: 'Failed to list VAT submissions',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 },
      );
    }
  }
);
