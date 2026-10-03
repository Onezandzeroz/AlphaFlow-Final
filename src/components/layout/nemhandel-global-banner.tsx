'use client';

/**
 * NemHandelGlobalBanner
 *
 * Floating, semi-transparent in-app banner shown at the top of the entire
 * authenticated platform (excluding marketing pages — those use
 * MarketingShell, not AppLayout where this is mounted).
 *
 * Erhvervsstyrelsen compliance (Bilag 2, krav 8 + 9):
 *   The digital bookkeeping system MUST notify customers about the
 *   possibility of being enrolled in NemHandelsregisteret, and provide
 *   enrollment functionality.
 *
 * Visibility rules:
 *   - Always rendered inside <main> of AppLayout, so it appears on every
 *     authenticated view (dashboard, transactions, invoices, settings, etc.).
 *   - Self-contained: fetches its own einvoiceEnabled state from
 *     /api/company/einvoice-settings on mount + whenever the active company
 *     changes.
 *   - Hidden when einvoiceEnabled === true (registration already fulfilled).
 *   - Hidden during the 30-day dismissal cooldown after the user clicks the
 *     dismiss (X) button — UNLESS `forceVisible` is true.
 *   - `forceVisible={true}` overrides the dismissal cooldown. Used on the
 *     e-faktura settings page (currentView === 'settings-edelivery') so the
 *     banner ALWAYS appears there, regardless of dismissal.
 *
 * Styling:
 *   - Sticky at the top of <main> (below the mobile top bar via pt-16, right
 *     of the desktop sidebar via lg:pl-[260px]).
 *   - Semi-transparent teal background with backdrop blur, so it visually
 *     floats above the page content without obscuring it.
 *   - Smooth height transition when shown/hidden.
 */

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/use-translation';
import { X, Mail, ArrowRight, ShieldCheck } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

interface NemHandelGlobalBannerProps {
  /** Active company ID — used to scope the dismissal to this tenant. */
  companyId: string | null | undefined;
  /**
   * When `true`, the banner overrides the 30-day dismissal cooldown and is
   * ALWAYS shown (provided einvoiceEnabled is false). Used on the
   * settings-edelivery view.
   */
  forceVisible?: boolean;
  /** Navigation callback fired when the user clicks the CTA. */
  onNavigate?: (view: string) => void;
}

// ── Constants ──────────────────────────────────────────────────────

/** Dismissal cooldown: 30 days in milliseconds. */
const DISMISSAL_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

// ── localStorage helpers (timestamp-based cooldown) ────────────────

function dismissalKey(companyId: string): string {
  return `nemhandel-notice-dismissed-${companyId}`;
}

/**
 * Returns true if the user has dismissed the banner AND the 30-day cooldown
 * has not yet expired. Returns false (re-show) once the cooldown elapses.
 */
function isDismissedWithinCooldown(companyId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(dismissalKey(companyId));
    if (!raw) return false;
    const dismissedAt = Number(raw);
    if (!Number.isFinite(dismissedAt) || dismissedAt <= 0) return false;
    const elapsed = Date.now() - dismissedAt;
    if (elapsed >= DISMISSAL_COOLDOWN_MS) {
      // Cooldown expired — clear the stale entry and re-show the banner.
      window.localStorage.removeItem(dismissalKey(companyId));
      return false;
    }
    return true;
  } catch {
    // localStorage may be unavailable (private mode, quota, etc.)
    return false;
  }
}

function persistDismissal(companyId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(dismissalKey(companyId), String(Date.now()));
  } catch {
    // Silently ignore — banner will simply resurface next session.
  }
}

function clearDismissal(companyId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(dismissalKey(companyId));
  } catch {
    // ignore
  }
}

// ── Component ──────────────────────────────────────────────────────

