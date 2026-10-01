import { NextResponse } from 'next/server';
import { fetchVATReceipt } from '@/lib/vat-submit';
import { logger } from '@/lib/logger';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { notifyDataChanges } from '@/lib/notify-data-change';

/**
 * POST /api/vat-report/receipt
 *
 * Fetches the VAT receipt from Skattestyrelsen via MomsangivelseKvitteringHent.
 * Should be called AFTER the user has approved the draft in TastSelv Erhverv
 * via the deep link returned by the submission.
 *
 * If the user has not yet approved, returns status SUBMITTED with errorCode 4810.
 * If approved, returns status ACCEPTED with receiptPdfBase64 (if available).
 *
 * Body:
 *   - submissionId (required): The VATSubmission database ID
 */
export const POST = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_CREATE] },
  async (request, ctx) => {
    try {
      const body = await request.json().catch(() => ({}));
      const { submissionId } = body;

      if (!submissionId) {
        return NextResponse.json(
          { error: 'submissionId is required' },
          { status: 400 },
        );
      }

      logger.info(
        `[API] Fetching VAT receipt: submissionId=${submissionId}, company=${ctx.activeCompanyId}`,
      );

      const submission = await fetchVATReceipt(submissionId, ctx.userId);

      // Notify data change so the UI updates
      notifyDataChanges(ctx.activeCompanyId!, 'vat-report');

      return NextResponse.json({
        success: true,
        submission: {
          id: submission.id,
          status: submission.status,
          transactionIdentifier: submission.transactionIdentifier,
          deepLink: submission.deepLink,
          advisoryCode: submission.advisoryCode,
          receiptPdfBase64: submission.receiptPdfBase64,
          errorMessage: submission.errorMessage,
          errorCode: submission.errorCode,
        },
      });
    } catch (error) {
      logger.error('[API] VAT receipt fetch error:', error);

      const message = error instanceof Error ? error.message : 'Unknown error';
      const isNotFound = message.includes('NOT_FOUND');
      const isNotSubmitted = message.includes('NOT_SUBMITTED') || message.includes('NO_TRANSACTION_ID');

      return NextResponse.json(
        { error: message },
        { status: isNotFound ? 404 : isNotSubmitted ? 400 : 500 },
      );
    }
  },
);
