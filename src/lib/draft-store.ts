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
 *   - Drafts auto-expire after DRAFT_TTL_MS (30 minutes) — pruned on store
 *     load AND proactively every 60s while the app is open, so expired
 *     drafts disappear even if the user never reloads the page.
 *
 * TENANT ISOLATION (critical):
 *   Drafts are namespaced by the active company (tenant) ID. A draft saved
 *   in tenant A is stored under the key `${companyIdA}::contact:new` and is
 *   NEVER visible when the user switches to tenant B. This prevents
 *   cross-tenant data leakage when a user logs out of one tenant and into
 *   another, or switches between companies in the same session.
 *
 *   The currentCompanyId is set by the app layer (see AppLayout) via
 *   setCurrentCompanyId() whenever the active company changes. All
 *   key-based operations transparently scope to the current tenant.
 *
 * Security: NEVER use this for auth forms (passwords, OTP codes). The hook
 * callers are responsible for choosing safe draft keys.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ─── Constants ───────────────────────────────────────────────────────

/** Drafts older than this are pruned (30 minutes). */
const DRAFT_TTL_MS = 30 * 60 * 1000;

/** How often the proactive expiry sweep runs (every 60 seconds). */
const PRUNE_INTERVAL_MS = 60 * 1000;

/** localStorage key — bump version suffix if the schema changes */
const STORAGE_KEY = 'alphaflow-drafts-v2';

/** Separator between the tenant ID prefix and the user-facing draft key. */
const TENANT_SEPARATOR = '::';

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
  /** The raw drafts map (keys are tenant-scoped: `${companyId}::${key}`). */
  drafts: Record<string, DraftEntry>;
  /** The active tenant ID used to scope all draft operations. Set by AppLayout. */
  currentCompanyId: string | null;

  /** Set the active tenant ID. All subsequent draft ops scope to this tenant. */
  setCurrentCompanyId: (id: string | null) => void;

  /** Write (or overwrite) a draft. */
  setDraft: (key: string, data: Record<string, unknown>, label?: string) => void;

  /** Read a single draft (or undefined). */
  getDraft: (key: string) => DraftEntry | undefined;

  /** Does a draft exist for this key? */
  hasDraft: (key: string) => boolean;

  /** Remove a single draft (call after successful submit). */
  clearDraft: (key: string) => void;

  /** Remove ALL drafts for the CURRENT tenant only. */
  clearAllDrafts: () => void;

  /**
   * Remove every draft older than DRAFT_TTL_MS (across ALL tenants —
   * this is a global GC sweep). Called automatically on store rehydration
   * and by a 60s interval; safe to call manually too.
   */
  pruneExpiredDrafts: () => void;

  /** List all drafts for the CURRENT tenant as { key, updatedAt, label }. */
  listDrafts: () => DraftMeta[];
}

// ─── Tenant-scoped key helpers ───────────────────────────────────────

/**
 * Build the internal storage key by prefixing the user-facing key with the
 * current tenant ID. This is what gets stored in the `drafts` record.
 *
 * If no company is selected (null), we use a sentinel prefix that won't
 * collide with any real tenant — drafts written in this state are
 * effectively orphaned and will be pruned by the TTL sweep. This is
 * intentional: no forms should be open during login/logout transitions,
 * and if they are, their drafts must NOT leak to any real tenant.
 */
function scopedKey(companyId: string | null, key: string): string {
  const prefix = companyId ?? '__no_tenant__';
  return `${prefix}${TENANT_SEPARATOR}${key}`;
}

/** The prefix used to filter drafts belonging to a specific tenant. */
function tenantPrefix(companyId: string | null): string {
  const prefix = companyId ?? '__no_tenant__';
  return `${prefix}${TENANT_SEPARATOR}`;
}

