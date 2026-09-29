'use client';

/**
 * EInvoiceEventNotifier
 *
 * Invisible component that connects to the notification WebSocket service
 * (port 3001) and listens for 'einvoice-event' socket events emitted by the
 * Sproom webhook (push) and the inbox puller (pull). On each event it:
 *
 *   1. Fires a sonner toast with the counterparty name, invoice number, and
 *      new status — so the tenant is notified in real time when an e-invoice
 *      or e-creditnote is received (inbound) or transitions status outbound
 *      (DELIVERED / ACCEPTED / REJECTED / FAILED).
 *   2. Bumps the relevant data-sync scope so subscribed UI indicators refresh
 *      — 'received-invoices' for inbound, 'einvoice-sends' for outbound.
 *
 * Connects with EXPLICIT auth: { userId, companyId } so the WS service's
 * connection handler (which requires userId + joins the company:<companyId>
 * room) accepts the connection. Render once in the AppLayout (returns null).
 */

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/lib/auth-store';
import { useDataSyncStore } from '@/lib/data-sync-store';
import { useTranslation } from '@/lib/use-translation';
import { useHermesOwlStore } from '@/lib/hermes-owl-store';
import { FileText, Receipt, CheckCircle2, XCircle, AlertCircle, Loader2, Send, Clock, Banknote } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const WS_PORT =
  typeof process !== 'undefined' && process.env?.NOTIFICATION_WS_PORT
    ? process.env.NOTIFICATION_WS_PORT
    : '3001';

interface EInvoiceEvent {
  type: 'EINVOICE_EVENT';
  companyId: string;
  direction: 'inbound' | 'outbound';
  status: string;
  invoiceNumber?: string | null;
  counterpartyName?: string | null;
  documentType?: string | null;
  amount?: string | null;
  currency?: string | null;
  sendingId?: string | null;
  receivedInvoiceId?: string | null;
  timestamp: number;
}

