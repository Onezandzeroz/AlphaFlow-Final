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
import { toast, einvoiceToast } from '@/lib/hermes-toast';
import { useAuthStore } from '@/lib/auth-store';
import { useDataSyncStore } from '@/lib/data-sync-store';
import { useTranslation } from '@/lib/use-translation';
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

  // NOTE: Hermes owl activation is now handled automatically by the
  // `hermes-toast` wrapper (src/lib/hermes-toast.ts). Every `toast()` call
  // in this file automatically activates the notificationOverride in the
  // Hermes owl store, making the owl pop forward BEFORE the toast appears,
  // and fade back after the toast's duration elapses. No manual
  // showOwlThenHide() calls needed.

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

            for (const s of sends) {
              const prev = fallbackPrevStatuses.get(s.id);
              if (prev && prev !== s.status) {
                // Use rich e-invoice toast for key milestones
                const MILESTONE_DURATIONS: Record<string, number> = {
                  ACCEPTED: 5000,
                  REJECTED: 8000,
                  DELIVERED: 4000,
                  PAID: 5000,
                };
                if (MILESTONE_DURATIONS[s.status]) {
                  einvoiceToast({
                    status: s.status,
                    documentType: null,
                    counterpartyName: s.recipientName ?? null,
                    counterpartyCvr: null,
                    invoiceNumber: s.invoice?.invoiceNumber ?? null,
                    amount: null,
                    currency: null,
                    issueDate: null,
                    isDa: isDaRef.current,
                  }, MILESTONE_DURATIONS[s.status]);
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
            einvoiceToast({
              status: 'RECEIVED',
              documentType: data.documentType ?? null,
              counterpartyName: data.counterpartyName ?? null,
              counterpartyCvr: null,
              invoiceNumber: data.invoiceNumber ?? null,
              amount: data.amount ?? null,
              currency: data.currency ?? null,
              issueDate: null,
              isDa,
            }, 3000);
            return;
          }

          // ── Outbound status transition. ──
          // Key milestones (Godkendt, Betalt, Afvist) get longer duration.
          const MILESTONE_DURATION: Record<string, number> = {
            ACCEPTED: 5000,
            REJECTED: 8000,
            PAID: 5000,
          };
          const outDuration = MILESTONE_DURATION[data.status] ?? (data.status === 'FAILED' ? 10000 : 5000);

          einvoiceToast({
            status: data.status,
            documentType: data.documentType ?? null,
            counterpartyName: data.counterpartyName ?? null,
            counterpartyCvr: null,
            invoiceNumber: data.invoiceNumber ?? null,
            amount: data.amount ?? null,
            currency: data.currency ?? null,
            issueDate: null,
            isDa,
          }, outDuration);
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
    };
  }, [userId, companyId]);

  return null;
}
