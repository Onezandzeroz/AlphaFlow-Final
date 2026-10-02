'use client';

import { useState, useEffect } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { PageHeader } from '@/components/shared/page-header';
import { EInvoiceSettings } from '@/components/settings/einvoice-settings';
import { NemHandelRegistrationNotice } from '@/components/settings/nemhandel-registration-notice';
import { Skeleton } from '@/components/ui/skeleton';


// ── Types ──────────────────────────────────────────────────────────

interface EInvoiceSettingsPageProps {
  user: User;
  onNavigate?: (view: string) => void;
}

// ── Component ──────────────────────────────────────────────────────────

/**
 * Standalone page wrapper for EInvoiceSettings, used during onboarding
 * as the 'settings-edelivery' view. Provides a PageHeader with back
 * navigation and renders the EInvoiceSettings component.
 *
 * Mounts the NemHandelRegistrationNotice banner above the settings card
 * for companies that have NOT yet enabled e-invoicing (Erhvervsstyrelsen
 * Bilag 2, Row 47/48 compliance).
 */
export function EInvoiceSettingsPage({ user, onNavigate }: EInvoiceSettingsPageProps) {
  const { language } = useTranslation();

  // Lightweight fetch of the company's e-invoice status so the banner can
  // decide whether to render. We re-use the existing e-invoice settings
  // API endpoint to avoid adding a new one.
  const [einvoiceEnabled, setEinvoiceEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user?.activeCompanyId) {
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
  }, [user?.activeCompanyId]);

  return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader
        title={language === 'da' ? 'eLevering / eFaktura' : 'eDelivery / e-Invoice'}
        description={language === 'da'
          ? 'Konfigurer afsendelse af e-fakturaer via NemHandel og Peppol'
          : 'Configure e-invoice sending via NemHandel and Peppol'}
        action={null}
      />

      {/* Erhvervsstyrelsen compliance banner — only shows when e-invoice is NOT enabled */}
      {einvoiceEnabled === null ? (
        <Skeleton className="h-24 w-full rounded-xl" aria-hidden="true" />
      ) : (
        <NemHandelRegistrationNotice
          companyId={user.activeCompanyId}
          einvoiceEnabled={einvoiceEnabled}
          onNavigate={onNavigate}
        />
      )}

      <EInvoiceSettings user={user} />
    </div>
  );
}