/** Capitalize the first letter of the doc label (for sentence-start toasts). */
function cap(label: string): string {
  if (!label) return label;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function EInvoiceEventNotifier() {
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;
  const companyId = user?.activeCompanyId ?? null;
  const { language } = useTranslation();
  const isDa = language === 'da';

  // ── Hermes owl show/hide ──
  // When a toast fires, we activate a "notification override" that keeps
  // the Hermes owl visible — overriding HermesOverlay's auto-hide timer.
  // After the toast's duration elapses, we clear the override, which lets
  // HermesOverlay's auto-hide timer resume (it will hide the owl after
  // its normal 5s delay).
  //
  // We use `notificationOverride` instead of directly setting `fabHidden`
  // because HermesOverlay's useEffect would otherwise fight our changes
  // (it has a 5s auto-hide timer that re-triggers whenever fabHidden
  // changes, causing a "two timers fighting" problem).
  const setNotificationOverrideRef = useRef(useHermesOwlStore.getState().setNotificationOverride);
  useEffect(() => {
    setNotificationOverrideRef.current = useHermesOwlStore.getState().setNotificationOverride;
  }, []);

  /**
   * Show the Hermes owl (via notification override), then clear the
   * override after `durationMs` milliseconds — letting HermesOverlay's
   * auto-hide timer resume.
   *
   * If multiple toasts fire in quick succession, the timeout is reset
   * with each new toast — so the owl stays visible as long as toasts
   * keep coming, and only hides after the LAST toast has faded.
   */
  const owlHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showOwlThenHide = (durationMs: number) => {
    // Activate the override (owl stays visible, HermesOverlay skips auto-hide)
    setNotificationOverrideRef.current(true);
    // Clear any previous hide-timeout (so the owl stays visible if
    // multiple toasts fire in quick succession)
    if (owlHideTimeoutRef.current) {
      clearTimeout(owlHideTimeoutRef.current);
    }
    // Schedule clearing the override after the toast duration + grace
    owlHideTimeoutRef.current = setTimeout(() => {
      setNotificationOverrideRef.current(false);
      owlHideTimeoutRef.current = null;
    }, durationMs + 500);
  };

  // Keep the store's bumpVersion in a ref so the socket listener (set up once
  // per connection) always calls the current implementation without re-subscribing.
  const bumpVersionRef = useRef(useDataSyncStore.getState().bumpVersion);
  useEffect(() => {
    bumpVersionRef.current = useDataSyncStore.getState().bumpVersion;
  }, []);

  // Keep the current language in a ref so a language toggle does NOT tear down
  // + rebuild the socket connection (which `isDa` in the deps would do). The
  // toast handler reads isDaRef.current at event time instead.
  const isDaRef = useRef(isDa);
  useEffect(() => {
    isDaRef.current = isDa;
  }, [isDa]);

  useEffect(() => {
    if (!userId || !companyId) return;

    let cancelled = false;
    // Type-only usage of the dynamic import — erased at compile time, so
    // socket.io-client stays out of the SSR bundle (matches DataSyncProvider).
    let socket: ReturnType<typeof import('socket.io-client')['io']> | null = null;

    import('socket.io-client')
      .then(({ io }) => {
        if (cancelled) return;

        socket = io({
          // Route through Caddy to the WS service on port 3001.
          query: { XTransformPort: WS_PORT },
          // Explicit auth — the WS service's connection handler requires a
          // userId and uses companyId to join the company:<companyId> room
          // (so the einvoice-event broadcast reaches this client).
          auth: { userId, companyId },
          transports: ['polling', 'websocket'],
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 10000,
          timeout: 5000,
        });

        socket.on('connect', () => {
          console.log('[EInvoiceEvent] Socket.IO connected for company:', companyId);
        });
        socket.on('connect_error', (err: Error) => {
          // Common during dev if the mini-service isn't running — log quietly.
          console.warn('[EInvoiceEvent] Socket.IO connection error:', err.message);
        });

        // ── FALLBACK: listen for 'data-changed' events on 'einvoice-sends' ──
        // The primary toast path is the 'einvoice-event' socket event (below).
        // But if the einvoice-event was lost (e.g. the server-side
        // notifyEInvoiceEvent() failed, or the event was emitted while this
        // socket was disconnected), we can still detect status changes via
        // the 'data-changed' event — which is sent by notifyDataChange() and
        // is more reliable because it goes through the same /broadcast
        // endpoint and the same socket connection.
        //
        // When a 'data-changed' event arrives for 'einvoice-sends', we
        // re-fetch the sending list from the API and compare statuses to
        // detect new ACCEPTED/REJECTED/DELIVERED transitions — firing toasts
        // for any we find. This is a GLOBAL fallback that works on ANY page
        // (not just the tracking page), because EInvoiceEventNotifier is
        // mounted in the AppLayout.
        const fallbackPrevStatuses = new Map<string, string>();
        let fallbackInitialized = false;

        const checkFallbackToasts = async () => {
          try {
            const res = await fetch('/api/einvoice-sends?page=1&limit=50');
            if (!res.ok) return;
            const data = await res.json();
            const sends = (data.sends || []) as Array<{
              id: string;
              status: string;
              recipientName: string;
              invoice?: { invoiceNumber?: string };
            }>;

            if (!fallbackInitialized) {
              // First call — just record statuses, don't toast
              for (const s of sends) fallbackPrevStatuses.set(s.id, s.status);
              fallbackInitialized = true;
              return;
            }

            const isDa = isDaRef.current;
            let anyToastFired = false;

            for (const s of sends) {
              const prev = fallbackPrevStatuses.get(s.id);
              if (prev && prev !== s.status) {
                const desc = `${s.invoice?.invoiceNumber ?? ''} · ${s.recipientName ?? ''}`;
                if (s.status === 'ACCEPTED') {
                  toast.success(isDa ? 'E-faktura godkendt' : 'E-invoice approved', {
                    description: desc, duration: 5000,
                    icon: <CheckCircle2 className="h-4 w-4" />,
                  });
                  showOwlThenHide(5000);
                  anyToastFired = true;
                } else if (s.status === 'REJECTED') {
                  toast.error(isDa ? 'E-faktura afvist' : 'E-invoice rejected', {
                    description: desc, duration: 8000,
                    icon: <XCircle className="h-4 w-4" />,
                  });
                  showOwlThenHide(8000);
                  anyToastFired = true;
                } else if (s.status === 'DELIVERED') {
                  toast.success(isDa ? 'E-faktura leveret' : 'E-invoice delivered', {
                    description: desc, duration: 4000,
                    icon: <CheckCircle2 className="h-4 w-4" />,
                  });
                  showOwlThenHide(4000);
                  anyToastFired = true;
                }
              }
              fallbackPrevStatuses.set(s.id, s.status);
            }
          } catch {
            // Non-critical — fail silently
          }
        };

        // Also listen for 'data-changed' events (same socket, different event)
        socket.on('data-changed', (data: { scope?: string; companyId?: string; action?: string }) => {
          if (!data || data.scope !== 'einvoice-sends') return;
          // Defer slightly to let the DB commit settle
          setTimeout(() => checkFallbackToasts(), 500);
        });

        // Initialize the fallback status map on connect
        socket.on('connect', () => {
          // Re-initialize on reconnect (statuses may have changed while disconnected)
          fallbackInitialized = false;
          checkFallbackToasts();
        });

        socket.on('einvoice-event', (data: EInvoiceEvent) => {
          if (!data) return;
          // Read the current language without re-subscribing the socket listener.
          const isDa = isDaRef.current;

          // ── 1. Bump the relevant data-sync scope so subscribed indicators
          // refresh in real time (received-invoice inbox badge for inbound,
          // e-invoice send-status popup for outbound).
          const scope =
            data.direction === 'inbound' ? 'received-invoices' : 'einvoice-sends';
          bumpVersionRef.current(scope);

          // ── 2. Build + fire the toast.
          const isCreditNote =
            (data.documentType ?? '').toUpperCase() === 'CREDIT_NOTE';
          const docLabel = isCreditNote
            ? isDa
              ? 'e-kreditnota'
              : 'e-credit note'
            : isDa
              ? 'e-faktura'
              : 'e-invoice';

          const party = data.counterpartyName ?? '';
          const num = data.invoiceNumber ?? '';
          const amt =
            data.amount && data.currency ? `${data.amount} ${data.currency}` : '';

          if (data.direction === 'inbound') {
            // ── Inbound: a document arrived in the tenant's inbox. ──
            // Modern, luftig toast that fades away after 3 seconds.
            // Uses a custom CSS class `einvoice-inbound-toast` (defined in
            // globals.css) for the airy, modern styling — a soft gradient
            // background, rounded corners, generous padding, and a subtle
            // drop shadow. The icon (FileText for invoice, Receipt for
            // credit note) sits in a coloured circle on the left, with
            // the counterparty name as the title and the invoice number
            // + amount as the description.
            const title = isDa
              ? `Ny ${docLabel} modtaget`
              : `New ${docLabel} received`;
            // Description: counterparty · invoice number · amount (any subset)
            const description =
              [party, num, amt].filter(Boolean).join('  ·  ') || undefined;

            toast(title, {
              description,
              duration: 3000, // 3 seconds — short and unobtrusive
              icon: (
                <span
                  className={`einvoice-inbound-icon ${isCreditNote ? 'is-credit-note' : 'is-invoice'}`}
                  aria-hidden="true"
                >
                  {isCreditNote ? (
                    <Receipt className="h-4 w-4" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                </span>
              ),
              classNames: {
                toast: 'einvoice-inbound-toast',
                title: 'einvoice-inbound-toast-title',
                description: 'einvoice-inbound-toast-description',
              },
            });
            // Show Hermes owl alongside the toast, then hide after toast fades
            showOwlThenHide(3000);
            return;
          }

          // ── Outbound status transition. ──
          // Keep the existing simpler styling for outbound — the user's
          // request was specifically about inbound (e-faktura modtaget).
          // Outbound toasts stay at 8s (10s for errors) since they're
          // status transitions the user may want to track longer.
          const capDocLabel = cap(docLabel);
          const outDescription =
            [party, num, amt].filter(Boolean).join(' · ') || undefined;

          // Pick icon + style based on status
          const statusConfig: Record<string, { icon: LucideIcon; variant: 'info' | 'success' | 'error' }> = {
            SENT: { icon: Send, variant: 'info' },
            IN_TRANSIT: { icon: Loader2, variant: 'info' },
            DELIVERED: { icon: CheckCircle2, variant: 'success' },
            PENDING_APPROVAL: { icon: Clock, variant: 'info' },
            ACCEPTED: { icon: CheckCircle2, variant: 'success' },
            PAID: { icon: Banknote, variant: 'success' },
            REJECTED: { icon: XCircle, variant: 'error' },
            FAILED: { icon: AlertCircle, variant: 'error' },
          };
          const cfg = statusConfig[data.status] ?? { icon: FileText, variant: 'info' as const };
          const StatusIcon = cfg.icon;
          const statusTitles: Record<string, { da: string; en: string }> = {
            SENT: { da: `${capDocLabel} afsendt`, en: `${capDocLabel} sent` },
            IN_TRANSIT: { da: `${capDocLabel} undervejs`, en: `${capDocLabel} in transit` },
            DELIVERED: { da: `${capDocLabel} leveret`, en: `${capDocLabel} delivered` },
            PENDING_APPROVAL: { da: `${capDocLabel} afventer godkendelse`, en: `${capDocLabel} pending approval` },
            ACCEPTED: { da: `${capDocLabel} godkendt`, en: `${capDocLabel} approved` },
            PAID: { da: `${capDocLabel} betalt`, en: `${capDocLabel} paid` },
            REJECTED: { da: `${capDocLabel} afvist`, en: `${capDocLabel} rejected` },
            FAILED: { da: `${capDocLabel} fejlet`, en: `${capDocLabel} failed` },
          };
          const outTitle = statusTitles[data.status]
            ? (isDa ? statusTitles[data.status].da : statusTitles[data.status].en)
            : `${capDocLabel}: ${data.status}`;

          // ACCEPTED ("godkendt") is a key milestone — the recipient explicitly
          // approved the invoice. Use the luftig inbound-style toast (same
          // as the inbound "Ny e-faktura modtaget") with a 5-second duration
          // and a green success icon.
          if (data.status === 'ACCEPTED') {
            toast(outTitle, {
              description: outDescription,
              duration: 5000,
              icon: (
                <span className="einvoice-inbound-icon is-invoice" aria-hidden="true">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
              ),
              classNames: {
                toast: 'einvoice-inbound-toast',
                title: 'einvoice-inbound-toast-title',
                description: 'einvoice-inbound-toast-description',
              },
            });
            // Show Hermes owl alongside the toast
            showOwlThenHide(5000);
            return;
          }

          // REJECTED ("afvist") — also a key milestone. Use the luftig style
          // with a red error icon so the user notices immediately.
          if (data.status === 'REJECTED') {
            toast(outTitle, {
              description: outDescription,
              duration: 8000,
              icon: (
                <span className="einvoice-inbound-icon is-credit-note" aria-hidden="true" style={{ background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)', color: '#dc2626' }}>
                  <XCircle className="h-4 w-4" />
                </span>
              ),
              classNames: {
                toast: 'einvoice-inbound-toast',
                title: 'einvoice-inbound-toast-title',
                description: 'einvoice-inbound-toast-description',
              },
            });
            // Show Hermes owl alongside the toast
            showOwlThenHide(8000);
            return;
          }

          // All other outbound statuses (SENT, IN_TRANSIT, DELIVERED,
          // PENDING_APPROVAL, PAID, FAILED) — use the standard sonner
          // styling with appropriate duration.
          const outDuration = (data.status === 'FAILED') ? 10000 : 8000;
          const outMethod = cfg.variant === 'success' ? toast.success : cfg.variant === 'error' ? toast.error : toast.info;
          outMethod(outTitle, {
            description: outDescription,
            duration: outDuration,
            icon: <StatusIcon className="h-4 w-4" />,
          });
          // Show Hermes owl alongside the toast
          showOwlThenHide(outDuration);
        });
      })
      .catch((err) => {
        // socket.io-client not installed / import failed — degrade gracefully.
        console.warn('[EInvoiceEvent] Failed to load socket.io-client:', err);
      });

    return () => {
      cancelled = true;
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
      // Clean up any pending owl-hide timeout
      if (owlHideTimeoutRef.current) {
        clearTimeout(owlHideTimeoutRef.current);
        owlHideTimeoutRef.current = null;
      }
    };
  }, [userId, companyId]);

  return null;
}
