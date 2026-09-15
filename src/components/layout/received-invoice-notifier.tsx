'use client';

/**
 * ReceivedInvoiceNotifier
 *
 * Invisible component that polls /api/invoices/received/unread-count every
 * 30s. When the unread count INCREASES (a new e-invoice was received via the
 * Sproom DocumentReceived webhook → storeReceivedInvoice), shows a toast
 * "Ny e-faktura modtaget" so the user is notified even if they're not on the
 * inbox page.
 *
 * Also bumps on useDataVersion('received-invoices') for real-time check
 * (WS live-refresh) — so the toast fires within seconds, not 30s, when the
 * WS service is up.
 *
 * Render once in the AppLayout (it returns null — no visual UI).
 */

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/use-translation';
import { useDataVersion } from '@/hooks/use-data-version';

export function ReceivedInvoiceNotifier() {
  const { language } = useTranslation();
  const isDa = language === 'da';
  const receivedVersion = useDataVersion('received-invoices');
  const prevCount = useRef<number | null>(null);
  const lastVersion = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const checkForNew = async () => {
      try {
        const res = await fetch('/api/invoices/received/unread-count');
        if (!res.ok || cancelled) return;
        const { count } = await res.json();
        if (cancelled) return;
        if (prevCount.current !== null && count > prevCount.current) {
          toast.info(
            isDa ? 'Ny e-faktura modtaget' : 'New e-invoice received',
            {
              description: isDa
                ? 'Tjek din e-faktura indbakke for at se den.'
                : 'Check your e-invoice inbox to view it.',
              duration: 8000,
            }
          );
        }
        prevCount.current = count;
      } catch {
        // Ignore — polling continues
      }
    };

    checkForNew(); // Initial fetch (sets prevCount, no toast)
    const interval = setInterval(checkForNew, 30000); // Poll every 30s

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isDa]);

  // Real-time check on WS data-version bump (immediate, not waiting for 30s poll)
  useEffect(() => {
    if (receivedVersion > 0 && receivedVersion > lastVersion.current) {
      lastVersion.current = receivedVersion;
      // Debounce slightly to avoid double-fetch with the polling
      const timer = setTimeout(() => {
        fetch('/api/invoices/received/unread-count')
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (!data) return;
            const count = data.count;
            if (prevCount.current !== null && count > prevCount.current) {
              toast.info(
                isDa ? 'Ny e-faktura modtaget' : 'New e-invoice received',
                {
                  description: isDa
                    ? 'Tjek din e-faktura indbakke for at se den.'
                    : 'Check your e-invoice inbox to view it.',
                  duration: 8000,
                }
              );
            }
            prevCount.current = count;
          })
          .catch(() => {});
      }, 500); // 500ms debounce
      return () => clearTimeout(timer);
    }
  }, [receivedVersion, isDa]);

  return null;
}
