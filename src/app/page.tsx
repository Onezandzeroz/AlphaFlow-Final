'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useAuthStore, User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { toast } from 'sonner';
import { isViewBlockedInProjectMode } from '@/lib/project-mode-visibility';
import { LoginForm } from '@/components/auth/login-form';
import { RegisterForm } from '@/components/auth/register-form';
import { VerifyEmailScreen } from '@/components/auth/verify-email-screen';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { useHydrated } from '@/lib/use-hydrated';
import { AppLayout } from '@/components/layout/app-layout';
import { PwaInstallBanner, PostInstallCameraPrompt } from '@/components/pwa/pwa-register';
import { MobileInstallPrompt } from '@/components/pwa/mobile-install-prompt';
import { Dashboard } from '@/components/dashboard/dashboard';
import { TransactionsPage } from '@/components/transactions/transactions-page';
import { ExportsPage } from '@/components/exports/exports-page';
import { InvoicesPage } from '@/components/invoices/invoices-page';
import { BackupPage } from '@/components/backup/backup-page';
import { AuditLogPage } from '@/components/audit-log/audit-log-page';
import { ChartOfAccountsPage } from '@/components/chart-of-accounts/chart-of-accounts-page';
import { JournalEntriesPage } from '@/components/journal/journal-entries-page';
import { ContactsPage } from '@/components/contacts/contacts-page';
import { FiscalPeriodsPage } from '@/components/fiscal-periods/fiscal-periods-page';
import { LedgerPage } from '@/components/ledger/ledger-page';
import { ReportsPage } from '@/components/reports/reports-page';
import { BankReconciliationPage } from '@/components/bank-reconciliation/bank-reconciliation-page';
import { AgingReportsPage } from '@/components/aging-reports/aging-reports-page';
import { CashFlowPage } from '@/components/cash-flow/cash-flow-page';
import { RecurringEntriesPage } from '@/components/recurring-entries/recurring-entries-page';
import { PosteringerPage } from '@/components/transactions/posteringer-page';
import { BudgetPage } from '@/components/budget/budget-page';
import { CompanySettingsPage } from '@/components/settings/company-settings-page';
import { SettingsPage } from '@/components/settings/settings-page';
import { EInvoiceSettingsPage } from '@/components/settings/einvoice-settings-page';
import { useScannerStore } from '@/lib/scanner-store';
import { useWriteAccessGuard } from '@/hooks/use-write-access-guard';
import { useSwipeNavigation } from '@/lib/use-swipe-navigation';
import { SwipeViewContainer } from '@/components/swipe-view-container';
import { ReceiptScanner } from '@/components/scanner/ReceiptScanner';
import { TermsOfServicePage } from '@/components/legal/terms-of-service';
import { AnnualReportPage } from '@/components/annual-report/annual-report-page';
import { ProjectsPage } from '@/components/projects/projects-page';
import { HermesOversightPage } from '@/components/hermes/hermes-oversight-page';

type View = 'dashboard' | 'transactions' | 'exports' | 'invoices' | 'backups' | 'audit-log' | 'accounts' | 'journal' | 'contacts' | 'periods' | 'ledger' | 'reports' | 'bank-recon' | 'aging' | 'cash-flow' | 'recurring' | 'budget' | 'projects' | 'settings' | 'settings-company' | 'settings-edelivery' | 'annual-report' | 'hermes-oversight';

const VALID_VIEWS: View[] = ['dashboard', 'transactions', 'exports', 'invoices', 'backups', 'audit-log', 'accounts', 'journal', 'contacts', 'periods', 'ledger', 'reports', 'bank-recon', 'aging', 'cash-flow', 'recurring', 'budget', 'projects', 'settings', 'settings-company', 'settings-edelivery', 'annual-report', 'hermes-oversight'];

