import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { tenantFilter, Permission } from '@/lib/rbac';
import { withGuard, READ } from '@/lib/route-guard';

// Helper to round to 2 decimals
const r = (n: number) => Math.round(n * 100) / 100;

// ─── GET - Project-specific P&L report ─────────────────────────────

export const GET = withGuard(
  { ...READ, permissions: [Permission.REPORTS_VIEW] },
  async (request, ctx, context) => {
    try {
      const { id } = await context.params as { id: string };
      const { searchParams } = new URL(request.url);

      // Find project with tenant filter
      const project = await db.project.findFirst({
        where: { id, ...tenantFilter(ctx) },
        select: { id: true, name: true, code: true, status: true },
      });

      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      // Parse date filters
      const yearParam = searchParams.get('year');
      const fromParam = searchParams.get('from');
      const toParam = searchParams.get('to');

      let from: Date;
      let to: Date;

      if (fromParam && toParam) {
        from = new Date(fromParam);
        to = new Date(toParam);
      } else if (yearParam) {
        const year = parseInt(yearParam, 10);
        if (isNaN(year) || year < 2020 || year > 2030) {
          return NextResponse.json(
            { error: 'Invalid year. Must be between 2020 and 2030.' },
            { status: 400 }
          );
        }
        from = new Date(year, 0, 1);
        to = new Date(year, 11, 31, 23, 59, 59, 999);
      } else {
        // Default: current year
        const now = new Date();
        from = new Date(now.getFullYear(), 0, 1);
        to = now;
      }

      // Fetch accounts for this tenant (revenue & expense only for P&L)
      const accounts = await db.account.findMany({
        where: {
          ...tenantFilter(ctx),
          type: { in: ['REVENUE', 'EXPENSE'] },
        },
        select: { id: true, number: true, name: true, type: true, group: true },
        orderBy: { number: 'asc' },
      });

      const accountIds = accounts.map((a) => a.id);
      if (accountIds.length === 0) {
        return NextResponse.json({
          report: {
            projectId: project.id,
            projectName: project.name,
            accountGroups: [],
            totalRevenue: 0,
            totalExpenses: 0,
            projectResult: 0,
          },
        });
      }

      // Fetch posted journal entry lines for this project
      const lines = await db.journalEntryLine.findMany({
        where: {
          accountId: { in: accountIds },
          projectId: id,
          journalEntry: {
            ...tenantFilter(ctx),
            status: 'POSTED',
            cancelled: false,
            date: { gte: from, lte: to },
          },
        },
        include: {
          journalEntry: { select: { date: true } },
          account: { select: { type: true, group: true, number: true, name: true } },
        },
      });

      // Aggregate by account group
      const groupMap = new Map<string, {
        name: string;
        type: string;
        accounts: Array<{ id: string; number: string; name: string; amount: number }>;
        total: number;
      }>();

      for (const line of lines) {
        const account = accounts.find((a) => a.id === line.accountId);
        if (!account) continue;

        let amount = 0;
        if (account.type === 'REVENUE') {
          amount = (Number(line.credit) || 0) - (Number(line.debit) || 0);
        } else if (account.type === 'EXPENSE') {
          amount = (Number(line.debit) || 0) - (Number(line.credit) || 0);
        }

        const groupName = account.group || account.type;
        const existing = groupMap.get(groupName);

        if (existing) {
          existing.total = r(existing.total + amount);

          // Add to account detail
          const existingAccount = existing.accounts.find((a) => a.id === account.id);
          if (existingAccount) {
            existingAccount.amount = r(existingAccount.amount + amount);
          } else {
            existing.accounts.push({
              id: account.id,
              number: account.number,
              name: account.name,
              amount: r(amount),
            });
          }
        } else {
          groupMap.set(groupName, {
            name: groupName,
            type: account.type,
            accounts: [{
              id: account.id,
              number: account.number,
              name: account.name,
              amount: r(amount),
            }],
            total: r(amount),
          });
        }
      }

      // Build account groups sorted by type (revenue first) then by total descending
      const accountGroups = Array.from(groupMap.values())
        .sort((a, b) => {
          if (a.type === 'REVENUE' && b.type !== 'REVENUE') return -1;
          if (a.type !== 'REVENUE' && b.type === 'REVENUE') return 1;
          return b.total - a.total;
        });

      // Calculate totals
      const totalRevenue = r(
        Array.from(groupMap.values())
          .filter((g) => g.type === 'REVENUE')
          .reduce((sum, g) => sum + g.total, 0)
      );
      const totalExpenses = r(
        Array.from(groupMap.values())
          .filter((g) => g.type === 'EXPENSE')
          .reduce((sum, g) => sum + g.total, 0)
      );
      const projectResult = r(totalRevenue - totalExpenses);

      return NextResponse.json({
        report: {
          projectId: project.id,
          projectName: project.name,
          projectCode: project.code,
          projectStatus: project.status,
          from: from.toISOString(),
          to: to.toISOString(),
          accountGroups,
          totalRevenue,
          totalExpenses,
          projectResult,
        },
      });
    } catch (error) {
      logger.error('Project report GET error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
