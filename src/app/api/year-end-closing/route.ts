import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { AccountType, AccountGroup } from '@prisma/client';
import { logger } from '@/lib/logger';
import { tenantFilter, Permission } from '@/lib/rbac';
import { assignVoucherNumberIfPosted } from '@/lib/voucher-number';
import { withGuard } from '@/lib/route-guard';

// Helper to round to 2 decimals
const r = (n: number) => Math.round(n * 100) / 100;

// Revenue account groups
const REVENUE_GROUPS: AccountGroup[] = [
  AccountGroup.SALES_REVENUE,
  AccountGroup.OTHER_REVENUE,
];

// Expense account groups
const EXPENSE_GROUPS: AccountGroup[] = [
  AccountGroup.COST_OF_GOODS,
  AccountGroup.PERSONNEL,
  AccountGroup.OTHER_OPERATING,
  AccountGroup.FINANCIAL_EXPENSE,
  AccountGroup.TAX,
];

interface AccountBalance {
  id: string;
  number: string;
  name: string;
  type: AccountType;
  group: AccountGroup;
  debit: number;
  credit: number;
  naturalBalance: number;
}

interface ClosingLine {
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: AccountType;
  debit: number;
  credit: number;
}

/**
 * GET - Generate a year-end closing preview
 */
