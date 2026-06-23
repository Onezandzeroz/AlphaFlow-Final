'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Lock,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Scale,
  FileText,
  Download,
  ChevronDown,
} from 'lucide-react';

// ─── Types (matching backend) ──────────────────────────────────

interface AccountBalance {
  id: string;
  number: string;
  name: string;
  type: string;
  group: string;
  debit: number;
  credit: number;
  naturalBalance: number;
}

interface ClosingEntryLine {
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
  debit: number;
  credit: number;
}

interface FiscalPeriodItem {
  id: string;
  year: number;
  month: number;
  status: string;
  lockedAt: string | null;
  lockedBy: string | null;
  createdAt: string;
}

interface JournalEntryLineResult {
  id: string;
  accountId: string;
  debit: number;
  credit: number;
  description: string;
  account: {
    id: string;
    number: string;
    name: string;
    type: string;
    group: string;
  };
}

interface YearEndPreview {
  year: number;
  accounts: AccountBalance[];
  totalRevenue: number;
  totalExpenses: number;
  netResult: number;
  closingEntry: {
    description: string;
    date: string;
    lines: ClosingEntryLine[];
    totalDebit: number;
    totalCredit: number;
    balanced: boolean;
  };
  fiscalPeriods: {
    periods: FiscalPeriodItem[];
    openCount: number;
    closedCount: number;
    missingMonths: number[];
  };
  resultAccount: { id: string; number: string; name: string } | null;
  isReadyToClose: boolean;
  warnings: string[];
}

interface YearEndResult {
  journalEntry: {
    id: string;
    description: string;
    date: string;
    status: string;
    lines: JournalEntryLineResult[];
  };
  lockedPeriods: FiscalPeriodItem[];
  message: string;
}

// ─── Component ─────────────────────────────────────────────────

interface YearEndTabProps {
  selectedYear: number;
  yearEndClosed: boolean;
  onClosed: () => void; // callback to refresh parent state
}

