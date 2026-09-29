'use client';

/**
 * Global Hermes owl toast hook.
 *
 * Wraps sonner's `toast` so that ANY toast fired anywhere in the app
 * automatically activates the Hermes owl (via the notificationOverride
 * mechanism in useHermesOwlStore). The owl pops forward BEFORE the
 * toast appears (with a 200ms lead) and fades back after the toast's
 * duration elapses.
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

/**
 * Show the Hermes owl immediately, then schedule hiding it after
 * `durationMs + 500ms`. Called before every toast so the owl appears
 * slightly BEFORE the toast.
 */
function showOwlBeforeToast(durationMs: number) {
  ensureInit();
  if (!setOverride) return;

  // Activate override immediately — owl pops forward
  setOverride(true);

  // Clear any previous hide timeout
  if (hideTimeout) {
    clearTimeout(hideTimeout);
  }

  // Schedule clearing the override after the toast duration + grace
  hideTimeout = setTimeout(() => {
    setOverride?.(false);
    hideTimeout = null;
  }, durationMs + 500);
}

// Default duration if the toast doesn't specify one
const DEFAULT_DURATION = 4000;

/**
 * Wrapped toast function — identical API to sonner's `toast`.
 * Activates the Hermes owl BEFORE the toast appears.
 */
function toast(message: string, options?: Parameters<typeof sonnerToast>[1]) {
  const duration = (options as { duration?: number })?.duration ?? DEFAULT_DURATION;
  showOwlBeforeToast(duration);
  return sonnerToast(message, options);
}

/**
 * Wrapped toast.success — activates the Hermes owl.
 */
toast.success = (message: string, options?: Parameters<typeof sonnerToast.success>[1]) => {
  const duration = (options as { duration?: number })?.duration ?? DEFAULT_DURATION;
  showOwlBeforeToast(duration);
  return sonnerToast.success(message, options);
};

/**
 * Wrapped toast.error — activates the Hermes owl.
 */
toast.error = (message: string, options?: Parameters<typeof sonnerToast.error>[1]) => {
  const duration = (options as { duration?: number })?.duration ?? DEFAULT_DURATION;
  showOwlBeforeToast(duration);
  return sonnerToast.error(message, options);
};

/**
 * Wrapped toast.info — activates the Hermes owl.
 */
toast.info = (message: string, options?: Parameters<typeof sonnerToast.info>[1]) => {
  const duration = (options as { duration?: number })?.duration ?? DEFAULT_DURATION;
  showOwlBeforeToast(duration);
  return sonnerToast.info(message, options);
};

/**
 * Wrapped toast.warning — activates the Hermes owl.
 */
toast.warning = (message: string, options?: Parameters<typeof sonnerToast.warning>[1]) => {
  const duration = (options as { duration?: number })?.duration ?? DEFAULT_DURATION;
  showOwlBeforeToast(duration);
  return sonnerToast.warning(message, options);
};

/**
 * Wrapped toast.loading — activates the Hermes owl.
 */
toast.loading = (message: string, options?: Parameters<typeof sonnerToast.loading>[1]) => {
  const duration = (options as { duration?: number })?.duration ?? DEFAULT_DURATION;
  showOwlBeforeToast(duration);
  return sonnerToast.loading(message, options);
};

/**
 * Wrapped toast.promise — activates the Hermes owl.
 */
toast.promise = <T>(
  promise: Promise<T>,
  options: Parameters<typeof sonnerToast.promise>[1],
) => {
  showOwlBeforeToast(DEFAULT_DURATION);
  return sonnerToast.promise(promise, options);
};

/**
 * Wrapped toast.custom — activates the Hermes owl.
 */
toast.custom = (
  component: (id: string | number) => React.ReactElement,
  options?: Parameters<typeof sonnerToast.custom>[1],
) => {
  const duration = (options as { duration?: number })?.duration ?? DEFAULT_DURATION;
  showOwlBeforeToast(duration);
  return sonnerToast.custom(component, options);
};

// Pass through dismiss without owl activation
toast.dismiss = sonnerToast.dismiss;

export { toast };
