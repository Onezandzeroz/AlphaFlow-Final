'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ChatMessage, HermesNotification } from './types';

interface UseHermesSocketReturn {
  isConnected: boolean;
  agentEnabled: boolean;
  messages: ChatMessage[];
  notifications: HermesNotification[];
  isTyping: boolean;
  sendMessage: (content: string) => void;
  dismissNotification: (id: string) => void;
  /** Start a fresh chat session: clears visible messages and tells the server
   *  to drop the previous session's in-memory history so the LLM starts blank. */
  startNewSession: () => void;
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
  const streamingIdRef = useRef<string | null>(null);

  // ── Chat session identity ────────────────────────────────────────────
  // Each "conversation" gets a client-generated UUID, persisted in
  // localStorage so reopening the panel resumes the same session. "New chat"
  // rotates the id → the server isolates history per session, so the LLM only
  // sees the current conversation (not every prior message ever exchanged).
  const sessionIdRef = useRef<string | null>(null);
  const SESSION_STORAGE_KEY = `hermes:sessionId:${tenantId}`;

  const ensureSessionId = useCallback((): string => {
    if (sessionIdRef.current) return sessionIdRef.current;
    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        sessionIdRef.current = stored;
        return stored;
      }
    } catch { /* localStorage unavailable (private mode) — fall through */ }
    const fresh = crypto.randomUUID();
    sessionIdRef.current = fresh;
    try { localStorage.setItem(SESSION_STORAGE_KEY, fresh); } catch { /* ignore */ }
    return fresh;
  }, [SESSION_STORAGE_KEY]);

  // Initialise the session id on mount (client-only).
  useEffect(() => {
    ensureSessionId();
  }, [ensureSessionId]);

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
      // The join event just triggers the welcome flow; the verified
      // identity is already registered on the socket.
      socket.emit('join', {});
    });

    socket.on('disconnect', () => {
      console.log('[Hermes UI] Disconnected from Hermes Agent');
      setIsConnected(false);
    });

    socket.on('connect_error', (err: Error) => {
      console.warn('[Hermes UI] Connection error:', err.message);
    });

    // ─── join-ack: Server confirms join + sends initial agent state ───
    socket.on('join-ack', (data: { status: string; agentEnabled: boolean; tenantName: string }) => {
      console.log('[Hermes UI] Join acknowledged:', data);
      setAgentEnabled(data.agentEnabled);
    });

    // ─── agent-welcome: Welcome message from agent ───
    socket.on('agent-welcome', (data: { message: string; tenantName: string }) => {
      if (data.message) {
        const welcomeMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'hermes',
          content: data.message,
          timestamp: new Date(),
        };
        setMessages((prev) => [welcomeMsg, ...prev]);
      }
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
    try { localStorage.setItem(SESSION_STORAGE_KEY, fresh); } catch { /* ignore */ }
    // Clear the visible conversation immediately for instant UI feedback,
    // and reset any in-flight streaming state.
    setMessages([]);
    setIsTyping(false);
    streamingIdRef.current = null;
    // Tell the server to drop the old session's in-memory history so the next
    // message starts with a blank LLM context.
    if (socketRef.current && isConnected) {
      socketRef.current.emit('new-session', { previousSessionId });
    }
  }, [isConnected, SESSION_STORAGE_KEY]);

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
    sendMessage,
    dismissNotification,
    startNewSession,
  };
}
