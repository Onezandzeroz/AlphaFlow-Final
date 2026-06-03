/**
 * Annual Report iXBRL Generator — Regnskab Special
 *
 * Generates an inline XBRL (iXBRL) document for Danish annual accounts
 * using the Danish FSA taxonomy (SRD 2016 / DCCA taxonomy).
 *
 * Uses xmlbuilder2 for XML generation.
 *
 * The iXBRL format embeds XBRL facts within an XHTML document, making it
 * both human-readable and machine-processable. This is the format required
 * by Erhvervsstyrelsen for Regnskab Special filing.
 *
 * Danish taxonomy namespace: http://xbrl.dcca.dk/dk-gaap/ci/2020-01-01
 *
 * Exports: generateAnnualReportXBRL(companyId, year, companyName, cvrNumber) → XML string
 */

import { db } from '@/lib/db';
import { AccountGroup, AccountType } from '@prisma/client';
import { create } from 'xmlbuilder2';

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

interface FinancialData {
  // Income Statement
  revenue: number;
  costOfGoods: number;
  grossProfit: number;
  operatingExpenses: number;
  operatingProfit: number;
  financialIncome: number;
  financialExpenses: number;
  netFinancialItems: number;
  profitBeforeTax: number;
  tax: number;
  netResult: number;
  // Balance Sheet
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  cash: number;
  receivables: number;
  inventory: number;
  fixedAssets: number;
  payables: number;
  shortTermDebt: number;
  longTermDebt: number;
  shareCapital: number;
  retainedEarnings: number;
}

// ─── Danish FSA Taxonomy Mappings ─────────────────────────────────────────
// Maps our account groups to DCCA taxonomy element names

const DCCA_NS = 'http://xbrl.dcca.dk/dk-gaap/ci/2020-01-01';
const DCCA_PREFIX = 'dcca';

/**
 * Core financial elements in the DCCA taxonomy
 * These are the most commonly used elements for a standard annual report.
 */
const TAXONOMY_ELEMENTS: Record<string, { local: string; label: string }> = {
  revenue: { local: 'RevenueTurnover', label: 'Nettoomsætning' },
  costOfGoods: { local: 'CostOfGoodsSold', label: 'Vareforbrug' },
  grossProfit: { local: 'GrossProfit', label: 'Bruttofortjeneste' },
  operatingExpenses: { local: 'OperatingExpenses', label: 'Driftsudgifter' },
  operatingProfit: { local: 'OperatingProfit', label: 'Driftsresultat' },
  financialIncome: { local: 'FinancialIncome', label: 'Finansielle indtægter' },
  financialExpenses: { local: 'FinancialExpenses', label: 'Finansielle omkostninger' },
  profitBeforeTax: { local: 'ProfitBeforeTax', label: 'Resultat før skat' },
  tax: { local: 'IncomeTax', label: 'Skat af årets resultat' },
  netResult: { local: 'NetProfit', label: 'Årets resultat' },
  totalAssets: { local: 'TotalAssets', label: 'I alt aktiver' },
  totalLiabilities: { local: 'TotalLiabilities', label: 'I alt gæld' },
  totalEquity: { local: 'Equity', label: 'Egenkapital' },
  cash: { local: 'CashAndCashEquivalents', label: 'Likvide beholdninger' },
  receivables: { local: 'TradeReceivables', label: 'Tilgodehavender' },
  inventory: { local: 'Inventories', label: 'Varelager' },
  fixedAssets: { local: 'TangibleFixedAssets', label: 'Tangible fixed assets' },
  payables: { local: 'TradePayables', label: 'Kreditorer' },
  shortTermDebt: { local: 'ShortTermBorrowings', label: 'Kortfristet gæld' },
  longTermDebt: { local: 'LongTermBorrowings', label: 'Langfristet gæld' },
  shareCapital: { local: 'ShareCapital', label: 'Egenkapital indbetalt' },
  retainedEarnings: { local: 'RetainedEarnings', label: 'Vindinger fra tidligere år' },
};

// ─── Core: Generate iXBRL ──────────────────────────────────────────────────

/**
 * Generate an iXBRL (inline XBRL) document for Danish annual accounts.
 *
 * @param companyId - Company database ID
 * @param year - Fiscal year
 * @param companyName - Company display name
 * @param cvrNumber - Company CVR number
 * @returns Complete iXBRL XHTML document as string
 */
