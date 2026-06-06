import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { restoreBackup } from '@/lib/backup-engine';
import { auditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import fs from 'fs';

/**
 * POST /api/backups/[id]?action=restore — Restore from a backup
 */
export const POST = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, requireTokenPay: true, permissions: [Permission.BACKUP_RESTORE] },
  async (request, ctx, context) => {
    try {
      const { id } = await context.params as { id: string };
      const companyId = ctx.activeCompanyId!;
      const userId = ctx.id;

      // Verify the backup belongs to this company
      const backup = await db.backup.findFirst({
        where: { id, companyId },
      });

      if (!backup) {
        return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
      }

      if (backup.status !== 'completed') {
        return NextResponse.json({ error: 'Cannot restore from a failed backup' }, { status: 400 });
      }

      // ─── Permission checks ─────────────────────────────────────────
      const backupScope = backup.scope || 'tenant';

      if (backupScope === 'full-db') {
        // Full DB restore: only appOwner (isSuperDev) can do this
        if (!ctx.isSuperDev) {
          return NextResponse.json(
            { error: 'Only the appOwner can perform a full database restore', code: 'REQUIRES_APP_OWNER' },
            { status: 403 }
          );
        }
      }

      const result = await restoreBackup(userId, id, companyId);

      if (!result.success) {
        logger.error(`[API /backups/${id}] Restore failed:`, result.error);
        return NextResponse.json({ error: result.error }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'Backup restored successfully' });
    } catch (error) {
      logger.error(`[API /backups] POST restore failed:`, error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to restore backup' },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE /api/backups/[id] — Delete a backup
 */
export const DELETE = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, requireTokenPay: true, permissions: [Permission.BACKUP_CREATE] },
  async (request, ctx, context) => {
    try {
      const { id } = await context.params as { id: string };
      const companyId = ctx.activeCompanyId!;

      // Verify the backup belongs to this company
      const backup = await db.backup.findFirst({
        where: { id, companyId },
      });

      if (!backup) {
        return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
      }

      // Audit log before deletion
      await auditLog({
        action: 'BACKUP_DELETE',
        entityType: 'Backup',
        entityId: id,
        userId: ctx.id,
        companyId,
        metadata: {
          backupType: backup.backupType,
          triggerType: backup.triggerType,
          scope: backup.scope,
          status: backup.status,
          fileSize: backup.fileSize,
          createdAt: backup.createdAt?.toISOString() ?? null,
        },
      });

      // Delete file from disk
      if (backup.filePath && fs.existsSync(backup.filePath)) {
        try {
          fs.unlinkSync(backup.filePath);
        } catch (err) {
          logger.warn(`[API /backups/${id}] Failed to delete file from disk:`, err);
        }
      }

      // Delete from database
      await db.backup.delete({ where: { id } });

      return NextResponse.json({ success: true, message: 'Backup deleted' });
    } catch (error) {
      logger.error(`[API /backups] DELETE failed:`, error);
      return NextResponse.json({ error: 'Failed to delete backup' }, { status: 500 });
    }
  }
);
