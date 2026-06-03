/**
 * Annual Report CSV Generator — Regnskab Basis (SKAT format)
 *
 * Generates a Danish annual report CSV containing:
 *   1. Resultatopgørelse (Income Statement)
 *   2. Balance (Balance Sheet)
 *   3. Statusopgørelse (Statement of Changes in Equity)
 *
 * Data source: Posted, non-cancelled journal entries for a given year.
 * Aggregated by AccountGroup into the standard Danish financial statement
 * structure required by SKAT for Regnskab Basis.
 *
 * Exports: generateAnnualReportCSV(companyId, year) → CSV string
 */

import { db } from '@/lib/db';
import { AccountGroup, AccountType } from '@prisma/client';
import { computeVATRegister } from '@/lib/vat-utils';

// ─── Rounding helper ─────────────────────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100;

// ─── Types ────────────────────────────────────────────────────────────────

interface AccountAggregate {
  number: string;
  name: string;
  type: AccountType;
  group: AccountGroup;
  debit: number;
  credit: number;
  netBalance: number;
}

interface IncomeStatement {
  netRevenue: number;          // Omsætning (I + II)
  costOfGoodsSold: number;    // Vareforbrug (A)
  grossProfit: number;        // Bruttofortjeneste (I + II - A)
  operatingExpenses: number;   // Driftsudgifter (B+C+D+E+F)
  financialIncome: number;     // Finansielle indtægter
  financialExpenses: number;  // Finansielle omkostninger
  netFinancialItems: number;  // Netto finansielle poster
  netResult: number;          // Årets resultat
  details: {
    salesRevenue: number;
    otherRevenue: number;
    costOfGoods: number;
    personnel: number;
    otherOperating: number;
    financialIncomeAmount: number;
    financialExpenseAmount: number;
    tax: number;
  };
}

interface BalanceSheet {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  details: {
    cash: number;
    bank: number;
    receivables: number;
    inventory: number;
    fixedAssets: number;
    otherAssets: number;
    payables: number;
    shortTermDebt: number;
    longTermDebt: number;
    otherLiabilities: number;
    shareCapital: number;
    retainedEarnings: number;
  };
}

interface EquityStatement {
  openingEquity: number;
  netResult: number;
  drawings: number;
  closingEquity: number;
}

// ─── Account Group Classifications ────────────────────────────────────────

const REVENUE_GROUPS: AccountGroup[] = [
  AccountGroup.SALES_REVENUE,
  AccountGroup.OTHER_REVENUE,
];

const COGS_GROUPS: AccountGroup[] = [
  AccountGroup.COST_OF_GOODS,
];

const OPERATING_EXPENSE_GROUPS: AccountGroup[] = [
  AccountGroup.PERSONNEL,
  AccountGroup.OTHER_OPERATING,
  AccountGroup.TAX,
];

const FINANCIAL_INCOME_GROUPS: AccountGroup[] = [
  AccountGroup.FINANCIAL_INCOME,
];

const FINANCIAL_EXPENSE_GROUPS: AccountGroup[] = [
  AccountGroup.FINANCIAL_EXPENSE,
];

const ASSET_GROUPS: AccountGroup[] = [
  AccountGroup.CASH,
  AccountGroup.BANK,
  AccountGroup.RECEIVABLES,
  AccountGroup.INVENTORY,
  AccountGroup.FIXED_ASSETS,
  AccountGroup.OTHER_ASSETS,
];

const LIABILITY_GROUPS: AccountGroup[] = [
  AccountGroup.PAYABLES,
  AccountGroup.SHORT_TERM_DEBT,
  AccountGroup.LONG_TERM_DEBT,
  AccountGroup.OTHER_LIABILITIES,
];

const EQUITY_GROUPS: AccountGroup[] = [
  AccountGroup.SHARE_CAPITAL,
  AccountGroup.RETAINED_EARNINGS,
];

// ─── Danish labels for account groups ──────────────────────────────────────

