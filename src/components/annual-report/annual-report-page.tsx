'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/page-header';
import { YearEndTab } from '@/components/annual-report/year-end-tab';
import {
  FileDown,
  FileSpreadsheet,
  Send,
  History,
  AlertCircle,
  Clock,
  Loader2,
  TrendingUp,
  TrendingDown,
  BarChart3,
  ShieldCheck,
  Calculator,
  ArrowUpCircle,
  ArrowDownCircle,
  Lock,
  CheckCircle,
  FileText,
  Download,
  ChevronDown,
} from 'lucide-react';
import { format } from 'date-fns';

// ── Types ──────────────────────────────────────────────────────────────

interface AnnualReportPageProps {
  user: User;
}

type VATSubmissionStatus = 'DRAFT' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | 'ERROR';

interface VATSubmission {
  id: string;
  year: number;
  period: string;
  outputVat: number;
  inputVat: number;
  netVat: number;
  status: VATSubmissionStatus;
  submittedDate: string | null;
  reference: string | null;
}

interface PnLData {
  revenue: number;
  expenses: number;
  netResult: number;
}

interface BalanceSheetData {
  totalAssets: number;
  totalLiabilities: number;
  equity: number;
}

// ── History types ────────────────────────────────────────────────

interface YearReportEntry {
  year: number;
  pnl: PnLData | null;
  balance: BalanceSheetData | null;
  vatSubmissions: VATSubmission[];
  yearEndClosed: boolean;
  isLoading: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────

const YEAR_OPTIONS = Array.from({ length: 11 }, (_, i) => 2020 + i);
const PERIOD_OPTIONS = [
  { value: 'Q1', label: 'Q1 (Jan–Mar)', labelEn: 'Q1 (Jan–Mar)' },
  { value: 'Q2', label: 'Q2 (Apr–Jun)', labelEn: 'Q2 (Apr–Jun)' },
  { value: 'Q3', label: 'Q3 (Jul–Sep)', labelEn: 'Q3 (Jul–Sep)' },
  { value: 'Q4', label: 'Q4 (Okt–Dec)', labelEn: 'Q4 (Oct–Dec)' },
  { value: 'YEARLY', label: 'Årligt', labelEn: 'Yearly' },
];

function getStatusBadge(status: VATSubmissionStatus, language: string) {
  switch (status) {
    case 'DRAFT':
      return (
        <Badge variant="outline" className="border-gray-300 text-gray-500 bg-gray-50 dark:bg-gray-800/50 dark:border-gray-600 dark:text-gray-400 text-xs font-medium">
          {language === 'da' ? 'Kladde' : 'Draft'}
        </Badge>
      );
    case 'SUBMITTED':
      return (
        <Badge variant="outline" className="border-blue-300 text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-600 dark:text-blue-400 text-xs font-medium">
          {language === 'da' ? 'Indsendt' : 'Submitted'}
        </Badge>
      );
    case 'ACCEPTED':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700 text-xs font-medium">
          {language === 'da' ? 'Accepteret' : 'Accepted'}
        </Badge>
      );
    case 'REJECTED':
      return (
        <Badge variant="outline" className="border-red-300 text-red-600 bg-red-50 dark:bg-red-900/30 dark:border-red-600 dark:text-red-400 text-xs font-medium">
          {language === 'da' ? 'Afvist' : 'Rejected'}
        </Badge>
      );
    case 'ERROR':
      return (
        <Badge variant="outline" className="border-orange-300 text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:border-orange-600 dark:text-orange-400 text-xs font-medium">
          {language === 'da' ? 'Fejl' : 'Error'}
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getStatusIcon(status: VATSubmissionStatus) {
  switch (status) {
    case 'ACCEPTED':
      return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    case 'REJECTED':
    case 'ERROR':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case 'SUBMITTED':
      return <Clock className="h-4 w-4 text-blue-500" />;
    default:
      return <Clock className="h-4 w-4 text-gray-400" />;
  }
}

// ── Component ──────────────────────────────────────────────────────────

export function AnnualReportPage({ user }: AnnualReportPageProps) {
  const { t, tc, language } = useTranslation();
  const currentYear = new Date().getFullYear();

  // ─── Shared state ───
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [isLoading, setIsLoading] = useState(true);

  // ─── Annual Report state ───
  const [pnlData, setPnlData] = useState<PnLData | null>(null);
  const [balanceData, setBalanceData] = useState<BalanceSheetData | null>(null);
  const [isDownloadingCSV, setIsDownloadingCSV] = useState(false);
  const [isDownloadingXBRL, setIsDownloadingXBRL] = useState(false);
  const [yearEndClosed, setYearEndClosed] = useState(false);

  // ─── VAT Report state ───
  const [selectedPeriod, setSelectedPeriod] = useState('Q1');
  const [vatSubmissions, setVatSubmissions] = useState<VATSubmission[]>([]);
  const [currentVatData, setCurrentVatData] = useState<{
    outputVat: number;
    inputVat: number;
    netVat: number;
    outputVATBreakdown: Array<{ rate: number; netAmount: number }>;
    inputVATBreakdown: Array<{ rate: number; netAmount: number }>;
  } | null>(null);
  const [isSubmittingVAT, setIsSubmittingVAT] = useState(false);
  const [isLoadingVAT, setIsLoadingVAT] = useState(true);

  // ─── History state ───
  const [historyEntries, setHistoryEntries] = useState<YearReportEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // ─── Load P&L and balance sheet data ───
  const fetchFinancialData = useCallback(async (year: string) => {
    try {
      const [pnlRes, bsRes] = await Promise.all([
        fetch(`/api/reports?type=income-statement&from=${year}-01-01&to=${year}-12-31`),
        fetch(`/api/reports?type=balance-sheet&to=${year}-12-31`),
      ]);

      if (pnlRes.ok) {
        const pnl = await pnlRes.json();
        setPnlData({
          revenue: pnl.revenue ?? pnl.totalRevenue ?? 0,
          expenses: pnl.expenses ?? pnl.totalExpenses ?? 0,
          netResult: pnl.netResult ?? pnl.netIncome ?? 0,
        });
      }

      if (bsRes.ok) {
        const bs = await bsRes.json();
        setBalanceData({
          totalAssets: bs.totalAssets ?? 0,
          totalLiabilities: bs.totalLiabilities ?? 0,
          equity: bs.equity ?? bs.totalEquity ?? 0,
        });
      }
    } catch (error) {
      console.error('Failed to fetch financial data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ─── Load VAT submissions ───
  const fetchVATSubmissions = useCallback(async (year: string) => {
    setIsLoadingVAT(true);
    try {
      const res = await fetch(`/api/vat-report/submissions?year=${year}`);
      if (res.ok) {
        const data = await res.json();
        setVatSubmissions(data.submissions ?? []);
      }
    } catch (error) {
      console.error('Failed to fetch VAT submissions:', error);
    } finally {
      setIsLoadingVAT(false);
    }
  }, []);

  // ─── Load history (years with VAT submissions OR financial activity) ───
  const fetchHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      // 1. Fetch VAT submissions
      const vatRes = await fetch('/api/vat-report/submissions');
      const vatData = vatRes.ok ? await vatRes.json() : null;
      const allSubmissions: VATSubmission[] = vatData?.submissions ?? [];
      const vatYears = new Set(allSubmissions.map((s: VATSubmission) => s.year));

      // 2. Scan all candidate years for financial activity (P&L non-zero)
      const candidateYears = YEAR_OPTIONS.filter(y => y <= currentYear);
      const pnlResults = await Promise.allSettled(
        candidateYears.map(async (y) => {
          const res = await fetch(`/api/reports?type=income-statement&from=${y}-01-01&to=${y}-12-31`);
          if (!res.ok) return { year: y, pnl: null };
          const d = await res.json();
          const pnl: PnLData = { revenue: d.revenue ?? d.totalRevenue ?? 0, expenses: d.expenses ?? d.totalExpenses ?? 0, netResult: d.netResult ?? d.netIncome ?? 0 };
          return { year: y, pnl };
        })
      );

      // 3. Build set of active years: has VAT submissions OR has non-zero financial data
      const activeYears = new Set<number>();
      const pnlMap = new Map<number, PnLData | null>();

      for (const result of pnlResults) {
        if (result.status === 'fulfilled') {
          const { year, pnl } = result.value;
          const hasFinancialActivity = pnl && (pnl.revenue !== 0 || pnl.expenses !== 0 || pnl.netResult !== 0);
          if (vatYears.has(year) || hasFinancialActivity) {
            activeYears.add(year);
            pnlMap.set(year, hasFinancialActivity ? pnl : null);
          }
        }
      }

      // Also include VAT-only years (no financial data but has submissions)
      for (const vy of vatYears) {
        activeYears.add(vy);
        if (!pnlMap.has(vy)) pnlMap.set(vy, null);
      }

      const yearsSorted = [...activeYears].sort((a, b) => b - a);
      if (yearsSorted.length === 0) { setHistoryEntries([]); setIsLoadingHistory(false); return; }

      // 4. Create initial entries
      const entries: YearReportEntry[] = yearsSorted.map(year => ({
        year,
        pnl: pnlMap.get(year) ?? null,
        balance: null,
        vatSubmissions: allSubmissions.filter((s: VATSubmission) => s.year === year),
        yearEndClosed: false,
        isLoading: true,
      }));
      setHistoryEntries(entries);

      // 5. Fetch balance sheet + year-end status for each active year
      for (const entry of entries) {
        const y = entry.year.toString();
        try {
          const [bsRes, yeRes] = await Promise.all([
            fetch(`/api/reports?type=balance-sheet&to=${y}-12-31`),
            fetch(`/api/year-end?year=${y}`),
          ]);

          let resolvedBs: BalanceSheetData | null = null;
          if (bsRes.ok) { const d = await bsRes.json(); resolvedBs = { totalAssets: d.totalAssets ?? 0, totalLiabilities: d.totalLiabilities ?? 0, equity: d.equity ?? d.totalEquity ?? 0 }; }

          let yeClosed = false;
          if (yeRes.ok) { const yeData = await yeRes.json(); yeClosed = yeData?.isClosed ?? false; }

          setHistoryEntries(prev => prev.map(e => e.year === entry.year ? { ...e, balance: resolvedBs, yearEndClosed: yeClosed, isLoading: false } : e));
        } catch {
          setHistoryEntries(prev => prev.map(e => e.year === entry.year ? { ...e, isLoading: false } : e));
        }
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // ─── Load current VAT period data ───
  const fetchCurrentVATData = useCallback(async (year: string, period: string) => {
    try {
      let from: string;
      let to: string;

      if (period === 'YEARLY') {
        from = `${year}-01-01`;
        to = `${year}-12-31`;
      } else {
        const qMap: Record<string, [number, number]> = {
          Q1: [1, 3],
          Q2: [4, 6],
          Q3: [7, 9],
          Q4: [10, 12],
        };
        const [startMonth, endMonth] = qMap[period] ?? [1, 3];
        const lastDay = new Date(parseInt(year), endMonth, 0).getDate();
        from = `${year}-${String(startMonth).padStart(2, '0')}-01`;
        to = `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`;
      }

      const res = await fetch(`/api/vat-register?from=${from}&to=${to}`);
      if (res.ok) {
        const data = await res.json();
        setCurrentVatData({
          outputVat: data.totalOutputVAT ?? 0,
          inputVat: data.totalInputVAT ?? 0,
          netVat: data.netVATPayable ?? 0,
          outputVATBreakdown: Array.isArray(data.outputVAT)
            ? data.outputVAT.map(
                (e: { rate: number; netAmount: number }) => ({ rate: e.rate, netAmount: e.netAmount }),
              )
            : [],
          inputVATBreakdown: Array.isArray(data.inputVAT)
            ? data.inputVAT.map(
                (e: { rate: number; netAmount: number }) => ({ rate: e.rate, netAmount: e.netAmount }),
              )
            : [],
        });
      }
    } catch (error) {
      console.error('Failed to fetch current VAT data:', error);
    }
  }, []);

  // ─── Initial data load ───
  useEffect(() => {
    setIsLoading(true);
    fetchFinancialData(selectedYear);
    fetchVATSubmissions(selectedYear);
    fetchCurrentVATData(selectedYear, selectedPeriod);
    fetchHistory();

    // Check if year-end closing has been done for selected year
    fetch(`/api/year-end?year=${selectedYear}`)
      .then((res) => {
        if (res.ok) {
          return res.json();
        }
        return null;
      })
      .then((data) => {
        setYearEndClosed(data?.isClosed ?? false);
      })
      .catch(() => {
        setYearEndClosed(false);
      });
  }, [selectedYear, selectedPeriod, fetchFinancialData, fetchVATSubmissions, fetchCurrentVATData, fetchHistory]);

  // ─── Print year report as PDF ───
  const handlePrintYearReport = useCallback((entry: YearReportEntry) => {
    const isDa = language === 'da';
    const p = entry.pnl;
    const b = entry.balance;
    const hasVAT = entry.vatSubmissions.length > 0;
    const totalOutputVAT = entry.vatSubmissions.reduce((s, sub) => s + sub.outputVat, 0);
    const totalInputVAT = entry.vatSubmissions.reduce((s, sub) => s + sub.inputVat, 0);
    const netVAT = totalOutputVAT - totalInputVAT;

    const html = `<!DOCTYPE html><html lang="${isDa ? 'da' : 'en'}"><head><meta charset="utf-8"><title>${isDa ? 'Årsrapport' : 'Annual Report'} ${entry.year}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:40px auto;color:#1a1a1a;line-height:1.6}
h1{font-size:24px;border-bottom:2px solid #0d9488;padding-bottom:8px}
h2{font-size:16px;margin-top:24px;color:#0d9488}
dl{display:grid;grid-template-columns:200px 1fr;gap:4px 16px;margin:8px 0}
dt{font-weight:600;font-size:13px;color:#666}
dd{font-size:14px;font-family:monospace;text-align:right}
.badge{display:inline-block;padding:2px 10px;border-radius:9999px;font-size:11px;font-weight:600}
.badge-ok{background:#d1fae5;color:#065f46}.badge-no{background:#fef3c7;color:#92400e}
.footer{margin-top:40px;padding-top:12px;border-top:1px solid #ddd;font-size:11px;color:#999;text-align:center}
@media print{body{margin:20px}}</style></head><body>
<h1>${isDa ? 'Årsrapport' : 'Annual Report'} ${entry.year}</h1>
<p>${isDa
    ? `Nedenstående er en berettende oversigt over regnskabsåret ${entry.year}.`
    : `Below is a narrative overview of fiscal year ${entry.year}.`}</p>
<h2>${isDa ? 'Resultatopgørelse' : 'Income Statement'}</h2>
${p ? `<dl>
<dt>${isDa ? 'Omsætning' : 'Revenue'}</dt><dd>${tc(p.revenue)}</dd>
<dt>${isDa ? 'Omkostninger' : 'Expenses'}</dt><dd>${tc(p.expenses)}</dd>
<dt>${isDa ? 'Årets resultat' : 'Net Result'}</dt><dd style="font-weight:700">${tc(p.netResult)}</dd>
</dl>
<p>${p.netResult >= 0
    ? (isDa ? `Året lukkede med et overskud på ${tc(p.netResult)}. Omsætningen udgjorde ${tc(p.revenue)} med omkostninger på ${tc(p.expenses)}.` : `The year closed with a profit of ${tc(p.netResult)}. Revenue was ${tc(p.revenue)} with expenses of ${tc(p.expenses)}.`)
    : (isDa ? `Året lukkede med et underskud på ${tc(Math.abs(p.netResult))}. Omsætningen udgjorde ${tc(p.revenue)} med omkostninger på ${tc(p.expenses)}.` : `The year closed with a loss of ${tc(Math.abs(p.netResult))}. Revenue was ${tc(p.revenue)} with expenses of ${tc(p.expenses)}.`)}</p>`
    : `<p>${isDa ? 'Ingen resultatopgørelsesdata tilgængelig for dette år.' : 'No income statement data available for this year.'}</p>`}
<h2>${isDa ? 'Balance' : 'Balance Sheet'}</h2>
${b ? `<dl>
<dt>${isDa ? 'Samlede aktiver' : 'Total Assets'}</dt><dd>${tc(b.totalAssets)}</dd>
<dt>${isDa ? 'Samlede forpligtelser' : 'Total Liabilities'}</dt><dd>${tc(b.totalLiabilities)}</dd>
<dt>${isDa ? 'Egenkapital' : 'Equity'}</dt><dd>${tc(b.equity)}</dd>
</dl>` : `<p>${isDa ? 'Ingen balancedata tilgængelig.' : 'No balance sheet data available.'}</p>`}
${hasVAT ? `<h2>${isDa ? 'Moms' : 'VAT'}</h2>
<dl>
<dt>${isDa ? 'Udgående moms' : 'Output VAT'}</dt><dd>${tc(totalOutputVAT)}</dd>
<dt>${isDa ? 'Indgående moms' : 'Input VAT'}</dt><dd>${tc(totalInputVAT)}</dd>
<dt>${isDa ? 'Net moms' : 'Net VAT'}</dt><dd style="font-weight:700">${tc(netVAT)}</dd>
</dl>
<p>${isDa ? `Der blev indberettet ${entry.vatSubmissions.length} momsteriod(er) for året.` : `${entry.vatSubmissions.length} VAT period(s) were submitted for the year.`}</p>` : ''}
<h2>${isDa ? 'Status' : 'Status'}</h2>
<p><span class="badge ${entry.yearEndClosed ? 'badge-ok' : 'badge-no'}">${entry.yearEndClosed
    ? (isDa ? 'Årsafslutning udført' : 'Year-end closed')
    : (isDa ? 'Årsafslutning ikke udført' : 'Year-end not closed')}</span></p>
<div class="footer">${isDa
    ? `Genereret af AlphaFlow · ${new Date().toLocaleDateString('da-DK')} · Jf. Bogføringslovens § 12`
    : `Generated by AlphaFlow · ${new Date().toLocaleDateString('en-GB')} · Per the Danish Bookkeeping Act § 12`}</div>
</body></html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); win.print(); }
  }, [language, tc]);

  // ─── Download CSV (Regnskab Basis) ───
  const handleDownloadCSV = useCallback(async () => {
    setIsDownloadingCSV(true);
    try {
      const response = await fetch(`/api/reports/annual-csv?year=${selectedYear}`);
      if (!response.ok) {
        throw new Error('Failed to generate CSV');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `regnskab-basis-${selectedYear}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(
        language === 'da' ? 'CSV eksporteret' : 'CSV exported',
        {
          description: language === 'da'
            ? `Regnskab Basis for ${selectedYear} er blevet downloadet`
            : `Regnskab Basis for ${selectedYear} has been downloaded`,
        },
      );
    } catch (error) {
      console.error('CSV download failed:', error);
      toast.error(language === 'da' ? 'Kunne ikke eksportere CSV' : 'Failed to export CSV');
    } finally {
      setIsDownloadingCSV(false);
    }
  }, [selectedYear, language]);

  // ─── Download XBRL (Regnskab Special) ───
  const handleDownloadXBRL = useCallback(async () => {
    setIsDownloadingXBRL(true);
    try {
      const response = await fetch(`/api/reports/annual-xbrl?year=${selectedYear}`);
      if (!response.ok) {
        throw new Error('Failed to generate XBRL');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `regnskab-special-${selectedYear}.xbrl`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(
        language === 'da' ? 'XBRL eksporteret' : 'XBRL exported',
        {
          description: language === 'da'
            ? `Regnskab Special for ${selectedYear} er blevet downloadet`
            : `Regnskab Special for ${selectedYear} has been downloaded`,
        },
      );
    } catch (error) {
      console.error('XBRL download failed:', error);
      toast.error(language === 'da' ? 'Kunne ikke eksportere XBRL' : 'Failed to export XBRL');
    } finally {
      setIsDownloadingXBRL(false);
    }
  }, [selectedYear, language]);

  // ─── Prepare & submit VAT report ───
  const handleSubmitVAT = useCallback(async () => {
    setIsSubmittingVAT(true);
    try {
      const response = await fetch('/api/vat-report/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: parseInt(selectedYear),
          period: selectedPeriod,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to submit VAT report');
      }

      const data = await response.json();
      toast.success(
        language === 'da' ? 'Momsopgørelse indsendt' : 'VAT report submitted',
        {
          description: language === 'da'
            ? `Moms for ${selectedYear} ${selectedPeriod} er indsendt til Skattestyrelsen`
            : `VAT for ${selectedYear} ${selectedPeriod} has been submitted to the Tax Authority`,
        },
      );

      // Refresh submissions list
      fetchVATSubmissions(selectedYear);
    } catch (error) {
      console.error('VAT submission failed:', error);
      toast.error(
        language === 'da' ? 'Kunne ikke indsende moms' : 'Failed to submit VAT report',
        {
          description: error instanceof Error ? error.message : undefined,
        },
      );
    } finally {
      setIsSubmittingVAT(false);
    }
  }, [selectedYear, selectedPeriod, language, fetchVATSubmissions]);

  // ─── Period label helper ───
  const getPeriodLabel = useCallback((period: string) => {
    const found = PERIOD_OPTIONS.find((p) => p.value === period);
    return found ? (language === 'da' ? found.label : found.labelEn) : period;
  }, [language]);

  // ─── Per-rate VAT breakdown (for the 'Moms pr. sats' card) ───
  const outputVATBreakdown = currentVatData?.outputVATBreakdown ?? [];
  const inputVATBreakdown = currentVatData?.inputVATBreakdown ?? [];
  const vatTotals = {
    outputVAT: currentVatData?.outputVat ?? 0,
    inputVAT: currentVatData?.inputVat ?? 0,
    netPayable: currentVatData?.netVat ?? 0,
  };

  // ─── Computed totals for summary cards ───
  const netVATForYear = vatTotals.outputVAT - vatTotals.inputVAT;

  // ─── Loading skeleton ───
  if (isLoading) {
    return (
      <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
        <PageHeader
          title={language === 'da' ? 'Moms & Årsregnskab' : 'VAT & Annual Report'}
          description={language === 'da' ? 'Årsregnskab, momsindberetning og historik' : 'Annual reports, VAT submissions and history'}
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-0 shadow-lg">
              <CardContent className="p-4">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            <Skeleton className="h-6 w-48 mb-4" />
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
      {/* Header */}
      <PageHeader
        title={language === 'da' ? 'Moms & Årsregnskab' : 'VAT & Annual Report'}
        description={
          language === 'da'
            ? 'Årsregnskab, momsindberetning og historik'
            : 'Annual reports, VAT submissions and history'
        }
      />

      <Tabs defaultValue="vat-submission" className="space-y-4 lg:space-y-6">
        <TabsList className="bg-white dark:bg-[#1a1f1e] border border-gray-200 dark:border-gray-700 p-1">
          <TabsTrigger value="vat-submission" className="gap-1.5 text-sm">
            <ShieldCheck className="h-4 w-4" />
            <span className="hidden sm:inline">{language === 'da' ? 'Momsindberetning' : 'VAT Submission'}</span>
            <span className="sm:hidden">{language === 'da' ? 'Moms' : 'VAT'}</span>
          </TabsTrigger>
          <TabsTrigger value="year-end" className="gap-1.5 text-sm">
            <Lock className="h-4 w-4" />
            <span className="hidden sm:inline">{language === 'da' ? 'Årsafslutning' : 'Year-End'}</span>
            <span className="sm:hidden">{language === 'da' ? 'Luk' : 'Close'}</span>
          </TabsTrigger>
          <TabsTrigger value="annual-report" className="gap-1.5 text-sm">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">{language === 'da' ? 'Årsregnskab' : 'Annual Report'}</span>
            <span className="sm:hidden">{language === 'da' ? 'Årsregnskab' : 'Annual'}</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 text-sm">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">{language === 'da' ? 'Historik' : 'History'}</span>
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════════
            TAB 1: Årsregnskab (Annual Report)
        ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="annual-report" className="space-y-4 lg:space-y-6">
          {/* Year Selector */}
          <div className="flex justify-end">
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-32 bg-gray-50 dark:bg-white/5 border-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-[#1a1f1e]" align="end">
                {YEAR_OPTIONS.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            {/* Net Result */}
            <Card className="stat-card card-hover-lift border-0 shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-8 w-8 rounded-lg bg-[#0d9488]/10 flex items-center justify-center">
                    <TrendingUp className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
                  </div>
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {language === 'da' ? 'Årets resultat' : 'Net Result'}
                  </span>
                </div>
                <p className={`text-xl lg:text-2xl font-bold tabular-nums ${pnlData?.netResult && pnlData.netResult >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {tc(pnlData?.netResult ?? 0)}
                </p>
              </CardContent>
            </Card>

            {/* Total Revenue */}
            <Card className="stat-card card-hover-lift border-0 shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {language === 'da' ? 'Omsætning' : 'Total Revenue'}
                  </span>
                </div>
                <p className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
                  {tc(pnlData?.revenue ?? 0)}
                </p>
              </CardContent>
            </Card>

            {/* Total Expenses */}
            <Card className="stat-card card-hover-lift border-0 shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <TrendingDown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {language === 'da' ? 'Udgifter' : 'Total Expenses'}
                  </span>
                </div>
                <p className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
                  {tc(pnlData?.expenses ?? 0)}
                </p>
              </CardContent>
            </Card>

            {/* Net VAT */}
            <Card className="stat-card card-hover-lift border-0 shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-8 w-8 rounded-lg bg-[#0d9488]/10 flex items-center justify-center">
                    <BarChart3 className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
                  </div>
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {language === 'da' ? 'Net moms' : 'Net VAT'}
                  </span>
                </div>
                <p className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
                  {tc(netVATForYear)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Export & Status Card */}
          <Card className="stat-card card-hover-lift border-0 shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-[#0d9488]" />
                {language === 'da' ? 'Eksport af årsregnskab' : 'Annual Report Export'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Export buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={handleDownloadCSV}
                  disabled={isDownloadingCSV}
                  className="gap-2 btn-primary flex-1 sm:flex-none justify-center"
                >
                  {isDownloadingCSV ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4" />
                  )}
                  {language === 'da' ? 'Download CSV (Regnskab Basis)' : 'Download CSV (Regnskab Basis)'}
                </Button>
                <Button
                  onClick={handleDownloadXBRL}
                  disabled={isDownloadingXBRL}
                  variant="outline"
                  className="gap-2 flex-1 sm:flex-none justify-center border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  {isDownloadingXBRL ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-4 w-4" />
                  )}
                  {language === 'da' ? 'Download XBRL (Regnskab Special)' : 'Download XBRL (Regnskab Special)'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Balance Sheet Summary */}
          {balanceData && (
            <Card className="stat-card card-hover-lift border-0 shadow-lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-[#0d9488]" />
                  {language === 'da' ? 'Balance (resumé)' : 'Balance Sheet (Summary)'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      {language === 'da' ? 'Samlede aktiver' : 'Total Assets'}
                    </p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">
                      {tc(balanceData.totalAssets)}
                    </p>
                  </div>
                  <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      {language === 'da' ? 'Samlede forpligtelser' : 'Total Liabilities'}
                    </p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">
                      {tc(balanceData.totalLiabilities)}
                    </p>
                  </div>
                  <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      {language === 'da' ? 'Egenkapital' : 'Equity'}
                    </p>
                    <p className="text-lg font-bold text-[#0d9488] dark:text-[#2dd4bf] tabular-nums">
                      {tc(balanceData.equity)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            TAB 2: Momsindberetning (VAT Submission)
        ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="vat-submission" className="space-y-4 lg:space-y-6">
          {/* Period Selector */}
          <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                <div className="flex-1 grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1 block">
                      {t('year')}
                    </label>
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                      <SelectTrigger className="bg-gray-50 dark:bg-white/5 border-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-[#1a1f1e]" align="end">
                        {YEAR_OPTIONS.map((year) => (
                          <SelectItem key={year} value={year.toString()}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1 block">
                      {language === 'da' ? 'Periode' : 'Period'}
                    </label>
                    <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                      <SelectTrigger className="bg-gray-50 dark:bg-white/5 border-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-[#1a1f1e]" align="end">
                        {PERIOD_OPTIONS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {language === 'da' ? p.label : p.labelEn}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  onClick={handleSubmitVAT}
                  disabled={isSubmittingVAT}
                  className="gap-2 btn-primary"
                >
                  {isSubmittingVAT ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {language === 'da' ? 'Forbered momsopgørelse' : 'Prepare VAT Report'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Current Period VAT Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4">
            {/* Output VAT */}
            <Card className="stat-card card-hover-lift overflow-hidden">
              <div className="bg-gradient-to-r from-[#0d9488]/8 to-transparent dark:from-[#0d9488]/15 px-4 pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {language === 'da' ? 'Udgående moms' : 'Output VAT'}
                  </span>
                </div>
                <p className="text-2xl font-bold text-[#0d9488] dark:text-[#2dd4bf] tabular-nums">
                  {tc(currentVatData?.outputVat ?? 0)}
                </p>
              </div>
            </Card>

            {/* Input VAT */}
            <Card className="stat-card card-hover-lift overflow-hidden">
              <div className="bg-gradient-to-r from-amber-500/8 to-transparent dark:from-amber-500/15 px-4 pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {language === 'da' ? 'Indgående moms' : 'Input VAT'}
                  </span>
                </div>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                  {tc(currentVatData?.inputVat ?? 0)}
                </p>
              </div>
            </Card>

            {/* Net VAT Payable */}
            <Card className="stat-card card-hover-lift overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-500/8 to-transparent dark:from-emerald-500/15 px-4 pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {language === 'da' ? 'Moms til betaling' : 'Net VAT Payable'}
                  </span>
                </div>
                <p className={`text-2xl font-bold tabular-nums ${(currentVatData?.netVat ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {tc(currentVatData?.netVat ?? 0)}
                </p>
              </div>
            </Card>
          </div>

          {/* Previous Submissions Table */}
          <Card className="stat-card card-hover-lift border-0 shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <History className="h-5 w-5 text-[#0d9488]" />
                {language === 'da' ? 'Tidligere indberetninger' : 'Previous Submissions'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingVAT ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : vatSubmissions.length > 0 ? (
                <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white dark:bg-[#1a1f1e] z-10">
                      <TableRow className="border-b border-gray-200 dark:border-gray-700">
                        <TableHead className="py-2.5 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400">
                          {language === 'da' ? 'Periode' : 'Period'}
                        </TableHead>
                        <TableHead className="py-2.5 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 text-right">
                          {language === 'da' ? 'Udg. moms' : 'Output VAT'}
                        </TableHead>
                        <TableHead className="py-2.5 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 text-right">
                          {language === 'da' ? 'Indg. moms' : 'Input VAT'}
                        </TableHead>
                        <TableHead className="py-2.5 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 text-right">
                          {language === 'da' ? 'Net moms' : 'Net VAT'}
                        </TableHead>
                        <TableHead className="py-2.5 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400">
                          {language === 'da' ? 'Status' : 'Status'}
                        </TableHead>
                        <TableHead className="py-2.5 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                          {language === 'da' ? 'Indsendt' : 'Submitted'}
                        </TableHead>
                        <TableHead className="py-2.5 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 hidden md:table-cell">
                          {language === 'da' ? 'Reference' : 'Reference'}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vatSubmissions.map((sub) => (
                        <TableRow
                          key={sub.id}
                          className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer table-row-teal-hover"
                        >
                          <TableCell className="py-2.5 px-3 text-sm font-medium text-gray-900 dark:text-white">
                            {sub.year} — {getPeriodLabel(sub.period)}
                          </TableCell>
                          <TableCell className="py-2.5 px-3 text-sm text-right font-medium text-[#0d9488] dark:text-[#2dd4bf] tabular-nums">
                            {tc(sub.outputVat)}
                          </TableCell>
                          <TableCell className="py-2.5 px-3 text-sm text-right font-medium text-amber-600 dark:text-amber-400 tabular-nums">
                            -{tc(sub.inputVat)}
                          </TableCell>
                          <TableCell className={`py-2.5 px-3 text-sm text-right font-bold tabular-nums ${sub.netVat >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {tc(sub.netVat)}
                          </TableCell>
                          <TableCell className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5">
                              {getStatusIcon(sub.status)}
                              {getStatusBadge(sub.status, language)}
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5 px-3 text-sm text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                            {sub.submittedDate
                              ? format(new Date(sub.submittedDate), 'dd/MM/yyyy HH:mm')
                              : '—'}
                          </TableCell>
                          <TableCell className="py-2.5 px-3 text-sm text-gray-500 dark:text-gray-400 font-mono hidden md:table-cell">
                            {sub.reference || '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
                  <History className="h-10 w-10 mb-3 opacity-50" />
                  <p className="text-sm">
                    {language === 'da'
                      ? 'Ingen momsindberetninger for dette år'
                      : 'No VAT submissions for this year'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ═══ Moms pr. sats (VAT Breakdown Tables) — flyttet fra Momsafregning ═══ */}
          <Card className="stat-card card-hover-lift">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Calculator className="h-5 w-5 text-[#0d9488]" />
                {language === 'da' ? 'Moms pr. sats' : 'VAT per Rate'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {outputVATBreakdown.length > 0 || inputVATBreakdown.length > 0 ? (
                <div className="space-y-4">
                  {/* Output VAT Table */}
                  {outputVATBreakdown.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-[#0d9488] dark:text-[#2dd4bf] mb-2 flex items-center gap-1">
                        <ArrowUpCircle className="h-4 w-4" />
                        {language === 'da' ? 'Udgående moms (salg)' : 'Output VAT (Sales)'}
                      </h4>
                      <Table className="table-fixed">
                        <TableHeader>
                          <TableRow className="border-b border-gray-200 dark:border-gray-700">
                            <TableHead className="py-2 w-[40%]">{t('vatRate')}</TableHead>
                            <TableHead className="text-right py-2 w-[30%]">{t('vatAmount')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {outputVATBreakdown.map((item) => (
                            <TableRow key={`out-${item.rate}`} className="border-b border-gray-100 dark:border-gray-800 table-row-teal-hover">
                              <TableCell className="py-2 w-[40%]">
                                <Badge className="status-badge status-badge-sent">
                                  {item.rate}%
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right py-2 w-[30%] font-medium text-[#0d9488] dark:text-[#2dd4bf]">
                                {tc(item.netAmount)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {/* Input VAT Table */}
                  {inputVATBreakdown.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1">
                        <ArrowDownCircle className="h-4 w-4" />
                        {language === 'da' ? 'Indgående moms (køb)' : 'Input VAT (Purchases)'}
                      </h4>
                      <Table className="table-fixed">
                        <TableHeader>
                          <TableRow className="border-b border-gray-200 dark:border-gray-700">
                            <TableHead className="py-2 w-[40%]">{t('vatRate')}</TableHead>
                            <TableHead className="text-right py-2 w-[30%]">{t('vatAmount')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {inputVATBreakdown.map((item) => (
                            <TableRow key={`in-${item.rate}`} className="border-b border-gray-100 dark:border-gray-800 table-row-teal-hover">
                              <TableCell className="py-2 w-[40%]">
                                <Badge className="status-badge status-badge-overdue">
                                  {item.rate}%
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right py-2 w-[30%] font-medium text-amber-600 dark:text-amber-400">
                                {tc(item.netAmount)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {/* Totals */}
                  <div className="pt-2 border-t border-gray-200 dark:border-gray-700 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">{t('outputVAT')}:</span>
                      <span className="font-medium text-[#0d9488] dark:text-[#2dd4bf]">{tc(vatTotals.outputVAT)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">{t('inputVAT')}:</span>
                      <span className="font-medium text-amber-600 dark:text-amber-400">-{tc(vatTotals.inputVAT)}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-gray-200 dark:border-gray-700 font-bold">
                      <span className="text-gray-900 dark:text-white">
                        {vatTotals.netPayable >= 0 ? t('toPay') : t('toRefund')}:
                      </span>
                      <span className={vatTotals.netPayable >= 0 ? 'text-green-600 dark:text-green-400' : 'text-[#0d9488] dark:text-[#2dd4bf]'}>
                        {tc(Math.abs(vatTotals.netPayable))}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
                  {isLoadingVAT ? <Loader2 className="h-6 w-6 animate-spin text-gray-400" /> : t('noTransactionsPeriod')}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            TAB 3: Historik
        ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="history" className="space-y-4 lg:space-y-6">
          {isLoadingHistory ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-40 w-full rounded-xl" />
              ))}
            </div>
          ) : historyEntries.length > 0 ? (
            <div className="space-y-3">
              {historyEntries.map((entry) => {
                const isDa = language === 'da';
                const p = entry.pnl;
                const b = entry.balance;
                const hasVAT = entry.vatSubmissions.length > 0;
                const hasFinancial = p !== null;
                const totalOutVAT = entry.vatSubmissions.reduce((s, sub) => s + sub.outputVat, 0);
                const totalInVAT = entry.vatSubmissions.reduce((s, sub) => s + sub.inputVat, 0);
                const netVAT = totalOutVAT - totalInVAT;

                return (
                  <Collapsible key={entry.year}>
                    <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5 overflow-hidden">
                      {/* ── Header row ── */}
                      <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors pb-3">
                          <div className="flex items-center justify-between gap-3 w-full">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${hasFinancial ? 'bg-[#0d9488]/10' : 'bg-gray-100 dark:bg-gray-800'}`}>
                                <BarChart3 className={`h-5 w-5 ${hasFinancial ? 'text-[#0d9488] dark:text-[#2dd4bf]' : 'text-gray-400 dark:text-gray-500'}`} />
                              </div>
                              <div className="min-w-0">
                                <CardTitle className="text-base font-bold text-gray-900 dark:text-white flex flex-wrap items-center gap-2">
                                  {isDa ? `Årsregnskab ${entry.year}` : `Annual Report ${entry.year}`}
                                  {hasFinancial && hasVAT && (
                                    <Badge className="bg-[#0d9488]/10 text-[#0d9488] dark:bg-[#2dd4bf]/10 dark:text-[#2dd4bf] border-[#0d9488]/20 text-[10px]">
                                      {isDa ? 'Årsregnskab + Moms' : 'Report + VAT'}
                                    </Badge>
                                  )}
                                  {hasFinancial && !hasVAT && (
                                    <Badge className="bg-[#0d9488]/10 text-[#0d9488] dark:bg-[#2dd4bf]/10 dark:text-[#2dd4bf] border-[#0d9488]/20 text-[10px]">
                                      {isDa ? 'Årsregnskab' : 'Annual Report'}
                                    </Badge>
                                  )}
                                  {!hasFinancial && hasVAT && (
                                    <Badge className="bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 text-[10px]">
                                      {isDa ? 'Kun Moms' : 'VAT Only'}
                                    </Badge>
                                  )}
                                  {entry.yearEndClosed ? (
                                    <Badge className="bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/20 gap-1 text-[10px]">
                                      <CheckCircle className="h-3 w-3" /> {isDa ? 'Lukket' : 'Closed'}
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/20 text-[10px]">
                                      {isDa ? 'Åben' : 'Open'}
                                    </Badge>
                                  )}
                                </CardTitle>
                                <CardDescription className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 flex-wrap">
                                  {hasVAT && (
                                    <span>{entry.vatSubmissions.length} {isDa ? 'momsindberetninger' : 'VAT submissions'}</span>
                                  )}
                                  {hasVAT && hasFinancial && <span>·</span>}
                                  {p && (
                                    <span>{isDa ? 'Resultat' : 'Result'}: <span className={p.netResult >= 0 ? 'text-green-600 dark:text-green-400 font-medium' : 'text-red-600 dark:text-red-400 font-medium'}>{tc(p.netResult)}</span></span>
                                  )}
                                  {!hasFinancial && !hasVAT && (
                                    <span className="italic">{isDa ? 'Ingen data' : 'No data'}</span>
                                  )}
                                </CardDescription>
                              </div>
                            </div>
                            <ChevronDown className="h-4 w-4 text-gray-400 shrink-0 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>

                      {/* ── Narrative preview + actions ── */}
                      <CollapsibleContent>
                        <CardContent className="pt-0 pb-4 space-y-4">
                          {entry.isLoading ? (
                            <div className="space-y-2 py-4">
                              <Skeleton className="h-4 w-full" />
                              <Skeleton className="h-4 w-3/4" />
                              <Skeleton className="h-4 w-5/6" />
                            </div>
                          ) : (
                            <>
                              {/* Narrative text */}
                              <div className="rounded-lg bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/5 p-4 space-y-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                {hasFinancial ? (
                                  <>
                                    <p>
                                      {isDa
                                        ? `I regnskabsåret ${entry.year} opnåede virksomheden en omsætning på ${tc(p!.revenue)} med samlede omkostninger på ${tc(p!.expenses)}, hvilket resulterede i et ${p!.netResult >= 0 ? 'overskud' : 'underskud'} på ${tc(Math.abs(p!.netResult))}.`
                                        : `In fiscal year ${entry.year}, the company achieved revenue of ${tc(p!.revenue)} with total expenses of ${tc(p!.expenses)}, resulting in a ${p!.netResult >= 0 ? 'profit' : 'loss'} of ${tc(Math.abs(p!.netResult))}.`}
                                    </p>
                                    {b && (
                                      <p>
                                        {isDa
                                          ? `Balancen pr. 31. december viser samlede aktiver på ${tc(b.totalAssets)}, forpligtelser på ${tc(b.totalLiabilities)} og en egenkapital på ${tc(b.equity)}.`
                                          : `The balance sheet as of December 31 shows total assets of ${tc(b.totalAssets)}, liabilities of ${tc(b.totalLiabilities)}, and equity of ${tc(b.equity)}.`}
                                      </p>
                                    )}
                                  </>
                                ) : (
                                  <p className="text-gray-400 italic">{isDa ? 'Ingen resultatdata tilgængelig for dette år.' : 'No result data available for this year.'}</p>
                                )}

                                {hasVAT && (
                                  <p>
                                    {isDa
                                      ? `Momsåret udviser udgående moms på ${tc(totalOutVAT)} og indgående moms på ${tc(totalInVAT)}, svarende til en net moms på ${tc(netVAT)}. Der blev indberettet ${entry.vatSubmissions.length} period(er).`
                                      : `The VAT year shows output VAT of ${tc(totalOutVAT)} and input VAT of ${tc(totalInVAT)}, for a net VAT of ${tc(netVAT)}. ${entry.vatSubmissions.length} period(s) were submitted.`}
                                  </p>
                                )}

                                <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                                  {isDa
                                    ? `Årsafslutningen for ${entry.year} er ${entry.yearEndClosed ? 'udført og alle perioder er låst.' : 'endnu ikke udført.'}`
                                    : `Year-end closing for ${entry.year} is ${entry.yearEndClosed ? 'complete and all periods are locked.' : 'not yet performed.'}`}
                                </p>
                              </div>

                              {/* Quick stats row */}
                              {hasFinancial && (
                                <div className={`grid gap-2 ${hasVAT ? 'grid-cols-3' : 'grid-cols-2'}`}>
                                  <div className="rounded-lg bg-white dark:bg-white/[0.03] border border-gray-100 dark:border-white/5 p-2.5 text-center">
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">{isDa ? 'Omsætning' : 'Revenue'}</p>
                                    <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{tc(p!.revenue)}</p>
                                  </div>
                                  {hasVAT && (
                                    <div className="rounded-lg bg-white dark:bg-white/[0.03] border border-gray-100 dark:border-white/5 p-2.5 text-center">
                                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{isDa ? 'Net moms' : 'Net VAT'}</p>
                                      <p className="text-sm font-bold text-[#0d9488] dark:text-[#2dd4bf] tabular-nums">{tc(netVAT)}</p>
                                    </div>
                                  )}
                                  <div className="rounded-lg bg-white dark:bg-white/[0.03] border border-gray-100 dark:border-white/5 p-2.5 text-center">
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">{isDa ? 'Resultat' : 'Result'}</p>
                                    <p className={`text-sm font-bold tabular-nums ${p!.netResult >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{tc(p!.netResult)}</p>
                                  </div>
                                </div>
                              )}

                              {/* Action buttons */}
                              <div className="flex flex-wrap gap-2 pt-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handlePrintYearReport(entry)}
                                  className="gap-1.5 dark:text-gray-300 dark:border-gray-700"
                                >
                                  <FileDown className="h-3.5 w-3.5" />
                                  {isDa ? 'Gem som PDF' : 'Save as PDF'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    const url = `/api/reports/annual-csv?year=${entry.year}`;
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `aarsregnskab-${entry.year}.csv`;
                                    a.click();
                                  }}
                                  className="gap-1.5 text-gray-500 dark:text-gray-400"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  CSV
                                </Button>
                              </div>
                            </>
                          )}
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                );
              })}
            </div>
          ) : (
            <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
              <CardContent className="py-12 text-center">
                <History className="h-10 w-10 mb-3 mx-auto opacity-50 text-gray-400" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {language === 'da' ? 'Ingen historik fundet' : 'No history found'}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            TAB 4: Årsafslutning (Year-End Closing)
        ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="year-end" className="space-y-4 lg:space-y-6">
          <YearEndTab selectedYear={Number(selectedYear)} yearEndClosed={yearEndClosed} onClosed={() => {
            // Re-check year-end status after closing
            fetch(`/api/year-end?year=${selectedYear}`)
              .then((res) => res.ok ? res.json() : null)
              .then((data) => setYearEndClosed(data?.isClosed ?? false))
              .catch(() => setYearEndClosed(false));
            // Also refresh financial data
            fetchFinancialData(selectedYear);
          }} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
