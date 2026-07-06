import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditUpdate, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { tenantFilter, Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { notifyDataChange } from '@/lib/notify-data-change';

// POST - Deactivate a bank connection.
//
// Deactivating pauses automatic synchronization but keeps the connection
// record (and its consent/tokens) so it can be reactivated later. This is a
// soft, reversible action — no data is deleted.
//
// A deactivated connection (status INACTIVE):
//   • stops scheduled auto-syncs (nextSyncAt cleared)
//   • remains visible in the bank-connections list
//   • keeps its already-synchronized bank statements fully intact
//   • can be permanently deleted via DELETE, or reactivated via /activate
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

      if (connection.status === 'INACTIVE') {
        return NextResponse.json(
          { error: 'Bankforbindelsen er allerede deaktiveret' },
          { status: 409 }
        );
      }

      const oldData = { status: connection.status, nextSyncAt: connection.nextSyncAt };

      const updated = await db.bankConnection.update({
        where: { id },
        data: {
          status: 'INACTIVE',
          nextSyncAt: null, // stop scheduled auto-syncs
        },
      });

      await auditUpdate(
        ctx.id,
        'BankConnection',
        id,
        oldData,
        { status: 'INACTIVE', nextSyncAt: null },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      notifyDataChange({ scope: 'bank-connections', companyId: ctx.activeCompanyId!, action: 'update' }).catch(() => {});

      return NextResponse.json({ connection: updated });
    } catch (error) {
      logger.error('Deactivate bank connection error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
