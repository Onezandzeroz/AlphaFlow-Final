'use client';

import { useState, useEffect, useCallback } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Download,
  Loader2,
  CheckCircle2,
  Circle,
  FileArchive,
  ArrowRightLeft,
  Info,
  Copy,
  ExternalLink,
  Shield,
  Clock,
} from 'lucide-react';

interface ExportInfoData {
  totalExports: number;
  lastExport: {
    guid: string;
    format: string;
    checksum: string | null;
    date: string;
  } | null;
  currentDataVolume: {
    accounts: number;
    transactions: number;
    journalEntries: number;
    invoices: number;
    contacts: number;
    documents: number;
    bankStatements: number;
  } | null;
  recentExports: Array<{
    guid: string;
    format: string;
    date: string;
  }>;
}

interface ProviderSwitchChecklistProps {
  user: User;
}

const CHECKLIST_ITEMS_DA = [
  {
    id: 'export',
    label: 'Eksporter al data (portabel JSON)',
    description: 'Brug "Eksporter alt" knappen ovenfor til at downloade en komplet kopi af alle data inkl. bilag.',
  },
  {
    id: 'verify',
    label: 'Verificer eksportfilen',
    description: 'Åbn den downloadede JSON-fil og bekræft at _meta.exportGuid er synlig og dataChecksum matcher.',
  },
  {
    id: 'invoices',
    label: 'Eksporter udestående fakturaer',
    description: 'Eksporter alle fakturaer (CSV/OIOUBL) fra Eksport-siden, så de kan genskabes i det nye system.',
  },
  {
    id: 'periods',
    label: 'Luk åbne regnskabsperioder',
    description: 'Luk alle åbne perioder under Regnskabsperioder, så der ikke kan bogføres yderligere.',
  },
  {
    id: 'backup',
    label: 'Tag en manuel backup',
    description: 'Gå til Backup-siden og opret en manuel backup som ekstra sikkerhedskopi.',
  },
  {
    id: 'receipts',
    label: 'Download alle bilag/kvitteringer',
    description: 'Vælg "Inkluder filer" ved eksport for at få alle uploaded bilag med i eksportfilen.',
  },
  {
    id: 'guid',
    label: 'Gem eksport-GUID',
    description: 'GUID\'en er din bekræftelse på, at data blev eksporteret korrekt. Opbevar den i mindst 5 år.',
  },
  {
    id: 'new-system',
    label: 'Importér data i nyt system',
    description: 'Brug den portable JSON-fil til at importere data i det nye bogføringssystem.',
  },
];

const CHECKLIST_ITEMS_EN = [
  {
    id: 'export',
    label: 'Export all data (portable JSON)',
    description: 'Use the "Export All" button above to download a complete copy of all data including documents.',
  },
  {
    id: 'verify',
    label: 'Verify the export file',
    description: 'Open the downloaded JSON file and confirm that _meta.exportGuid is visible and dataChecksum matches.',
  },
  {
    id: 'invoices',
    label: 'Export outstanding invoices',
    description: 'Export all invoices (CSV/OIOUBL) from the Exports page so they can be recreated in the new system.',
  },
  {
    id: 'periods',
    label: 'Close open fiscal periods',
    description: 'Close all open periods under Fiscal Periods so no further entries can be posted.',
  },
  {
    id: 'backup',
    label: 'Take a manual backup',
    description: 'Go to the Backup page and create a manual backup as an extra safety copy.',
  },
  {
    id: 'receipts',
    label: 'Download all receipts/vouchers',
    description: 'Select "Include files" during export to get all uploaded receipts in the export file.',
  },
  {
    id: 'guid',
    label: 'Save the export GUID',
    description: 'The GUID is your proof that data was exported correctly. Keep it for at least 5 years.',
  },
  {
    id: 'new-system',
    label: 'Import data into new system',
    description: 'Use the portable JSON file to import data into the new bookkeeping system.',
  },
];

