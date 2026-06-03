'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { HermesOverlay } from './HermesOverlay';

export function HermesProvider() {
  const user = useAuthStore((s) => s.user);
  const [hermesEnabled, setHermesEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user?.activeCompanyId) {
      setHermesEnabled(false);
      setIsLoading(false);
      return;
    }

    const fetchConfig = async () => {
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
    };

    fetchConfig();
  }, [user?.activeCompanyId]);

  // Re-fetch when company changes
  useEffect(() => {
    if (!user?.activeCompanyId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/hermes/config');
        if (res.ok) {
          const data = await res.json();
          setHermesEnabled(data.hermesConfig?.enabled ?? false);
        }
      } catch { /* ignore */ }
    }, 60_000); // Check every 60 seconds

    return () => clearInterval(interval);
  }, [user?.activeCompanyId]);

  if (isLoading || !hermesEnabled || !user?.activeCompanyId) return null;

  return (
    <HermesOverlay
      tenantId={user.activeCompanyId}
      userId={user.id}
      userName={user.businessName || user.email || 'Bruger'}
      servicePort={3004}
    />
  );
}