// ─── SEO: Dynamic document.title per view ─────────────────────────
const VIEW_TITLES_DA: Record<View, string> = {
  'dashboard': 'Dashboard — Kontrolpanel',
  'transactions': 'Posteringer — Bogføring',
  'exports': 'Eksport — SAF-T, CSV & OIOUBL',
  'invoices': 'Fakturaer — E-faktura & Peppol',
  'backups': 'Sikkerhedskopier — Backup & Gendannelse',
  'audit-log': 'Revisionslog — Uforanderlig Audit Trail',
  'accounts': 'Kontoplan — FSR Standard Konti',
  'journal': 'Finansjournal — Hovedbogsposter',
  'contacts': 'Kontakter — Kunder & Leverandører',
  'periods': 'Regnskabsperioder — År & Periode',
  'ledger': 'Hovedbog — Finansrapport',
  'reports': 'Rapporter — Årsafslutning & Finans',
  'bank-recon': 'Bankafstemning — Open Banking',
  'aging': 'Aldersopdelt Rapport — Debitor/Creditor',
  'cash-flow': 'Pengestrømsanalyse — Likviditet',
  'recurring': 'Tilbagevendende Posteringer',
  'budget': 'Budget — Budgetstyring & Afvigelse',
  'projects': 'Projekter — Projektregnskab',
  'settings': 'Indstillinger — Bruger & Sikkerhed',
  'settings-company': 'Virksomhedsindstillinger',
  'settings-edelivery': 'E-faktura Indstillinger — Peppol & Nemhandel',
  'annual-report': 'Årsafslutning — Resultatopgørelse & Balance',
  'hermes-oversight': 'Hermes AI — Oversigt & Konfiguration',
};

const VIEW_TITLES_EN: Record<View, string> = {
  'dashboard': 'Dashboard — Control Panel',
  'transactions': 'Transactions — Bookkeeping',
  'exports': 'Export — SAF-T, CSV & OIOUBL',
  'invoices': 'Invoices — E-invoicing & Peppol',
  'backups': 'Backups — Backup & Restore',
  'audit-log': 'Audit Log — Immutable Audit Trail',
  'accounts': 'Chart of Accounts — FSR Standard',
  'journal': 'Journal Entries — General Ledger',
  'contacts': 'Contacts — Customers & Vendors',
  'periods': 'Fiscal Periods — Year & Period',
  'ledger': 'General Ledger — Financial Report',
  'reports': 'Reports — Year-End & Financial',
  'bank-recon': 'Bank Reconciliation — Open Banking',
  'aging': 'Aging Report — Accounts Receivable/Payable',
  'cash-flow': 'Cash Flow Analysis — Liquidity',
  'recurring': 'Recurring Entries',
  'budget': 'Budget — Budget Management & Variance',
  'projects': 'Projects — Project Accounting',
  'settings': 'Settings — User & Security',
  'settings-company': 'Company Settings',
  'settings-edelivery': 'E-invoicing Settings — Peppol & Nemhandel',
  'annual-report': 'Annual Report — Income Statement & Balance Sheet',
  'hermes-oversight': 'Hermes AI — Oversight & Configuration',
};

// Get initial view from URL pathname (e.g. /transactions, /settings?tab=access)
function getInitialView(): View {
  if (typeof window === 'undefined') return 'dashboard';
  const path = window.location.pathname.replace(/^\/+/, '');
  const view = path as View;
  return view && VALID_VIEWS.includes(view) ? view : 'dashboard';
}

// Build full URL for a view (preserves query params like ?tab=access)
function viewToPath(view: View, search?: string): string {
  const base = view === 'dashboard' ? '/' : `/${view}`;
  return search ? `${base}${search}` : base;
}

