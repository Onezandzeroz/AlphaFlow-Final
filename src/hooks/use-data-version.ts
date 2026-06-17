'use client';

/**
 * useDataVersion
 *
 * Subscribe to a data-sync scope. Returns a monotonically-increasing version
 * number that changes whenever the server broadcasts a `data-changed` event
 * for this scope (or on socket reconnect). Put this number in a fetch
 * effect's dependency array to trigger an automatic re-fetch.
 *
 * Example:
 *   const txVersion = useDataVersion('transactions');
 *   useEffect(() => { fetchTransactions(); }, [fetchTransactions, txVersion]);
 *
 * The number starts at 0 and increments on each invalidation. Because the
 * initial mount also runs the effect, the first fetch is unaffected.
 */

import { useDataSyncStore } from '@/lib/data-sync-store';

export function useDataVersion(scope: string): number {
  return useDataSyncStore((s) => s.versions[scope] ?? 0);
}
