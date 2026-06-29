import { NextRequest, NextResponse } from 'next/server';
import { withGuard } from '@/lib/route-guard';
import { Permission } from '@/lib/rbac';

/**
 * POST /api/ocr/pdf
 *
 * Proxy route that forwards document scan requests to the Python
 * scanner-service mini-service (port 3005).
 *
 * The scanner-service replaces the old inline JS implementation with:
 *   - PyMuPDF for PDF processing (text extraction + 300 DPI rendering)
 *   - OpenCV (cv2) for the v10 image enhancement pipeline
 *   - Tesseract for OCR (dan+eng)
 *   - Anthropic SDK for VLM (Claude Sonnet 4, direct — no Z.ai proxy)
 *   - Danish parser, CVR/EAN/IBAN validation, account suggestion
 *
 * The response shape is backward-compatible with the old VLMApiResponse.
 */
export const maxDuration = 60;

const SCANNER_PORT = process.env.SCANNER_PORT || '3005';
const SCANNER_API_KEY = process.env.SCANNER_API_KEY || 'scanner-dev-key-2026';

export const POST = withGuard({
  auth: true,
  requireCompany: true,
  blockOversight: true,
  blockDemo: true,
  requireTokenPay: true,
  permissions: [Permission.DATA_CREATE],
}, async (request, ctx) => {
  try {
    // Read the incoming FormData
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 10MB' }, { status: 400 });
    }

    // Build forwarding FormData
    const forwardForm = new FormData();
    forwardForm.append('file', file);

    // Forward to scanner-service
    const scannerUrl = `http://localhost:${SCANNER_PORT}/api/v1/scan`;

    const scannerResponse = await fetch(scannerUrl, {
      method: 'POST',
      body: forwardForm,
      headers: {
        'X-Access-Service-Key': SCANNER_API_KEY,
        'X-Company-Id': ctx.activeCompanyId || '',
        'X-User-Id': ctx.id || '',
      },
    });

    if (!scannerResponse.ok) {
      const errorBody = await scannerResponse.text().catch(() => '');
      console.error(
        `[OCR:PROXY] Scanner service error ${scannerResponse.status}:`,
        errorBody.substring(0, 300),
      );
      return NextResponse.json(
        { error: `Scanner service error (${scannerResponse.status}): ${errorBody.substring(0, 200)}` },
        { status: scannerResponse.status },
      );
    }

    const result = await scannerResponse.json();

    // Log the result summary (backward compat with old logging)
    console.log(
      `[OCR:PROXY] SUCCESS: amount=${result.amount}, date=${result.date}, ` +
      `vat=${result.vatPercent}%, confidence=${result.confidence}, ` +
      `processor=${result._extensions?.processor || 'unknown'}`,
    );

    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[OCR:PROXY] ERROR:', msg);
    return NextResponse.json(
      { error: `OCR proxy failed: ${msg}` },
      { status: 500 },
    );
  }
});
