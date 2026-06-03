import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { tenantFilter } from '@/lib/rbac';
import { ReceivedInvoiceStatus } from '@prisma/client';
import { logger } from '@/lib/logger';

// GET /api/invoices/received — List received e-invoices
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx || !ctx.activeCompanyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = { ...tenantFilter(ctx) };

    if (status && Object.values(ReceivedInvoiceStatus).includes(status as ReceivedInvoiceStatus)) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { supplierName: { contains: search, mode: 'insensitive' as const } },
        { invoiceNumber: { contains: search, mode: 'insensitive' as const } },
        { supplierCvr: { contains: search, mode: 'insensitive' as const } },
      ];
    }

    // Count and fetch in parallel
    const [count, invoices] = await Promise.all([
      db.receivedInvoice.count({ where }),
      db.receivedInvoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      receivedInvoices: invoices,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    logger.error('List received invoices error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
