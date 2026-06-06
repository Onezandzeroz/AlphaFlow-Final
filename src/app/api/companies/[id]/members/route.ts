import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { logger } from '@/lib/logger';

/**
 * GET /api/companies/[id]/members — List all members of a company
 */
export const GET = withGuard(routeConfig['/api/companies/[id]/members'].GET!, async (request, ctx, segmentData) => {
  try {
    const companyId = segmentData?.id as string;

    // Verify user belongs to this company (or is SuperDev)
    const membership = await db.userCompany.findUnique({
      where: { userId_companyId: { userId: ctx.id, companyId } },
    });
    if (!membership && !ctx.isSuperDev) {
      return NextResponse.json({ error: 'Not a member of this company' }, { status: 403 });
    }

    const members = await db.userCompany.findMany({
      where: { companyId },
      include: {
        user: {
          select: { id: true, email: true, businessName: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return NextResponse.json({
      members: members.map(m => ({
        userId: m.user.id,
        email: m.user.email,
        businessName: m.user.businessName,
        role: m.role,
        joinedAt: m.joinedAt,
        invitedBy: m.invitedBy,
      })),
    });
  } catch (error) {
    logger.error('List members error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
