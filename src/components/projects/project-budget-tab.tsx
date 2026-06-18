'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { isProjectAccount } from '@/lib/project-chart-constants';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { useWriteAccessGuard } from '@/hooks/use-write-access-guard';
import {
  Plus,
  Trash2,
  Save,
  Loader2,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────

interface BudgetEntry {
  id: string;
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
  accountGroup: string;
  budget: Record<string, number>;
  actual: Record<string, number>;
  variance: Record<string, number>;
  totalBudget: number;
  totalActual: number;
  totalVariance: number;
}

interface BudgetSummary {
  totalBudget: number;
  totalActual: number;
  totalVariance: number;
  byType: Record<string, { budget: number; actual: number; variance: number }>;
}

interface AccountOption {
  id: string;
  number: string;
  name: string;
  type: string;
  group: string;
  isProject?: boolean;
}

interface FormEntry {
  accountId: string;
  january: number;
  february: number;
  march: number;
  april: number;
  may: number;
  june: number;
  july: number;
  august: number;
  september: number;
  october: number;
  november: number;
  december: number;
}

interface ProjectBudgetTabProps {
  projectId: string;
  companyId: string;
  user: { id: string; isSuperDev?: boolean; hasAppOwner?: boolean; activeCompanyName?: string | null };
}

// ─── Constants ───────────────────────────────────────────────────────

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
] as const;

const MONTH_LABELS_DA = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
const MONTH_LABELS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ACCOUNT_TYPE_ORDER = ['REVENUE', 'EXPENSE', 'ASSET', 'LIABILITY', 'EQUITY'] as const;

// ─── Helpers ─────────────────────────────────────────────────────────

function getAccountTypeLabel(type: string, language: 'da' | 'en'): string {
  const labels: Record<string, { da: string; en: string }> = {
    REVENUE: { da: 'Indtægter', en: 'Revenue' },
    EXPENSE: { da: 'Udgifter', en: 'Expenses' },
    ASSET: { da: 'Aktiver', en: 'Assets' },
    LIABILITY: { da: 'Passiver', en: 'Liabilities' },
    EQUITY: { da: 'Egenkapital', en: 'Equity' },
  };
  return labels[type]?.[language] || type;
}

function getAccountTypeHeaderBg(type: string): string {
  switch (type) {
    case 'ASSET': return 'bg-[#e8f2f4] dark:bg-[#7dabb5]/10';
    case 'LIABILITY': return 'bg-amber-50 dark:bg-amber-500/10';
    case 'EQUITY': return 'bg-[#e6f7f3] dark:bg-[#0d9488]/10';
    case 'REVENUE': return 'bg-emerald-50 dark:bg-emerald-500/10';
    case 'EXPENSE': return 'bg-red-50 dark:bg-red-500/10';
    default: return 'bg-gray-50 dark:bg-gray-800';
  }
}

/**
 * Determines whether a variance is "favorable" for the given account type.
 *
 * Variance is computed as (actual − budget) in the backend, using each
 * account type's natural balance direction. So the SIGN of the variance
 * already reflects whether it's favorable:
 *   - positive variance → favorable for REVENUE/ASSET/EQUITY (more than budget)
 *   - negative variance → favorable for EXPENSE/LIABILITY (less than budget)
 */
function isFavorableVariance(variance: number, accountType: string): boolean {
  if (variance === 0) return true;
  if (accountType === 'REVENUE' || accountType === 'ASSET' || accountType === 'EQUITY') {
    return variance > 0;
  }
  // EXPENSE, LIABILITY
  return variance < 0;
}

function createEmptyFormEntry(): FormEntry {
  return {
    accountId: '',
    january: 0, february: 0, march: 0, april: 0, may: 0, june: 0,
    july: 0, august: 0, september: 0, october: 0, november: 0, december: 0,
  };
}

// ─── Component ───────────────────────────────────────────────────────

