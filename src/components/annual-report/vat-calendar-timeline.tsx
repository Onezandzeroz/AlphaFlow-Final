'use client';

/**
 * VAT Calendar Timeline — visual milestone calendar for momsindberetning
 *
 * Fetches SKAT's reporting periods via the VirksomhedKalenderHent API
 * (GET /api/vat-report/calendar?year=YYYY) and displays them as a
 * horizontal timeline of milestone chips.
 *
 * Each period chip shows:
 *   - Period label (Q1, Q2, Q3, Q4, or yearly)
 *   - Date range (e.g. "1 jan – 31 mar")
 *   - Deadline (frist) if available from SKAT
 *   - Status badge: submitted (emerald) / open (blue) / overdue (red) / future (gray)
 *
 * Clicking a period chip selects it (calls onPeriodSelect) so the user
 * can immediately prepare/submit VAT for that period.
 *
 * When SKAT credentials are not configured (simulation mode), a small
 * "Simuleret" badge is shown, but the timeline still displays the
 * simulated periods so the UI flow can be tested.
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Send,
  Info,
  ChevronRight,
} from 'lucide-react';
import { format, parseISO, isAfter, isBefore } from 'date-fns';
import { da } from 'date-fns/locale';

// ─── Types ────────────────────────────────────────────────────────────

interface SkatVatPeriod {
  periodStart: string;  // YYYY-MM-DD
  periodEnd: string;    // YYYY-MM-DD
  deadline: string;     // YYYY-MM-DD (may be empty)
  frequencyCode: string; // "07"=monthly, "08"=quarterly, "10"=yearly
  isOpen: boolean;
}

interface CalendarResponse {
  calendar: {
    seNumber: string;
    periods: SkatVatPeriod[];
  };
  simulated: boolean;
}

interface VATSubmissionLite {
  id: string;
  year: number;
  period: string;
  status: 'DRAFT' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | 'ERROR';
  submittedDate: string | null;
}

interface VatCalendarTimelineProps {
  year: string;
  vatSubmissions: VATSubmissionLite[];
  selectedPeriod: string;
  onPeriodSelect: (period: string) => void;
  language: 'da' | 'en';
}

// ─── Helpers ──────────────────────────────────────────────────────────

/** Derive the AlphaFlow period code (Q1/Q2/Q3/Q4/YEARLY) from a SKAT period. */
function derivePeriodCode(period: SkatVatPeriod): string {
  if (period.frequencyCode === '10') return 'YEARLY';
  const startMonth = parseISO(period.periodStart).getMonth() + 1; // 1-12
  if (startMonth <= 3) return 'Q1';
  if (startMonth <= 6) return 'Q2';
  if (startMonth <= 9) return 'Q3';
  return 'Q4';
}

/** Get a human-readable label for a period. */
function getPeriodLabel(period: SkatVatPeriod, language: 'da' | 'en'): string {
  const code = derivePeriodCode(period);
  if (code === 'YEARLY') return language === 'da' ? 'Årligt' : 'Yearly';
  const monthNames = language === 'da'
    ? { Q1: 'Jan–Mar', Q2: 'Apr–Jun', Q3: 'Jul–Sep', Q4: 'Okt–Dec' }
    : { Q1: 'Jan–Mar', Q2: 'Apr–Jun', Q3: 'Jul–Sep', Q4: 'Oct–Dec' };
  return `${code} (${monthNames[code as keyof typeof monthNames]})`;
}

/** Format a date string (YYYY-MM-DD) for display. */
function formatDate(dateStr: string, language: 'da' | 'en'): string {
  if (!dateStr) return '';
  try {
    const date = parseISO(dateStr);
    return format(date, 'd MMM', { locale: da });
  } catch {
    return dateStr;
  }
}

/** Determine the display status of a period based on submissions + deadlines. */
type PeriodStatus = 'submitted' | 'accepted' | 'open' | 'overdue' | 'future' | 'error';

