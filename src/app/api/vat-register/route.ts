import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { tenantFilter, Permission } from '@/lib/rbac';
import { computeVATRegister } from '@/lib/vat-utils';
import { withGuard } from '@/lib/route-guard';
import { db } from '@/lib/db';

// GET - VAT Register (Momsopgørelse)
// Single source of truth for VAT totals — all consumers must use this endpoint
// or call computeVATRegister() directly for server-side aggregation.
export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.REPORTS_VIEW] },
  async (request, ctx) => {
    try {
      const { searchParams } = new URL(request.url);
      const fromStr = searchParams.get('from');
      const toStr = searchParams.get('to');

      if (!fromStr || !toStr) {
        return NextResponse.json(
          { error: 'Missing required query parameters: from and to (dates in YYYY-MM-DD format)' },
          { status: 400 }
        );
      }

      const fromDate = new Date(fromStr);
      const toDate = new Date(toStr);
      toDate.setHours(23, 59, 59, 999);

      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date format. Use YYYY-MM-DD.' },
          { status: 400 }
        );
      }

      if (fromDate > toDate) {
        return NextResponse.json(
          { error: 'from date must be before to date' },
          { status: 400 }
        );
      }

      // ─── Delegate to the shared single-source-of-truth function ───
      const vatResult = await computeVATRegister({
        ...tenantFilter(ctx),
        status: 'POSTED',
        cancelled: false,
        date: { gte: fromDate, lte: toDate },
      });

      // Also return raw entries for detailed inspection (tables, drill-down)
      const entries = await db.journalEntry.findMany({
        where: {
          ...tenantFilter(ctx),
          status: 'POSTED',
          cancelled: false,
          date: { gte: fromDate, lte: toDate },
        },
        include: { lines: { include: { account: true } } },
        orderBy: { date: 'desc' },
      });

      return NextResponse.json({
        period: {
          from: fromStr,
          to: toStr,
        },
        ...vatResult,
        entries,
      });
    } catch (error) {
      logger.error('VAT register error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
