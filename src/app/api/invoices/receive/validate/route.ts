import { NextResponse } from 'next/server';
import { parseEInvoiceXml } from '@/lib/einvoice-parser';
import { logger } from '@/lib/logger';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

// POST /api/invoices/receive/validate — Validate e-invoice XML without storing
export const POST = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  async (request, ctx) => {
    try {
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
);
