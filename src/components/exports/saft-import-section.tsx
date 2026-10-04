'use client';

/**
 * SaftImportSection
 *
 * Expandable section for importing company data from a SAF-T Financial DK
 * v2.1 XML file produced by a third-party accounting system. This is the
 * complementary flow to the "Eksporter alt" export — it lets a company
 * switch TO AlphaFlow from another bogføringssystem.
 *
 * Flow:
 *   1. User selects a SAF-T XML file.
 *   2. User clicks "Analyser fil (dry-run)" → POST /api/import-saft/dry-run
 *      Returns a summary: accounts, transactions, lines, unmapped VAT codes,
 *      conflicts — WITHOUT modifying any data.
 *   3. Dry-run results displayed for review.
 *   4. User clicks "Bekræft import" → AlertDialog warns that existing data
 *      will be wiped.
 *   5. User confirms → POST /api/import-saft → actual import.
 *   6. Import results displayed.
 *
 * Erhvervsstyrelsen compliance: Bilag 2, Row 44 (import standard file from
 * another system) + Row 45 (export standard file to another system).
 */

import { useState, useRef, useCallback } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { toast } from '@/lib/hermes-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Download,
  FileCheck2,
  Database,
  Users,
  Receipt,
  FolderTree,
  Info,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

interface DryRunResult {
  success: boolean;
  summary: {
    accounts: number;
    customers: number;
    suppliers: number;
    transactions: number;
    lines: number;
  };
  periodCovered: { start: string; end: string };
  sourceSoftware: string;
  existingAccountConflicts: string[];
  unmappedVatCodes: Array<{
    sourceCode: string;
    standardCode?: string;
    suggestedAlphaFlowCode: string | null;
  }>;
  warnings: string[];
}

interface ImportResult {
  success: boolean;
  accounts: number;
  customers: number;
  suppliers: number;
  journalEntries: number;
  journalEntryLines: number;
  unmappedVatCodes: string[];
  warnings: string[];
}

// ── Component ──────────────────────────────────────────────────────

