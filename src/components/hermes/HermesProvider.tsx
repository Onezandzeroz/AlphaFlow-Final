'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { useDataVersion } from '@/hooks/use-data-version';
import { HermesOverlay } from './HermesOverlay';
import { HermesEnabledProvider } from './hermes-context';

export function HermesProvider({ children }: { children?: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const [hermesEnabled, setHermesEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Subscribe to the 'hermes-config' data-sync scope. When Hermes is toggled
  // (by this user, another admin, or a background process) the server
  // broadcasts a data-changed event that bumps this version, triggering an
  // immediate re-fetch — no manual page refresh and no 60s polling.
  const hermesConfigVersion = useDataVersion('hermes-config');

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/hermes/config');
      if (res.ok) {
        const data = await res.json();
        setHermesEnabled(data.hermesConfig?.enabled ?? false);
      }
    } catch {
      // Silently fail — Hermes won't show
      setHermesEnabled(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.activeCompanyId) {
      setHermesEnabled(false);
      setIsLoading(false);
      return;
    }
    fetchConfig();
    // Re-fetch whenever the company changes OR a hermes-config data-changed
    // event arrives (via hermesConfigVersion).
  }, [user?.activeCompanyId, hermesConfigVersion, fetchConfig]);

  // Always wrap children in the context provider so PageHeader/AppLayout
  // can react to the Hermes enabled state even before the fetch completes.
  return (
    <HermesEnabledProvider enabled={!isLoading && hermesEnabled && !!user?.activeCompanyId}>
      {children}
      {!isLoading && hermesEnabled && user?.activeCompanyId && (
        <HermesOverlay
          tenantId={user.activeCompanyId}
          userId={user.id}
          userName={user.businessName || user.email || 'Bruger'}
          servicePort={3004}
        />
      )}
    </HermesEnabledProvider>
  );
}
