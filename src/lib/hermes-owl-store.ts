import { create } from 'zustand';

/**
 * Runtime owl-visibility store.
 *
 * The Hermes owl FAB auto-hides (slides off-screen) after 5s of chat-closed
 * inactivity, and is re-summoned when the user hovers/taps the reveal tab.
 * This store exposes that runtime visibility so that downstream consumers
 * (PageHeader banner padding, AppLayout mobile-header padding) can react in
 * real time:
 *
 *   - Owl VISIBLE  → reserve right-side padding (room for the owl)
 *   - Owl HIDDEN   → collapse padding (buttons move to the natural edge)
 *
 * Previously these consumers only knew the static company-level `enabled`
 * flag (via useHermesEnabled context) — they kept reserving space even when
 * the owl had slid off-screen, leaving buttons "hovering weirdly" in empty
 * space. This store closes that gap.
 *
 * The store is written by HermesOverlay (which owns the auto-hide timer +
 * reveal logic) and read by any consumer that needs to adapt its layout.
 *
 * ── NOTIFICATION OVERRIDE ──────────────────────────────────────────
 * The `notificationOverride` mechanism allows external components (like
 * EInvoiceEventNotifier) to temporarily force the owl visible — overriding
 * HermesOverlay's auto-hide timer. When `notificationOverride = true`:
 *   - HermesOverlay's auto-hide useEffect skips its timer (checks this flag)
 *   - The owl stays visible as long as the override is active
 * When `notificationOverride = false`:
 *   - HermesOverlay's auto-hide useEffect resumes normal behaviour
 *   - The owl auto-hides after the normal 5s delay
 * This prevents the "two timers fighting" problem where EInvoiceEventNotifier
 * shows the owl but HermesOverlay's useEffect immediately schedules a hide.
 */

interface HermesOwlState {
  /** True when the owl FAB has slid off-screen (auto-hidden). */
  fabHidden: boolean;
  /** Update the owl's hidden state. Called by HermesOverlay. */
  setFabHidden: (hidden: boolean) => void;
  /**
   * Notification override — when true, HermesOverlay's auto-hide timer
   * is skipped and the owl stays visible. Set by EInvoiceEventNotifier
   * (and potentially other notification sources) when a toast fires,
   * and cleared after the toast's duration elapses.
   */
  notificationOverride: boolean;
  /** Set the notification override flag. */
  setNotificationOverride: (active: boolean) => void;
}

export const useHermesOwlStore = create<HermesOwlState>((set) => ({
  fabHidden: false,
  setFabHidden: (hidden) => set({ fabHidden: hidden }),
  notificationOverride: false,
  setNotificationOverride: (active) => set({ notificationOverride: active }),
}));
