import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createBackup } from '@/lib/backup-engine';
import { logger } from '@/lib/logger';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

/**
 * GET /api/backups — List all backups for the active company
 */
export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  async (request, ctx) => {
    try {
      const companyId = ctx.activeCompanyId!;

      const backups = await db.backup.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          triggerType: true,
          backupType: true,
          scope: true,
          filePath: true,
          fileSize: true,
          sha256: true,
          status: true,
          errorMessage: true,
          expiresAt: true,
          createdAt: true,
          companyName: true,
          userEmail: true,
        },
      });

      return NextResponse.json({ backups });
    } catch (error) {
      logger.error('[API /backups] GET failed:', error);
      return NextResponse.json({ error: 'Failed to fetch backups' }, { status: 500 });
    }
  }
);

/**
 * POST /api/backups — Create a manual backup for the active company
 */
export const POST = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, requireTokenPay: true, permissions: [Permission.BACKUP_CREATE] },
  async (request, ctx) => {
    try {
      const companyId = ctx.activeCompanyId!;
      const userId = ctx.id;

      // All backups use tenant-snapshot scope (full-db removed after PostgreSQL migration)
      const result = await createBackup(userId, 'manual', 'manual', companyId, 'tenant');

      if (!result) {
        return NextResponse.json({ error: 'Failed to create backup' }, { status: 500 });
      }

      // Return the full backup record for the UI
      const backup = await db.backup.findUnique({
        where: { id: result.id },
        select: {
          id: true,
          triggerType: true,
          backupType: true,
          scope: true,
          filePath: true,
          fileSize: true,
          sha256: true,
          status: true,
          errorMessage: true,
          expiresAt: true,
          createdAt: true,
          companyName: true,
          userEmail: true,
        },
      });

      return NextResponse.json({ backup });
    } catch (error) {
      logger.error('[API /backups] POST failed:', error);
      return NextResponse.json({ error: 'Failed to create backup' }, { status: 500 });
    }
  }
);
