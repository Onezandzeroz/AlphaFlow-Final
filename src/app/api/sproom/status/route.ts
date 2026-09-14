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

      // Test Sproom connection health (with 10s timeout)
      let healthy = false;
      if (company.sproomChildCompanyId && sproomClient.isConfigured) {
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

        if (healthy) {
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
      });
    } catch (error) {
      logger.error('[SPROOM_STATUS] Failed:', error);
      return NextResponse.json({ error: 'Failed to get Sproom status' }, { status: 500 });
    }
  }
);
