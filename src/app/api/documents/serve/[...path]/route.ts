import { NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';
import { withGuard } from '@/lib/route-guard';

// GET /api/documents/serve/[...path] - Serve document files with authentication
export const GET = withGuard(
  { auth: true, requireCompany: true },
  async (request, ctx, context) => {
    try {
      const userId = ctx.id;

      const { path: filePathParts } = await context.params as { path: string[] };
      const filePathFromUrl = filePathParts.join('/');

      if (!filePathFromUrl) {
        return NextResponse.json({ error: 'No file path provided' }, { status: 400 });
      }

      // Build the absolute file path
      const absolutePath = path.join(process.cwd(), 'uploads', filePathFromUrl);

      // Security: ensure the path is within the uploads directory (prevent directory traversal)
      const uploadsDir = path.join(process.cwd(), 'uploads');
      const resolvedPath = path.resolve(absolutePath);
      if (!resolvedPath.startsWith(uploadsDir)) {
        return NextResponse.json({ error: 'Invalid file path' }, { status: 403 });
      }

      // Security: ensure the user can only access their own files
      const expectedPrefix = path.join(uploadsDir, 'documents', userId);
      if (!resolvedPath.startsWith(expectedPrefix)) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      // Check file exists
      if (!existsSync(absolutePath)) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }

      // Read file
      const fileBuffer = await readFile(absolutePath);
      const fileStat = await stat(absolutePath);

      // Determine content type from file extension
      const ext = path.extname(absolutePath).toLowerCase();
      const contentTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.csv': 'text/csv',
        '.txt': 'text/plain',
        '.zip': 'application/zip',
        '.xml': 'application/xml',
      };

      const contentType = contentTypes[ext] || 'application/octet-stream';

      // Return file with cache headers
      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': fileStat.size.toString(),
          'Cache-Control': 'private, max-age=86400',
          'ETag': `"${fileStat.size}-${fileStat.mtimeMs}"`,
        },
      });
    } catch (error) {
      logger.error('Serve document error:', error);
      return NextResponse.json(
        { error: 'Failed to serve file' },
        { status: 500 }
      );
    }
  }
);
