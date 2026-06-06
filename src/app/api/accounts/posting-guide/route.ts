import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditUpdate, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { tenantFilter, Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

// PUT - Update posting guide on a single account
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
});
