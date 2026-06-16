import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { AccountType } from '@prisma/client';
import { logger } from '@/lib/logger';
import { tenantFilter, Permission, type AuthContext } from '@/lib/rbac';
import { withGuard, READ, MUTATE } from '@/lib/route-guard';

// Helper to round to 2 decimals
const r = (n: number) => Math.round(n * 100) / 100;

// Month names for budget entry fields
const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
] as const;

type MonthKey = typeof MONTHS[number];

// ─── GET - Get budget entries with actuals per account per month ───

export const GET = withGuard(
  { ...READ, permissions: [Permission.DATA_READ] },
  async (request, ctx, context) => {
    try {
      const { id } = await context.params as { id: string };
      const { searchParams } = new URL(request.url);
      const yearParam = searchParams.get('year');
      const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

      // Find project with tenant filter
      const project = await db.project.findFirst({
        where: { id, ...tenantFilter(ctx) },
        include: {
          budgetEntries: {
            include: {
              account: true,
            },
          },
        },
      });

      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      // Gather all account IDs from budget entries
      const accountIds = project.budgetEntries.map((e) => e.accountId);

      // Compute actuals for this project
      const actualsMap = await computeProjectActuals(ctx, id, accountIds, year);

      // Build entries with budget, actual, variance
      const entries = project.budgetEntries.map((entry) => {
        const actuals = actualsMap.get(entry.accountId) || createEmptyMonthlyAmounts();

        const budgetAmounts: Record<string, number> = {};
        const actualAmounts: Record<string, number> = {};
        const varianceAmounts: Record<string, number> = {};

        let totalBudget = 0;
        let totalActual = 0;

        for (const month of MONTHS) {
          const b = r(Number(entry[month] || 0));
          const a = r(actuals[month] || 0);
          const v = r(a - b);

          budgetAmounts[month] = b;
          actualAmounts[month] = a;
          varianceAmounts[month] = v;

          totalBudget += b;
          totalActual += a;
        }

        return {
          id: entry.id,
          accountId: entry.accountId,
          accountNumber: entry.account.number,
          accountName: entry.account.name,
          accountType: entry.account.type,
          accountGroup: entry.account.group,
          budget: budgetAmounts,
          actual: actualAmounts,
          variance: varianceAmounts,
          totalBudget: r(totalBudget),
          totalActual: r(totalActual),
          totalVariance: r(totalActual - totalBudget),
        };
      });

      // Build summary
      const summary = buildSummary(entries);

      return NextResponse.json({ entries, summary });
    } catch (error) {
      logger.error('Project budget GET error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);

// ─── PUT - Batch upsert budget entries ─────────────────────────────

export const PUT = withGuard(
  { ...MUTATE, permissions: [Permission.DATA_EDIT] },
  async (request, ctx, context) => {
    try {
      const { id } = await context.params as { id: string };
      const body = await request.json();
      const { entries } = body;

      // Validate entries array
      if (!entries || !Array.isArray(entries) || entries.length === 0) {
        return NextResponse.json(
          { error: 'Missing or empty entries array' },
          { status: 400 }
        );
      }

      // Find project with tenant filter
      const project = await db.project.findFirst({
        where: { id, ...tenantFilter(ctx) },
      });

      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      // Validate account IDs exist and belong to tenant
      const accountIds = entries.map((e: { accountId: string }) => e.accountId).filter((aid: string) => Boolean(aid));
      if (accountIds.length > 0) {
        const accounts = await db.account.findMany({
          where: {
            id: { in: accountIds },
            ...tenantFilter(ctx),
          },
        });

        if (accounts.length !== new Set(accountIds).size) {
          const foundIds = new Set(accounts.map((a) => a.id));
          const missingIds = accountIds.filter((aid: string) => !foundIds.has(aid));
          return NextResponse.json(
            { error: `Invalid account IDs: ${missingIds.join(', ')}` },
            { status: 400 }
          );
        }
      }

      // Upsert each entry by projectId+accountId unique constraint
      const upsertedEntries: Array<Record<string, unknown>> = [];

      for (const entry of entries) {
        if (!entry.accountId) {
          return NextResponse.json(
            { error: 'Each entry must have an accountId' },
            { status: 400 }
          );
        }

        const entryData: Record<string, number> = {};
        for (const month of MONTHS) {
          if (typeof entry[month] === 'number') {
            entryData[month] = entry[month];
          }
        }

        const upserted = await db.projectBudgetEntry.upsert({
          where: {
            projectId_accountId: {
              projectId: id,
              accountId: entry.accountId,
            },
          },
          update: {
            ...entryData,
          },
          create: {
            projectId: id,
            companyId: ctx.activeCompanyId!,
            accountId: entry.accountId,
            january: entryData.january || 0,
            february: entryData.february || 0,
            march: entryData.march || 0,
            april: entryData.april || 0,
            may: entryData.may || 0,
            june: entryData.june || 0,
            july: entryData.july || 0,
            august: entryData.august || 0,
            september: entryData.september || 0,
            october: entryData.october || 0,
            november: entryData.november || 0,
            december: entryData.december || 0,
          },
          include: {
            account: true,
          },
        });

        upsertedEntries.push({
          id: upserted.id,
          accountId: upserted.accountId,
          accountNumber: upserted.account.number,
          accountName: upserted.account.name,
          accountType: upserted.account.type,
          accountGroup: upserted.account.group,
        });
      }

      return NextResponse.json({ entries: upsertedEntries });
    } catch (error) {
      logger.error('Project budget PUT error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);

// ─── Helper: Compute actual amounts for accounts by month (project-scoped) ──

async function computeProjectActuals(
  ctx: AuthContext,
  projectId: string,
  accountIds: string[],
  year: number
): Promise<Map<string, Record<MonthKey, number>>> {
  const result = new Map<string, Record<MonthKey, number>>();

  if (accountIds.length === 0) return result;

  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

  // Fetch account types for natural balance calculation
  const accounts = await db.account.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, type: true },
  });
  const accountTypeMap = new Map(accounts.map((a) => [a.id, a.type]));

  // Fetch journal entry lines that reference our accounts AND this project
  const lines = await db.journalEntryLine.findMany({
    where: {
      accountId: { in: accountIds },
      projectId,
      journalEntry: {
        ...tenantFilter(ctx),
        status: 'POSTED',
        cancelled: false,
        date: {
          gte: yearStart,
          lte: yearEnd,
        },
      },
    },
    include: {
      journalEntry: {
        select: { date: true },
      },
    },
  });

  // Initialize result map with empty monthly amounts
  for (const accountId of accountIds) {
    result.set(accountId, createEmptyMonthlyAmounts());
  }

  // Aggregate actual amounts by account and month
  for (const line of lines) {
    const monthIndex = line.journalEntry.date.getMonth(); // 0-11
    const monthKey = MONTHS[monthIndex];
    const accountType = accountTypeMap.get(line.accountId);

    const current = result.get(line.accountId);
    if (!current) continue;

    // Compute actual based on account type
    let actual = 0;
    if (accountType === AccountType.REVENUE) {
      actual = Number(line.credit || 0) - Number(line.debit || 0);
    } else if (accountType === AccountType.EXPENSE) {
      actual = Number(line.debit || 0) - Number(line.credit || 0);
    } else if (accountType === AccountType.ASSET) {
      actual = Number(line.debit || 0) - Number(line.credit || 0);
    } else if (accountType === AccountType.LIABILITY) {
      actual = Number(line.credit || 0) - Number(line.debit || 0);
    } else if (accountType === AccountType.EQUITY) {
      actual = Number(line.credit || 0) - Number(line.debit || 0);
    }

    current[monthKey] = r((current[monthKey] || 0) + actual);
  }

  return result;
}

// ─── Helper: Create empty monthly amounts object ───────────────────

function createEmptyMonthlyAmounts(): Record<MonthKey, number> {
  const amounts: Record<string, number> = {};
  for (const month of MONTHS) {
    amounts[month] = 0;
  }
  return amounts as Record<MonthKey, number>;
}

// ─── Helper: Build summary from entries ────────────────────────────

function buildSummary(
  entries: Array<{
    accountType: string;
    totalBudget: number;
    totalActual: number;
    totalVariance: number;
  }>
) {
  let totalBudget = 0;
  let totalActual = 0;

  const byType: Record<string, { budget: number; actual: number; variance: number }> = {
    REVENUE: { budget: 0, actual: 0, variance: 0 },
    EXPENSE: { budget: 0, actual: 0, variance: 0 },
    ASSET: { budget: 0, actual: 0, variance: 0 },
    LIABILITY: { budget: 0, actual: 0, variance: 0 },
    EQUITY: { budget: 0, actual: 0, variance: 0 },
  };

  for (const entry of entries) {
    totalBudget += entry.totalBudget;
    totalActual += entry.totalActual;

    if (byType[entry.accountType]) {
      byType[entry.accountType].budget += entry.totalBudget;
      byType[entry.accountType].actual += entry.totalActual;
      byType[entry.accountType].variance += entry.totalVariance;
    }
  }

  // Round summary values
  totalBudget = r(totalBudget);
  totalActual = r(totalActual);

  for (const type of Object.keys(byType)) {
    byType[type].budget = r(byType[type].budget);
    byType[type].actual = r(byType[type].actual);
    byType[type].variance = r(byType[type].variance);
  }

  return {
    totalBudget,
    totalActual,
    totalVariance: r(totalActual - totalBudget),
    byType,
  };
}
