import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { Permission, requirePermission } from '@/lib/rbac';
import { calculateChecksum } from '@/lib/backup-engine';
import { decryptFile } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import fs from 'fs';
import path from 'path';
import { rmSync } from 'fs';

/**
 * GET /api/backups/download/[id] — Download a backup ZIP file
 *
 * Permission: Only tenant owners (OWNER role) or appOwner (isSuperDev) can download backups.
 * Uses streaming for memory-efficient file transfer.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx || !ctx.activeCompanyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only OWNER or appOwner (isSuperDev) can download backups
    if (!ctx.isSuperDev) {
      const denied = requirePermission(ctx, Permission.BACKUP_RESTORE); // BACKUP_RESTORE = OWNER
      if (denied) return denied;
    }

    const { id } = await params;
    const companyId = ctx.activeCompanyId;

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
        tempDecryptedPath = decryptFile(backup.filePath);
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
          // Clean up temp file
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
        // Continue serving the file even if checksum fails — it's a warning, not a hard block
      }
    }

    // Stream the decrypted file to the client
    // Use the original filename without .enc extension for the download
    const originalFilename = backup.encrypted
      ? path.basename(backup.filePath).replace('.zip.enc', '.zip')
      : path.basename(backup.filePath);
    const fileStats = fs.statSync(servePath);
    const fileStream = fs.createReadStream(servePath);

    // Convert Node.js ReadStream to a ReadableStream for the Response
    const readableStream = new ReadableStream({
      start(controller) {
        fileStream.on('data', (chunk: Buffer) => {
          controller.enqueue(chunk);
        });
        fileStream.on('end', () => {
          controller.close();
          // Clean up temporary decrypted file after streaming completes
          if (tempDecryptedPath) {
            try { rmSync(tempDecryptedPath, { force: true }); } catch { /* ignore */ }
          }
        });
        fileStream.on('error', (err) => {
          controller.error(err);
          // Clean up on error too
          if (tempDecryptedPath) {
            try { rmSync(tempDecryptedPath, { force: true }); } catch { /* ignore */ }
          }
        });
      },
      cancel() {
        fileStream.destroy();
        // Clean up on cancel
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