function getPeriodStatus(
  period: SkatVatPeriod,
  vatSubmissions: VATSubmissionLite[],
  year: string,
): PeriodStatus {
  const periodCode = derivePeriodCode(period);
  const submission = vatSubmissions.find(
    (s) => s.year === parseInt(year, 10) && s.period === periodCode,
  );

  if (submission) {
    if (submission.status === 'ACCEPTED') return 'accepted';
    if (submission.status === 'SUBMITTED') return 'submitted';
    if (submission.status === 'REJECTED' || submission.status === 'ERROR') return 'error';
    if (submission.status === 'DRAFT') return 'open'; // draft = still in progress
  }

  // No submission — check if the period is overdue or future
  const now = new Date();
  const periodEnd = parseISO(period.periodEnd);

  if (isAfter(periodEnd, now)) {
    return 'future';
  }

  // Period has ended — check if there's a deadline
  if (period.deadline) {
    const deadline = parseISO(period.deadline);
    if (isBefore(deadline, now)) {
      return 'overdue';
    }
  }

  return 'open';
}

/** Get the styling for a period status. */
function getStatusStyle(status: PeriodStatus): {
  border: string;
  bg: string;
  text: string;
  badge: string;
  icon: typeof CheckCircle2;
} {
  switch (status) {
    case 'accepted':
      return {
        border: 'border-emerald-500/40 dark:border-emerald-400/30',
        bg: 'bg-emerald-50 dark:bg-emerald-950/20',
        text: 'text-emerald-700 dark:text-emerald-300',
        badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
        icon: CheckCircle2,
      };
    case 'submitted':
      return {
        border: 'border-blue-500/40 dark:border-blue-400/30',
        bg: 'bg-blue-50 dark:bg-blue-950/20',
        text: 'text-blue-700 dark:text-blue-300',
        badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
        icon: Send,
      };
    case 'overdue':
      return {
        border: 'border-red-500/40 dark:border-red-400/30',
        bg: 'bg-red-50 dark:bg-red-950/20',
        text: 'text-red-700 dark:text-red-300',
        badge: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
        icon: AlertCircle,
      };
    case 'error':
      return {
        border: 'border-orange-500/40 dark:border-orange-400/30',
        bg: 'bg-orange-50 dark:bg-orange-950/20',
        text: 'text-orange-700 dark:text-orange-300',
        badge: 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300',
        icon: AlertCircle,
      };
    case 'future':
      return {
        border: 'border-gray-200 dark:border-white/10',
        bg: 'bg-gray-50 dark:bg-white/5',
        text: 'text-gray-500 dark:text-gray-400',
        badge: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300',
        icon: Clock,
      };
    case 'open':
    default:
      return {
        border: 'border-[#0d9488]/40 dark:border-[#2dd4bf]/30',
        bg: 'bg-[#0d9488]/5 dark:bg-[#0d9488]/10',
        text: 'text-[#0d9488] dark:text-[#2dd4bf]',
        badge: 'bg-[#0d9488]/10 text-[#0d9488] dark:bg-[#2dd4bf]/15 dark:text-[#2dd4bf]',
        icon: Calendar,
      };
  }
}

/** Get the status label for display. */
function getStatusLabel(status: PeriodStatus, language: 'da' | 'en'): string {
  const labels = {
    da: {
      accepted: 'Godkendt',
      submitted: 'Indsendt',
      overdue: 'Udløbet',
      error: 'Fejl',
      future: 'Kommende',
      open: 'Åben',
    },
    en: {
      accepted: 'Accepted',
      submitted: 'Submitted',
      overdue: 'Overdue',
      error: 'Error',
      future: 'Upcoming',
      open: 'Open',
    },
  };
  return labels[language][status];
}

// ─── Component ────────────────────────────────────────────────────────

