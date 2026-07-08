import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateChecksum } from '@/lib/backup-engine';
import { decryptFile } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { Permission } from '@/lib/rbac';
import fs from 'fs';
import path from 'path';
import { rmSync } from 'fs';
import { withGuard } from '@/lib/route-guard';

/**
 * GET /api/backups/download/[id] — Download a backup ZIP file
 */
export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.BACKUP_CREATE] },
  async (request, ctx, context) => {
    try {
      const { id } = await context.params as { id: string };
      const companyId = ctx.activeCompanyId!;

      // Verify the backup belongs to this company
      const backup = await db.backup.findFirst({
        where: { id, companyId, status: 'completed' },
      });

      if (!backup) {
        return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
      }

      if (!backup.filePath || !fs.existsSync(backup.filePath)) {
        return NextResponse.json({ error: 'Backup file not found on disk' }, { status: 404 });
      }

      // Decrypt if the backup is encrypted, then verify checksum
      let servePath = backup.filePath;
      let tempDecryptedPath: string | null = null;

      if (backup.encrypted) {
        try {
          tempDecryptedPath = decryptFile(backup.filePath, backup.encryptionKeyVersion);
          servePath = tempDecryptedPath;
        } catch (decErr) {
          logger.error(`[API /backups/download/${id}] Failed to decrypt backup:`, decErr);
          return NextResponse.json(
            { error: 'Failed to decrypt backup file — encryption key may have changed' },
            { status: 500 }
          );
        }
      }

      // Verify checksum before serving (streaming)
      if (backup.sha256) {
        try {
          const currentChecksum = await calculateChecksum(servePath);
          if (currentChecksum !== backup.sha256) {
            logger.error(`[API /backups/download/${id}] Checksum mismatch! Stored: ${backup.sha256}, Current: ${currentChecksum}`);
            if (tempDecryptedPath) {
              try { rmSync(tempDecryptedPath, { force: true }); } catch { /* ignore */ }
            }
            return NextResponse.json(
              { error: 'Backup file is corrupted (checksum mismatch)' },
              { status: 500 }
            );
          }
        } catch (err) {
          logger.warn(`[API /backups/download/${id}] Checksum verification failed:`, err);
        }
      }

      // Stream the decrypted file to the client
      const originalFilename = backup.encrypted
        ? path.basename(backup.filePath).replace('.zip.enc', '.zip')
        : path.basename(backup.filePath);
      const fileStats = fs.statSync(servePath);
      const fileStream = fs.createReadStream(servePath);

      const readableStream = new ReadableStream({
        start(controller) {
          fileStream.on('data', (chunk: Buffer) => {
            controller.enqueue(chunk);
          });
          fileStream.on('end', () => {
            controller.close();
            if (tempDecryptedPath) {
              try { rmSync(tempDecryptedPath, { force: true }); } catch { /* ignore */ }
            }
          });
          fileStream.on('error', (err) => {
            controller.error(err);
            if (tempDecryptedPath) {
              try { rmSync(tempDecryptedPath, { force: true }); } catch { /* ignore */ }
            }
          });
        },
        cancel() {
          fileStream.destroy();
          if (tempDecryptedPath) {
            try { rmSync(tempDecryptedPath, { force: true }); } catch { /* ignore */ }
          }
        },
      });

      return new NextResponse(readableStream, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${originalFilename}"`,
          'Content-Length': String(fileStats.size),
          'Cache-Control': 'no-cache',
        },
      });
    } catch (error) {
      logger.error(`[API /backups/download] GET failed:`, error);
      return NextResponse.json({ error: 'Failed to download backup' }, { status: 500 });
    }
  }
);
