import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditUpdate, auditCancel, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { tenantFilter, Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

// GET - Get a single account
export const GET = withGuard({
  auth: true,
  requireCompany: true,
  permissions: [Permission.DATA_READ],
}, async (request, ctx, context) => {
  try {
    const { id } = await context.params as { id: string };

    const account = await db.account.findFirst({
      where: { id, ...tenantFilter(ctx) },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({ account });
  } catch (error) {
    logger.error('Get account error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

// PUT - Update an account (prevent updating number)
export const PUT = withGuard({
  auth: true,
  requireCompany: true,
  blockOversight: true,
  blockDemo: true,
  requireTokenPay: true,
  permissions: [Permission.DATA_EDIT],
}, async (request, ctx, context) => {
  try {
    const { id } = await context.params as { id: string };
    const body = await request.json();
    const { number, name, nameEn, type, group, description, isActive, postingGuide } = body;

    const existing = await db.account.findFirst({
      where: { id, ...tenantFilter(ctx) },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Prevent updating the account number
    if (number && number !== existing.number) {
      return NextResponse.json(
        { error: 'Account number cannot be changed after creation' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (nameEn !== undefined) updateData.nameEn = nameEn || null;
    if (type !== undefined) updateData.type = type;
    if (group !== undefined) updateData.group = group;
    if (description !== undefined) updateData.description = description || null;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (postingGuide !== undefined) updateData.postingGuide = postingGuide || null;

    const account = await db.account.update({
      where: { id },
      data: updateData,
    });

    await auditUpdate(
      ctx.id,
      'Account',
      id,
      { name: existing.name, nameEn: existing.nameEn, type: existing.type, group: existing.group, description: existing.description, isActive: existing.isActive },
      updateData as Record<string, unknown>,
      requestMetadata(request),
      ctx.activeCompanyId
    );

    return NextResponse.json({ account });
  } catch (error) {
    logger.error('Update account error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

// DELETE - Soft-delete (set isActive=false, isSystem accounts cannot be deleted)
export const DELETE = withGuard({
  auth: true,
  requireCompany: true,
  blockOversight: true,
  blockDemo: true,
  requireTokenPay: true,
  permissions: [Permission.DATA_DELETE],
}, async (request, ctx, context) => {
  try {
    const { id } = await context.params as { id: string };

    const existing = await db.account.findFirst({
      where: { id, ...tenantFilter(ctx) },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (existing.isSystem) {
      return NextResponse.json(
        { error: 'System accounts cannot be deleted' },
        { status: 400 }
      );
    }

    const account = await db.account.update({
      where: { id },
      data: { isActive: false },
    });

    await auditCancel(
      ctx.id,
      'Account',
      id,
      'Account deactivated via DELETE',
      requestMetadata(request),
      ctx.activeCompanyId
    );

    return NextResponse.json({ account });
  } catch (error) {
    logger.error('Delete account error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
