import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/session';
import { requireTokenPayAccess } from '@/lib/tokenpay';
import { requirePermission, blockOversightMutation, requireNotDemoCompany, Permission } from '@/lib/rbac';
import {
  prepareVATSubmission,
  submitVATToSkat,
  getVATSubmissions,
  type VATReportingPeriod,
} from '@/lib/vat-submit';
import { logger } from '@/lib/logger';

const VALID_PERIODS: VATReportingPeriod[] = ['Q1', 'Q2', 'Q3', 'Q4', 'YEARLY'];

/**
 * POST /api/vat-report/submit
 *
 * Prepares and submits a VAT report to Skattestyrelsen.
 * Requires: authenticated session, DATA_CREATE permission, TokenPay access.
 *
 * Body:
 *   - year (required): The fiscal year
 *   - period (required): Q1, Q2, Q3, Q4, or YEARLY
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Block oversight mutations
    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    // Require DATA_CREATE permission (VAT submission creates data)
    const permDenied = requirePermission(ctx, Permission.DATA_CREATE);
    if (permDenied) return permDenied;

    // Require TokenPay access
    const accessDenied = await requireTokenPayAccess(ctx.id);
    if (accessDenied) return accessDenied;

    // Block demo company
    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    // Validate company
    const companyId = ctx.activeCompanyId;
    if (!companyId) {
      return NextResponse.json(
        { error: 'No active company selected' },
        { status: 400 },
      );
    }

    // Parse request body
    const body = await request.json();
    const { year, period } = body;

    if (!year || typeof year !== 'number' || year < 1900 || year > 2100) {
      return NextResponse.json(
        { error: 'A valid year (1900-2100) is required.' },
        { status: 400 },
      );
    }

    if (!period || !VALID_PERIODS.includes(period)) {
      return NextResponse.json(
        { error: `Invalid period. Must be one of: ${VALID_PERIODS.join(', ')}` },
        { status: 400 },
      );
    }

    // Step 1: Prepare the submission
    logger.info(`[VAT-Submit API] Preparing VAT submission for ${year} ${period}`);
    const submission = await prepareVATSubmission(companyId, year, period, ctx.id);

    // Step 2: Submit to Skattestyrelsen
    logger.info(`[VAT-Submit API] Submitting VAT report ${submission.id} to Skattestyrelsen`);
    const result = await submitVATToSkat(submission.id, ctx.id);

    return NextResponse.json(
      {
        submission: result,
        message:
          result.status === 'SUBMITTED'
            ? `VAT report for ${year} ${period} submitted successfully. Reference: ${result.referenceId}`
            : `VAT report for ${year} ${period} encountered an error: ${result.errorMessage}`,
      },
      { status: result.status === 'SUBMITTED' ? 200 : 422 },
    );
  } catch (error) {
    logger.error('[VAT-Submit API] Error:', error);

    // Handle known error types
    if (error instanceof Error) {
      if (error.message.startsWith('VAT_SUBMISSION_EXISTS')) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      if (error.message.startsWith('VAT_SUBMISSION_NOT_FOUND')) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      if (error.message.startsWith('VAT_SUBMISSION_NOT_DRAFT')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json(
      {
        error: 'Failed to submit VAT report',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/vat-report/submit?year=2026
 *
 * Lists VAT submissions for the active company, optionally filtered by year.
 * Requires: authenticated session, DATA_READ permission.
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
    logger.error('[VAT-Submit API] Error listing submissions:', error);
    return NextResponse.json(
      {
        error: 'Failed to list VAT submissions',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