export function VatCalendarTimeline({
  year,
  vatSubmissions,
  selectedPeriod,
  onPeriodSelect,
  language,
}: VatCalendarTimelineProps) {
  const [calendar, setCalendar] = useState<SkatVatPeriod[]>([]);
  const [simulated, setSimulated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCalendar = useCallback(async (yearStr: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/vat-report/calendar?year=${yearStr}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data: CalendarResponse = await res.json();
      setCalendar(data.calendar?.periods || []);
      setSimulated(data.simulated || false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch calendar');
      // Fall back to simulated quarterly periods so the UI is still usable
      const y = parseInt(yearStr, 10);
      setCalendar([
        { periodStart: `${y}-01-01`, periodEnd: `${y}-03-31`, deadline: `${y}-04-01`, frequencyCode: '08', isOpen: true },
        { periodStart: `${y}-04-01`, periodEnd: `${y}-06-30`, deadline: `${y}-07-01`, frequencyCode: '08', isOpen: true },
        { periodStart: `${y}-07-01`, periodEnd: `${y}-09-30`, deadline: `${y}-10-01`, frequencyCode: '08', isOpen: true },
        { periodStart: `${y}-10-01`, periodEnd: `${y}-12-31`, deadline: `${y + 1}-01-01`, frequencyCode: '08', isOpen: true },
      ]);
      setSimulated(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCalendar(year);
  }, [year, fetchCalendar]);

  // ─── Loading state ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Card className="border-0 shadow-lg dark:border dark:border-white/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
            <span className="text-sm font-medium">
              {language === 'da' ? 'Momsangivelses-kalender' : 'VAT Reporting Calendar'}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── Sort periods chronologically ───────────────────────────────────
  const sortedPeriods = [...calendar].sort((a, b) =>
    a.periodStart.localeCompare(b.periodStart),
  );

  // ─── Calculate progress ─────────────────────────────────────────────
  const totalPeriods = sortedPeriods.length;
  const submittedCount = sortedPeriods.filter((p) => {
    const status = getPeriodStatus(p, vatSubmissions, year);
    return status === 'accepted' || status === 'submitted';
  }).length;

  return (
    <Card className="border-0 shadow-lg dark:border dark:border-white/5">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
            <span className="text-sm font-medium">
              {language === 'da' ? 'Momsangivelses-kalender' : 'VAT Reporting Calendar'}
            </span>
            {simulated && (
              <Badge variant="outline" className="gap-1 text-xs font-normal">
                <Info className="h-3 w-3" />
                {language === 'da' ? 'Simuleret' : 'Simulated'}
              </Badge>
            )}
          </div>
          {totalPeriods > 0 && (
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span>
                {submittedCount}/{totalPeriods} {language === 'da' ? 'indsendt' : 'submitted'}
              </span>
              <div className="w-24 h-2 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#0d9488] dark:bg-[#2dd4bf] transition-all"
                  style={{ width: `${(submittedCount / totalPeriods) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Error notice */}
        {error && (
          <div className="mb-3 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
            <AlertCircle className="h-3 w-3 flex-shrink-0" />
            <span>
              {language === 'da'
                ? `Kunne ikke hente kalender fra SKAT: ${error}. Viser estimerede perioder.`
                : `Could not fetch calendar from SKAT: ${error}. Showing estimated periods.`}
            </span>
          </div>
        )}

        {/* Timeline */}
        {totalPeriods === 0 ? (
          <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
            {language === 'da'
              ? `Ingen momsangivelses-perioder fundet for ${year}.`
              : `No VAT reporting periods found for ${year}.`}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {sortedPeriods.map((period, idx) => {
              const periodCode = derivePeriodCode(period);
              const status = getPeriodStatus(period, vatSubmissions, year);
              const style = getStatusStyle(status);
              const StatusIcon = style.icon;
              const isSelected = selectedPeriod === periodCode;

              return (
                <button
                  key={`${period.periodStart}-${idx}`}
                  onClick={() => onPeriodSelect(periodCode)}
                  className={`
                    relative text-left p-3 rounded-lg border-2 transition-all
                    ${style.border} ${style.bg}
                    hover:shadow-md hover:scale-[1.02] cursor-pointer
                    ${isSelected ? 'ring-2 ring-offset-1 ring-[#0d9488] dark:ring-[#2dd4bf] dark:ring-offset-[#1a1f1e]' : ''}
                  `}
                >
                  {/* Period label + status badge */}
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                        {getPeriodLabel(period, language)}
                      </div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                        {formatDate(period.periodStart, language)} – {formatDate(period.periodEnd, language)}
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${style.badge}`}>
                      <StatusIcon className="h-2.5 w-2.5" />
                      {getStatusLabel(status, language)}
                    </span>
                  </div>

                  {/* Deadline */}
                  {period.deadline && (
                    <div className={`flex items-center gap-1 text-[10px] ${style.text}`}>
                      <Clock className="h-2.5 w-2.5" />
                      <span>
                        {language === 'da' ? 'Frist' : 'Deadline'}: {formatDate(period.deadline, language)}
                      </span>
                    </div>
                  )}

                  {/* Selected indicator */}
                  {isSelected && (
                    <div className="absolute top-1 right-1">
                      <ChevronRight className="h-3 w-3 text-[#0d9488] dark:text-[#2dd4bf]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Helper text */}
        <div className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500">
          <Info className="h-3 w-3" />
          <span>
            {language === 'da'
              ? 'Klik på en periode for at vælge den og forberede momsangivelsen.'
              : 'Click a period to select it and prepare the VAT return.'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
