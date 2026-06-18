/**
 * Project-Oriented Chart of Accounts Template
 *
 * An OPTIONAL supplementary set of accounts specifically useful for
 * businesses that run projects (consultancies, agencies, construction,
 * IT projects, etc.). These accounts integrate into the existing
 * company chart of accounts — they are NOT a separate plan.
 *
 * Design principles:
 *   - Numbered in ranges that fit the existing Danish FSR chart:
 *       11xx = Projekt-indtægter (REVENUE) — alongside existing 1000-1200 assets
 *       21xx = Projekt-gæld (LIABILITY) — alongside existing 2000-2700
 *       31xx = Projekt-WIP / forudbetalte omkostninger (ASSET) — alongside 3000-3400 equity
 *       (Note: equity is 3000-3400, so project assets use 3600-3790 to avoid clashes)
 *       46xx = Projekt-salg (REVENUE) — alongside existing 4000-5200
 *       66xx = Projekt-omkostninger (EXPENSE) — alongside existing 6000-6200
 *   - Each account has a Danish + English name and a description.
 *   - Groups use the existing AccountGroup enum (no schema change).
 *   - Seeding is idempotent: accounts that already exist (same number)
 *     are skipped, so re-running the seed won't fail or duplicate.
 *
 * Usage: POST /api/accounts/seed-project triggers seedProjectAccounts().
 */

import { db } from '@/lib/db';
import { AccountType, AccountGroup } from '@prisma/client';

export interface ProjectSeedAccount {
  number: string;
  name: string;
  nameEn: string;
  type: AccountType;
  group: AccountGroup;
  description: string;
}

/**
 * Project-oriented supplementary accounts.
 *
 * Numbering chosen to avoid collisions with the standard seed
 * (src/lib/seed-chart-of-accounts.ts) which uses 1000-9500.
 * Project accounts use the 11xx / 21xx / 36xx / 46xx / 66xx ranges
 * that the standard seed does NOT occupy.
 */
