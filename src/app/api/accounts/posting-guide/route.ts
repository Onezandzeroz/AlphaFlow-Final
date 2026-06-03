import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { auditUpdate, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import {
  requirePermission,
  tenantFilter,
  Permission,
  blockOversightMutation,
  requireNotDemoCompany,
} from '@/lib/rbac';
import { requireTokenPayAccess } from '@/lib/tokenpay';

// PUT - Update posting guide on a single account
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
    const { accountId, postingGuide } = body as {
      accountId: string;
      postingGuide: string;
    };

    if (!accountId) {
      return NextResponse.json(
        { error: 'accountId is required' },
        { status: 400 }
      );
    }

    // Verify the account belongs to this tenant
    const existing = await db.account.findFirst({
      where: { id: accountId, ...tenantFilter(ctx) },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const meta = requestMetadata(request);
    const companyId = ctx.activeCompanyId!;

    // Update the account's posting guide
    const updated = await db.account.update({
      where: { id: accountId },
      data: { postingGuide: postingGuide || null },
    });

    // Audit log
    await auditUpdate(
      ctx.id,
      'Account',
      accountId,
      { postingGuide: existing.postingGuide },
      { postingGuide: postingGuide || null },
      meta,
      companyId
    );

    return NextResponse.json({ account: updated });
  } catch (error) {
    logger.error('Update posting guide error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