/** Strip the tenant prefix from an internal key, returning the user-facing key. */
function unscopeKey(companyId: string | null, internalKey: string): string {
  const prefix = tenantPrefix(companyId);
  return internalKey.startsWith(prefix)
    ? internalKey.slice(prefix.length)
    : internalKey;
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
      currentCompanyId: null,

      setCurrentCompanyId: (id) => set({ currentCompanyId: id }),

      setDraft: (key, data, label) =>
        set((state) => {
          const sk = scopedKey(state.currentCompanyId, key);
          return {
            drafts: {
              ...state.drafts,
              [sk]: { data, updatedAt: Date.now(), label },
            },
          };
        }),

      getDraft: (key) => {
        const state = get();
        const sk = scopedKey(state.currentCompanyId, key);
        return state.drafts[sk];
      },

      hasDraft: (key) => {
        const state = get();
        const sk = scopedKey(state.currentCompanyId, key);
        return Boolean(state.drafts[sk]);
      },

      clearDraft: (key) =>
        set((state) => {
          const sk = scopedKey(state.currentCompanyId, key);
          if (!state.drafts[sk]) return state;
          const next = { ...state.drafts };
          delete next[sk];
          return { drafts: next };
        }),

      clearAllDrafts: () =>
        set((state) => {
          const prefix = tenantPrefix(state.currentCompanyId);
          const next: Record<string, DraftEntry> = {};
          let changed = false;
          for (const [k, v] of Object.entries(state.drafts)) {
            if (k.startsWith(prefix)) {
              changed = true; // drop it
            } else {
              next[k] = v;
            }
          }
          return changed ? { drafts: next } : state;
        }),

      pruneExpiredDrafts: () =>
        set((state) => {
          const next = pruneExpired(state.drafts);
          // Return the same state ref when nothing changed so zustand
          // skips notifying subscribers (no needless re-renders).
          return next === state.drafts ? state : { drafts: next };
        }),

      listDrafts: () => {
        const state = get();
        const prefix = tenantPrefix(state.currentCompanyId);
        return Object.entries(state.drafts)
          .filter(([k]) => k.startsWith(prefix))
          .map(([k, entry]) => ({
            key: unscopeKey(state.currentCompanyId, k),
            updatedAt: entry.updatedAt,
            label: entry.label,
          }))
          .sort((a, b) => b.updatedAt - a.updatedAt);
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Only persist the drafts map (not the action functions or currentCompanyId)
      partialize: (state) => ({ drafts: state.drafts }),
      // Prune expired drafts after rehydration from localStorage
      onRehydrateStorage: () => (state) => {
        if (state?.drafts) {
          state.drafts = pruneExpired(state.drafts);
        }
      },
      version: 2,
      // Discard any drafts from the old v1 store (which had no tenant
      // prefixing) — they are a cross-tenant leak risk.
      migrate: () => ({}),
    }
  )
);

// ─── Non-reactive accessors (for use inside event handlers / effects) ─
//
// These read currentCompanyId from the store at call time so they always
// use the correct tenant scope.

/** Read a draft without subscribing to the store. */
export function readDraft(key: string): DraftEntry | undefined {
  const state = useDraftStore.getState();
  const sk = scopedKey(state.currentCompanyId, key);
  return state.drafts[sk];
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
  return useDraftStore.getState().hasDraft(key);
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
//
// The pending set uses the tenant-scoped key so that a clear signal for
// tenant A can't accidentally suppress the flush for tenant B.

const pendingExternalClear = new Set<string>();

/**
 * Clear a draft AND signal the owning hook to suppress its unmount-flush.
 * Call this from a parent component right before the form unmounts
 * (e.g. in a Dialog onOpenChange handler when closing).
 */
export function clearDraftBeforeUnmount(key: string): void {
  const state = useDraftStore.getState();
  const sk = scopedKey(state.currentCompanyId, key);
  pendingExternalClear.add(sk);
  state.clearDraft(key);
  // Safety net: if the form doesn't actually unmount within 500ms
  // (e.g. close was vetoed), clear the flag so future unmounts flush normally.
  setTimeout(() => {
    pendingExternalClear.delete(sk);
  }, 500);
}

/**
 * Check (and consume) the external-clear flag. Called by the hook's unmount
 * cleanup. Returns true if the draft was externally cleared and the flush
 * should be skipped.
 */
export function consumeExternalClear(key: string): boolean {
  const state = useDraftStore.getState();
  const sk = scopedKey(state.currentCompanyId, key);
  if (pendingExternalClear.has(sk)) {
    pendingExternalClear.delete(sk);
    return true;
  }
  return false;
}

// ─── Proactive expiry sweep ────────────────────────────────────────
//
// pruneExpired() already runs on store rehydration (page load), but if a
// user keeps the app open for a long session, drafts that cross the
// 30-minute TTL would otherwise linger in memory until the next reload.
// This interval sweeps every 60 seconds so expired drafts are removed
// promptly and the draft store stays invisible to the user.
//
// Guarded for the browser only — the store module may be imported during
// SSR where setInterval / `window` are unavailable. A window-level flag
// dedupes the timer so HMR in dev mode can't stack up duplicates.

if (typeof window !== 'undefined') {
  const w = window as unknown as { __alphaflowDraftPruneTimer?: ReturnType<typeof setInterval> };
  if (!w.__alphaflowDraftPruneTimer) {
    w.__alphaflowDraftPruneTimer = setInterval(() => {
      useDraftStore.getState().pruneExpiredDrafts();
    }, PRUNE_INTERVAL_MS);
  }
}
