import { NextResponse } from 'next/server';
import { sproomClient } from '@/lib/sproom-client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { getActiveAccessPoint } from '@/lib/einvoice-sender';

/**
 * GET /api/sproom/status
 *
 * Returns the Sproom connection status for the active company:
 *   - Whether a child company is created
 *   - Whether NemHandel + Peppol registrations are active
 *   - Whether the Sproom API is healthy
 *
 * Reconciliation: Sproom does NOT fire a webhook when a child company is
 * deleted directly on the Sproom dashboard (only DocumentReceived /
 * DocumentStatusChanged webhooks exist). So this route verifies the child
 * company still exists (GET /api/child-companies/{id}). If it was deleted
 * externally, the Sproom connection fields are cleared here so the UI no
 * longer shows "Forbundet". The response includes `reconciled: true` when
 * this auto-disconnect happened. Transient errors (network/auth/timeout)
 * do NOT trigger reconciliation (would wrongly wipe a valid connection).
 */
export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  async (_request, ctx) => {
    try {
      const company = await db.company.findUnique({
        where: { id: ctx.activeCompanyId! },
        select: {
          id: true,
          cvrNumber: true,
          cvrVerifiedAt: true,
          sproomChildCompanyId: true,
          sproomConnectedAt: true,
          sproomLastTestedAt: true,
          sproomNemHandelRegistered: true,
          sproomPeppolRegistered: true,
          einvoiceEnabled: true,
          einvoiceDefaultChannel: true,
          einvoiceEndpointId: true,
          einvoiceDeliveryMode: true,
        },
      });

      if (!company) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 });
      }

      // Test Sproom connection health + verify the child company still exists.
      //
      // Sproom does NOT fire a webhook when a child company is deleted
      // (only DocumentReceived / DocumentStatusChanged webhooks exist), so
      // we can't push-update on external deletion. Instead, we reconcile
      // here: if GET /api/child-companies/{id} returns 404 (child deleted
      // directly on the Sproom dashboard), we clear the Sproom connection
      // fields so the UI no longer shows "Forbundet".
      //
      // On transient errors (network/auth/timeout) we do NOT reconcile —
      // wiping a valid connection on a transient failure would be worse
      // than showing a stale "connected" until the next successful check.
      let healthy = false;
      let reconciled = false;

      if (company.sproomChildCompanyId && sproomClient.isConfigured) {
        // 1. Parent connection health (GET /api/health + token validation)
        try {
          healthy = await Promise.race([
            sproomClient.testConnection(),
            new Promise<{ connected: boolean }>((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), 10000)
            ),
          ]).then(r => r.connected).catch(() => false);
        } catch {
          healthy = false;
        }

        // 2. Verify the child company still exists in Sproom.
        //    getChildCompany returns null on HTTP 404 (deleted on Sproom's
        //    side). It throws on transient errors — we leave childExists
        //    null in that case so we don't falsely reconcile.
        let childExists: boolean | null = null;
        try {
          const child = await Promise.race([
            sproomClient.getChildCompany(company.sproomChildCompanyId),
            new Promise<null>((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), 10000)
            ),
          ]);
          childExists = child !== null;
        } catch (err) {
          logger.warn('[SPROOM_STATUS] Could not verify child company existence (transient — not reconciling)', {
            companyId: ctx.activeCompanyId,
            childCompanyId: company.sproomChildCompanyId,
            error: err instanceof Error ? err.message : String(err),
          });
        }

        // 3. Reconcile: child company gone → disconnect in DB
        if (childExists === false) {
          logger.info('[SPROOM_STATUS] Child company no longer exists in Sproom — disconnecting', {
            companyId: ctx.activeCompanyId,
            childCompanyId: company.sproomChildCompanyId,
          });
          await db.company.update({
            where: { id: ctx.activeCompanyId! },
            data: {
              sproomChildCompanyId: null,
              sproomConnectedAt: null,
              sproomNemHandelRegistered: false,
              sproomPeppolRegistered: false,
              sproomLastTestedAt: new Date(),
            },
          });
          reconciled = true;
          healthy = false;

          return NextResponse.json({
            connected: false,
            childCompanyId: null,
            connectedAt: null,
            lastTestedAt: new Date().toISOString(),
            healthy: false,
            nemhandelRegistered: false,
            peppolRegistered: false,
            einvoiceEnabled: company.einvoiceEnabled,
            defaultChannel: company.einvoiceDefaultChannel,
            endpointId: company.einvoiceEndpointId,
            deliveryMode: company.einvoiceDeliveryMode,
            cvrNumber: company.cvrNumber,
            cvrVerified: !!company.cvrVerifiedAt,
            // Tells the client which Access Point the platform is configured
            // to use (so the UI can show the Sproom card even before a child
            // company has been created, as long as EINVOICE_ACCESS_POINT=sproom).
            activeAccessPoint: getActiveAccessPoint(),
            sproomConfigured: sproomClient.isConfigured,
            reconciled: true,
          });
        }

        // 4. Child exists + parent healthy → bump lastTestedAt
        if (healthy && childExists === true) {
          await db.company.update({
            where: { id: ctx.activeCompanyId! },
            data: { sproomLastTestedAt: new Date() },
          });
        }
      }

      return NextResponse.json({
        connected: !!company.sproomChildCompanyId,
        childCompanyId: company.sproomChildCompanyId,
        connectedAt: company.sproomConnectedAt?.toISOString() ?? null,
        lastTestedAt: company.sproomLastTestedAt?.toISOString() ?? null,
        healthy,
        nemhandelRegistered: company.sproomNemHandelRegistered,
        peppolRegistered: company.sproomPeppolRegistered,
        einvoiceEnabled: company.einvoiceEnabled,
        defaultChannel: company.einvoiceDefaultChannel,
        endpointId: company.einvoiceEndpointId,
        deliveryMode: company.einvoiceDeliveryMode,
        cvrNumber: company.cvrNumber,
        cvrVerified: !!company.cvrVerifiedAt,
        // Tells the client which Access Point the platform is configured
        // to use (so the UI can show the Sproom card even before a child
        // company has been created, as long as EINVOICE_ACCESS_POINT=sproom).
        activeAccessPoint: getActiveAccessPoint(),
        sproomConfigured: sproomClient.isConfigured,
        reconciled,
      });
    } catch (error) {
      logger.error('[SPROOM_STATUS] Failed:', error);
      return NextResponse.json({ error: 'Failed to get Sproom status' }, { status: 500 });
    }
  }
);
