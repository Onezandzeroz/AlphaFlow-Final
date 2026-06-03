import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { auditCreate, auditUpdate, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import {
  requirePermission,
  tenantFilter,
  Permission,
  blockOversightMutation,
  requireNotDemoCompany,
} from '@/lib/rbac';
import { getStandardAccount } from '@/lib/standard-chart-of-accounts';
import { requireTokenPayAccess } from '@/lib/tokenpay';

// GET - List all standard account mappings for the current company
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const mappings = await db.standardAccountMapping.findMany({
      where: { companyId: ctx.activeCompanyId! },
      include: {
        account: {
          select: { number: true, name: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const result = mappings.map((m) => ({
      accountId: m.accountId,
      accountNumber: m.account.number,
      accountName: m.account.name,
      standardAccountNumber: m.standardAccountNumber,
      standardAccountName: m.standardAccountName,
      mappingType: m.mappingType,
    }));

    return NextResponse.json({ mappings: result });
  } catch (error) {
    logger.error('List standard mappings error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Bulk upsert standard account mappings
export async function PUT(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const permDenied = requirePermission(ctx, Permission.DATA_EDIT);
    if (permDenied) return permDenied;

    const accessDenied = await requireTokenPayAccess(ctx.id);
    if (accessDenied) return accessDenied;

    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    const body = await request.json();
    const { mappings } = body as {
      mappings: Array<{ accountId: string; standardAccountNumber: string }>;
    };

    if (!Array.isArray(mappings) || mappings.length === 0) {
      return NextResponse.json(
        { error: 'mappings array is required and must not be empty' },
        { status: 400 }
      );
    }

    const companyId = ctx.activeCompanyId!;
    const meta = requestMetadata(request);
    let upsertedCount = 0;

    for (const mapping of mappings) {
      const { accountId, standardAccountNumber } = mapping;

      if (!accountId || !standardAccountNumber) continue;

      // Validate the standard account number exists
      const stdAccount = getStandardAccount(standardAccountNumber);
      if (!stdAccount) {
        logger.warn(
          `Skipping mapping: unknown standard account number ${standardAccountNumber}`
        );
        continue;
      }

      // Verify the account belongs to this tenant
      const account = await db.account.findFirst({
        where: { id: accountId, ...tenantFilter(ctx) },
      });

      if (!account) continue;

      const oldMapping = await db.standardAccountMapping.findUnique({
        where: { companyId_accountId: { companyId, accountId } },
      });

      // Delete existing mapping if present
      if (oldMapping) {
        await db.standardAccountMapping.delete({
          where: { companyId_accountId: { companyId, accountId } },
        });
      }

      // Create new mapping
      await db.standardAccountMapping.create({
        data: {
          companyId,
          accountId,
          standardAccountNumber,
          standardAccountName: stdAccount.name,
          mappingType: 'manual',
        },
      });

      // Update the Account.publicStandardNumber
      await db.account.update({
        where: { id: accountId },
        data: { publicStandardNumber: standardAccountNumber },
      });

      // Audit log
      if (oldMapping) {
        await auditUpdate(
          ctx.id,
          'Account',
          accountId,
          {
            standardAccountNumber: oldMapping.standardAccountNumber,
            mappingType: oldMapping.mappingType,
          },
          {
            standardAccountNumber,
            mappingType: 'manual',
          },
          meta,
          companyId
        );
      } else {
        await auditCreate(
          ctx.id,
          'Account',
          accountId,
          {
            standardAccountNumber,
            standardAccountName: stdAccount.name,
            mappingType: 'manual',
          },
          meta,
          companyId
        );
      }

      upsertedCount++;
    }

    return NextResponse.json({ count: upsertedCount });
  } catch (error) {
    logger.error('Upsert standard mappings error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
