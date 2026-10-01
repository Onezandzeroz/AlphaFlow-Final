'use client';

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useHermesSocket } from './useHermesSocket';
import { HermesFab } from './HermesFab';
import { HermesPanel } from './HermesPanel';
import { HermesNotificationCard } from './HermesNotificationCard';
import { HermesRevealTab } from './HermesRevealTab';
import { useHermesOwlStore } from '@/lib/hermes-owl-store';
import { useHermesChatStore } from '@/lib/hermes-chat-store';
import type { HermesOverlayProps } from './types';

const DEFAULT_TENANT_ID = 'alphaflow-aps';
const DEFAULT_USER_ID = 'demo-user-1';
const DEFAULT_USER_NAME = 'Mikkel Andersen';
const DEFAULT_SERVICE_PORT = 3004;
const DEFAULT_AGENT_NAME = 'Hermes';
const DEFAULT_MAX_NOTIFICATIONS = 3;

/** Milliseconds after which the owl auto-hides when the chat is not expanded. */
const FAB_AUTO_HIDE_DELAY_MS = 3000;

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

  // ── External "open with prompt" mechanism ──────────────────────────
  // Components across the app (e.g. posting guide cards' "Spørg Hermes"
  // links) call `useHermesChatStore.getState().requestOpenWithPrompt(prompt)`
  // to ask the overlay to open the chat and immediately send a context-rich
  // prompt. We watch `openRequestNonce` — a monotonic counter bumped on each
  // request — so even two identical prompts in a row both fire.
  const openRequestNonce = useHermesChatStore((s) => s.openRequestNonce);
  const pendingPrompt = useHermesChatStore((s) => s.pendingPrompt);
  const consumePendingPrompt = useHermesChatStore((s) => s.consumePendingPrompt);

  // Track whether the socket is ready to send. `sendMessage` is a no-op when
  // disconnected, so we retry shortly after connect lands.
  const lastHandledNonceRef = useRef(0);

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
  //
  // The `fabHidden` state lives in the shared useHermesOwlStore so that
  // downstream consumers (PageHeader banner padding, AppLayout mobile-header
  // padding) can react in real time — collapsing/expanding their reserved
  // space as the owl slides off/on screen.
  const fabHidden = useHermesOwlStore((s) => s.fabHidden);
  const setFabHidden = useHermesOwlStore((s) => s.setFabHidden);
  const notificationOverride = useHermesOwlStore((s) => s.notificationOverride);

  useEffect(() => {
    // First activation: owl stays visible, no timer.
    if (!hasEverOpened) return;

    // Chat is expanded: owl stays visible, no timer.
    if (isOpen) {
      setFabHidden(false);
      return;
    }

    // Notification override active: owl stays visible, skip auto-hide.
    // This prevents HermesOverlay's auto-hide timer from fighting with
    // EInvoiceEventNotifier's showOwlThenHide() — when a toast fires,
    // the override keeps the owl visible until the toast fades, then
    // the override is cleared and normal auto-hide resumes.
    if (notificationOverride) {
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
  }, [isOpen, hasEverOpened, fabHidden, setFabHidden, notificationOverride]);

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

  // ── External "open with prompt" handler ─────────────────────────────
  // When `openRequestNonce` bumps (a component called
  // `requestOpenWithPrompt`), open the panel and — once the socket is
  // connected — deliver the pending prompt as a user message, then clear it.
  //
  // We keep an `isConnectedRef` so the polling closure below always reads the
  // LIVE connection state rather than the value captured at effect-run time
  // (which would go stale while we wait for the socket to come up). The ref
  // is synced in a passive effect (never read during render) to comply with
  // React 19's "no refs during render" rule.
  const isConnectedRef = useRef(isConnected);
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  useEffect(() => {
    if (openRequestNonce === 0) return;
    if (openRequestNonce === lastHandledNonceRef.current) return;
    // Claim this request immediately so a later re-render doesn't double-fire.
    lastHandledNonceRef.current = openRequestNonce;

    // Open the panel right away (also un-hides the owl FAB so it doesn't
    // slide off while the chat is open).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate sync: external "open with prompt" store signal → local UI state
    setIsOpen(true);
    setFabHidden(false);

    const promptToSend = pendingPrompt;
    if (!promptToSend) {
      consumePendingPrompt();
      return;
    }

    // If already connected, send immediately. Otherwise poll briefly until
    // the socket lands — reading the LIVE flag from the ref each tick.
    //
    // For each "Spørg Hermes" request we FIRST start a fresh silent session
    // (clears history + skips the welcome message) so the LLM sees ONLY this
    // prompt — no prior conversation context, no greeting. Then the prompt is
    // sent with `silent: true` so it's not shown as a user bubble either;
    // only Hermes's answer appears.
    //
    // `silent: true` so the pre-filled prompt is NOT shown as a user chat
    // bubble — only Hermes's answer should be visible (per user request:
    // "spørgsmålet skal ikke vises, kun svaret").
    let attempts = 0;
    const maxAttempts = 40; // up to ~4s @ 100ms
    const trySend = () => {
      if (isConnectedRef.current) {
        // 1) Rotate to a fresh silent session (clears history server-side,
        //    skips the welcome so the panel stays empty until the answer
        //    streams in).
        startNewSession({ silent: true });
        // 2) Send the prompt on the new session. Defer one tick so the
        //    'new-session' emit is flushed before the 'chat' emit — otherwise
        //    socket.io may coalesce them and the server could process the
        //    chat before the session rotation lands, attaching the prompt to
        //    the OLD session's history.
        setTimeout(() => {
          sendMessage(promptToSend, { silent: true });
          consumePendingPrompt();
        }, 0);
        return;
      }
      attempts += 1;
      if (attempts < maxAttempts) {
        setTimeout(trySend, 100);
      } else {
        // Gave up waiting for the socket — still consume so it doesn't
        // haunt the next manual open. The user can type manually.
        consumePendingPrompt();
      }
    };
    trySend();
  }, [openRequestNonce, isConnected, sendMessage, startNewSession, pendingPrompt, consumePendingPrompt, setFabHidden]);

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
