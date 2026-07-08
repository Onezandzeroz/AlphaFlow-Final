import { NextResponse } from 'next/server';
import { restoreBackupFromBuffer } from '@/lib/backup-engine';
import { logger } from '@/lib/logger';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import JSZip from 'jszip';
import { scanBuffer } from '@/lib/clamav';
import { auditLog } from '@/lib/audit';

/**
 * POST /api/backups/upload-restore — Restore from an uploaded backup ZIP file
 */
export const POST = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, requireTokenPay: true, permissions: [Permission.BACKUP_RESTORE] },
  async (request, ctx) => {
    try {
      const companyId = ctx.activeCompanyId!;
      const userId = ctx.id;
      const isAppOwner = ctx.isSuperDev;

      // Parse multipart form data
      const formData = await request.formData();
      const file = formData.get('backup') as File | null;

      if (!file) {
        return NextResponse.json({ error: 'No file provided. Use field name "backup".' }, { status: 400 });
      }

      if (!file.name.endsWith('.zip')) {
        return NextResponse.json({ error: 'File must be a .zip file. Backup files use the ZIP format.' }, { status: 400 });
      }

      // Allow up to 2 GB for database backups
      if (file.size > 2 * 1024 * 1024 * 1024) {
        return NextResponse.json({ error: 'File too large. Maximum 2 GB.' }, { status: 400 });
      }

      // Read file into buffer
      const buffer = Buffer.from(await file.arrayBuffer());

      // SECURITY (U-4): Antivirus scan via ClamAV
      // Backup ZIPs can be large (up to 2GB). ClamAV handles streaming,
      // but we log a warning for very large files.
      const scanResult = await scanBuffer(buffer, file.name);
      if (!scanResult.clean && scanResult.virusName) {
        logger.warn(`[UPLOAD-RESTORE] MALWARE BLOCKED: ${file.name} — ${scanResult.virusName}, user: ${userId}, company: ${companyId}`);
        await auditLog({
          action: 'DELETE_ATTEMPT',
          entityType: 'Backup',
          entityId: 'upload-restore',
          userId,
          companyId,
          metadata: {
            reason: 'Malware detected by ClamAV in backup file',
            virusName: scanResult.virusName,
            fileName: file.name,
            fileSize: buffer.length,
            source: 'backup-restore',
          },
        }).catch(() => {});
        return NextResponse.json(
          { error: 'Backup file rejected: malware detected. The attempt has been logged.' },
          { status: 403 }
        );
      }
      if (scanResult.error) {
        logger.error(`[UPLOAD-RESTORE] ClamAV scan error for ${file.name}: ${scanResult.error}`);
      }

      // ─── Detect backup type and check permissions ────────────────────
      let zip: InstanceType<typeof JSZip>;
      try {
        zip = await JSZip.loadAsync(buffer);
      } catch {
        return NextResponse.json({ error: 'Uploaded file is not a valid ZIP archive' }, { status: 400 });
      }

      const hasManifest = zip.file('manifest.json') !== null;

      if (!hasManifest) {
        return NextResponse.json({
          error: 'Uploaded ZIP is not a valid tenant snapshot backup. Expected manifest.json.',
        }, { status: 400 });
      }

      logger.info(`[UPLOAD-RESTORE] Starting restore from uploaded file: ${file.name} (${(buffer.length / 1024 / 1024).toFixed(2)} MB), user: ${userId}, company: ${companyId}, appOwner: ${isAppOwner}`);

      // Perform the restore
      const result = await restoreBackupFromBuffer(userId, buffer, companyId, isAppOwner, file.name);

      if (!result.success) {
        logger.error(`[UPLOAD-RESTORE] Failed:`, result.error);
        return NextResponse.json({ error: result.error }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: 'Backup restored successfully. The page will reload.',
        filename: file.name,
        fileSize: buffer.length,
      });
    } catch (error) {
      logger.error('[UPLOAD-RESTORE] Unexpected error:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to restore backup' },
        { status: 500 }
      );
    }
  }
);
