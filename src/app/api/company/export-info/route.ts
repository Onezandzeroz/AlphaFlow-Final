import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { requirePermission, Permission } from '@/lib/rbac';
import { logger } from '@/lib/logger';

/**
 * GET /api/company/export-info
 *
 * Returns export history and statistics for the current company:
 *   - Total number of exports
 *   - Last export date
 *   - Data volume (accounts, transactions, journal entries, etc.)
 *   - Recent export audit entries with GUIDs and checksums
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx || !ctx.activeCompanyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = requirePermission(ctx, Permission.DATA_READ);
    if (denied) return denied;

    const companyId = ctx.activeCompanyId;

    // Fetch export audit logs (filter for exportGuid in-memory since Prisma JSON null filtering is strict)
    const exportLogs = await db.auditLog.findMany({
      where: {
        companyId,
        entityType: 'Company',
        action: 'CREATE',
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        createdAt: true,
        userId: true,
        metadata: true,
        performedByUserId: true,
      },
    });

    // Parse metadata and filter to only those that have exportGuid
    const exports = exportLogs
      .map((log) => {
        const meta = log.metadata as Record<string, unknown> | null;
        if (!meta || !meta.exportGuid) return null;
        return {
          id: log.id,
          exportGuid: meta.exportGuid as string,
          exportedAt: log.createdAt.toISOString(),
          format: (meta.format as string) ?? 'unknown',
          includeFiles: (meta.includeFiles as boolean) ?? false,
          dataChecksum: (meta.dataChecksum as string) ?? null,
          exportedByUserId: log.performedByUserId ?? log.userId,
        };
      })
      .filter((e) => e !== null);

    // Fetch current data volume stats
    const [
      accountsCount,
      transactionsCount,
      journalEntriesCount,
      invoicesCount,
      contactsCount,
      documentsCount,
      bankStatementsCount,
    ] = await Promise.all([
      db.account.count({ where: { companyId } }),
      db.transaction.count({ where: { companyId } }),
      db.journalEntry.count({ where: { companyId } }),
      db.invoice.count({ where: { companyId } }),
      db.contact.count({ where: { companyId } }),
      db.document.count({ where: { companyId } }),
      db.bankStatement.count({ where: { companyId } }),
    ]);

    return NextResponse.json({
      totalExports: exports.length,
      lastExport: exports[0] ?? null,
      currentDataVolume: {
        accounts: accountsCount,
        transactions: transactionsCount,
        journalEntries: journalEntriesCount,
        invoices: invoicesCount,
        contacts: contactsCount,
        documents: documentsCount,
        bankStatements: bankStatementsCount,
      },
      recentExports: exports.slice(0, 10),
    });
  } catch (error) {
    logger.error('Export info fetch failed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch export info' },
      { status: 500 }
    );
  }
}
