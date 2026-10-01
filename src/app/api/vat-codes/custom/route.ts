import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditCreate, auditUpdate, auditDeleteAttempt, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { tenantFilter, Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

// Reserved codes that cannot be used as custom codes
const RESERVED_CODES = new Set(['S25', 'S12', 'S0', 'SEU', 'K25', 'K12', 'K0', 'KEU', 'KUF', 'NONE']);

// GET - List all custom VAT codes for the company
export const GET = withGuard({
  auth: true,
  requireCompany: true,
  permissions: [Permission.DATA_READ],
}, async (request: NextRequest, ctx) => {
  try {
    const codes = await db.customVatCode.findMany({
      where: { companyId: ctx.activeCompanyId! },
      orderBy: { code: 'asc' },
    });

    return NextResponse.json({ customVatCodes: codes });
  } catch (error) {
    logger.error('List custom VAT codes error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

// POST - Create a new custom VAT code
export const POST = withGuard({
  auth: true,
  requireCompany: true,
  blockOversight: true,
  blockDemo: true,
  requireTokenPay: true,
  permissions: [Permission.DATA_EDIT],
}, async (request: NextRequest, ctx) => {
  try {
    const body = await request.json();
    const { code, name, rate, direction, standardVatCode, description } = body as {
      code: string;
      name: string;
      rate: number;
      direction: string;
      standardVatCode?: string;
      description?: string;
    };

    // Validate required fields
    if (!code || !name || rate === undefined) {
      return NextResponse.json(
        { error: 'code, name, and rate are required' },
        { status: 400 }
      );
    }

    // Validate code doesn't collide with reserved codes
    const upperCode = code.toUpperCase().trim();
    if (RESERVED_CODES.has(upperCode)) {
      return NextResponse.json(
        { error: `Koden "${upperCode}" er reserveret til en indbygget momskode. Vælg et andet navn.` },
        { status: 400 }
      );
    }

    // Validate rate
    const rateNum = typeof rate === 'number' ? rate : parseInt(String(rate), 10);
    if (isNaN(rateNum) || rateNum < 0 || rateNum > 100) {
      return NextResponse.json(
        { error: 'Momssats skal være et heltal mellem 0 og 100' },
        { status: 400 }
      );
    }

    // Validate direction
    const dir = direction === 'input' ? 'input' : 'output';

    // Check for duplicate code within company
    const existing = await db.customVatCode.findFirst({
      where: { companyId: ctx.activeCompanyId!, code: upperCode },
    });
    if (existing) {
      return NextResponse.json(
        { error: `En custom momskode med koden "${upperCode}" findes allerede` },
        { status: 409 }
      );
    }

    const meta = requestMetadata(request);
    const customVatCode = await db.customVatCode.create({
      data: {
        companyId: ctx.activeCompanyId!,
        code: upperCode,
        name: name.trim(),
        rate: rateNum,
        direction: dir,
        standardVatCode: standardVatCode?.trim() || null,
        description: description?.trim() || null,
      },
    });

    await auditCreate(
      ctx.id,
      'CustomVatCode',
      customVatCode.id,
      {
        code: customVatCode.code,
        name: customVatCode.name,
        rate: customVatCode.rate,
        direction: customVatCode.direction,
        standardVatCode: customVatCode.standardVatCode,
      },
      meta,
      ctx.activeCompanyId!
    );

    return NextResponse.json({ customVatCode }, { status: 201 });
  } catch (error) {
    logger.error('Create custom VAT code error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

// PUT - Update a custom VAT code (including mapping to standard code)
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
    const { id, name, rate, direction, standardVatCode, description, isActive } = body as {
      id: string;
      name?: string;
      rate?: number;
      direction?: string;
      standardVatCode?: string | null;
      description?: string;
      isActive?: boolean;
    };

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      );
    }

    // Verify ownership
    const existing = await db.customVatCode.findFirst({
      where: { id, companyId: ctx.activeCompanyId! },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'Custom VAT code not found' },
        { status: 404 }
      );
    }

    const meta = requestMetadata(request);
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (rate !== undefined) {
      const rateNum = typeof rate === 'number' ? rate : parseInt(String(rate), 10);
      if (isNaN(rateNum) || rateNum < 0 || rateNum > 100) {
        return NextResponse.json(
          { error: 'Momssats skal være et heltal mellem 0 og 100' },
          { status: 400 }
        );
      }
      updateData.rate = rateNum;
    }
    if (direction !== undefined) updateData.direction = direction === 'input' ? 'input' : 'output';
    if (standardVatCode !== undefined) updateData.standardVatCode = standardVatCode?.trim() || null;
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updated = await db.customVatCode.update({
      where: { id },
      data: updateData,
    });

    await auditUpdate(
      ctx.id,
      'CustomVatCode',
      id,
      {
        name: existing.name,
        rate: existing.rate,
        standardVatCode: existing.standardVatCode,
      },
      updateData,
      meta,
      ctx.activeCompanyId!
    );

    return NextResponse.json({ customVatCode: updated });
  } catch (error) {
    logger.error('Update custom VAT code error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

// DELETE - Delete a custom VAT code
export const DELETE = withGuard({
  auth: true,
  requireCompany: true,
  blockOversight: true,
  blockDemo: true,
  requireTokenPay: true,
  permissions: [Permission.DATA_EDIT],
}, async (request: NextRequest, ctx) => {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      );
    }

    // Verify ownership
    const existing = await db.customVatCode.findFirst({
      where: { id, companyId: ctx.activeCompanyId! },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'Custom VAT code not found' },
        { status: 404 }
      );
    }

    const meta = requestMetadata(request);

    await db.customVatCode.delete({ where: { id } });

    await auditDeleteAttempt(
      ctx.id,
      'CustomVatCode',
      id,
      { ...meta, code: existing.code, name: existing.name },
      ctx.activeCompanyId!
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Delete custom VAT code error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
