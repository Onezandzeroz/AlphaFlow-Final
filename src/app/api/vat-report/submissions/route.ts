import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/session';
import { requirePermission, Permission } from '@/lib/rbac';
import { getVATSubmissions } from '@/lib/vat-submit';
import { logger } from '@/lib/logger';

/**
 * GET /api/vat-report/submissions?year=2026
 *
 * Lists VAT submissions for the active company, optionally filtered by year.
 * Requires: authenticated session, DATA_READ permission.
 *
 * Query params:
 *   - year (optional): Filter submissions by year
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require DATA_READ permission
    const permDenied = requirePermission(ctx, Permission.DATA_READ);
    if (permDenied) return permDenied;

    // Validate company
    const companyId = ctx.activeCompanyId;
    if (!companyId) {
      return NextResponse.json(
        { error: 'No active company selected' },
        { status: 400 },
      );
    }

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
