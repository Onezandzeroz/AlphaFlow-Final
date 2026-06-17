'use client';

/**
 * useDraftForm — clean values-object API for forms that want draft persistence.
 *
 * Returns a `values` object + `update()`/`setField()` setters that auto-persist
 * to the draft store (debounced) and auto-restore on mount.
 *
 * Best for: new forms, or forms being refactored to a single state object.
 * For forms that already use many individual `useState` calls and are too
 * large to refactor safely, use `useDraftSync` instead.
 *
 * Usage:
 *   const form = useDraftForm('transaction:new', {
 *     description: '', amount: '', date: defaultToday(), type: 'EXPENSE',
 *   });
 *
 *   <Input value={form.values.description}
 *          onChange={e => form.update({ description: e.target.value })} />
 *
 *   // On successful submit:
 *   form.clearDraft();
 *
 *   // To check if a draft was restored (show a "restored draft" hint):
 *   form.hasDraft
 *
 * Security: never use for auth forms (passwords, OTP). Choose keys that
 * are unique per form + context (e.g. 'contact:edit:abc123').
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDraftStore, consumeExternalClear } from '@/lib/draft-store';

const DEFAULT_DEBOUNCE_MS = 300;

export interface UseDraftFormOptions {
  /** Debounce write delay (ms). Default 300. */
  debounceMs?: number;
  /** Optional human-readable label shown in the recovery UI. */
  label?: string;
  /** Disable persistence entirely (e.g. for read-only mode). Default false. */
  disabled?: boolean;
}

export interface UseDraftFormResult<T> {
  /** Current form values (draft-merged with defaults on first render). */
  values: T;
  /** Merge a partial patch into values. */
  update: (patch: Partial<T>) => void;
  /** Set a single field by name. */
  setField: <K extends keyof T>(field: K, value: T[K]) => void;
  /** Replace all values at once. */
  setValues: (v: T) => void;
  /** Remove the persisted draft (call after successful submit). */
  clearDraft: () => void;
  /** Reset to defaults AND clear the draft. */
  reset: () => void;
  /** True if a draft was restored on mount. */
  hasRestoredDraft: boolean;
  /** True if current values differ from defaults. */
  isDirty: boolean;
}

export function useDraftForm<T extends Record<string, unknown>>(
  key: string,
  defaults: T,
  options: UseDraftFormOptions = {}
): UseDraftFormResult<T> {
  const { debounceMs = DEFAULT_DEBOUNCE_MS, label, disabled = false } = options;

  // Read the draft ONCE on mount to initialise state. We intentionally do
  // NOT subscribe to the store here — that would cause every keystroke in
  // another tab writing the same key to re-render this form. We own the
  // local state; the store is just the persistence mirror.
  const initialRef = useRef<{ values: T; restored: boolean }>(null);
  if (initialRef.current === null) {
    const draft = useDraftStore.getState().getDraft(key);
    if (draft?.data) {
      // Merge so new default fields added later still appear
      initialRef.current = {
        values: { ...defaults, ...(draft.data as Partial<T>) },
        restored: true,
      };
    } else {
      initialRef.current = { values: defaults, restored: false };
    }
  }

  const [values, setValuesState] = useState<T>(initialRef.current.values);
  const [hasRestoredDraft] = useState<boolean>(initialRef.current.restored);

  // Debounced write — we schedule a timeout on each change and clear the
  // previous one, so we only hit the store once after typing pauses.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Once clearDraft() is called (e.g. user clicked Cancel), we must NOT
  // re-create the draft via a debounced write or the unmount flush.
  const clearedRef = useRef(false);

  // When the form is re-activated (disabled goes true→false), reset the
  // cleared flag so the hook can save drafts again.
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

  // Flush any pending write on unmount (so closing the form still persists
  // the last keystroke) — UNLESS clearDraft() was called (user cancelled)
  // OR the parent called clearDraftBeforeUnmount (external clear), in which
  // case we must not re-create the draft that was just removed.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        if (!clearedRef.current && !consumeExternalClear(key)) {
          // Fire synchronously on unmount so the data isn't lost
          useDraftStore.getState().setDraft(key, values as Record<string, unknown>, label);
        }
      }
    };
    // Intentionally only re-subscribes on key change — we read `values`
    // from the closure on unmount, not on every render.
  }, [key]);

  const update = useCallback(
    (patch: Partial<T>) => {
      setValuesState((prev) => {
        const next = { ...prev, ...patch };
        writeDraft(next);
        return next;
      });
    },
    [writeDraft]
  );

  const setField = useCallback(
    <K extends keyof T>(field: K, value: T[K]) => {
      setValuesState((prev) => {
        const next = { ...prev, [field]: value };
        writeDraft(next);
        return next;
      });
    },
    [writeDraft]
  );

  const setValues = useCallback(
    (v: T) => {
      setValuesState(v);
      writeDraft(v);
    },
    [writeDraft]
  );

  const clearDraft = useCallback(() => {
    clearedRef.current = true;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    useDraftStore.getState().clearDraft(key);
  }, [key]);

  const reset = useCallback(() => {
    clearedRef.current = true;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setValuesState(defaults);
    useDraftStore.getState().clearDraft(key);
  }, [key, defaults]);

  // isDirty: shallow comparison of values vs defaults
  const isDirty = useMemo(() => {
    const d = defaults as Record<string, unknown>;
    const v = values as Record<string, unknown>;
    const keys = new Set([...Object.keys(d), ...Object.keys(v)]);
    for (const k of keys) {
      if (d[k] !== v[k]) return true;
    }
    return false;
  }, [values, defaults]);

  return {
    values,
    update,
    setField,
    setValues,
    clearDraft,
    reset,
    hasRestoredDraft,
    isDirty,
  };
}