export function YearEndTab({ selectedYear, yearEndClosed, onClosed }: YearEndTabProps) {
  const { language, tc } = useTranslation();
  const isDanish = language === 'da';

  // ─── State ───
  const [preview, setPreview] = useState<YearEndPreview | null>(null);
  const [result, setResult] = useState<YearEndResult | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExecuteDialog, setShowExecuteDialog] = useState(false);
  const [showPnlDetail, setShowPnlDetail] = useState(false);
  const [showClosingEntry, setShowClosingEntry] = useState(false);

  // Derived
  const revenueAccounts = useMemo(
    () => preview?.accounts.filter((a) => a.type === 'REVENUE') ?? [],
    [preview],
  );
  const expenseAccounts = useMemo(
    () => preview?.accounts.filter((a) => a.type === 'EXPENSE') ?? [],
    [preview],
  );

  // ─── Fetch preview ───
  const fetchPreview = useCallback(async () => {
    setIsLoadingPreview(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`/api/year-end-closing?year=${selectedYear}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      setPreview(data);
    } catch (err) {
      console.error('Failed to fetch year-end preview:', err);
      setError(
        isDanish
          ? 'Kunne ikke hente forhåndsvisning af årsafslutning'
          : 'Failed to fetch year-end closing preview',
      );
    } finally {
      setIsLoadingPreview(false);
    }
  }, [selectedYear, isDanish]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  // ─── Execute closing ───
  const handleExecute = useCallback(async () => {
    setIsExecuting(true);
    setError(null);
    try {
      const response = await fetch('/api/year-end-closing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: selectedYear, confirm: true }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      setResult(data);
      setShowExecuteDialog(false);
      onClosed();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setShowExecuteDialog(false);
    } finally {
      setIsExecuting(false);
    }
  }, [selectedYear, onClosed]);

  // ─── Download closing report CSV ───
  const handleDownloadCSV = useCallback(() => {
    if (!result) return;
    const je = result.journalEntry;
    const headers = isDanish ? ['Konto', 'Navn', 'Debet', 'Kredit'] : ['Account', 'Name', 'Debit', 'Credit'];
    const rows: string[][] = [
      [isDanish ? 'ÅRSAFSLUTNING' : 'YEAR-END CLOSING', '', '', ''],
      [isDanish ? `Dato: ${je.date}` : `Date: ${je.date}`, '', '', ''],
      [je.description, '', '', ''],
      [],
      ...je.lines.map((line) => [
        line.account.number,
        line.account.name,
        line.debit > 0 ? line.debit.toFixed(2) : '',
        line.credit > 0 ? line.credit.toFixed(2) : '',
      ]),
      [],
      [
        isDanish ? 'TOTAL' : 'TOTAL',
        '',
        je.lines.reduce((s, l) => s + Number(l.debit), 0).toFixed(2),
        je.lines.reduce((s, l) => s + Number(l.credit), 0).toFixed(2),
      ],
    ];
    const bom = '\uFEFF';
    const csv = bom + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `year-end-closing-${selectedYear}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }, [result, selectedYear, isDanish]);

  function valueColor(value: number): string {
    if (value > 0) return 'text-green-600 dark:text-green-400';
    if (value < 0) return 'text-red-600 dark:text-red-400';
    return 'text-gray-500 dark:text-gray-400';
  }

  // ─── Loading ───
  if (isLoadingPreview && !preview) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  // ─── Empty state: no fiscal periods ───
  if (preview && preview.fiscalPeriods.periods.length === 0 && !error) {
    return (
      <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
        <CardContent className="py-12 text-center">
          <Info className="h-8 w-8 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isDanish
              ? 'Opret regnskabsperioder under Perioder for at kunne bruge årsafslutning.'
              : 'Create fiscal periods under Periods to use year-end closing.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* ──── Error ──── */}
      {error && (
        <Card className="border-red-200 dark:border-red-800/50">
          <CardContent className="p-4 flex items-start gap-3">
            <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>
              {isDanish ? 'Luk' : 'Close'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ──── Result Card (after successful closing) ──── */}
      {result && (
        <Card className="relative overflow-hidden border-2 border-green-300 dark:border-green-800/50 shadow-xl">
          <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-green-100/50 to-transparent rounded-full blur-3xl transform translate-x-1/3 -translate-y-1/3" />
          <CardHeader className="relative pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <div className="h-9 w-9 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                {result.journalEntry.description}
              </CardTitle>
              <Badge className="bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/20 gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {isDanish ? 'Lukket' : 'Closed'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="relative space-y-3">
            <div className="p-3 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/50 rounded-lg">
              <p className="text-sm text-green-700 dark:text-green-300">{result.message}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-white/5">
                <p className="text-xs text-gray-500 dark:text-gray-400">{isDanish ? 'Dato' : 'Date'}</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{result.journalEntry.date}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-white/5">
                <p className="text-xs text-gray-500 dark:text-gray-400">{isDanish ? 'Lukkede perioder' : 'Locked'}</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{result.lockedPeriods.length}/12</p>
              </div>
              <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-white/5">
                <p className="text-xs text-gray-500 dark:text-gray-400">{isDanish ? 'Linjer' : 'Lines'}</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{result.journalEntry.lines.length}</p>
              </div>
            </div>
            {/* Journal entry table */}
            <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/5">
                    <TableHead className="w-[90px]">{isDanish ? 'Konto' : 'Account'}</TableHead>
                    <TableHead>{isDanish ? 'Navn' : 'Name'}</TableHead>
                    <TableHead className="text-right w-[110px]">{isDanish ? 'Debet' : 'Debit'}</TableHead>
                    <TableHead className="text-right w-[110px]">{isDanish ? 'Kredit' : 'Credit'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.journalEntry.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="font-mono text-sm text-gray-700 dark:text-gray-300">{line.account.number}</TableCell>
                      <TableCell className="text-sm text-gray-700 dark:text-gray-300">{line.account.name}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {line.debit > 0 ? <span className="text-green-600 dark:text-green-400">{tc(line.debit)}</span> : <span className="text-gray-400">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {line.credit > 0 ? <span className="text-red-600 dark:text-red-400">{tc(line.credit)}</span> : <span className="text-gray-400">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 font-bold border-t-2 border-gray-300 dark:border-white/20">
                    <TableCell colSpan={2} className="text-gray-900 dark:text-white">{isDanish ? 'TOTAL' : 'TOTAL'}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-green-600 dark:text-green-400">
                      {tc(result.journalEntry.lines.reduce((s, l) => s + Number(l.debit), 0))}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-red-600 dark:text-red-400">
                      {tc(result.journalEntry.lines.reduce((s, l) => s + Number(l.credit), 0))}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleDownloadCSV} className="gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium">
                <Download className="h-4 w-4" />
                {isDanish ? 'Download lukkerapport (CSV)' : 'Download closing report (CSV)'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ──── Preview (only if not already closed) ──── */}
      {preview && preview.fiscalPeriods.periods.length > 0 && !result && (
        <>
          {/* Status + Readiness Card */}
          <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-[#0d9488] to-[#2dd4bf] flex items-center justify-center shrink-0 shadow-lg">
                  <Lock className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="text-base font-bold text-gray-900 dark:text-white">
                      {isDanish ? 'Årsafslutning' : 'Year-End Closing'}
                    </h3>
                    {preview.isReadyToClose ? (
                      <Badge className="bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/20 gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {isDanish ? 'Klar til lukning' : 'Ready to close'}
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/20 gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {isDanish ? 'Ikke klar' : 'Not ready'}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {isDanish
                      ? `${preview.fiscalPeriods.closedCount}/12 perioder lukket. Nulstiller alle indtægts- og omkostningskonti og overfører årets resultat (${tc(preview.netResult)}) til konto 3300. Irreversibel.`
                      : `${preview.fiscalPeriods.closedCount}/12 periods locked. Zeros all revenue/expense accounts and transfers net result (${tc(preview.netResult)}) to account 3300. Irreversible.`}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchPreview}
                    disabled={isLoadingPreview}
                    className="dark:text-gray-300"
                  >
                    {isLoadingPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {isDanish ? 'Opdater' : 'Refresh'}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setShowExecuteDialog(true)}
                    disabled={!preview.isReadyToClose || isExecuting}
                    className="gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Lock className="h-4 w-4" />
                    {isDanish ? 'Udfør lukning' : 'Execute'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Warnings */}
          {preview.warnings.length > 0 && (
            <Card className="border-amber-200 dark:border-amber-800/50">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                    {isDanish ? 'Advarsler' : 'Warnings'}
                  </h4>
                </div>
                {preview.warnings.map((w, i) => (
                  <p key={i} className="text-sm text-amber-600 dark:text-amber-400 flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">•</span><span>{w}</span>
                  </p>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ──── Collapsible: P&L Account Detail ──── */}
          <Collapsible open={showPnlDetail} onOpenChange={setShowPnlDetail}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between dark:text-gray-300">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4" />
                  {isDanish ? 'Resultatopgørelse (kontodetaljer)' : 'P&L Summary (account details)'}
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showPnlDetail ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
                <CardContent className="p-4">
                  {/* Revenue accounts */}
                  <h4 className="text-sm font-semibold text-green-600 dark:text-green-400 mb-2 flex items-center gap-1.5">
                    {isDanish ? 'Indtægtskonti' : 'Revenue accounts'}
                    <span className="text-xs font-normal text-gray-400">({revenueAccounts.length})</span>
                  </h4>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 mb-4">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50 dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/5">
                          <TableHead className="w-[80px]">{isDanish ? 'Konto' : 'Account'}</TableHead>
                          <TableHead>{isDanish ? 'Navn' : 'Name'}</TableHead>
                          <TableHead className="text-right w-[120px]">{isDanish ? 'Saldo' : 'Balance'}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {revenueAccounts.map((acc) => (
                          <TableRow key={acc.id} className="border-b border-gray-100 dark:border-gray-800">
                            <TableCell className="font-mono text-sm text-gray-600 dark:text-gray-400">{acc.number}</TableCell>
                            <TableCell className="text-sm text-gray-700 dark:text-gray-300">{acc.name}</TableCell>
                            <TableCell className={`text-right font-mono text-sm ${valueColor(acc.naturalBalance)}`}>{tc(acc.naturalBalance)}</TableCell>
                          </TableRow>
                        ))}
                        {revenueAccounts.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-sm text-gray-400 py-4">
                              {isDanish ? 'Ingen indtægtskonti' : 'No revenue accounts'}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Expense accounts */}
                  <h4 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2 flex items-center gap-1.5">
                    {isDanish ? 'Omkostningskonti' : 'Expense accounts'}
                    <span className="text-xs font-normal text-gray-400">({expenseAccounts.length})</span>
                  </h4>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50 dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/5">
                          <TableHead className="w-[80px]">{isDanish ? 'Konto' : 'Account'}</TableHead>
                          <TableHead>{isDanish ? 'Navn' : 'Name'}</TableHead>
                          <TableHead className="text-right w-[120px]">{isDanish ? 'Saldo' : 'Balance'}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {expenseAccounts.map((acc) => (
                          <TableRow key={acc.id} className="border-b border-gray-100 dark:border-gray-800">
                            <TableCell className="font-mono text-sm text-gray-600 dark:text-gray-400">{acc.number}</TableCell>
                            <TableCell className="text-sm text-gray-700 dark:text-gray-300">{acc.name}</TableCell>
                            <TableCell className={`text-right font-mono text-sm ${valueColor(acc.naturalBalance)}`}>{tc(acc.naturalBalance)}</TableCell>
                          </TableRow>
                        ))}
                        {expenseAccounts.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-sm text-gray-400 py-4">
                              {isDanish ? 'Ingen omkostningskonti' : 'No expense accounts'}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Net result summary */}
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                      <Scale className="h-4 w-4" />
                      {isDanish ? 'Overføres til konto 3300' : 'Transfer to account 3300'}
                    </span>
                    <span className={`text-sm font-bold ${valueColor(preview.netResult)}`}>
                      {tc(preview.netResult)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>

          {/* ──── Collapsible: Closing Entry Preview ──── */}
          <Collapsible open={showClosingEntry} onOpenChange={setShowClosingEntry}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between dark:text-gray-300">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Scale className="h-4 w-4" />
                  {isDanish ? 'Lukkepostering (forhåndsvisning)' : 'Closing Entry (preview)'}
                  <span className="text-xs text-gray-400">({preview.closingEntry.lines.length} {isDanish ? 'linjer' : 'lines'})</span>
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showClosingEntry ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{preview.closingEntry.description}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{isDanish ? 'Dato' : 'Date'}: {preview.closingEntry.date}</p>
                    </div>
                    {preview.closingEntry.balanced && (
                      <Badge className="bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/20">
                        {isDanish ? 'I balance' : 'Balanced'}
                      </Badge>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50 dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/5">
                          <TableHead className="w-[80px]">{isDanish ? 'Konto' : 'Account'}</TableHead>
                          <TableHead>{isDanish ? 'Navn' : 'Name'}</TableHead>
                          <TableHead className="text-right w-[110px]">{isDanish ? 'Debet' : 'Debit'}</TableHead>
                          <TableHead className="text-right w-[110px]">{isDanish ? 'Kredit' : 'Credit'}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.closingEntry.lines.map((line, i) => (
                          <TableRow key={i} className="border-b border-gray-100 dark:border-gray-800">
                            <TableCell className="font-mono text-sm text-gray-600 dark:text-gray-400">{line.accountNumber}</TableCell>
                            <TableCell className="text-sm text-gray-700 dark:text-gray-300">{line.accountName}</TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {line.debit > 0 ? <span className="text-green-600 dark:text-green-400">{tc(line.debit)}</span> : <span className="text-gray-400">—</span>}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {line.credit > 0 ? <span className="text-red-600 dark:text-red-400">{tc(line.credit)}</span> : <span className="text-gray-400">—</span>}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 font-bold border-t-2 border-gray-300 dark:border-white/20">
                          <TableCell colSpan={2} className="text-gray-900 dark:text-white">{isDanish ? 'TOTAL' : 'TOTAL'}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-green-600 dark:text-green-400">{tc(preview.closingEntry.totalDebit)}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-red-600 dark:text-red-400">{tc(preview.closingEntry.totalCredit)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                    {isDanish
                      ? 'Denne postering nulstiller alle indtægts- og omkostningskonti ved at debetere indtægter (nulstille kreditbalancer) og kreditere omkostninger (nulstille debetbalancer).'
                      : 'This entry zeros all revenue and expense accounts by debiting revenue (zeroing credit balances) and crediting expenses (zeroing debit balances).'}
                  </p>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>

          {/* Irreversible warning at bottom */}
          <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50/50 dark:bg-white/[0.02] rounded-lg p-3">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
            <p>
              {isDanish
                ? 'Årsafslutningen er irreversibel. Alle 12 perioder låses og der oprettes en bogført postering.'
                : 'The year-end closing is irreversible. All 12 periods will be locked and a posted journal entry will be created.'}
            </p>
          </div>
        </>
      )}

      {/* ──── Execute Confirmation Dialog ──── */}
      <AlertDialog open={showExecuteDialog} onOpenChange={setShowExecuteDialog}>
        <AlertDialogContent className="bg-white dark:bg-[#1a1f1e] max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white flex items-center gap-2 text-xl">
              <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              {isDanish ? `Bekræft årsafslutning for ${selectedYear}` : `Confirm year-end closing for ${selectedYear}`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                <p className="text-gray-600 dark:text-gray-400">
                  {isDanish
                    ? 'Er du sikker på, at du vil udføre årsafslutningen? Denne handling er irreversibel og vil:'
                    : 'Are you sure you want to execute the year-end closing? This action is irreversible and will:'}
                </p>
                <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-lg p-3 space-y-2">
                  <div className="flex items-start gap-2 text-sm">
                    <Lock className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                    <p className="text-amber-800 dark:text-amber-200">
                      {isDanish ? `Låse alle 12 regnskabsperioder for ${selectedYear}` : `Lock all 12 fiscal periods for ${selectedYear}`}
                    </p>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <FileText className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                    <p className="text-amber-800 dark:text-amber-200">
                      {isDanish
                        ? `Oprette en bogført postering med ${preview?.closingEntry.lines.length ?? 0} linjer der nulstiller alle indtægts- og omkostningskonti`
                        : `Create a posted journal entry with ${preview?.closingEntry.lines.length ?? 0} lines that zero all revenue and expense accounts`}
                    </p>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <Scale className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                    <p className="text-amber-800 dark:text-amber-200">
                      {isDanish
                        ? `Overføre årets resultat (${tc(preview?.netResult ?? 0)}) til konto 3300`
                        : `Transfer the net result (${tc(preview?.netResult ?? 0)}) to account 3300`}
                    </p>
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">{isDanish ? 'Åbne perioder' : 'Open Periods'}</span>
                    <span className="font-medium text-amber-600 dark:text-amber-400">{preview?.fiscalPeriods.openCount ?? 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">{isDanish ? 'Konto 3300' : 'Account 3300'}</span>
                    <span className={`font-medium ${preview?.resultAccount ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {preview?.resultAccount ? (isDanish ? 'Fundet' : 'Found') : (isDanish ? 'Mangler!' : 'Missing!')}
                    </span>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="dark:bg-white/5 dark:text-gray-300" disabled={isExecuting}>
              {isDanish ? 'Annuller' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleExecute(); }}
              disabled={isExecuting}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {isExecuting ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />{isDanish ? 'Udfører...' : 'Executing...'}</>
              ) : (
                <><Lock className="h-4 w-4 mr-2" />{isDanish ? 'Bekræft og luk året' : 'Confirm & close year'}</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}