import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { tenantFilter, Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { EInvoiceSendStatus } from '@prisma/client';

// GET /api/einvoice-sends — Global liste over alle e-faktura afsendelser for tenant
//
// Dette endpoint driver det nye globale sporings-view (EInvoiceTrackingPage)
// hvor tenants kan se alle deres afsendelser på én gang — ikke kun per-invoice.
//
// Query params:
//   ?status=SENT|IN_TRANSIT|DELIVERED|PENDING_APPROVAL|ACCEPTED|REJECTED|PAID|FAILED|CANCELLED
//   ?search=<recipient name or invoice number>
//   ?channel=NEMHANDEL_OIOUBL|PEPPOL_BIS|STORECOVE
//   ?page=1&limit=50
//   ?includeStats=true (returnerer pipeline-statistik: count pr. status)
//
// Response:
//   {
//     sends: EInvoiceSendingSummary[],
//     stats?: { status: count, ... }, // kun hvis includeStats=true
//     pagination: { page, limit, total, totalPages }
//   }
//
// EInvoiceSendingSummary inkluderer IKKE rawXml eller responseXml (stor data)
// — brug GET /api/einvoice-sends/[id] for fuld detalje inkl. timeline.

export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  async (request, ctx) => {
    try {
      const { searchParams } = new URL(request.url);
      const status = searchParams.get('status');
      const search = searchParams.get('search');
      const channel = searchParams.get('channel');
      const includeStats = searchParams.get('includeStats') === 'true';
      const page = parseInt(searchParams.get('page') || '1', 10);
      const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
      const skip = (page - 1) * limit;

      // Build where clause
      const where: Record<string, unknown> = { ...tenantFilter(ctx) };

      // Filter by status (validate against enum)
      if (status && Object.values(EInvoiceSendStatus).includes(status as EInvoiceSendStatus)) {
        where.status = status;
      }

      // Filter by channel
      if (channel) {
        where.channel = channel;
      }

      // Search: recipientName OR invoice.invoiceNumber contains search string
      if (search) {
        where.OR = [
          { recipientName: { contains: search, mode: 'insensitive' as const } },
          { recipientCvr: { contains: search, mode: 'insensitive' as const } },
          { invoice: { invoiceNumber: { contains: search, mode: 'insensitive' as const } } },
        ];
      }

      // Count + fetch in parallel
      const [count, sends] = await Promise.all([
        db.eInvoiceSending.count({ where }),
        db.eInvoiceSending.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true,
            invoiceId: true,
            channel: true,
            format: true,
            recipientName: true,
            recipientCvr: true,
            recipientEndpointId: true,
            status: true,
            sproomRawStatus: true,
            sentAt: true,
            inTransitAt: true,
            deliveredAt: true,
            pendingApprovalAt: true,
            acceptedAt: true,
            rejectedAt: true,
            paidAt: true,
            errorCode: true,
            errorMessage: true,
            retryCount: true,
            maxRetries: true,
            nextRetryAt: true,
            messageId: true,
            createdAt: true,
            updatedAt: true,
            // Join to Invoice for invoiceNumber + total + documentType
            invoice: {
              select: {
                id: true,
                invoiceNumber: true,
                documentType: true,
                total: true,
                currency: true,
                issueDate: true,
                dueDate: true,
                paidDate: true,
              },
            },
          },
        }),
      ]);

      // ── Build pipeline stats (count pr. status) ──
      // Computed in JS from the unfiltered query — small overhead, avoids a
      // second db round-trip for grouped counts.
      let stats: Record<string, number> | undefined;
      if (includeStats) {
        const allSendings = await db.eInvoiceSending.findMany({
          where: { ...tenantFilter(ctx) },
          select: { status: true },
        });
        stats = {};
        for (const s of allSendings) {
          stats[s.status] = (stats[s.status] || 0) + 1;
        }
      }

      return NextResponse.json({
        sends,
        stats,
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.ceil(count / limit) || 1,
        },
      });
    } catch (error) {
      logger.error('[EINVOICE-SENDS-LIST] Failed to fetch e-invoice sends:', error);
      return NextResponse.json(
        { error: 'Kunne ikke hente e-faktura afsendelser' },
        { status: 500 },
      );
    }
  },
);
