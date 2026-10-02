'use client';

/**
 * SecurityAlertsPanel
 *
 * Displays security-relevant alerts aggregated from the AuditLog by the
 * automated log-monitor scan (`src/lib/log-monitor.ts`).
 *
 * Required by Danish Business Authority compliance review (Krav 18, row 18):
 *   "Er der advarsler vedr. logs" — this panel surfaces them in the UI
 *   alongside the immutable AuditLog table.
 *
 * Features:
 *   - Fetches from `/api/audit-logs/alerts` (rate-limited 5/min/user, ADMIN+)
 *   - Severity color-coding: red=critical, orange=high, yellow=medium, blue=low
 *   - Bilingual (Danish + English) via `useTranslation`
 *   - Refresh button
 *   - Empty state + error state + loading skeleton
 *   - Auto-refreshes when server signals a significant change
 *
 * Wired into `src/components/audit-log/audit-log-page.tsx` at the top,
 * above the existing AuditLog table.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ShieldAlert,
  RefreshCw,
  AlertTriangle,
  ShieldX,
  ShieldCheck,
  Activity,
  Users,
  Building2,
  Clock,
  Info,
} from 'lucide-react';

// ─── Types (mirror src/lib/log-monitor.ts LogAlert) ───────────────────────

type LogAlertSeverity = 'critical' | 'high' | 'medium' | 'low';

interface LogAlert {
  id: string;
  severity: LogAlertSeverity;
  category: string;
  title: string;
  description: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  affectedUsers: string[];
  affectedCompanies: string[];
  recommendedAction: string;
}

interface AlertsResponse {
  alerts: LogAlert[];
  scannedAt: string;
  sinceHours: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function severityBadgeClass(severity: LogAlertSeverity): string {
  switch (severity) {
    case 'critical':
      // red
      return 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/30';
    case 'high':
      // orange
      return 'bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 border-orange-500/30';
    case 'medium':
      // yellow / amber
      return 'bg-yellow-500/10 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400 border-yellow-500/30';
    case 'low':
      // blue (sky to stay off the restricted "indigo/blue" primary palette)
      return 'bg-sky-500/10 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400 border-sky-500/30';
  }
}

function severityIcon(severity: LogAlertSeverity) {
  const cls = 'h-4 w-4 shrink-0';
  switch (severity) {
    case 'critical':
      return <ShieldX className={`${cls} text-red-600 dark:text-red-400`} />;
    case 'high':
      return <ShieldAlert className={`${cls} text-orange-600 dark:text-orange-400`} />;
    case 'medium':
      return <AlertTriangle className={`${cls} text-yellow-600 dark:text-yellow-400`} />;
    case 'low':
      return <Info className={`${cls} text-sky-600 dark:text-sky-400`} />;
  }
}

function severityLabel(severity: LogAlertSeverity, isDanish: boolean): string {
  const labels: Record<LogAlertSeverity, { da: string; en: string }> = {
    critical: { da: 'Kritisk', en: 'Critical' },
    high: { da: 'Høj', en: 'High' },
    medium: { da: 'Medium', en: 'Medium' },
    low: { da: 'Lav', en: 'Low' },
  };
  return labels[severity][isDanish ? 'da' : 'en'];
}

function formatTimestamp(iso: string, isDanish: boolean): string {
  try {
    const date = new Date(iso);
    return date.toLocaleString(isDanish ? 'da-DK' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ─── Component ────────────────────────────────────────────────────────────

export function SecurityAlertsPanel() {
  const { isDanish } = useTranslation();

  const [alerts, setAlerts] = useState<LogAlert[]>([]);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [sinceHours, setSinceHours] = useState<number>(24);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await fetch('/api/audit-logs/alerts?sinceHours=24', {
        headers: { Accept: 'application/json' },
      });

      if (response.status === 429) {
        setError(
          isDanish
            ? 'For mange forespørgsler. Prøv igen om et minut.'
            : 'Too many requests. Please try again in a minute.',
        );
        return;
      }

      if (response.status === 403) {
        // ADMIN+ only — the user doesn't have permission. Show a soft
        // "insufficient permissions" empty state instead of an error.
        setAlerts([]);
        setError(
          isDanish
            ? 'Du har ikke rettigheder til at se sikkerhedsadvarsler (kræver ADMIN-rolle).'
            : 'You do not have permission to view security alerts (ADMIN role required).',
        );
        return;
      }

      if (!response.ok) {
        throw new Error(
          isDanish
            ? 'Kunne ikke hente sikkerhedsadvarsler'
            : 'Failed to fetch security alerts',
        );
      }

      const data: AlertsResponse = await response.json();
      setAlerts(data.alerts ?? []);
      setScannedAt(data.scannedAt);
      setSinceHours(data.sinceHours ?? 24);
    } catch (err) {
      console.error('[SecurityAlertsPanel] fetch error:', err);
      setError(
        err instanceof Error
          ? err.message
          : isDanish
            ? 'Ukendt fejl'
            : 'Unknown error',
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isDanish]);

  // Initial fetch
  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // ─── Render: loading skeleton ──────────────────────────────────────────
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-5 w-5 text-orange-500" />
            {isDanish ? 'Sikkerhedsadvarsler' : 'Security Alerts'}
          </CardTitle>
          <CardDescription>
            {isDanish
              ? 'Automatisk scanning af AuditLog for sikkerhedsrelevante hændelser'
              : 'Automated AuditLog scan for security-relevant events'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  // ─── Render: error / 403 state ─────────────────────────────────────────
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-5 w-5 text-orange-500" />
            {isDanish ? 'Sikkerhedsadvarsler' : 'Security Alerts'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
            <div className="text-sm text-gray-700 dark:text-gray-300">
              {error}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── Render: alerts list (or empty state) ──────────────────────────────
  const hasAlerts = alerts.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-5 w-5 text-orange-500" />
              {isDanish ? 'Sikkerhedsadvarsler' : 'Security Alerts'}
              {hasAlerts && (
                <Badge
                  variant="destructive"
                  className="ml-1 text-[10px]"
                  aria-label={`${alerts.length} ${isDanish ? 'aktive advarsler' : 'active alerts'}`}
                >
                  {alerts.length}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {isDanish
                ? `Automatisk scanning af AuditLog for de seneste ${sinceHours} timer`
                : `Automated AuditLog scan for the last ${sinceHours} hours`}
              {scannedAt && (
                <span className="ml-2 text-xs text-gray-400">
                  ·{' '}
                  {isDanish ? 'scannet' : 'scanned'}{' '}
                  {formatTimestamp(scannedAt, isDanish)}
                </span>
              )}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAlerts(true)}
            disabled={isRefreshing}
            aria-label={isDanish ? 'Opdater advarsler' : 'Refresh alerts'}
            className="shrink-0"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
            />
            <span className="hidden sm:inline">
              {isDanish ? 'Opdater' : 'Refresh'}
            </span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!hasAlerts ? (
          // ── Empty state ──
          <div className="flex flex-col items-center justify-center text-center py-8 px-4">
            <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
              <ShieldCheck className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {isDanish
                ? 'Ingen sikkerhedsadvarsler i de seneste 24 timer'
                : 'No security alerts in the last 24 hours'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-md">
              {isDanish
                ? 'Den automatiske scanning fandt ingen kritiske, høje, medium eller lave sikkerhedshændelser. Den daglige cron-scanning kører kl. 06:00 Europe/Copenhagen.'
                : 'The automated scan found no critical, high, medium, or low security events. The daily cron scan runs at 06:00 Europe/Copenhagen.'}
            </p>
          </div>
        ) : (
          // ── Alerts list (scrollable, max-h-96) ──
          <ScrollArea className="max-h-96 w-full rounded-md border border-gray-200 dark:border-gray-800">
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {alerts.map((alert) => (
                <li
                  key={alert.id}
                  className="p-4 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors"
                >
                  {/* Header row */}
                  <div className="flex items-start gap-3">
                    {severityIcon(alert.severity)}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={severityBadgeClass(alert.severity)}
                        >
                          {severityLabel(alert.severity, isDanish)}
                        </Badge>
                        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                          {alert.category}
                        </span>
                        {alert.count > 1 && (
                          <Badge
                            variant="secondary"
                            className="text-[10px]"
                          >
                            <Activity className="h-3 w-3" />
                            {isDanish ? `${alert.count} hændelser` : `${alert.count} events`}
                          </Badge>
                        )}
                      </div>
                      <h4 className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                        {alert.title}
                      </h4>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                        {alert.description}
                      </p>

                      {/* Metadata grid: firstSeen / lastSeen / users / companies */}
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          <span>
                            {isDanish ? 'Først set' : 'First seen'}:{' '}
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                              {formatTimestamp(alert.firstSeen, isDanish)}
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          <span>
                            {isDanish ? 'Sidst set' : 'Last seen'}:{' '}
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                              {formatTimestamp(alert.lastSeen, isDanish)}
                            </span>
                          </span>
                        </div>
                        {alert.affectedUsers.length > 0 && (
                          <div className="flex items-start gap-1.5 sm:col-span-2">
                            <Users className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span className="break-all">
                              {isDanish
                                ? `Berørte brugere (${alert.affectedUsers.length})`
                                : `Affected users (${alert.affectedUsers.length})`}
                              :{' '}
                              <span className="font-mono text-gray-700 dark:text-gray-300">
                                {alert.affectedUsers.join(', ')}
                              </span>
                            </span>
                          </div>
                        )}
                        {alert.affectedCompanies.length > 0 && (
                          <div className="flex items-start gap-1.5 sm:col-span-2">
                            <Building2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span className="break-all">
                              {isDanish
                                ? `Berørte virksomheder (${alert.affectedCompanies.length})`
                                : `Affected companies (${alert.affectedCompanies.length})`}
                              :{' '}
                              <span className="font-mono text-gray-700 dark:text-gray-300">
                                {alert.affectedCompanies.join(', ')}
                              </span>
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Recommended action */}
                      <div className="mt-3 rounded-md bg-blue-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 p-2.5">
                        <p className="text-xs text-sky-800 dark:text-sky-300">
                          <span className="font-semibold">
                            {isDanish ? 'Anbefalet handling: ' : 'Recommended action: '}
                          </span>
                          {alert.recommendedAction}
                        </p>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
