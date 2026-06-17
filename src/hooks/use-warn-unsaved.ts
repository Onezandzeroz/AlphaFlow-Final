'use client';

/**
 * useWarnOnUnsaved — safety net for forms with unsaved (dirty) state.
 *
 * Two layers of protection:
 *
 * 1. **window `beforeunload`** — when the browser/tab is being closed or a
 *    full-page navigation happens, the browser shows its native "Changes you
 *    made may not be saved" confirmation. Only active while `isDirty` is true.
 *
 * 2. **Dialog close interception** — for forms rendered inside a Radix
 *    Dialog/Sheet, returns handler props (`onPointerDownOutside`,
 *    `onEscapeKeyDown`, `onInteractOutside`) that you spread onto the
 *    <DialogContent> element. When the form is dirty, these prevent the
 *    close and instead surface a confirmation. Pass `onConfirmDiscard` to
 *    control what happens when the user confirms they want to discard.
 *
 * Usage (page form):
 *   const isDirty = form.values !== defaults;
 *   useWarnOnUnsaved(isDirty);
 *
 * Usage (dialog form):
 *   const guard = useWarnOnUnsaved(isDirty, {
 *     onConfirmDiscard: () => setOpen(false),
 *   });
 *   <DialogContent {...guard.dialogProps}>
 *
 * Note: `beforeunload` is intentionally NOT shown for dialog-only forms
 * (set `options.window = false`) because the form lives inside an already-
 * loaded page — the dialog interception is enough and a beforeunload prompt
 * on every page nav would be annoying.
 */

import { useEffect, useCallback, useMemo, useRef } from 'react';

export interface UseWarnOnUnsavedOptions {
  /**
   * Called when the user confirms they want to discard unsaved changes
   * (in the dialog-intercept flow). Typically: close the dialog + clear
   * the draft. If omitted, the dialog simply stays open (close blocked).
   */
  onConfirmDiscard?: () => void;
  /** Enable the window beforeunload listener. Default true for page forms. */
  window?: boolean;
  /** Custom message (some browsers ignore this and show a generic string). */
  message?: string;
}

export interface WarnOnUnsavedResult {
  /**
   * Spread onto <DialogContent> / <SheetContent> to intercept close events
   * when the form is dirty.
   */
  dialogProps: {
    onPointerDownOutside?: (e: Event) => void;
    onEscapeKeyDown?: (e: KeyboardEvent) => void;
    onInteractOutside?: (e: Event) => void;
  };
}

export function useWarnOnUnsaved(
  isDirty: boolean,
  options: UseWarnOnUnsavedOptions = {}
): WarnOnUnsavedResult {
  const { onConfirmDiscard, window: enableWindow = true, message } = options;

  // Keep the callback in a ref-equivalent via useCallback identity —
  // we don't want the beforeunload listener to re-attach on every render.
  const confirmRef = useCallbackRef(onConfirmDiscard);

  // ─── Layer 1: beforeunload ────────────────────────────────────────
  useEffect(() => {
    if (!enableWindow || !isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Per spec, returnValue must be set to trigger the prompt.
      e.returnValue = message ?? '';
      return message ?? '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, enableWindow, message]);

  // ─── Layer 2: Dialog close interception ───────────────────────────
  const interceptClose = useCallback(
    (e: Event) => {
      if (!isDirty) return;
      // Block the default close
      e.preventDefault();
      e.stopPropagation();
      // Defer the confirm so the current event loop finishes cleanly
      // (Radix expects preventDefault to be called synchronously).
      const cb = confirmRef.current;
      if (cb) {
        // Use a microtask to escape the current event handler
        queueMicrotask(() => {
          if (typeof window !== 'undefined' && window.confirm(
            'You have unsaved changes. Discard them and close?'
          )) {
            cb();
          }
        });
      }
    },
    [isDirty, confirmRef]
  );

  const dialogProps = useMemo(
    () =>
      isDirty
        ? {
            onPointerDownOutside: interceptClose,
            onEscapeKeyDown: interceptClose as unknown as (e: KeyboardEvent) => void,
            onInteractOutside: interceptClose,
          }
        : {},
    [isDirty, interceptClose]
  );

  return { dialogProps };
}

// ─── Tiny stable-callback ref helper ─────────────────────────────────

function useCallbackRef<T extends (...args: never[]) => unknown>(callback: T | undefined): {
  current: T | undefined;
} {
  const ref = useRef<T | undefined>(callback);
  // Update the ref inside an effect so we never mutate it during render.
  useEffect(() => {
    ref.current = callback;
  }, [callback]);
  return ref;
}
