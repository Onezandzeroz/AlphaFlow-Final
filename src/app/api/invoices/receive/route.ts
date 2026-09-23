import { NextResponse } from 'next/server';
import { requestMetadata } from '@/lib/audit';
import { Permission } from '@/lib/rbac';
import { storeReceivedInvoice } from '@/lib/invoice-receiver';
import { logger } from '@/lib/logger';
import { withGuard } from '@/lib/route-guard';
import { getEInvoiceUsage } from '@/lib/usage-quotas';

// POST /api/invoices/receive — Receive and store an e-invoice (manual upload)
//
// This is the manual-upload path. The automatic path is the Sproom webhook
// at /api/sproom/webhook (event: DocumentReceived). Both use the same
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

      // ── Månedlig forbrugskvote (e-faktura: afsendelser + modtagelser) ──
      // Manuel upload blokeres når grænsen er nået. Automatisk Sproom-
      // modtagelse (webhook) opretter ALTID ReceivedInvoice — data fra
      // leverandører går aldrig tabt — men tæller med i forbruget.
      const usage = await getEInvoiceUsage(ctx.activeCompanyId!);
      if (usage.remaining <= 0) {
        logger.warn('[EINVOICE_RECEIVE] Monthly e-invoice quota exceeded', {
          companyId: ctx.activeCompanyId,
          used: usage.used,
          totalQuota: usage.totalQuota,
        });
        return NextResponse.json(
          {
            error:
              'Månedligt forbrug af e-faktura er nået for din plan. ' +
              'Tilkøb ekstra forbrug, der passer din virksomhed — det er nemt og hurtigt: skriv til os via kontaktsiden, og vi udvider dit forbrug.',
            code: 'EINVOICE_QUOTA_EXCEEDED',
            usage: {
              used: usage.used,
              planQuota: usage.planQuota,
              addonQuota: usage.addonQuota,
              totalQuota: usage.totalQuota,
              resetsAt: usage.resetsAt,
            },
          },
          { status: 429 }
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
