import { NextResponse } from 'next/server';
import { requestMetadata } from '@/lib/audit';
import { Permission } from '@/lib/rbac';
import { storeReceivedInvoice } from '@/lib/invoice-receiver';
import { logger } from '@/lib/logger';
import { withGuard } from '@/lib/route-guard';

// POST /api/invoices/receive — Receive and store an e-invoice (manual upload)
//
// This is the manual-upload path. The automatic path is the Storecove webhook
// at /api/storecove/webhook (event: received_document). Both use the same
// shared storeReceivedInvoice() logic so parsing, validation, response-XML
// generation, audit logging and frontend notification are identical.
export const POST = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, permissions: [Permission.DATA_CREATE] },
  async (request, ctx) => {
    try {
      const body = await request.json();
      const { xml } = body as { xml?: string };

      if (!xml || typeof xml !== 'string') {
        return NextResponse.json(
          { error: 'Missing required field: xml (string)' },
          { status: 400 }
        );
      }

      const result = await storeReceivedInvoice({
        companyId: ctx.activeCompanyId!,
        userId: ctx.id,
        xml,
        source: 'manual_upload',
        auditMeta: requestMetadata(request),
      });

      // Duplicate invoice number within this tenant
      if (result.duplicate) {
        return NextResponse.json(
          {
            error: 'Duplicate invoice',
            message: `An e-invoice with number "${result.invoice?.invoiceNumber}" already exists for this company`,
            existingId: result.invoice?.id,
          },
          { status: 409 }
        );
      }

      // Parse / validation failure
      if (!result.success) {
        return NextResponse.json(
          {
            error: result.error || 'Failed to parse e-invoice XML',
            validationErrors: result.validationErrors,
            warnings: result.warnings,
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          receivedInvoice: { id: result.invoice!.id },
          invoiceNumber: result.invoice!.invoiceNumber,
          warnings: result.warnings,
        },
        { status: 201 }
      );
    } catch (error) {
      logger.error('Receive e-invoice error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
