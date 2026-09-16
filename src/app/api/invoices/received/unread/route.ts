import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Permission } from '@/lib/rbac';
import { logger } from '@/lib/logger';
import { withGuard } from '@/lib/route-guard';

// GET /api/invoices/received/unread — List unread received e-invoices
//
// Returns the actual unread ReceivedInvoice records (readAt = null), newest
// first, limited to the last 10. Used by the notification center to surface
// each newly received e-invoice as an individual notification.
//
// Distinct from /api/invoices/received/unread-count which returns only the
// count (used by the toast notifier + the bell badge counter fallback).
//
// Response shape:
//   {
//     invoices: Array<{
//       id: string,
//       supplierName: string,
//       supplierCvr: string | null,
//       invoiceNumber: string,
//       documentType: string,  // 'INVOICE' | 'CREDIT_NOTE' | 'CORRECTED' | 'SELF_BILLED'
//       format: string,       // 'OIOUBL' | 'PEPPOL_BIS'
//       totalAmount: number,  // payableAmount as number (Decimal -> Number)
//       currency: string,     // currencyCode
//       createdAt: string,    // ISO timestamp
//     }>,
//     count: number,
//   }
export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  async (_request, ctx) => {
    try {
      const records = await db.receivedInvoice.findMany({
        where: {
          companyId: ctx.activeCompanyId!,
          readAt: null,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        // Select only the fields the notification center needs (keep payload small).
        select: {
          id: true,
          supplierName: true,
          supplierCvr: true,
          invoiceNumber: true,
          documentType: true,
          format: true,
          payableAmount: true,
          currencyCode: true,
          createdAt: true,
        },
      });

      const invoices = records.map((r) => ({
        id: r.id,
        supplierName: r.supplierName,
        supplierCvr: r.supplierCvr,
        invoiceNumber: r.invoiceNumber,
        documentType: r.documentType as string,
        format: r.format as string,
        // Prisma Decimal has .toNumber(); fall back to Number() for safety
        // (decimal.js's toJSON() returns a string, but the actual Prisma
        // model field is a Decimal class instance when accessed server-side).
        totalAmount:
          typeof r.payableAmount === 'number'
            ? r.payableAmount
            : (r.payableAmount as { toNumber(): number }).toNumber(),
        currency: r.currencyCode,
        createdAt: r.createdAt.toISOString(),
      }));

      return NextResponse.json({ invoices, count: invoices.length });
    } catch (error) {
      logger.error('[RECEIVED_UNREAD_API] Failed to fetch unread received invoices:', error);
      return NextResponse.json(
        { error: 'Kunne ikke hente ulæste e-fakturaer' },
        { status: 500 }
      );
    }
  }
);