export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.REPORTS_VIEW] },
  async (request, ctx) => {
    try {
      const { searchParams } = new URL(request.url);
      const yearParam = searchParams.get('year');

      if (!yearParam) {
        return NextResponse.json(
          { error: 'Missing required query parameter: year' },
          { status: 400 }
        );
      }

      const year = parseInt(yearParam, 10);
      if (isNaN(year) || year < 1900 || year > 2100) {
        return NextResponse.json(
          { error: 'Invalid year parameter. Must be a number between 1900 and 2100.' },
          { status: 400 }
        );
      }

      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

          const entries = await db.journalEntry.findMany({
        where: {
          ...tenantFilter(ctx),
          status: 'POSTED',
          cancelled: false,
          date: {
            gte: yearStart,
            lte: yearEnd,
          },
        },
        include: {
          lines: {
            include: {
              account: true,
            },
          },
        },
      });

      const accountMap = new Map<string, AccountBalance>();

      const allPandLAccounts = await db.account.findMany({
        where: {
          ...tenantFilter(ctx),
          type: { in: [AccountType.REVENUE, AccountType.EXPENSE] },
        },
      });

      for (const account of allPandLAccounts) {
        accountMap.set(account.id, {
          id: account.id,
          number: account.number,
          name: account.name,
          type: account.type,
          group: account.group,
          debit: 0,
          credit: 0,
          naturalBalance: 0,
        });
      }

      for (const entry of entries) {
        for (const line of entry.lines) {
          if (
            line.account.type === AccountType.REVENUE ||
            line.account.type === AccountType.EXPENSE
          ) {
            const existing = accountMap.get(line.accountId);
            if (existing) {
              existing.debit += Number(line.debit) || 0;
              existing.credit += Number(line.credit) || 0;
            } else {
              accountMap.set(line.accountId, {
                id: line.account.id,
                number: line.account.number,
                name: line.account.name,
                type: line.account.type,
                group: line.account.group,
                debit: Number(line.debit) || 0,
                credit: Number(line.credit) || 0,
                naturalBalance: 0,
              });
            }
          }
        }
      }

      const accountSummaries: AccountBalance[] = [];
      for (const [, acc] of accountMap) {
        acc.debit = r(acc.debit);
        acc.credit = r(acc.credit);

        if (acc.type === AccountType.REVENUE) {
          acc.naturalBalance = r(acc.credit - acc.debit);
        } else {
          acc.naturalBalance = r(acc.debit - acc.credit);
        }

        if (acc.naturalBalance !== 0) {
          accountSummaries.push(acc);
        }
      }

      accountSummaries.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));

      const closingLines: ClosingLine[] = [];
      let totalRevenueDebit = 0;
      let totalExpenseCredit = 0;

      for (const acc of accountSummaries) {
        if (acc.type === AccountType.REVENUE && acc.naturalBalance !== 0) {
          const amount = Math.abs(acc.naturalBalance);
          closingLines.push({
            accountId: acc.id,
            accountNumber: acc.number,
            accountName: acc.name,
            accountType: acc.type,
            debit: amount,
            credit: 0,
          });
          totalRevenueDebit += amount;
        } else if (acc.type === AccountType.EXPENSE && acc.naturalBalance !== 0) {
          const amount = Math.abs(acc.naturalBalance);
          closingLines.push({
            accountId: acc.id,
            accountNumber: acc.number,
            accountName: acc.name,
            accountType: acc.type,
            debit: 0,
            credit: amount,
          });
          totalExpenseCredit += amount;
        }
      }

      totalRevenueDebit = r(totalRevenueDebit);
      totalExpenseCredit = r(totalExpenseCredit);

      const resultAccount = await db.account.findFirst({
        where: {
          ...tenantFilter(ctx),
          number: '3300',
        },
      });

      let resultAccountLine: ClosingLine | null = null;

      if (resultAccount) {
        const netDifference = r(totalRevenueDebit - totalExpenseCredit);

        if (netDifference > 0) {
          resultAccountLine = {
            accountId: resultAccount.id,
            accountNumber: resultAccount.number,
            accountName: resultAccount.name,
            accountType: resultAccount.type,
            debit: 0,
            credit: r(netDifference),
          };
        } else if (netDifference < 0) {
          resultAccountLine = {
            accountId: resultAccount.id,
            accountNumber: resultAccount.number,
            accountName: resultAccount.name,
            accountType: resultAccount.type,
            debit: r(Math.abs(netDifference)),
            credit: 0,
          };
        }
      }

      const allClosingLines = resultAccountLine
        ? [...closingLines, resultAccountLine]
        : closingLines;

      const totalDebit = r(allClosingLines.reduce((sum, l) => sum + l.debit, 0));
      const totalCredit = r(allClosingLines.reduce((sum, l) => sum + l.credit, 0));
      const netResult = r(totalRevenueDebit - totalExpenseCredit);

      const fiscalPeriods = await db.fiscalPeriod.findMany({
        where: {
          ...tenantFilter(ctx),
          year,
        },
        orderBy: { month: 'asc' },
      });

      const allPeriodsExist = fiscalPeriods.length === 12;
      const allPeriodsClosable = fiscalPeriods.every(
        (p) => p.status === 'OPEN' || p.status === 'CLOSED'
      );
      const allPeriodsAlreadyClosed = fiscalPeriods.every(
        (p) => p.status === 'CLOSED'
      );

      const isReadyToClose =
        allPeriodsExist &&
        allPeriodsClosable &&
        !allPeriodsAlreadyClosed &&
        accountSummaries.length > 0;

      const missingMonths = allPeriodsExist
        ? []
        : Array.from({ length: 12 }, (_, i) => i + 1).filter(
            (m) => !fiscalPeriods.some((p) => p.month === m)
          );

      const openPeriods = fiscalPeriods.filter((p) => p.status === 'OPEN');
      const closedPeriods = fiscalPeriods.filter((p) => p.status === 'CLOSED');

      return NextResponse.json({
        year,
        accounts: accountSummaries,
        totalRevenue: r(accountSummaries.filter((a) => a.type === AccountType.REVENUE).reduce((sum, a) => sum + a.naturalBalance, 0)),
        totalExpenses: r(accountSummaries.filter((a) => a.type === AccountType.EXPENSE).reduce((sum, a) => sum + a.naturalBalance, 0)),
        netResult,
        closingEntry: {
          description: `Årsafslutning ${year}`,
          date: `${year}-12-31`,
          lines: allClosingLines,
          totalDebit,
          totalCredit,
          balanced: Math.abs(totalDebit - totalCredit) < 0.01,
        },
        fiscalPeriods: {
          periods: fiscalPeriods,
          openCount: openPeriods.length,
          closedCount: closedPeriods.length,
          missingMonths,
        },
        resultAccount: resultAccount
          ? {
              id: resultAccount.id,
              number: resultAccount.number,
              name: resultAccount.name,
            }
          : null,
        isReadyToClose,
        warnings: [
          ...(!allPeriodsExist
            ? [`Missing fiscal periods for months: ${missingMonths.join(', ')}`]
            : []),
          ...(!resultAccount
            ? ['Account 3300 (Årets resultat) not found. Please create it before closing.']
            : []),
          ...(allPeriodsAlreadyClosed
            ? [`All fiscal periods for ${year} are already closed.`]
            : []),
          ...(accountSummaries.length === 0
            ? [`No posted revenue or expense entries found for ${year}.`]
            : []),
        ],
      });
    } catch (error) {
      logger.error('Year-end closing preview error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

/**
 * POST - Execute the year-end closing
 */
export const POST = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.YEAR_END_CLOSE] },
  async (request, ctx) => {
    try {
      const body = await request.json();
      const { year, confirm } = body;

      if (!year || typeof year !== 'number' || year < 1900 || year > 2100) {
        return NextResponse.json(
          { error: 'A valid year (1900-2100) is required.' },
          { status: 400 }
        );
      }

      const currentYear = new Date().getFullYear();
      if (year > currentYear) {
        return NextResponse.json(
          { error: `Cannot close future year ${year}. Current year is ${currentYear}.` },
          { status: 400 }
        );
      }

      if (!confirm || confirm !== true) {
        return NextResponse.json(
          { error: 'Confirmation required. Set confirm: true to execute the year-end closing.' },
          { status: 400 }
        );
      }

          const existingPeriods = await db.fiscalPeriod.findMany({
        where: { ...tenantFilter(ctx), year },
      });

      if (existingPeriods.length !== 12) {
        const missingMonths = Array.from({ length: 12 }, (_, i) => i + 1).filter(
          (m) => !existingPeriods.some((p) => p.month === m)
        );
        return NextResponse.json(
          { error: `Cannot close year: fiscal periods are missing for months: ${missingMonths.join(', ')}` },
          { status: 400 }
        );
      }

      const allClosed = existingPeriods.every((p) => p.status === 'CLOSED');
      if (allClosed) {
        return NextResponse.json(
          { error: `Year ${year} is already closed. All fiscal periods are locked.` },
          { status: 400 }
        );
      }

      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

      const entries = await db.journalEntry.findMany({
        where: {
          ...tenantFilter(ctx),
          status: 'POSTED',
          cancelled: false,
          date: {
            gte: yearStart,
            lte: yearEnd,
          },
        },
        include: {
          lines: {
            include: {
              account: true,
            },
          },
        },
      });

      const accountMap = new Map<string, { id: string; type: AccountType; debit: number; credit: number }>();

      for (const entry of entries) {
        for (const line of entry.lines) {
          if (
            line.account.type === AccountType.REVENUE ||
            line.account.type === AccountType.EXPENSE
          ) {
            const existing = accountMap.get(line.accountId);
            if (existing) {
              existing.debit += Number(line.debit) || 0;
              existing.credit += Number(line.credit) || 0;
            } else {
              accountMap.set(line.accountId, {
                id: line.account.id,
                type: line.account.type,
                debit: Number(line.debit) || 0,
                credit: Number(line.credit) || 0,
              });
            }
          }
        }
      }

      const closingLinesData: Array<{ accountId: string; debit: number; credit: number; description: string; companyId: string }> = [];
      let totalRevenueDebit = 0;
      let totalExpenseCredit = 0;

      for (const [, acc] of accountMap) {
        if (acc.type === AccountType.REVENUE) {
          const amount = r(acc.credit - acc.debit);
          if (amount > 0) {
            closingLinesData.push({
              companyId: ctx.activeCompanyId!,
              accountId: acc.id,
              debit: amount,
              credit: 0,
              description: `Årsafslutning ${year} - lukning af indtægtskonto`,
            });
            totalRevenueDebit += amount;
          }
        } else if (acc.type === AccountType.EXPENSE) {
          const amount = r(acc.debit - acc.credit);
          if (amount > 0) {
            closingLinesData.push({
              companyId: ctx.activeCompanyId!,
              accountId: acc.id,
              debit: 0,
              credit: amount,
              description: `Årsafslutning ${year} - lukning af omkostningskonto`,
            });
            totalExpenseCredit += amount;
          }
        }
      }

      totalRevenueDebit = r(totalRevenueDebit);
      totalExpenseCredit = r(totalExpenseCredit);

      const resultAccount = await db.account.findFirst({
        where: {
          ...tenantFilter(ctx),
          number: '3300',
        },
      });

      if (!resultAccount) {
        return NextResponse.json(
          { error: 'Account 3300 (Årets resultat) not found. Please create it before closing the year.' },
          { status: 400 }
        );
      }

      const netDifference = r(totalRevenueDebit - totalExpenseCredit);

      if (netDifference > 0) {
        closingLinesData.push({
          companyId: ctx.activeCompanyId!,
          accountId: resultAccount.id,
          debit: 0,
          credit: r(netDifference),
          description: `Årsafslutning ${year} - årets resultat (profit)`,
        });
      } else if (netDifference < 0) {
        closingLinesData.push({
          companyId: ctx.activeCompanyId!,
          accountId: resultAccount.id,
          debit: r(Math.abs(netDifference)),
          credit: 0,
          description: `Årsafslutning ${year} - årets resultat (tab)`,
        });
      }

      const totalDebit = r(closingLinesData.reduce((sum, l) => sum + l.debit, 0));
      const totalCredit = r(closingLinesData.reduce((sum, l) => sum + l.credit, 0));

      if (Math.abs(totalDebit - totalCredit) > 0.005) {
        return NextResponse.json(
          { error: `Closing entry is not balanced. Total debit: ${totalDebit}, Total credit: ${totalCredit}. This should not happen.` },
          { status: 500 }
        );
      }

      if (closingLinesData.length < 2) {
        return NextResponse.json(
          { error: 'No revenue or expense entries to close for this year.' },
          { status: 400 }
        );
      }

      const closingEntry = await db.$transaction(async (tx) => {
        const je = await tx.journalEntry.create({
          data: {
            date: new Date(year, 11, 31),
            description: `Årsafslutning ${year}`,
            status: 'POSTED',
            userId: ctx.id,
            companyId: ctx.activeCompanyId!,
            lines: {
              create: closingLinesData.map(({ accountId, ...rest }) => ({
                ...rest,
                account: { connect: { id: accountId } },
              })),
            },
          },
          include: {
            lines: {
              include: {
                account: true,
              },
            },
          },
        });

        await assignVoucherNumberIfPosted(tx, je.id, ctx.activeCompanyId!, 'POSTED');

        return je;
      });

      const now = new Date();
      const lockedPeriods = await db.$transaction(
        existingPeriods.map((period) =>
          db.fiscalPeriod.update({
            where: { id: period.id },
            data: {
              status: 'CLOSED',
              lockedAt: now,
              lockedBy: ctx.id,
            },
          })
        )
      );

      await auditCreate(
        ctx.id,
        'YearEndClosing',
        closingEntry.id,
        {
          year,
          totalRevenueDebit,
          totalExpenseCredit,
          netResult: netDifference,
          totalDebit,
          totalCredit,
          lineCount: closingLinesData.length,
          periodsLocked: lockedPeriods.length,
        },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      return NextResponse.json(
        {
          journalEntry: closingEntry,
          lockedPeriods,
          message: `Year ${year} has been successfully closed. ${closingLinesData.length} accounts zeroed, 12 fiscal periods locked.`,
        },
        { status: 201 }
      );
    } catch (error) {
      logger.error('Year-end closing execute error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
