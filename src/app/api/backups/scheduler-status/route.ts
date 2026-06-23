import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCronHealth, getSchedulerStatus } from '@/lib/backup-scheduler';
import { logger } from '@/lib/logger';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

/**
 * GET /api/backups/scheduler-status — Get backup scheduler health for active company
 */
export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  async (request, ctx) => {
    try {
      const companyId = ctx.activeCompanyId!;

      // Per-company cron health (async — queries DB for existing backups)
      const cronHealth = await getCronHealth(companyId);

      // Global scheduler status
      const schedulerInfo = getSchedulerStatus();

      // Aggregate backup statistics for this company
      const [totalBackups, completedBackups, failedCount, totalStorageResult, latestBackup] =
        await Promise.all([
          db.backup.count({ where: { companyId } }),
          db.backup.count({ where: { companyId, status: 'completed' } }),
          db.backup.count({ where: { companyId, status: 'failed' } }),
          db.backup.aggregate({
            where: { companyId, status: 'completed' },
            _sum: { fileSize: true },
          }),
          db.backup.findFirst({
            where: { companyId, status: 'completed' },
            orderBy: { createdAt: 'desc' },
            select: {
              createdAt: true,
              backupType: true,
              triggerType: true,
            },
          }),
        ]);

      // Auto backup counts per type
      const autoBackupCounts = await Promise.all(
        (['hourly', 'daily', 'weekly', 'monthly'] as const).map(async (type) => {
          const count = await db.backup.count({
            where: { companyId, backupType: type, triggerType: 'automatic', status: 'completed' },
          });
          const last = await db.backup.findFirst({
            where: { companyId, backupType: type, triggerType: 'automatic', status: 'completed' },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          });
          return {
            type,
            count,
            lastAt: last?.createdAt?.toISOString() ?? null,
          };
        })
      );

      // Recent cron execution history (last 20 entries for this company or global)
      const recentExecutions = await db.cronExecution.findMany({
        where: {
          OR: [
            { companyId },
            { companyId: null }, // global jobs
          ],
        },
        orderBy: { startedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          jobType: true,
          status: true,
          companiesTotal: true,
          companiesSuccess: true,
          companiesError: true,
          companiesSkipped: true,
          errorMessage: true,
          startedAt: true,
          finishedAt: true,
          durationMs: true,
          catchup: true,
        },
      });

      return NextResponse.json({
        scheduler: {
          running: schedulerInfo.running,
          scheduledTasks: schedulerInfo.tasksCount,
          cronHealth,
          schedules: schedulerInfo.schedules,
          autoBackupCounts,
          recentExecutions: recentExecutions.map(e => ({
            ...e,
            startedAt: e.startedAt.toISOString(),
            finishedAt: e.finishedAt?.toISOString() ?? null,
          })),
          stats: {
            totalBackupCount: totalBackups,
            completedBackupCount: completedBackups,
            failedCount,
            totalStorage: totalStorageResult._sum?.fileSize ?? 0,
            latestBackup: latestBackup
              ? {
                  createdAt: latestBackup.createdAt.toISOString(),
                  backupType: latestBackup.backupType,
                  triggerType: latestBackup.triggerType,
                }
              : null,
          },
        },
      });
    } catch (error) {
      logger.error('[API /backups/scheduler-status] GET failed:', error);
      return NextResponse.json({ error: 'Failed to fetch scheduler status' }, { status: 500 });
    }
  }
);
