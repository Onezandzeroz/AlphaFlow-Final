import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditCreate, auditUpdate, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { tenantFilter, Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { notifyDataChange } from '@/lib/notify-data-change';

// GET - Get single bank connection
export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.BANK_CONNECT] },
  async (request, ctx, context) => {
    try {
      const { id } = await context.params as { id: string };

      const connection = await db.bankConnection.findFirst({
        where: { id, ...tenantFilter(ctx) },
        include: {
          syncs: {
            orderBy: { startedAt: 'desc' },
            take: 10,
          },
          bankStatements: {
            orderBy: { startDate: 'desc' },
            take: 5,
            include: {
              lines: {
                orderBy: { date: 'desc' },
              },
            },
          },
        },
      });

      if (!connection) {
        return NextResponse.json(
          { error: 'Bankforbindelse ikke fundet' },
          { status: 404 }
        );
      }

      return NextResponse.json({ connection });
    } catch (error) {
      logger.error('Get bank connection error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);

// DELETE - Delete a bank connection (revoke consent)
export const DELETE = withGuard(
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

      // Mark as revoked instead of deleting (compliance: keep audit trail)
      await db.bankConnection.update({
        where: { id },
        data: {
          status: 'REVOKED',
          accessToken: null,
          refreshToken: null,
          consentExpiresAt: new Date(),
        },
      });

      await auditCreate(
        ctx.id,
        'BankConnection',
        id,
        { action: 'revoke', bankName: connection.bankName, accountNumber: connection.accountNumber },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      notifyDataChange({ scope: 'bank-connections', companyId: ctx.activeCompanyId!, action: 'delete' }).catch(() => {});

      return NextResponse.json({ success: true });
    } catch (error) {
      logger.error('Delete bank connection error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);

// PATCH - Update connection settings
export const PATCH = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.BANK_CONNECT] },
  async (request, ctx, context) => {
    try {
      const { id } = await context.params as { id: string };
      const body = await request.json();
      const { syncFrequency, accountName } = body;

      const connection = await db.bankConnection.findFirst({
        where: { id, ...tenantFilter(ctx) },
      });

      if (!connection) {
        return NextResponse.json(
          { error: 'Bankforbindelse ikke fundet' },
          { status: 404 }
        );
      }

      const oldData = { syncFrequency: connection.syncFrequency, accountName: connection.accountName };

      const updateData: Record<string, unknown> = {};
      if (syncFrequency && ['hourly', 'daily', 'manual'].includes(syncFrequency)) {
        updateData.syncFrequency = syncFrequency;
        // Update nextSyncAt based on new frequency
        if (syncFrequency === 'manual') {
          updateData.nextSyncAt = null;
        } else {
          const nextSync = new Date();
          if (syncFrequency === 'hourly') {
            nextSync.setHours(nextSync.getHours() + 1);
          } else {
            nextSync.setDate(nextSync.getDate() + 1);
            nextSync.setHours(6, 0, 0, 0);
          }
          updateData.nextSyncAt = nextSync;
        }
      }
      if (accountName !== undefined) {
        updateData.accountName = accountName;
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

      return NextResponse.json({ connection: updated });
    } catch (error) {
      logger.error('Update bank connection error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