const GROUP_LABELS_DA: Record<string, string> = {
  SALES_REVENUE: 'Salgsindtægter (I)',
  OTHER_REVENUE: 'Øvrige indtægter (II)',
  COST_OF_GOODS: 'Vareforbrug (A)',
  PERSONNEL: 'Lønomkostninger (B)',
  OTHER_OPERATING: 'Øvrige driftsomkostninger (C-F)',
  FINANCIAL_INCOME: 'Finansielle indtægter',
  FINANCIAL_EXPENSE: 'Finansielle omkostninger',
  TAX: 'Skat',
  CASH: 'Likvide beholdninger',
  BANK: 'Bank',
  RECEIVABLES: 'Tilgodehavender',
  INVENTORY: 'Varelager',
  FIXED_ASSETS: 'Anlægsaktiver',
  OTHER_ASSETS: 'Øvrige aktiver',
  PAYABLES: 'Kreditorer',
  SHORT_TERM_DEBT: 'Kortfristet gæld',
  LONG_TERM_DEBT: 'Langfristet gæld',
  OTHER_LIABILITIES: 'Øvrige forpligtelser',
  SHARE_CAPITAL: 'Egenkapital indbetalt',
  RETAINED_EARNINGS: 'Vindinger fra tidligere år',
};

// ─── Core: Generate Annual Report CSV ──────────────────────────────────────

/**
 * Generate a complete annual report CSV for a company for a given year.
 *
 * The CSV contains three sections:
 *   1. Resultatopgørelse (Income Statement)
 *   2. Balance (Balance Sheet)
 *   3. Statusopgørelse (Statement of Changes in Equity)
 *
 * @param companyId - The company's database ID
 * @param year - The fiscal year (e.g., 2026)
 * @returns CSV string with Danish headers and DKK amounts
 */
