'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ChatMessage, HermesNotification } from './types';

export type ResponseMode = 'complex' | 'simplified';

interface UseHermesSocketReturn {
  isConnected: boolean;
  agentEnabled: boolean;
  messages: ChatMessage[];
  notifications: HermesNotification[];
  isTyping: boolean;
  /** Current chat response mode ('complex' or 'simplified'). */
  responseMode: ResponseMode;
  sendMessage: (content: string) => void;
  dismissNotification: (id: string) => void;
  /** Start a fresh chat session: clears visible messages and tells the server
   *  to drop the previous session's in-memory history so the LLM starts blank. */
  startNewSession: () => void;
  /** Toggle between 'complex' and 'simplified' response modes (persisted server-side). */
  toggleResponseMode: () => void;
}

export function useHermesSocket(options: {
  tenantId: string;
  userId: string;
  userName: string;
  servicePort: number;
}): UseHermesSocketReturn {
  const { tenantId, userId, userName, servicePort } = options;
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  // Optimistic initial state: HermesProvider already verified the agent is
  // enabled before rendering this overlay. Starting with `true` eliminates the
  // timing gap where the input is greyed out between socket connect and
  // join-ack receipt. If join-ack reports agentEnabled: false, it will
  // correctly disable the input.
  const [agentEnabled, setAgentEnabled] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notifications, setNotifications] = useState<HermesNotification[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [responseMode, setResponseMode] = useState<ResponseMode>('complex');
  const streamingIdRef = useRef<string | null>(null);

  // ── Chat session identity ────────────────────────────────────────────
  // Each "conversation" gets a client-generated UUID, persisted in
  // localStorage so reopening the panel resumes the same session. "New chat"
  // rotates the id → the server isolates history per session, so the LLM only
  // sees the current conversation (not every prior message ever exchanged).
  // We keep BOTH a ref (for synchronous access in callbacks) and state (so
  // localStorage key computation re-renders when the id changes).
  const sessionIdRef = useRef<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const SESSION_STORAGE_KEY = `hermes:sessionId:${tenantId}`;

  const ensureSessionId = useCallback((): string => {
    if (sessionIdRef.current) return sessionIdRef.current;
    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        sessionIdRef.current = stored;
        setSessionId(stored);
        return stored;
      }
    } catch { /* localStorage unavailable (private mode) — fall through */ }
    const fresh = crypto.randomUUID();
    sessionIdRef.current = fresh;
    setSessionId(fresh);
    try { localStorage.setItem(SESSION_STORAGE_KEY, fresh); } catch { /* ignore */ }
    return fresh;
  }, [SESSION_STORAGE_KEY]);

  // Initialise the session id on mount (client-only).
  useEffect(() => {
    ensureSessionId();
  }, [ensureSessionId]);

  // ── Message persistence (localStorage) ──────────────────────────────
  // Saves the visible conversation so reopening the chat panel instantly
  // shows the last session — before the socket round-trip to the server
  // completes. When 'session-history' arrives from the server (authoritative
  // DB version), it replaces the localStorage-restored version.
  const messagesStorageKey = `hermes:messages:${tenantId}:${sessionId ?? 'default'}`;

  // Restore from localStorage on mount / when sessionId changes.
  useEffect(() => {
    try {
      const key = `hermes:messages:${tenantId}:${sessionId ?? 'default'}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored) as Array<{
          id: string;
          role: string;
          content: string;
          timestamp: string;
        }>;
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(
            parsed.map((m) => ({
              id: m.id,
              role: (m.role === 'user' ? 'user' : 'hermes') as ChatMessage['role'],
              content: m.content,
              timestamp: new Date(m.timestamp),
            })),
          );
        }
      }
    } catch { /* corrupt JSON or localStorage unavailable — ignore */ }
  }, [tenantId, messagesStorageKey]);

  // Save to localStorage whenever messages change.
  useEffect(() => {
    try {
      const key = `hermes:messages:${tenantId}:${sessionId ?? 'default'}`;
      if (messages.length > 0) {
        const serializable = messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp.toISOString(),
        }));
        localStorage.setItem(key, JSON.stringify(serializable));
      } else {
        localStorage.removeItem(key);
      }
    } catch { /* quota exceeded or unavailable — ignore */ }
  }, [messages, tenantId, messagesStorageKey]);

  // Connect to the Hermes Agent mini-service
  useEffect(() => {
    const socket = io({
      query: { XTransformPort: String(servicePort) },
      // Polling first — matches other Socket.IO connections in the codebase
      // and is more resilient through proxies/CDNs. Falls back to WebSocket
      // after the initial handshake succeeds.
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 10000,
      // SECURITY (U-5): The HttpOnly session cookie is sent automatically on
      // every request (polling + WebSocket upgrade) because the connection is
      // same-origin from the browser's perspective (Caddy proxies /socket.io/
      // to this service). No withCredentials flag needed — socket.io-client v4
      // sends cookies by default for same-origin. The server reads the cookie
      // from socket.handshake.headers.cookie and verifies it against the DB.
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Hermes UI] Connected to Hermes Agent');
      setIsConnected(true);
      // SECURITY (U-5): Server-side session verification is now enforced.
      // The server reads the `session` cookie (forwarded by Caddy) from
      // socket.handshake.headers.cookie, verifies it against the DB, and
      // derives userId + tenantId server-side. We no longer send
      // tenantId/userId in the join payload — they're ignored if sent.
      // We DO send the chat sessionId so the server can load the correct
      // session history and send it back via 'session-history'.
      const sid = ensureSessionId();
      socket.emit('join', { sessionId: sid });
    });

    socket.on('disconnect', () => {
      console.log('[Hermes UI] Disconnected from Hermes Agent');
      setIsConnected(false);
    });

    socket.on('connect_error', (err: Error) => {
      console.warn('[Hermes UI] Connection error:', err.message);
    });

    // ─── join-ack: Server confirms join + sends initial agent state ───
    socket.on('join-ack', (data: { status: string; agentEnabled: boolean; tenantName: string; responseMode?: ResponseMode }) => {
      console.log('[Hermes UI] Join acknowledged:', data);
      setAgentEnabled(data.agentEnabled);
      if (data.responseMode) setResponseMode(data.responseMode);
    });

    // ─── agent-welcome: Dynamic LLM-generated welcome (new session / first visit) ───
    // This is now APPENDED (not prepended) since the welcome is the first
    // message chronologically in a fresh session. It replaces the old static
    // hardcoded greeting that piled up on every reconnect.
    socket.on('agent-welcome', (data: { message: string; tenantName: string }) => {
      if (data.message) {
        const welcomeMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'hermes',
          content: data.message,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, welcomeMsg]);
      }
    });

    // ─── session-history: Server replays the session's prior messages ───
    // Fires on join when the session has existing messages (user reopened
    // the chat). Replaces the entire visible conversation with the
    // server-authoritative version (from the DB, with original timestamps).
    socket.on('session-history', (data: { sessionId: string; messages: Array<{ role: string; content: string; createdAt: string }> }) => {
      const restored: ChatMessage[] = data.messages.map((m) => ({
        id: crypto.randomUUID(),
        role: (m.role === 'user' ? 'user' : 'hermes') as ChatMessage['role'],
        content: m.content,
        timestamp: new Date(m.createdAt),
      }));
      setMessages(restored);
    });

    // ─── agent-status: Agent enabled/disabled toggle ───
    socket.on('agent-status', (data: { agentEnabled: boolean; changedBy: string }) => {
      console.log('[Hermes UI] Agent status:', data.agentEnabled);
      setAgentEnabled(data.agentEnabled);
    });

    // ─── notifications: Batch of pending notifications on join ───
    socket.on('notifications', (data: Array<HermesNotification>) => {
      console.log('[Hermes UI] Received notifications:', data.length);
      setNotifications((prev) => [...prev, ...data.map(n => ({ ...n, read: false }))]);
    });

    // ─── notification: Proactive single notification ───
    socket.on('notification', (data: HermesNotification) => {
      console.log('[Hermes UI] Proactive notification:', data.title);
      setNotifications((prev) => [...prev, { ...data, read: false }]);
    });

    // ─── chat-typing: Server tells us Hermes is thinking ───
    socket.on('chat-typing', (data: { typing: boolean }) => {
      setIsTyping(data.typing);
    });

    // ─── chat-response: Streaming chunk ───
    socket.on('chat-response', (data: { chunk: string; done: boolean }) => {
      if (!streamingIdRef.current) {
        // Start a new streaming message
        const msgId = crypto.randomUUID();
        streamingIdRef.current = msgId;
        const msg: ChatMessage = {
          id: msgId,
          role: 'hermes',
          content: data.chunk,
          timestamp: new Date(),
          isStreaming: true,
        };
        setMessages((prev) => [...prev, msg]);
      } else {
        // Append to existing streaming message
        setMessages((prev) => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg && lastMsg.isStreaming && lastMsg.id === streamingIdRef.current) {
            updated[updated.length - 1] = {
              ...lastMsg,
              content: lastMsg.content + data.chunk,
            };
          }
          return updated;
        });
      }
    });

    // ─── chat-complete: Final response ───
    socket.on('chat-complete', (data: { fullResponse: string; done: boolean }) => {
      setIsTyping(false);
      // Finalize the streaming message
      setMessages((prev) => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg && lastMsg.isStreaming && lastMsg.id === streamingIdRef.current) {
          updated[updated.length - 1] = {
            ...lastMsg,
            content: data.fullResponse || lastMsg.content,
            isStreaming: false,
          };
        }
        return updated;
      });
      streamingIdRef.current = null;
    });

    // ─── chat-error: Error from server ───
    // `kind` (optional) lets us log/telemetry the specific failure class
    // (missing_key | unauthorized | rate_limited | model_not_found |
    //  server_error | network | unknown) for easier debugging.
    socket.on('chat-error', (data: { error: string; kind?: string }) => {
      console.error('[Hermes UI] Chat error' + (data.kind ? ` [${data.kind}]` : '') + ':', data.error);
      setIsTyping(false);
      streamingIdRef.current = null;
      const errMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'hermes',
        content: `⚠️ ${data.error}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
    });

    // ─── notification-dismissed: Server confirms dismissal ───
    socket.on('notification-dismissed', (data: { notificationId: string }) => {
      setNotifications((prev) => prev.filter((n) => n.id !== data.notificationId));
    });

    // ─── new-session-ack: Server confirmed the session cache was cleared ───
    socket.on('new-session-ack', () => {
      // Nothing further to do — the visible messages were already cleared in
      // startNewSession(). This ack just confirms the server dropped the old
      // session's in-memory history.
      console.log('[Hermes UI] New session acknowledged by server');
    });

    // ─── response-mode-changed: server broadcasts a mode change (from this
    // tab or another open tab of the same tenant) so all stay in sync.
    socket.on('response-mode-changed', (data: { mode: ResponseMode }) => {
      setResponseMode(data.mode);
    });

    return () => {
      socket.disconnect();
    };
  }, [tenantId, userId, userName, servicePort]);

  const sendMessage = useCallback(
    (content: string) => {
      if (!socketRef.current || !isConnected || !agentEnabled) return;

      // Add user message locally
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);

      // Emit to server (event name is 'chat')
      // SECURITY (U-5): tenantId is no longer sent — the server uses the
      // verified session meta. The message text + chat sessionId are sent.
      const sid = ensureSessionId();
      socketRef.current.emit('chat', {
        message: content,
        sessionId: sid,
      });
    },
    [isConnected, agentEnabled, tenantId, ensureSessionId]
  );

  const startNewSession = useCallback(() => {
    const previousSessionId = sessionIdRef.current;
    // Rotate to a fresh session id and persist it.
    const fresh = crypto.randomUUID();
    sessionIdRef.current = fresh;
    setSessionId(fresh);
    try { localStorage.setItem(SESSION_STORAGE_KEY, fresh); } catch { /* ignore */ }
    // Clear the visible conversation immediately for instant UI feedback,
    // and reset any in-flight streaming state.
    setMessages([]);
    setIsTyping(false);
    streamingIdRef.current = null;
    // Clear old session's localStorage messages
    if (previousSessionId) {
      try { localStorage.removeItem(`hermes:messages:${tenantId}:${previousSessionId}`); } catch { /* ignore */ }
    }
    // Tell the server to drop the old session's in-memory history and
    // generate a dynamic welcome for the new session.
    if (socketRef.current && isConnected) {
      socketRef.current.emit('new-session', { previousSessionId, newSessionId: fresh });
    }
  }, [isConnected, SESSION_STORAGE_KEY, tenantId]);

  const toggleResponseMode = useCallback(() => {
    const next: ResponseMode = responseMode === 'complex' ? 'simplified' : 'complex';
    setResponseMode(next); // optimistic — server broadcasts the authoritative value
    if (socketRef.current && isConnected) {
      socketRef.current.emit('set-response-mode', { mode: next });
    }
  }, [isConnected, responseMode]);

  const dismissNotification = useCallback(
    (id: string) => {
      // Remove locally
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      // Notify server
      if (socketRef.current && isConnected) {
        socketRef.current.emit('dismiss-notification', { notificationId: id });
      }
    },
    [isConnected]
  );

  return {
    isConnected,
    agentEnabled,
    messages,
    notifications,
    isTyping,
    responseMode,
    sendMessage,
    dismissNotification,
    startNewSession,
    toggleResponseMode,
  };
}
