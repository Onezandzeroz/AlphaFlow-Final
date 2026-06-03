import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import {
  requirePermission,
  tenantFilter,
  Permission,
  blockOversightMutation,
  requireNotDemoCompany,
} from '@/lib/rbac';
import {
  buildAutoMapping,
  getStandardAccount,
} from '@/lib/standard-chart-of-accounts';
import { requireTokenPayAccess } from '@/lib/tokenpay';

// POST - Generate automatic standard account mappings for all tenant accounts
export async function POST(request: NextRequest) {
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

    const companyId = ctx.activeCompanyId!;
    const meta = requestMetadata(request);

    // Fetch all accounts for the tenant
    const accounts = await db.account.findMany({
      where: tenantFilter(ctx),
      select: {
        id: true,
        number: true,
        name: true,
        type: true,
        group: true,
      },
    });

    if (accounts.length === 0) {
      return NextResponse.json({ total: 0, autoMapped: 0, unmapped: 0 });
    }

    // Build auto-mapping from FSR numbers to standard numbers
    const autoMap = buildAutoMapping(
      accounts.map((a) => ({
        number: a.number,
        name: a.name,
        type: a.type,
        group: a.group,
      }))
    );

    // Delete all existing mappings for this company
    await db.standardAccountMapping.deleteMany({
      where: { companyId },
    });

    // Clear publicStandardNumber on all accounts
    await db.account.updateMany({
      where: { companyId },
      data: { publicStandardNumber: null },
    });

    const createData: Array<{
      companyId: string;
      accountId: string;
      standardAccountNumber: string;
      standardAccountName: string;
      mappingType: string;
    }> = [];

    let autoMappedCount = 0;
    let unmappedCount = 0;

    for (const account of accounts) {
      const standardNumber = autoMap.get(account.number);

      if (standardNumber) {
        // Auto-mapped account
        const stdAccount = getStandardAccount(standardNumber);
        const stdName = stdAccount?.name ?? standardNumber;

        createData.push({
          companyId,
          accountId: account.id,
          standardAccountNumber: standardNumber,
          standardAccountName: stdName,
          mappingType: 'auto',
        });

        // Update Account.publicStandardNumber
        await db.account.update({
          where: { id: account.id },
          data: { publicStandardNumber: standardNumber },
        });

        autoMappedCount++;
      } else {
        // Unmapped account
        createData.push({
          companyId,
          accountId: account.id,
          standardAccountNumber: 'UNMAPPED',
          standardAccountName: 'Ikke tilknyttet',
          mappingType: 'none',
        });

        unmappedCount++;
      }
    }

    // Bulk create all mappings
    if (createData.length > 0) {
      await db.standardAccountMapping.createMany({
        data: createData,
        skipDuplicates: true,
      });
    }

    // Audit log the auto-mapping run
    await auditCreate(
      ctx.id,
      'Account',
      companyId,
      {
        action: 'AUTO_MAP_STANDARD_ACCOUNTS',
        totalAccounts: accounts.length,
        autoMapped: autoMappedCount,
        unmapped: unmappedCount,
      },
      meta,
      companyId
    );

    const totalMappings = await db.standardAccountMapping.count({
      where: { companyId },
    });

    return NextResponse.json({
      total: totalMappings,
      autoMapped: autoMappedCount,
      unmapped: unmappedCount,
    });
  } catch (error) {
    logger.error('Auto-map standard accounts error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
