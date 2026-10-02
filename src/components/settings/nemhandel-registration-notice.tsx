'use client';

/**
 * NemHandelRegistrationNotice
 *
 * Dismissible in-app banner that informs the customer about the possibility
 * of being enrolled in the NemHandelsregisteret (NemHandel Register).
 *
 * Erhvervsstyrelsen compliance:
 *   Bilag 2, Row 47 (Krav 8) — the system MUST notify customers about the
 *     possibility of being registered in NemHandelsregisteret.
 *   Bilag 2, Row 48 (Krav 9) — the system MUST at setup, or via direct
 *     message, be able to show information about and enrollment
 *     functionality for the NemHandelsregisteret.
 *
 * Visibility rules:
 *   - Shown only for companies where `einvoiceEnabled === false`
 *     (i.e. they have not yet enabled e-invoicing / NemHandel enrollment).
 *   - Dismissible per-company via localStorage key
 *     `nemhandel-notice-dismissed-{companyId}`. Re-enabling e-invoicing and
 *     then disabling it again will resurface the banner because the
 *     dismissal is reset when e-invoice is enabled.
 *
 * Placement:
 *   Mounted by the e-invoice settings page (`EInvoiceSettingsPage`) and
 *   optionally on the dashboard.
 */

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/use-translation';
import { X, Mail, ArrowRight, ShieldCheck } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

interface NemHandelRegistrationNoticeProps {
  /** Active company ID — used to scope the dismissal to this tenant. */
  companyId: string | null | undefined;
  /** When `true`, the banner is hidden (NemHandel already enabled). */
  einvoiceEnabled?: boolean;
  /** Optional navigation callback fired when the user clicks the CTA. */
  onNavigate?: (view: string) => void;
  /** Extra Tailwind classes for outer wrapper. */
  className?: string;
}

// ── Helpers ────────────────────────────────────────────────────────

function dismissalKey(companyId: string): string {
  return `nemhandel-notice-dismissed-${companyId}`;
}

function isDismissed(companyId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(dismissalKey(companyId)) === '1';
  } catch {
    // localStorage may be unavailable (private mode, quota, etc.)
    return false;
  }
}

function persistDismissal(companyId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(dismissalKey(companyId), '1');
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

export function NemHandelRegistrationNotice({
  companyId,
  einvoiceEnabled = false,
  onNavigate,
  className,
}: NemHandelRegistrationNoticeProps) {
  const { language } = useTranslation();
  const [dismissed, setDismissed] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState<boolean>(false);

  // Read dismissal state from localStorage on mount. The effect runs once
  // for a given companyId; whenever companyId changes, we re-read.
  useEffect(() => {
    if (!companyId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate one-time hydration sync from localStorage (SSR-safe external state)
      setDismissed(false);
      setHydrated(true);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate one-time hydration sync from localStorage (SSR-safe external state)
    setDismissed(isDismissed(companyId));
    setHydrated(true);
  }, [companyId]);

  // If the company enables e-invoice, clear any prior dismissal so the
  // banner will resurface correctly if they later disable it again. This
  // mirrors the requirement that the banner only show for companies
  // WITHOUT e-invoicing enabled.
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

  // Hide when:
  //   - company ID is missing
  //   - e-invoicing is already enabled (Krav 9 already fulfilled)
  //   - dismissal is in effect for this company
  //   - before hydration to avoid SSR/CSR mismatch flicker
  if (!hydrated) return null;
  if (!companyId) return null;
  if (einvoiceEnabled) return null;
  if (dismissed) return null;

  const isDa = language === 'da';

  const title = isDa
    ? 'AlphaFlow er registreret som digitalt bogføringssystem'
    : 'AlphaFlow is a registered digital bookkeeping system';

  const body = isDa
    ? 'Du kan nu tilmelde din virksomhed NemHandelsregisteret og dermed modtage og afsende elektroniske fakturaer via NemHandel og Peppol. Tilmelding er frivillig og kræver dit samtykke.'
    : 'You can now enroll your business in the NemHandel Register to receive and send electronic invoices via NemHandel and Peppol. Enrollment is voluntary and requires your consent.';

  const cta = isDa
    ? 'Gå til e-faktura-indstillinger'
    : 'Go to e-invoice settings';

  const dismissLabel = isDa ? 'Skjul meddelelse' : 'Dismiss notice';

  const legalTag = isDa
    ? 'Erhvervsstyrelsen — Bilag 2, punkt 8 & 9'
    : 'Danish Business Authority — Bilag 2, items 8 & 9';

  return (
    <Card
      role="region"
      aria-label={title}
      className={`border-teal-200 bg-teal-50/60 dark:border-teal-900 dark:bg-teal-950/30 ${className ?? ''}`}
    >
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4 pt-2">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-200"
            aria-hidden="true"
          >
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-teal-900 dark:text-teal-100 leading-tight">
                {title}
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-teal-700 dark:bg-teal-900 dark:text-teal-200">
                <Mail className="h-3 w-3" aria-hidden="true" />
                {legalTag}
              </span>
            </div>
            <p className="text-sm text-teal-800/90 dark:text-teal-100/80 leading-relaxed">
              {body}
            </p>
            <div className="pt-1">
              <Button
                type="button"
                size="sm"
                onClick={handleNavigate}
                className="bg-teal-700 text-white hover:bg-teal-800 focus-visible:ring-teal-500"
              >
                {cta}
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
        <div className="flex sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            aria-label={dismissLabel}
            title={dismissLabel}
            className="text-teal-700 hover:bg-teal-100 hover:text-teal-900 dark:text-teal-200 dark:hover:bg-teal-900 dark:hover:text-teal-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{dismissLabel}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
