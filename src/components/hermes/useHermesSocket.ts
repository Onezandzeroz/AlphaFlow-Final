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
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notifications, setNotifications] = useState<HermesNotification[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const streamingIdRef = useRef<string | null>(null);

  // Connect to the Hermes Agent mini-service
  useEffect(() => {
    const socket = io({
      query: { XTransformPort: String(servicePort) },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 10000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Hermes UI] Connected to Hermes Agent');
      setIsConnected(true);
      socket.emit('join', {
        tenantId,
        userId,
        userName,
      });
    });

    socket.on('disconnect', () => {
      console.log('[Hermes UI] Disconnected from Hermes Agent');
      setIsConnected(false);
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
      setIsTyping(true);
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
    socket.on('chat-error', (data: { error: string }) => {
      console.error('[Hermes UI] Chat error:', data.error);
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
      socketRef.current.emit('chat', {
        tenantId,
        message: content,
      });
    },
    [isConnected, agentEnabled, tenantId]
  );

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
  };
}
