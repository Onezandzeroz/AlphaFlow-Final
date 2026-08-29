'use client';

import { useState, useEffect, useRef } from 'react';
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

/** Seconds after chat close before the owl FAB fades off-screen. */
const FAB_AUTO_HIDE_DELAY_MS = 5000;

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

  // ── Owl FAB auto-hide ──────────────────────────────────────────────
  // After the user closes the chat, wait 5 seconds, then fade the owl
  // off-screen to the right. The user reveals it again by hovering the
  // mouse (or tapping on mobile) the top-right corner hot zone.
  const [fabHidden, setFabHidden] = useState(false);
  const prevIsOpenRef = useRef(false);

  useEffect(() => {
    const wasOpen = prevIsOpenRef.current;

    if (wasOpen && !isOpen) {
      // Chat just closed → start the auto-hide timer.
      const timer = setTimeout(() => {
        setFabHidden(true);
      }, FAB_AUTO_HIDE_DELAY_MS);
      prevIsOpenRef.current = isOpen;
      return () => clearTimeout(timer);
    }

    if (!wasOpen && isOpen) {
      // Chat just opened → cancel any pending hide, ensure owl is visible.
      setFabHidden(false);
    }

    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  // Reveal the owl when the hot zone is hovered/tapped.
  const revealFab = () => setFabHidden(false);

  const {
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
  } = useHermesSocket({ tenantId, userId, userName, servicePort });

  if (!visible) return null;

  const visibleNotifications = notifications.slice(-maxVisibleNotifications);
  const hasUnread = notifications.length > 0;

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999]" aria-label={`${agentName} AI assistant overlay`}>
      {/* ── Mobile: owl in header, rightmost ── */}
      <div className="lg:hidden fixed right-1 top-1 z-[10002]">
        <HermesFab
          onClick={() => setIsOpen((prev) => !prev)}
          hasNotifications={hasUnread}
          isTyping={isTyping && !isOpen}
          fabHidden={fabHidden}
        />
        {/* Hot zone — invisible tap target that reveals the owl when hidden */}
        {fabHidden && (
          <div
            className="absolute inset-0 pointer-events-auto cursor-pointer"
            style={{ minWidth: 70, minHeight: 70 }}
            onClick={revealFab}
            aria-label="Reveal Hermes"
            role="button"
          />
        )}
      </div>

      {/* ── Desktop: owl over banner area ── */}
      <div className="hidden lg:block fixed right-16 top-6 z-[10002]">
        <HermesFab
          onClick={() => setIsOpen((prev) => !prev)}
          hasNotifications={hasUnread}
          isTyping={isTyping && !isOpen}
          fabHidden={fabHidden}
        />
        {/* Hot zone — invisible hover target that reveals the owl when hidden */}
        {fabHidden && (
          <div
            className="absolute inset-0 pointer-events-auto cursor-pointer"
            style={{ minWidth: 140, minHeight: 140 }}
            onMouseEnter={revealFab}
            aria-label="Reveal Hermes"
            role="button"
          />
        )}
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
        onNewSession={startNewSession}
        responseMode={responseMode}
        onToggleResponseMode={toggleResponseMode}
        agentName={agentName}
        greeting={greeting}
      />
    </div>
  );
}
