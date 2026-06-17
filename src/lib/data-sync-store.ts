/**
 * Data Sync Store (Zustand)
 *
 * Maintains a monotonically-increasing version counter per data "scope".
 * When the DataSyncProvider receives a `data-changed` WebSocket event from
 * the server, it calls bumpVersion(scope). Pages that subscribe to a scope
 * via useDataVersion(scope) re-render and their fetch effects re-run.
 *
 * This is a lightweight invalidation bus — it does NOT cache data. Each page
 * still owns its own fetch logic; the version number simply acts as a
 * dependency that triggers a re-fetch when it changes.
 *
 * Architecture:
 *   server mutation → POST /broadcast → WS service → socket 'data-changed'
 *     → DataSyncProvider → bumpVersion(scope)
 *       → useDataVersion(scope) returns new number
 *         → page's useEffect([fetchX, version]) re-runs fetchX()
 */

import { create } from 'zustand';

interface DataSyncState {
  /** Monotonically increasing version per scope (0 = never bumped) */
  versions: Record<string, number>;

  /** Bump the version for a single scope, triggering re-fetch in subscribers */
  bumpVersion: (scope: string) => void;

  /** Bump the version for multiple scopes at once */
  bumpVersions: (scopes: string[]) => void;

  /** Bump every scope that has ever been bumped (used on socket reconnect) */
  bumpAll: () => void;

  /** Read the current version for a scope (0 if never bumped) */
  getVersion: (scope: string) => number;
}

export const useDataSyncStore = create<DataSyncState>((set, get) => ({
  versions: {},

  bumpVersion: (scope) =>
    set((state) => ({
      versions: { ...state.versions, [scope]: (state.versions[scope] ?? 0) + 1 },
    })),

  bumpVersions: (scopes) =>
    set((state) => {
      const next = { ...state.versions };
      for (const scope of scopes) {
        next[scope] = (next[scope] ?? 0) + 1;
      }
      return { versions: next };
    }),

  bumpAll: () =>
    set((state) => {
      const scopes = Object.keys(state.versions);
      if (scopes.length === 0) return state;
      const next = { ...state.versions };
      for (const scope of scopes) {
        next[scope] = (next[scope] ?? 0) + 1;
      }
      return { versions: next };
    }),

  getVersion: (scope) => get().versions[scope] ?? 0,
}));
