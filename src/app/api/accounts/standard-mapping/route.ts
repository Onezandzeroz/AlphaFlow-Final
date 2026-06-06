import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditCreate, auditUpdate, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { tenantFilter, Permission } from '@/lib/rbac';
import { getStandardAccount } from '@/lib/standard-chart-of-accounts';
import { withGuard } from '@/lib/route-guard';

// GET - List all standard account mappings for the current company
export const GET = withGuard({
  auth: true,
  requireCompany: true,
  permissions: [Permission.DATA_READ],
}, async (request, ctx) => {
  try {
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
});

// PUT - Bulk upsert standard account mappings
export const PUT = withGuard({
  auth: true,
  requireCompany: true,
  blockOversight: true,
  blockDemo: true,
  requireTokenPay: true,
  permissions: [Permission.DATA_EDIT],
}, async (request: NextRequest, ctx) => {
  try {
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
});
