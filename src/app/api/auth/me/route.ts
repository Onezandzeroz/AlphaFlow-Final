import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withGuard } from '@/lib/route-guard';
import { getSeatCap, type PlanTier } from '@/lib/plan-features';

export const GET = withGuard({ auth: 'optional' }, async (request, ctx) => {
  try {
    if (!ctx) {
      return NextResponse.json({ user: null });
    }

    // Fetch user's companies for the company selector
    const companies = await db.userCompany.findMany({
      where: { userId: ctx.id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            isDemo: true,
            isActive: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    // Check if any App Owner (isSuperDev) exists in the system
    const existingAppOwner = await db.user.findFirst({
      where: { isSuperDev: true },
      select: { id: true },
    });
    const hasAppOwner = existingAppOwner !== null;

    // Append "- App-owner" to company name when the user is the App Owner
    // and their active company is named "AlphaAi"
    let displayCompanyName = ctx.activeCompanyName;
    if (ctx.isSuperDev && displayCompanyName === 'AlphaAi') {
      displayCompanyName = 'AlphaAi - App-owner';
    }

    // For the company list, also append the badge to AlphaAi company if user is SuperDev
    const mappedCompanies = companies.map(c => ({
      id: c.company.id,
      name: c.company.name === 'AlphaAi' && ctx.isSuperDev
        ? 'AlphaAi - App-owner'
        : c.company.name,
      role: c.role,
      isDemo: c.company.isDemo,
      isActive: c.company.isActive,
    }));

    // ── Compute seat usage for the active company (FASE 5) ──
    let seatCap: number | null = null;
    let seatCount = 0;
    if (ctx.activeCompanyId) {
      seatCap = getSeatCap(ctx.planTier as PlanTier);
      const [memberCount, pendingInvites] = await Promise.all([
        db.userCompany.count({ where: { companyId: ctx.activeCompanyId } }),
        db.invitation.count({
          where: {
            companyId: ctx.activeCompanyId,
            status: 'PENDING',
          },
        }),
      ]);
      seatCount = memberCount + pendingInvites;
    }

    return NextResponse.json({
      user: {
        id: ctx.id,
        email: ctx.email,
        emailVerified: ctx.isSuperDev ? true : ctx.emailVerified,
        businessName: ctx.businessName,
        demoModeEnabled: ctx.demoModeEnabled,
        isDemoCompany: ctx.isDemoCompany,
        isSuperDev: ctx.isSuperDev,
        hasAppOwner,
        activeCompanyId: ctx.activeCompanyId,
        activeCompanyRole: ctx.activeCompanyRole,
        activeCompanyName: displayCompanyName,
        oversightCompanyId: ctx.oversightCompanyId,
        oversightCompanyName: ctx.oversightCompanyName,
        isOversightMode: ctx.isOversightMode,
        // ── Project Mode (FASE 4) ──
        projectModeEnabled: ctx.projectModeEnabled,
        activeProjectId: ctx.activeProjectId,
        activeProjectName: ctx.activeProjectName,
        activeProjectColor: ctx.activeProjectColor,
        activeProjectStatus: ctx.activeProjectStatus,
        activeProjectStartDate: ctx.activeProjectStartDate,
        activeProjectEndDate: ctx.activeProjectEndDate,
        isProjectMode: ctx.isProjectMode,
        // ── Subscription plan (FASE 5 — feature gating) ──
        planTier: ctx.planTier,
        planPurchasedAt: ctx.planPurchasedAt,
        planExpiresAt: ctx.planExpiresAt,
        availableFeatures: ctx.availableFeatures,
        seatCap,
        seatCount,
        companies: mappedCompanies,
      },
    });
  } catch (error) {
    logger.error('Get user error:', error);
    return NextResponse.json({ user: null });
  }
});
