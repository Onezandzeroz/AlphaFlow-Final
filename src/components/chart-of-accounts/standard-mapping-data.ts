/**
 * Merged standard chart of accounts data — shared between the mapping
 * panel and the searchable combobox.
 *
 * The OFFICIAL_STANDARD_CHART (603 accounts — SKAT/Erhvervsstyrelsen 2026
 * Standardkontoplanen) takes precedence. PUBLIC_STANDARD_CHART (legacy
 * public-sector 69 accounts) fills any gaps not covered by the official
 * chart. Accounts are sorted numerically so the dropdown is browsable.
 *
 * Extracted into its own module so it can be imported by both:
 *   - standard-mapping-panel.tsx (the mapping table)
 *   - standard-account-combobox.tsx (the searchable dropdown)
 * without creating a circular dependency.
 */

import { PUBLIC_STANDARD_CHART } from '@/lib/standard-chart-of-accounts';
import { OFFICIAL_STANDARD_CHART } from '@/lib/official-standard-chart';
import type { StandardAccount } from '@/lib/standard-chart-of-accounts';

export const MERGED_STANDARD_CHART: StandardAccount[] = (() => {
  const seen = new Set<string>();
  const merged: StandardAccount[] = [];
  for (const acc of [...OFFICIAL_STANDARD_CHART, ...PUBLIC_STANDARD_CHART]) {
    if (seen.has(acc.number)) continue;
    seen.add(acc.number);
    merged.push(acc);
  }
  return merged.sort((a, b) => {
    const an = parseInt(a.number, 10);
    const bn = parseInt(b.number, 10);
    return Number.isNaN(an) || Number.isNaN(bn)
      ? a.number.localeCompare(b.number)
      : an - bn;
  });
})();