export async function generateAnnualReportCSV(
  companyId: string,
  year: number,
): Promise<string> {
  // Date range for the fiscal year
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

  // Fetch all posted, non-cancelled journal entries for the year
  const entries = await db.journalEntry.findMany({
    where: {
      companyId,
      status: 'POSTED',
      cancelled: false,
      date: { gte: yearStart, lte: yearEnd },
    },
    include: {
      lines: {
        include: { account: true },
      },
    },
    orderBy: { date: 'asc' },
  });

  // Aggregate by account
  const accountMap = new Map<string, AccountAggregate>();

  for (const entry of entries) {
    for (const line of entry.lines) {
      const accountId = line.accountId;
      const existing = accountMap.get(accountId) || {
        number: line.account.number,
        name: line.account.name,
        type: line.account.type,
        group: line.account.group,
        debit: 0,
        credit: 0,
        netBalance: 0,
      };

      existing.debit += Number(line.debit) || 0;
      existing.credit += Number(line.credit) || 0;
      accountMap.set(accountId, existing);
    }
  }

  // Calculate net balance for each account
  for (const acc of accountMap.values()) {
    acc.debit = r2(acc.debit);
    acc.credit = r2(acc.credit);

    if (acc.type === AccountType.REVENUE || acc.type === AccountType.EQUITY || acc.type === AccountType.LIABILITY) {
      acc.netBalance = r2(acc.credit - acc.debit);
    } else {
      // ASSET, EXPENSE
      acc.netBalance = r2(acc.debit - acc.credit);
    }
  }

  // Also compute VAT register for reference
  const vatRegister = await computeVATRegister({
    companyId,
    status: 'POSTED',
    cancelled: false,
    date: { gte: yearStart, lte: yearEnd },
  });

  // Build income statement
  const incomeStatement = buildIncomeStatement(accountMap);

  // Build balance sheet — for balance sheet accounts, we need ALL-TIME posted entries
  // (not just the current year), because balance sheet is cumulative
  const allTimeEntries = await db.journalEntry.findMany({
    where: {
      companyId,
      status: 'POSTED',
      cancelled: false,
      date: { lte: yearEnd },
    },
    include: {
      lines: {
        include: { account: true },
      },
    },
  });

  const allTimeAccountMap = new Map<string, AccountAggregate>();

  for (const entry of allTimeEntries) {
    for (const line of entry.lines) {
      const accountId = line.accountId;
      const existing = allTimeAccountMap.get(accountId) || {
        number: line.account.number,
        name: line.account.name,
        type: line.account.type,
        group: line.account.group,
        debit: 0,
        credit: 0,
        netBalance: 0,
      };

      existing.debit += Number(line.debit) || 0;
      existing.credit += Number(line.credit) || 0;
      allTimeAccountMap.set(accountId, existing);
    }
  }

  // Calculate net balance for all-time accounts
  for (const acc of allTimeAccountMap.values()) {
    acc.debit = r2(acc.debit);
    acc.credit = r2(acc.credit);

    if (acc.type === AccountType.REVENUE || acc.type === AccountType.EQUITY || acc.type === AccountType.LIABILITY) {
      acc.netBalance = r2(acc.credit - acc.debit);
    } else {
      acc.netBalance = r2(acc.debit - acc.credit);
    }
  }

  const balanceSheet = buildBalanceSheet(allTimeAccountMap);

  // Build equity statement
  const equityStatement = buildEquityStatement(
    balanceSheet,
    incomeStatement,
  );

  // Also fetch previous year closing equity for opening balance
  const prevYearStart = new Date(year - 1, 0, 1);
  const prevYearEnd = new Date(year - 1, 11, 31, 23, 59, 59, 999);

  const prevYearEntries = await db.journalEntry.findMany({
    where: {
      companyId,
      status: 'POSTED',
      cancelled: false,
      date: { lte: prevYearEnd },
    },
    include: {
      lines: {
        include: { account: true },
      },
    },
  });

  const prevYearMap = new Map<string, AccountAggregate>();

  for (const entry of prevYearEntries) {
    for (const line of entry.lines) {
      const accountId = line.accountId;
      const existing = prevYearMap.get(accountId) || {
        number: line.account.number,
        name: line.account.name,
        type: line.account.type,
        group: line.account.group,
        debit: 0,
        credit: 0,
        netBalance: 0,
      };

      existing.debit += Number(line.debit) || 0;
      existing.credit += Number(line.credit) || 0;
      prevYearMap.set(accountId, existing);
    }
  }

  for (const acc of prevYearMap.values()) {
    acc.debit = r2(acc.debit);
    acc.credit = r2(acc.credit);
    if (acc.type === AccountType.REVENUE || acc.type === AccountType.EQUITY || acc.type === AccountType.LIABILITY) {
      acc.netBalance = r2(acc.credit - acc.debit);
    } else {
      acc.netBalance = r2(acc.debit - acc.credit);
    }
  }

  const prevBalanceSheet = buildBalanceSheet(prevYearMap);
  const openingEquity = r2(prevBalanceSheet.totalEquity - incomeStatement.netResult);
  equityStatement.openingEquity = openingEquity;
  equityStatement.closingEquity = r2(openingEquity + equityStatement.netResult + equityStatement.drawings);

  // ── Build CSV ──
  const lines: string[] = [];
  const BOM = '\uFEFF'; // UTF-8 BOM for Danish characters in Excel

  lines.push(BOM);
  lines.push(`Regnskab Basis — Årsregnskab ${year}`);
  lines.push(`Genereret: ${new Date().toISOString().split('T')[0]}`);
  lines.push('');

  // ── Section 1: Resultatopgørelse ──
  lines.push('RESULTATOPGØRELSE (Indkomstopgørelse)');
  lines.push('');

  lines.push('I  Nettoomsætning');
  lines.push(`II Øvrige indtægter;${fmt(incomeStatement.details.otherRevenue)}`);
  lines.push(`   Samlet omsætning (I+II);${fmt(incomeStatement.details.salesRevenue + incomeStatement.details.otherRevenue)}`);
  lines.push('');

  lines.push('A  Vareforbrug');
  lines.push(`   Vareforbrug total;${fmt(incomeStatement.details.costOfGoods)}`);
  lines.push('');

  lines.push(`Bruttofortjeneste (I+II-A);${fmt(incomeStatement.grossProfit)}`);
  lines.push('');

  lines.push('Driftsudgifter:');
  lines.push(`B  Lønninger;${fmt(incomeStatement.details.personnel)}`);
  lines.push(`C-F Øvrige driftsomkostninger;${fmt(incomeStatement.details.otherOperating)}`);
  lines.push(`   Driftsudgifter total (B+C-F);${fmt(incomeStatement.operatingExpenses)}`);
  lines.push('');

  lines.push(`Driftsresultat (Bruttofortjeneste - Driftsudgifter);${fmt(r2(incomeStatement.grossProfit - incomeStatement.operatingExpenses))}`);
  lines.push('');

  lines.push(`Finansielle indtægter;${fmt(incomeStatement.details.financialIncomeAmount)}`);
  lines.push(`Finansielle omkostninger;${fmt(incomeStatement.details.financialExpenseAmount)}`);
  lines.push(`Netto finansielle poster;${fmt(incomeStatement.netFinancialItems)}`);
  lines.push('');

  lines.push(`Årets resultat før skat;${fmt(r2(incomeStatement.netResult + incomeStatement.details.tax))}`);
  lines.push(`Skat af årets resultat;${fmt(incomeStatement.details.tax)}`);
  lines.push(`Årets resultat;${fmt(incomeStatement.netResult)}`);
  lines.push('');

  // VAT info
  lines.push(`Momsoplysninger (udgående);${fmt(vatRegister.totalOutputVAT)}`);
  lines.push(`Momsoplysninger (indgående);${fmt(vatRegister.totalInputVAT)}`);
  lines.push(`Netto moms til betaling;${fmt(vatRegister.netVATPayable)}`);
  lines.push('');

  // ── Section 2: Balance ──
  lines.push('BALANCE (Balanceopgørelse)');
  lines.push('');

  lines.push('AKTIVER');
  lines.push(`Likvide beholdninger;${fmt(balanceSheet.details.cash)}`);
  lines.push(`Bank;${fmt(balanceSheet.details.bank)}`);
  lines.push(`Tilgodehavender;${fmt(balanceSheet.details.receivables)}`);
  lines.push(`Varelager;${fmt(balanceSheet.details.inventory)}`);
  lines.push(`Anlægsaktiver;${fmt(balanceSheet.details.fixedAssets)}`);
  lines.push(`Øvrige aktiver;${fmt(balanceSheet.details.otherAssets)}`);
  lines.push(`I ALT AKTIVER;${fmt(balanceSheet.totalAssets)}`);
  lines.push('');

  lines.push('GÆLD OG EGENKAPITAL');
  lines.push(`Kreditorer;${fmt(balanceSheet.details.payables)}`);
  lines.push(`Kortfristet gæld;${fmt(balanceSheet.details.shortTermDebt)}`);
  lines.push(`Langfristet gæld;${fmt(balanceSheet.details.longTermDebt)}`);
  lines.push(`Øvrige forpligtelser;${fmt(balanceSheet.details.otherLiabilities)}`);
  lines.push(`I ALT GÆLD;${fmt(balanceSheet.totalLiabilities)}`);
  lines.push('');
  lines.push(`Egenkapital indbetalt;${fmt(balanceSheet.details.shareCapital)}`);
  lines.push(`Vindinger fra tidligere år;${fmt(balanceSheet.details.retainedEarnings)}`);
  lines.push(`I ALT EGENKAPITAL;${fmt(balanceSheet.totalEquity)}`);
  lines.push('');
  lines.push(`I ALT GÆLD OG EGENKAPITAL;${fmt(r2(balanceSheet.totalLiabilities + balanceSheet.totalEquity))}`);
  lines.push('');

  // ── Section 3: Statusopgørelse ──
  lines.push('STATUSOPGØRELSE (Ændringer i egenkapital)');
  lines.push('');
  lines.push(`Egenkapital pr. 1. januar ${year};${fmt(equityStatement.openingEquity)}`);
  lines.push(`Årets resultat;${fmt(equityStatement.netResult)}`);
  lines.push(`Private hævninger/udlodninger;${fmt(equityStatement.drawings)}`);
  lines.push(`Egenkapital pr. 31. december ${year};${fmt(equityStatement.closingEquity)}`);
  lines.push('');

  // Footer
  lines.push('Genereret af AlphaFlow — Regnskab Basis (SKAT format)');
  lines.push(`CVR: (se virksomhedsoplysninger)`);

  return lines.join('\n');
}