export function SaftImportSection() {
  const { language } = useTranslation();
  const isDa = language === 'da';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type — accept .xml and .json (JSON is a future option)
      if (!file.name.toLowerCase().endsWith('.xml') && !file.name.toLowerCase().endsWith('.json')) {
        toast.error(isDa ? 'Ugyldig filtype' : 'Invalid file type', {
          description: isDa ? 'Vælg en SAF-T XML-fil (.xml)' : 'Select a SAF-T XML file (.xml)',
        });
        return;
      }
      setSelectedFile(file);
      setDryRunResult(null);
      setImportResult(null);
      setImportError(null);
    }
  }, [isDa]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.xml') && !file.name.toLowerCase().endsWith('.json')) {
        toast.error(isDa ? 'Ugyldig filtype' : 'Invalid file type');
        return;
      }
      setSelectedFile(file);
      setDryRunResult(null);
      setImportResult(null);
      setImportError(null);
    }
  }, [isDa]);

  const handleDryRun = useCallback(async () => {
    if (!selectedFile) return;
    setIsDryRunning(true);
    setDryRunResult(null);
    setImportError(null);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const res = await fetch('/api/import-saft/dry-run', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || (isDa ? 'Analyse fejlede' : 'Analysis failed'));
      }
      setDryRunResult(data as DryRunResult);
      toast.success(isDa ? 'Fil analyseret' : 'File analyzed', {
        description: isDa
          ? `${data.summary.accounts} konti, ${data.summary.transactions} posteringer fundet`
          : `${data.summary.accounts} accounts, ${data.summary.transactions} transactions found`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setImportError(msg);
      toast.error(isDa ? 'Analyse fejlede' : 'Analysis failed', { description: msg });
    } finally {
      setIsDryRunning(false);
    }
  }, [selectedFile, isDa]);

  const handleImport = useCallback(async () => {
    if (!selectedFile) return;
    setIsImporting(true);
    setImportError(null);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const res = await fetch('/api/import-saft', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || (isDa ? 'Import fejlede' : 'Import failed'));
      }
      setImportResult(data as ImportResult);
      toast.success(isDa ? 'Import fuldført!' : 'Import complete!', {
        description: isDa
          ? `${data.accounts} konti, ${data.journalEntries} posteringer importeret`
          : `${data.accounts} accounts, ${data.journalEntries} entries imported`,
        duration: 8000,
      });
      // Clear the selected file after successful import
      setSelectedFile(null);
      setDryRunResult(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setImportError(msg);
      toast.error(isDa ? 'Import fejlede' : 'Import failed', { description: msg });
    } finally {
      setIsImporting(false);
    }
  }, [selectedFile, isDa]);

  const canDryRun = !!selectedFile && !isDryRunning && !isImporting;
  const canImport = !!selectedFile && !isImporting && !isDryRunning;

  // ── Stat pill helper ──
  const StatPill = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number | string }) => (
    <div className="flex items-center gap-2 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 px-3 py-2">
      <Icon className="h-4 w-4 text-[#0d9488] dark:text-[#14b8a6] shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{label}</p>
        <p className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{value}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
          {/* Description */}
          <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 info-box-primary rounded-lg p-3">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#14b8a6] dark:text-[#99f6e4]" />
            <div className="space-y-1.5">
              <p>
                {isDa
                  ? 'Har du data i et andet bogføringssystem? Importér en SAF-T Financial DK v2.1 XML-fil, og AlphaFlow genskaber automatisk din kontoplan, adresser, kunder/leverandører og alle bogførte posteringer.'
                  : 'Have data in another bookkeeping system? Import a SAF-T Financial DK v2.1 XML file, and AlphaFlow will automatically recreate your chart of accounts, contacts, customers/suppliers, and all posted transactions.'}
              </p>
              <p className="font-medium text-gray-700 dark:text-gray-300">
                {isDa ? 'Sådan fungerer det:' : 'How it works:'}
              </p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>{isDa ? 'Eksportér en SAF-T XML-fil fra dit nuværende system' : 'Export a SAF-T XML file from your current system'}</li>
                <li>{isDa ? 'Vælg filen her og klik "Analyser fil" for en sikkerheds tjek' : 'Select the file here and click "Analyze file" for a safety check'}</li>
                <li>{isDa ? 'Gennemgå resultatet og bekræft import' : 'Review the result and confirm import'}</li>
              </ol>
            </div>
          </div>

          {/* File upload zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer ${
              selectedFile
                ? 'border-[#0d9488]/50 dark:border-[#14b8a6]/40 bg-[#f0fdfa] dark:bg-[#0d9488]/5'
                : 'border-gray-300 dark:border-white/15 hover:border-[#0d9488] dark:hover:border-[#14b8a6] hover:bg-gray-50 dark:hover:bg-white/5'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml,.json,application/xml,text/xml"
              onChange={handleFileSelect}
              className="hidden"
            />
            {selectedFile ? (
              <div className="flex flex-col items-center gap-2">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#0d9488] to-[#14b8a6] flex items-center justify-center">
                  <FileCheck2 className="h-6 w-6 text-white" />
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedFile.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 mt-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                    setDryRunResult(null);
                    setImportResult(null);
                    setImportError(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >
                  {isDa ? 'Vælg en anden fil' : 'Choose a different file'}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="h-12 w-12 rounded-xl bg-gray-100 dark:bg-white/10 flex items-center justify-center">
                  <Upload className="h-6 w-6 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {isDa ? 'Klik for at vælge fil eller træk-og-slip her' : 'Click to select file or drag & drop here'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">SAF-T XML (.xml) — max 100 MB</p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          {selectedFile && (
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleDryRun}
                disabled={!canDryRun}
                variant="outline"
                className="flex-1 gap-2 font-medium border-gray-200 dark:border-white/10"
              >
                {isDryRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                {isDryRunning
                  ? (isDa ? 'Analyserer...' : 'Analyzing...')
                  : (isDa ? 'Analyser fil (sikkerhedstjek)' : 'Analyze file (safety check)')
                }
              </Button>

              {/* Import button — wrapped in AlertDialog for confirmation */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    disabled={!canImport}
                    className="flex-1 gap-2 font-medium bg-[#0d9488] hover:bg-[#0f766e] text-white"
                  >
                    {isImporting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {isImporting
                      ? (isDa ? 'Importerer...' : 'Importing...')
                      : (isDa ? 'Bekræft import' : 'Confirm import')
                    }
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="max-w-md">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-base">
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                      {isDa ? 'ADVARSEL: Eksisterende data vil blive erstattet' : 'WARNING: Existing data will be replaced'}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-sm space-y-2">
                      <p>
                        {isDa
                          ? 'Importen vil SLETTE alle eksisterende data for denne virksomhed og erstatte dem med data fra SAF-T filen:'
                          : 'The import will DELETE all existing data for this company and replace it with data from the SAF-T file:'}
                      </p>
                      <ul className="list-disc list-inside space-y-0.5 text-xs">
                        <li>{isDa ? 'Konti, adresser, kunder, leverandører' : 'Accounts, contacts, customers, suppliers'}</li>
                        <li>{isDa ? 'Alle bogførte posteringer og journalposter' : 'All posted transactions and journal entries'}</li>
                        <li>{isDa ? 'Fakturaer, bilag, bankposteringer' : 'Invoices, documents, bank statements'}</li>
                        <li>{isDa ? 'Budgetter og regnskabsperioder' : 'Budgets and fiscal periods'}</li>
                      </ul>
                      <p className="font-medium text-amber-700 dark:text-amber-400 pt-1">
                        {isDa
                          ? 'Handlingen kan IKKE fortrydes. Tag en backup først hvis du er i tvivl.'
                          : 'This action CANNOT be undone. Take a backup first if unsure.'}
                      </p>
                      {!dryRunResult && (
                        <p className="text-xs text-blue-700 dark:text-blue-400 pt-1">
                          {isDa
                            ? 'Tip: Kør "Analyser fil" først for at se hvad der vil blive importeret.'
                            : 'Tip: Run "Analyze file" first to see what will be imported.'}
                        </p>
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isImporting}>
                      {isDa ? 'Annullér' : 'Cancel'}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => {
                        e.preventDefault();
                        void handleImport();
                      }}
                      disabled={isImporting}
                      className="bg-red-600 hover:bg-red-700 text-white gap-2"
                    >
                      {isImporting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {isDa ? 'Importerer…' : 'Importing…'}
                        </>
                      ) : (
                        isDa ? 'Ja, slet og importer' : 'Yes, delete and import'
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {/* Error display */}
          {importError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 p-3 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{isDa ? 'Fejl' : 'Error'}</p>
                <p className="mt-0.5">{importError}</p>
              </div>
            </div>
          )}

          {/* Dry-run results */}
          {dryRunResult && !importResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                {isDa ? 'Analyse resultat' : 'Analysis result'}
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <StatPill icon={Database} label={isDa ? 'Konti' : 'Accounts'} value={dryRunResult.summary.accounts} />
                <StatPill icon={Users} label={isDa ? 'Kunder' : 'Customers'} value={dryRunResult.summary.customers} />
                <StatPill icon={Users} label={isDa ? 'Leverandører' : 'Suppliers'} value={dryRunResult.summary.suppliers} />
                <StatPill icon={Receipt} label={isDa ? 'Posteringer' : 'Transactions'} value={dryRunResult.summary.transactions} />
                <StatPill icon={FolderTree} label={isDa ? 'Posteringlinjer' : 'Entry lines'} value={dryRunResult.summary.lines} />
                {dryRunResult.periodCovered.start && (
                  <StatPill
                    icon={FileText}
                    label={isDa ? 'Periode' : 'Period'}
                    value={`${dryRunResult.periodCovered.start?.slice(0, 7)} – ${dryRunResult.periodCovered.end?.slice(0, 7)}`}
                  />
                )}
              </div>

              {/* Source software info */}
              {dryRunResult.sourceSoftware && dryRunResult.sourceSoftware !== 'Unknown' && (
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {isDa ? 'Kildesystem:' : 'Source system:'}{' '}
                    <span className="font-medium text-gray-700 dark:text-gray-300">{dryRunResult.sourceSoftware}</span>
                  </span>
                </div>
              )}

              {/* Unmapped VAT codes */}
              {dryRunResult.unmappedVatCodes.length > 0 && (
                <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/40 p-3 text-xs">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-yellow-600 dark:text-yellow-400" />
                    <div className="flex-1">
                      <p className="font-medium text-yellow-800 dark:text-yellow-300">
                        {isDa
                          ? `${dryRunResult.unmappedVatCodes.length} momskode(r) kunne ikke matches:`
                          : `${dryRunResult.unmappedVatCodes.length} VAT code(s) could not be mapped:`}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {dryRunResult.unmappedVatCodes.map((vc) => (
                          <Badge key={vc.sourceCode} variant="outline" className="text-[10px] font-mono border-yellow-300 dark:border-yellow-700/50 text-yellow-700 dark:text-yellow-400">
                            {vc.sourceCode}
                            {vc.suggestedAlphaFlowCode && (
                              <span className="ml-1 text-green-600 dark:text-green-400">→ {vc.suggestedAlphaFlowCode}</span>
                            )}
                          </Badge>
                        ))}
                      </div>
                      <p className="mt-1.5 text-yellow-700 dark:text-yellow-400">
                        {isDa
                          ? 'Disse posteringer importeres uden momskode og skal rettes manuelt efter import.'
                          : 'These transactions will be imported without a VAT code and must be fixed manually after import.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Conflicts (existing accounts that will be replaced) */}
              {dryRunResult.existingAccountConflicts.length > 0 && (
                <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 p-3 text-xs text-blue-700 dark:text-blue-400">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">
                        {isDa
                          ? `${dryRunResult.existingAccountConflicts.length} konto(r) findes allerede og vil blive erstattet:`
                          : `${dryRunResult.existingAccountConflicts.length} account(s) already exist and will be replaced:`}
                      </p>
                      <p className="mt-0.5">
                        {isDa
                          ? 'Eksisterende data slettes fuldstændigt før import, så konflikter er ikke et problem — de nye data overskriver de gamle.'
                          : 'Existing data is fully wiped before import, so conflicts are not an issue — new data overwrites old data.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* No issues — clean import */}
              {dryRunResult.unmappedVatCodes.length === 0 && dryRunResult.warnings.length === 0 && (
                <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 p-3 text-xs text-green-700 dark:text-green-400 flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    {isDa
                      ? 'Filen er klar til import — ingen problemer fundet. Klik "Bekræft import" ovenfor for at gennemføre.'
                      : 'File is ready for import — no issues found. Click "Confirm import" above to proceed.'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Import results */}
          {importResult && (
            <div className="space-y-3">
              <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                    {isDa ? 'Import fuldført!' : 'Import complete!'}
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <StatPill icon={Database} label={isDa ? 'Konti' : 'Accounts'} value={importResult.accounts} />
                  <StatPill icon={Users} label={isDa ? 'Kunder' : 'Customers'} value={importResult.customers} />
                  <StatPill icon={Users} label={isDa ? 'Leverandører' : 'Suppliers'} value={importResult.suppliers} />
                  <StatPill icon={Receipt} label={isDa ? 'Journalposter' : 'Journal entries'} value={importResult.journalEntries} />
                  <StatPill icon={FolderTree} label={isDa ? 'Posteringlinjer' : 'Entry lines'} value={importResult.journalEntryLines} />
                </div>
                {importResult.warnings.length > 0 && (
                  <p className="text-xs text-green-700 dark:text-green-400 mt-3">
                    {isDa
                      ? `${importResult.warnings.length} advarsel(er) under import — se log for detaljer.`
                      : `${importResult.warnings.length} warning(s) during import — see log for details.`}
                  </p>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                {isDa
                  ? 'Genindlæs siden for at se de importerede data i kontoplanen og posteringer.'
                  : 'Reload the page to see the imported data in the chart of accounts and transactions.'}
              </p>
            </div>
          )}
        </div>
  );
}
