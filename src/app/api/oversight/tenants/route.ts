import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { logger } from '@/lib/logger';
import { tokenpay } from '@/lib/tokenpay';

interface TrialInfo {
  isActive: boolean;
  earliestExpiry: string | null;
  activeMembers: number;
}

/**
 * GET /api/oversight/tenants — List all tenants for the App Owner oversight view.
 */
export const GET = withGuard(routeConfig['/api/oversight/tenants'].GET!, async (request, ctx) => {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim() || '';
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 50)));
    const skip = (page - 1) * limit;

    // Build where clause for search
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { cvrNumber: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Fetch all companies with member user IDs
    const [companies, total] = await Promise.all([
      db.company.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          cvrNumber: true,
          companyType: true,
          isDemo: true,
          isActive: true,
          createdAt: true,
          _count: {
            select: { members: true },
          },
          members: {
            select: {
              userId: true,
              user: { select: { id: true, email: true, businessName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.company.count({ where }),
    ]);

    // Batch-fetch trial status: get all TokenPay users in one call
    let tpUsers: Map<string, { accessLevel: string; accessExpiry: string | null }> = new Map();
    try {
      const allTpUsers = await tokenpay.listUsers();
      for (const u of allTpUsers) {
        tpUsers.set(u.id, { accessLevel: u.accessLevel, accessExpiry: u.accessExpiry });
      }
    } catch {
      // TokenPay might be unavailable — log but don't fail the tenants response
      logger.warn('[OVERSIGHT] Could not reach TokenPay service for trial status');
    }

    // Build trial info per company
    function getTrialInfo(members: Array<{ userId: string }>): TrialInfo {
      const now = new Date();
      let earliestExpiry: string | null = null;
      let activeMembers = 0;

      for (const member of members) {
        const tpUser = tpUsers.get(member.userId);
        if (!tpUser) continue;
        if (tpUser.accessLevel === 'read_write' && tpUser.accessExpiry) {
          const expiry = new Date(tpUser.accessExpiry);
          if (expiry > now) {
            activeMembers++;
            if (!earliestExpiry || tpUser.accessExpiry < earliestExpiry) {
              earliestExpiry = tpUser.accessExpiry;
            }
          }
        }
      }

      return {
        isActive: activeMembers > 0,
        earliestExpiry,
        activeMembers,
      };
    }

    return NextResponse.json({
      tenants: companies.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        cvrNumber: c.cvrNumber,
        companyType: c.companyType,
        isDemo: c.isDemo,
        isActive: c.isActive,
        memberCount: c._count.members,
        createdAt: c.createdAt,
        trial: getTrialInfo(c.members),
      })),
      total,
      page,
      limit,
    });
  } catch (error) {
    logger.error('List oversight tenants error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
