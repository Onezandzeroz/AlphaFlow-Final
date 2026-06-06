import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { logger } from '@/lib/logger';

// GET /api/companies - List user's companies
export const GET = withGuard(routeConfig['/api/companies'].GET!, async (request, ctx) => {
  try {
    const memberships = await db.userCompany.findMany({
      where: { userId: ctx.id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            isDemo: true,
            isActive: true,
            cvrNumber: true,
            companyType: true,
            createdAt: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return NextResponse.json({
      companies: memberships.map(m => ({
        id: m.company.id,
        name: m.company.name,
        role: m.role,
        isDemo: m.company.isDemo,
        isActive: m.company.isActive,
        cvrNumber: m.company.cvrNumber,
        companyType: m.company.companyType,
        joinedAt: m.joinedAt,
        createdAt: m.company.createdAt,
      })),
    });
  } catch (error) {
    logger.error('List companies error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
