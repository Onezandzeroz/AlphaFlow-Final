import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { seedProjectAccounts, PROJECT_CHART_TEMPLATE } from '@/lib/project-chart-template';
import { logger } from '@/lib/logger';
import { withGuard } from '@/lib/route-guard';
import { notifyDataChange } from '@/lib/notify-data-change';

/**
 * POST /api/accounts/seed-project
 *
 * Seeds the supplementary project-oriented accounts (project revenue,
 * WIP, project expenses) into the active company's chart of accounts.
 *
 * Idempotent: account numbers that already exist are skipped, so this
 * can be run on top of the standard chart of accounts without
 * duplicating.
 *
 * Returns: { created, skipped, total: number }
 */
export const POST = withGuard(
  {
    auth: true,
    requireCompany: true,
    blockOversight: true,
    blockDemo: true,
    requireTokenPay: true,
  },
  async (request, ctx) => {
    try {
      const result = await seedProjectAccounts(ctx.id, ctx.activeCompanyId!);

      await auditCreate(
        ctx.id,
        'Account',
        ctx.activeCompanyId!,
        {
          type: 'project_chart_seed',
          created: result.created,
          skipped: result.skipped,
          templateCount: PROJECT_CHART_TEMPLATE.length,
        },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      // Notify all connected clients that the accounts list changed
      notifyDataChange({
        scope: 'accounts',
        companyId: ctx.activeCompanyId!,
        action: 'create',
      }).catch(() => {});

      logger.info(
        `[SEED-PROJECT] Seeded project accounts for company ${ctx.activeCompanyId}: created=${result.created}, skipped=${result.skipped}`,
        { performedBy: ctx.id }
      );

      return NextResponse.json({
        seeded: true,
        created: result.created,
        skipped: result.skipped,
        total: PROJECT_CHART_TEMPLATE.length,
      });
    } catch (error) {
      logger.error('Seed project accounts error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
