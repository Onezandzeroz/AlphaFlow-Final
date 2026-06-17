import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { ContactType } from '@prisma/client';
import { logger } from '@/lib/logger';
import { tenantFilter, Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { notifyDataChange } from '@/lib/notify-data-change';

// GET - List contacts for the authenticated user
export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  async (request, ctx) => {
    try {
      const { searchParams } = new URL(request.url);
      const typeFilter = searchParams.get('type');
      const search = searchParams.get('search');

      const where: Record<string, unknown> = { ...tenantFilter(ctx) };

      if (typeFilter && Object.values(ContactType).includes(typeFilter as ContactType)) {
        where.type = typeFilter;
      }

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { cvrNumber: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { city: { contains: search, mode: 'insensitive' } },
        ];
      }

      const contacts = await db.contact.findMany({
        where,
        orderBy: { name: 'asc' },
      });

      return NextResponse.json({ contacts });
    } catch (error) {
      logger.error('List contacts error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

// POST - Create a new contact
export const POST = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_CREATE] },
  async (request, ctx) => {
    try {
      const body = await request.json();
      const { name, cvrNumber, email, phone, address, city, postalCode, country, type, notes } = body;

      if (!name) {
        return NextResponse.json(
          { error: 'Missing required field: name' },
          { status: 400 }
        );
      }

      // Validate contact type if provided
      if (type && !Object.values(ContactType).includes(type)) {
        return NextResponse.json(
          { error: `Invalid contact type. Must be one of: ${Object.values(ContactType).join(', ')}` },
          { status: 400 }
        );
      }

      const contact = await db.contact.create({
        data: {
          name,
          cvrNumber: cvrNumber || null,
          email: email || null,
          phone: phone || null,
          address: address || null,
          city: city || null,
          postalCode: postalCode || null,
          country: country || 'Danmark',
          type: type || 'CUSTOMER',
          notes: notes || null,
          userId: ctx.id,
          companyId: ctx.activeCompanyId!,
        },
      });

      await auditCreate(
        ctx.id,
        'Contact',
        contact.id,
        { name, cvrNumber, email, phone, type },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      notifyDataChange({ scope: 'contacts', companyId: ctx.activeCompanyId!, action: 'create' }).catch(() => {});

      return NextResponse.json({ contact }, { status: 201 });
    } catch (error) {
      logger.error('Create contact error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
