'use client';

import { useState, useCallback, useEffect, useRef, useMemo, useSyncExternalStore } from 'react';
import { useLanguageStore } from '@/lib/language-store';
import { useTranslation } from '@/lib/use-translation';
import { useScannerStore } from '@/lib/scanner-store';
import { useDataVersion } from '@/hooks/use-data-version';
import { EInvoiceInbox } from '@/components/invoices/einvoice-inbox';
import { PostedEInvoicesList, type ReceivedInvoice } from '@/components/invoices/posted-einvoices-list';
import { PageHeader } from '@/components/shared/page-header';
import { StatsCard } from '@/components/shared/stats-card';
import { AddTransactionForm } from '@/components/transaction/add-transaction-form';
import { clearDraftBeforeUnmount } from '@/lib/draft-store';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Inbox, FileMinus, FileText, Wallet, AlertTriangle, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWriteAccessGuard } from '@/hooks/use-write-access-guard';

type PageView = 'list' | 'create';

interface PosteringerPageProps {
  user: any; // User type from auth-store
  defaultTab?: 'kobs-fakturaer' | 'kobs-kreditnota' | 'einvoice';
}

export function PosteringerPage({ user, defaultTab = 'kobs-fakturaer' }: PosteringerPageProps) {
  const { language } = useLanguageStore();
  const { t } = useTranslation();
  const isDa = language === 'da';
  const { guardWriteAccess } = useWriteAccessGuard(user);
  const [activeTab, setActiveTab] = useState<'kobs-fakturaer' | 'kobs-kreditnota' | 'einvoice'>(defaultTab);
  const [currentView, setCurrentView] = useState<PageView>('list');
  const [isMobileDialogOpen, setIsMobileDialogOpen] = useState(false);
  // ── Received e-invoices (ALL statuses) for stats + tab counts ──
  // Fetched here so PosteringerPage owns the data: stats cards (4 cards
  // matching Salg & Faktura) + tab count badges + the PostedEInvoicesList
  // table (which receives pre-filtered POSTED data as a prop).
  const [receivedInvoices, setReceivedInvoices] = useState<ReceivedInvoice[]>([]);
  const receivedInvoicesVersion = useDataVersion('received-invoices');

  const fetchReceivedInvoices = useCallback(async () => {
    try {
      const res = await fetch('/api/invoices/received?limit=100');
      if (res.ok) {
        const data = await res.json();
        setReceivedInvoices(data.receivedInvoices || []);
      }
    } catch (err) {
      console.error('Failed to fetch received invoices:', err);
    }
  }, []);

  useEffect(() => {
    fetchReceivedInvoices();
  }, [fetchReceivedInvoices, receivedInvoicesVersion]);
  // Create mode: 'purchase' (default) or 'credit-note' (supplier credit note).
  // Mirrors the Salg & Faktura createMode — both flows reuse the same form.
  const [createMode, setCreateMode] = useState<'purchase' | 'credit-note'>('purchase');
  // ── Viewport detection (lg = 1024px) ──
  const subscribeToMedia = useCallback((cb: () => void) => {
    const mql = window.matchMedia('(min-width: 1024px)');
    mql.addEventListener('change', cb);
    return () => mql.removeEventListener('change', cb);
  }, []);
  const getIsDesktopSnapshot = useCallback(() => window.matchMedia('(min-width: 1024px)').matches, []);
  const getServerSnapshot = useCallback(() => false, []);
  const isDesktop = useSyncExternalStore(subscribeToMedia, getIsDesktopSnapshot, getServerSnapshot);

  // ── Derived data: posted invoices, stats, tab counts ──────────────
  // Mirrors the Salg & Faktura page's invoiceStats + tabInvoices pattern.
  // The stats cards (Uafregnet / Forfaldent beløb / Afregnet denne måned /
  // Kladder) match Salg & Faktura's layout, adapted for the purchase
  // workflow (posted e-invoices = outstanding payables; pending = drafts).
  const isCreditNoteType = (ri: ReceivedInvoice) =>
    ri.documentType === 'CREDIT_NOTE' || ri.documentType === 'SELF_BILLED';

  const signedAmount = (ri: ReceivedInvoice) => {
    const amt = Number(ri.payableAmount) || 0;
    return isCreditNoteType(ri) ? -amt : amt;
  };

  // POSTED + SETTLED e-invoices (the ones that "left" the inbox and appear
  // here). SETTLED = bank recon matched the payment (afregnet). Both
  // statuses appear in the Købsfakturaer / Købs-kreditnota tabs.
  const postedInvoices = useMemo(
    () => receivedInvoices.filter((ri) => ri.status === 'POSTED' || ri.status === 'SETTLED'),
    [receivedInvoices]
  );
  // Posted regular purchase invoices (Købsfakturaer tab)
  const postedRegularInvoices = useMemo(
    () => postedInvoices.filter((ri) => !isCreditNoteType(ri)),
    [postedInvoices]
  );
  // Posted purchase credit notes (Købs-kreditnota tab)
  const postedCreditNotes = useMemo(
    () => postedInvoices.filter((ri) => isCreditNoteType(ri)),
    [postedInvoices]
  );

  // Stats — 4 cards matching Salg & Faktura (Uafregnet / Forfaldent / Afregnet / Kladder)
  const purchaseStats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Only POSTED (not SETTLED) are "uafregnet" — SETTLED invoices have been
    // paid (bank recon matched) and are no longer outstanding.
    const unsettled = postedInvoices.filter((ri) => ri.status === 'POSTED');

    // Uafregnet (Outstanding) — sum of signed payableAmount for POSTED only
    const outstanding = unsettled.reduce((sum, ri) => sum + signedAmount(ri), 0);

    // Forfaldent beløb (Overdue) — POSTED (not SETTLED) past dueDate
    const overdueInvoices = unsettled.filter(
      (ri) => ri.dueDate && new Date(ri.dueDate) < now
    );
    const overdue = overdueInvoices.reduce((sum, ri) => sum + signedAmount(ri), 0);
    const overdueCount = overdueInvoices.length;

    // Afregnet denne måned (Settled this month) — SETTLED this month
    // (using settledAt, not postedAt — settledAt is set when the bank recon
    // match occurs, which is the real "afregnet" moment).
    const settledThisMonth = postedInvoices.filter((ri) => {
      if (ri.status !== 'SETTLED' || !ri.settledAt) return false;
      const d = new Date(ri.settledAt);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    // Kladder (Pending/Drafts) — RECEIVED + APPROVED (awaiting posting)
    const pendingCount = receivedInvoices.filter(
      (ri) => ri.status === 'RECEIVED' || ri.status === 'APPROVED'
    ).length;

    return {
      outstanding,
      overdue,
      overdueCount,
      settledThisMonthCount: settledThisMonth.length,
      settledThisMonthAmount: settledThisMonth.reduce((sum, ri) => sum + signedAmount(ri), 0),
      pendingCount,
    };
  }, [postedInvoices, receivedInvoices]);

  // ── Standalone scanner flow (FAB → scan → form) ──
  // PosteringerPage is the FALLBACK consumer: it only opens a new AddTransactionForm
  // dialog with the scanned file when no AddTransactionForm is already open to
  // claim the result itself. This is enforced atomically by `claimResult()` —
  // if an open form already claimed the pendingResult, it's null here and we
  // no-op. The `lastConsumedIdRef` additionally guards against double-processing
  // the same id within this component (e.g. React StrictMode double-invoke).
  const [preloadedFile, setPreloadedFile] = useState<File | null>(null);
  const lastConsumedIdRef = useRef<number>(0);
  const POSTERINGER_CONSUMER_ID = 'posteringer';

  const openFormWithScan = useCallback((result: { file: File; id: number }) => {
    if (result.id === lastConsumedIdRef.current) return;
    lastConsumedIdRef.current = result.id;
    // Deliver file synchronously — requestAnimationFrame caused a race
    // where the preloaded file arrived too late (or not at all) when
    // scanning from inside the already-open dialog.
    setPreloadedFile(result.file);
    // Desktop: full page only, Mobile: dialog only
    setCurrentView('create');
    if (!window.matchMedia('(min-width: 1024px)').matches) {
      setIsMobileDialogOpen(true);
    }
  }, []);

  useEffect(() => {
    const existing = useScannerStore.getState().pendingResult;
    if (existing && existing.id !== lastConsumedIdRef.current) {
      console.log(`[RECEIPT-FLOW] PosteringerPage found existing pending result id=${existing.id}, attempting claim`);
      const claimed = useScannerStore.getState().claimResult(POSTERINGER_CONSUMER_ID, existing.id);
      if (claimed) {
        console.log(`[RECEIPT-FLOW] PosteringerPage claimed id=${claimed.id} → opening form`);
        openFormWithScan(claimed);
      }
    }
    const unsubscribe = useScannerStore.subscribe((state, prevState) => {
      if (state.pendingResult && !prevState.pendingResult) {
        console.log(`[RECEIPT-FLOW] PosteringerPage subscriber fired: id=${state.pendingResult.id}, owner=${state.scannerOwner}`);
        const resultId = state.pendingResult.id;
        if (resultId === lastConsumedIdRef.current) {
          console.log(`[RECEIPT-FLOW] PosteringerPage skipping already-handled id=${resultId}`);
          return;
        }
        const claimed = useScannerStore.getState().claimResult(POSTERINGER_CONSUMER_ID, resultId);
        if (claimed) {
          console.log(`[RECEIPT-FLOW] PosteringerPage claimed id=${claimed.id} → opening form`);
          openFormWithScan(claimed);
        } else {
          console.log(`[RECEIPT-FLOW] PosteringerPage claim DENIED (owner=${state.scannerOwner}) — form already claimed it`);
        }
      }
    });
    return () => unsubscribe();
  }, [openFormWithScan]);

  // ── Embedded scanner tracking (for mobile Dialog protection) ──
  // The scanner now uses the zustand store (rendered at page level in page.tsx).
  // Track isOpen so the Dialog doesn't close while the scanner covers the screen.
  const isScannerActiveRef = useRef(false);
  const scannerStoreIsOpen = useScannerStore((s) => s.isOpen);
  useEffect(() => {
    isScannerActiveRef.current = scannerStoreIsOpen;
  }, [scannerStoreIsOpen]);

  const handleSuccess = useCallback(() => {
    setCurrentView('list');
    setIsMobileDialogOpen(false);
    setPreloadedFile(null);
    setCreateMode('purchase');
  }, []);

  const handleCancel = useCallback(() => {
    setCurrentView('list');
    setIsMobileDialogOpen(false);
    setPreloadedFile(null);
    setCreateMode('purchase');
  }, []);

  // Mobile Dialog handlers (prevent close when scanner is active)
  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (!open && isScannerActiveRef.current) return;
    setIsMobileDialogOpen(open);
    if (!open) {
      // Clear the transaction draft when the dialog is closed (cancel/X/
      // backdrop/escape) so the form starts empty next time. Uses
      // clearDraftBeforeUnmount so the form's useDraftSync unmount-flush
      // doesn't re-create the draft that was just removed.
      clearDraftBeforeUnmount('transaction:new');
      setPreloadedFile(null);
    }
  }, []);

  const handlePointerDownOutside = useCallback((e: Event) => {
    if (isScannerActiveRef.current) e.preventDefault();
  }, []);

  const handlePreloadedFileConsumed = useCallback(() => {
    setPreloadedFile(null);
  }, []);

  // Unified open handler: desktop → full page, mobile → dialog
  const openCreate = useCallback((mode: 'purchase' | 'credit-note' = 'purchase') => {
    guardWriteAccess(
      mode === 'credit-note'
        ? (isDa ? 'Opret købskreditnota' : 'Create purchase credit note')
        : (isDa ? 'Tilføj køb' : 'Add Purchase'),
      () => {
        setCreateMode(mode);
        setCurrentView('create');
        // Only open dialog on mobile (not desktop)
        if (!isDesktop) {
          setIsMobileDialogOpen(true);
        }
      }
    );
  }, [guardWriteAccess, isDa, isDesktop]);

  const handleAddClick = useCallback(() => openCreate('purchase'), [openCreate]);
  const handleAddCreditNoteClick = useCallback(() => openCreate('credit-note'), [openCreate]);

  const tabs = [
    // Posted e-invoices leave the e-inbox (staging area) and appear here,
    // split into regular purchase invoices + purchase credit notes —
    // mirroring the Salg & Faktura page's Salgsfakturaer / Salgs-kreditnota.
    // Count badges match the Salg & Faktura tab display.
    { id: 'kobs-fakturaer' as const, labelDa: 'Købsfakturaer', labelEn: 'Purchase invoices', icon: FileText, count: postedRegularInvoices.length },
    { id: 'kobs-kreditnota' as const, labelDa: 'Købs-kreditnota', labelEn: 'Purchase credit notes', icon: FileMinus, count: postedCreditNotes.length },
    { id: 'einvoice' as const, labelDa: 'E-faktura Indbakke', labelEn: 'E-Invoice Inbox', icon: Inbox, count: receivedInvoices.filter((ri) => ri.status !== 'POSTED').length },
  ];

  // ── Full-page create form (desktop) ──
  const renderCreatePage = () => (
    <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
      <PageHeader
        title={createMode === 'credit-note'
          ? (isDa ? 'Opret købskreditnota' : 'Create Purchase Credit Note')
          : (isDa ? 'Tilføj køb' : 'Add Purchase')}
        description={createMode === 'credit-note'
          ? (isDa ? 'Registrer en kreditnota modtaget fra en leverandør' : 'Record a credit note received from a supplier')
          : (isDa
            ? 'Vælg en omkostningskonto og bogfør købet i dobbelt-posteringsregnskabet'
            : 'Select an expense account and record the purchase in the double-entry ledger')}
        action={
          <Button variant="outline" onClick={handleCancel} className="bg-gray-200 hover:bg-gray-300 text-gray-700 border border-gray-300 lg:bg-white/10 lg:hover:bg-white/20 lg:text-white lg:border-white/20 gap-2">
            {t('cancel')}
          </Button>
        }
      />
      <div>
        <AddTransactionForm
          layout="cards"
          mode={createMode}
          onSuccess={handleSuccess}
          preloadedReceiptFile={preloadedFile}
          onPreloadedFileConsumed={handlePreloadedFileConsumed}
        />
      </div>
    </div>
  );

  // ── Mobile Dialog create form ──
  const renderMobileDialog = () => (
    <Dialog open={isMobileDialogOpen && currentView === 'create'} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="max-w-md max-h-[90vh] overflow-y-auto dialog-bg-translucent backdrop-blur-md lg:backdrop-blur-none"
        onPointerDownOutside={handlePointerDownOutside}
      >
        <DialogHeader>
          <DialogTitle className="dark:text-white flex items-center gap-2">
            {createMode === 'credit-note'
              ? <FileMinus className="h-5 w-5 text-amber-500" />
              : <Plus className="h-5 w-5 text-[#2dd4bf]" />}
            {createMode === 'credit-note'
              ? (isDa ? 'Opret købskreditnota' : 'Create Purchase Credit Note')
              : (isDa ? 'Tilføj køb' : 'Add Purchase')}
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">{createMode === 'credit-note'
            ? (isDa ? 'Registrer en kreditnota modtaget fra en leverandør' : 'Record a credit note received from a supplier')
            : (isDa
              ? 'Vælg en omkostningskonto og bogfør købet i dobbelt-posteringsregnskabet'
              : 'Select an expense account and record the purchase in the double-entry ledger')}
          </DialogDescription>
        </DialogHeader>
        <AddTransactionForm
          mode={createMode}
          onSuccess={handleSuccess}
          preloadedReceiptFile={preloadedFile}
          onPreloadedFileConsumed={handlePreloadedFileConsumed}
        />
      </DialogContent>
    </Dialog>
  );

  // ── Create view: desktop full page, mobile dialog ──
  // CRITICAL: only render the form instance that matches the current viewport.
  // Previously BOTH the desktop cards form AND the mobile dialog form mounted
  // simultaneously (desktop was hidden via CSS but still mounted). Both shared
  // the same preloadedReceiptFile prop — the desktop form consumed it first
  // (clearing it to null), so the mobile dialog form never received the file.
  // Now we gate rendering on isDesktop so only ONE AddTransactionForm exists.
  if (currentView === 'create') {
    if (isDesktop) {
      // Desktop: full page only
      return renderCreatePage();
    }
    // Mobile: dialog (list still renders behind it)
    return (
      <>
        {renderListContent()}
        {renderMobileDialog()}
      </>
    );
  }

  // ── List view ──
  return renderListContent();

  function renderListContent() {
    return (
      <div className="space-y-0">
        <div className="p-3 lg:p-6 pb-0">
          <PageHeader
            title={isDa ? 'Køb & Kvittering' : 'Purchases & Receipts'}
            description={isDa
              ? 'Registrer køb, vedhæft kvitteringer og modtag e-fakturaer'
              : 'Record purchases, attach receipts and receive e-invoices'}
            action={(
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleAddClick}
                  className="bg-[#0d9488] hover:bg-[#0f766e] text-white border border-[#0d9488] gap-2 lg:bg-white/20 lg:hover:bg-white/30 lg:border-white/30 lg:backdrop-blur-sm text-sm font-medium transition-all"
                >
                  <Plus className="h-4 w-4" />
                  {isDa ? 'Tilføj køb' : 'Add Purchase'}
                </Button>
                <Button
                  onClick={handleAddCreditNoteClick}
                  className="bg-transparent text-[#0d9488] border border-[#0d9488]/40 hover:bg-[#0d9488] hover:text-white dark:text-[#2dd4bf] dark:border-[#2dd4bf]/40 dark:hover:bg-[#2dd4bf] dark:hover:text-[#0d9488] lg:text-white lg:border-white/40 lg:hover:bg-white/20 gap-2 text-sm font-medium transition-all"
                >
                  <FileMinus className="h-4 w-4" />
                  {isDa ? 'Opret købskreditnota' : 'Create Purchase Credit Note'}
                </Button>
              </div>
            )}
          />
        </div>

        {/* Tab bar — with count badges matching the Salg & Faktura tab display.
            Placed ABOVE the stats cards (same order as Salg & Faktura). */}
        <div className="px-4 lg:px-8">
          <div className="flex items-center gap-1 border-b border-[#e2e8e6] dark:border-[#2a3330]">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-150 -mb-px',
                    isActive
                      ? 'border-[#0d9488] text-[#0d9488] dark:border-[#2dd4bf] dark:text-[#2dd4bf]'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {isDa ? tab.labelDa : tab.labelEn}
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full tabular-nums',
                    isActive
                      ? 'bg-[#0d9488]/10 text-[#0d9488] dark:bg-[#2dd4bf]/10 dark:text-[#2dd4bf]'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                  )}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Stats cards (matching Salg & Faktura layout) ── */}
        {receivedInvoices.length > 0 && (
          <div className="p-3 lg:p-6 pt-3">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <StatsCard
                icon={Wallet}
                label={isDa ? 'Uafregnet' : 'Outstanding'}
                value={purchaseStats.outstanding}
                variant="primary"
                badge={isDa ? 'inkl. moms' : 'incl. VAT'}
                formatAsCurrency
              />
              <StatsCard
                icon={AlertTriangle}
                label={isDa ? 'Forfaldent beløb' : 'Overdue amount'}
                value={purchaseStats.overdue}
                variant="red"
                badge={purchaseStats.overdueCount > 0 ? `${purchaseStats.overdueCount} ${isDa ? 'faktura(er)' : 'invoice(s)'}` : undefined}
                formatAsCurrency
              />
              <StatsCard
                icon={CheckCircle2}
                label={isDa ? 'Afregnet denne måned' : 'Settled this month'}
                value={purchaseStats.settledThisMonthCount}
                variant="green"
                formatAsCurrency={false}
                badge={isDa ? 'bogført' : 'posted'}
              />
              <StatsCard
                icon={FileSpreadsheet}
                label={isDa ? 'Kladder' : 'Pending'}
                value={purchaseStats.pendingCount}
                variant="blue"
                formatAsCurrency={false}
                badge={purchaseStats.pendingCount > 0 ? (isDa ? 'Til godkendelse' : 'Pending review') : undefined}
              />
            </div>
          </div>
        )}

        {/* Tab content */}
        <div className="mt-4">
          {activeTab === 'kobs-kreditnota' ? (
            <PostedEInvoicesList invoices={postedCreditNotes} />
          ) : activeTab === 'einvoice' ? (
            <EInvoiceInbox user={user} />
          ) : (
            <PostedEInvoicesList invoices={postedRegularInvoices} />
          )}
        </div>
      </div>
    );
  }
}
