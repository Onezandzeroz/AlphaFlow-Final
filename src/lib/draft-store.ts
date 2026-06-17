/**
 * Draft Store (Zustand + localStorage persist)
 *
 * Persists unsaved form input as "drafts" so that if a user accidentally
 * closes a form, navigates away, or the browser crashes, their input is
 * preserved and can be restored when they reopen the form.
 *
 * Design:
 *   - One entry per draft key (e.g. 'transaction:new', 'contact:edit:abc')
 *   - Each entry stores { data, updatedAt, label? }
 *   - Persisted to localStorage via zustand persist middleware (same pattern
 *     as auth-store / sidebar-store / language-store already in the codebase)
 *   - Drafts auto-expire after DRAFT_TTL_MS (7 days) — pruned on store load
 *
 * Security: NEVER use this for auth forms (passwords, OTP codes). The hook
 * callers are responsible for choosing safe draft keys.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ─── Constants ───────────────────────────────────────────────────────

/** Drafts older than this are pruned on load (7 days) */
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** localStorage key — bump version suffix if the schema changes */
const STORAGE_KEY = 'alphaflow-drafts-v1';

// ─── Types ───────────────────────────────────────────────────────────

export interface DraftEntry {
  /** The persisted form values (JSON-serialisable) */
  data: Record<string, unknown>;
  /** Epoch ms of the last write — used for expiry + display */
  updatedAt: number;
  /** Optional human-readable label for the recovery UI (e.g. "New transaction") */
  label?: string;
}

export interface DraftMeta {
  key: string;
  updatedAt: number;
  label?: string;
}

interface DraftState {
  drafts: Record<string, DraftEntry>;

  /** Write (or overwrite) a draft. */
  setDraft: (key: string, data: Record<string, unknown>, label?: string) => void;

  /** Read a single draft (or undefined). */
  getDraft: (key: string) => DraftEntry | undefined;

  /** Does a draft exist for this key? */
  hasDraft: (key: string) => boolean;

  /** Remove a single draft (call after successful submit). */
  clearDraft: (key: string) => void;

  /** Remove ALL drafts (used by the recovery UI "discard all"). */
  clearAllDrafts: () => void;

  /** List all drafts as { key, updatedAt, label } — for the recovery UI. */
  listDrafts: () => DraftMeta[];
}

// ─── Expiry helper ───────────────────────────────────────────────────

function pruneExpired(drafts: Record<string, DraftEntry>): Record<string, DraftEntry> {
  const now = Date.now();
  const next: Record<string, DraftEntry> = {};
  let changed = false;
  for (const [key, entry] of Object.entries(drafts)) {
    if (entry && typeof entry.updatedAt === 'number' && now - entry.updatedAt < DRAFT_TTL_MS) {
      next[key] = entry;
    } else {
      changed = true;
    }
  }
  // Return the same reference if nothing changed (avoids needless re-renders)
  return changed ? next : drafts;
}

// ─── Store ───────────────────────────────────────────────────────────

export const useDraftStore = create<DraftState>()(
  persist(
    (set, get) => ({
      drafts: {},

      setDraft: (key, data, label) =>
        set((state) => ({
          drafts: {
            ...state.drafts,
            [key]: { data, updatedAt: Date.now(), label },
          },
        })),

      getDraft: (key) => get().drafts[key],

      hasDraft: (key) => Boolean(get().drafts[key]),

      clearDraft: (key) =>
        set((state) => {
          if (!state.drafts[key]) return state;
          const next = { ...state.drafts };
          delete next[key];
          return { drafts: next };
        }),

      clearAllDrafts: () => set({ drafts: {} }),

      listDrafts: () =>
        Object.entries(get().drafts)
          .map(([key, entry]) => ({
            key,
            updatedAt: entry.updatedAt,
            label: entry.label,
          }))
          .sort((a, b) => b.updatedAt - a.updatedAt),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Only persist the drafts map (not the action functions)
      partialize: (state) => ({ drafts: state.drafts }),
      // Prune expired drafts after rehydration from localStorage
      onRehydrateStorage: () => (state) => {
        if (state?.drafts) {
          state.drafts = pruneExpired(state.drafts);
        }
      },
      version: 1,
    }
  )
);

// ─── Non-reactive accessors (for use inside event handlers / effects) ─

/** Read a draft without subscribing to the store. */
export function readDraft(key: string): DraftEntry | undefined {
  return useDraftStore.getState().drafts[key];
}

/** Write a draft without subscribing to the store. */
export function writeDraft(key: string, data: Record<string, unknown>, label?: string): void {
  useDraftStore.getState().setDraft(key, data, label);
}

/** Remove a draft without subscribing to the store. */
export function removeDraft(key: string): void {
  useDraftStore.getState().clearDraft(key);
}

/** Check if a draft exists without subscribing. */
export function draftExists(key: string): boolean {
  return Boolean(useDraftStore.getState().drafts[key]);
}

// ─── External-clear handshake (parent → hook) ────────────────────────
//
// When a PARENT component (e.g. a Dialog wrapper) needs to clear a form's
// draft on close, it can't call the hook's internal clearDraft() because
// the hook lives inside the form component. Calling removeDraft() alone
// is not enough — the hook's unmount-flush would re-create the draft.
//
// clearDraftBeforeUnmount() marks the key so that the hook's unmount
// cleanup knows to SKIP the flush. The flag is auto-cleared after 500ms
// (safety net in case the form doesn't actually unmount) and is also
// consumed on the next unmount.

const pendingExternalClear = new Set<string>();

/**
 * Clear a draft AND signal the owning hook to suppress its unmount-flush.
 * Call this from a parent component right before the form unmounts
 * (e.g. in a Dialog onOpenChange handler when closing).
 */
export function clearDraftBeforeUnmount(key: string): void {
  pendingExternalClear.add(key);
  useDraftStore.getState().clearDraft(key);
  // Safety net: if the form doesn't actually unmount within 500ms
  // (e.g. close was vetoed), clear the flag so future unmounts flush normally.
  setTimeout(() => {
    pendingExternalClear.delete(key);
  }, 500);
}

/**
 * Check (and consume) the external-clear flag. Called by the hook's unmount
 * cleanup. Returns true if the draft was externally cleared and the flush
 * should be skipped.
 */
export function consumeExternalClear(key: string): boolean {
  if (pendingExternalClear.has(key)) {
    pendingExternalClear.delete(key);
    return true;
  }
  return false;
}
