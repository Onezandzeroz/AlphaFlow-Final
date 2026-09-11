import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';
import { logger } from '@/lib/logger';

/**
 * GET /api/oversight/unverified-users
 *
 * Lists all users with `emailVerified = false` — i.e. users who registered
 * but never confirmed their email. These are typically people who changed
 * their mind, mistyped their email, or abandoned the sign-up flow.
 *
 * The App Owner (SuperDev) can hard-delete these users to keep the user
 * table clean (see DELETE /api/oversight/users/[userId]).
 *
 * SuperDev-only route. Returns users sorted by registration date (newest
 * first) with their company membership so the admin can see the context.
 *
 * Response (200):
 *   {
 *     users: [{
 *       id, email, businessName, createdAt,
 *       hasVerificationToken: boolean,
 *       companies: [{ id, name, isDemo, isSoleMember, role, createdAt }]
 *     }],
 *     total: number
 *   }
 */
export const GET = withGuard(
  { auth: true, requireSuperDev: true },
  async (request) => {
    try {
      const { searchParams } = new URL(request.url);
      const search = searchParams.get('search')?.trim().toLowerCase() || '';

      // Find users with emailVerified = false, deactivatedAt = null.
      // We exclude deactivated users (they are already handled by the
      // deactivation flow and should not appear in this cleanup list).
      const where: Record<string, unknown> = {
        emailVerified: false,
        deactivatedAt: null,
      };
      if (search) {
        where.OR = [
          { email: { contains: search, mode: 'insensitive' } },
          { businessName: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [users, total] = await Promise.all([
        db.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            businessName: true,
            createdAt: true,
            emailVerificationToken: true,
            companies: {
              select: {
                companyId: true,
                role: true,
                company: {
                  select: { id: true, name: true, isDemo: true, createdAt: true },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 500, // safety cap
        }),
        db.user.count({ where }),
      ]);

      // For each user, compute whether they are the sole member of any
      // of their companies — this determines whether deleting the user
      // should also delete the orphaned company.
      const usersWithSoleMemberFlag = await Promise.all(
        users.map(async (u) => {
          const companies = await Promise.all(
            u.companies.map(async (m) => {
              const memberCount = await db.userCompany.count({
                where: { companyId: m.companyId },
              });
              return {
                id: m.company.id,
                name: m.company.name,
                isDemo: m.company.isDemo,
                createdAt: m.company.createdAt.toISOString(),
                isSoleMember: memberCount <= 1,
                role: m.role,
              };
            }),
          );
          return {
            id: u.id,
            email: u.email,
            businessName: u.businessName,
            createdAt: u.createdAt.toISOString(),
            hasVerificationToken: !!u.emailVerificationToken,
            companies,
          };
        }),
      );

      return NextResponse.json({
        users: usersWithSoleMemberFlag,
        total,
      });
    } catch (error) {
      logger.error('[UNVERIFIED_USERS] List failed:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
