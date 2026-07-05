'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ResponsiveSwitch } from '@/components/ui/responsive-switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  X,
  Info,
  BookOpen,
  Camera,
  Upload,
  Download,
  AlertTriangle,
  ArrowRightLeft,
  Loader2,
  Receipt,
  Plus,
  Package,
  Trash2,
  ScanSearch,
  CalendarDays,
  Repeat,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/lib/use-translation';
import { toast } from 'sonner';
import { useAccessErrorHandler } from '@/hooks/use-access-error-handler';
import { useScannerStore } from '@/lib/scanner-store';
import { useOcr, type OCRResult } from '@/lib/ocr';
import { useAuthStore } from '@/lib/auth-store';
import { ProjectSelector } from '@/components/projects/project-selector';
import { useDraftSync } from '@/hooks/use-draft-sync';
import { useWarnOnUnsaved } from '@/hooks/use-warn-unsaved';
import { ClearFormButton } from '@/components/ui/clear-form-button';
import { VATCodeSelect } from '@/components/shared/vat-code-select';
import { VAT_RATE_MAP } from '@/lib/vat-codes';

const CURRENCIES = ['DKK', 'EUR', 'USD', 'GBP', 'SEK', 'NOK'] as const;

interface ExpenseAccount {
  id: string;
  number: string;
  name: string;
  nameEn: string | null;
}

interface RecentDescription {
  description: string;
  type: string;
}

interface PurchaseLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  vatPercent: number;  // derived from vatCode (for display/calc only)
  vatCode: string;     // canonical VAT code, e.g. 'K25' — the source of truth (Solution B)
  accountId: string;
}

interface AddTransactionFormProps {
  onSuccess: () => void;
  /** When set, a receipt file from the standalone scanner (FAB) should be
   *  preloaded into the form automatically. */
  preloadedReceiptFile?: File | null;
  /** Called after the preloaded file has been consumed (set in the form). */
  onPreloadedFileConsumed?: () => void;
  /** Layout mode: 'compact' for dialogs, 'cards' for full-page desktop view */
  layout?: 'compact' | 'cards';
}

// Account category groupings for the Danish chart of accounts
const ACCOUNT_GROUPS: Array<{ labelDa: string; labelEn: string; range: [number, number] }> = [
  { labelDa: 'Vareforbrug', labelEn: 'Cost of Goods', range: [6000, 6999] },
  { labelDa: 'Personaleomkostninger', labelEn: 'Personnel', range: [7000, 7999] },
  { labelDa: 'Driftsomkostninger', labelEn: 'Operating Expenses', range: [8000, 8999] },
  { labelDa: 'Finansielle omkostninger', labelEn: 'Financial', range: [9000, 9400] },
  { labelDa: 'Skat', labelEn: 'Tax', range: [9500, 9500] },
];

