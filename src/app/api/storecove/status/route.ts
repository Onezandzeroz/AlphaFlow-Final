import { NextResponse } from 'next/server';
import { storecoveClient } from '@/lib/storecove-client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

// GET /api/storecove/status — Get Storecove connection status
export const GET = withGuard(
  {
    auth: true,
    requireCompany: true,
    permissions: [Permission.DATA_READ],
  },
  async (_request, ctx) => {
    try {
      const company = await db.company.findUnique({
        where: { id: ctx.activeCompanyId! },
        select: {
          storecoveConnected: true,
          storecoveApiKeyId: true,
          storecoveLegalEntityId: true,
          storecoveConnectedAt: true,
          storecoveLastTestedAt: true,
          einvoiceEnabled: true,
          einvoiceDefaultChannel: true,
          cvrNumber: true,
        },
      });

      if (!company) {
        return NextResponse.json(
          { error: 'Company not found' },
          { status: 404 }
        );
      }

      let healthy = false;

      // If connected, test the connection with a timeout
      if (company.storecoveConnected) {
        try {
          const testResult = await Promise.race([
            storecoveClient.testConnection(),
            new Promise<{ connected: boolean }>((_, reject) =>
              setTimeout(() => reject(new Error('Connection test timed out')), 10000)
            ),
          ]);

          healthy = testResult.connected;

          // Update last tested timestamp if test succeeded
          if (testResult.connected) {
            await db.company.update({
              where: { id: ctx.activeCompanyId! },
              data: { storecoveLastTestedAt: new Date() },
            });
          }
        } catch (error) {
          // Timeout or connection error — mark as unhealthy
          healthy = false;
          logger.warn('[STORECOVE_STATUS] Connection test failed or timed out', {
            companyId: ctx.activeCompanyId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return NextResponse.json({
        connected: company.storecoveConnected,
        apiKeyId: company.storecoveApiKeyId,
        legalEntityId: company.storecoveLegalEntityId,
        connectedAt: company.storecoveConnectedAt,
        lastTestedAt: company.storecoveLastTestedAt,
        healthy,
        einvoiceEnabled: company.einvoiceEnabled,
        defaultChannel: company.einvoiceDefaultChannel,
        cvrNumber: company.cvrNumber,
      });
    } catch (error) {
      logger.error('[STORECOVE_STATUS] Failed to get Storecove status:', error);
      const message = error instanceof Error ? error.message : 'Failed to get Storecove status';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
);
