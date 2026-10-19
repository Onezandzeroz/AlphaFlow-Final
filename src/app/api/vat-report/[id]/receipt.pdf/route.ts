import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { Permission } from '@/lib/rbac';
import { withGuard, type RouteSegmentContext } from '@/lib/route-guard';

/**
 * GET /api/vat-report/[id]/receipt.pdf
 *
 * Downloads the receipt PDF for an ACCEPTED VAT submission.
 *
 * The receipt PDF is captured in `VATSubmission.receiptPdfBase64` by the
 * `POST /api/vat-report/receipt` endpoint (which polls SKAT's
 * MomsangivelseKvitteringHent service). This endpoint streams that stored
 * PDF to the browser as an `application/pdf` download.
 *
 * Requires: authenticated session, REPORTS_VIEW permission.
 */
export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.REPORTS_VIEW] },
  async (request, ctx, context: RouteSegmentContext) => {
    try {
      const { id } = await context.params as { id: string };
      const companyId = ctx.activeCompanyId!;

      const submission = await db.vATSubmission.findUnique({
        where: { id },
      });

      if (!submission) {
        return NextResponse.json(
          { error: 'VAT submission not found' },
          { status: 404 },
        );
      }

      // Tenant isolation: the submission must belong to the active company
      if (submission.companyId !== companyId) {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403 },
        );
      }

      if (submission.status !== 'ACCEPTED') {
        return NextResponse.json(
          {
            error: `Receipt is only available for ACCEPTED submissions. Current status: ${submission.status}`,
          },
          { status: 409 },
        );
      }

      if (!submission.receiptPdfBase64) {
        return NextResponse.json(
          {
            error: 'No receipt PDF available. Fetch the receipt first via POST /api/vat-report/receipt.',
          },
          { status: 404 },
        );
      }

      const buffer = Buffer.from(submission.receiptPdfBase64, 'base64');

      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="momskvittering-${submission.year}-${submission.period}.pdf"`,
          'Content-Length': String(buffer.length),
        },
      });
    } catch (error) {
      logger.error('[VAT-Receipt PDF API] Error streaming receipt PDF:', error);
      return NextResponse.json(
        {
          error: 'Failed to download receipt PDF',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 },
      );
    }
  }
);
