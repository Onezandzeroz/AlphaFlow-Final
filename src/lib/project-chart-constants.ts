/**
 * Project Chart of Accounts — constants (client-safe)
 *
 * This file contains ONLY pure data and helper functions — NO imports of
 * Prisma or the database client. It is safe to import from client
 * components (e.g. to render project-account badges or filter selectors).
 *
 * The seed function (which needs the db) lives in project-chart-template.ts
 * and is server-only.
 */

export interface ProjectSeedAccountMeta {
  number: string;
  name: string;
  nameEn: string;
  type: string; // AccountType union — kept as string here to avoid importing @prisma/client
  group: string; // AccountGroup union — kept as string here
  description: string;
}

/**
 * Project-oriented supplementary accounts.
 * See project-chart-template.ts for the full canonical list with
 * Prisma enum types. This mirror is kept in sync and is the only copy
 * client components should import.
 */
export const PROJECT_ACCOUNT_NUMBERS_LIST: string[] = [
  // Projekt-indtægter (REVENUE)
  '4600', '4610', '4620', '4630',
  // Projekt-WIP & forudbetalte omkostninger (ASSET)
  '3600', '3610', '3620',
  // Projekt-gæld (LIABILITY)
  '2150', '2160',
  // Projekt-omkostninger (EXPENSE)
  '6600', '6610', '6620', '6630', '6640', '6650',
];

const PROJECT_ACCOUNT_NUMBERS_SET = new Set(PROJECT_ACCOUNT_NUMBERS_LIST);

/**
 * Check whether an account number belongs to the project template.
 * Pure function — safe for client components.
 */
export function isProjectAccount(number: string): boolean {
  return PROJECT_ACCOUNT_NUMBERS_SET.has(number);
}

/**
 * Count of project template accounts (for display in UIs).
 */
export const PROJECT_ACCOUNT_COUNT = PROJECT_ACCOUNT_NUMBERS_LIST.length;
