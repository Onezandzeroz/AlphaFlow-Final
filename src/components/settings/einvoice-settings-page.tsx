'use client';

import { useTranslation } from '@/lib/use-translation';
import { User } from '@/lib/auth-store';
import { PageHeader } from '@/components/shared/page-header';
import { EInvoiceSettings } from '@/components/settings/einvoice-settings';


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
 * NOTE: The NemHandelRegistrationNotice banner is now mounted GLOBALLY in
 * AppLayout (see src/components/layout/nemhandel-global-banner.tsx) so it
 * appears at the top of every authenticated view. The
 * `forceVisible={currentView === 'settings-edelivery'}` prop ensures the
 * banner ALWAYS shows on this page (overriding the 30-day dismissal
 * cooldown) — so the user is always reminded of the enrollment option
 * while actively configuring e-invoice settings.
 */
export function EInvoiceSettingsPage({ user }: EInvoiceSettingsPageProps) {
  const { language } = useTranslation();

  return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader
        title={language === 'da' ? 'eLevering / eFaktura' : 'eDelivery / e-Invoice'}
        description={language === 'da'
          ? 'Konfigurer afsendelse af e-fakturaer via NemHandel og Peppol'
          : 'Configure e-invoice sending via NemHandel and Peppol'}
        action={null}
      />

      <EInvoiceSettings user={user} />
    </div>
  );
}
