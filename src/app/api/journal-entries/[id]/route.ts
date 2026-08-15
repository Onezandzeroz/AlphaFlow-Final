import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditUpdate, auditCancel, requestMetadata } from '@/lib/audit';
import { VATCode } from '@prisma/client';
import { logger } from '@/lib/logger';
import { tenantFilter, Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { assignVoucherNumberIfPosted } from '@/lib/voucher-number';
import { notifyDataChanges } from '@/lib/notify-data-change';
import { sealJournalEntry, findClosedFiscalPeriod } from '@/lib/journal-hash-chain';

// GET - Get a single journal entry with lines
export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  async (request, ctx, context) => {
    try {
      const { id } = await context.params as { id: string };

      // demo filter now included in tenantFilter
      const entry = await db.journalEntry.findFirst({
        where: { id, ...tenantFilter(ctx) },
        include: {
          lines: {
            include: {
              account: true,
            },
          },
        },
      });

      if (!entry) {
        return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
      }

      return NextResponse.json({ journalEntry: entry });
    } catch (error) {
      logger.error('Get journal entry error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

// PUT - Update a journal entry (only DRAFT entries can be edited)
export const PUT = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_EDIT] },
  async (request, ctx, context) => {
    try {
      const { id } = await context.params as { id: string };
      const body = await request.json();
      const { date, description, reference, status, lines } = body;

      // demo filter now included in tenantFilter
      const existing = await db.journalEntry.findFirst({
        where: { id, ...tenantFilter(ctx) },
        include: {
          lines: true,
        },
      });

      if (!existing) {
        return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
      }

      if (existing.status !== 'DRAFT') {
        return NextResponse.json(
          { error: 'Only DRAFT journal entries can be edited' },
          { status: 400 }
        );
      }

      // If lines are provided, validate them
      if (lines && Array.isArray(lines)) {
        if (lines.length < 2) {
          return NextResponse.json(
            { error: 'A journal entry must have at least 2 lines (double-entry)' },
            { status: 400 }
          );
        }

        for (const line of lines) {
          if (!line.accountId) {
            return NextResponse.json(
              { error: 'Each line must have an accountId' },
              { status: 400 }
            );
          }
          if (typeof line.debit !== 'number' || typeof line.credit !== 'number') {
            return NextResponse.json(
              { error: 'Each line must have numeric debit and credit values' },
              { status: 400 }
            );
          }
          if (line.debit < 0 || line.credit < 0) {
            return NextResponse.json(
              { error: 'Debit and credit values must be non-negative' },
              { status: 400 }
            );
          }
        }

        // Verify all referenced accounts exist and belong to the user
        const accountIds = [...new Set(lines.map((l: { accountId: string }) => l.accountId))];
        const accounts = await db.account.findMany({
          where: {
            id: { in: accountIds },
            ...tenantFilter(ctx),
            isActive: true,
          },
        });

        if (accounts.length !== accountIds.length) {
          const foundIds = new Set(accounts.map(a => a.id));
          const missingIds = accountIds.filter((aid: string) => !foundIds.has(aid));
          return NextResponse.json(
            { error: `Invalid or inactive account IDs: ${missingIds.join(', ')}` },
            { status: 400 }
          );
        }

        // Re-validate double-entry balance
        const totalDebit = lines.reduce((sum: number, l: { debit: number }) => sum + l.debit, 0);
        const totalCredit = lines.reduce((sum: number, l: { credit: number }) => sum + l.credit, 0);

        if (Math.abs(totalDebit - totalCredit) > 0.005) {
          return NextResponse.json(
            { error: `Journal entry is not balanced. Total debit: ${totalDebit}, Total credit: ${totalCredit}` },
            { status: 400 }
          );
        }
      }

      // Build update data
      const updateData: Record<string, unknown> = {};
      if (date !== undefined) updateData.date = new Date(date);
      if (description !== undefined) updateData.description = description;
      if (reference !== undefined) updateData.reference = reference || null;
      if (status !== undefined) updateData.status = status;

      // DRAFT → POSTED transition: assign voucher number + seal hash atomically
      const isDraftToPosted = existing.status === 'DRAFT' && status === 'POSTED';

      // ─── Backdating prevention (Bogføringsloven §10-12, BEK 97 Bilag 1, 2, e) ───
      // When transitioning to POSTED, the entry's date must not fall inside a
      // CLOSED FiscalPeriod. Use the new date if provided, else the existing.
      if (isDraftToPosted) {
        const effectiveDate = date !== undefined ? new Date(date) : existing.date;
        const closedPeriod = await findClosedFiscalPeriod(existing.companyId, effectiveDate);
        if (closedPeriod) {
          return NextResponse.json(
            {
              error: `Kan ikke bogføre i en lukket periode (${closedPeriod.year}-${String(closedPeriod.month).padStart(2, '0')}). / Cannot post to a closed fiscal period (${closedPeriod.year}-${String(closedPeriod.month).padStart(2, '0')}).`,
            },
            { status: 400 }
          );
        }
      }

      // Wrap entry update + line replacement + (optional) voucher number
      // assignment + hash sealing in a SINGLE transaction. This guarantees
      // the hash covers the final committed state of the entry (including
      // any line replacements) and that the sealing UPDATE can never be
      // observed separately from the status=POSTED UPDATE by an outside
      // connection.
      const entry = await db.$transaction(async (tx) => {
        // Assign voucher number atomically if DRAFT → POSTED.
        // assignVoucherNumberIfPosted performs its own UPDATE on the entry.
        if (isDraftToPosted) {
          await assignVoucherNumberIfPosted(tx, existing.id, existing.companyId, 'POSTED');
        }

        // Apply the user-supplied field updates (date, description, reference, status).
        // If isDraftToPosted, the status UPDATE is what flips DRAFT→POSTED in the row.
        if (Object.keys(updateData).length > 0) {
          await tx.journalEntry.update({
            where: { id },
            data: updateData,
          });
        }

        // If lines are provided, replace all lines (delete old, create new)
        if (lines && Array.isArray(lines)) {
          await tx.journalEntryLine.deleteMany({
            where: { journalEntryId: id },
          });

          await tx.journalEntryLine.createMany({
            data: lines.map((l: { accountId: string; debit: number; credit: number; description?: string; vatCode?: string }) => ({
              journalEntryId: id,
              companyId: existing.companyId,
              accountId: l.accountId,
              debit: l.debit,
              credit: l.credit,
              description: l.description || null,
              vatCode: (l.vatCode as VATCode | undefined) ?? null,
            })),
          });
        }

        // Seal the entry into the hash chain (Bogføringsloven §10-12).
        // This MUST happen AFTER all other updates so the hash reflects the
        // final committed state. Once recordHash is set, the DB trigger
        // (prisma/journal-immutability.sql) blocks any further UPDATE.
        if (isDraftToPosted) {
          await sealJournalEntry(tx, id, existing.companyId);
        }

        // Re-fetch with updated lines + account relations for the response.
        return tx.journalEntry.findUniqueOrThrow({
          where: { id },
          include: {
            lines: {
              include: {
                account: true,
              },
            },
          },
        });
      });

      await auditUpdate(
        ctx.id,
        'JournalEntry',
        id,
        { date: existing.date, description: existing.description, reference: existing.reference, status: existing.status, lineCount: existing.lines.length },
        { ...updateData, lineCount: lines ? lines.length : existing.lines.length },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      notifyDataChanges([
        { scope: 'journal-entries', companyId: ctx.activeCompanyId!, action: 'update' },
        { scope: 'dashboard', companyId: ctx.activeCompanyId!, action: 'update' },
        { scope: 'ledger', companyId: ctx.activeCompanyId!, action: 'update' },
        { scope: 'cash-flow', companyId: ctx.activeCompanyId!, action: 'update' },
        { scope: 'reports', companyId: ctx.activeCompanyId!, action: 'update' },
      ]).catch(() => {});

      return NextResponse.json({ journalEntry: entry });
    } catch (error) {
      logger.error('Update journal entry error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

// DELETE - Cancel a journal entry (only DRAFT entries can be cancelled)
export const DELETE = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_CANCEL] },
  async (request, ctx, context) => {
    try {
      const { id } = await context.params as { id: string };
      const { searchParams } = new URL(request.url);
      const reason = searchParams.get('reason') || 'SYSTEM:DELETE_REQUEST';

      // demo filter now included in tenantFilter
      const existing = await db.journalEntry.findFirst({
        where: { id, ...tenantFilter(ctx) },
      });

      if (!existing) {
        return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
      }

      if (existing.status !== 'DRAFT') {
        return NextResponse.json(
          { error: 'Only DRAFT journal entries can be cancelled' },
          { status: 400 }
        );
      }

      if (existing.cancelled) {
        return NextResponse.json(
          { error: 'Journal entry is already cancelled' },
          { status: 400 }
        );
      }

      const entry = await db.journalEntry.update({
        where: { id },
        data: {
          cancelled: true,
          status: 'CANCELLED',
          cancelReason: reason,
        },
        include: {
          lines: {
            include: {
              account: true,
            },
          },
        },
      });

      await auditCancel(
        ctx.id,
        'JournalEntry',
        id,
        reason,
        requestMetadata(request),
        ctx.activeCompanyId
      );

      notifyDataChanges([
        { scope: 'journal-entries', companyId: ctx.activeCompanyId!, action: 'delete' },
        { scope: 'dashboard', companyId: ctx.activeCompanyId!, action: 'update' },
        { scope: 'ledger', companyId: ctx.activeCompanyId!, action: 'update' },
        { scope: 'cash-flow', companyId: ctx.activeCompanyId!, action: 'update' },
        { scope: 'reports', companyId: ctx.activeCompanyId!, action: 'update' },
      ]).catch(() => {});

      return NextResponse.json({ journalEntry: entry });
    } catch (error) {
      logger.error('Cancel journal entry error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
