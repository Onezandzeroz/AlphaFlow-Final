'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/page-header';
import { MobileFilterDropdown } from '@/components/shared/mobile-filter-dropdown';
import { useDataVersion } from '@/hooks/use-data-version';
import { SecurityAlertsPanel } from '@/components/audit-log/security-alerts-panel';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Shield,
  Search,
  Filter,
  X,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Clock,
  Eye,
  FileJson,
  Monitor,
  Globe,
  ArrowRight,
  Copy,
  Check,
} from 'lucide-react';

// ─── Readable ID helper ─────────────────────────────────────────────────────

function ReadableId({ id, label }: { id: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const display = id.length > 12
    ? `${id.slice(0, 8)}…${id.slice(-4)}`
    : id;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: select text
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 text-xs bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 px-2 py-1 rounded font-mono text-gray-600 dark:text-gray-400 transition-colors cursor-pointer group"
            aria-label={label ? `Kopiér ${label}` : 'Kopiér ID'}
          >
            <span>{display}</span>
            {copied ? (
              <Check className="h-3 w-3 text-green-500 shrink-0" />
            ) : (
              <Copy className="h-3 w-3 text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="font-mono text-xs max-w-xs break-all">{id}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuditLog {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  changes: any; // Prisma Json field (already parsed)
  metadata: any; // Prisma Json field (already parsed)
  createdAt: string;
}

interface AuditLogResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

type ActionType =
  | 'CREATE'
  | 'UPDATE'
  | 'CANCEL'
  | 'DELETE_ATTEMPT'
  | 'LOGIN'
  | 'LOGOUT'
  | 'REGISTER'
  | 'BACKUP_CREATE'
  | 'BACKUP_RESTORE';

const ACTION_TYPES: ActionType[] = [
  'CREATE',
  'UPDATE',
  'CANCEL',
  'DELETE_ATTEMPT',
  'LOGIN',
  'LOGOUT',
  'REGISTER',
  'BACKUP_CREATE',
  'BACKUP_RESTORE',
];

const ENTITY_TYPES = [
  'Transaction',
  'Invoice',
  'CompanyInfo',
  'User',
  'Backup',
  'Auth',
  'Settings',
];

const ITEMS_PER_PAGE = 20;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getActionBadgeStyle(action: string): string {
  switch (action) {
    case 'CREATE':
      return 'bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/20';
    case 'UPDATE':
      return 'bg-sky-500/10 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400 border-sky-500/20';
    case 'CANCEL':
      return 'bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 border-orange-500/20';
    case 'DELETE_ATTEMPT':
      return 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/20';
    case 'LOGIN':
      return 'bg-gray-500/10 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400 border-gray-500/20';
    case 'LOGOUT':
      return 'bg-gray-500/10 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400 border-gray-500/20';
    case 'REGISTER':
      return 'bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/20';
    case 'BACKUP_CREATE':
      return 'bg-[#0d9488]/10 text-[#0d9488] dark:bg-[#0d9488]/20 dark:text-[#2dd4bf] border-[#0d9488]/20';
    case 'BACKUP_RESTORE':
      return 'bg-[#0d9488]/10 text-[#0d9488] dark:bg-[#0d9488]/20 dark:text-[#2dd4bf] border-[#0d9488]/20';
    default:
      return 'bg-gray-500/10 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400 border-gray-500/20';
  }
}

function getActionLabel(action: string, language: string): string {
  const labels: Record<string, { da: string; en: string }> = {
    CREATE: { da: 'Oprettet', en: 'Created' },
    UPDATE: { da: 'Opdateret', en: 'Updated' },
    CANCEL: { da: 'Annulleret', en: 'Cancelled' },
    DELETE_ATTEMPT: { da: 'Sletning', en: 'Delete Attempt' },
    LOGIN: { da: 'Log ind', en: 'Login' },
    LOGOUT: { da: 'Log ud', en: 'Logout' },
    REGISTER: { da: 'Registrering', en: 'Register' },
    BACKUP_CREATE: { da: 'Backup oprettet', en: 'Backup Created' },
    BACKUP_RESTORE: { da: 'Backup gendannet', en: 'Backup Restored' },
  };
  return labels[action]?.[language === 'da' ? 'da' : 'en'] || action;
}

function getEntityTypeLabel(entityType: string, language: string): string {
  const labels: Record<string, { da: string; en: string }> = {
    Transaction: { da: 'Postering', en: 'Transaction' },
    Invoice: { da: 'Faktura', en: 'Invoice' },
    CompanyInfo: { da: 'Virksomhed', en: 'Company Info' },
    User: { da: 'Bruger', en: 'User' },
    Backup: { da: 'Backup', en: 'Backup' },
    Auth: { da: 'Autentificering', en: 'Authentication' },
    Settings: { da: 'Indstillinger', en: 'Settings' },
  };
  return labels[entityType]?.[language === 'da' ? 'da' : 'en'] || entityType;
}

interface ChangeDiff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

function parseChanges(changes: unknown): ChangeDiff[] {
  if (!changes) return [];
  const parsed = changes;
  if (typeof parsed === 'object' && parsed !== null) {
    // If it has old/new structure
    if ((parsed as any).old !== undefined || (parsed as any).new !== undefined) {
      return Object.keys((parsed as any).old || {}).map((key) => ({
        field: key,
        oldValue: (parsed as any).old?.[key] ?? null,
        newValue: (parsed as any).new?.[key] ?? null,
      }));
    }
    // Otherwise treat as flat key-value changes
    return Object.entries(parsed as Record<string, unknown>).map(([field, value]) => ({
      field,
      oldValue: null,
      newValue: value,
    }));
  }
  return [];
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatTimestamp(iso: string, language: string): string {
  try {
    const date = new Date(iso);
    const dateStr = date.toLocaleDateString(
      language === 'da' ? 'da-DK' : 'en-GB',
      { day: 'numeric', month: 'short', year: 'numeric' }
    );
    const timeStr = date.toLocaleTimeString(
      language === 'da' ? 'da-DK' : 'en-GB',
      { hour: '2-digit', minute: '2-digit', second: '2-digit' }
    );
    return `${dateStr} ${timeStr}`;
  } catch {
    return iso;
  }
}

function formatRelativeTime(iso: string, language: string): string {
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (language === 'da') {
      if (diffSec < 60) return 'Lige nu';
      if (diffMin < 60) return `${diffMin} min siden`;
      if (diffHour < 24) return `${diffHour} time${diffHour > 1 ? 'r' : ''} siden`;
      if (diffDay < 7) return `${diffDay} dag${diffDay > 1 ? 'e' : ''} siden`;
      return date.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
    } else {
      if (diffSec < 60) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHour < 24) return `${diffHour}h ago`;
      if (diffDay < 7) return `${diffDay}d ago`;
      return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }
  } catch {
    return '';
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

interface AuditLogPageProps {
  user: User;
}

export function AuditLogPage({ user }: AuditLogPageProps) {
  const { language } = useTranslation();

  // State
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('ALL');
  const [entityIdSearch, setEntityIdSearch] = useState('');

  // Expanded rows & detail dialog
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [detailLog, setDetailLog] = useState<AuditLog | null>(null);

  const isDanish = language === 'da';

  // ─── Data Fetching ──────────────────────────────────────────────────────

  const fetchLogs = useCallback(async (currentPage: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(ITEMS_PER_PAGE),
      });
      if (actionFilter !== 'ALL') params.set('action', actionFilter);
      if (entityTypeFilter !== 'ALL') params.set('entityType', entityTypeFilter);

      const response = await fetch(`/api/audit-logs?${params.toString()}`);

      if (!response.ok) {
        throw new Error(isDanish ? 'Kunne ikke hente logge' : 'Failed to fetch logs');
      }

      const data: AuditLogResponse = await response.json();
      setLogs(data.logs);
      setTotal(data.total);
      setPage(data.page);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
      setError(err instanceof Error ? err.message : (isDanish ? 'Ukendt fejl' : 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [actionFilter, entityTypeFilter, isDanish]);

  // Auto-refresh audit logs when the server signals a significant financial
  // change (bumps the 'dashboard' scope as a proxy — there is no dedicated
  // audit-logs bump, but dashboard is invalidated on all significant changes).
  const dashboardVersion = useDataVersion('dashboard');

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs, dashboardVersion]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [actionFilter, entityTypeFilter]);

  // Client-side filter by entity ID search
  const filteredLogs = useMemo(() => {
    if (!entityIdSearch.trim()) return logs;
    const query = entityIdSearch.toLowerCase();
    return logs.filter(
      (log) =>
        log.entityId?.toLowerCase().includes(query) ||
        log.userId?.toLowerCase().includes(query)
    );
  }, [logs, entityIdSearch]);

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const clearFilters = () => {
    setActionFilter('ALL');
    setEntityTypeFilter('ALL');
    setEntityIdSearch('');
  };

  const hasActiveFilters = actionFilter !== 'ALL' || entityTypeFilter !== 'ALL' || entityIdSearch.trim() !== '';

  // ─── Stats ──────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const createCount = logs.filter((l) => l.action === 'CREATE').length;
    const updateCount = logs.filter((l) => l.action === 'UPDATE').length;
    const authCount = logs.filter((l) => l.action === 'LOGIN' || l.action === 'LOGOUT').length;
    const cancelCount = logs.filter((l) => l.action === 'CANCEL' || l.action === 'DELETE_ATTEMPT').length;
    return { createCount, updateCount, authCount, cancelCount };
  }, [logs]);

  // ─── Loading Skeleton ───────────────────────────────────────────────────

  if (isLoading && logs.length === 0) {
    return (
      <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>

        {/* Stats skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="stat-card">
              <CardContent className="p-4">
                <Skeleton className="h-10 w-10 rounded-full mb-2" />
                <Skeleton className="h-3 w-24 mb-1" />
                <Skeleton className="h-6 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters skeleton */}
        <Card className="stat-card">
          <CardContent className="p-4">
            <div className="flex flex-col lg:flex-row gap-4">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-36" />
              <Skeleton className="h-10 w-36" />
            </div>
          </CardContent>
        </Card>

        {/* Table skeleton */}
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardContent className="p-0">
            <div className="p-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-3 border-b border-gray-100/50 last:border-0">
                  <Skeleton className="h-4 w-44 shrink-0" />
                  <Skeleton className="h-6 w-20 shrink-0" />
                  <Skeleton className="h-4 w-24 shrink-0" />
                  <Skeleton className="h-4 w-20 shrink-0" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Main Render ────────────────────────────────────────────────────────

  return (
    <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
      <PageHeader
        title={isDanish ? 'Revisionslog' : 'Audit Log'}
        description={isDanish
          ? 'Sporede aktiviteter og ændringer i systemet'
          : 'Tracked activities and changes in the system'}
      />
      <div className="text-sm text-gray-500 dark:text-gray-400">
        {total} {isDanish ? 'logposter i alt' : 'log entries total'}
      </div>

      {/* Security Alerts Panel — automated log-monitor scan (Krav 18).
          Surfaced at the top so admins see critical/high alerts before
          scrolling through the raw AuditLog table. */}
      <SecurityAlertsPanel />

      {/* Summary Stats */}
      {logs.length > 0 && (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="stat-card">
          <CardContent className="p-2.5 sm:p-4">
            <div className="flex items-center justify-between">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <FileJson className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
              </div>
              <Badge className="bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 text-[10px] sm:text-xs">
                {stats.createCount}
              </Badge>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-[10px] sm:text-xs font-medium mt-1 sm:mt-2">
              {isDanish ? 'Oprettelser' : 'Creates'}
            </p>
            <p className="text-base sm:text-xl font-bold text-gray-900 dark:text-white">{stats.createCount}</p>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-2.5 sm:p-4">
            <div className="flex items-center justify-between">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-sky-500/10 flex items-center justify-center">
                <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 text-sky-600 dark:text-sky-400" />
              </div>
              <Badge className="bg-sky-500/10 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400 text-[10px] sm:text-xs">
                {stats.updateCount}
              </Badge>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-[10px] sm:text-xs font-medium mt-1 sm:mt-2">
              {isDanish ? 'Opdateringer' : 'Updates'}
            </p>
            <p className="text-base sm:text-xl font-bold text-gray-900 dark:text-white">{stats.updateCount}</p>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-2.5 sm:p-4">
            <div className="flex items-center justify-between">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-gray-500/10 flex items-center justify-center">
                <Monitor className="h-4 w-4 sm:h-5 sm:w-5 text-gray-600 dark:text-gray-400" />
              </div>
              <Badge className="bg-gray-500/10 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400 text-[10px] sm:text-xs">
                {stats.authCount}
              </Badge>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-[10px] sm:text-xs font-medium mt-1 sm:mt-2">
              {isDanish ? 'Auth-hændelser' : 'Auth Events'}
            </p>
            <p className="text-base sm:text-xl font-bold text-gray-900 dark:text-white">{stats.authCount}</p>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-2.5 sm:p-4">
            <div className="flex items-center justify-between">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <X className="h-4 w-4 sm:h-5 sm:w-5 text-red-600 dark:text-red-400" />
              </div>
              <Badge className="bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 text-[10px] sm:text-xs">
                {stats.cancelCount}
              </Badge>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-[10px] sm:text-xs font-medium mt-1 sm:mt-2">
              {isDanish ? 'Annulleringer' : 'Cancellations'}
            </p>
            <p className="text-base sm:text-xl font-bold text-gray-900 dark:text-white">{stats.cancelCount}</p>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Filters */}
      {logs.length > 0 && (
      <Card className="stat-card">
        <CardContent className="p-4 pb-2 lg:pb-4">
          <div className="flex flex-wrap gap-2 items-center">
            {/* Search - always visible */}
            <div className="relative flex-1 min-w-[140px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={isDanish ? 'Søg efter enheds-ID eller bruger-ID...' : 'Search by entity ID or user ID...'}
                value={entityIdSearch}
                onChange={(e) => setEntityIdSearch(e.target.value)}
                className="pl-9 bg-gray-50 dark:bg-white/[0.04] border-0"
              />
            </div>

            {/* Filter selects - mobile dropdown / desktop inline */}
            <MobileFilterDropdown
              activeFilterCount={(actionFilter !== 'ALL' ? 1 : 0) + (entityTypeFilter !== 'ALL' ? 1 : 0)}
              language={isDanish ? 'da' : 'en'}
              onClearFilters={clearFilters}
            >
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="shrink-0 w-auto min-w-[110px] bg-gray-50 dark:bg-white/[0.04] border-0">
                  <SelectValue placeholder={isDanish ? 'Handling' : 'Action'} />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-[#1a1f1e]" align="end">
                  <SelectItem value="ALL">
                    {isDanish ? 'Alle handlinger' : 'All Actions'}
                  </SelectItem>
                  {ACTION_TYPES.map((action) => (
                    <SelectItem key={action} value={action}>
                      {getActionLabel(action, language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
                <SelectTrigger className="shrink-0 w-auto min-w-[110px] bg-gray-50 dark:bg-white/[0.04] border-0">
                  <SelectValue placeholder={isDanish ? 'Entitetstype' : 'Entity Type'} />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-[#1a1f1e]" align="end">
                  <SelectItem value="ALL">
                    {isDanish ? 'Alle typer' : 'All Types'}
                  </SelectItem>
                  {ENTITY_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {getEntityTypeLabel(type, language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </MobileFilterDropdown>
          </div>

          {/* Results count */}
          <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            {isDanish ? 'Viser' : 'Showing'} {filteredLogs.length} {isDanish ? 'af' : 'of'} {total} {isDanish ? 'poster' : 'entries'}
            {hasActiveFilters && (
              <span className="ml-2">
                ({isDanish ? 'filtret' : 'filtered'})
              </span>
            )}
          </div>
        </CardContent>
      </Card>
      )}

      {/* Audit Log Table */}
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardContent className="p-0">
          {error ? (
            <div className="text-center py-12 text-red-500 dark:text-red-400">
              <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">{error}</p>
              <Button
                variant="link"
                onClick={() => fetchLogs(page)}
                className="text-[#0d9488] mt-2"
              >
                {isDanish ? 'Prøv igen' : 'Try Again'}
              </Button>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">
                {isDanish ? 'Ingen logposter fundet' : 'No log entries found'}
              </p>
              <p className="text-sm mt-1">
                {hasActiveFilters
                  ? isDanish
                    ? 'Prøv at ændre dine filtre'
                    : 'Try adjusting your filters'
                  : isDanish
                    ? 'Aktiviteter vil blive vist her'
                    : 'Activities will appear here'}
              </p>
              {hasActiveFilters && (
                <Button
                  variant="link"
                  onClick={clearFilters}
                  className="text-[#0d9488] mt-2"
                >
                  {isDanish ? 'Ryd filtre' : 'Clear Filters'}
                </Button>
              )}
            </div>
          ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-gray-100 dark:border-gray-800">
                    <TableHead className="bg-gray-50 dark:bg-gray-700/50 w-8" />
                    <TableHead className="bg-gray-50 dark:bg-gray-700/50">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {isDanish ? 'Tidspunkt' : 'Timestamp'}
                      </div>
                    </TableHead>
                    <TableHead className="bg-gray-50 dark:bg-gray-700/50">
                      {isDanish ? 'Handling' : 'Action'}
                    </TableHead>
                    <TableHead className="bg-gray-50 dark:bg-gray-700/50 hidden sm:table-cell">
                      {isDanish ? 'Entitetstype' : 'Entity Type'}
                    </TableHead>
                    <TableHead className="bg-gray-50 dark:bg-gray-700/50 hidden md:table-cell">
                      {isDanish ? 'Entitets-ID' : 'Entity ID'}
                    </TableHead>
                    <TableHead className="bg-gray-50 dark:bg-gray-700/50 hidden lg:table-cell">
                      {isDanish ? 'Ændringer' : 'Changes'}
                    </TableHead>
                    <TableHead className="bg-gray-50 dark:bg-gray-700/50 text-right">
                      <div className="flex items-center gap-1 ml-auto">
                        <Globe className="h-3.5 w-3.5" />
                        {isDanish ? 'Detaljer' : 'Details'}
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => {
                    const changes = parseChanges(log.changes);
                    const isExpanded = expandedRows.has(log.id);
                    const metadata = (log.metadata as Record<string, any>) || {};

                    return (
                      <>
                        <TableRow
                          key={log.id}
                          className="border-b border-gray-50/50 hover:bg-gray-50 dark:hover:bg-white/5"
                        >
                          {/* Expand toggle */}
                          <TableCell className="w-8 px-2">
                            <button
                              onClick={() => toggleRow(log.id)}
                              className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                              aria-label={isExpanded ? 'Collapse' : 'Expand'}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-gray-400" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-gray-400" />
                              )}
                            </button>
                          </TableCell>

                          {/* Timestamp */}
                          <TableCell className="whitespace-nowrap">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="text-sm font-medium text-gray-900 dark:text-white cursor-default">
                                    {formatRelativeTime(log.createdAt, language)}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{formatTimestamp(log.createdAt, language)}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>

                          {/* Action */}
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-[10px] sm:text-xs font-medium gap-1 ${getActionBadgeStyle(log.action)}`}
                            >
                              {getActionLabel(log.action, language)}
                            </Badge>
                          </TableCell>

                          {/* Entity type (hidden on mobile) */}
                          <TableCell className="hidden sm:table-cell">
                            <span className="text-sm text-gray-600 dark:text-gray-300">
                              {getEntityTypeLabel(log.entityType, language)}
                            </span>
                          </TableCell>

                          {/* Entity ID (hidden on small screens) */}
                          <TableCell className="hidden md:table-cell">
                            {log.entityId ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <code className="text-xs bg-gray-100 dark:bg-white/5 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-400 font-mono max-w-[120px] truncate inline-block">
                                      {log.entityId.length > 12
                                        ? `${log.entityId.slice(0, 8)}...${log.entityId.slice(-4)}`
                                        : log.entityId}
                                    </code>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="font-mono text-xs">{log.entityId}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </TableCell>

                          {/* Changes summary (hidden on medium screens) */}
                          <TableCell className="hidden lg:table-cell">
                            {changes.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {changes.slice(0, 3).map((change, idx) => (
                                  <Badge
                                    key={idx}
                                    variant="outline"
                                    className="text-[10px] font-normal bg-sky-500/5 text-sky-600 dark:text-sky-400 border-sky-500/10"
                                  >
                                    {change.field}
                                  </Badge>
                                ))}
                                {changes.length > 3 && (
                                  <Badge variant="outline" className="text-[10px] font-normal bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 border-0">
                                    +{changes.length - 3}
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </TableCell>

                          {/* Detail button */}
                          <TableCell className="text-right">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setDetailLog(log)}
                                    className="text-gray-400 hover:text-[#0d9488] dark:hover:text-[#2dd4bf]"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{isDanish ? 'Vis detaljer' : 'View details'}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                        </TableRow>

                        {/* Expanded row — show changes diff */}
                        {isExpanded && (
                          <TableRow key={`${log.id}-expanded`} className="bg-gray-50/50 dark:bg-white/[0.03]">
                            <TableCell colSpan={7} className="p-0">
                              <div className="px-4 py-3 sm:px-6">
                                {/* Mobile-only entity info */}
                                <div className="sm:hidden flex flex-wrap gap-2 mb-3 text-xs text-gray-500 dark:text-gray-400">
                                  <span className="font-medium">
                                    {getEntityTypeLabel(log.entityType, language)}
                                  </span>
                                  {log.entityId && (
                                    <code className="bg-gray-100 dark:bg-white/5 px-1.5 py-0.5 rounded font-mono dark:text-gray-400">
                                      {log.entityId.length > 20
                                        ? `${log.entityId.slice(0, 12)}...`
                                        : log.entityId}
                                    </code>
                                  )}
                                </div>

                                {changes.length > 0 ? (
                                  <div className="space-y-2">
                                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                      {isDanish ? 'Fielddiff' : 'Field Changes'}
                                    </p>
                                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                                      {changes.map((change, idx) => (
                                        <div
                                          key={idx}
                                          className={`flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 px-3 py-2 text-sm ${
                                            idx > 0 ? 'border-t border-gray-100/50' : ''
                                          }`}
                                        >
                                          <span className="font-medium text-gray-700 dark:text-gray-300 min-w-[100px] sm:min-w-[140px] text-xs">
                                            {change.field}
                                          </span>
                                          <div className="flex items-center gap-2 text-xs">
                                            {change.oldValue !== null && (
                                              <>
                                                <span className="text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-1.5 py-0.5 rounded font-mono truncate max-w-[200px]">
                                                  {formatValue(change.oldValue)}
                                                </span>
                                                <ArrowRight className="h-3 w-3 text-gray-400 shrink-0" />
                                              </>
                                            )}
                                            <span className="text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10 px-1.5 py-0.5 rounded font-mono truncate max-w-[200px]">
                                              {formatValue(change.newValue)}
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 text-sm text-gray-400">
                                    <FileJson className="h-4 w-4" />
                                    <span>{isDanish ? 'Ingen feltændringer registreret' : 'No field changes recorded'}</span>
                                  </div>
                                )}

                                {/* Metadata summary in expanded row */}
                                {Object.keys(metadata).length > 0 && (
                                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                                    {metadata.ip && (
                                      <div className="flex items-center gap-1">
                                        <Globe className="h-3 w-3" />
                                        <span>{metadata.ip}</span>
                                      </div>
                                    )}
                                    {metadata.userAgent && (
                                      <div className="flex items-center gap-1 max-w-[300px]">
                                        <Monitor className="h-3 w-3 shrink-0" />
                                        <span className="truncate">{metadata.userAgent}</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isDanish ? 'Side' : 'Page'} {page} {isDanish ? 'af' : 'of'} {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchLogs(page - 1)}
              disabled={page <= 1 || isLoading}
              className="gap-1 dark:text-gray-300"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{isDanish ? 'Forrige' : 'Previous'}</span>
            </Button>

            {/* Page numbers */}
            <div className="hidden sm:flex items-center gap-1">
              {Array.from({ length: Math.min(totalPages, 7) }, (_, idx) => {
                let pageNum: number;
                if (totalPages <= 7) {
                  pageNum = idx + 1;
                } else if (page <= 4) {
                  pageNum = idx + 1;
                } else if (page >= totalPages - 3) {
                  pageNum = totalPages - 6 + idx;
                } else {
                  pageNum = page - 3 + idx;
                }
                return (
                  <Button
                    key={pageNum}
                    variant={pageNum === page ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => fetchLogs(pageNum)}
                    disabled={isLoading}
                    className={
                      pageNum === page
                        ? 'bg-[#0d9488] hover:bg-[#0d9488]/90 text-white min-w-[36px]'
                        : 'min-w-[36px] dark:text-gray-300'
                    }
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchLogs(page + 1)}
              disabled={page >= totalPages || isLoading}
              className="gap-1 dark:text-gray-300"
            >
              <span className="hidden sm:inline">{isDanish ? 'Næste' : 'Next'}</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detailLog} onOpenChange={(open) => { if (!open) setDetailLog(null); }}>
        <DialogContent className="bg-white dark:bg-[#1a1f1e] max-w-2xl max-h-[85vh] overflow-hidden p-0 gap-0">
          {detailLog && (() => {
            const meta = detailLog.metadata as Record<string, any> | null;

            // ── Syntax-highlighted value renderer ────────────────────────
            const renderPrimitiveValue = (value: unknown): React.ReactNode => {
              if (value === null) {
                return <span className="text-gray-400 dark:text-gray-500 italic">null</span>;
              }
              if (value === undefined) {
                return <span className="text-gray-400 dark:text-gray-500 italic">undefined</span>;
              }
              if (typeof value === 'boolean') {
                return <span className="text-gray-500 dark:text-gray-400">{String(value)}</span>;
              }
              if (typeof value === 'number') {
                return <span className="text-teal-600 dark:text-teal-400">{value}</span>;
              }
              if (typeof value === 'string') {
                return <span className="text-green-600 dark:text-green-400">&quot;{value}&quot;</span>;
              }
              return <span className="text-gray-600 dark:text-gray-400">{JSON.stringify(value)}</span>;
            };

            const isComplexValue = (value: unknown): boolean => {
              return value !== null && typeof value === 'object' && !Array.isArray(value);
            };

            const isArrayValue = (value: unknown): boolean => {
              return Array.isArray(value);
            };

            // ── Recursive key-value pair renderer ────────────────────────
            const renderKeyValuePairs = (
              data: Record<string, any> | any[],
              depth: number = 0
            ): React.ReactNode => {
              const entries = Array.isArray(data)
                ? data.map((v, i) => [String(i), v] as [string, any])
                : Object.entries(data as Record<string, any>);

              if (entries.length === 0) {
                return (
                  <span className="text-gray-400 dark:text-gray-500 italic text-xs pl-2">
                    {Array.isArray(data) ? '[]' : '{}'}
                  </span>
                );
              }

              return (
                <div className={depth > 0 ? 'ml-4 border-l border-gray-200 dark:border-gray-700 pl-3' : ''}>
                  {entries.map(([key, value], idx) => {
                    const isComplex = isComplexValue(value);
                    const isArr = isArrayValue(value);

                    return (
                      <div
                        key={`${key}-${idx}`}
                        className={`py-2 px-3 rounded-md ${
                          idx % 2 === 0
                            ? 'bg-gray-50/70 dark:bg-white/[0.02]'
                            : 'bg-transparent'
                        } ${depth === 0 && idx > 0 ? 'mt-0.5' : ''}`}
                      >
                        {isComplex || isArr ? (
                          <details className="group">
                            <summary className="flex items-center gap-2 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
                              <ChevronRight className="h-3 w-3 text-gray-400 dark:text-gray-500 shrink-0 transition-transform group-open:rotate-90" />
                              <span className="inline-flex items-center rounded-full bg-gray-200/70 dark:bg-gray-700/50 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-400 font-mono">
                                {key}
                              </span>
                              <span className="text-xs text-gray-400 dark:text-gray-500">
                                {isArr ? `[${(value as any[]).length}]` : `{${Object.keys(value as Record<string, any>).length}}`}
                              </span>
                            </summary>
                            <div className="mt-1.5">
                              {renderKeyValuePairs(value, depth + 1)}
                            </div>
                          </details>
                        ) : (
                          <div className="flex items-start gap-3 min-w-0">
                            <span className="inline-flex items-center shrink-0 rounded-full bg-gray-200/70 dark:bg-gray-700/50 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-400 font-mono">
                              {key}
                            </span>
                            <span className="text-xs font-mono break-all leading-relaxed">
                              {renderPrimitiveValue(value)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            };

            return (
              <>
                {/* ── Gradient Accent Bar ──────────────────────────── */}
                <div className="h-1.5 w-full bg-gradient-to-r from-[#0d9488] via-teal-400 to-emerald-400 shrink-0" />

                <div className="overflow-y-auto max-h-[calc(85vh-6px)] px-6 py-5 space-y-5">
                  {/* ── Header ────────────────────────────────────── */}
                  <div>
                    <DialogHeader>
                      <DialogTitle className="dark:text-white flex items-center gap-2.5 text-lg">
                        <Shield className="h-5 w-5 text-[#0d9488]" />
                        {isDanish ? 'Logdetaljer' : 'Log Entry Details'}
                      </DialogTitle>
                      <DialogDescription className="sr-only">
                        {formatTimestamp(detailLog.createdAt, language)}
                      </DialogDescription>
                    </DialogHeader>

                    {/* Action badge + Entity type + Timestamp — one clean row */}
                    <div className="flex flex-wrap items-center gap-2.5 mt-3">
                      <Badge
                        variant="outline"
                        className={`text-xs font-semibold px-2.5 py-0.5 ${getActionBadgeStyle(detailLog.action)}`}
                      >
                        {getActionLabel(detailLog.action, language)}
                      </Badge>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                        {getEntityTypeLabel(detailLog.entityType, language)}
                      </span>
                      <span className="mx-1 text-gray-300 dark:text-gray-600">·</span>
                      <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                        <Clock className="h-3.5 w-3.5" />
                        {formatTimestamp(detailLog.createdAt, language)}
                      </span>
                    </div>
                  </div>

                  <Separator className="bg-gray-200/80 dark:bg-gray-700/60" />

                  {/* ── IDs Section ───────────────────────────────── */}
                  <div className="rounded-xl bg-gray-50/80 dark:bg-white/[0.03] p-4 space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      {isDanish ? 'Identifikatorer' : 'Identifiers'}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs text-gray-400 dark:text-gray-500 min-w-[65px]">
                          {isDanish ? 'Log-ID' : 'Log ID'}
                        </span>
                        <ReadableId id={detailLog.id} label={isDanish ? 'Log-ID' : 'Log ID'} />
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs text-gray-400 dark:text-gray-500 min-w-[65px]">
                          {isDanish ? 'Bruger-ID' : 'User ID'}
                        </span>
                        <ReadableId id={detailLog.userId} label={isDanish ? 'Bruger-ID' : 'User ID'} />
                      </div>
                      {detailLog.entityId && (
                        <div className="flex items-center gap-2.5 sm:col-span-2">
                          <span className="text-xs text-gray-400 dark:text-gray-500 min-w-[65px]">
                            {isDanish ? 'Entitets-ID' : 'Entity ID'}
                          </span>
                          <ReadableId id={detailLog.entityId} label={isDanish ? 'Entitets-ID' : 'Entity ID'} />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── JSON-ændringer ─────────────────────────── */}
                  {detailLog.changes && (() => {
                    let parsed: any;
                    try {
                      parsed = typeof detailLog.changes === 'string'
                        ? JSON.parse(detailLog.changes)
                        : detailLog.changes;
                    } catch {
                      return null;
                    }
                    if (!parsed || typeof parsed !== 'object') return null;

                    const hasOldNew = parsed.old !== undefined || parsed.new !== undefined;

                    return (
                      <>
                        <Separator className="bg-gray-200/80 dark:bg-gray-700/60" />
                        <div className="rounded-xl bg-gray-50/80 dark:bg-white/[0.03] p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <FileJson className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                              {isDanish ? 'Log-ændringer' : 'Log Changes'}
                            </p>
                          </div>
                          <div>
                            {hasOldNew ? (
                              <div className="space-y-3">
                                {parsed.old && (
                                  <div>
                                    <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-400 mb-2">
                                      {isDanish ? 'Tidligere' : 'Before'}
                                    </span>
                                    <div className="rounded-lg border border-gray-200/80 dark:border-gray-700/50 overflow-hidden">
                                      {renderKeyValuePairs(parsed.old as Record<string, any>, 0)}
                                    </div>
                                  </div>
                                )}
                                {parsed.new && (
                                  <div>
                                    <span className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-green-600 dark:text-green-400 mb-2">
                                      {isDanish ? 'Ny' : 'After'}
                                    </span>
                                    <div className="rounded-lg border border-gray-200/80 dark:border-gray-700/50 overflow-hidden">
                                      {renderKeyValuePairs(parsed.new as Record<string, any>, 0)}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="rounded-lg border border-gray-200/80 dark:border-gray-700/50 overflow-hidden">
                                {renderKeyValuePairs(parsed, 0)}
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    );
                  })()}

                  {/* ── Metadata Section ───────────────────────────── */}
                  {meta && Object.keys(meta).length > 0 && (
                    <>
                      <Separator className="bg-gray-200/80 dark:bg-gray-700/60" />
                      <div className="rounded-xl bg-gray-50/80 dark:bg-white/[0.03] p-4 space-y-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                          {isDanish ? 'Metadata' : 'Metadata'}
                        </p>
                        <div className="rounded-lg border border-gray-200/80 dark:border-gray-700/50 overflow-hidden">
                          {renderKeyValuePairs(meta, 0)}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
