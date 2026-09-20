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
          const description =
            [party, num, amt].filter(Boolean).join(' · ') || undefined;

          if (data.direction === 'inbound') {
            // Inbound = a document arrived in the tenant's inbox.
            toast.info(isDa ? `Ny ${docLabel} modtaget` : `New ${docLabel} received`, {
              description,
              duration: 8000,
            });
            return;
          }

          // Outbound status transition.
          switch (data.status) {
            case 'SENT':
              toast.info(
                isDa ? `${cap(docLabel)} afsendt` : `${cap(docLabel)} sent`,
                { description, duration: 8000 },
              );
              break;
            case 'IN_TRANSIT':
              toast.info(
                isDa ? `${cap(docLabel)} undervejs` : `${cap(docLabel)} in transit`,
                { description, duration: 8000 },
              );
              break;
            case 'DELIVERED':
              toast.success(
                isDa ? `${cap(docLabel)} leveret` : `${cap(docLabel)} delivered`,
                { description, duration: 8000 },
              );
              break;
            case 'PENDING_APPROVAL':
              toast.info(
                isDa ? `${cap(docLabel)} afventer godkendelse` : `${cap(docLabel)} pending approval`,
                { description, duration: 8000 },
              );
              break;
            case 'ACCEPTED':
              toast.success(
                isDa ? `${cap(docLabel)} accepteret` : `${cap(docLabel)} accepted`,
                { description, duration: 8000 },
              );
              break;
            case 'PAID':
              toast.success(
                isDa ? `${cap(docLabel)} betalt` : `${cap(docLabel)} paid`,
                { description, duration: 8000 },
              );
              break;
            case 'REJECTED':
              toast.error(
                isDa ? `${cap(docLabel)} afvist` : `${cap(docLabel)} rejected`,
                { description, duration: 10000 },
              );
              break;
            case 'FAILED':
              toast.error(
                isDa ? `${cap(docLabel)} fejlet` : `${cap(docLabel)} failed`,
                { description, duration: 10000 },
              );
              break;
            default:
              toast.info(`${cap(docLabel)}: ${data.status}`, {
                description,
                duration: 8000,
              });
          }
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
