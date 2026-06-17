import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { PeriodStatus } from '@prisma/client';
import { logger } from '@/lib/logger';
import { tenantFilter, Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { notifyDataChange } from '@/lib/notify-data-change';

// GET - List fiscal periods for the authenticated user
export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  async (request, ctx) => {
    try {
      const { searchParams } = new URL(request.url);
      const yearFilter = searchParams.get('year');
      const statusFilter = searchParams.get('status');

      const where: Record<string, unknown> = { ...tenantFilter(ctx) };

      if (yearFilter) {
        const yearNum = parseInt(yearFilter, 10);
        if (!isNaN(yearNum)) {
          where.year = yearNum;
        }
      }

      if (statusFilter && Object.values(PeriodStatus).includes(statusFilter as PeriodStatus)) {
        where.status = statusFilter;
      }

      const periods = await db.fiscalPeriod.findMany({
        where,
        orderBy: [
          { year: 'desc' },
          { month: 'desc' },
        ],
      });

      return NextResponse.json({ fiscalPeriods: periods });
    } catch (error) {
      logger.error('List fiscal periods error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

// POST - Create fiscal periods for a year (12 months)
export const POST = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.PERIOD_CLOSE] },
  async (request, ctx) => {
    try {
      const body = await request.json();
      const { year } = body;

      if (!year || typeof year !== 'number' || year < 1900 || year > 2100) {
        return NextResponse.json(
          { error: 'A valid year (1900-2100) is required' },
          { status: 400 }
        );
      }

      
      // Check if periods already exist for this year
      const existing = await db.fiscalPeriod.findMany({
        where: { ...tenantFilter(ctx), year },
      });

      if (existing.length > 0) {
        return NextResponse.json({
          fiscalPeriods: existing,
          message: `Fiscal periods for ${year} already exist`,
        });
      }

      // Create 12 monthly periods
      await db.fiscalPeriod.createMany({
        data: Array.from({ length: 12 }, (_, i) => ({
          year,
          month: i + 1,
          status: 'OPEN',
          userId: ctx.id,
          companyId: ctx.activeCompanyId!,
        })),
      });

      // Fetch all created periods
      const createdPeriods = await db.fiscalPeriod.findMany({
        where: { ...tenantFilter(ctx), year },
        orderBy: { month: 'asc' },
      });

      await auditCreate(
        ctx.id,
        'FiscalPeriod',
        `year-${year}`,
        { year, periodsCreated: 12, periodIds: createdPeriods.map(p => p.id) },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      notifyDataChange({ scope: 'fiscal-periods', companyId: ctx.activeCompanyId!, action: 'create' }).catch(() => {});

      return NextResponse.json({ fiscalPeriods: createdPeriods }, { status: 201 });
    } catch (error) {
      logger.error('Create fiscal periods error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