export async function generateAnnualReportXBRL(
  companyId: string,
  year: number,
  companyName: string,
  cvrNumber: string,
): Promise<string> {
  // Date range
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

  // ── Fetch all posted journal entries for the year (P&L) ──
  const yearEntries = await db.journalEntry.findMany({
    where: {
      companyId,
      status: 'POSTED',
      cancelled: false,
      date: { gte: yearStart, lte: yearEnd },
    },
    include: { lines: { include: { account: true } } },
  });

  // ── Fetch all posted journal entries up to year end (Balance Sheet) ──
  const allTimeEntries = await db.journalEntry.findMany({
    where: {
      companyId,
      status: 'POSTED',
      cancelled: false,
      date: { lte: yearEnd },
    },
    include: { lines: { include: { account: true } } },
  });

  // Aggregate P&L data
  const yearAgg = aggregateEntries(yearEntries);
  // Aggregate Balance Sheet data (all-time)
  const bsAgg = aggregateEntries(allTimeEntries);

  // Build financial data
  const data = buildFinancialData(yearAgg, bsAgg);

  // ── Build iXBRL Document ──
  const yearStartStr = `${year}-01-01`;
  const yearEndStr = `${year}-12-31`;

  const doc = create({ version: '1.0', encoding: 'UTF-8' });

  const html = doc.ele('html', {
    'xmlns': 'http://www.w3.org/1999/xhtml',
    'xmlns:ix': 'http://www.xbrl.org/2013/inlineXBRL',
    'xmlns:ixt': 'http://www.xbrl.org/inlineXBRL/transformation/2015-02-26',
    'xmlns:xbrli': 'http://www.xbrl.org/2003/instance',
    'xmlns:link': 'http://www.xbrl.org/2003/linkbase',
    'xmlns:xlink': 'http://www.w3.org/1999/xlink',
  });

  // Set the DCCA namespace (dynamic key requires separate call)
  html.att(`xmlns:${DCCA_PREFIX}`, DCCA_NS);

  // ── Head ──
  const head = html.ele('head');
  head.ele('title').txt(`Årsregnskab ${companyName} ${year}`);

  // XBRL hidden resources
  const hiddenResources = head.ele('ix:resources');

  // Contexts
  const context1 = hiddenResources.ele('xbrli:context', { id: 'c1' });
  const entity = context1.ele('xbrli:entity');
  entity.ele('xbrli:identifier', {
    scheme: 'http://standards.iso.org/iso/17442',
  }).txt(cvrNumber.length === 8 ? `0${cvrNumber}` : cvrNumber);
  context1.ele('xbrli:period')
    .ele('xbrli:instant').txt(yearEndStr);

  const context2 = hiddenResources.ele('xbrli:context', { id: 'c2' });
  const entity2 = context2.ele('xbrli:entity');
  entity2.ele('xbrli:identifier', {
    scheme: 'http://standards.iso.org/iso/17442',
  }).txt(cvrNumber.length === 8 ? `0${cvrNumber}` : cvrNumber);
  const period2 = context2.ele('xbrli:period');
  period2.ele('xbrli:startDate').txt(yearStartStr);
  period2.ele('xbrli:endDate').txt(yearEndStr);

  // Units
  const unit1 = hiddenResources.ele('xbrli:unit', { id: 'u1' });
  unit1.ele('xbrli:measure').txt('iso4217:DKK');

  // ── Body ──
  const body = html.ele('body');

  // Header
  body.ele('h1').txt(`Årsregnskab ${year}`);
  body.ele('p').txt(`Virksomhed: ${companyName}`);
  body.ele('p').txt(`CVR-nummer: ${cvrNumber}`);
  body.ele('p').txt(`Periode: ${yearStartStr} — ${yearEndStr}`);
  body.ele('hr');

  // ── Resultatopgørelse ──
  body.ele('h2').txt('Resultatopgørelse');

  addIxbrlFact(body, 'revenue', data.revenue, 'c2', 'u1', true);
  addIxbrlFact(body, 'costOfGoods', data.costOfGoods, 'c2', 'u1', true);
  addIxbrlFact(body, 'grossProfit', data.grossProfit, 'c2', 'u1', true);
  addIxbrlFact(body, 'operatingExpenses', data.operatingExpenses, 'c2', 'u1', true);
  addIxbrlFact(body, 'operatingProfit', data.operatingProfit, 'c2', 'u1', true);
  addIxbrlFact(body, 'financialIncome', data.financialIncome, 'c2', 'u1', true);
  addIxbrlFact(body, 'financialExpenses', data.financialExpenses, 'c2', 'u1', true);
  addIxbrlFact(body, 'profitBeforeTax', data.profitBeforeTax, 'c2', 'u1', true);
  addIxbrlFact(body, 'tax', data.tax, 'c2', 'u1', true);
  addIxbrlFact(body, 'netResult', data.netResult, 'c2', 'u1', true);

  body.ele('hr');

  // ── Balance ──
  body.ele('h2').txt('Balance');

  addIxbrlFact(body, 'cash', data.cash, 'c1', 'u1', true);
  addIxbrlFact(body, 'receivables', data.receivables, 'c1', 'u1', true);
  addIxbrlFact(body, 'inventory', data.inventory, 'c1', 'u1', true);
  addIxbrlFact(body, 'fixedAssets', data.fixedAssets, 'c1', 'u1', true);
  addIxbrlFact(body, 'totalAssets', data.totalAssets, 'c1', 'u1', true);

  body.ele('hr');

  addIxbrlFact(body, 'payables', data.payables, 'c1', 'u1', true);
  addIxbrlFact(body, 'shortTermDebt', data.shortTermDebt, 'c1', 'u1', true);
  addIxbrlFact(body, 'longTermDebt', data.longTermDebt, 'c1', 'u1', true);
  addIxbrlFact(body, 'totalLiabilities', data.totalLiabilities, 'c1', 'u1', true);

  body.ele('hr');

  addIxbrlFact(body, 'shareCapital', data.shareCapital, 'c1', 'u1', true);
  addIxbrlFact(body, 'retainedEarnings', data.retainedEarnings, 'c1', 'u1', true);
  addIxbrlFact(body, 'totalEquity', data.totalEquity, 'c1', 'u1', true);

  body.ele('hr');

  // Footer
  body.ele('p', { style: 'font-size: 0.8em; color: #666;' })
    .txt(`Genereret af AlphaFlow — iXBRL Regnskab Special (${new Date().toISOString().split('T')[0]})`);

  return doc.end({ prettyPrint: true });
}

