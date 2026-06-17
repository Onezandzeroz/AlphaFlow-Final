'use client';

/**
 * useDraftSync — minimal-invasion draft persistence for forms that already
 * use many individual `useState` calls and are too large to refactor.
 *
 * You pass it the CURRENT combined form state (assembled from your existing
 * useStates) and it:
 *   1. On mount, reads the draft ONCE and calls `onRestore(draft)` so you
 *      can apply it to your setters.
 *   2. On every state change, debounced-writes the combined object to the
 *      draft store.
 *
 * This keeps your existing useState wiring 100% untouched — you only add
 * the hook call + a restore effect + a clearDraft() on submit.
 *
 * Usage:
 *   const [description, setDescription] = useState('');
 *   const [amount, setAmount] = useState('');
 *   // ...existing useStates unchanged...
 *
 *   const { clearDraft, hasRestoredDraft } = useDraftSync(
 *     'transaction:new',
 *     { description, amount, ...allFields },
 *     {
 *       label: 'New transaction',
 *       onRestore: (draft) => {
 *         setDescription(draft.description ?? '');
 *         setAmount(draft.amount ?? '');
 *         // ...apply each field to its setter
 *       },
 *     }
 *   );
 *
 *   // On successful submit:
 *   clearDraft();
 *
 * IMPORTANT: only include JSON-serialisable fields in the state object.
 * Do NOT include File objects, Blob URLs, or functions — wrap those in
 * try/catch or exclude them via the `pick` option.
 *
 * Security: never use for auth forms (passwords, OTP).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useDraftStore, consumeExternalClear } from '@/lib/draft-store';

const DEFAULT_DEBOUNCE_MS = 300;

export interface UseDraftSyncOptions<T> {
  /** Debounce write delay (ms). Default 300. */
  debounceMs?: number;
  /** Optional human-readable label shown in the recovery UI. */
  label?: string;
  /**
   * Called ONCE on mount if a draft exists, with the restored data.
   * Use it to apply the draft to your individual setters.
   * If not provided, the draft is still saved but never restored.
   */
  onRestore?: (draft: T) => void;
  /** Disable persistence entirely. Default false. */
  disabled?: boolean;
}

export interface UseDraftSyncResult<T> {
  /** True if a draft was found and onRestore was called on mount. */
  hasRestoredDraft: boolean;
  /** Remove the persisted draft (call after successful submit). */
  clearDraft: () => void;
  /** Manually persist the current state right now (bypasses debounce). */
  flush: () => void;
}

export function useDraftSync<T extends Record<string, unknown>>(
  key: string,
  currentState: T,
  options: UseDraftSyncOptions<T> = {}
): UseDraftSyncResult<T> {
  const { debounceMs = DEFAULT_DEBOUNCE_MS, label, onRestore, disabled = false } = options;

  // Keep onRestore in a ref so the restore effect doesn't re-run when the
  // caller's callback identity changes (it often captures setters).
  const onRestoreRef = useRef(onRestore);
  useEffect(() => {
    onRestoreRef.current = onRestore;
  }, [onRestore]);

  // Restore ONCE on mount.
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
  const didRestoreRef = useRef(false);
  if (!didRestoreRef.current) {
    didRestoreRef.current = true;
    const draft = useDraftStore.getState().getDraft(key);
    if (draft?.data && onRestoreRef.current) {
      // Defer the restore to a microtask so the caller's setters exist
      // (they will — this runs during render, setters are stable).
      try {
        onRestoreRef.current({ ...(draft.data as T) });
        setHasRestoredDraft(true);
      } catch {
        // If restore throws (e.g. shape mismatch), ignore — fresh form.
      }
    }
  }

  // Debounced write on every state change.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(currentState);
  stateRef.current = currentState;

  // Once clearDraft() is called (e.g. user clicked Cancel), we must NOT
  // re-create the draft via a debounced write or the unmount flush. This
  // flag is set by clearDraft and checked by every write path.
  const clearedRef = useRef(false);

  // When the form is re-activated (disabled goes true→false, e.g. the user
  // re-opens the form after cancelling), reset the cleared flag so the hook
  // can save drafts again. Without this, page-form hooks (which never
  // unmount) would stop saving after the first cancel.
  const prevDisabledRef = useRef(disabled);
  useEffect(() => {
    if (prevDisabledRef.current && !disabled) {
      clearedRef.current = false;
    }
    prevDisabledRef.current = disabled;
  }, [disabled]);

  const writeDraft = useCallback(
    (v: T) => {
      if (disabled || clearedRef.current) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        useDraftStore.getState().setDraft(key, v as Record<string, unknown>, label);
      }, debounceMs);
    },
    [key, label, debounceMs, disabled]
  );

  useEffect(() => {
    writeDraft(currentState);
  }, [currentState, writeDraft]);

  // Flush on unmount so the last keystroke isn't lost — UNLESS clearDraft()
  // was called (e.g. user cancelled) OR the parent called
  // clearDraftBeforeUnmount (external clear), in which case we must not
  // re-create the draft that was just removed.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        if (!disabled && !clearedRef.current && !consumeExternalClear(key)) {
          useDraftStore
            .getState()
            .setDraft(key, stateRef.current as Record<string, unknown>, label);
        }
      }
    };
    // Intentionally only re-subscribes on key change.
  }, [key]);

  const clearDraft = useCallback(() => {
    clearedRef.current = true;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    useDraftStore.getState().clearDraft(key);
  }, [key]);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!disabled) {
      useDraftStore.getState().setDraft(key, stateRef.current as Record<string, unknown>, label);
    }
  }, [key, label, disabled]);

  return { hasRestoredDraft, clearDraft, flush };
}
