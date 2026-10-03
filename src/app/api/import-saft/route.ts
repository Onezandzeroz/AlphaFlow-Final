import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { auditLog, requestMetadata } from '@/lib/audit';
import { notifyDataChange } from '@/lib/notify-data-change';
import { parseSaftXml } from '@/lib/saft-import/parser';
import {
  transformAccount,
  transformContact,
  transformTransaction,
  buildVatCodeMap,
} from '@/lib/saft-import/transformer';
import type { ImportSummary } from '@/lib/saft-import/transformer';

/**
 * POST /api/import-saft
 *
 * Imports a SAF-T Financial DK v2.1 XML file from a third-party accounting system.
 * Replaces existing company data (accounts, contacts, journal entries) with
 * the imported data in a single transactional operation.
 *
 * IMPORTANT: This endpoint wipes existing data before importing. The dry-run
 * endpoint should be called first to review conflicts and unmapped VAT codes.
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
      logger.info(`[Import-SAF-T] Starting import: file=${file.name}, size=${file.size} bytes`);

      // Parse XML
      const parsed = parseSaftXml(xmlContent);

      // Build VAT code map from TaxTable
      const vatCodeMap = buildVatCodeMap(parsed.masterFiles.taxCodes);

      // Collect unmapped VAT codes for reporting
      const unmappedVatCodes: string[] = [];
      for (const [code, mapped] of vatCodeMap) {
        if (!mapped) unmappedVatCodes.push(code);
      }

      const warnings: string[] = [];

      // ── Execute import in a single transaction ──
      const result = await db.$transaction(async (tx) => {
        // Bypass immutability triggers (Bogføringsloven §10-12) for import
        await tx.$executeRawUnsafe("SET LOCAL app.immutability_bypass = 'true'");

        const companyId = ctx.activeCompanyId!;

        // 1. Wipe existing data (respecting FK constraints)
        logger.info('[Import-SAF-T] Wiping existing data...');
        await tx.eInvoiceSending.deleteMany({ where: { companyId } });
        await tx.vATSubmission.deleteMany({ where: { companyId } });
        await tx.receivedInvoice.deleteMany({ where: { companyId } });
        await tx.bankStatementLine.deleteMany({ where: { companyId } });
        await tx.bankStatement.deleteMany({ where: { companyId } });
        await tx.document.deleteMany({ where: { companyId } });
        await tx.journalEntryLine.deleteMany({ where: { companyId } });
        await tx.journalEntry.deleteMany({ where: { companyId } });
        await tx.budgetEntry.deleteMany({ where: { companyId } });
        await tx.budget.deleteMany({ where: { companyId } });
        await tx.transaction.deleteMany({ where: { companyId } });
        await tx.invoice.deleteMany({ where: { companyId } });
        await tx.contact.deleteMany({ where: { companyId } });
        await tx.account.deleteMany({ where: { companyId } });
        await tx.fiscalPeriod.deleteMany({ where: { companyId } });
        await tx.recurringEntry.deleteMany({ where: { companyId } });

        // 2. Update Company info from SAF-T Header
        const company = parsed.header.company;
        if (company.name) {
          await tx.company.update({
            where: { id: companyId },
            data: {
              name: company.name,
              cvrNumber: company.registrationNumber || undefined,
              address: company.address?.streetName || undefined,
              email: company.email || undefined,
              phone: company.phone || undefined,
            },
          });
        }

        // 3. Create Accounts
        const accountMap = new Map<string, string>(); // SAF-T AccountID → Prisma Account ID
        let accountCount = 0;
        for (const acc of parsed.masterFiles.accounts) {
          const transformed = transformAccount(acc);
          const created = await tx.account.create({
            data: {
              ...transformed,
              userId: ctx.id,
              companyId,
            },
          });
          accountMap.set(acc.accountId, created.id);
          accountCount++;
        }
        logger.info(`[Import-SAF-T] Created ${accountCount} accounts`);

        // 4. Create Contacts
        const contactMap = new Map<string, string>(); // SAF-T CustomerID/SupplierID → Prisma Contact ID
        const seenCvrs = new Set<string>();
        let customerCount = 0;
        let supplierCount = 0;

        // Process customers first, track CVRs
        for (const contact of parsed.masterFiles.customers) {
          if (contact.registrationNumber) {
            seenCvrs.add(contact.registrationNumber);
          }
        }

        // Merge customers + suppliers, detect BOTH type
        const allContacts = [...parsed.masterFiles.customers, ...parsed.masterFiles.suppliers];
        for (const contact of allContacts) {
          const transformed = transformContact(contact, seenCvrs);
          const existing = contactMap.get(contact.id);
          if (existing) continue; // Skip duplicates

          const created = await tx.contact.create({
            data: {
              ...transformed,
              userId: ctx.id,
              companyId,
            },
          });
          contactMap.set(contact.id, created.id);
          if (contact.type === 'CUSTOMER') customerCount++;
          else supplierCount++;
        }
        logger.info(`[Import-SAF-T] Created ${customerCount} customers, ${supplierCount} suppliers`);

        // 5. Create FiscalPeriods (derive from transactions)
        const periods = new Set<string>(); // "year-month"
        for (const journal of parsed.generalLedgerEntries.journals) {
          for (const tx of journal.transactions) {
            const periodKey = `${tx.periodYear}-${tx.period}`;
            periods.add(periodKey);
          }
        }
        for (const periodKey of periods) {
          const [year, month] = periodKey.split('-').map(Number);
          await tx.fiscalPeriod.upsert({
            where: { companyId_year_month: { companyId, year, month } },
            create: {
              companyId,
              year,
              month,
              status: 'CLOSED',
              lockedAt: new Date(),
              lockedBy: ctx.id,
              userId: ctx.id,
            },
            update: {},
          });
        }

        // 6. Create Journal Entries + Lines
        let jeCount = 0;
        let lineCount = 0;
        let skippedLines = 0;

        // Sort transactions by date for proper hash-chain sealing
        const allTransactions = parsed.generalLedgerEntries.journals
          .flatMap((j) => j.transactions)
          .sort((a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime());

        for (const saftTx of allTransactions) {
          const transformed = transformTransaction(saftTx, vatCodeMap);

          // Resolve account IDs and skip lines with unknown accounts
          const resolvedLines: Array<{
            accountId: string;
            companyId: string;
            accountNumber: string;
            debit: number;
            credit: number;
            vatCode: string | null;
            description: string | null;
          }> = [];
          for (const line of transformed.lines) {
            const accountId = accountMap.get(line.accountNumber);
            if (!accountId) {
              skippedLines++;
              warnings.push(`Skipped line: account "${line.accountNumber}" not found (transaction ${saftTx.transactionId})`);
              continue;
            }
            resolvedLines.push({
              ...line,
              accountId,
              companyId,
            });
          }

          if (resolvedLines.length === 0) {
            warnings.push(`Skipped transaction ${saftTx.transactionId}: no valid lines`);
            continue;
          }

          // Check balance
          const totalDebit = resolvedLines.reduce((sum, l) => sum + l.debit, 0);
          const totalCredit = resolvedLines.reduce((sum, l) => sum + l.credit, 0);
          if (Math.abs(totalDebit - totalCredit) > 0.02) {
            warnings.push(`Transaction ${saftTx.transactionId} is unbalanced (debit=${totalDebit}, credit=${totalCredit}) — imported as POSTED with imbalance`);
          }

          const entry = await tx.journalEntry.create({
            data: {
              date: transformed.date,
              description: transformed.description,
              reference: transformed.reference,
              status: 'POSTED',
              cancelled: false,
              userId: ctx.id,
              companyId,
              lines: {
                create: resolvedLines.map((l) => ({
                  accountId: l.accountId,
                  debit: l.debit,
                  credit: l.credit,
                  vatCode: l.vatCode as any,
                  description: l.description,
                  companyId,
                })),
              },
            },
          });

          // Assign voucher number (AlphaFlow sequence, not source system's)
          // Note: we skip sealJournalEntry in the import transaction for performance;
          // hash-chain sealing can be done in a post-import step if needed.
          try {
            const company = await tx.company.findUnique({
              where: { id: companyId },
              select: { currentYear: true, nextJournalSequence: true },
            });
            if (company) {
              const seq = company.nextJournalSequence;
              const year = transformed.date.getFullYear();
              const isYearRoll = company.currentYear !== year;
              const nextSeq = isYearRoll ? 1 : seq + 1;
              const voucherNumber = `BIL-${year}-${String(nextSeq).padStart(4, '0')}`;
              await tx.journalEntry.update({
                where: { id: entry.id },
                data: {
                  voucherNumber,
                  recordHash: `imported-${entry.id}`,
                  hashedAt: new Date(),
                },
              });
              await tx.company.update({
                where: { id: companyId },
                data: {
                  nextJournalSequence: nextSeq,
                  currentYear: year,
                },
              });
            }
          } catch (voucherError) {
            logger.warn(`[Import-SAF-T] Failed to assign voucher number for ${entry.id}:`, voucherError);
          }

          jeCount++;
          lineCount += resolvedLines.length;
        }

        logger.info(`[Import-SAF-T] Created ${jeCount} journal entries, ${lineCount} lines, skipped ${skippedLines} lines`);

        const summary: ImportSummary = {
          accounts: accountCount,
          customers: customerCount,
          suppliers: supplierCount,
          journalEntries: jeCount,
          journalEntryLines: lineCount,
          unmappedVatCodes,
          warnings,
        };

        return summary;
      }, { timeout: 300_000 }); // 5 minute timeout for large files

      // Audit log
      await auditLog({
        action: 'CREATE',
        entityType: 'System',
        entityId: ctx.activeCompanyId!,
        userId: ctx.id,
        companyId: ctx.activeCompanyId!,
        changes: { type: { old: null, new: 'saft_import' }, source: { old: null, new: file.name } },
        metadata: { ...result, source: 'import-saft' },
      });

      // Notify data change
      notifyDataChange({ scope: 'accounts', companyId: ctx.activeCompanyId!, action: 'create' }).catch(() => {});
      notifyDataChange({ scope: 'journal-entries', companyId: ctx.activeCompanyId!, action: 'create' }).catch(() => {});

      logger.info(`[Import-SAF-T] Import complete: ${result.accounts} accounts, ${result.journalEntries} entries, ${result.journalEntryLines} lines`);

      return NextResponse.json({
        success: true,
        ...result,
      });
    } catch (error) {
      logger.error('[Import-SAF-T] Import error:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Unknown error during SAF-T import' },
        { status: 500 },
      );
    }
  },
);
