import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/session';
import { parseEInvoiceXml } from '@/lib/einvoice-parser';
import { logger } from '@/lib/logger';

// POST /api/invoices/receive/validate — Validate e-invoice XML without storing
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx || !ctx.activeCompanyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { xml } = body;

    if (!xml || typeof xml !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: xml (string)' },
        { status: 400 }
      );
    }

    // Parse the XML (validation only)
    const result = parseEInvoiceXml(xml);

    // Build preview response
    return NextResponse.json({
      valid: result.data !== null && result.errors.length === 0,
      data: result.data,
      errors: result.errors,
      warnings: result.warnings,
    });
  } catch (error) {
    logger.error('Validate e-invoice error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
