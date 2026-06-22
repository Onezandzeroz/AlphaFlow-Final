/**
 * Frisbii Overlay Checkout Helper
 *
 * Loads the Frisbii (Reepay) Checkout JS SDK and opens a charge session
 * as a full-page overlay ON TOP of the current page — the user stays on
 * alphaflow.dk, no redirect to checkout.reepay.com.
 *
 * ─── How it works ──
 *
 * 1. Backend creates a charge session via POST /session/charge → gets `id`
 * 2. Frontend calls openFrisbiiOverlay(sessionId, callbacks)
 * 3. This helper loads checkout.reepay.com/checkout.js (once) and opens
 *    `new Reepay.ModalCheckout(sessionId)` as a modal overlay
 * 4. Customer enters card details in Frisbii's PCI-compliant iframe
 * 5. On success, the Accept event fires → caller's onSuccess runs
 * 6. The server-side webhook (/api/subscription/payment-webhook) is the
 *    authoritative confirmation; onSuccess just polls /api/auth/me
 *
 * ─── Important ──
 *
 * The overlay never sends card data through AlphaFlow's servers — it
 * runs inside Frisbii's iframe. AlphaFlow only receives the session ID
 * and the Accept/Cancel/Error events.
 *
 * @see https://docs.frisbii.com/docs/overlay-checkout
 */

// ─── TYPES ────────────────────────────────────────────────────────

/** Frisbii Checkout SDK instance (minimal typing — SDK is loaded at runtime). */
interface FrisbiiCheckoutInstance {
  addEventHandler(event: string, handler: (data: FrisbiiCheckoutEvent) => void): void;
  removeEventHandler(event: string): void;
}

interface FrisbiiCheckoutEvent {
  id?: string;
  invoice?: string;
  customer?: string;
  subscription?: string;
  payment_method?: string;
  error?: string;
}

/** Callbacks for the overlay checkout flow. */
export interface OverlayCheckoutCallbacks {
  /** Called when the payment is successfully completed (Accept event). */
  onSuccess?: (data: FrisbiiCheckoutEvent) => void;
  /** Called when the user cancels the payment (Cancel event). */
  onCancel?: (data: FrisbiiCheckoutEvent) => void;
  /** Called when an error occurs during payment (Error event). */
  onError?: (data: FrisbiiCheckoutEvent) => void;
  /** Called when the modal is closed (Close event) — fires regardless of outcome. */
  onClose?: (data: FrisbiiCheckoutEvent) => void;
}

// ─── SDK LOADING ──────────────────────────────────────────────────

import { isMockSessionId } from '@/lib/flatpay-client';

const SDK_URL = 'https://checkout.reepay.com/checkout.js';
const SDK_GLOBAL = 'Reepay';

declare global {
  interface Window {
    Reepay?: {
      ModalCheckout: new (sessionId: string) => FrisbiiCheckoutInstance;
      Event: {
        Accept: string;
        Error: string;
        Cancel: string;
        Close: string;
      };
    };
  }
}

let sdkLoadPromise: Promise<void> | null = null;

/**
 * Load the Frisbii Checkout JS SDK (once — cached across calls).
 * The SDK attaches `window.Reepay` with `ModalCheckout` and `Event`.
 */
function loadSdk(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Frisbii SDK can only be loaded in the browser'));
  }
  if (window.Reepay) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => {
      if (window.Reepay) {
        resolve();
      } else {
        reject(new Error('Frisbii SDK loaded but window.Reepay is undefined'));
      }
    };
    script.onerror = () => {
      sdkLoadPromise = null; // allow retry on next attempt
      reject(new Error('Failed to load Frisbii Checkout SDK'));
    };
    document.head.appendChild(script);
  });

  return sdkLoadPromise;
}

// ─── OVERLAY OPENER ───────────────────────────────────────────────

/**
 * Open a Frisbii charge session as a full-page overlay on top of the
 * current page. The user stays on alphaflow.dk — no redirect.
 *
 * Usage:
 *   const res = await fetch('/api/subscription/create-payment', {...});
 *   const { sessionId } = await res.json();
 *   openFrisbiiOverlay(sessionId, {
 *     onSuccess: () => { window.location.href = '/?payment=success'; },
 *     onCancel: () => { /* user cancelled *\/ },
 *   });
 *
 * @param sessionId — Frisbii charge session ID (cs_...) from create-payment
 * @param callbacks — event handlers for success/cancel/error/close
 */
export async function openFrisbiiOverlay(
  sessionId: string,
  callbacks: OverlayCheckoutCallbacks = {}
): Promise<void> {
  if (!sessionId) {
    throw new Error('sessionId is required to open Frisbii Overlay Checkout');
  }

  // ── Mock mode ──
  // When the backend runs in mock mode (no FLATPAY_API_KEY configured),
  // the session ID looks like "mock_<paymentId>". The real Frisbii SDK
  // would reject this with "session could not be found", so we simulate
  // the Accept event instead. This lets the full overlay flow be tested
  // locally without real Frisbii credentials.
  if (isMockSessionId(sessionId)) {
    // Simulate a brief payment delay (feels like a real checkout)
    await new Promise((resolve) => setTimeout(resolve, 600));
    const mockData: FrisbiiCheckoutEvent = {
      id: sessionId,
      invoice: sessionId,
    };
    callbacks.onSuccess?.(mockData);
    callbacks.onClose?.(mockData);
    return;
  }

  await loadSdk();

  const Reepay = window.Reepay;
  if (!Reepay) {
    throw new Error('Frisbii SDK not available after loading');
  }

  // Create the modal checkout instance with the session ID
  const checkout = new Reepay.ModalCheckout(sessionId);

  // Wire up event handlers
  if (callbacks.onSuccess) {
    checkout.addEventHandler(Reepay.Event.Accept, callbacks.onSuccess);
  }
  if (callbacks.onError) {
    checkout.addEventHandler(Reepay.Event.Error, callbacks.onError);
  }
  if (callbacks.onCancel) {
    checkout.addEventHandler(Reepay.Event.Cancel, callbacks.onCancel);
  }
  if (callbacks.onClose) {
    checkout.addEventHandler(Reepay.Event.Close, callbacks.onClose);
  }

  // The SDK opens the modal automatically upon construction.
  // No explicit .show() / .open() call is needed per the Frisbii docs.
}
