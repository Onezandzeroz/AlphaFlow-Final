/**
 * Project Mode view visibility (FASE 4)
 *
 * Determines which navigation views are relevant when the user is working
 * inside a project context. Project accounting has a well-defined scope:
 * it is about the financial activity of ONE project — not tenant-level
 * compliance, bank reconciliation, or annual reporting.
 *
 * Views fall into three buckets:
 *
 *   ✅ VISIBLE (default) — fully usable, scoped to the active project.
 *      Includes: dashboard, transactions, invoices, contacts, journal,
 *      ledger, budget, reports.
 *
 *   ⚠️ GRAYED — visible but dimmed + non-clickable. These are shared with
 *      the tenant (e.g. chart of accounts) or mostly tenant-level but may
 *      have some project relevance. Grayed so the user understands they
 *      are leaving the project's scope conceptually, but they can still
 *      see they exist (and reach them by exiting project mode).
 *
 *   ❌ HIDDEN — removed from navigation entirely. These have no meaning in
 *      a project context and would only confuse: VAT reports, annual
 *      reports, periods, exports, year-end, backups, tenant settings.
 */

/**
 * Views hidden entirely when in project mode.
 * These are tenant-level operations with no project meaning.
 */
export const PROJECT_MODE_HIDDEN_VIEWS: ReadonlySet<string> = new Set([
  // Compliance / closing — these operate on the whole tenant
  'annual-report',    // Moms & Årsregnskab (whole company)
  'periods',          // Bogføringsperioder (tenant-level)
  'exports',          // SaF-T etc. (tax authority exports)
  'year-end',         // Årsafslutning (tenant operation)
  // Maintenance — tenant operations
  'backups',          // Backup is a tenant operation
  // Settings that configure the tenant (not the project)
  'settings-company', // Virksomhedsindstillinger
  'settings-edelivery', // eLevering
]);

/**
 * Views grayed-out (visible but non-clickable) when in project mode.
 * These are shared with the tenant or mostly tenant-level but may have
 * some project relevance, so we keep them visible as a signal.
 */
export const PROJECT_MODE_GRAYED_VIEWS: ReadonlySet<string> = new Set([
  'projects',     // You're already inside a project — the list is confusing
  'accounts',     // Chart of accounts is shared with the tenant
  'bank-recon',   // Bank statements are tenant-level (complex linkage)
  'settings',     // Account profile is user-level, not project — keep visible but dimmed
  'audit-log',    // Tenant-level, but shows project activity too — gray for context
]);

/**
 * Check if a view is accessible in project mode.
 * Returns 'visible' | 'grayed' | 'hidden'.
 */
export function getProjectModeViewStatus(view: string): 'visible' | 'grayed' | 'hidden' {
  if (PROJECT_MODE_HIDDEN_VIEWS.has(view)) return 'hidden';
  if (PROJECT_MODE_GRAYED_VIEWS.has(view)) return 'grayed';
  return 'visible';
}

/**
 * Is the given view blocked (hidden OR grayed) in project mode?
 * Used by the click-guard to prevent navigation.
 */
export function isViewBlockedInProjectMode(view: string): boolean {
  return PROJECT_MODE_HIDDEN_VIEWS.has(view) || PROJECT_MODE_GRAYED_VIEWS.has(view);
}
