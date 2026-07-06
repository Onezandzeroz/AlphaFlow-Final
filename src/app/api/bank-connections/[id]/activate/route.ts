import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditUpdate, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { tenantFilter, Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { notifyDataChange } from '@/lib/notify-data-change';

// POST - Reactivate a previously deactivated bank connection.
//
// Reactivation restores the connection to ACTIVE status and resumes scheduled
// auto-syncs based on its syncFrequency. If the underlying bank consent has
// expired, the connection is moved to EXPIRED instead and the user is told to
// renew consent before it can sync again.
export const POST = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.BANK_CONNECT] },
  async (request, ctx, context) => {
    try {
      const { id } = await context.params as { id: string };

      const connection = await db.bankConnection.findFirst({
        where: { id, ...tenantFilter(ctx) },
      });

      if (!connection) {
        return NextResponse.json(
          { error: 'Bankforbindelse ikke fundet' },
          { status: 404 }
        );
      }

      if (connection.status === 'ACTIVE') {
        return NextResponse.json(
          { error: 'Bankforbindelsen er allerede aktiv' },
          { status: 409 }
        );
      }

      const oldData = { status: connection.status, nextSyncAt: connection.nextSyncAt };

      // If the consent has expired, we cannot reactivate directly — the user
      // must renew consent first.
      const now = new Date();
      const consentExpired = connection.consentExpiresAt
        ? new Date(connection.consentExpiresAt) < now
        : connection.status === 'EXPIRED';

      if (consentExpired) {
        const updated = await db.bankConnection.update({
          where: { id },
          data: { status: 'EXPIRED' },
        });
        await auditUpdate(
          ctx.id,
          'BankConnection',
          id,
          oldData,
          { status: 'EXPIRED' },
          requestMetadata(request),
          ctx.activeCompanyId
        );
        notifyDataChange({ scope: 'bank-connections', companyId: ctx.activeCompanyId!, action: 'update' }).catch(() => {});
        return NextResponse.json(
          {
            error: 'Bankgodkendelsen er udløbet — fornys godkendelsen, før forbindelsen kan reaktiveres',
            connection: updated,
            needsConsentRenewal: true,
          },
          { status: 409 }
        );
      }

      // Restore ACTIVE status and recompute the next scheduled sync.
      const updateData: { status: 'ACTIVE'; nextSyncAt: Date | null } = {
        status: 'ACTIVE',
        nextSyncAt: null,
      };
      if (connection.syncFrequency !== 'manual') {
        const nextSync = new Date();
        if (connection.syncFrequency === 'hourly') {
          nextSync.setHours(nextSync.getHours() + 1);
        } else {
          nextSync.setDate(nextSync.getDate() + 1);
          nextSync.setHours(6, 0, 0, 0);
        }
        updateData.nextSyncAt = nextSync;
      }

      const updated = await db.bankConnection.update({
        where: { id },
        data: updateData,
      });

      await auditUpdate(
        ctx.id,
        'BankConnection',
        id,
        oldData,
        updateData,
        requestMetadata(request),
        ctx.activeCompanyId
      );

      notifyDataChange({ scope: 'bank-connections', companyId: ctx.activeCompanyId!, action: 'update' }).catch(() => {});

      return NextResponse.json({ connection: updated });
    } catch (error) {
      logger.error('Activate bank connection error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