// ─── Helper functions ─────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

function buildIncomeStatement(accountMap: Map<string, AccountAggregate>): IncomeStatement {
  let salesRevenue = 0;
  let otherRevenue = 0;
  let costOfGoods = 0;
  let personnel = 0;
  let otherOperating = 0;
  let tax = 0;
  let financialIncomeAmount = 0;
  let financialExpenseAmount = 0;

  for (const acc of accountMap.values()) {
    const net = acc.netBalance;

    switch (acc.group) {
      case AccountGroup.SALES_REVENUE:
        salesRevenue += net;
        break;
      case AccountGroup.OTHER_REVENUE:
        otherRevenue += net;
        break;
      case AccountGroup.COST_OF_GOODS:
        costOfGoods += net;
        break;
      case AccountGroup.PERSONNEL:
        personnel += net;
        break;
      case AccountGroup.OTHER_OPERATING:
        otherOperating += net;
        break;
      case AccountGroup.TAX:
        tax += net;
        break;
      case AccountGroup.FINANCIAL_INCOME:
        financialIncomeAmount += net;
        break;
      case AccountGroup.FINANCIAL_EXPENSE:
        financialExpenseAmount += net;
        break;
      default:
        break;
    }
  }

  // All expenses are debit-nature, so they are positive in netBalance
  // For the income statement, expenses reduce profit
  const netRevenue = r2(salesRevenue + otherRevenue);
  const totalCostOfGoods = r2(costOfGoods);
  const grossProfit = r2(netRevenue - totalCostOfGoods);
  const operatingExpenses = r2(personnel + otherOperating + tax);
  const netFinancialItems = r2(financialIncomeAmount - financialExpenseAmount);
  const netResult = r2(grossProfit - operatingExpenses + netFinancialItems);

  return {
    netRevenue,
    costOfGoodsSold: totalCostOfGoods,
    grossProfit,
    operatingExpenses,
    financialIncome: financialIncomeAmount,
    financialExpenses: financialExpenseAmount,
    netFinancialItems,
    netResult,
    details: {
      salesRevenue: r2(salesRevenue),
      otherRevenue: r2(otherRevenue),
      costOfGoods: r2(costOfGoods),
      personnel: r2(personnel),
      otherOperating: r2(otherOperating),
      financialIncomeAmount: r2(financialIncomeAmount),
      financialExpenseAmount: r2(financialExpenseAmount),
      tax: r2(tax),
    },
  };
}

