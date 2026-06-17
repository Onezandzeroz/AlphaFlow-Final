import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { AccountType, AccountGroup } from '@prisma/client';
import { logger } from '@/lib/logger';
import { tenantFilter, Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { notifyDataChange } from '@/lib/notify-data-change';

// GET - List all accounts for the authenticated user
export const GET = withGuard({
  auth: true,
  requireCompany: true,
  permissions: [Permission.DATA_READ],
}, async (request: NextRequest, ctx) => {
  try {
    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get('type');
    const groupFilter = searchParams.get('group');

    const where: Record<string, unknown> = { ...tenantFilter(ctx) };
    if (typeFilter && Object.values(AccountType).includes(typeFilter as AccountType)) {
      where.type = typeFilter;
    }
    if (groupFilter && Object.values(AccountGroup).includes(groupFilter as AccountGroup)) {
      where.group = groupFilter;
    }

    const accounts = await db.account.findMany({
      where,
      orderBy: { number: 'asc' },
    });

    return NextResponse.json({ accounts });
  } catch (error) {
    logger.error('List accounts error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

// POST - Create a new account
export const POST = withGuard({
  auth: true,
  requireCompany: true,
  blockOversight: true,
  blockDemo: true,
  requireTokenPay: true,
  permissions: [Permission.DATA_CREATE],
}, async (request: NextRequest, ctx) => {
  try {
    const body = await request.json();
    const { number, name, nameEn, type, group, description } = body;

    if (!number || !name || !type || !group) {
      return NextResponse.json(
        { error: 'Missing required fields: number, name, type, group' },
        { status: 400 }
      );
    }

    // Validate enum values
    if (!Object.values(AccountType).includes(type)) {
      return NextResponse.json(
        { error: `Invalid account type. Must be one of: ${Object.values(AccountType).join(', ')}` },
        { status: 400 }
      );
    }
    if (!Object.values(AccountGroup).includes(group)) {
      return NextResponse.json(
        { error: `Invalid account group. Must be one of: ${Object.values(AccountGroup).join(', ')}` },
        { status: 400 }
      );
    }

    // Check number uniqueness per user (within the same demo context)
    const existing = await db.account.findFirst({
      where: { ...tenantFilter(ctx), number },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this number already exists' },
        { status: 409 }
      );
    }

    const account = await db.account.create({
      data: {
        number,
        name,
        nameEn: nameEn || null,
        type,
        group,
        description: description || null,
        userId: ctx.id,
        companyId: ctx.activeCompanyId!,
      },
    });

    await auditCreate(
      ctx.id,
      'Account',
      account.id,
      { number, name, nameEn, type, group, description },
      requestMetadata(request),
      ctx.activeCompanyId
    );

    notifyDataChange({ scope: 'accounts', companyId: ctx.activeCompanyId!, action: 'create' }).catch(() => {});

    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    logger.error('Create account error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
