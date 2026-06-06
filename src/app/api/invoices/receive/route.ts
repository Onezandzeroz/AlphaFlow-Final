import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { tenantFilter, Permission } from '@/lib/rbac';
import { parseEInvoiceXml, mapDocumentTypeToDbValue, mapFormatToDbValue } from '@/lib/einvoice-parser';
import { generateApplicationResponse, generateMessageLevelResponse } from '@/lib/einvoice-response';
import { logger } from '@/lib/logger';
import { withGuard } from '@/lib/route-guard';

// POST /api/invoices/receive — Receive and store an e-invoice
export const POST = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, permissions: [Permission.DATA_CREATE] },
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

      // Parse the XML
      const result = parseEInvoiceXml(xml);

      if (!result.data) {
        return NextResponse.json(
          {
            error: 'Failed to parse e-invoice XML',
            validationErrors: result.errors,
            warnings: result.warnings,
          },
          { status: 400 }
        );
      }

      const parsed = result.data;
      const companyId = ctx.activeCompanyId!;

      // Check for duplicate invoice number within company
      const existing = await db.receivedInvoice.findUnique({
        where: {
          companyId_invoiceNumber: {
            companyId,
            invoiceNumber: parsed.invoiceNumber,
          },
        },
      });

      if (existing) {
        return NextResponse.json(
          {
            error: 'Duplicate invoice',
            message: `An e-invoice with number "${parsed.invoiceNumber}" already exists for this company`,
            existingId: existing.id,
          },
          { status: 409 }
        );
      }

      // Generate response XML
      let responseXml: string | undefined;
      let responseType: string | undefined;

      if (parsed.format === 'PEPPOL_BIS') {
        responseXml = generateMessageLevelResponse({
          messageId: parsed.invoiceNumber,
          responseCode: result.errors.length > 0 ? 'ERROR' : 'OK',
          errors: result.errors,
        });
        responseType = 'MESSAGE_LEVEL_RESPONSE';
      } else {
        const appResponseCode = result.errors.length > 0
          ? 'REJECTED' as const
          : 'ACCEPTED' as const;
        responseXml = generateApplicationResponse({
          invoiceId: parsed.invoiceNumber,
          responseCode: appResponseCode,
          errors: result.errors,
        });
        responseType = 'APPLICATION_RESPONSE';
      }

      // Parse dueDate — may be undefined for credit notes
      let dueDate: Date | null = null;
      if (parsed.dueDate) {
        const d = new Date(parsed.dueDate);
        if (!isNaN(d.getTime())) {
          dueDate = d;
        }
      }

      // Parse issueDate — required
      const issueDate = new Date(parsed.issueDate);
      if (isNaN(issueDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid issue date in XML' },
          { status: 400 }
        );
      }

      // Create ReceivedInvoice record
      const invoice = await db.receivedInvoice.create({
        data: {
          companyId,
          userId: ctx.id,

          // Supplier info
          supplierName: parsed.supplierName,
          supplierCvr: parsed.supplierCvr ?? null,
          supplierEmail: parsed.supplierEmail ?? null,
          supplierPhone: parsed.supplierPhone ?? null,
          supplierAddress: parsed.supplierAddress ?? null,
          supplierCity: parsed.supplierCity ?? null,
          supplierCountry: parsed.supplierCountry ?? null,

          // Invoice identification
          invoiceNumber: parsed.invoiceNumber,
          issueDate,
          dueDate,
          currencyCode: parsed.currencyCode,

          // Classification
          format: mapFormatToDbValue(parsed.format) as 'OIOUBL' | 'PEPPOL_BIS',
          documentType: mapDocumentTypeToDbValue(parsed.documentType) as 'INVOICE' | 'CREDIT_NOTE' | 'CORRECTED' | 'SELF_BILLED',
          customizationId: parsed.customizationId ?? null,
          profileId: parsed.profileId ?? null,

          // Line items
          lineItems: parsed.lineItems as unknown as Record<string, unknown>[],
          lineCount: parsed.lineItems.length,

          // Totals
          taxExclusiveAmount: parsed.taxExclusiveAmount,
          taxAmount: parsed.taxAmount,
          taxInclusiveAmount: parsed.taxInclusiveAmount,
          payableAmount: parsed.payableAmount,

          // Payment info
          paymentMeansCode: parsed.paymentMeansCode ?? null,
          paymentAccountId: parsed.paymentAccountId ?? null,

          // Raw XML
          rawXml: xml,

          // Response
          responseXml: responseXml ?? null,
          responseType: responseType ?? null,

          // Validation
          validationErrors: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
          validationWarnings: result.warnings.length > 0 ? JSON.stringify(result.warnings) : null,

          // Initial status
          status: result.errors.length > 0 ? 'RECEIVED' : 'RECEIVED',
        },
      });

      // Audit log
      await auditCreate(
        ctx.id,
        'ReceivedInvoice' as never,
        invoice.id,
        {
          invoiceNumber: parsed.invoiceNumber,
          format: parsed.format,
          documentType: parsed.documentType,
          supplierName: parsed.supplierName,
          totalAmount: parsed.payableAmount,
          currency: parsed.currencyCode,
          lineCount: parsed.lineItems.length,
          responseType,
        },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      return NextResponse.json(
        {
          receivedInvoice: invoice,
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