export function ProjectBudgetTab({ projectId, companyId, user }: ProjectBudgetTabProps) {
  const { t, tc, language } = useTranslation();
  const isDa = language === 'da';
  const { guardWriteAccess } = useWriteAccessGuard(user);

  // State
  const [entries, setEntries] = useState<BudgetEntry[]>([]);
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Year
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Add account dialog
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [newAccountId, setNewAccountId] = useState('');
  const [showAddRow, setShowAddRow] = useState(false);

  // Editing state — map of "accountId-month" → edited value
  const [editValues, setEditValues] = useState<Record<string, number>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // ── Fetch budget entries ──
  const fetchBudget = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/budget?year=${selectedYear}`);
      if (!res.ok) throw new Error(isDa ? 'Kunne ikke hente budget' : 'Failed to fetch budget');
      const data = await res.json();
      setEntries(data.entries || []);
      setSummary(data.summary || null);
    } catch (err) {
      console.error('Failed to fetch project budget:', err);
      setError(err instanceof Error ? err.message : (isDa ? 'Ukendt fejl' : 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [projectId, selectedYear, isDa]);

  // ── Fetch accounts ──
  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts');
      if (!res.ok) throw new Error('Failed to fetch accounts');
      const data = await res.json();
      // Sort project-relevant accounts first so they appear at the top
      // of the account selector when building a project budget.
      const mapped = (data.accounts || []).map((a: { id: string; number: string; name: string; type: string; group: string }) => ({
        id: a.id,
        number: a.number,
        name: a.name,
        type: a.type,
        group: a.group,
        isProject: isProjectAccount(a.number),
      }));
      mapped.sort((a: { isProject: boolean; number: string }, b: { isProject: boolean; number: string }) => {
        if (a.isProject !== b.isProject) return a.isProject ? -1 : 1;
        return a.number.localeCompare(b.number, undefined, { numeric: true });
      });
      setAccounts(mapped);
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
    }
  }, []);

  useEffect(() => {
    fetchBudget();
  }, [fetchBudget]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // ── Grouped entries ──
  const groupedEntries = useMemo(() => {
    const groups: Record<string, BudgetEntry[]> = {};
    for (const type of ACCOUNT_TYPE_ORDER) {
      const filtered = entries
        .filter((e) => e.accountType === type)
        .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
      if (filtered.length > 0) {
        groups[type] = filtered;
      }
    }
    return ACCOUNT_TYPE_ORDER
      .filter((type) => groups[type])
      .map((type) => ({
        type,
        label: getAccountTypeLabel(type, language),
        entries: groups[type],
        totalBudget: groups[type].reduce((sum, e) => sum + Number(e.totalBudget), 0),
        totalActual: groups[type].reduce((sum, e) => sum + Number(e.totalActual), 0),
        totalVariance: groups[type].reduce((sum, e) => sum + Number(e.totalVariance), 0),
      }));
  }, [entries, language]);

  // ── Available accounts (not yet added) ──
  const usedAccountIds = useMemo(() => new Set(entries.map((e) => e.accountId)), [entries]);
  const availableAccounts = useMemo(
    () => accounts.filter((a) => !usedAccountIds.has(a.id)),
    [accounts, usedAccountIds]
  );

  // ── Variance color helper ──
  const varianceClass = (variance: number, accountType: string): string => {
    if (variance === 0) return 'text-gray-500 dark:text-gray-400';
    return isFavorableVariance(variance, accountType)
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-red-600 dark:text-red-400';
  };

  // ── Edit handler ──
  const handleCellEdit = (accountId: string, month: string, value: string) => {
    const numVal = value === '' ? 0 : Number(value);
    if (isNaN(numVal)) return;
    setEditValues((prev) => ({ ...prev, [`${accountId}-${month}`]: numVal }));
    setHasChanges(true);
  };

  const getCellValue = (accountId: string, month: string, original: number): number => {
    const key = `${accountId}-${month}`;
    return key in editValues ? editValues[key] : original;
  };

  // ── Save handler ──
  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Build entries array from current editValues merged with original data
      const accountMap = new Map<string, Record<string, number>>();
      for (const [key, value] of Object.entries(editValues)) {
        const [accountId, month] = key.split('-');
        if (!accountMap.has(accountId)) accountMap.set(accountId, {});
        accountMap.get(accountId)![month] = value;
      }

      // Also include any existing entries that weren't edited (for upsert)
      const entriesToSave: Array<{ accountId: string; [month: string]: string | number }> = [];

      // Add edited entries
      for (const [accountId, months] of accountMap.entries()) {
        const entry: { accountId: string; [month: string]: string | number } = { accountId };
        for (const month of MONTHS) {
          entry[month] = months[month] ?? 0;
        }
        entriesToSave.push(entry);
      }

      // Add unedited existing entries so they're included in upsert
      for (const existing of entries) {
        if (!accountMap.has(existing.accountId)) {
          const entry: { accountId: string; [month: string]: string | number } = { accountId: existing.accountId };
          for (const month of MONTHS) {
            entry[month] = Number(existing.budget[month] || 0);
          }
          entriesToSave.push(entry);
        }
      }

      if (entriesToSave.length === 0) {
        setIsSaving(false);
        return;
      }

      const res = await fetch(`/api/projects/${projectId}/budget`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: entriesToSave }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || (isDa ? 'Kunne ikke gemme budget' : 'Failed to save budget'));
      }

      toast.success(isDa ? 'Budget gemt' : 'Budget saved');
      setEditValues({});
      setHasChanges(false);
      await fetchBudget();
    } catch (err) {
      console.error('Save budget error:', err);
      toast.error(err instanceof Error ? err.message : (isDa ? 'Fejl ved gemning' : 'Error saving'));
    } finally {
      setIsSaving(false);
    }
  };

  // ── Add account handler ──
  const handleAddAccount = () => {
    if (!newAccountId) return;
    guardWriteAccess(
      isDa ? 'Tilføj budgetlinje' : 'Add budget line',
      () => {
        // Create a new entry in editValues with all zeros
        const newEntry: Record<string, number> = {};
        for (const month of MONTHS) {
          newEntry[`${newAccountId}-${month}`] = 0;
        }
        setEditValues((prev) => ({ ...prev, ...newEntry }));
        setHasChanges(true);

        // Add a temporary entry to the entries list for display
        const account = accounts.find((a) => a.id === newAccountId);
        if (account) {
          const budgetObj: Record<string, number> = {};
          const actualObj: Record<string, number> = {};
          const varianceObj: Record<string, number> = {};
          for (const month of MONTHS) {
            budgetObj[month] = 0;
            actualObj[month] = 0;
            varianceObj[month] = 0;
          }
          setEntries((prev) => [
            ...prev,
            {
              id: `new-${newAccountId}`,
              accountId: newAccountId,
              accountNumber: account.number,
              accountName: account.name,
              accountType: account.type,
              accountGroup: account.group,
              budget: budgetObj,
              actual: actualObj,
              variance: varianceObj,
              totalBudget: 0,
              totalActual: 0,
              totalVariance: 0,
            },
          ]);
        }
        setNewAccountId('');
        setShowAddRow(false);
      }
    );
  };

  // ── Format helper ──
  function fmtShort(value: number): string {
    if (value === 0) return '—';
    const abs = Math.abs(value);
    if (abs >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${(value / 1000).toFixed(0)}k`;
    return value.toFixed(0);
  }

  const monthLabels = isDa ? MONTH_LABELS_DA : MONTH_LABELS_EN;

  // ─── Loading state ──
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-9 w-24" />
        </div>
        <Card className="rounded-2xl">
          <CardContent className="p-4">
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Error state ──
  if (error) {
    return (
      <Card className="border-red-200 dark:border-red-800/50 rounded-2xl">
        <CardContent className="p-6 text-center">
          <XCircle className="h-12 w-12 text-red-400 dark:text-red-500 mx-auto mb-3" />
          <p className="text-gray-700 dark:text-gray-300 mb-4">{error}</p>
          <Button onClick={() => fetchBudget()} variant="outline" className="gap-2">
            <Loader2 className="h-4 w-4" />
            {isDa ? 'Prøv igen' : 'Try again'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ─── Empty state ──
  if (entries.length === 0 && !hasChanges) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {isDa ? `Budget ${selectedYear}` : `Budget ${selectedYear}`}
          </h3>
          <Button
            onClick={() => guardWriteAccess(isDa ? 'Tilføj budgetlinje' : 'Add budget line', () => setShowAddRow(true))}
            size="sm"
            className="gap-1.5 bg-[#0d9488] hover:bg-[#0f766e] text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            {isDa ? 'Tilføj linje' : 'Add line'}
          </Button>
        </div>

        {/* Add row selector */}
        {showAddRow && (
          <Card className="rounded-2xl">
            <CardContent className="p-4">
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Label className="text-xs text-gray-500 mb-1">
                    {isDa ? 'Vælg konto' : 'Select account'}
                  </Label>
                  <Select value={newAccountId} onValueChange={setNewAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder={isDa ? 'Vælg konto...' : 'Select account...'} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          <span className="flex items-center gap-2">
                            {a.isProject && (
                              <span className="text-amber-500 text-xs font-bold" title={isDa ? 'Projektkonto' : 'Project account'}>★</span>
                            )}
                            <span className="text-xs text-gray-400">{a.number}</span>
                            <span>{a.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleAddAccount}
                  disabled={!newAccountId}
                  size="sm"
                  className="bg-[#0d9488] hover:bg-[#0f766e] text-white"
                >
                  {isDa ? 'Tilføj' : 'Add'}
                </Button>
                <Button
                  onClick={() => { setShowAddRow(false); setNewAccountId(''); }}
                  variant="outline"
                  size="sm"
                >
                  {isDa ? 'Annuller' : 'Cancel'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="rounded-2xl">
          <CardContent className="py-16 text-center">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-gray-50 dark:bg-white/5 mb-4">
              <AlertCircle className="h-8 w-8 text-gray-300 dark:text-gray-600" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
              {isDa ? 'Ingen budgetlinjer' : 'No budget lines'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              {isDa
                ? 'Tilføj konti for at oprette et projektbudget og sammenligne med realiserede tal.'
                : 'Add accounts to create a project budget and compare with actual figures.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Main render ──
  return (
    <div className="space-y-4">
      {/* Year selector + actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {isDa ? 'År' : 'Year'}
          </Label>
          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0, 1, 2].map((offset) => {
                const y = new Date().getFullYear() - 1 + offset;
                return (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => guardWriteAccess(isDa ? 'Tilføj budgetlinje' : 'Add budget line', () => setShowAddRow(true))}
            size="sm"
            variant="outline"
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            {isDa ? 'Tilføj linje' : 'Add line'}
          </Button>
          {hasChanges && (
            <Button
              onClick={() => guardWriteAccess(isDa ? 'Gem budget' : 'Save budget', handleSave)}
              size="sm"
              disabled={isSaving}
              className="gap-1.5 bg-[#0d9488] hover:bg-[#0f766e] text-white"
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {isSaving ? (isDa ? 'Gemmer...' : 'Saving...') : (isDa ? 'Gem' : 'Save')}
            </Button>
          )}
        </div>
      </div>

      {/* Add row selector */}
      {showAddRow && (
        <Card className="rounded-2xl">
          <CardContent className="p-4">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Label className="text-xs text-gray-500 mb-1">
                  {isDa ? 'Vælg konto' : 'Select account'}
                </Label>
                <Select value={newAccountId} onValueChange={setNewAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder={isDa ? 'Vælg konto...' : 'Select account...'} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <span className="flex items-center gap-2">
                          {a.isProject && (
                            <span className="text-amber-500 text-xs font-bold" title={isDa ? 'Projektkonto' : 'Project account'}>★</span>
                          )}
                          <span className="text-xs text-gray-400">{a.number}</span>
                          <span>{a.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleAddAccount}
                disabled={!newAccountId}
                size="sm"
                className="bg-[#0d9488] hover:bg-[#0f766e] text-white"
              >
                {isDa ? 'Tilføj' : 'Add'}
              </Button>
              <Button
                onClick={() => { setShowAddRow(false); setNewAccountId(''); }}
                variant="outline"
                size="sm"
              >
                {isDa ? 'Annuller' : 'Cancel'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="rounded-xl">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">{isDa ? 'Budget i alt' : 'Total Budget'}</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">{tc(summary.totalBudget)}</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">{isDa ? 'Realiseret' : 'Actual'}</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">{tc(summary.totalActual)}</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">{isDa ? 'Afvigelse' : 'Variance'}</p>
              <p className={cn(
                'text-sm font-semibold mt-0.5',
                summary.totalVariance >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              )}>
                {tc(summary.totalVariance)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Budget table by account type group */}
      {groupedEntries.map((group) => (
        <Card key={group.type} className="rounded-2xl overflow-hidden">
          {/* Group header */}
          <div className={cn('px-4 py-2.5 border-b dark:border-white/[0.06]', getAccountTypeHeaderBg(group.type))}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {group.label}
              </h3>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-gray-500 dark:text-gray-400">
                  {isDa ? 'Budget' : 'Budget'}: {tc(group.totalBudget)}
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  {isDa ? 'Realiseret' : 'Actual'}: {tc(group.totalActual)}
                </span>
                <span className={varianceClass(group.totalVariance, group.type)}>
                  {isDa ? 'Afvigelse' : 'Var.'}: {tc(group.totalVariance)}
                </span>
              </div>
            </div>
          </div>

          {/* Scrollable table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="sticky left-0 bg-white dark:bg-[#1a1d1c] z-10 min-w-[140px]">
                    {isDa ? 'Konto' : 'Account'}
                  </TableHead>
                  {monthLabels.map((label, idx) => (
                    <TableHead key={MONTHS[idx]} className="text-center min-w-[90px] text-xs">
                      {label}
                    </TableHead>
                  ))}
                  <TableHead className="text-center min-w-[90px] text-xs font-semibold">
                    {isDa ? 'Total' : 'Total'}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.entries.map((entry) => (
                  <TableRow key={entry.accountId} className="group">
                    {/* Account name */}
                    <TableCell className="sticky left-0 bg-white dark:bg-[#1a1d1c] z-10 font-medium text-xs">
                      <div>
                        <span className="text-gray-400 dark:text-gray-500 mr-1.5">{entry.accountNumber}</span>
                        <span className="text-gray-900 dark:text-white">{entry.accountName}</span>
                      </div>
                    </TableCell>

                    {/* Monthly cells */}
                    {MONTHS.map((month) => {
                      const budgetVal = getCellValue(entry.accountId, month, Number(entry.budget[month] || 0));
                      const actualVal = Number(entry.actual[month] || 0);

                      return (
                        <TableCell key={month} className="text-center p-1">
                          <div className="space-y-0.5">
                            {/* Budget input */}
                            <Input
                              type="number"
                              value={budgetVal || ''}
                              onChange={(e) => handleCellEdit(entry.accountId, month, e.target.value)}
                              className="h-7 text-xs text-center border-0 bg-gray-50 dark:bg-white/[0.04] focus:bg-white dark:focus:bg-white/10 focus:ring-1 focus:ring-[#0d9488]/30 p-1 rounded"
                              placeholder="0"
                            />
                            {/* Actual (read-only) */}
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-none">
                              {actualVal !== 0 ? fmtShort(actualVal) : '—'}
                            </p>
                          </div>
                        </TableCell>
                      );
                    })}

                    {/* Total */}
                    <TableCell className="text-center p-1">
                      <div className="space-y-0.5">
                        <p className="text-xs font-medium text-gray-900 dark:text-white">
                          {fmtShort(
                            MONTHS.reduce((sum, month) => sum + getCellValue(entry.accountId, month, Number(entry.budget[month] || 0)), 0)
                          )}
                        </p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">
                          {fmtShort(entry.totalActual)}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {/* Group total row */}
                <TableRow className="bg-gray-50/50 dark:bg-white/[0.02] font-semibold">
                  <TableCell className="sticky left-0 bg-gray-50/50 dark:bg-white/[0.02] z-10 text-xs">
                    {isDa ? 'I alt' : 'Total'}
                  </TableCell>
                  {MONTHS.map((month) => (
                    <TableCell key={month} className="text-center p-1">
                      <div className="space-y-0.5">
                        <p className="text-xs">
                          {fmtShort(group.entries.reduce((sum, e) => sum + getCellValue(e.accountId, month, Number(e.budget[month] || 0)), 0))}
                        </p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">
                          {fmtShort(group.entries.reduce((sum, e) => sum + Number(e.actual[month] || 0), 0))}
                        </p>
                      </div>
                    </TableCell>
                  ))}
                  <TableCell className="text-center p-1">
                    <div className="space-y-0.5">
                      <p className="text-xs">{fmtShort(group.totalBudget)}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">{fmtShort(group.totalActual)}</p>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </Card>
      ))}
    </div>
  );
}