export const PROJECT_CHART_TEMPLATE: ProjectSeedAccount[] = [
  // ─── Projekt-indtægter (REVENUE) — 4600-4690 ──────────────────────
  {
    number: '4600',
    name: 'Projekt-salg (timefakturering)',
    nameEn: 'Project sales (time-based)',
    type: 'REVENUE',
    group: 'SALES_REVENUE',
    description: 'Indtægter fra projektarbejde faktureret efter timeforbrug',
  },
  {
    number: '4610',
    name: 'Projekt-salg (fast pris)',
    nameEn: 'Project sales (fixed price)',
    type: 'REVENUE',
    group: 'SALES_REVENUE',
    description: 'Indtægter fra projekter med aftalt fast pris',
  },
  {
    number: '4620',
    name: 'Milepædsfakturering',
    nameEn: 'Milestone billing',
    type: 'REVENUE',
    group: 'SALES_REVENUE',
    description: 'Fakturering ved opnåede projektmilepæle',
  },
  {
    number: '4630',
    name: 'Projekt-efterfakturering',
    nameEn: 'Project additional billing',
    type: 'REVENUE',
    group: 'SALES_REVENUE',
    description: 'Merfakturering af projektarbejde (tillæg, ændringer)',
  },

  // ─── Projekt-WIP & forudbetalte omkostninger (ASSET) — 3600-3690 ──
  {
    number: '3600',
    name: 'Projekt-WIP (varer i arbejde)',
    nameEn: 'Project WIP (work in progress)',
    type: 'ASSET',
    group: 'OTHER_ASSETS',
    description: 'Akkumulerede projektomkostninger endnu ikke faktureret (WIP)',
  },
  {
    number: '3610',
    name: 'Forudbetalte projektomkostninger',
    nameEn: 'Prepaid project costs',
    type: 'ASSET',
    group: 'OTHER_ASSETS',
    description: 'Forudbetalte omkostninger til projekter (leverandører, abonnementer)',
  },
  {
    number: '3620',
    name: 'Tilgodehavender fra projekter',
    nameEn: 'Project receivables',
    type: 'ASSET',
    group: 'RECEIVABLES',
    description: 'Ubetalte fakturaer fra projektkunder',
  },

  // ─── Projekt-gæld (LIABILITY) — 2100-2190 ────────────────────────
  // NOTE: 2100 and 2110 exist in standard (Skyldige skatter, Leverandørgæld
  // forudbetaling), so we use 2150+ to avoid clashes.
  {
    number: '2150',
    name: 'Forudbetaling fra projektkunder',
    nameEn: 'Customer prepayments (projects)',
    type: 'LIABILITY',
    group: 'OTHER_LIABILITIES',
    description: 'Modtagne forudbetalinger for projekter endnu ikke afsluttet',
  },
  {
    number: '2160',
    name: 'Projekt-tilgodehavender hos underleverandører',
    nameEn: 'Project supplier prepayments',
    type: 'ASSET',
    group: 'RECEIVABLES',
    description: 'Forudbetalinger til underleverandører for projekt-arbejde',
  },

  // ─── Projekt-omkostninger (EXPENSE) — 6600-6690 ──────────────────
  {
    number: '6600',
    name: 'Projekt-materialer',
    nameEn: 'Project materials',
    type: 'EXPENSE',
    group: 'COST_OF_GOODS',
    description: 'Materialer og varer købt direkte til projekter',
  },
  {
    number: '6610',
    name: 'Projekt-undersleverancer',
    nameEn: 'Project subcontractors',
    type: 'EXPENSE',
    group: 'COST_OF_GOODS',
    description: 'Honorarer til underleverandører på projekter',
  },
  {
    number: '6620',
    name: 'Projekt-rejseomkostninger',
    nameEn: 'Project travel',
    type: 'EXPENSE',
    group: 'OTHER_OPERATING',
    description: 'Rejse- og opholdsudgifter relateret til specifikke projekter',
  },
  {
    number: '6630',
    name: 'Projekt-konsulenthonorarer',
    nameEn: 'Project consultancy fees',
    type: 'EXPENSE',
    group: 'OTHER_OPERATING',
    description: 'Eksterne konsulenter hyret til specifikke projekter',
  },
  {
    number: '6640',
    name: 'Projekt-licenser og software',
    nameEn: 'Project licenses & software',
    type: 'EXPENSE',
    group: 'OTHER_OPERATING',
    description: 'Softwarelicenser og abonnementer købt til specifikke projekter',
  },
  {
    number: '6650',
    name: 'Projekt-lønninger',
    nameEn: 'Project salaries',
    type: 'EXPENSE',
    group: 'PERSONNEL',
    description: 'Lønninger allokeret til specifikke projekter (ved time-registrering)',
  },
];

/**
 * Project account numbers (for quick lookup / filtering in the UI).
 * Used by the chart-of-accounts page to show a "project accounts" badge
 * and by the project-budget UI to pre-suggest these accounts.
 */
export const PROJECT_ACCOUNT_NUMBERS = new Set(
  PROJECT_CHART_TEMPLATE.map((a) => a.number)
);

/**
 * Check whether an account number belongs to the project template.
 */
export function isProjectAccount(number: string): boolean {
  return PROJECT_ACCOUNT_NUMBERS.has(number);
}

/**
 * Seeds the project-oriented supplementary accounts for a company.
 *
 * Idempotent: skips account numbers that already exist (so it can be
 * run on top of an existing chart of accounts without duplicating).
 *
 * @returns { created: number, skipped: number }
 */
export async function seedProjectAccounts(
  userId: string,
  companyId: string
): Promise<{ created: number; skipped: number }> {
  // Find which project-account numbers already exist for this company
  const existing = await db.account.findMany({
    where: {
      companyId,
      number: { in: PROJECT_CHART_TEMPLATE.map((a) => a.number) },
    },
    select: { number: true },
  });
  const existingNumbers = new Set(existing.map((a) => a.number));

  const toCreate = PROJECT_CHART_TEMPLATE.filter(
    (a) => !existingNumbers.has(a.number)
  );

  if (toCreate.length === 0) {
    return { created: 0, skipped: PROJECT_CHART_TEMPLATE.length };
  }

  const result = await db.account.createMany({
    data: toCreate.map((account) => ({
      number: account.number,
      name: account.name,
      nameEn: account.nameEn,
      type: account.type,
      group: account.group,
      description: account.description,
      isActive: true,
      isSystem: false, // project accounts are user-added, not core system
      userId,
      companyId,
    })),
  });

  return {
    created: result.count,
    skipped: PROJECT_CHART_TEMPLATE.length - result.count,
  };
}
