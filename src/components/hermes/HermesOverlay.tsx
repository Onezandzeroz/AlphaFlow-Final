'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useHermesSocket } from './useHermesSocket';
import { HermesFab } from './HermesFab';
import { HermesPanel } from './HermesPanel';
import { HermesNotificationCard } from './HermesNotificationCard';
import { HermesRevealTab } from './HermesRevealTab';
import type { HermesOverlayProps } from './types';

const DEFAULT_TENANT_ID = 'alphaflow-aps';
const DEFAULT_USER_ID = 'demo-user-1';
const DEFAULT_USER_NAME = 'Mikkel Andersen';
const DEFAULT_SERVICE_PORT = 3004;
const DEFAULT_AGENT_NAME = 'Hermes';
const DEFAULT_MAX_NOTIFICATIONS = 3;

/** Milliseconds after which the owl auto-hides when the chat is not expanded. */
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

  // ── First-activation tracking (localStorage) ───────────────────────
  // On the user's FIRST ever encounter with Hermes, the owl stays visible
  // so they learn its placement. Once they've opened the chat at least
  // once (ever, across sessions), the auto-hide behaviour activates.
  const EVER_OPENED_KEY = `hermes:everOpened:${tenantId}`;
  const [hasEverOpened, setHasEverOpened] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(EVER_OPENED_KEY) === 'true') {
        setHasEverOpened(true);
      }
    } catch { /* localStorage unavailable — treat as first activation */ }
  }, [EVER_OPENED_KEY]);

  // Mark as "has ever opened" the first time the chat expands.
  useEffect(() => {
    if (isOpen && !hasEverOpened) {
      setHasEverOpened(true);
      try { localStorage.setItem(EVER_OPENED_KEY, 'true'); } catch { /* ignore */ }
    }
  }, [isOpen, hasEverOpened, EVER_OPENED_KEY]);

  // ── Owl FAB auto-hide ──────────────────────────────────────────────
  // The owl auto-hides after 5 seconds whenever the chat is NOT expanded
  // — BUT only after the user has opened Hermes at least once (first-
  // activation exception: the owl stays so the user discovers it).
  //
  // When hidden, a small vertical tab (HermesRevealTab) appears at the
  // right edge. Hovering it (desktop) or tapping it (mobile) reveals the
  // owl again, which restarts the 5s timer (since the chat is still closed).
  const [fabHidden, setFabHidden] = useState(false);

  useEffect(() => {
    // First activation: owl stays visible, no timer.
    if (!hasEverOpened) return;

    // Chat is expanded: owl stays visible, no timer.
    if (isOpen) {
      setFabHidden(false);
      return;
    }

    // Already hidden? No timer needed (prevents an infinite re-trigger loop).
    if (fabHidden) return;

    // Chat is not expanded + user has used Hermes before → auto-hide timer.
    const timer = setTimeout(() => {
      setFabHidden(true);
    }, FAB_AUTO_HIDE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [isOpen, hasEverOpened, fabHidden]);

  // Reveal the owl when the tab is hovered/tapped.
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
      </div>

      {/* ── Desktop: owl over banner area ── */}
      <div className="hidden lg:block fixed right-16 top-6 z-[10002]">
        <HermesFab
          onClick={() => setIsOpen((prev) => !prev)}
          hasNotifications={hasUnread}
          isTyping={isTyping && !isOpen}
          fabHidden={fabHidden}
        />
      </div>

      {/* ── Reveal tab: visible vertical flag when the owl is off-screen ── */}
      <HermesRevealTab visible={fabHidden} onReveal={revealFab} />

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