export function ProviderSwitchChecklist({ user }: ProviderSwitchChecklistProps) {
  const { language } = useTranslation();
  const isDa = language === 'da';
  const checklist = isDa ? CHECKLIST_ITEMS_DA : CHECKLIST_ITEMS_EN;

  const [exportInfo, setExportInfo] = useState<ExportInfoData | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [includeFiles, setIncludeFiles] = useState(true);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [exportGuid, setExportGuid] = useState<string | null>(null);

  // Fetch export info
  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const res = await fetch('/api/company/export-info');
        if (res.ok) {
          const data = await res.json();
          setExportInfo(data);
        }
      } catch {
        // Silent fail — export info is optional
      }
    };
    fetchInfo();
  }, []);

  // Load checklist from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('provider-switch-checklist');
      if (saved) {
        setCheckedItems(new Set(JSON.parse(saved)));
      }
    } catch { /* ignore */ }
  }, []);

  // Save checklist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('provider-switch-checklist', JSON.stringify([...checkedItems]));
    } catch { /* ignore */ }
  }, [checkedItems]);

  const toggleItem = useCallback((id: string) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleExportAll = useCallback(async () => {
    setIsExporting(true);
    try {
      const url = `/api/export-tenant${includeFiles ? '?includeFiles=true' : ''}`;
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error('Export failed');
      }

      const data = await res.json();

      // Get GUID from the response
      const guid = data.exportData?._meta?.exportGuid;
      if (guid) {
        setExportGuid(guid);
      }

      // Create downloadable file
      const jsonStr = JSON.stringify(data.exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const companyName = user.activeCompanyName || 'company';
      const dateStr = new Date().toISOString().split('T')[0];
      a.download = `alphaflow-export-${companyName}-${dateStr}.json`;
      a.click();
      window.URL.revokeObjectURL(downloadUrl);

      toast.success(
        isDa ? 'Data eksporteret' : 'Data exported',
        {
          description: isDa
            ? `${data.summary?.accounts || 0} konti, ${data.summary?.transactions || 0} posteringer, ${data.summary?.journalEntries || 0} journalposter`
            : `${data.summary?.accounts || 0} accounts, ${data.summary?.transactions || 0} transactions, ${data.summary?.journalEntries || 0} journal entries`,
          duration: 5000,
        }
      );

      // Auto-check the export and verify items
      setCheckedItems((prev) => new Set([...prev, 'export', 'verify', 'receipts']));
    } catch (err) {
      toast.error(
        isDa ? 'Eksport mislykkedes' : 'Export failed',
        {
          description: err instanceof Error ? err.message : (isDa ? 'Kunne ikke eksportere data' : 'Could not export data'),
        }
      );
    } finally {
      setIsExporting(false);
    }
  }, [includeFiles, user.activeCompanyName, isDa]);

  const copyGuid = useCallback(() => {
    if (exportGuid) {
      navigator.clipboard.writeText(exportGuid);
      toast.success(isDa ? 'GUID kopieret' : 'GUID copied');
    }
  }, [exportGuid, isDa]);

  const allChecked = checklist.every((item) => checkedItems.has(item.id));
  const progress = Math.round((checkedItems.size / checklist.length) * 100);

  return (
    <div className="space-y-4">
      {/* Provider Switch Header */}
      <Card className="stat-card card-hover-lift border-0 shadow-lg dark:border dark:border-white/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0">
              <ArrowRightLeft className="h-4 w-4 text-white" />
            </div>
            {isDa ? 'Udbyderskift af bogføringssystem' : 'Switch Bookkeeping Provider'}
          </CardTitle>
          <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
            {isDa
              ? 'Følg denne guide for at sikre, at alle data overføres sikkert ved skift til et andet bogføringssystem. Krav jf. bogføringslovens § 12 om 5-års opbevaringspligt.'
              : 'Follow this guide to ensure all data is transferred securely when switching to another bookkeeping system. Required per the Danish Bookkeeping Act § 12 (5-year retention).'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress */}
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-gray-100 dark:bg-white/5 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 tabular-nums">
              {checkedItems.size}/{checklist.length}
            </span>
          </div>

          {/* Export All Button */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={handleExportAll}
              disabled={isExporting}
              className="btn-gradient text-white gap-2"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileArchive className="h-4 w-4" />
              )}
              {isExporting
                ? (isDa ? 'Eksporterer…' : 'Exporting…')
                : (isDa ? 'Eksporter alt (portabel JSON)' : 'Export All (portable JSON)')}
            </Button>
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={includeFiles}
                onChange={(e) => setIncludeFiles(e.target.checked)}
                className="rounded border-gray-300 text-[#0d9488] focus:ring-[#0d9488]"
              />
              {isDa ? 'Inkluder bilag/filer' : 'Include files/receipts'}
            </label>
          </div>

          {/* Export GUID Display */}
          {exportGuid && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    {isDa ? 'Eksport GUID:' : 'Export GUID:'}
                  </span>
                  <code className="text-xs font-mono text-amber-800 dark:text-amber-200 truncate">
                    {exportGuid}
                  </code>
                </div>
                <Button variant="ghost" size="sm" onClick={copyGuid} className="shrink-0 h-7 px-2">
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <p className="text-[10px] text-amber-600/70 dark:text-amber-400/70 mt-1">
                {isDa
                  ? 'Gem denne GUID som bevis for datadannelsen. Krav jf. BEK 98.'
                  : 'Save this GUID as proof of data transfer. Required per BEK 98.'}
              </p>
            </div>
          )}

          {/* Previous Export Info */}
          {exportInfo && exportInfo.lastExport && (
            <div className="rounded-lg bg-gray-50 dark:bg-white/5 p-3 flex items-center gap-3">
              <Clock className="h-4 w-4 text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {isDa
                    ? `Sidste eksport: ${new Date(exportInfo.lastExport.date).toLocaleDateString('da-DK')} (${exportInfo.totalExports} eksport${exportInfo.totalExports !== 1 ? 'er' : ''} i alt)`
                    : `Last export: ${new Date(exportInfo.lastExport.date).toLocaleDateString('en-GB')} (${exportInfo.totalExports} export${exportInfo.totalExports !== 1 ? 's' : ''} total)`}
                </p>
                {exportInfo.lastExport.checksum && (
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono truncate">
                    SHA-256: {exportInfo.lastExport.checksum.substring(0, 32)}…
                  </p>
                )}
              </div>
            </div>
          )}

          <Separator />

          {/* Checklist */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {isDa ? 'Checkliste for udbyderskift' : 'Provider Switch Checklist'}
            </p>
            {checklist.map((item) => (
              <div
                key={item.id}
                onClick={() => toggleItem(item.id)}
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer transition-colors group"
              >
                {checkedItems.has(item.id) ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                ) : (
                  <Circle className="h-5 w-5 text-gray-300 dark:text-gray-600 shrink-0 mt-0.5 group-hover:text-gray-400 dark:group-hover:text-gray-500" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${checkedItems.has(item.id) ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-white'}`}>
                    {item.label}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* All done message */}
          {allChecked && (
            <div className="rounded-xl bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 p-4 flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                  {isDa ? 'Alle punkter er udført!' : 'All items completed!'}
                </p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                  {isDa
                    ? 'Din data er klar til at blive importeret i det nye bogføringssystem. Husk at gemme eksport-GUID\'en i mindst 5 år.'
                    : 'Your data is ready to be imported into the new bookkeeping system. Remember to keep the export GUID for at least 5 years.'}
                </p>
              </div>
            </div>
          )}

          {/* Legal reference */}
          <div className="flex items-start gap-2 text-[10px] text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-white/[0.02] rounded-lg p-3">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <p>
              {isDa
                ? 'Jf. Bogføringslovens § 12, stk. 1, og Bekendtgørelse nr. 98 af 15. februar 2023 (BEK 98) skal alle bilag opbevares i mindst 5 år. Ved skift af udbyder skal data overføres sikkert med mulighed for verifikation. AlphaFlow\'s portable eksportformat inkluderer GUID og SHA-256 kontrolsum som dokumentation.'
                : 'Per the Danish Bookkeeping Act § 12(1) and Executive Order No. 98 of February 15, 2023 (BEK 98), all vouchers must be retained for at least 5 years. When switching providers, data must be transferred securely with verification capability. AlphaFlow\'s portable export format includes a GUID and SHA-256 checksum as documentation.'}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