// ─── Helper: Add iXBRL fact ───────────────────────────────────────────────

function addIxbrlFact(
  parent: ReturnType<ReturnType<typeof create>['ele']>,
  key: string,
  value: number,
  contextRef: string,
  unitRef: string,
  isMonetary: boolean,
): void {
  const elem = TAXONOMY_ELEMENTS[key];
  if (!elem) return;

  const taxonomyQName = `${DCCA_PREFIX}:${elem.local}`;

  const p = parent.ele('p');
  p.ele('span').txt(`${elem.label}: `);

  const factAttrs: Record<string, string> = {
    name: taxonomyQName,
    contextRef: contextRef,
    decimals: '2',
  };

  if (isMonetary) {
    factAttrs.unitRef = unitRef;
  }

  p.ele('ix:nonFraction', factAttrs).txt(value.toFixed(2));
}

// ─── Helper: Aggregate journal entries ─────────────────────────────────────

function aggregateEntries(
  entries: Array<{
    lines: Array<{
      accountId: string;
      debit: number | { toNumber(): number };
      credit: number | { toNumber(): number };
      account: { id: string; number: string; name: string; type: string; group: string };
    }>;
  }>
): Map<string, AccountAggregate> {
  const map = new Map<string, AccountAggregate>();

  for (const entry of entries) {
    for (const line of entry.lines) {
      const accountId = line.accountId;
      const existing = map.get(accountId) || {
        number: line.account.number,
        name: line.account.name,
        type: line.account.type as AccountType,
        group: line.account.group as AccountGroup,
        debit: 0,
        credit: 0,
        netBalance: 0,
      };

      existing.debit += Number(line.debit) || 0;
      existing.credit += Number(line.credit) || 0;
      map.set(accountId, existing);
    }
  }

  // Calculate net balance
  for (const acc of map.values()) {
    acc.debit = r2(acc.debit);
    acc.credit = r2(acc.credit);

    if (
      acc.type === AccountType.REVENUE ||
      acc.type === AccountType.EQUITY ||
      acc.type === AccountType.LIABILITY
    ) {
      acc.netBalance = r2(acc.credit - acc.debit);
    } else {
      acc.netBalance = r2(acc.debit - acc.credit);
    }
  }

  return map;
}

