import { NextResponse } from 'next/server';
import { withGuard } from '@/lib/route-guard';
import { Permission } from '@/lib/rbac';
import { saveReceiptFile, validateReceiptFile } from '@/lib/file-service';
import { logger } from '@/lib/logger';
import { notifyDataChanges } from '@/lib/notify-data-change';

/**
 * POST /api/transactions/upload
 *
 * Upload a receipt image for a purchase transaction.
 *
 * Request: multipart/form-data with a `file` field
 * Response: { path: "receipts/{companyId}/{filename}" }
 *
 * Flow:
 *   1. Authenticate via session (handled by withGuard)
 *   2. Extract file from FormData
 *   3. Validate file size + MIME type
 *   4. Save to uploads/receipts/{companyId}/ (serving path)
 *      AND Tenant-Backup/{companyName}/Receipts/ (backup path)
 *   5. Return the DB-relative path for storing in Transaction.receiptImage
 */
export const POST = withGuard({
  auth: true,
  requireCompany: true,
  blockOversight: true,
  blockDemo: true,
  requireTokenPay: true,
  permissions: [Permission.DATA_CREATE],
}, async (request, ctx) => {
  try {
    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'No file provided. Use FormData with a "file" field.' },
        { status: 400 }
      );
    }

    // Validate file
    const validationError = validateReceiptFile(file);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save to both storage locations
    const companyName = ctx.activeCompanyName || 'unknown-company';
    const result = saveReceiptFile(buffer, file.name, ctx.activeCompanyId!, companyName);

    logger.info(
      `[RECEIPT-UPLOAD] Saved receipt for company ${ctx.activeCompanyId}: ` +
      `${result.dbPath} (${(result.fileSize / 1024).toFixed(1)} KB, original: ${result.originalName})`
    );

    notifyDataChanges([
      { scope: 'transactions', companyId: ctx.activeCompanyId!, action: 'create' },
      { scope: 'dashboard', companyId: ctx.activeCompanyId!, action: 'update' },
      { scope: 'ledger', companyId: ctx.activeCompanyId!, action: 'update' },
      { scope: 'cash-flow', companyId: ctx.activeCompanyId!, action: 'update' },
      { scope: 'reports', companyId: ctx.activeCompanyId!, action: 'update' },
    ]).catch(() => {});

    return NextResponse.json({ path: result.dbPath });
  } catch (error) {
    logger.error('[RECEIPT-UPLOAD] Upload failed:', error);
    return NextResponse.json(
      { error: 'Failed to upload receipt' },
      { status: 500 }
    );
  }
});
