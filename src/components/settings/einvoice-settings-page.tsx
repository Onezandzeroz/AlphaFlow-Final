'use client';

import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
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
 */
export function EInvoiceSettingsPage({ user, onNavigate }: EInvoiceSettingsPageProps) {
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
