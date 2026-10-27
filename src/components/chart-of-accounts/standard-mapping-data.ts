/**
 * Standard chart of accounts data — shared between the mapping panel and
 * the searchable combobox.
 *
 * Indeholder udelukkende OFFICIAL_STANDARD_CHART (603 konti — SKAT/
 * Erhvervsstyrelsen 2026 Standardkontoplanen, den nyeste reviderede).
 * Konti er sorteret numerisk så dropdown er overskuelig.
 *
 * Extracted into its own module so it can be imported by both:
 *   - standard-mapping-panel.tsx (the mapping table)
 *   - standard-account-combobox.tsx (the searchable dropdown)
 * without creating a circular dependency.
 */

import { OFFICIAL_STANDARD_CHART } from '@/lib/official-standard-chart';
import type { StandardAccount } from '@/lib/standard-chart-of-accounts';

export const MERGED_STANDARD_CHART: StandardAccount[] = [...OFFICIAL_STANDARD_CHART].sort((a, b) => {
  const an = parseInt(a.number, 10);
  const bn = parseInt(b.number, 10);
  return Number.isNaN(an) || Number.isNaN(bn)
    ? a.number.localeCompare(b.number)
    : an - bn;
});