export default function Home() {
  const { user, setUser, isLoading, checkAuth } = useAuthStore();
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [currentView, setCurrentView] = useState<View>(getInitialView);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [onboardingStepJustDone, setOnboardingStepJustDone] = useState(0);
  const [pendingCreateAction, setPendingCreateAction] = useState<'create-invoice' | 'create-contact' | null>(null);
  const hydrated = useHydrated();
  const hasCheckedAuth = useRef(false);
  const { t, language } = useTranslation();

  // Detect ?verify=TOKEN from URL (one-time, client-only)
  const [verifyToken, setVerifyToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const t = params.get('verify');
    if (t) window.history.replaceState({}, '', window.location.pathname);
    return t;
  });

  // Detect ?invite=TOKEN from URL (one-time, client-only)
  const [inviteToken, setInviteToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const t = params.get('invite');
    if (t) window.history.replaceState({}, '', window.location.pathname);
    return t;
  });

  // Detect ?token=TOKEN, ?reset=TOKEN or /reset-password?token=TOKEN from URL (one-time, client-only)
  const [resetPasswordToken, setResetPasswordToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token') || params.get('reset');
    if (t) {
      window.history.replaceState({}, '', window.location.pathname);
      return t;
    }
    return null;
  });
  const resetPathDetectedRef = useRef(false);
  useEffect(() => {
    if (!hydrated || resetPathDetectedRef.current || resetPasswordToken) return;
    resetPathDetectedRef.current = true;
    const path = window.location.pathname.replace(/^\/+/, '');
    if (path === 'reset-password') {
      const params = new URLSearchParams(window.location.search);
      const t = params.get('token');
      if (t) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate one-time hydration sync from URL pathname
        setResetPasswordToken(t);
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [hydrated, resetPasswordToken]);

  // Detect /terms path for public Terms of Service page (no auth required)
  const [showTerms, setShowTerms] = useState(false);
  const termsDetectedRef = useRef(false);
  useEffect(() => {
    if (!hydrated || termsDetectedRef.current) return;
    termsDetectedRef.current = true;
    const path = window.location.pathname.replace(/^\/+/, '');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate one-time hydration sync from URL pathname
    if (path === 'terms') setShowTerms(true);
  }, [hydrated]);

  // Check auth status once after hydration
  useEffect(() => {
    if (!hydrated || hasCheckedAuth.current) return;
    hasCheckedAuth.current = true;
    // Skip auth check when showing verify or reset screen — but clear loading flag
    if (verifyToken || resetPasswordToken) {
      useAuthStore.getState().setLoading(false);
      return;
    }
    checkAuth();
  }, [hydrated, checkAuth, verifyToken, resetPasswordToken]);

  // ── Detect ?payment= query param (redirect back from Frisbii) ──
  // When the user returns from a Frisbii payment, the URL contains
  // ?payment=success|failed|pending|cancelled|error. We dispatch an
  // 'auth:refresh' event so the app-layout listener re-fetches
  // /api/auth/me and picks up the new planTier immediately, and show a
  // toast so the user gets visual confirmation.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    if (paymentStatus) {
      // Clean the URL (remove the ?payment= param)
      window.history.replaceState({}, '', window.location.pathname);
      // Trigger auth refresh so the new plan tier is loaded
      window.dispatchEvent(new CustomEvent('auth:refresh'));
      // Also trigger access refresh so the access-settings UI updates
      window.dispatchEvent(new CustomEvent('access:refresh'));

      // Show a toast based on the payment status
      const isDa = language === 'da';
      switch (paymentStatus) {
        case 'success':
          toast.success(
            isDa ? 'Betaling gennemført!' : 'Payment successful!',
            {
              description: isDa
                ? 'Dit abonnement er nu aktiveret.'
                : 'Your subscription is now active.',
            }
          );
          break;
        case 'pending':
          toast(
            isDa ? 'Betaling behandles…' : 'Payment processing…',
            {
              description: isDa
                ? 'Vi aktiverer dit abonnement så snart betalingen er bekræftet.'
                : 'We will activate your subscription as soon as the payment is confirmed.',
            }
          );
          break;
        case 'failed':
          toast.error(
            isDa ? 'Betaling mislykkedes' : 'Payment failed',
            {
              description: isDa
                ? 'Der opstod en fejl. Prøv igen senere.'
                : 'An error occurred. Please try again later.',
            }
          );
          break;
        case 'cancelled':
          toast(
            isDa ? 'Betaling annulleret' : 'Payment cancelled',
            {
              description: isDa
                ? 'Du har annulleret betalingen.'
                : 'You cancelled the payment.',
            }
          );
          break;
        case 'error':
          toast.error(
            isDa ? 'Fejl' : 'Error',
            {
              description: isDa
                ? 'Der opstod en uventet fejl. Kontakt support hvis problemet fortsætter.'
                : 'An unexpected error occurred. Contact support if the problem persists.',
            }
          );
          break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle ?invite=TOKEN for already-logged-in users:
  // The login route auto-accepts, but if the user is already logged in
  // (e.g. clicked invite link while having a session), accept server-side.
  useEffect(() => {
    if (!inviteToken || !user) return;
    const abort = new AbortController();
    (async () => {
      try {
        await fetch('/api/invitations/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: inviteToken }),
          signal: abort.signal,
        });
      } catch { /* ignore */ }
      setInviteToken(null);
    })();
    return () => abort.abort();
  }, [inviteToken, user]);

  // ─── Browser back/forward button support via History API ───
  const isNavigatingRef = useRef(false);

  const navigateToView = useCallback((view: View, search?: string) => {
    // ── Project Mode click-guard (FASE 4) ──
    // Block navigation to HIDDEN or GRAYED views when the user is in project
    // mode. This catches direct URL entry, keyboard shortcuts, and any other
    // navigation paths that bypass the (already-filtered) sidebar/nav UI.
    // The user sees a toast explaining why and must exit project mode first.
    const currentUser = useAuthStore.getState().user;
    if (currentUser?.isProjectMode && isViewBlockedInProjectMode(view)) {
      const isDa = language === 'da';
      toast.error(
        isDa
          ? 'Denne funktion er begrænset i projekt-tilstand'
          : 'This feature is limited in project mode',
        {
          description: isDa
            ? 'Afslut projekt-tilstand for at få adgang.'
            : 'Exit project mode to access this feature.',
          duration: 4000,
        }
      );
      return;
    }
    isNavigatingRef.current = true;
    setCurrentView(view);
    const url = viewToPath(view, search);
    window.history.pushState({ view }, '', url);
    // Reset flag after microtask so popstate doesn't re-trigger
    requestAnimationFrame(() => {
      isNavigatingRef.current = false;
    });
  }, [language]);

  // Listen for browser back/forward and sync view after hydration
  useEffect(() => {
    if (!hydrated) return;

    const handlePopState = (e: PopStateEvent) => {
      if (isNavigatingRef.current) return;
      const view = (e.state?.view as View) || getInitialView();
      // ── Project Mode guard for browser back/forward ──
      // If the user navigates (via back button) to a view that is blocked
      // in project mode, redirect them to the dashboard instead of showing
      // a blocked page. We can't show a toast here reliably (event timing),
      // but this prevents landing on an inaccessible page.
      const currentUser = useAuthStore.getState().user;
      if (currentUser?.isProjectMode && isViewBlockedInProjectMode(view)) {
        setCurrentView('dashboard');
        return;
      }
      setCurrentView(view);
    };

    window.addEventListener('popstate', handlePopState);

    // Set initial history state with view name
    const currentPath = window.location.pathname + window.location.search;
    window.history.replaceState({ view: currentView }, '', currentPath);

    // One-time sync: during SSR, getInitialView() returns 'dashboard' because window
    // is undefined. React hydration preserves the server state, so we correct the
    // view from the URL pathname here on first client render.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate one-time hydration sync from external URL state
    setCurrentView((prev) => {
      const fromPath = getInitialView();
      return fromPath !== prev ? fromPath : prev;
    });

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [currentView, hydrated]);

  // ─── SEO: Update document.title + meta description when view changes ──
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const titles = language === 'da' ? VIEW_TITLES_DA : VIEW_TITLES_EN;
    const viewTitle = titles[currentView] ?? titles['dashboard'];
    document.title = `${viewTitle} · AlphaFlow Regnskabsprogram`;
    // Update meta description dynamically for JS-aware crawlers
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    const descMap: Record<string, Record<string, string>> = {
      da: {
        dashboard: 'AlphaFlow Dashboard — overblik over økonomi, posteringer, moms, fakturaer og likviditet i ét kontrolpanel.',
        transactions: 'Posteringer i AlphaFlow — dobbelt bogføring med automatisk moms, kategorisering og finansjournal.',
        invoices: 'Fakturering i AlphaFlow — opret, send og modtag e-fakturaer via Peppol OIOUBL BIS Billing 3.0.',
        accounts: 'Kontoplan i AlphaFlow — FSR standard kontoplan med 38 konti, momsmapping og automatisk bogføringsforslag.',
        reports: 'Regnskabsrapporter i AlphaFlow — resultatopgørelse, balance, pengestrøm, SAF-T eksport og årsafslutning.',
        'bank-recon': 'Bankafstemning i AlphaFlow — Open Banking integration med automatisk match af posteringer.',
        budget: 'Budgetstyring i AlphaFlow — opret budgetter med afvigelsesanalyse og sammenligning mod faktiske tal.',
        projects: 'Projektregnskab i AlphaFlow — under-budgets, projekt-rapporter og løbende avance/tab.',
        settings: 'Indstillinger i AlphaFlow — brugerprofil, sikkerhed, 2FA, team-adgang og virksomhedsopsætning.',
      },
      en: {
        dashboard: 'AlphaFlow Dashboard — overview of finances, transactions, VAT, invoices and liquidity.',
        transactions: 'Transactions in AlphaFlow — double-entry bookkeeping with automatic VAT and journal.',
        invoices: 'Invoicing in AlphaFlow — create, send and receive e-invoices via Peppol OIOUBL.',
        accounts: 'Chart of Accounts in AlphaFlow — FSR standard with 38 accounts and VAT mapping.',
        reports: 'Financial Reports in AlphaFlow — income statement, balance sheet, cash flow, SAF-T export.',
        'bank-recon': 'Bank Reconciliation in AlphaFlow — Open Banking with automatic transaction matching.',
        budget: 'Budget Management in AlphaFlow — budgets with variance analysis vs. actuals.',
        projects: 'Project Accounting in AlphaFlow — sub-budgets, project reports and profit/loss tracking.',
        settings: 'Settings in AlphaFlow — user profile, security, 2FA, team access and company setup.',
      },
    };
    const langKey = language === 'da' ? 'da' : 'en';
    const desc = descMap[langKey]?.[currentView];
    if (desc) metaDesc.setAttribute('content', desc);
  }, [currentView, language]);

  // ─── Listen for direct app:navigate events (used by modals/widgets) ───
  useEffect(() => {
    const handleAppNavigate = (e: Event) => {
      const { view, search } = (e as CustomEvent).detail;
      const parsedView = view as View;
      if (parsedView && VALID_VIEWS.includes(parsedView)) {
        isNavigatingRef.current = true;
        setCurrentView(parsedView);
        const url = viewToPath(parsedView, search);
        window.history.replaceState({ view: parsedView }, '', url);
        requestAnimationFrame(() => {
          isNavigatingRef.current = false;
        });
      }
    };
    window.addEventListener('app:navigate', handleAppNavigate);
    return () => window.removeEventListener('app:navigate', handleAppNavigate);
  }, []);

  // ─── Mobile swipe navigation (must be before any early returns) ──
  const { state: swipeState, containerWidth, onSettleComplete, containerRef, handlers: swipeHandlers } =
    useSwipeNavigation({
      currentView,
      onViewChange: navigateToView,
      enabled: true,
    });

  const handleLoginSuccess = useCallback((loggedInUser: User) => {
    setUser(loggedInUser);
  }, [setUser]);

  const handleRegisterSuccess = useCallback((registeredUser: User) => {
    setUser(registeredUser);
  }, [setUser]);

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    navigateToView('dashboard');
  }, [setUser, navigateToView]);

  const handleDeleteAccount = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/delete-account', { method: 'DELETE' });
      if (response.ok) {
        setUser(null);
        navigateToView('dashboard');
      }
    } catch (error) {
      console.error('Failed to delete account:', error);
    }
  }, [setUser, navigateToView]);

  /**
   * FAB "Scan bilag" — opens the standalone scanner.
   * The scanner is rendered via createPortal to document.body (z-9999)
   * so it covers everything, independent of any Dialog or view.
   * When the user captures a receipt, completeScan() stores the result
   * in the zustand store. PosteringerPage subscribes and opens the form.
   */
  const scannerOpen = useScannerStore((s) => s.isOpen);

  // ─── Write access guard: check before any form that leads to a write ───
  const { guardWriteAccess } = useWriteAccessGuard(user);

  const handleOpenScanner = useCallback(() => {
    console.log(`[RECEIPT-FLOW] FAB handleOpenScanner (page-level, owner=null)`);
    guardWriteAccess(t('addTransaction'), () => useScannerStore.getState().openScanner());
  }, [guardWriteAccess, t]);

  const handleStandaloneCapture = useCallback((file: File) => {
    console.log(`[RECEIPT-FLOW] handleStandaloneCapture: file=${file.name} (${file.size} bytes), type=${file.type}`);
    useScannerStore.getState().completeScan(file);
    // Navigate to transactions so PosteringerPage can pick up the scan.
    // If already on transactions, this is a harmless no-op.
    navigateToView('transactions');
  }, [navigateToView]);

  const handleStandaloneDismiss = useCallback(() => {
    console.log(`[RECEIPT-FLOW] handleStandaloneDismiss (scanner dismissed without capture)`);
    useScannerStore.getState().closeScanner();
  }, []);

  const handleCreateInvoice = useCallback(() => {
    guardWriteAccess(t('createInvoice'), () => {
      setPendingCreateAction('create-invoice');
      navigateToView('invoices');
    });
  }, [guardWriteAccess, t, navigateToView]);

  const handleCreateContact = useCallback(() => {
    guardWriteAccess(t('createContact'), () => {
      setPendingCreateAction('create-contact');
      navigateToView('contacts');
    });
  }, [guardWriteAccess, t, navigateToView]);

  const handleShowTerms = useCallback(() => {
    setShowTerms(true);
    window.history.pushState({ view: 'terms' }, '', '/terms');
  }, []);

  const handleHideTerms = useCallback(() => {
    setShowTerms(false);
    window.history.pushState({ view: 'dashboard' }, '', '/');
  }, []);

  // ─── Password reset screen (/reset-password?token=TOKEN) ───
  // IMPORTANT: Check resetPasswordToken BEFORE isLoading to avoid the auth spinner
  // blocking the reset password UI. The reset form has its own loading state.
  if (hydrated && resetPasswordToken && !user) {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-[#f8faf9] light-forced login-mesh">
        <div className="login-shape-3 absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gradient-to-br from-[#0d9488]/[0.04] to-[#7c9a82]/[0.03] rounded-full blur-3xl pointer-events-none" />

        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md flex flex-col items-center mt-[57px] relative z-10">
            {/* Logo */}
            <div className="mb-[46px] -mt-[19px]">
              <Image
                src="/logo-clean.png"
                alt="AlphaFlow"
                width={170}
                height={114}
                className="object-contain login-logo-hover"
                priority
              />
            </div>

            {/* Abstract decorative shapes */}
            <div className="login-shape-1 absolute -top-4 -right-12 w-20 h-20 rounded-xl bg-gradient-to-br from-[#0d9488]/10 to-[#2dd4bf]/5 border border-[#0d9488]/10 rotate-12 pointer-events-none" />
            <div className="login-shape-2 absolute top-16 -left-10 w-16 h-16 rounded-full bg-gradient-to-br from-[#7c9a82]/10 to-[#9bb5a0]/5 border border-[#7c9a82]/10 pointer-events-none" />

            <div className="w-full relative">
              <div className="login-accent-bar" />
              <div className="bg-white/80 backdrop-blur-xl shadow-xl rounded-2xl p-6 border border-white/60 login-card-animated-bg login-card-glow overflow-hidden">
                <ResetPasswordForm
                  token={resetPasswordToken || ''}
                  onBackToLogin={() => {
                    setResetPasswordToken(null);
                    window.history.replaceState({}, '', '/');
                    setAuthMode('login');
                  }}
                />
              </div>
            </div>
          </div>
        </main>

        <footer className="relative z-10 py-6 text-center">
          <div className="sidebar-brand-badge mx-auto mb-2">
            <span>Powered by AlphaAi Consult ApS</span>
          </div>
          <p className="text-[11px] text-gray-400">
            © {new Date().getFullYear()} AlphaFlow {t('accountingApp')}
          </p>
          <div className="mt-2 space-y-0.5">
            <p className="text-[10px] text-gray-400">CVR-nr. 46312058</p>
            <p className="text-[10px] text-gray-400">
              <a href="mailto:alphaaiconsult@gmail.com" className="hover:text-[#0d9488] transition-colors">alphaaiconsult@gmail.com</a>
            </p>
          </div>
          <p className="mt-2">
            <button
              type="button"
              onClick={handleShowTerms}
              className="text-[11px] text-[#0d9488] hover:text-[#0f766e] underline underline-offset-2 decoration-[#0d9488]/30 hover:decoration-[#0d9488]/60 transition-colors cursor-pointer"
            >
              {language === 'da' ? 'Forretningsbetingelser' : 'Terms of Service'}
            </button>
          </p>
        </footer>
      </div>
    );
  }

  // ─── Email verification screen (?verify=TOKEN) ───
  // IMPORTANT: Check verifyToken BEFORE isLoading to avoid the auth spinner
  // blocking the verification UI. The verify screen has its own loading state.
  if (hydrated && verifyToken && !user) {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-[#f8faf9] light-forced login-mesh">
        <div className="login-shape-3 absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gradient-to-br from-[#0d9488]/[0.04] to-[#7c9a82]/[0.03] rounded-full blur-3xl pointer-events-none" />

        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md flex flex-col items-center mt-[57px] relative z-10">
            {/* Logo */}
            <div className="mb-[46px] -mt-[19px]">
              <Image
                src="/logo-clean.png"
                alt="AlphaFlow"
                width={170}
                height={114}
                className="object-contain login-logo-hover"
                priority
              />
            </div>

            <VerifyEmailScreen
              token={verifyToken}
              onGoToLogin={() => { setVerifyToken(null); }}
            />
          </div>
        </main>

        <footer className="relative z-10 py-6 text-center">
          <div className="sidebar-brand-badge mx-auto mb-2">
            <span>Powered by AlphaAi Consult ApS</span>
          </div>
          <p className="text-[11px] text-gray-400">
            © {new Date().getFullYear()} AlphaFlow {t('accountingApp')}
          </p>
          <div className="mt-2 space-y-0.5">
            <p className="text-[10px] text-gray-400">CVR-nr. 46312058</p>
            <p className="text-[10px] text-gray-400">
              <a href="mailto:alphaaiconsult@gmail.com" className="hover:text-[#0d9488] transition-colors">alphaaiconsult@gmail.com</a>
            </p>
          </div>
          <p className="mt-2">
            <button
              type="button"
              onClick={handleShowTerms}
              className="text-[11px] text-[#0d9488] hover:text-[#0f766e] underline underline-offset-2 decoration-[#0d9488]/30 hover:decoration-[#0d9488]/60 transition-colors cursor-pointer"
            >
              {language === 'da' ? 'Forretningsbetingelser' : 'Terms of Service'}
            </button>
          </p>
        </footer>
      </div>
    );
  }

  // ─── Terms of Service page (/terms) — public, no auth required ───
  if (showTerms) {
    return <TermsOfServicePage onBack={handleHideTerms} />;
  }

  if (!hydrated || isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#f8faf9] light-forced">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full animate-spin" style={{ background: 'conic-gradient(from 0deg, #0d9488, #2dd4bf, #0d9488)', animationDuration: '1.5s' }} />
            <div className="absolute inset-1 rounded-full bg-[#f8faf9]" />
          </div>
          <p className="text-gray-500 text-sm">{t('loading')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-[#f8faf9] light-forced login-mesh">
        {/* Third animated gradient blob (centered, slow) */}
        <div className="login-shape-3 absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gradient-to-br from-[#0d9488]/[0.04] to-[#7c9a82]/[0.03] rounded-full blur-3xl pointer-events-none" />

        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md flex flex-col items-center mt-[57px] relative z-10">
            {/* Logo */}
            <div className="mb-[46px] -mt-[19px]">
              <Image
                src="/logo-clean.png"
                alt="AlphaFlow"
                width={170}
                height={114}
                className="object-contain login-logo-hover"
                priority
              />
            </div>

            {/* Abstract decorative shapes */}
            <div className="login-shape-1 absolute -top-4 -right-12 w-20 h-20 rounded-xl bg-gradient-to-br from-[#0d9488]/10 to-[#2dd4bf]/5 border border-[#0d9488]/10 rotate-12 pointer-events-none" />
            <div className="login-shape-2 absolute top-16 -left-10 w-16 h-16 rounded-full bg-gradient-to-br from-[#7c9a82]/10 to-[#9bb5a0]/5 border border-[#7c9a82]/10 pointer-events-none" />
            <div className="login-shape-3 absolute bottom-24 -right-8 w-12 h-12 rounded-lg bg-gradient-to-br from-[#6366f1]/8 to-[#818cf8]/5 border border-[#6366f1]/8 -rotate-6 pointer-events-none" />

            {/* Description */}
            <div className="text-center mb-6">
              <p className="text-gray-500 text-[15px] mt-2">
                {t('intelligentBookkeeping')}
              </p>
            </div>

            {/* Login Card with premium styling */}
            <PwaInstallBanner />
            <MobileInstallPrompt />
            <div className="w-full relative">
              {/* Top accent bar with shimmer */}
              <div className="login-accent-bar" />
              <div className="bg-white/80 backdrop-blur-xl shadow-xl rounded-2xl p-6 border border-white/60 login-card-animated-bg login-card-glow overflow-hidden">
                {authMode === 'login' ? (
                  <LoginForm
                    onSuccess={handleLoginSuccess}
                    onSwitchToRegister={() => setAuthMode('register')}
                  />
                ) : (
                  <RegisterForm
                    onSuccess={handleRegisterSuccess}
                    onSwitchToLogin={() => setAuthMode('login')}
                  />
                )}
              </div>
            </div>

            <p className="text-center text-[11px] text-gray-400/60 mt-3 select-none">
              <kbd className="px-1.5 py-0.5 text-[10px] font-medium text-gray-400/70 bg-gray-100/60 border border-gray-200/50 rounded-md shadow-sm">⌘</kbd>
              {' + '}
              <kbd className="px-1.5 py-0.5 text-[10px] font-medium text-gray-400/70 bg-gray-100/60 border border-gray-200/50 rounded-md shadow-sm">↵</kbd>
            </p>

            <p className="text-center text-xs text-gray-400 mt-8">
              {t('poweredByOCR')}
            </p>
          </div>
        </main>
        <footer className="relative z-10 py-6 text-center">
          <div className="sidebar-brand-badge mx-auto mb-2">
            <span>Powered by AlphaAi Consult ApS</span>
          </div>
          <p className="text-[11px] text-gray-400">
            © {new Date().getFullYear()} AlphaFlow {t('accountingApp')}
          </p>
          <div className="mt-2 space-y-0.5">
            <p className="text-[10px] text-gray-400">CVR-nr. 46312058</p>
            <p className="text-[10px] text-gray-400">
              <a href="mailto:alphaaiconsult@gmail.com" className="hover:text-[#0d9488] transition-colors">alphaaiconsult@gmail.com</a>
            </p>
          </div>
          <p className="mt-2">
            <button
              type="button"
              onClick={handleShowTerms}
              className="text-[11px] text-[#0d9488] hover:text-[#0f766e] underline underline-offset-2 decoration-[#0d9488]/30 hover:decoration-[#0d9488]/60 transition-colors cursor-pointer"
            >
              {language === 'da' ? 'Forretningsbetingelser' : 'Terms of Service'}
            </button>
          </p>
        </footer>
      </div>
    );
  }

  // ─── View renderer (supports an explicit view for swipe previews) ──
  const renderView = (view?: View) => {
    const v = view ?? currentView;
    // isCurrent is true when rendering the active page (not a swipe neighbor preview).
    // SwipeViewContainer calls renderView(currentView) with a defined arg, so we
    // compare against currentView rather than checking for undefined.
    const isCurrent = v === currentView;
    switch (v) {
      case 'transactions':
        return <PosteringerPage user={user} />;
      case 'invoices':
        return (
          <InvoicesPage
            user={user}
            initialView={isCurrent && pendingCreateAction === 'create-invoice' ? 'create' : 'list'}
            onInitialViewConsumed={isCurrent ? () => setPendingCreateAction(null) : undefined}
          />
        );
      case 'exports':
        return <ExportsPage user={user} />;
      case 'backups':
        return <BackupPage user={user} />;
      case 'audit-log':
        return <AuditLogPage user={user} />;
      case 'accounts':
        return <ChartOfAccountsPage user={user} onNavigate={(navView) => { if (isCurrent) setOnboardingStepJustDone(2); navigateToView(navView as View); }} />;
      case 'journal':
        return <JournalEntriesPage user={user} />;
      case 'contacts':
        return (
          <ContactsPage
            user={user}
            autoOpenCreate={isCurrent && pendingCreateAction === 'create-contact'}
            onAutoCreateConsumed={isCurrent ? () => setPendingCreateAction(null) : undefined}
          />
        );
      case 'periods':
        return <FiscalPeriodsPage user={user} />;
      case 'ledger':
        return <LedgerPage user={user} />;
      case 'reports':
        return <ReportsPage user={user} />;
      case 'bank-recon':
        return <BankReconciliationPage user={user} />;
      case 'aging':
        return <AgingReportsPage user={user} />;
      case 'cash-flow':
        return <CashFlowPage user={user} />;
      case 'recurring':
        return <PosteringerPage user={user} defaultTab="recurring" />;
      case 'budget':
        return <BudgetPage user={user} />;
      case 'settings':
        return <SettingsPage user={user} onNavigate={(navView) => navigateToView(navView as View)} />;
      case 'settings-company':
        return <CompanySettingsPage user={user} onNavigate={(navView) => navigateToView(navView as View)} />;
      case 'settings-edelivery':
        return <EInvoiceSettingsPage user={user} onNavigate={(navView) => { if (isCurrent) setOnboardingStepJustDone(3); navigateToView(navView as View); }} />;
      case 'projects':
        return <ProjectsPage user={user} />;
      case 'annual-report':
        return <AnnualReportPage user={user} />;
      case 'hermes-oversight':
        return <HermesOversightPage user={user} />;
      default:
        return <Dashboard user={user} onNavigate={(navView) => navigateToView(navView as View)} onboardingStepJustDone={onboardingStepJustDone} onOnboardingStepDoneConsumed={() => setOnboardingStepJustDone(0)} />;
    }
  };

  return (
    <AppLayout
      user={user}
      currentView={currentView}
      onViewChange={navigateToView}
      onLogout={handleLogout}
      onDeleteAccount={handleDeleteAccount}
      onOpenCommandPalette={() => setCommandPaletteOpen(true)}
      onAddTransaction={handleOpenScanner}
      onCreateInvoice={handleCreateInvoice}
      onCreateContact={handleCreateContact}
    >
      {/* Standalone scanner: rendered at page level, independent of any Dialog.
          The scanner uses createPortal → document.body (z-9999).
          Controlled entirely by the scanner store (isOpen). */}
      {scannerOpen && (
        <ReceiptScanner
          onCapture={handleStandaloneCapture}
          onDismiss={handleStandaloneDismiss}
        />
      )}
      <PostInstallCameraPrompt />
      <SwipeViewContainer
        currentView={currentView}
        state={swipeState}
        containerWidth={containerWidth}
        renderView={renderView}
        onSettleComplete={onSettleComplete}
        containerRef={containerRef}
        handlers={swipeHandlers}
      />
    </AppLayout>
  );
}
