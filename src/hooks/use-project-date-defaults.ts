'use client';

import { useMemo } from 'react';
import { useAuthStore } from '@/lib/auth-store';

/**
 * Project Mode date defaults (FASE 4)
 *
 * When the user is in project mode, date filters across the app should
 * default to the project's start/end dates instead of the current calendar
 * year. This hook resolves those defaults from the active project's
 * startDate / endDate (ISO strings on the user object).
 *
 * Returns:
 *   - isProjectMode: boolean
 *   - projectFromDate: 'YYYY-MM-DD' | null  — project start, or null if not in project mode / no start date
 *   - projectToDate: 'YYYY-MM-DD' | null     — project end, or null if not in project mode / no end date
 *   - projectYear: number | null             — year of project start (for year-based filters), or null
 *
 * Components use these to initialise their date-state when in project mode,
 * falling back to the existing tenant defaults (current year / today) when
 * not in project mode or when the project has no dates set.
 */
export function useProjectDateDefaults() {
  const user = useAuthStore((s) => s.user);

  return useMemo(() => {
    const isProjectMode = !!user?.isProjectMode;
    const startIso = user?.activeProjectStartDate ?? null;
    const endIso = user?.activeProjectEndDate ?? null;

    // ISO strings come from the server as e.g. "2026-03-15T00:00:00.000Z".
    // Date filters use 'YYYY-MM-DD' format, so we take the first 10 chars.
    const projectFromDate = isProjectMode && startIso ? startIso.slice(0, 10) : null;
    const projectToDate = isProjectMode && endIso ? endIso.slice(0, 10) : null;

    // Year-based filters (e.g. Budget) use the project's start year.
    const projectYear = isProjectMode && startIso
      ? new Date(startIso).getFullYear()
      : null;

    return {
      isProjectMode,
      projectFromDate,
      projectToDate,
      projectYear,
    };
  }, [user?.isProjectMode, user?.activeProjectStartDate, user?.activeProjectEndDate]);
}