// ─── Helper: Build financial data ──────────────────────────────────────────

function buildFinancialData(
  yearAgg: Map<string, AccountAggregate>,
  bsAgg: Map<string, AccountAggregate>,
): FinancialData {
  let revenue = 0;
  let costOfGoods = 0;
  let operatingExpenses = 0;
  let financialIncome = 0;
  let financialExpenses = 0;
  let tax = 0;

  for (const acc of yearAgg.values()) {
    switch (acc.group) {
      case AccountGroup.SALES_REVENUE:
      case AccountGroup.OTHER_REVENUE:
        revenue += acc.netBalance;
        break;
      case AccountGroup.COST_OF_GOODS:
        costOfGoods += acc.netBalance;
        break;
      case AccountGroup.PERSONNEL:
      case AccountGroup.OTHER_OPERATING:
        operatingExpenses += acc.netBalance;
        break;
      case AccountGroup.FINANCIAL_INCOME:
        financialIncome += acc.netBalance;
        break;
      case AccountGroup.FINANCIAL_EXPENSE:
        financialExpenses += acc.netBalance;
        break;
      case AccountGroup.TAX:
        tax += acc.netBalance;
        break;
      default:
        break;
    }
  }

  revenue = r2(revenue);
  costOfGoods = r2(costOfGoods);
  operatingExpenses = r2(operatingExpenses);
  financialIncome = r2(financialIncome);
  financialExpenses = r2(financialExpenses);
  tax = r2(tax);

  const grossProfit = r2(revenue - costOfGoods);
  const operatingProfit = r2(grossProfit - operatingExpenses);
  const netFinancialItems = r2(financialIncome - financialExpenses);
  const profitBeforeTax = r2(operatingProfit + netFinancialItems);
  const netResult = r2(profitBeforeTax - tax);

  // Balance sheet from bsAgg
  let cash = 0;
  let receivables = 0;
  let inventory = 0;
  let fixedAssets = 0;
  let payables = 0;
  let shortTermDebt = 0;
  let longTermDebt = 0;
  let shareCapital = 0;
  let retainedEarnings = 0;

  for (const acc of bsAgg.values()) {
    switch (acc.group) {
      case AccountGroup.CASH:
      case AccountGroup.BANK:
        cash += acc.netBalance;
        break;
      case AccountGroup.RECEIVABLES:
        receivables += acc.netBalance;
        break;
      case AccountGroup.INVENTORY:
        inventory += acc.netBalance;
        break;
      case AccountGroup.FIXED_ASSETS:
      case AccountGroup.OTHER_ASSETS:
        fixedAssets += acc.netBalance;
        break;
      case AccountGroup.PAYABLES:
      case AccountGroup.OTHER_LIABILITIES:
        payables += acc.netBalance;
        break;
      case AccountGroup.SHORT_TERM_DEBT:
        shortTermDebt += acc.netBalance;
        break;
      case AccountGroup.LONG_TERM_DEBT:
        longTermDebt += acc.netBalance;
        break;
      case AccountGroup.SHARE_CAPITAL:
        shareCapital += acc.netBalance;
        break;
      case AccountGroup.RETAINED_EARNINGS:
        retainedEarnings += acc.netBalance;
        break;
      default:
        break;
    }
  }

  cash = r2(cash);
  receivables = r2(receivables);
  inventory = r2(inventory);
  fixedAssets = r2(fixedAssets);
  payables = r2(payables);
  shortTermDebt = r2(shortTermDebt);
  longTermDebt = r2(longTermDebt);
  shareCapital = r2(shareCapital);
  retainedEarnings = r2(retainedEarnings);

  const totalAssets = r2(cash + receivables + inventory + fixedAssets);
  const totalLiabilities = r2(payables + shortTermDebt + longTermDebt);
  const totalEquity = r2(shareCapital + retainedEarnings);

  return {
    revenue,
    costOfGoods,
    grossProfit,
    operatingExpenses,
    operatingProfit,
    financialIncome,
    financialExpenses,
    netFinancialItems,
    profitBeforeTax,
    tax,
    netResult,
    totalAssets,
    totalLiabilities,
    totalEquity,
    cash,
    receivables,
    inventory,
    fixedAssets,
    payables,
    shortTermDebt,
    longTermDebt,
    shareCapital,
    retainedEarnings,
  };
}
