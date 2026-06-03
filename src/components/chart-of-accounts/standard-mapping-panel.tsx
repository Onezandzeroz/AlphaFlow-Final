'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { toast } from 'sonner';
import { useAccessErrorHandler } from '@/hooks/use-access-error-handler';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ArrowRightLeft,
  Loader2,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Download,
  FileSpreadsheet,
  ChevronDown,
  Search,
  RefreshCw,
  Save,
} from 'lucide-react';
import { PUBLIC_STANDARD_CHART } from '@/lib/standard-chart-of-accounts';

// ─── Types ────────────────────────────────────────────────────────────────

interface AccountMapping {
  accountId: string;
  accountNumber: string;
  accountName: string;
  standardAccountNumber: string;
  standardAccountName: string;
  mappingType: string;
}

// ─── Component ──────────────────────────────────────────────────────────

interface StandardMappingPanelProps {
  user: User;
}

export function StandardMappingPanel({ user }: StandardMappingPanelProps) {
  const { language } = useTranslation();
  const isDanish = language === 'da';
  const { handleMutationError } = useAccessErrorHandler();

  // ─── State ────────────────────────────────────────────────────────
  const [mappings, setMappings] = useState<AccountMapping[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoMapping, setIsAutoMapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [dirtyMappings, setDirtyMappings] = useState<Map<string, string>>(new Map());

  // ─── Data Fetching ────────────────────────────────────────────────

  const fetchMappings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/accounts/standard-mapping');
      if (!response.ok) throw new Error(isDanish ? 'Kunne ikke hente mapping' : 'Failed to fetch mappings');
      const data = await response.json();
      setMappings(data.mappings || []);
      setDirtyMappings(new Map());
    } catch (err) {
      console.error('Fetch mappings error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [isDanish]);

  useEffect(() => {
    fetchMappings();
  }, [fetchMappings]);

  // ─── Auto-Mapping ─────────────────────────────────────────────────

  const handleAutoMap = useCallback(async () => {
    setIsAutoMapping(true);
    try {
      const response = await fetch('/api/accounts/standard-mapping/auto', { method: 'POST' });
      if (!response.ok) {
        const isAccess = await handleMutationError(response, isDanish ? 'Auto-mapping' : 'Auto-mapping');
        if (isAccess) { setIsAutoMapping(false); return; }
        throw new Error(isDanish ? 'Auto-mapping fejlede' : 'Auto-mapping failed');
      }
      const data = await response.json();
      await fetchMappings();
      toast.success(
        isDanish ? 'Auto-mapping udført!' : 'Auto-mapping complete!',
        {
          description: isDanish
            ? `${data.autoMapped} konti mapped automatisk, ${data.unmapped} har brug for manuel mapping.`
            : `${data.autoMapped} accounts mapped automatically, ${data.unmapped} need manual mapping.`,
        }
      );
    } catch (err) {
      console.error('Auto-map error:', err);
    } finally {
      setIsAutoMapping(false);
    }
  }, [fetchMappings, isDanish, handleMutationError]);

  // ─── Save Mappings ───────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (dirtyMappings.size === 0) return;
    setIsSaving(true);
    try {
      const body = {
        mappings: Array.from(dirtyMappings.entries()).map(([accountId, standardAccountNumber]) => ({
          accountId,
          standardAccountNumber,
        })),
      };
      const response = await fetch('/api/accounts/standard-mapping', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const isAccess = await handleMutationError(response, isDanish ? 'Gem mapping' : 'Save mapping');
        if (isAccess) { setIsSaving(false); return; }
        throw new Error(isDanish ? 'Kunne ikke gemme mapping' : 'Failed to save mappings');
      }
      await fetchMappings();
      toast.success(isDanish ? 'Mapping gemt!' : 'Mappings saved!');
    } catch (err) {
      console.error('Save mappings error:', err);
    } finally {
      setIsSaving(false);
    }
  }, [dirtyMappings, fetchMappings, isDanish, handleMutationError]);

  // ─── Update Single Mapping (local) ───────────────────────────────

  const updateMapping = useCallback((accountId: string, standardNumber: string) => {
    setDirtyMappings(prev => new Map(prev).set(accountId, standardNumber));
  }, []);

  // ─── Export CSV ───────────────────────────────────────────────────

  const handleExportCSV = useCallback(() => {
    const header = isDanish
      ? 'FSR-Konto;FSR-Kontonavn;Standardkonto;Standardkontonavn;Mapping-type'
      : 'FSR Account;FSR Name;Standard Account;Standard Name;Mapping Type';
    const rows = mappings.map(m =>
      `${m.accountNumber};${m.accountName};${m.standardAccountNumber};${m.standardAccountName};${m.mappingType}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `standardkontoplan-mapping-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [mappings, isDanish]);

  // ─── Filtered & Computed ──────────────────────────────────────────

  const filteredMappings = useMemo(() => {
    let result = mappings;
    if (typeFilter === 'UNMAPPED') {
      result = result.filter(m => m.standardAccountNumber === 'UNMAPPED');
    } else if (typeFilter === 'AUTO') {
      result = result.filter(m => m.mappingType === 'auto');
    } else if (typeFilter === 'MANUAL') {
      result = result.filter(m => m.mappingType === 'manual');
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m =>
        m.accountNumber.includes(q) ||
        m.accountName.toLowerCase().includes(q) ||
        m.standardAccountNumber.includes(q) ||
        m.standardAccountName.toLowerCase().includes(q)
      );
    }
    return result;
  }, [mappings, typeFilter, searchQuery]);

  const stats = useMemo(() => {
    const total = mappings.length;
    const auto = mappings.filter(m => m.mappingType === 'auto').length;
    const manual = mappings.filter(m => m.mappingType === 'manual').length;
    const unmapped = mappings.filter(m => m.standardAccountNumber === 'UNMAPPED').length;
    return { total, auto, manual, unmapped };
  }, [mappings]);

  const isDirty = dirtyMappings.size > 0;

  // ─── Loading ───────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-[#0d9488]" />
            {isDanish ? 'Standardkontoplan Mapping' : 'Standard Chart Mapping'}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {isDanish
              ? 'Map dine FSR-konti til SKATs fællesoffentlige standardkontoplan'
              : 'Map your FSR accounts to SKAT\'s public standard chart of accounts'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={handleAutoMap}
            disabled={isAutoMapping || isSaving}
            variant="outline"
            className="gap-2 border-[#0d9488]/30 text-[#0d9488] hover:bg-[#0d9488]/10"
          >
            {isAutoMapping ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {isDanish ? 'Auto-map' : 'Auto-map'}
          </Button>
          <Button
            onClick={handleExportCSV}
            variant="outline"
            className="gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" />
            CSV
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className="bg-[#0d9488] hover:bg-[#0f766e] text-white gap-2"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isDanish ? 'Gem' : 'Save'}
            {isDirty && <Badge variant="secondary" className="ml-1 text-xs">{dirtyMappings.size}</Badge>}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="stat-card">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{isDanish ? 'I alt' : 'Total'}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-[#0d9488]/10 flex items-center justify-center">
                <ArrowRightLeft className="h-4 w-4 text-[#0d9488]" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{isDanish ? 'Auto' : 'Auto'}</p>
                <p className="text-xl font-bold text-[#0d9488] dark:text-[#2dd4bf]">{stats.auto}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{isDanish ? 'Manuel' : 'Manual'}</p>
                <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{stats.manual}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{isDanish ? 'Ikke mapped' : 'Unmapped'}</p>
                <p className="text-xl font-bold text-red-600 dark:text-red-400">{stats.unmapped}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertCircle className="h-4 w-4 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <Card className="stat-card">
        <CardContent className="p-4 pb-2 lg:pb-4">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[140px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={isDanish ? 'Søg...' : 'Search...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-gray-50 dark:bg-white/[0.04] border-0"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="shrink-0 w-auto min-w-[140px] bg-gray-50 dark:bg-white/[0.04] border-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-[#1a1f1e]">
                <SelectItem value="ALL">{isDanish ? 'Alle' : 'All'}</SelectItem>
                <SelectItem value="AUTO">{isDanish ? 'Auto-mapped' : 'Auto-mapped'}</SelectItem>
                <SelectItem value="MANUAL">{isDanish ? 'Manuel' : 'Manual'}</SelectItem>
                <SelectItem value="UNMAPPED">{isDanish ? 'Ikke mapped' : 'Unmapped'}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Mapping Table */}
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardContent className="p-0">
          <ScrollArea className="max-h-[500px] overflow-y-auto">
            <div className="divide-y divide-gray-100/50 dark:divide-white/5">
              {filteredMappings.length === 0 ? (
                <div className="py-12 text-center text-gray-500 dark:text-gray-400">
                  <ArrowRightLeft className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">
                    {mappings.length === 0
                      ? (isDanish ? 'Klik "Auto-map" for at generere mapping' : 'Click "Auto-map" to generate mappings')
                      : (isDanish ? 'Ingen matchende konti' : 'No matching accounts')}
                  </p>
                </div>
              ) : (
                filteredMappings.map((mapping) => {
                  const currentValue = dirtyMappings.get(mapping.accountId) ?? mapping.standardAccountNumber;
                  const isUnmapped = currentValue === 'UNMAPPED';
                  const isDirtyItem = dirtyMappings.has(mapping.accountId);

                  return (
                    <div
                      key={mapping.accountId}
                      className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors ${isDirtyItem ? 'bg-[#0d9488]/5' : ''}`}
                    >
                      {/* FSR Account */}
                      <div className="w-16 sm:w-20 shrink-0">
                        <p className="text-xs sm:text-sm font-mono font-semibold text-gray-900 dark:text-white">
                          {mapping.accountNumber}
                        </p>
                        <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">
                          {mapping.accountName}
                        </p>
                      </div>

                      {/* Arrow */}
                      <ArrowRightLeft className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600 shrink-0 hidden sm:block" />

                      {/* Standard Account Select */}
                      <div className="flex-1 min-w-0">
                        <Select
                          value={currentValue}
                          onValueChange={(val) => updateMapping(mapping.accountId, val)}
                        >
                          <SelectTrigger className={`w-full text-xs sm:text-sm h-8 sm:h-9 ${isUnmapped ? 'border-red-200 dark:border-red-800/50 text-red-500' : ''}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white dark:bg-[#1a1f1e] max-h-64">
                            <SelectItem value="UNMAPPED" className="text-red-500">
                              {isDanish ? '— Ikke mapped —' : '— Unmapped —'}
                            </SelectItem>
                            {PUBLIC_STANDARD_CHART.map((std) => (
                              <SelectItem key={std.number} value={std.number}>
                                <span className="font-mono">{std.number}</span>
                                <span className="mx-1.5 text-gray-300">—</span>
                                <span className="truncate">{std.name}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Status */}
                      <div className="shrink-0">
                        {isUnmapped ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant="outline" className="text-[10px] text-red-500 border-red-200 dark:border-red-800/50">
                                  <XCircle className="h-3 w-3 mr-0.5" />
                                  {isDanish ? 'Mangler' : 'Missing'}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{isDanish ? 'Denne konto mangler mapping til standardkontoplanen' : 'This account needs a standard mapping'}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <Badge variant="outline" className={`text-[10px] ${currentValue !== mapping.standardAccountNumber ? 'text-amber-500 border-amber-200 dark:border-amber-800/50' : 'text-gray-400'}`}>
                            {mapping.mappingType === 'auto' && currentValue === mapping.standardAccountNumber ? (
                              <Sparkles className="h-3 w-3 mr-0.5" />
                            ) : (
                              <CheckCircle2 className="h-3 w-3 mr-0.5" />
                            )}
                            {isDanish ? mapping.mappingType : mapping.mappingType}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Info */}
      <Card className="stat-card bg-[#0d9488]/5 border-[#0d9488]/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-[#0d9488]/10 flex items-center justify-center shrink-0 mt-0.5">
              <AlertCircle className="h-4 w-4 text-[#0d9488]" />
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
              <p className="font-medium text-[#0d9488] dark:text-[#2dd4bf]">
                {isDanish ? 'Om standardkontoplan mapping' : 'About standard chart mapping'}
              </p>
              <p>
                {isDanish
                  ? 'SKATs fællesoffentlige standardkontoplan bruges af det offentlige Danmark til rapportering. Mappingen sikrer, at dine konti kan rapporteres i et format som SKAT, Erhvervsstyrelsen og NemHandel forstår. Krav N14, N15, N16.'
                  : 'SKAT\'s public standard chart of accounts is used by the Danish public sector for reporting. The mapping ensures your accounts can be reported in a format understood by SKAT, Erhvervsstyrelsen, and NemHandel. Requirements N14, N15, N16.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
