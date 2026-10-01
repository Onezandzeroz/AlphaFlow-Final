import { create } from 'zustand';

/**
 * External "open Hermes chat with a pre-filled prompt" mechanism.
 *
 * The Hermes chat panel (HermesOverlay) owns its own `isOpen` state, but
 * several places in the app need to programmatically open the chat AND
 * immediately send a context-rich prompt — e.g. the posting guide cards
 * ("Spørg Hermes" links) and other "ask the assistant about this" entry
 * points.
 *
 * Rather than threading callbacks through the component tree, this store
 * exposes a tiny request/consume protocol:
 *
 *   1. Any component calls `requestOpenWithPrompt(prompt)`.
 *   2. The store stashes the prompt and bumps `openRequestNonce`.
 *   3. HermesOverlay subscribes to `openRequestNonce`; whenever it changes
 *      (and > 0) the overlay opens the panel and, once connected, sends the
 *      pending prompt via `sendMessage`, then calls `consumePendingPrompt()`
 *      to clear it.
 *
 * This mirrors the existing `useHermesOwlStore` pattern used by the toast
 * notification system (setNotificationOverride), keeping the architecture
 * consistent: external signal → store → overlay reacts.
 *
 * NOTE: This store is intentionally separate from `hermes-owl-store.ts`,
 * which is about the owl FAB's *visibility* (auto-hide). This store is about
 * the *chat panel's open state + initial prompt*. Mixing them would conflate
 * two distinct concerns.
 */

interface HermesChatState {
  /**
   * Monotonically increasing nonce bumped every time an external
   * "open with prompt" request is made. HermesOverlay watches this value;
   * a change (with value > 0) triggers an open + send. Using a nonce (rather
   * than a boolean) means two consecutive requests with the SAME prompt
   * still both fire — important if the user clicks the same card twice.
   */
  openRequestNonce: number;
  /** The prompt to send once the chat panel is open. Null = just open. */
  pendingPrompt: string | null;
  /**
   * Request that HermesOverlay open the chat panel and, if `prompt` is
   * provided, immediately send it as a user message. The prompt is
   * consumed (cleared) by HermesOverlay after it has been delivered.
   */
  requestOpenWithPrompt: (prompt?: string | null) => void;
  /**
   * Called by HermesOverlay after it has delivered the pending prompt to
   * the socket. Clears the stashed prompt so it isn't re-sent on the next
   * open. Safe to call when there is no pending prompt.
   */
  consumePendingPrompt: () => void;
}

export const useHermesChatStore = create<HermesChatState>((set) => ({
  openRequestNonce: 0,
  pendingPrompt: null,
  requestOpenWithPrompt: (prompt) =>
    set((s) => ({
      openRequestNonce: s.openRequestNonce + 1,
      pendingPrompt: typeof prompt === 'string' && prompt.trim() ? prompt : null,
    })),
  consumePendingPrompt: () => set({ pendingPrompt: null }),
}));
