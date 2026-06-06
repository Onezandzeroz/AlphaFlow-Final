import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { performSync } from '@/app/api/bank-connections/route';
import { tenantFilter, Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

// POST - Trigger manual sync for a bank connection
export const POST = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.BANK_SYNC] },
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

      if (connection.status === 'REVOKED') {
        return NextResponse.json(
          { error: 'Bankforbindelse er tilbagekaldt' },
          { status: 400 }
        );
      }

      // Check if already syncing
      const pendingSync = await db.bankConnectionSync.findFirst({
        where: {
          bankConnectionId: id,
          status: 'PENDING',
        },
      });

      if (pendingSync) {
        return NextResponse.json(
          { error: 'Synkronisering er allerede i gang', syncId: pendingSync.id },
          { status: 409 }
        );
      }

      await auditCreate(
        ctx.id,
        'BankConnection',
        id,
        { action: 'manual_sync', bankName: connection.bankName },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      const result = await performSync(id, ctx.id);

      return NextResponse.json({ sync: result });
    } catch (error) {
      logger.error('Manual sync error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
