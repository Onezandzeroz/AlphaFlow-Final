'use client';

/**
 * DataSyncProvider
 *
 * Connects to the notification WebSocket service (port 3001) and listens for
 * `data-changed` events scoped to the active company. When an event arrives,
 * it bumps the corresponding scope version in the data-sync store, which
 * triggers any subscribed page to re-fetch its data.
 *
 * Connection lifecycle:
 *   - Connects when a user with an activeCompanyId is present
 *   - Reconnects (leaving the old company room, joining the new) when the
 *     active company changes
 *   - Disconnects on logout
 *   - On reconnect, bumps all known scopes so stale data is refreshed
 *
 * This provider manages its own socket connection (separate from the
 * notification-store and Hermes sockets) to keep concerns isolated, matching
 * the existing pattern in the codebase.
 */

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { useDataSyncStore } from '@/lib/data-sync-store';

const WS_PORT =
  typeof process !== 'undefined' && process.env?.NOTIFICATION_WS_PORT
    ? process.env.NOTIFICATION_WS_PORT
    : '3001';

interface DataChangedEvent {
  type: 'DATA_CHANGED';
  scope: string;
  action?: string;
  entity?: string | null;
  companyId: string;
  timestamp: number;
}

export function DataSyncProvider({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;
  const companyId = user?.activeCompanyId ?? null;

  // Keep latest store actions in refs so the socket listener (set up once per
  // connection) always calls the current implementation without re-subscribing.
  const bumpVersionRef = useRef(useDataSyncStore.getState().bumpVersion);
  const bumpAllRef = useRef(useDataSyncStore.getState().bumpAll);
  useEffect(() => {
    bumpVersionRef.current = useDataSyncStore.getState().bumpVersion;
    bumpAllRef.current = useDataSyncStore.getState().bumpAll;
  }, []);

  // Track the company the current socket is joined to, so we can tear down
  // and rebuild when the company changes.
  const joinedCompanyRef = useRef<string | null>(null);
  const socketRef = useRef<ReturnType<typeof import('socket.io-client')['io']> | null>(null);

  useEffect(() => {
    // No user or no active company → ensure any existing socket is closed.
    if (!userId || !companyId) {
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
        joinedCompanyRef.current = null;
      }
      return;
    }

    // Already connected to the same company — nothing to do.
    if (joinedCompanyRef.current === companyId && socketRef.current) {
      return;
    }

    // Tear down any previous connection (company changed).
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
      joinedCompanyRef.current = null;
    }

    let cancelled = false;

    // Dynamic import keeps socket.io-client out of the SSR bundle.
    import('socket.io-client')
      .then(({ io }) => {
        if (cancelled) return;

        const socket = io({
          // Route through Caddy to the WS service on port 3001.
          query: { XTransformPort: WS_PORT },
          // Auth carries both userId and companyId so the server can map the
          // socket to the user (for notification broadcasts) and join it to
          // the company room (for data-changed broadcasts).
          auth: { userId, companyId },
          transports: ['polling', 'websocket'],
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 10000,
          timeout: 5000,
        });

        socketRef.current = socket;
        joinedCompanyRef.current = companyId;

        socket.on('connect', () => {
          console.log('[DataSync] Socket.IO connected for company:', companyId);
        });

        // On every (re)connect, bump all known scopes so any data that may
        // have changed while the socket was down gets refreshed.
        socket.on('connect', () => {
          bumpAllRef.current();
        });

        socket.on('disconnect', (reason: string) => {
          console.log('[DataSync] Socket.IO disconnected:', reason);
        });

        socket.on('connect_error', (err: Error) => {
          // Common during dev if the mini-service isn't running — log quietly.
          console.warn('[DataSync] Socket.IO connection error:', err.message);
        });

        // ─── The core event: a data-changed invalidation ───
        socket.on('data-changed', (data: DataChangedEvent) => {
          if (data?.scope) {
            bumpVersionRef.current(data.scope);
          }
        });
      })
      .catch((err) => {
        // socket.io-client not installed / import failed — degrade gracefully.
        console.warn('[DataSync] Failed to load socket.io-client:', err);
      });

    return () => {
      cancelled = true;
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
        joinedCompanyRef.current = null;
      }
    };
  }, [userId, companyId]);

  return <>{children}</>;
}
