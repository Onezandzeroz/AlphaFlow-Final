import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { parseSaftXml } from '@/lib/saft-import/parser';
import { analyzeForDryRun } from '@/lib/saft-import/transformer';

/**
 * POST /api/import-saft/dry-run
 *
 * Pre-flight validation of a SAF-T XML file before actual import.
 * Returns a summary of what would be imported, conflicts, and unmapped VAT codes.
 * Does NOT modify any data.
 *
 * Body: multipart form with field "file" containing the SAF-T XML file.
 */
export const POST = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.BACKUP_RESTORE] },
  async (request, ctx) => {
    try {
      const formData = await request.formData();
      const file = formData.get('file');

      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          { error: 'No file provided. Upload a SAF-T XML file in the "file" field.' },
          { status: 400 },
        );
      }

      if (file.size > 100 * 1024 * 1024) {
        return NextResponse.json(
          { error: 'File too large. Maximum size is 100 MB.' },
          { status: 413 },
        );
      }

      const xmlContent = await file.text();
      logger.info(`[Import-SAF-T] Dry-run: file=${file.name}, size=${file.size} bytes`);

      // Parse the XML
      let parsed;
      try {
        parsed = parseSaftXml(xmlContent);
      } catch (parseError) {
        logger.error('[Import-SAF-T] XML parse error:', parseError);
        return NextResponse.json(
          { error: 'Failed to parse XML. Ensure the file is a valid SAF-T Financial DK v2.1 XML file.' },
          { status: 400 },
        );
      }

      // Get existing account numbers for conflict detection
      const existingAccounts = await db.account.findMany({
        where: { companyId: ctx.activeCompanyId! },
        select: { number: true },
      });
      const existingAccountNumbers = existingAccounts.map((a) => a.number);

      // Run dry-run analysis
      const result = analyzeForDryRun(parsed, existingAccountNumbers);

      logger.info(
        `[Import-SAF-T] Dry-run result: ${result.summary.accounts} accounts, ` +
        `${result.summary.transactions} transactions, ${result.summary.lines} lines, ` +
        `${result.unmappedVatCodes.length} unmapped VAT codes`,
      );

      return NextResponse.json({
        success: true,
        ...result,
      });
    } catch (error) {
      logger.error('[Import-SAF-T] Dry-run error:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Unknown error during dry-run' },
        { status: 500 },
      );
    }
  },
);
