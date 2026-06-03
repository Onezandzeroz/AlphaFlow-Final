'use client';

import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useHermesSocket } from './useHermesSocket';
import { HermesFab } from './HermesFab';
import { HermesPanel } from './HermesPanel';
import { HermesNotificationCard } from './HermesNotificationCard';
import type { HermesOverlayProps } from './types';

const DEFAULT_TENANT_ID = 'alphaflow-aps';
const DEFAULT_USER_ID = 'demo-user-1';
const DEFAULT_USER_NAME = 'Mikkel Andersen';
const DEFAULT_SERVICE_PORT = 3004;
const DEFAULT_AGENT_NAME = 'Hermes';
const DEFAULT_MAX_NOTIFICATIONS = 3;

export function HermesOverlay({
  tenantId = DEFAULT_TENANT_ID,
  userId = DEFAULT_USER_ID,
  userName = DEFAULT_USER_NAME,
  servicePort = DEFAULT_SERVICE_PORT,
  agentName = DEFAULT_AGENT_NAME,
  maxVisibleNotifications = DEFAULT_MAX_NOTIFICATIONS,
  greeting,
  visible = true,
}: HermesOverlayProps) {
  const [isOpen, setIsOpen] = useState(false);

  const {
    isConnected,
    agentEnabled,
    messages,
    notifications,
    isTyping,
    sendMessage,
    dismissNotification,
  } = useHermesSocket({ tenantId, userId, userName, servicePort });

  if (!visible) return null;

  const visibleNotifications = notifications.slice(-maxVisibleNotifications);
  const hasUnread = notifications.length > 0;

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999]" aria-label={`${agentName} AI assistant overlay`}>
      {/* ── Mobile: owl in header, rightmost (menu is to its left) ── */}
      <div className="lg:hidden fixed right-1 top-1 z-[10002]">
        <HermesFab
          onClick={() => setIsOpen((prev) => !prev)}
          hasNotifications={hasUnread}
          isTyping={isTyping && !isOpen}
        />
      </div>

      {/* ── Desktop: owl over banner area ── */}
      <div className="hidden lg:block fixed right-16 top-6 z-[10002]">
        <HermesFab
          onClick={() => setIsOpen((prev) => !prev)}
          hasNotifications={hasUnread}
          isTyping={isTyping && !isOpen}
        />
      </div>

      {/* ── Notification cards (below owl feet, top-right) ── */}
      <div className="fixed top-[68px] right-1 lg:top-[152px] lg:right-16 z-[10001] flex flex-col items-end">
        <AnimatePresence mode="popLayout">
          {visibleNotifications.map((notification) => (
            <HermesNotificationCard
              key={notification.id}
              notification={notification}
              onDismiss={dismissNotification}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* ── Chat Panel ── */}
      <HermesPanel
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        isConnected={isConnected}
        agentEnabled={agentEnabled}
        messages={messages}
        isTyping={isTyping}
        onSendMessage={sendMessage}
        agentName={agentName}
        greeting={greeting}
      />
    </div>
  );
}