export function NemHandelGlobalBanner({
  companyId,
  forceVisible = false,
  onNavigate,
}: NemHandelGlobalBannerProps) {
  const { language } = useTranslation();
  const isDa = language === 'da';

  // einvoiceEnabled tri-state: null = loading, true = enabled (hide banner),
  // false = disabled (show banner).
  const [einvoiceEnabled, setEinvoiceEnabled] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState<boolean>(false);

  // Fetch the company's e-invoice status whenever the active company
  // changes. We re-use the existing /api/company/einvoice-settings endpoint
  // to avoid adding a new one.
  useEffect(() => {
    if (!companyId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate guard reset when active company disappears (re-derives banner visibility)
      setEinvoiceEnabled(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/company/einvoice-settings', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { settings?: { enabled?: boolean } };
        if (!cancelled) {
          setEinvoiceEnabled(Boolean(data?.settings?.enabled));
        }
      } catch {
        // ignore — banner will simply not render (no false positives)
        if (!cancelled) setEinvoiceEnabled(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  // Read dismissal state from localStorage on mount + whenever companyId
  // changes.
  useEffect(() => {
    if (!companyId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate one-time hydration sync from localStorage (SSR-safe external state)
      setDismissed(false);
      setHydrated(true);
      return;
    }
    setDismissed(isDismissedWithinCooldown(companyId));
    setHydrated(true);
  }, [companyId]);

  // If the company enables e-invoice, clear any prior dismissal so the
  // banner will resurface correctly if they later disable it again.
  useEffect(() => {
    if (einvoiceEnabled && companyId) {
      clearDismissal(companyId);
    }
  }, [einvoiceEnabled, companyId]);

  const handleDismiss = useCallback(() => {
    if (!companyId) return;
    persistDismissal(companyId);
    setDismissed(true);
  }, [companyId]);

  const handleNavigate = useCallback(() => {
    if (onNavigate) {
      onNavigate('settings-edelivery');
    } else if (typeof window !== 'undefined') {
      // Fallback: change the URL hash so the SPA router can pick it up.
      window.location.hash = 'settings-edelivery';
    }
  }, [onNavigate]);

  // Visibility decision:
  //   - Before hydration: hide (avoids SSR/CSR mismatch flicker)
  //   - No company: hide
  //   - e-invoice already enabled: hide (registration fulfilled)
  //   - Dismissed within cooldown AND not forced: hide
  //   - forceVisible overrides the dismissal cooldown (e.g. on settings-edelivery)
  const visible =
    hydrated &&
    !!companyId &&
    einvoiceEnabled === false &&
    (!dismissed || forceVisible);

  // ── Render ───────────────────────────────────────────────────────

  // Localized strings (kept in one place for readability)
  const title = isDa ? 'Tilmeld NemHandelsregisteret' : 'Enroll in the NemHandel Register';
  const body = isDa
    ? 'AlphaFlow er godkendt som digitalt standardbogføringssystem hos Erhvervsstyrelsen. Din virksomhed kan derfor tilmeldes NemHandelsregisteret og modtage og afsende elektroniske fakturaer via NemHandel og Peppol. Tilmelding er frivillig og kræver dit samtykke.'
    : 'AlphaFlow is approved as a digital standard bookkeeping system with the Danish Business Authority. Your business can therefore be enrolled in the NemHandel Register to receive and send electronic invoices via NemHandel and Peppol. Enrollment is voluntary and requires your consent.';
  const cta = isDa ? 'Gå til e-faktura-indstillinger' : 'Go to e-invoice settings';
  const dismissLabel = isDa ? 'Skjul meddelelse (vises igen om 30 dage)' : 'Dismiss notice (shown again in 30 days)';
  const legalTag = isDa ? 'Erhvervsstyrelsen — registreringskrav' : 'Danish Business Authority — registration requirement';

  return (
    <div
      aria-live="polite"
      className={
        // Container reserves no space when hidden. When visible, sticky
        // at the top of <main> so it remains visible during scroll.
        visible
          ? 'sticky top-0 z-30 w-full'
          : 'hidden'
      }
    >
      {visible && (
        <div
          role="region"
          aria-label={title}
          className={
            // Semi-transparent teal background + backdrop blur so the banner
            // visually floats above page content without obscuring it.
            'relative w-full border-b border-teal-200/70 dark:border-teal-800/70 ' +
            'bg-teal-50/85 dark:bg-teal-950/80 backdrop-blur-md shadow-sm ' +
            'animate-in fade-in slide-in-from-top-2 duration-200'
          }
        >
          <div className="mx-auto w-full max-w-[1400px] px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="flex items-start gap-3 sm:gap-4">
              {/* Icon */}
              <div
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100/90 text-teal-700 dark:bg-teal-900/90 dark:text-teal-200"
                aria-hidden="true"
              >
                <ShieldCheck className="h-4 w-4" />
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-teal-900 dark:text-teal-100 leading-tight">
                    {title}
                  </h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-teal-100/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-teal-700 dark:bg-teal-900/80 dark:text-teal-200">
                    <Mail className="h-3 w-3" aria-hidden="true" />
                    {legalTag}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-teal-800/90 dark:text-teal-100/80 leading-relaxed">
                  {body}
                </p>
                <div className="pt-1">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleNavigate}
                    className="bg-teal-700 text-white hover:bg-teal-800 focus-visible:ring-teal-500 h-8 px-3 text-xs"
                  >
                    {cta}
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              {/* Dismiss button */}
              <div className="flex shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDismiss}
                  aria-label={dismissLabel}
                  title={dismissLabel}
                  className="h-8 w-8 p-0 text-teal-700 hover:bg-teal-100/80 hover:text-teal-900 dark:text-teal-200 dark:hover:bg-teal-900/80 dark:hover:text-teal-100"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">{dismissLabel}</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
