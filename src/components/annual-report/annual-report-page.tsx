'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
import {
  FileDown,
  FileSpreadsheet,
  Send,
  History,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
  TrendingUp,
  TrendingDown,
  BarChart3,
  ShieldCheck,
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
  } | null>(null);
  const [isSubmittingVAT, setIsSubmittingVAT] = useState(false);
  const [isLoadingVAT, setIsLoadingVAT] = useState(true);

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
  }, [selectedYear, selectedPeriod, fetchFinancialData, fetchVATSubmissions, fetchCurrentVATData]);

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

  // ─── Computed totals for summary cards ───
  const netVATForYear = useMemo(() => {
    if (pnlData) {
      return (pnlData.revenue * 0.25) - (pnlData.expenses * 0.25);
    }
    return 0;
  }, [pnlData]);

  // ─── Loading skeleton ───
  if (isLoading) {
    return (
      <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
        <PageHeader
          title={language === 'da' ? 'Årsregnskab & Moms' : 'Annual Report & VAT'}
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
        title={language === 'da' ? 'Årsregnskab & Moms' : 'Annual Report & VAT'}
        description={
          language === 'da'
            ? 'Årsregnskab, momsindberetning og historik'
            : 'Annual reports, VAT submissions and history'
        }
        action={
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-28 bg-white/20 dark:bg-white/10 border-white/30 text-white focus:ring-white/30">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-[#1a1f1e]">
              {YEAR_OPTIONS.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <Tabs defaultValue="annual-report" className="space-y-4 lg:space-y-6">
        <TabsList className="bg-white dark:bg-[#1a1f1e] border border-gray-200 dark:border-gray-700 p-1">
          <TabsTrigger value="annual-report" className="gap-1.5 text-sm">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">{language === 'da' ? 'Årsregnskab' : 'Annual Report'}</span>
            <span className="sm:hidden">{language === 'da' ? 'Årsregnskab' : 'Annual'}</span>
          </TabsTrigger>
          <TabsTrigger value="vat-submission" className="gap-1.5 text-sm">
            <ShieldCheck className="h-4 w-4" />
            <span className="hidden sm:inline">{language === 'da' ? 'Momsindberetning' : 'VAT Submission'}</span>
            <span className="sm:hidden">{language === 'da' ? 'Moms' : 'VAT'}</span>
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
              {/* Year-end status */}
              <div className={`flex items-center gap-2 text-sm px-4 py-3 rounded-lg ${
                yearEndClosed
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/30'
                  : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30'
              }`}>
                {yearEndClosed ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-emerald-700 dark:text-emerald-300">
                      {language === 'da'
                        ? `Årsafslutning for ${selectedYear} er udført`
                        : `Year-end closing for ${selectedYear} has been performed`}
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="text-amber-700 dark:text-amber-300">
                      {language === 'da'
                        ? `Årsafslutning for ${selectedYear} er ikke udført endnu — data kan være ufuldstændige`
                        : `Year-end closing for ${selectedYear} has not been performed — data may be incomplete`}
                    </span>
                  </>
                )}
              </div>

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
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            TAB 3: Historik (Submission History)
        ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="history" className="space-y-4 lg:space-y-6">
          {/* Year filter for history */}
          <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1 block">
                    {language === 'da' ? 'Filtrer efter år' : 'Filter by Year'}
                  </label>
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
              </div>
            </CardContent>
          </Card>

          {/* Full history table */}
          <Card className="stat-card card-hover-lift border-0 shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <History className="h-5 w-5 text-[#0d9488]" />
                {language === 'da' ? 'Momsindberetninger — fuld historik' : 'VAT Submissions — Full History'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingVAT ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : vatSubmissions.length > 0 ? (
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white dark:bg-[#1a1f1e] z-10">
                      <TableRow className="border-b border-gray-200 dark:border-gray-700">
                        <TableHead className="py-2.5 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400">
                          {language === 'da' ? 'År' : 'Year'}
                        </TableHead>
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
                            {sub.year}
                          </TableCell>
                          <TableCell className="py-2.5 px-3 text-sm text-gray-700 dark:text-gray-300">
                            {getPeriodLabel(sub.period)}
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
                      ? 'Ingen momsindberetninger fundet'
                      : 'No VAT submissions found'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