// Format number with Danish locale for display
function formatDanishNumber(num: number): string {
  return num.toLocaleString('da-DK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function defaultToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const FREQUENCY_LABELS: Record<string, { da: string; en: string }> = {
  DAILY: { da: 'Daglig', en: 'Daily' },
  WEEKLY: { da: 'Ugentlig', en: 'Weekly' },
  MONTHLY: { da: 'Månedlig', en: 'Monthly' },
  QUARTERLY: { da: 'Kvartalsvis', en: 'Quarterly' },
  YEARLY: { da: 'Årlig', en: 'Yearly' },
};
const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'];

const EMPTY_LINE_ITEM: PurchaseLineItem = {
  description: '',
  quantity: 1,
  unitPrice: 0,
  vatPercent: 25,
  vatCode: 'K25',
  accountId: '',
};

export function AddTransactionForm({ onSuccess, preloadedReceiptFile, onPreloadedFileConsumed, layout = 'compact' }: AddTransactionFormProps) {
  const { t, tc, language } = useTranslation();
  const isDa = language === 'da';
  const { handleMutationError } = useAccessErrorHandler();
  const activeCompanyId = useAuthStore((s) => s.user?.activeCompanyId);
  // ── Project Mode (FASE 4) ──
  // activeProjectId + isProjectMode are read here so the project-mode
  // useEffect (declared after `projectId` state below) can force the form's
  // projectId to match the active project. Defence-in-depth alongside the
  // locked ProjectSelector — even if a draft or preload tried to set a
  // different project, project mode wins.
  const activeProjectId = useAuthStore((s) => s.user?.activeProjectId);
  const isProjectMode = useAuthStore((s) => !!s.user?.isProjectMode);

  // ─── State ───
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [accountError, setAccountError] = useState('');

  const [date, setDate] = useState(defaultToday());
  const [purchaseLinesDate, setPurchaseLinesDate] = useState(defaultToday());
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('DKK');
  const [exchangeRate, setExchangeRate] = useState('');
  const [includesVAT, setIncludesVAT] = useState(true);
  const [description, setDescription] = useState('');

  const [vatPercent, setVatPercent] = useState('25');
  const [vatCode, setVatCode] = useState('K25');

  // ─── Recurring purchase state ───
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState('MONTHLY');
  const [recurringStartDate, setRecurringStartDate] = useState('');
  const [recurringEndDate, setRecurringEndDate] = useState('');

  // ─── OCR (unified hook — manages loading, progress, result, error) ───
  const { processFile: processOCR, result: ocrResult, loading: ocrLoading, progress: ocrProgress, error: ocrError, reset: resetOCR } = useOcr();

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptNaturalWidth, setReceiptNaturalWidth] = useState<number | null>(null);
  const [originalWasPdf, setOriginalWasPdf] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [projectId, setProjectId] = useState<string | null>(null);
  // ── Project Mode (FASE 4) ──
  // Force the form's projectId to the active project when in project mode.
  // Declared here (after `projectId` state) because the effect references it.
  useEffect(() => {
    if (isProjectMode && activeProjectId && projectId !== activeProjectId) {
      setProjectId(activeProjectId);
    }
  }, [isProjectMode, activeProjectId, projectId]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const preloadedConsumedRef = useRef(false);
  const descriptionInputRef = useRef<HTMLTextAreaElement>(null);
  const receiptPreviewUrlRef = useRef<string | null>(null);
  const dateManuallySetRef = useRef(false);
  const purchaseLinesDateManuallySetRef = useRef(false);

  // ─── Exchange rate auto-fetch ───
  const [rateLoading, setRateLoading] = useState(false);
  const [rateDate, setRateDate] = useState<string | null>(null);
  const exchangeRateManualRef = useRef(false);

  // ─── Auto-fetch exchange rate from API ───
  const fetchExchangeRate = useCallback(async (fromCurrency: string) => {
    setRateLoading(true);
    exchangeRateManualRef.current = false;
    try {
      const res = await fetch(`/api/exchange-rate?from=${fromCurrency}&to=DKK`);
      if (res.ok) {
        const data = await res.json();
        if (data.rate != null) {
          setExchangeRate(String(data.rate));
          setRateDate(data.date ?? null);
        } else {
          setExchangeRate('');
          setRateDate(null);
        }
      }
    } catch {
      setExchangeRate('');
      setRateDate(null);
    } finally {
      setRateLoading(false);
    }
  }, []);

  // ─── Purchase line items (for OCR + manual entry) ───
  const [purchaseLines, setPurchaseLines] = useState<PurchaseLineItem[]>([
    { ...EMPTY_LINE_ITEM },
  ]);

  // ─── Draft persistence (input retention) ───
  // Persists user input to localStorage so accidental close / nav doesn't lose data.
  // Excludes: receiptFile (File), receiptPreview (blob URL), receiptNaturalWidth,
  // originalWasPdf, isLoading, error, accountError, rateLoading, rateDate, OCR state.
  const { clearDraft } = useDraftSync(
    'transaction:new',
    {
      date,
      purchaseLinesDate,
      amount,
      currency,
      exchangeRate,
      includesVAT,
      description,
      vatPercent,
      isRecurring,
      recurringFrequency,
      recurringStartDate,
      recurringEndDate,
      selectedAccountId,
      projectId,
      purchaseLineItems: purchaseLines,
    },
    {
      label: 'New transaction',
      onRestore: (draft) => {
        if (typeof draft.date === 'string' && draft.date) setDate(draft.date);
        if (typeof draft.purchaseLinesDate === 'string' && draft.purchaseLinesDate) setPurchaseLinesDate(draft.purchaseLinesDate);
        if (typeof draft.amount === 'string') setAmount(draft.amount);
        if (typeof draft.currency === 'string' && draft.currency) setCurrency(draft.currency);
        if (typeof draft.exchangeRate === 'string') setExchangeRate(draft.exchangeRate);
        if (typeof draft.includesVAT === 'boolean') setIncludesVAT(draft.includesVAT);
        if (typeof draft.description === 'string') setDescription(draft.description);
        if (typeof draft.vatPercent === 'string') setVatPercent(draft.vatPercent);
        if (typeof draft.isRecurring === 'boolean') setIsRecurring(draft.isRecurring);
        if (typeof draft.recurringFrequency === 'string' && draft.recurringFrequency) setRecurringFrequency(draft.recurringFrequency);
        if (typeof draft.recurringStartDate === 'string') setRecurringStartDate(draft.recurringStartDate);
        if (typeof draft.recurringEndDate === 'string') setRecurringEndDate(draft.recurringEndDate);
        if (typeof draft.selectedAccountId === 'string') setSelectedAccountId(draft.selectedAccountId);
        if (draft.projectId === null || typeof draft.projectId === 'string') {
          // In project mode, ignore any draft project — always use the active project.
          // `activeProjectId` is `string | null | undefined` from the store; coerce
          // undefined → null so it matches setProjectId's `string | null` signature.
          setProjectId(isProjectMode ? (activeProjectId ?? null) : (draft.projectId as string | null));
        }
        if (Array.isArray(draft.purchaseLineItems) && draft.purchaseLineItems.length > 0) {
          setPurchaseLines(
            draft.purchaseLineItems
              .filter((l): l is PurchaseLineItem =>
                l != null && typeof l === 'object' && typeof (l as PurchaseLineItem).description === 'string'
              )
              .map((l) => ({
                description: l.description ?? '',
                quantity: typeof l.quantity === 'number' ? l.quantity : 1,
                unitPrice: typeof l.unitPrice === 'number' ? l.unitPrice : 0,
                vatPercent: typeof l.vatPercent === 'number' ? l.vatPercent : 25,
                vatCode: typeof l.vatCode === 'string' ? l.vatCode : 'K25',  // backward compat: old drafts lack vatCode
                accountId: typeof l.accountId === 'string' ? l.accountId : '',
              }))
          );
        }
      },
    }
  );

  // ─── Safety net: warn on unsaved changes ───
  // This form lives in BOTH a Dialog (mobile) and a page (desktop). The Dialog is
  // wrapped by a parent, so we can't spread dialogProps here — instead we rely on
  // the beforeunload listener (window: true) to protect against tab/nav loss for
  // the page version, and on the draft restore for the dialog version.
  const isTransactionDirty =
    amount !== '' ||
    description.trim() !== '' ||
    selectedAccountId !== '' ||
    projectId !== null ||
    isRecurring ||
    currency !== 'DKK' ||
    exchangeRate !== '' ||
    purchaseLines.some((l) => l.description.trim() !== '' || l.unitPrice !== 0 || l.accountId !== '');
  useWarnOnUnsaved(isTransactionDirty, {
    onConfirmDiscard: () => {
      clearDraft();
    },
    window: true,
  });

  // ─── Data ───
  const [expenseAccounts, setExpenseAccounts] = useState<ExpenseAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [recentDescriptions, setRecentDescriptions] = useState<RecentDescription[]>([]);
  const [descriptionsLoading, setDescriptionsLoading] = useState(false);
  const [showDescriptionSuggestions, setShowDescriptionSuggestions] = useState(false);

  // ─── Standalone scanner integration (zustand store) ───
  // The scanner result flows through the zustand store to PosteringerPage,
  // which consumes it and passes the file via the `preloadedReceiptFile` prop.
  // We do NOT subscribe to pendingResult here — PosteringerPage's subscribe()
  // callback always consumes first (synchronous), so any subscription here
  // would be a dead path that either gets null or causes double-consumption bugs.
  //
  // The ONLY way the form receives scanned files is via preloadedReceiptFile.
  //
  // FALLBACK: On mount, check if there's an unconsumed result in the store
  // (e.g., PosteringerPage wasn't mounted yet when the scan completed).
  // This handles the edge case where the form mounts AFTER the scan result
  // was stored but before PosteringerPage's subscriber could consume it.
  useEffect(() => {
    const existing = useScannerStore.getState().pendingResult;
    if (existing && !preloadedReceiptFile && !receiptPreview) {
      console.warn('[AddTransactionForm] Found unconsumed scanner result on mount — applying directly');
      const claimed = useScannerStore.getState().consumeResult();
      if (claimed) {
        if (receiptPreviewUrlRef.current) {
          URL.revokeObjectURL(receiptPreviewUrlRef.current);
        }
        const previewUrl = URL.createObjectURL(claimed.file);
        receiptPreviewUrlRef.current = previewUrl;
        setReceiptFile(claimed.file);
        setReceiptPreview(previewUrl);
        setOriginalWasPdf(false);
      }
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch expense accounts (6000-9500) on mount
  useEffect(() => {
    async function fetchAccounts() {
      setAccountsLoading(true);
      try {
        const expRes = await fetch('/api/accounts?type=EXPENSE');
        if (expRes.ok) {
          const data = await expRes.json();
          const filtered = (data.accounts || []).filter(
            (acc: ExpenseAccount) => {
              const num = parseInt(acc.number, 10);
              return num >= 6000 && num <= 9500;
            }
          );
          setExpenseAccounts(filtered);
        }
      } catch { /* silent */ } finally {
        setAccountsLoading(false);
      }
    }
    fetchAccounts();
  }, []);

  // Fetch recent descriptions on mount
  useEffect(() => {
    async function fetchDescriptions() {
      setDescriptionsLoading(true);
      try {
        const res = await fetch('/api/transactions/recent-descriptions');
        if (res.ok) {
          const data = await res.json();
          setRecentDescriptions(data.descriptions || []);
        }
      } catch { /* silent */ } finally {
        setDescriptionsLoading(false);
      }
    }
    fetchDescriptions();
  }, []);

  // ─── Calculations ───
  const parsedAmount = parseFloat(amount || '0');
  const parsedVatPercent = parseFloat(vatPercent || '0');
  const netAmount = includesVAT ? parsedAmount / (1 + parsedVatPercent / 100) : parsedAmount;
  const vatAmount = netAmount * parsedVatPercent / 100;
  const totalAmount = netAmount + vatAmount;

  // Line items totals
  const lineTotals = useMemo(() => {
    const subtotal = purchaseLines.reduce(
      (sum, item) => sum + (item.quantity * item.unitPrice), 0
    );
    const vatTotal = purchaseLines.reduce(
      (sum, item) => sum + ((item.quantity * item.unitPrice * item.vatPercent) / 100), 0
    );
    return { subtotal, vatTotal, total: subtotal + vatTotal };
  }, [purchaseLines]);

  // Group accounts by category for the dropdown
  const groupedAccounts = useMemo(() => {
    const groups: Array<{ labelDa: string; labelEn: string; accounts: ExpenseAccount[] }> = [];
    for (const group of ACCOUNT_GROUPS) {
      const accounts = expenseAccounts.filter((acc) => {
        const num = parseInt(acc.number, 10);
        return num >= group.range[0] && num <= group.range[1];
      });
      if (accounts.length > 0) {
        groups.push({ labelDa: group.labelDa, labelEn: group.labelEn, accounts });
      }
    }
    return groups;
  }, [expenseAccounts]);

  const selectedAccount = expenseAccounts.find((a) => a.id === selectedAccountId);

  // ─── Card data detection (for conditional account validation) ───
  const receiptCardHasData = !!(amount && parseFloat(amount) > 0) || !!(description && description.trim() !== '');
  // A line is considered to "have data" if it has a description OR a non-zero
  // unitPrice (including negative — e.g. a discount line with unitPrice = -100).
  const purchaseLinesHasData = purchaseLines.some(line => !!(line.description?.trim()) || line.unitPrice !== 0);

  // ─── Line item callbacks ───
  const addPurchaseLineItem = useCallback(() => {
    setPurchaseLines(prev => [...prev, { ...EMPTY_LINE_ITEM }]);
  }, []);

  const removePurchaseLineItem = useCallback((index: number) => {
    setPurchaseLines(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updatePurchaseLineItem = useCallback((index: number, field: keyof PurchaseLineItem, value: string | number) => {
    setPurchaseLines(prev =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
  }, []);

  // ─── Receipt handling ───
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError(isDa ? 'Filstørrelsen skal være under 10MB' : 'File size must be less than 10MB');
      return;
    }
    setError('');
    // Clear any previous OCR line items when new document is uploaded
    setPurchaseLines([{ ...EMPTY_LINE_ITEM }]);
    setReceiptNaturalWidth(null); // reset natural width for new file

    if (receiptPreviewUrlRef.current) {
      URL.revokeObjectURL(receiptPreviewUrlRef.current);
      receiptPreviewUrlRef.current = null;
    }

    if (file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')) {
      // ── PDF: Convert first page to PNG via server-side pdf2pic (Ghostscript) ──
      try {
        setReceiptPreview('loading');

        // Send PDF to server for high-quality Ghostscript-based conversion
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/pdf-to-png', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({ error: 'Conversion failed' }));
          throw new Error(errBody.error || `Server error ${response.status}`);
        }

        // Receive the PNG blob from the server
        const pngBlob = await response.blob();

        if (pngBlob.size === 0 || !pngBlob.type.startsWith('image/')) {
          throw new Error('Server returned an invalid image');
        }

        const pngFile = new File(
          [pngBlob],
          file.name.replace(/\.pdf$/i, '.png'),
          { type: 'image/png' },
        );

        // Create preview URL
        const previewUrl = URL.createObjectURL(pngBlob);
        if (receiptPreviewUrlRef.current) {
          URL.revokeObjectURL(receiptPreviewUrlRef.current);
        }
        receiptPreviewUrlRef.current = previewUrl;

        setReceiptFile(pngFile);
        setReceiptPreview(previewUrl);
        setOriginalWasPdf(true);

        console.log(
          `[PDF→PNG] Server-converted first page: ${(pngBlob.size / 1024).toFixed(0)}KB`,
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error('[PDF→PNG] Conversion failed:', errMsg);
        setReceiptFile(null);
        setReceiptPreview(null);
        setOriginalWasPdf(false);

        // Detect missing system dependencies (gm/gs not found, spawn errors, etc.)
        const errLower = errMsg.toLowerCase();
        const isDepError =
          errLower.includes('graphicsmagick') ||
          errLower.includes('ghostscript') ||
          errLower.includes('gm:') ||
          errLower.includes('gs:') ||
          errLower.includes('gm command') ||
          errLower.includes('spawn') ||
          errLower.includes('enotfound') ||
          errLower.includes('ENOENT') ||
          errLower.includes('no such file');

        toast.error(
          isDa ? 'Kunne ikke konvertere PDF' : 'Could not convert PDF',
          {
            description: isDepError
              ? isDa
                ? 'Server mangler GraphicsMagick/Ghostscript. Kør: sudo apt-get install -y graphicsmagick ghostscript'
                : 'Server missing GraphicsMagick/Ghostscript. Run: sudo apt-get install -y graphicsmagick ghostscript'
              : `${isDa ? 'Fejl:' : 'Error:'} ${errMsg}`,
            duration: 10000,
          },
        );
      }
    } else {
      // ── Images: use object URL directly ──
      setOriginalWasPdf(false);
      setReceiptFile(file);
      const previewUrl = URL.createObjectURL(file);
      receiptPreviewUrlRef.current = previewUrl;
      setReceiptPreview(previewUrl);
    }
  }, [isDa]);

  const clearReceipt = useCallback(() => {
    setReceiptFile(null);
    if (receiptPreviewUrlRef.current) {
      URL.revokeObjectURL(receiptPreviewUrlRef.current);
      receiptPreviewUrlRef.current = null;
    }
    setReceiptPreview(null);
    setReceiptNaturalWidth(null);
    setOriginalWasPdf(false);
    resetOCR();
    setPurchaseLines([{ ...EMPTY_LINE_ITEM }]);
    setPurchaseLinesDate(defaultToday());
    purchaseLinesDateManuallySetRef.current = false;
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [resetOCR]);

  // ─── Manual OCR trigger ───
  const handleManualOCR = useCallback(async () => {
    if (!receiptFile) return;

    // Strategy:
    //   - PDF-converted images → VLM first (AI vision understands structured invoices)
    //     VLM fails gracefully with empty result, no throw
    //   - Direct image uploads (camera/photo) → Tesseract first (fast, offline)
    //     Falls back to VLM if Tesseract returns nothing useful
    let result: Awaited<ReturnType<typeof processOCR>> | null;

    if (originalWasPdf) {
      // PDF invoices are typically structured documents (tables, line items, VAT).
      // VLM (Claude) handles these far better than Tesseract's raw text + regex.
      result = await processOCR(receiptFile, {
        source: 'upload',
        processor: 'vlm',
      });
      // If VLM failed, fall back to Tesseract as last resort
      if (!result || (result.confidence === 0 && !result.amount && !result.date)) {
        console.log('[OCR] VLM returned empty result, trying Tesseract fallback…');
        const tesseractResult = await processOCR(receiptFile, {
          source: 'upload',
          processor: 'tesseract',
        });
        if (tesseractResult && tesseractResult.confidence > (result?.confidence ?? 0)) {
          result = tesseractResult;
        }
      }
    } else {
      // Camera / direct image uploads → Tesseract first (fast, client-side)
      result = await processOCR(receiptFile, {
        source: 'upload',
        processor: 'auto',
      });
      // Fallback to VLM if Tesseract returned nothing useful
      if (result && result.confidence < 30 && !result.amount && !result.date) {
        console.log('[OCR] Tesseract returned low-confidence result, trying VLM fallback…');
        const vlmResult = await processOCR(receiptFile, {
          source: 'upload',
          processor: 'vlm',
        });
        if (vlmResult && vlmResult.confidence > result.confidence) {
          result = vlmResult;
        }
      }
    }

    if (!result || (result.confidence === 0 && !result.amount && !result.date)) {
      toast.error(
        isDa ? 'Kunne ikke læse dokumentet' : 'Could not read document',
        {
          description: ocrError
            ? ocrError
            : isDa
              ? 'Tjek at filen er et gyldigt bilag og prøv igen, eller tilføj data manuelt'
              : 'Make sure the file is a valid receipt/invoice and try again, or add data manually',
          duration: 6000,
        },
      );
      return;
    }

    // ── Apply OCR results ──
    // In CARDS layout (desktop): OCR data → purchase lines (visible in the
    //   "Købslinjer" card, where the user can assign accounts per line).
    // In COMPACT layout (mobile dialog): purchase lines are NOT rendered, so
    //   sending OCR data there creates invisible lines with empty accounts
    //   that block submission ("Alle købslinjer med data skal have en konto").
    //   Instead, route OCR data to the visible amount/description/VAT fields
    //   (the "receipt card" fields) so the user can see and edit them.

    // Date → date field (compact: the main date field; cards: purchase-lines date)
    if (result.date) {
      if (layout === 'cards' && !purchaseLinesDateManuallySetRef.current) {
        setPurchaseLinesDate(result.date);
      } else if (layout !== 'cards' && !dateManuallySetRef.current) {
        setDate(result.date);
      }
    }

    if (layout === 'cards') {
      // Desktop: populate purchase lines as before
      let newLines: PurchaseLineItem[] = [];

      if (result.lineItems.length > 0) {
        newLines = result.lineItems.map((line) => ({
          description: line.description || '',
          quantity: line.quantity || 1,
          unitPrice: line.unitPrice || 0,
          // Use ?? (nullish coalescing) not || — vatPercent 0 is a VALID value
          // (VAT-free items like paintings/insurance). `0 || 25` would wrongly
          // give 25%, causing a mismatch between the VAT dropdown (K0) and the
          // calculated VAT total (25%).
          vatPercent: line.vatPercent ?? 25,
          vatCode: (line.vatPercent ?? 25) === 12 ? 'K12' : (line.vatPercent ?? 25) === 0 ? 'K0' : 'K25',
          accountId: '',
        }));
      }

      if (newLines.length === 0 && result.amount !== null) {
        const ocrVatPct = result.vatPercent ?? 25;
        newLines.push({
          description: result.description || (isDa ? 'Køb' : 'Purchase'),
          quantity: 1,
          unitPrice: result.amount,
          vatPercent: ocrVatPct,
          // Derive the VAT code from the OCR'd vatPercent (Solution B requires vatCode).
          vatCode: ocrVatPct === 12 ? 'K12' : ocrVatPct === 0 ? 'K0' : 'K25',
          accountId: '',
        });
      }

      if (newLines.length > 0) {
        setPurchaseLines(newLines);
      }
    } else {
      // Mobile/compact: route OCR data to the visible amount/description/VAT
      // fields instead of invisible purchase lines. This prevents the
      // "Alle købslinjer med data skal have en konto valgt" error when the
      // user can't see or edit the purchase lines.
      if (result.amount !== null && !amount) {
        // Set the gross amount (includes VAT) since most receipts show the
        // total incl. VAT. The user can toggle "inkl. moms" if needed.
        const gross = result.lineItems && result.lineItems.length > 0
          ? result.lineItems.reduce((s, l) => s + (l.unitPrice || 0) * (l.quantity || 1) * (1 + (l.vatPercent || 0) / 100), 0)
          : result.amount;
        setAmount(String(Math.round(gross * 100) / 100));
        // Default to "includes VAT = true" since receipt totals are gross
        if (!includesVAT) setIncludesVAT(true);
      }
      if (result.description && !description) {
        setDescription(result.description);
      } else if (!description && result.lineItems && result.lineItems.length > 0) {
        // Use the first line item's description as a fallback
        const firstDesc = result.lineItems.find(l => l.description?.trim())?.description;
        if (firstDesc) setDescription(firstDesc);
      }
      if (result.vatPercent !== null && result.vatPercent !== undefined) {
        setVatPercent(String(result.vatPercent));
      }
      // Clear any stale purchase lines so they don't block submission
      setPurchaseLines([{ ...EMPTY_LINE_ITEM }]);
    }

    // Show result toast
    const lineCount = layout === 'cards'
      ? (result.lineItems?.length || (result.amount !== null ? 1 : 0))
      : 0;
    if (result.confidence > 0 && (result.amount || result.date || lineCount > 0)) {
      toast.success(isDa ? 'Dokument læst' : 'Document scanned', {
        description: isDa
          ? layout === 'cards'
            ? `Fundet ${lineCount} købslinje${lineCount !== 1 ? 'r' : ''}${result.amount ? `, beløb: ${result.amount} kr` : ''}${result.date ? `, dato: ${result.date}` : ''}`
            : `Beløb: ${result.amount ?? '—'} kr${result.date ? `, dato: ${result.date}` : ''}`
          : layout === 'cards'
            ? `Found ${lineCount} line item${lineCount !== 1 ? 's' : ''}${result.amount ? `, amount: ${result.amount} DKK` : ''}${result.date ? `, date: ${result.date}` : ''}`
            : `Amount: ${result.amount ?? '—'} DKK${result.date ? `, date: ${result.date}` : ''}`,
        duration: 4000,
      });
    } else {
      toast.warning(isDa ? 'Kunne ikke læse dokumentet' : 'Could not read document', {
        description: isDa
          ? 'Tilføj købslinjer manuelt'
          : 'Add purchase lines manually',
        duration: 3000,
      });
    }
  }, [receiptFile, originalWasPdf, isDa, processOCR, ocrError]);

  // ── Helper: attach a scanned/uploaded receipt file to the form ──────────
  // Shared by both the preloadedReceiptFile prop (FAB → PosteringerPage flow)
  // and the in-form scanner claim ("Scan kvittering" button inside the dialog).
  // Creates a blob-URL preview, sets receiptFile/receiptPreview state, marks
  // the file as an image (scanner captures are never PDFs), and scrolls the
  // preview into view so the user immediately sees the captured receipt.
  const applyReceiptFile = useCallback((file: File, source: string) => {
    // Revoke any previous preview URL to avoid memory leaks.
    if (receiptPreviewUrlRef.current) {
      URL.revokeObjectURL(receiptPreviewUrlRef.current);
    }
    const previewUrl = URL.createObjectURL(file);
    receiptPreviewUrlRef.current = previewUrl;
    setReceiptFile(file);
    setReceiptPreview(previewUrl);
    // Scanner captures are always images, never PDFs
    setOriginalWasPdf(false);
    console.log(`[RECEIPT-FLOW] applyReceiptFile: source=${source}, file=${file.name}, previewUrl=${previewUrl.slice(0, 40)}...`);

    // Auto-scroll to the receipt preview so the user can see it immediately.
    // Use requestAnimationFrame to wait for the DOM to update with the new preview.
    requestAnimationFrame(() => {
      const previewEl = document.getElementById('receipt-preview-area');
      if (previewEl) {
        previewEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        console.log('[AddTransactionForm] Scrolled to receipt preview');
      }
    });
  }, []);

  // When a preloaded file arrives from the standalone scanner (FAB flow),
  // auto-attach it to the form (OCR is manual now — user triggers it).
  useEffect(() => {
    if (preloadedReceiptFile && !preloadedConsumedRef.current) {
      preloadedConsumedRef.current = true;
      applyReceiptFile(preloadedReceiptFile, 'preloaded (FAB flow)');
      onPreloadedFileConsumed?.();
    }
    if (!preloadedReceiptFile) {
      preloadedConsumedRef.current = false;
    }
  }, [preloadedReceiptFile, onPreloadedFileConsumed, applyReceiptFile]);

  // ── In-form scanner claim ("Scan kvittering" button inside the dialog) ──
  // When the user taps the "Scan kvittering" button inside the already-open
  // AddTransactionForm, the scanner opens with THIS form's consumerId as the
  // owner. On capture, `completeScan(file)` stores the result. THIS form
  // subscribes and claims the result — but ONLY if it is the recorded owner.
  //
  // Why ownership matters: on desktop, when `currentView === 'create'`, TWO
  // AddTransactionForm instances mount (the `layout="cards"` desktop form +
  // the hidden mobile dialog form). Without ownership, the hidden desktop
  // form could win the race and attach the receipt to a form the user can't
  // see. With ownership, only the form that called openScanner(formConsumerId)
  // can claim — so the receipt always lands in the visible form.
  //
  // FAB flow: page.tsx calls openScanner(null) (no owner) → PosteringerPage
  // claims as the fallback and opens a fresh dialog with preloadedReceiptFile.
  const formConsumerId = useMemo(() => `add-transaction-form:${Math.random().toString(36).slice(2, 10)}`, []);
  const lastClaimedScanIdRef = useRef<number>(0);

  useEffect(() => {
    console.log(`[RECEIPT-FLOW] AddTransactionForm mounted, consumerId=${formConsumerId}, layout=${layout}`);
    const existing = useScannerStore.getState().pendingResult;
    if (existing && existing.id !== lastClaimedScanIdRef.current) {
      console.log(`[RECEIPT-FLOW] Form ${formConsumerId} found existing pending result id=${existing.id}, attempting claim`);
      const claimed = useScannerStore.getState().claimResult(formConsumerId, existing.id);
      if (claimed) {
        lastClaimedScanIdRef.current = claimed.id;
        applyReceiptFile(claimed.file, 'in-form scanner claim (existing)');
      }
    }

    const unsubscribe = useScannerStore.subscribe((state, prevState) => {
      console.log(`[RECEIPT-FLOW] Form ${formConsumerId} subscriber fired: pendingResult=${state.pendingResult?.id ?? 'null'}, prevPending=${prevState.pendingResult?.id ?? 'null'}, owner=${state.scannerOwner}`);
      if (state.pendingResult && !prevState.pendingResult) {
        const resultId = state.pendingResult.id;
        if (resultId === lastClaimedScanIdRef.current) {
          console.log(`[RECEIPT-FLOW] Form ${formConsumerId} skipping already-claimed id=${resultId}`);
          return;
        }
        const claimed = useScannerStore.getState().claimResult(formConsumerId, resultId);
        if (claimed) {
          lastClaimedScanIdRef.current = claimed.id;
          applyReceiptFile(claimed.file, 'in-form scanner claim (live)');
        }
      }
    });
    return () => {
      console.log(`[RECEIPT-FLOW] AddTransactionForm unmounting, consumerId=${formConsumerId} — unsubscribing`);
      unsubscribe();
      // CRITICAL: if this form is the scanner owner and it unmounts before the
      // scan completes (e.g. dialog closed), release ownership so PosteringerPage
      // can claim as fallback. Otherwise the result is orphaned — nobody can claim.
      const s = useScannerStore.getState();
      if (s.scannerOwner === formConsumerId) {
        console.log(`[RECEIPT-FLOW] Form ${formConsumerId} releasing scanner ownership on unmount`);
        useScannerStore.setState({ scannerOwner: null });
      }
    };
  }, [formConsumerId, applyReceiptFile, layout]);

  const handleOpenScanner = useCallback(() => {
    console.log(`[RECEIPT-FLOW] handleOpenScanner called by form ${formConsumerId} (layout=${layout})`);
    useScannerStore.getState().openScanner(formConsumerId);
  }, [formConsumerId, layout]);

  const handleUseDescription = useCallback((desc: string) => {
    setDescription(desc);
    setShowDescriptionSuggestions(false);
    descriptionInputRef.current?.focus();
  }, []);

  // ─── Submit ───
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setAccountError('');

    // Validate based on which cards have data
    if (receiptCardHasData && !selectedAccountId) {
      setAccountError(isDa
        ? 'Vælg en omkostningskonto for at bogføre i dobbelt-posteringsregnskabet'
        : 'Select an expense account for double-entry bookkeeping');
      return;
    }

    // Validate purchase line accounts when lines have data.
    // SAFETY NET: in compact (mobile) layout, purchase lines are NOT rendered,
    // so the user can't assign accounts to them. Skip this check when the
    // receipt card has data (amount filled in) — the submission will use the
    // receipt card data, not the purchase lines. This prevents OCR populating
    // invisible lines from blocking submission on mobile.
    if (purchaseLinesHasData && !(layout !== 'cards' && receiptCardHasData)) {
      const lineMissingAccount = purchaseLines.find(
        line => (line.description?.trim() || line.unitPrice !== 0) && !line.accountId
      );
      if (lineMissingAccount) {
        setError(isDa
          ? 'Alle købslinjer med data skal have en konto valgt'
          : 'All purchase lines with data must have an account selected');
        return;
      }
    }

    // At least one card must have data to record
    if (!receiptCardHasData && !purchaseLinesHasData) {
      setError(isDa
        ? 'Tilføj beløb eller købslinjer for at bogføre'
        : 'Add an amount or purchase lines to record');
      return;
    }

    setIsLoading(true);

    try {
      let receiptImagePath: string | null = null;
      // receiptFile is always an image (PNG from PDF conversion or camera/upload)
      const fileToUpload = receiptFile;
      if (fileToUpload) {
        const formData = new FormData();
        formData.append('file', fileToUpload);
        const uploadResponse = await fetch('/api/transactions/upload', { method: 'POST', body: formData });
        if (!uploadResponse.ok) throw new Error(isDa ? 'Kunne ikke uploade kvittering' : 'Failed to upload receipt');
        const uploadData = await uploadResponse.json();
        receiptImagePath = uploadData.path;
      }

      // Determine amount, description, date, and accountId for the API
      // Priority: receipt card data → derived from purchase lines
      let txAmount: number;
      let txDescription: string;
      let txDate: string;
      let txAccountId: string | undefined;
      let txVatPercent: number;
      // Solution B: per-line items sent to the backend so it can create a
      // multi-line journal entry (one expense + one VAT line per purchase
      // line, plus one bank line). Empty for recurring entries.
      let txLineItems: Array<{ accountId: string; description: string; netAmount: number; vatCode: string }> = [];

      if (receiptCardHasData) {
        txAmount = includesVAT ? netAmount : parsedAmount;
        txDescription = description;
        txDate = date;
        txAccountId = selectedAccountId || undefined;
        txVatPercent = parseFloat(vatPercent);
        // Receipt card → single line item for Solution B
        txLineItems = [{
          accountId: selectedAccountId || '',
          description: description,
          netAmount: netAmount,
          vatCode: vatCode,
        }];
      } else {
        // ── Solution B: send each purchase line individually to the backend ──
        // Each line keeps its own accountId, net amount, and VAT code. The
        // backend creates a multi-line journal entry with one expense line
        // per purchase line, one VAT line per line with VAT, and one bank
        // line. This allows:
        //   • Different accounts per line (8200, 8300, 8400 in one transaction)
        //   • Different VAT codes per line (K0, K25, K0)
        //   • Negative amounts for discounts (posted as credit, not debit)
        txLineItems = purchaseLines
          .filter(l => l.accountId && (l.description?.trim() || l.unitPrice !== 0))
          .map(l => ({
            accountId: l.accountId,
            description: l.description || '',
            netAmount: l.quantity * l.unitPrice,  // net (can be negative for discounts)
            vatCode: l.vatCode,
          }));
        txAmount = lineTotals.subtotal; // metadata for the Transaction record
        const descriptions = purchaseLines
          .filter(l => l.description?.trim())
          .map(l => l.description.trim());
        txDescription = descriptions.length > 0
          ? (descriptions.length === 1 ? descriptions[0] : descriptions.slice(0, 3).join(', ') + (descriptions.length > 3 ? '...' : ''))
          : (isDa ? 'Køb' : 'Purchase');
        txDate = purchaseLinesDate;
        txAccountId = purchaseLines.find(l => l.accountId)?.accountId || undefined;
        // For Transaction.vatPercent metadata: use the first line's rate.
        txVatPercent = purchaseLines.find(l => l.accountId)?.vatPercent ?? 25;
      }

      // ─── If recurring is ON: only create a recurring entry ──
      // The recurring entry's backfill logic will post the first occurrence
      // (and any missed past occurrences) as journal entries automatically.
      // We do NOT post a separate /api/transactions call — that would
      // create a duplicate.
      if (isRecurring && txAccountId) {
        try {
          const recurringBody: Record<string, unknown> = {
            name: txDescription || (isDa ? 'Køb' : 'Purchase'),
            description: txDescription || '',
            frequency: recurringFrequency,
            startDate: recurringStartDate || txDate,
            endDate: recurringEndDate || null,
            accountId: txAccountId,
            amount: txAmount,
            vatPercent: txVatPercent,
          };
          const recurringResponse = await fetch('/api/recurring-entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(recurringBody),
          });
          if (recurringResponse.ok) {
            toast.success(isDa ? 'Gentagende indkøb oprettet' : 'Recurring purchase created', {
              description: isDa
                ? `Gentagende postering oprettet med frekvens: ${FREQUENCY_LABELS[recurringFrequency]?.da || recurringFrequency}`
                : `Recurring entry created with frequency: ${FREQUENCY_LABELS[recurringFrequency]?.en || recurringFrequency}`,
              duration: 4000,
            });
          } else {
            const errData = await recurringResponse.json().catch(() => ({ error: 'Failed' }));
            toast.warning(isDa ? 'Gentagende postering ikke oprettet' : 'Recurring entry not created', {
              description: errData.error || (isDa ? 'Kunne ikke oprette gentagende postering' : 'Could not create recurring entry'),
              duration: 5000,
            });
          }
        } catch {
          toast.warning(isDa ? 'Gentagende postering ikke oprettet' : 'Recurring entry not created', {
            description: isDa ? 'Kunne ikke oprette gentagende postering' : 'Could not create recurring entry',
            duration: 5000,
          });
        }

        // Reset form
        setDate(defaultToday());
        setPurchaseLinesDate(defaultToday());
        purchaseLinesDateManuallySetRef.current = false;
        setAmount('');
        setCurrency('DKK');
        setExchangeRate('');
        setIncludesVAT(true);
        setDescription('');
        setVatPercent('25');
        setSelectedAccountId('');
        setProjectId(null);
        setPurchaseLines([{ ...EMPTY_LINE_ITEM }]);
        resetOCR();
        clearReceipt();
        setIsRecurring(false);
        setRecurringFrequency('MONTHLY');
        setRecurringStartDate('');
        setRecurringEndDate('');

        toast.success(isDa ? 'Indkøb bogført' : 'Purchase recorded', {
          description: isDa
            ? 'Dit indkøb er bogført i dobbelt-posteringsregnskabet'
            : 'Your purchase has been recorded in the double-entry ledger',
        });

        clearDraft();
        onSuccess();
        return;
      }

      // ─── Non-recurring: post a single transaction ──
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'PURCHASE',
          date: txDate,
          amount: txAmount,
          currency: receiptCardHasData && currency !== 'DKK' ? currency : undefined,
          exchangeRate: receiptCardHasData && currency !== 'DKK' && exchangeRate ? parseFloat(exchangeRate) : undefined,
          description: txDescription,
          vatPercent: txVatPercent,
          receiptImage: receiptImagePath,
          accountId: txAccountId,
          projectId: projectId || undefined,
          // Solution B: per-line items so the backend can create a proper
          // multi-line journal entry with per-line accounts + VAT codes.
          lineItems: txLineItems,
        }),
      });

      if (!response.ok) {
        // Try to extract the backend's specific error message first — the
        // generic handleMutationError would replace it with "An error
        // occurred" which hides the actionable detail (e.g. "missing
        // account 1100 — seed the chart of accounts").
        let backendError: string | null = null;
        try {
          const errBody = await response.clone().json();
          if (typeof errBody?.error === 'string' && errBody.error.trim()) {
            backendError = errBody.error;
          }
        } catch {
          // body wasn't JSON — fall through to generic handler
        }

        if (backendError) {
          // Show the specific backend message directly
          setError(backendError);
          toast.error(backendError, { duration: 7000 });
          setIsLoading(false);
          return;
        }

        // No specific message — fall back to the generic access/error handler
        const isAccess = await handleMutationError(
          response,
          isDa ? 'Opret indkøb' : 'Create purchase'
        );
        // handleMutationError already consumed the body (response.json())
        // and showed a toast for non-access errors — just return
        setIsLoading(false);
        return;
      }

      // Reset form
      setDate(defaultToday());
      setPurchaseLinesDate(defaultToday());
      purchaseLinesDateManuallySetRef.current = false;
      setAmount('');
      setCurrency('DKK');
      setExchangeRate('');
      setIncludesVAT(true);
      setDescription('');
      setVatPercent('25');
      setSelectedAccountId('');
      setProjectId(null);
      setPurchaseLines([{ ...EMPTY_LINE_ITEM }]);
      resetOCR();
      clearReceipt();
      setIsRecurring(false);
      setRecurringFrequency('MONTHLY');
      setRecurringStartDate('');
      setRecurringEndDate('');

      toast.success(isDa ? 'Indkøb bogført' : 'Purchase recorded', {
        description: isDa
          ? 'Dit indkøb er bogført i dobbelt-posteringsregnskabet'
          : 'Your purchase has been recorded in the double-entry ledger',
      });

      // Clear the persisted draft now that the save succeeded.
      clearDraft();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : (isDa ? 'Der opstod en fejl' : 'An error occurred'));
    } finally {
      setIsLoading(false);
    }
  }, [date, amount, currency, exchangeRate, includesVAT, netAmount, parsedAmount, description, vatPercent, receiptFile, selectedAccountId, clearReceipt, onSuccess, isDa, handleMutationError, receiptCardHasData, purchaseLinesHasData, purchaseLines, purchaseLinesDate, lineTotals, isRecurring, recurringFrequency, recurringStartDate, recurringEndDate, clearDraft]);

  // ─── RENDER ───

  // Shared: Error message
  const renderError = () => error && (
    <div className="p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg flex items-center gap-2">
      <Info className="h-4 w-4 shrink-0" />
      {error}
    </div>
  );

  // Shared: Expense account select
  const renderAccountSelect = (cardDisabled?: boolean) => (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
        <Label className="dark:text-gray-300 text-sm font-medium">
          {isDa ? 'Fra konto' : 'From account'}
        </Label>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#0d9488]/10 text-[#0d9488] dark:bg-[#2dd4bf]/20 dark:text-[#2dd4bf]">
          6xxx–9xxx
        </span>
        {!cardDisabled && <span className="text-[10px] text-red-500 dark:text-red-400 ml-1">*</span>}
        {cardDisabled && <span className="text-[10px] text-gray-400 ml-1">({isDa ? 'valgfrit' : 'optional'})</span>}
      </div>
      <Select value={selectedAccountId} onValueChange={(val) => { setSelectedAccountId(val); setAccountError(''); }} disabled={isLoading || accountsLoading || !!cardDisabled}>
        <SelectTrigger className={`bg-gray-50 dark:bg-white/5 ${accountError ? 'border-red-400 dark:border-red-500' : ''}`}>
          <SelectValue placeholder={accountsLoading
            ? (isDa ? 'Indlæser konti...' : 'Loading accounts...')
            : (isDa ? 'Vælg konto...' : 'Select account...')
          } />
        </SelectTrigger>
        <SelectContent className="bg-white dark:bg-[#1a1f1e] max-h-72">
          {groupedAccounts.map((group) => (
            <SelectGroup key={group.labelDa}>
              <SelectLabel className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-2 py-1.5 select-none">
                {isDa ? group.labelDa : group.labelEn} ({group.accounts[0]?.number.slice(0, 1)}xxx)
              </SelectLabel>
              {group.accounts.map((acc) => (
                <SelectItem key={acc.id} value={acc.id}>
                  <span className="font-mono text-xs text-gray-500 dark:text-gray-400 mr-2">{acc.number}</span>
                  {isDa ? acc.name : (acc.nameEn || acc.name)}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {accountError && (
        <p className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {accountError}
        </p>
      )}
      {selectedAccount && (
        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
          <Info className="h-3 w-3 shrink-0" />
          {isDa ? `Valgt: ${selectedAccount.number} ${selectedAccount.name}` : `Selected: ${selectedAccount.number} ${selectedAccount.nameEn || selectedAccount.name}`}
        </p>
      )}
    </div>
  );

  // Shared: Amount & Date (amount first)
  // Shared: Recurring purchase toggle
  const renderRecurringToggle = () => (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Repeat className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
        <Label className="text-[#0d9488] dark:text-[#2dd4bf] text-sm font-medium">
          {isDa ? 'Gentagende indkøb' : 'Recurring Purchase'}
        </Label>
      </div>
      <ResponsiveSwitch checked={isRecurring} onCheckedChange={setIsRecurring} disabled={isLoading} />
    </div>
  );

  // Shared: Amount field (with includesVAT toggle)
  const renderAmountField = () => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="dark:text-gray-300 text-sm font-medium">{t('amount')}</Label>
        <div className="flex items-center gap-1.5">
          <Label className="text-[11px] text-[#0d9488] dark:text-[#2dd4bf] cursor-pointer">{t('amountIncludesVAT')}</Label>
          <ResponsiveSwitch checked={includesVAT} onCheckedChange={setIncludesVAT} disabled={isLoading} />
        </div>
      </div>
      <div className="relative">
        <Input type="number" step="0.01" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} required disabled={isLoading} className="h-12 text-xl font-bold text-right pr-14 bg-gray-50 dark:bg-white/5 tabular-nums" />
        <div className="absolute right-3 top-1/2 -translate-y-1/2"><span className="text-xs font-semibold text-gray-400 dark:text-gray-500">DKK</span></div>
      </div>
      {includesVAT && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1"><Info className="h-3 w-3" />{t('grossToNetInfo')}</p>
      )}
    </div>
  );

  // Shared: Date field (transforms when recurring is active)
  const renderDateField = () => (
    isRecurring ? (
      <div className="space-y-3 overflow-hidden transition-all duration-300">
        {/* Frequency */}
        <div className="space-y-1.5">
          <Label className="dark:text-gray-300 text-sm font-medium">
            {isDa ? 'Frekvens' : 'Frequency'}
          </Label>
          <Select value={recurringFrequency} onValueChange={setRecurringFrequency} disabled={isLoading}>
            <SelectTrigger className="bg-gray-50 dark:bg-white/5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-[#1a1f1e]">
              {FREQUENCIES.map((f) => (
                <SelectItem key={f} value={f}>
                  {isDa ? FREQUENCY_LABELS[f].da : FREQUENCY_LABELS[f].en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Start Date + End Date */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={layout === 'cards' ? 'date-cards' : 'date'} className="dark:text-gray-300 text-sm font-medium">
              {isDa ? 'Startdato' : 'Start Date'}
              <span className="text-[10px] text-red-500 dark:text-red-400 ml-1">*</span>
            </Label>
            <Input
              id={layout === 'cards' ? 'date-cards' : 'date'}
              type="date"
              value={recurringStartDate}
              onChange={(e) => setRecurringStartDate(e.target.value)}
              required
              disabled={isLoading}
              className="bg-gray-50 dark:bg-white/5 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="dark:text-gray-300 text-sm font-medium">
              {isDa ? 'Slutdato' : 'End Date'}
              <span className="text-[10px] text-gray-400 ml-1">({isDa ? 'valgfrit' : 'optional'})</span>
            </Label>
            <Input
              type="date"
              value={recurringEndDate}
              onChange={(e) => setRecurringEndDate(e.target.value)}
              disabled={isLoading}
              className="bg-gray-50 dark:bg-white/5 text-sm"
            />
          </div>
        </div>
      </div>
    ) : (
      <div className="space-y-1.5">
        <Label htmlFor={layout === 'cards' ? 'date-cards' : 'date'} className="dark:text-gray-300 text-sm font-medium">{t('date')}</Label>
        <Input id={layout === 'cards' ? 'date-cards' : 'date'} type="date" value={date} onChange={(e) => { setDate(e.target.value); dateManuallySetRef.current = true; }} required disabled={isLoading} className="bg-gray-50 dark:bg-white/5 text-sm" />
      </div>
    )
  );

  // Shared: Net/VAT/Gross calculation cards
  const renderCalculations = () => amount && parsedAmount > 0 && (
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-2 text-center">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">{t('netAmountShort')}</p>
        <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{formatDanishNumber(netAmount)}</p>
      </div>
      <div className="rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-2 text-center">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">{t('vatShort')}</p>
        <p className="text-sm font-bold text-[#0d9488] dark:text-[#2dd4bf] tabular-nums">{formatDanishNumber(vatAmount)}</p>
      </div>
      <div className="rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-2 text-center">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">{t('grossShort')}</p>
        <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{formatDanishNumber(totalAmount)}</p>
      </div>
    </div>
  );

  // Shared: VAT% & Currency row
  const renderVatCurrency = () => (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label className="dark:text-gray-300 text-sm font-medium">{isDa ? 'Moms %' : 'VAT %'}</Label>
        <VATCodeSelect
          value={vatCode}
          onValueChange={(code) => {
            setVatCode(code);
            setVatPercent(String(VAT_RATE_MAP[code] ?? 0));
          }}
          direction="input"
          disabled={isLoading}
          triggerClassName="bg-gray-50 dark:bg-white/5"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="dark:text-gray-300 text-sm font-medium">{t('currency')}</Label>
        <Select value={currency} onValueChange={(val) => {
          setCurrency(val);
          if (val === 'DKK') {
            setExchangeRate('');
            setRateDate(null);
          } else {
            fetchExchangeRate(val);
          }
        }}>
          <SelectTrigger className="bg-gray-50 dark:bg-white/5"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-white dark:bg-[#1a1f1e]">{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>
  );

  // Shared: Exchange rate (conditional)
  const renderExchangeRate = () => currency !== 'DKK' && (
    <div className="space-y-1.5">
      <Label className="dark:text-gray-300 text-sm font-medium">
        {t('exchangeRate')} ({currency} → DKK)
        {rateLoading && <Loader2 className="inline h-3 w-3 ml-1.5 animate-spin text-[#0d9488]" />}
      </Label>
      <Input type="number" step="0.0001" min="0" placeholder={rateLoading ? (isDa ? 'Henter kurs…' : 'Fetching rate…') : '0.0000'} value={exchangeRate} onChange={(e) => { setExchangeRate(e.target.value); exchangeRateManualRef.current = true; }} disabled={isLoading} className="bg-gray-50 dark:bg-white/5" />
      {rateDate && !exchangeRateManualRef.current && (
        <p className="text-[10px] text-gray-400 flex items-center gap-1">
          <Info className="h-3 w-3" />
          {isDa ? `Kurs fra ECB reference: ${rateDate}` : `Rate from ECB reference: ${rateDate}`}
        </p>
      )}
    </div>
  );

  // Document preview card (shown when a file is uploaded)
  const renderDocumentPreview = () => {
    if (!receiptPreview) return null;

    const isLoading = receiptPreview === 'loading';
    const isImagePreview = !isLoading;

    return (
      <div className="space-y-3" id="receipt-preview-area">
        {/* Preview area */}
        <div className="relative rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden bg-gray-50 dark:bg-gray-900/50">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-gray-400 dark:text-gray-500">
              <Loader2 className="h-8 w-8 animate-spin text-[#0d9488]" />
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{isDa ? 'Indlæser PDF…' : 'Loading PDF…'}</p>
            </div>
          ) : isImagePreview ? (
            <div className="flex justify-center p-2">
              <img
                src={receiptPreview}
                alt="Document preview"
                className="w-full h-auto object-contain shadow-sm rounded"
                style={{ maxHeight: '600px' }}
                onLoad={() => console.log('[AddTransactionForm] Preview image loaded successfully')}
                onError={(e) => {
                  console.error('[AddTransactionForm] Preview image FAILED to load:', receiptPreview?.slice(0, 50));
                  // Attempt to recreate the blob URL if it failed
                  if (receiptFile && receiptPreview) {
                    try {
                      const newUrl = URL.createObjectURL(receiptFile);
                      if (receiptPreviewUrlRef.current) URL.revokeObjectURL(receiptPreviewUrlRef.current);
                      receiptPreviewUrlRef.current = newUrl;
                      setReceiptPreview(newUrl);
                      console.log('[AddTransactionForm] Recreated blob URL after load failure');
                    } catch (err) {
                      console.error('[AddTransactionForm] Failed to recreate blob URL:', err);
                    }
                  }
                }}
              />
            </div>
          ) : null}

          {/* OCR loading overlay */}
          {ocrLoading && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 text-white animate-spin" />
              <div className="w-32 h-1.5 rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full bg-teal-400 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${Math.max(ocrProgress, 5)}%` }}
                />
              </div>
              <p className="text-[11px] text-white/80 font-medium">
                {isDa ? 'Læser dokument…' : 'Reading document…'}
              </p>
            </div>
          )}

          {/* Action buttons overlay */}
          {!ocrLoading && (
            <div className="absolute top-2 right-2 flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700 shadow-sm"
                onClick={handleManualOCR}
                title={isDa ? 'Læs dokument med OCR' : 'Read document with OCR'}
              >
                <ScanSearch className="h-3.5 w-3.5" />
              </Button>
              {isImagePreview && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700 shadow-sm"
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = receiptPreview;
                    const now = new Date();
                    const pad = (n: number) => String(n).padStart(2, '0');
                    a.download = `dokument_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.jpg`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                  aria-label={isDa ? 'Gem billede' : 'Save image'}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button type="button" variant="destructive" size="sm" className="bg-red-500/90 backdrop-blur-sm shadow-sm" onClick={clearReceipt}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* OCR trigger button below preview */}
        {!ocrLoading && (
          <Button
            type="button"
            variant="outline"
            className="w-full h-10 gap-2 border-dashed border-2 hover:border-[#0d9488] hover:bg-[#0d9488]/5 transition-colors dark:border-white/20 dark:hover:border-[#0d9488]"
            onClick={handleManualOCR}
          >
            <ScanSearch className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
            <span className="text-sm font-medium">
              {isDa ? 'Læs dokument med OCR' : 'Read document with OCR'}
            </span>
          </Button>
        )}
      </div>
    );
  };

  // Shared: Receipt upload area (only shown when no document is uploaded)
  const renderReceiptUpload = () => {
    console.log(`[RECEIPT-FLOW] renderReceiptUpload: receiptPreview=${receiptPreview ? receiptPreview.slice(0, 40) : 'null'}, receiptFile=${receiptFile?.name ?? 'null'}, layout=${layout}`);
    return (
    <div className="space-y-1.5">
      <Label className="dark:text-gray-300 text-sm font-medium">{t('receipt')} <span className="text-gray-400 text-xs font-normal">({isDa ? 'valgfrit' : 'optional'})</span></Label>
      <input ref={fileInputRef} type="file" accept="image/*,.pdf" onChange={handleFileChange} className="hidden" disabled={isLoading} />
      {receiptPreview ? (
        renderDocumentPreview()
      ) : (
        <div className="grid gap-2 grid-cols-1">
          {layout !== 'cards' && (
            <Button
              type="button"
              variant="outline"
              className="h-16 border-dashed border-2 hover:border-[#0d9488] hover:bg-[#0d9488]/5 transition-colors dark:border-white/20 dark:hover:border-[#0d9488]"
              onClick={handleOpenScanner}
              disabled={isLoading}
            >
              <div className="flex flex-col items-center gap-1">
                <Camera className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
                <span className="text-[11px] text-gray-600 dark:text-gray-400 font-medium">{isDa ? 'Scan kvittering' : 'Scan receipt'}</span>
              </div>
            </Button>
          )}
          {layout === 'cards' && (
            <Button
              type="button"
              variant="outline"
              className="h-20 border-dashed border-2 hover:border-[#0d9488] hover:bg-[#0d9488]/5 transition-colors dark:border-white/20 dark:hover:border-[#0d9488]"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
            >
              <div className="flex flex-col items-center gap-1">
                <Upload className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                <span className="text-[11px] text-gray-600 dark:text-gray-400 font-medium">{isDa ? 'Upload kvittering eller købsfaktura' : 'Upload receipt or purchase invoice'}</span>
              </div>
            </Button>
          )}
        </div>
      )}
    </div>
    );
  };

  // Shared: Description textarea
  const renderDescription = () => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="dark:text-gray-300 text-sm font-medium">{t('description')}</Label>
        {recentDescriptions.length > 0 && (
          <button type="button" onClick={() => setShowDescriptionSuggestions(!showDescriptionSuggestions)} className="text-xs text-[#0d9488] dark:text-[#2dd4bf] hover:underline cursor-pointer">
            {isDa ? 'Seneste' : 'Recent'}
          </button>
        )}
      </div>
      {showDescriptionSuggestions && recentDescriptions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 p-2">
          {recentDescriptions.map((desc, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleUseDescription(desc.description)}
              className="text-xs px-2 py-1 rounded-md bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:bg-[#0d9488]/10 hover:border-[#0d9488]/30 hover:text-[#0d9488] dark:hover:text-[#2dd4bf] transition-colors cursor-pointer truncate max-w-[200px]"
            >
              {desc.description}
            </button>
          ))}
        </div>
      )}
      <Textarea
        ref={descriptionInputRef}
        placeholder={isDa ? 'Beskrivelse af købet...' : 'Description of purchase...'}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={layout === 'cards' ? 3 : 2}
        disabled={isLoading}
        className="bg-gray-50 dark:bg-white/5 text-sm"
      />
    </div>
  );

  // ─── Line items card content (matches invoice line items pattern) ───
  const renderLineItems = () => (
    <div className="space-y-4">
      {purchaseLines.map((item, index) => (
        <div key={index} className="flex flex-col gap-3 p-4 rounded-lg border border-gray-100/50 dark:border-white/5 bg-gray-50/50 dark:bg-white/[0.02]">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Account selector */}
            <div className="w-48 space-y-1">
              <div className="flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <Label className="text-xs text-gray-500 dark:text-gray-400">
                  {isDa ? 'Konto' : 'Account'}
                </Label>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-600/10 text-emerald-600 dark:bg-emerald-400/20 dark:text-emerald-400">
                  6xxx–9xxx
                </span>
                {purchaseLinesHasData && (item.description?.trim() || item.unitPrice !== 0) && <span className="text-[10px] text-red-500 dark:text-red-400 ml-1">*</span>}
              </div>
              <Select
                value={item.accountId}
                onValueChange={(val) => updatePurchaseLineItem(index, 'accountId', val)}
                disabled={!purchaseLinesHasData || (!(item.description?.trim()) && item.unitPrice === 0 && !item.accountId)}
              >
                <SelectTrigger className="h-10 bg-gray-50 dark:bg-white/5">
                  <SelectValue placeholder={isDa ? 'Vælg konto...' : 'Select account...'} />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-[#1a1f1e] dark:border-[#232740] max-h-72 overflow-y-auto">
                  {groupedAccounts.map((group) => (
                    <SelectGroup key={group.labelDa}>
                      <SelectLabel className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-2 py-1.5 select-none">
                        {isDa ? group.labelDa : group.labelEn} ({group.accounts[0]?.number.slice(0, 1)}xxx)
                      </SelectLabel>
                      {group.accounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          <span className="font-mono text-xs text-gray-500 dark:text-gray-400 mr-2">{acc.number}</span>
                          {isDa ? acc.name : (acc.nameEn || acc.name)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {item.accountId && (() => {
                const acc = expenseAccounts.find((a) => a.id === item.accountId);
                return acc ? (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <Info className="h-3 w-3 shrink-0" />
                    {isDa ? `Valgt: ${acc.number} ${acc.name}` : `Selected: ${acc.number} ${acc.nameEn || acc.name}`}
                  </p>
                ) : null;
              })()}
            </div>
            {/* Description */}
            <div className="flex-1 min-w-[180px] space-y-1">
              <Label className="text-xs text-gray-500 dark:text-gray-400">{t('itemDescription')}</Label>
              <Input
                value={item.description}
                onChange={(e) => updatePurchaseLineItem(index, 'description', e.target.value)}
                placeholder={t('itemDescription')}
                className="h-10 bg-white dark:bg-white/5"
              />
            </div>
            {/* Quantity */}
            <div className="w-20 space-y-1">
              <Label className="text-xs text-gray-500 dark:text-gray-400">{t('quantity')}</Label>
              <Input
                type="number"
                min="1"
                value={item.quantity}
                onChange={(e) => updatePurchaseLineItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                className="h-10 bg-white dark:bg-white/5 text-center"
              />
            </div>
            {/* Unit Price */}
            <div className="w-28 space-y-1">
              <Label className="text-xs text-gray-500 dark:text-gray-400">{t('unitPrice')}</Label>
              {/* Allow negative unit prices for discount/rebate lines.
                  The browser default min="0" blocked legitimate discounts,
                  e.g. an invoice line representing a discount carries a
                  negative amount that should reduce the purchase total. */}
              <Input
                type="number"
                step="0.01"
                value={item.unitPrice || ''}
                onChange={(e) => {
                  const parsed = parseFloat(e.target.value);
                  updatePurchaseLineItem(index, 'unitPrice', isNaN(parsed) ? 0 : parsed);
                }}
                className={`h-10 bg-white dark:bg-white/5 text-right ${item.unitPrice < 0 ? 'text-red-600 dark:text-red-400 font-medium' : ''}`}
              />
            </div>
            {/* VAT % */}
            <div className="w-20 space-y-1">
              <Label className="text-xs text-gray-500 dark:text-gray-400">{t('vatPercent')}</Label>
              <VATCodeSelect
                value={item.vatCode}
                onValueChange={(code) => {
                  updatePurchaseLineItem(index, 'vatCode', code);
                  updatePurchaseLineItem(index, 'vatPercent', VAT_RATE_MAP[code] ?? 0);
                }}
                direction="input"
                triggerClassName="h-10 bg-white dark:bg-white/5"
              />
            </div>
            {/* Amount (read-only) */}
            <div className="w-24 space-y-1">
              <Label className="text-xs text-gray-500 dark:text-gray-400">{t('amount')}</Label>
              <div className={`h-10 px-3 flex items-center justify-end text-sm font-medium bg-gray-100 dark:bg-gray-700 rounded-md ${item.unitPrice < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                {tc(item.quantity * item.unitPrice)}
              </div>
            </div>
            {/* Delete */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removePurchaseLineItem(index)}
              disabled={purchaseLines.length === 1}
              className="text-gray-400 hover:text-red-500 disabled:opacity-30"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-72 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">{t('subtotal')}</span>
            <span className="font-medium dark:text-gray-300">{tc(lineTotals.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">{t('vatTotalLabel')}</span>
            <span className="font-medium dark:text-gray-300">{tc(lineTotals.vatTotal)}</span>
          </div>
          <Separator className="dark:bg-gray-700" />
          <div className="flex justify-between">
            <span className="text-lg font-bold text-gray-900 dark:text-white">{t('grandTotal')}</span>
            <span className="text-lg font-bold text-[#0d9488] dark:text-[#2dd4bf]">{tc(lineTotals.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );

  // Shared: Submit button
  const renderSubmit = () => (
    <Button
      type="submit"
      disabled={isLoading || (layout === 'cards' && !receiptCardHasData && !purchaseLinesHasData)}
      className={`bg-[#0d9488] hover:bg-[#0f766e] text-white font-semibold transition-colors ${layout === 'cards' ? 'h-12 text-base px-8' : 'w-full h-11'}`}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          {isDa ? 'Bogfører...' : 'Recording...'}
        </span>
      ) : (
        <span>{isDa ? 'Bogfør indkøb' : 'Record Purchase'}</span>
      )}
    </Button>
  );

  // ─── Reset form to defaults (used by ClearFormButton) ───
  const resetFormToDefaults = useCallback(() => {
    // Revoke any pending object URL to avoid memory leaks
    if (receiptPreviewUrlRef.current) {
      URL.revokeObjectURL(receiptPreviewUrlRef.current);
      receiptPreviewUrlRef.current = null;
    }
    setDate(defaultToday());
    setPurchaseLinesDate(defaultToday());
    setAmount('');
    setCurrency('DKK');
    setExchangeRate('');
    setIncludesVAT(true);
    setDescription('');
    setVatPercent('25');
    setIsRecurring(false);
    setRecurringFrequency('MONTHLY');
    setRecurringStartDate('');
    setRecurringEndDate('');
    setReceiptFile(null);
    setReceiptPreview(null);
    setReceiptNaturalWidth(null);
    setOriginalWasPdf(false);
    setSelectedAccountId('');
    setProjectId(null);
    setPurchaseLines([{ ...EMPTY_LINE_ITEM }]);
    dateManuallySetRef.current = false;
    purchaseLinesDateManuallySetRef.current = false;
    exchangeRateManualRef.current = false;
    setRateDate(null);
    resetOCR();
    if (fileInputRef.current) fileInputRef.current.value = '';
    setError('');
    clearDraft();
  }, [clearDraft, resetOCR]);

  // ─── Compact layout (for mobile dialog) ───
  if (layout === 'compact') {
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Clear-form button — top-right.
            Positive margin-bottom (instead of the old -mb-2) lifts the button
            away from the "inkl. moms" toggle on the amount row below so they
            don't visually collide. space-y-4 on the form already adds a gap,
            but the amount row's label+toggle sit at the very top of its block,
            so an explicit mb here keeps the clear button clear of the toggle. */}
        <div className="flex justify-end mb-1">
          <ClearFormButton
            size="xs"
            label={isDa ? 'Ryd formular' : 'Clear form'}
            isDirty={isTransactionDirty}
            onClear={resetFormToDefaults}
          />
        </div>
        {renderError()}
        {/* Field order (per user request):
            1. Amount
            2. Net/VAT/Gross calculation
            3. VAT % & currency  ← moved ABOVE the date field
            4. Date              ← moved BELOW the VAT field
            5. Recurring toggle  ← moved BELOW the date field
            6. Exchange rate, account, project, receipt, description, submit
        */}
        {renderAmountField()}
        {renderCalculations()}
        {renderVatCurrency()}
        {renderDateField()}
        {renderRecurringToggle()}

        {/* ── Section divider: separates the recurring-toggle section from the
            account/project/receipt section below. Adds visual breathing room
            (pt + mt) plus a subtle horizontal rule so the form doesn't feel
            like one long undifferentiated list. Matches the divider style used
            in the cards layout (border-t border-gray-100 dark:border-white/5). ── */}
        <div className="pt-3 mt-1 border-t border-gray-200 dark:border-white/10" />

        {renderExchangeRate()}
        {renderAccountSelect()}
        {/* Project selector */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
            <Label className="dark:text-gray-300 text-sm font-medium">
              {isDa ? 'Projekt' : 'Project'}
            </Label>
            <span className="text-[10px] text-gray-400 ml-1">({isDa ? 'valgfrit' : 'optional'})</span>
          </div>
          <ProjectSelector
            value={projectId || undefined}
            onChange={setProjectId}
            companyId={activeCompanyId || ''}
          />
        </div>
        {renderReceiptUpload()}
        {renderDescription()}
        {renderSubmit()}
      </form>
    );
  }

  // ─── Card layout (for desktop full-page) ───
  return (
    <form onSubmit={handleSubmit} className="space-y-4 lg:space-y-6">
      <div className="flex justify-end">
        <ClearFormButton
          size="sm"
          label={isDa ? 'Ryd formular' : 'Clear form'}
          isDirty={isTransactionDirty}
          onClear={resetFormToDefaults}
        />
      </div>
      {renderError()}

      {/* ── Two-column: Purchase Details + Receipt & Invoice ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">

        {/* ── Left Card: Purchase Details ── */}
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#14b8a6] to-[#0d9488] flex items-center justify-center shrink-0">
                <BookOpen className="h-4 w-4 text-white" />
              </div>
              {isDa ? 'Købsnota & kvittering' : 'Purchase Note & Receipts'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* ── Recurring purchase toggle ── */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Repeat className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
                <Label className="text-[#0d9488] dark:text-[#2dd4bf] text-sm font-medium">
                  {isDa ? 'Gentagende indkøb' : 'Recurring Purchase'}
                </Label>
              </div>
              <ResponsiveSwitch checked={isRecurring} onCheckedChange={setIsRecurring} disabled={isLoading} />
            </div>

            {/* ── 1. Beløb (Amount) ── */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="dark:text-gray-300 text-sm font-medium">{t('amount')}</Label>
                <div className="flex items-center gap-1.5">
                  <Label className="text-[11px] text-[#0d9488] dark:text-[#2dd4bf] cursor-pointer">{t('amountIncludesVAT')}</Label>
                  <ResponsiveSwitch checked={includesVAT} onCheckedChange={setIncludesVAT} disabled={isLoading} />
                </div>
              </div>
              <div className="relative">
                <Input type="number" step="0.01" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={isLoading} className="h-12 text-xl font-bold text-right pr-14 bg-gray-50 dark:bg-white/5 tabular-nums" />
                <div className="absolute right-3 top-1/2 -translate-y-1/2"><span className="text-xs font-semibold text-gray-400 dark:text-gray-500">DKK</span></div>
              </div>
              {includesVAT && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1"><Info className="h-3 w-3" />{t('grossToNetInfo')}</p>
              )}
            </div>

            {/* Description */}
            {renderDescription()}

            {/* Net / VAT / Gross calculation row */}
            {amount && parsedAmount > 0 && (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 px-3 py-2.5 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">{t('netAmountShort')}</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{formatDanishNumber(netAmount)}</p>
                </div>
                <div className="rounded-lg bg-[#0d9488]/5 dark:bg-[#2dd4bf]/5 border border-[#0d9488]/15 dark:border-[#2dd4bf]/15 px-3 py-2.5 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-[#0d9488] dark:text-[#2dd4bf] mb-1">{t('vatShort')}</p>
                  <p className="text-sm font-bold text-[#0d9488] dark:text-[#2dd4bf] tabular-nums">{formatDanishNumber(vatAmount)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 px-3 py-2.5 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">{t('grossShort')}</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{formatDanishNumber(totalAmount)}</p>
                </div>
              </div>
            )}

            <div className="border-t border-gray-100 dark:border-white/5" />

            {/* ── 2. Moms % & Valuta ── */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="dark:text-gray-300 text-sm font-medium">{isDa ? 'Moms %' : 'VAT %'}</Label>
                  <VATCodeSelect
                    value={vatCode}
                    onValueChange={(code) => {
                      setVatCode(code);
                      setVatPercent(String(VAT_RATE_MAP[code] ?? 0));
                    }}
                    direction="input"
                    disabled={isLoading}
                    triggerClassName="bg-gray-50 dark:bg-white/5"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="dark:text-gray-300 text-sm font-medium">{t('currency')}</Label>
                  <Select value={currency} onValueChange={(val) => {
          setCurrency(val);
          if (val === 'DKK') {
            setExchangeRate('');
            setRateDate(null);
          } else {
            fetchExchangeRate(val);
          }
        }}>
                    <SelectTrigger className="bg-gray-50 dark:bg-white/5"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-white dark:bg-[#1a1f1e]">{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              {currency !== 'DKK' && (
                <div className="space-y-1.5">
                  <Label className="dark:text-gray-300 text-sm font-medium">{t('exchangeRate')} ({currency} → DKK)</Label>
                  <Input type="number" step="0.0001" min="0" placeholder="0.0000" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} disabled={isLoading} className="bg-gray-50 dark:bg-white/5" />
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 dark:border-white/5" />

            {/* ── 3. Dato / Recurring dates ── */}
            {isRecurring ? (
              <div className="space-y-3 overflow-hidden transition-all duration-300">
                {/* Frequency */}
                <div className="space-y-1.5">
                  <Label className="dark:text-gray-300 text-sm font-medium">
                    {isDa ? 'Frekvens' : 'Frequency'}
                  </Label>
                  <Select value={recurringFrequency} onValueChange={setRecurringFrequency} disabled={isLoading}>
                    <SelectTrigger className="bg-gray-50 dark:bg-white/5"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-white dark:bg-[#1a1f1e]">
                      {FREQUENCIES.map((f) => (
                        <SelectItem key={f} value={f}>{isDa ? FREQUENCY_LABELS[f].da : FREQUENCY_LABELS[f].en}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Start Date + End Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="date-cards" className="dark:text-gray-300 text-sm font-medium">
                      {isDa ? 'Startdato' : 'Start Date'}
                      <span className="text-[10px] text-red-500 dark:text-red-400 ml-1">*</span>
                    </Label>
                    <Input id="date-cards" type="date" value={recurringStartDate}
                           onChange={(e) => setRecurringStartDate(e.target.value)}
                           required disabled={isLoading}
                           className="bg-gray-50 dark:bg-white/5 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="dark:text-gray-300 text-sm font-medium">
                      {isDa ? 'Slutdato' : 'End Date'}
                      <span className="text-[10px] text-gray-400 ml-1">({isDa ? 'valgfrit' : 'optional'})</span>
                    </Label>
                    <Input type="date" value={recurringEndDate}
                           onChange={(e) => setRecurringEndDate(e.target.value)}
                           disabled={isLoading}
                           className="bg-gray-50 dark:bg-white/5 text-sm" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="date-cards" className="dark:text-gray-300 text-sm font-medium">{t('date')}</Label>
                <Input id="date-cards" type="date" value={date} onChange={(e) => { setDate(e.target.value); dateManuallySetRef.current = true; }} required disabled={isLoading} className="bg-gray-50 dark:bg-white/5 text-sm" />
              </div>
            )}

            <div className="border-t border-gray-100 dark:border-white/5" />

            {/* ── 4. Fra konto ── */}
            {renderAccountSelect(!receiptCardHasData)}

            <div className="border-t border-gray-100 dark:border-white/5" />

            {/* ── 5. Projekt ── */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
                <Label className="dark:text-gray-300 text-sm font-medium">
                  {isDa ? 'Projekt' : 'Project'}
                </Label>
                <span className="text-[10px] text-gray-400 ml-1">({isDa ? 'valgfrit' : 'optional'})</span>
              </div>
              <ProjectSelector
                value={projectId || undefined}
                onChange={setProjectId}
                companyId={activeCompanyId || ''}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Right Card: Kvittering & Købsfaktura ── */}
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0">
                <Receipt className="h-4 w-4 text-white" />
              </div>
              {isDa ? 'Købsdokumenter' : 'Purchase Documents'}
            </CardTitle>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isDa
                ? 'Upload en kvittering eller købsfaktura, og læs den med OCR'
                : 'Upload a receipt or purchase invoice and read it with OCR'}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {renderReceiptUpload()}
          </CardContent>
        </Card>
      </div>

      {/* ── Bottom Card: Købslinjer (Line Items) — matches invoice varelinjer pattern ── */}
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shrink-0">
                <Package className="h-4 w-4 text-white" />
              </div>
              {isDa ? 'Købslinjer' : 'Purchase Lines'}
            </CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addPurchaseLineItem} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {t('addItem')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Date field for purchase lines */}
          <div className="space-y-1.5 mb-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <Label className="dark:text-gray-300 text-sm font-medium">{t('date')}</Label>
            </div>
            <Input type="date" value={purchaseLinesDate} onChange={(e) => { setPurchaseLinesDate(e.target.value); purchaseLinesDateManuallySetRef.current = true; }} className="bg-gray-50 dark:bg-white/5 text-sm" />
          </div>

          {renderLineItems()}

          {/* Submit row */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100 dark:border-white/5">
            <div className="hidden sm:flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <ArrowRightLeft className="h-4 w-4 text-teal-500" />
              <span>{isDa
                ? 'Bogføres i dobbelt-posteringsregnskabet med modposteringer'
                : 'Recorded in double-entry ledger with offsetting entries'
              }</span>
            </div>
            {renderSubmit()}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