function buildBalanceSheet(accountMap: Map<string, AccountAggregate>): BalanceSheet {
  let cash = 0;
  let bank = 0;
  let receivables = 0;
  let inventory = 0;
  let fixedAssets = 0;
  let otherAssets = 0;
  let payables = 0;
  let shortTermDebt = 0;
  let longTermDebt = 0;
  let otherLiabilities = 0;
  let shareCapital = 0;
  let retainedEarnings = 0;

  for (const acc of accountMap.values()) {
    const net = acc.netBalance;

    switch (acc.group) {
      case AccountGroup.CASH:
        cash += net;
        break;
      case AccountGroup.BANK:
        bank += net;
        break;
      case AccountGroup.RECEIVABLES:
        receivables += net;
        break;
      case AccountGroup.INVENTORY:
        inventory += net;
        break;
      case AccountGroup.FIXED_ASSETS:
        fixedAssets += net;
        break;
      case AccountGroup.OTHER_ASSETS:
        otherAssets += net;
        break;
      case AccountGroup.PAYABLES:
        payables += net;
        break;
      case AccountGroup.SHORT_TERM_DEBT:
        shortTermDebt += net;
        break;
      case AccountGroup.LONG_TERM_DEBT:
        longTermDebt += net;
        break;
      case AccountGroup.OTHER_LIABILITIES:
        otherLiabilities += net;
        break;
      case AccountGroup.SHARE_CAPITAL:
        shareCapital += net;
        break;
      case AccountGroup.RETAINED_EARNINGS:
        retainedEarnings += net;
        break;
      default:
        break;
    }
  }

  const totalAssets = r2(cash + bank + receivables + inventory + fixedAssets + otherAssets);
  const totalLiabilities = r2(payables + shortTermDebt + longTermDebt + otherLiabilities);
  const totalEquity = r2(shareCapital + retainedEarnings);

  return {
    totalAssets,
    totalLiabilities,
    totalEquity,
    details: {
      cash: r2(cash),
      bank: r2(bank),
      receivables: r2(receivables),
      inventory: r2(inventory),
      fixedAssets: r2(fixedAssets),
      otherAssets: r2(otherAssets),
      payables: r2(payables),
      shortTermDebt: r2(shortTermDebt),
      longTermDebt: r2(longTermDebt),
      otherLiabilities: r2(otherLiabilities),
      shareCapital: r2(shareCapital),
      retainedEarnings: r2(retainedEarnings),
    },
  };
}

function buildEquityStatement(
  balanceSheet: BalanceSheet,
  incomeStatement: IncomeStatement,
): EquityStatement {
  // Drawings are not tracked separately in this system
  // Opening equity will be set by the caller
  return {
    openingEquity: 0, // Will be set by caller
    netResult: incomeStatement.netResult,
    drawings: 0,
    closingEquity: 0, // Will be set by caller
  };
}
