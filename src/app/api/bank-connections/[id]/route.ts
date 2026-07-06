import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditCreate, auditDeleteAttempt, auditUpdate, requestMetadata } from '@/lib/audit';
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

// DELETE - Hard-delete a bank connection.
//
// SAFETY: A bank connection can only be permanently deleted when it is already
// deactivated (status INACTIVE) or has its consent revoked (status REVOKED).
// This prevents accidental data-affecting deletions of active connections.
//
// DATA PRESERVATION: Already synchronized/uploaded bank statements and their
// lines are NOT deleted. The BankStatement.bankConnection relation uses
// onDelete: SetNull, so when the BankConnection row is removed, the related
// BankStatements simply have their bankConnectionId set to NULL — the
// transaction data stays fully intact and visible in the reconciliation views.
// Only the BankConnectionSync log rows (sync metadata) are cascade-deleted.
export const DELETE = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.BANK_CONNECT] },
  async (request, ctx, context) => {
    try {
      const { id } = await context.params as { id: string };

      const connection = await db.bankConnection.findFirst({
        where: { id, ...tenantFilter(ctx) },
        include: {
          _count: {
            select: {
              bankStatements: true,
              syncs: true,
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

      // Enforce the safety gate: only deactivated/revoked connections can be
      // permanently deleted. Active or pending connections must be deactivated
      // first.
      if (connection.status !== 'INACTIVE' && connection.status !== 'REVOKED') {
        return NextResponse.json(
          {
            error:
              'Bankforbindelsen skal deaktiveres før den kan slettes permanent',
            status: connection.status,
          },
          { status: 409 }
        );
      }

      const preservedStatements = connection._count.bankStatements;
      const removedSyncLogs = connection._count.syncs;

      // Hard-delete the connection.
      // → BankStatement rows: bankConnectionId set to NULL (data preserved)
      // → BankConnectionSync rows: cascade-deleted (sync metadata only)
      await db.bankConnection.delete({
        where: { id },
      });

      await auditDeleteAttempt(
        ctx.id,
        'BankConnection',
        id,
        {
          ...requestMetadata(request),
          bankName: connection.bankName,
          accountNumber: connection.accountNumber,
          provider: connection.provider,
          previousStatus: connection.status,
          preservedStatements,
          removedSyncLogs,
        },
        ctx.activeCompanyId
      );

      notifyDataChange({ scope: 'bank-connections', companyId: ctx.activeCompanyId!, action: 'delete' }).catch(() => {});

      return NextResponse.json({
        success: true,
        preservedStatements,
        removedSyncLogs,
      });
    } catch (error) {
      logger.error('Delete bank connection error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);

// PATCH - Update connection details.
//
// Allows editing: bankName, registrationNumber, accountNumber, iban,
// accountName, syncFrequency. Changing accountNumber is checked against the
// @@unique([companyId, accountNumber]) constraint to avoid duplicates.
export const PATCH = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.BANK_CONNECT] },
  async (request, ctx, context) => {
    try {
      const { id } = await context.params as { id: string };
      const body = await request.json();
      const {
        bankName,
        registrationNumber,
        accountNumber,
        iban,
        accountName,
        syncFrequency,
      } = body;

      const connection = await db.bankConnection.findFirst({
        where: { id, ...tenantFilter(ctx) },
      });

      if (!connection) {
        return NextResponse.json(
          { error: 'Bankforbindelse ikke fundet' },
          { status: 404 }
        );
      }

      // Capture old values for the audit trail (only fields we may change).
      const oldData = {
        bankName: connection.bankName,
        registrationNumber: connection.registrationNumber,
        accountNumber: connection.accountNumber,
        iban: connection.iban,
        accountName: connection.accountName,
        syncFrequency: connection.syncFrequency,
      };

      const updateData: Record<string, unknown> = {};

      // bankName
      if (typeof bankName === 'string' && bankName.trim() && bankName !== connection.bankName) {
        updateData.bankName = bankName.trim();
      }

      // registrationNumber (nullable; accept null to clear)
      if (registrationNumber !== undefined) {
        const normalized = typeof registrationNumber === 'string' ? registrationNumber.trim() : '';
        if (normalized && !/^\d{4}$/.test(normalized)) {
          return NextResponse.json(
            { error: 'Registreringsnummer skal være 4 cifre' },
            { status: 400 }
          );
        }
        updateData.registrationNumber = normalized || null;
      }

      // accountNumber — validate uniqueness if it is changing
      if (typeof accountNumber === 'string' && accountNumber.trim() && accountNumber.trim() !== connection.accountNumber) {
        const newAccountNumber = accountNumber.trim();
        const duplicate = await db.bankConnection.findFirst({
          where: {
            companyId: connection.companyId,
            accountNumber: newAccountNumber,
            NOT: { id },
          },
          select: { id: true },
        });
        if (duplicate) {
          return NextResponse.json(
            { error: 'En anden bankforbindelse bruger allerede dette kontonummer' },
            { status: 409 }
          );
        }
        updateData.accountNumber = newAccountNumber;
      }

      // iban (nullable; accept null/empty to clear)
      if (iban !== undefined) {
        const normalized = typeof iban === 'string' ? iban.trim() : '';
        updateData.iban = normalized || null;
      }

      // accountName (nullable; accept empty string to clear)
      if (accountName !== undefined) {
        updateData.accountName = typeof accountName === 'string' ? accountName.trim() || null : null;
      }

      // syncFrequency — recompute nextSyncAt when it changes
      if (syncFrequency !== undefined) {
        if (!['hourly', 'daily', 'manual'].includes(syncFrequency)) {
          return NextResponse.json(
            { error: 'Ugyldig synkroniseringsfrekvens' },
            { status: 400 }
          );
        }
        updateData.syncFrequency = syncFrequency;
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

      // If nothing changed, short-circuit (still 200, no-op).
      if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ connection, unchanged: true });
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
      logger.error('Update bank connection error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
