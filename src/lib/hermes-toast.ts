'use client';

/**
 * Global Hermes owl toast hook.
 *
 * Wraps sonner's `toast` so that ANY toast fired anywhere in the app
 * automatically activates the Hermes owl (via the notificationOverride
 * mechanism in useHermesOwlStore). The owl pops forward BEFORE the
 * toast appears (with a 300ms lead so the owl's Framer Motion slide-in
 * animation starts first) and fades back EXACTLY when the toast's
 * duration elapses — matching the toast's lifetime precisely.
 *
 * Usage — replace `import { toast } from 'sonner'` with:
 *   import { toast } from '@/lib/hermes-toast'
 *
 * The API is identical to sonner's toast — this is a transparent proxy
 * that adds owl activation as a side effect.
 */

import { toast as sonnerToast } from 'sonner';
import { useHermesOwlStore } from '@/lib/hermes-owl-store';

// Module-level refs so we don't need React context
let setOverride: ((active: boolean) => void) | null = null;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;

// Initialize the ref from the store (called once on first toast)
function ensureInit() {
  if (!setOverride) {
    setOverride = useHermesOwlStore.getState().setNotificationOverride;
  }
}

// How long before the toast to show the owl (ms).
// HermesFab's Framer Motion slide-in takes ~600ms (duration: 0.6, ease: 'easeInOut').
// 300ms gives the owl a head start — it's visibly sliding in when the toast appears.
const OWL_LEAD_MS = 300;

/**
 * Show the Hermes owl, then schedule the toast to appear after OWL_LEAD_MS.
 * The owl hide timer matches the toast's duration EXACTLY (no grace period)
 * so the owl and toast disappear together.
 *
 * Returns a Promise that resolves when the toast has been dispatched.
 */
function showOwlThenToast(
  durationMs: number,
  dispatchToast: () => void,
): void {
  ensureInit();
  if (!setOverride) {
    // Owl store not available — just show the toast immediately
    dispatchToast();
    return;
  }

  // Activate override immediately — owl starts sliding in
  setOverride(true);

  // Clear any previous hide timeout
  if (hideTimeout) {
    clearTimeout(hideTimeout);
  }

  // Wait OWL_LEAD_MS so the owl is visibly sliding in, THEN show the toast
  setTimeout(() => {
    dispatchToast();
  }, OWL_LEAD_MS);

  // Schedule clearing the override after OWL_LEAD_MS + durationMs
  // so the owl hides EXACTLY when the toast fades out (no grace period)
  hideTimeout = setTimeout(() => {
    setOverride?.(false);
    hideTimeout = null;
  }, OWL_LEAD_MS + durationMs);
}

// Default duration if the toast doesn't specify one
const DEFAULT_DURATION = 4000;

/**
 * Wrapped toast function — identical API to sonner's `toast`.
 * Activates the Hermes owl BEFORE the toast appears (300ms lead).
 */
function toast(message: string, options?: Parameters<typeof sonnerToast>[1]) {
  const duration = (options as { duration?: number })?.duration ?? DEFAULT_DURATION;
  showOwlThenToast(duration, () => sonnerToast(message, options));
}

/**
 * Wrapped toast.success — activates the Hermes owl.
 */
toast.success = (message: string, options?: Parameters<typeof sonnerToast.success>[1]) => {
  const duration = (options as { duration?: number })?.duration ?? DEFAULT_DURATION;
  showOwlThenToast(duration, () => sonnerToast.success(message, options));
};

/**
 * Wrapped toast.error — activates the Hermes owl.
 */
toast.error = (message: string, options?: Parameters<typeof sonnerToast.error>[1]) => {
  const duration = (options as { duration?: number })?.duration ?? DEFAULT_DURATION;
  showOwlThenToast(duration, () => sonnerToast.error(message, options));
};

/**
 * Wrapped toast.info — activates the Hermes owl.
 */
toast.info = (message: string, options?: Parameters<typeof sonnerToast.info>[1]) => {
  const duration = (options as { duration?: number })?.duration ?? DEFAULT_DURATION;
  showOwlThenToast(duration, () => sonnerToast.info(message, options));
};

/**
 * Wrapped toast.warning — activates the Hermes owl.
 */
toast.warning = (message: string, options?: Parameters<typeof sonnerToast.warning>[1]) => {
  const duration = (options as { duration?: number })?.duration ?? DEFAULT_DURATION;
  showOwlThenToast(duration, () => sonnerToast.warning(message, options));
};

/**
 * Wrapped toast.loading — activates the Hermes owl.
 */
toast.loading = (message: string, options?: Parameters<typeof sonnerToast.loading>[1]) => {
  const duration = (options as { duration?: number })?.duration ?? DEFAULT_DURATION;
  showOwlThenToast(duration, () => sonnerToast.loading(message, options));
};

/**
 * Wrapped toast.promise — activates the Hermes owl.
 */
toast.promise = <T>(
  promise: Promise<T>,
  options: Parameters<typeof sonnerToast.promise>[1],
) => {
  showOwlThenToast(DEFAULT_DURATION, () => sonnerToast.promise(promise, options));
};

/**
 * Wrapped toast.custom — activates the Hermes owl.
 */
toast.custom = (
  component: (id: string | number) => React.ReactElement,
  options?: Parameters<typeof sonnerToast.custom>[1],
) => {
  const duration = (options as { duration?: number })?.duration ?? DEFAULT_DURATION;
  showOwlThenToast(duration, () => sonnerToast.custom(component, options));
};

// Pass through dismiss without owl activation
toast.dismiss = sonnerToast.dismiss;

export { toast };
