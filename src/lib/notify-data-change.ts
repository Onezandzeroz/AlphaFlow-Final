/**
 * Server-side data-change notifier.
 *
 * After a mutation API route writes to the database, it calls notifyDataChange()
 * to push a "data-changed" invalidation event to all connected clients in the
 * same company. Each client's DataSyncProvider bumps a version counter for the
 * given scope, which triggers any subscribed page's fetch effect to re-run.
 *
 * This is a fire-and-forget server-to-server call to the notification WebSocket
 * service (port 3001). If the WS service is down, the call fails silently —
 * clients will simply not auto-refresh until the next manual action or page load.
 *
 * Usage:
 *   import { notifyDataChange, notifyDataChanges } from '@/lib/notify-data-change';
 *
 *   // Single scope
 *   await notifyDataChange({ scope: 'hermes-config', companyId, action: 'toggle' });
 *
 *   // Multiple scopes (e.g. a transaction affects both the list and the dashboard)
 *   await notifyDataChanges([
 *     { scope: 'transactions', companyId, action: 'create' },
 *     { scope: 'dashboard', companyId, action: 'update' },
 *   ]);
 */

import { logger } from '@/lib/logger';

const WS_SERVICE_PORT = process.env.NOTIFICATION_WS_PORT || '3001';

// ─── Scopes ───────────────────────────────────────────────────────────
// Keep this list as the canonical set of data-sync scopes. Frontend pages
// subscribe via useDataVersion(<scope>) using these exact strings.

export type DataScope =
  | 'hermes-config'
  | 'transactions'
  | 'posteringer'
  | 'invoices'
  | 'received-invoices'
  | 'journal-entries'
  | 'contacts'
  | 'vat-report'
  | 'bank-reconciliation'
  | 'bank-connections'
  | 'recurring-entries'
  | 'accounts'
  | 'budgets'
  | 'projects'
  | 'fiscal-periods'
  | 'documents'
  | 'audit-logs'
  | 'company-settings'
  | 'dashboard'
  | 'ledger'
  | 'cash-flow'
  | 'reports';

export type DataAction = 'create' | 'update' | 'delete' | 'sync' | 'toggle' | 'submit';

export interface DataChangePayload {
  /** The data scope to invalidate (matches a useDataVersion subscription) */
  scope: DataScope | string;
  /** Company whose clients should refresh */
  companyId: string;
  /** What kind of change happened */
  action?: DataAction;
  /** Optional affected entity id */
  entity?: string;
}

/**
 * Broadcast a single data-change event to all clients in the given company.
 * Non-throwing — failures are logged at warn level and swallowed.
 */
export async function notifyDataChange(payload: DataChangePayload): Promise<void> {
  try {
    // SECURITY (U-5): /broadcast endpoint requires HERMES_ADMIN_KEY auth
    const adminKey = process.env.HERMES_ADMIN_KEY || process.env.OPENROUTER_API_KEY || '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (adminKey) headers['Authorization'] = `Bearer ${adminKey}`;

    const res = await fetch(`http://localhost:${WS_SERVICE_PORT}/broadcast`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'DATA_CHANGED',
        companyId: payload.companyId,
        scope: payload.scope,
        action: payload.action ?? 'update',
        entity: payload.entity,
      }),
      signal: AbortSignal.timeout(2000),
    });

    if (!res.ok) {
      logger.warn(`[DataSync] broadcast returned ${res.status} for scope=${payload.scope}`);
    }
  } catch (err) {
    // WS service might be down — non-critical. Clients catch up on next action.
    logger.warn(`[DataSync] Failed to broadcast data change (scope=${payload.scope}):`, err);
  }
}

/**
 * Broadcast multiple data-change events in parallel.
 * Useful when one mutation affects several scopes (e.g. creating a transaction
 * should invalidate both the transactions list and the dashboard aggregates).
 */
export async function notifyDataChanges(payloads: DataChangePayload[]): Promise<void> {
  if (payloads.length === 0) return;
  await Promise.allSettled(payloads.map((p) => notifyDataChange(p)));
}
