import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditCreate, auditUpdate, auditCancel, requestMetadata } from '@/lib/audit';
import { RecurringFrequency as PrismaFrequency, RecurringStatus, Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';
import { tenantFilter, Permission } from '@/lib/rbac';
import { addFrequency, parseLocalDate, todayLocal, formatDateLocal } from '@/lib/date-utils';
import { assignVoucherNumberIfPosted } from '@/lib/voucher-number';
import { withGuard } from '@/lib/route-guard';

// ─── GET - List recurring entries for the authenticated user ──────────────

export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  async (request, ctx) => {
    try {
      const { searchParams } = new URL(request.url);
      const statusFilter = searchParams.get('status');

      
      const where: Record<string, unknown> = { ...tenantFilter(ctx) };

      if (statusFilter && Object.values(RecurringStatus).includes(statusFilter as RecurringStatus)) {
        where.status = statusFilter;
      }

      const entries = await db.recurringEntry.findMany({
        where,
        orderBy: { nextExecution: 'asc' },
      });

      const today = todayLocal();

      const enrichedEntries = entries.map((entry) => {
        const nextExecLocal = parseLocalDate(entry.nextExecution.toISOString().split('T')[0]);
        const isOverdue = entry.status === 'ACTIVE' && entry.lastExecuted !== null && nextExecLocal < today;
        return { ...entry, isOverdue };
      });

      return NextResponse.json({ recurringEntries: enrichedEntries });
    } catch (error) {
      logger.error('List recurring entries error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

// ─── POST - Create a new recurring entry template ─────────────────────────

export const POST = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_CREATE] },
  async (request, ctx) => {
    try {
      const body = await request.json();
      const { name, description, frequency, startDate, endDate, lines, reference, accountId, amount, vatPercent } = body;

      // Validate required fields
      if (!name || !frequency || !startDate) {
        return NextResponse.json(
          { error: 'Missing required fields: name, frequency, startDate' },
          { status: 400 }
        );
      }

      // If no explicit lines provided, require purchase-based fields
      let resolvedLines = lines;
      if (!resolvedLines && accountId && amount !== undefined && vatPercent !== undefined) {
        const netAmt = typeof amount === 'number' ? amount : parseFloat(amount);
        const vatPct = typeof vatPercent === 'number' ? vatPercent : parseFloat(vatPercent);
        const vatAmt = Math.round(netAmt * vatPct / 100 * 100) / 100;
        const grossAmt = Math.round((netAmt + vatAmt) * 100) / 100;

        const vatAccount = await db.account.findFirst({
          where: {
            number: { startsWith: '54' },
            ...tenantFilter(ctx),
            isActive: true,
          },
        });

        const bankAccount = await db.account.findFirst({
          where: {
            number: { startsWith: '1100' },
            ...tenantFilter(ctx),
            isActive: true,
          },
        });

        if (!bankAccount) {
          return NextResponse.json(
            { error: 'Bank account (1100) not found. Please create it first.' },
            { status: 400 }
          );
        }

        const entryName = name || 'Purchase';
        resolvedLines = [
          {
            accountId,
            debit: netAmt,
            credit: 0,
            description: entryName,
          },
        ];

        if (vatAmt > 0 && vatAccount) {
          resolvedLines.push({
            accountId: vatAccount.id,
            debit: vatAmt,
            credit: 0,
            description: `Input VAT ${vatPct}%`,
          });
        }

        resolvedLines.push({
          accountId: bankAccount.id,
          debit: 0,
          credit: grossAmt,
          description: entryName,
        });
      }

      if (!resolvedLines) {
        return NextResponse.json(
          { error: 'Missing required fields: provide either lines or accountId/amount/vatPercent for purchase-based creation' },
          { status: 400 }
        );
      }

      // Validate frequency
      if (!Object.values(PrismaFrequency).includes(frequency)) {
        return NextResponse.json(
          { error: `Invalid frequency. Must be one of: ${Object.values(PrismaFrequency).join(', ')}` },
          { status: 400 }
        );
      }

      // Validate lines
      if (!Array.isArray(resolvedLines) || resolvedLines.length < 2) {
        return NextResponse.json(
          { error: 'A recurring entry must have at least 2 lines (double-entry)' },
          { status: 400 }
        );
      }

      for (const line of resolvedLines) {
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
      const accountIds = [...new Set(resolvedLines.map((l: { accountId: string }) => l.accountId))];
          const accounts = await db.account.findMany({
        where: {
          id: { in: accountIds },
          ...tenantFilter(ctx),
          isActive: true,
        },
      });

      if (accounts.length !== accountIds.length) {
        const foundIds = new Set(accounts.map(a => a.id));
        const missingIds = accountIds.filter((id: string) => !foundIds.has(id));
        return NextResponse.json(
          { error: `Invalid or inactive account IDs: ${missingIds.join(', ')}` },
          { status: 400 }
        );
      }

      // Validate double-entry balance
      const totalDebit = resolvedLines.reduce((sum: number, l: { debit: number }) => sum + l.debit, 0);
      const totalCredit = resolvedLines.reduce((sum: number, l: { credit: number }) => sum + l.credit, 0);

      if (Math.abs(totalDebit - totalCredit) > 0.005) {
        return NextResponse.json(
          { error: `Journal entry is not balanced. Total debit: ${totalDebit}, Total credit: ${totalCredit}` },
          { status: 400 }
        );
      }

      // Compute nextExecution from startDate
      const start = parseLocalDate(startDate);
      const nextExecution = new Date(start.getFullYear(), start.getMonth(), start.getDate());

      const entry = await db.recurringEntry.create({
        data: {
          name,
          description: description || name,
          frequency,
          startDate: start,
          endDate: endDate ? parseLocalDate(endDate) : null,
          nextExecution,
          lines: resolvedLines,
          reference: reference || null,
          userId: ctx.id,
          companyId: ctx.activeCompanyId!,
        },
      });

      // ─── Backfill: post all missed entries if startDate is in the past ──
      const today = todayLocal();
      const todayMs = today.getTime();
      const endDateLocal = entry.endDate
        ? parseLocalDate(entry.endDate.toISOString().split('T')[0])
        : null;

      if (start.getTime() <= todayMs) {
        let current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        let postedCount = 0;
        const maxBackfill = 3650;

        while (postedCount < maxBackfill) {
          const dotMs = new Date(
            current.getFullYear(), current.getMonth(), current.getDate()
          ).getTime();

          if (endDateLocal && dotMs > endDateLocal.getTime()) break;
          if (dotMs > todayMs) break;

          const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
          const journalDescription = `${name} — ${dateStr}`;

          let sequenceNumber = 1;
          if (reference) {
            const existingCount = await db.journalEntry.count({
              where: { companyId: ctx.activeCompanyId!, reference: { startsWith: reference } },
            });
            sequenceNumber = existingCount + 1;
          }
          const ref = reference
            ? `${reference}${String(sequenceNumber).padStart(3, '0')}`
            : null;

          await db.$transaction(async (tx) => {
            const je = await tx.journalEntry.create({
              data: {
                date: new Date(current),
                description: journalDescription,
                reference: ref,
                status: 'POSTED',
                companyId: ctx.activeCompanyId!,
                lines: {
                  create: (resolvedLines as Array<{ accountId: string; debit: number; credit: number; description?: string }>).map((l) => ({
                    companyId: ctx.activeCompanyId!,
                    accountId: l.accountId,
                    debit: l.debit,
                    credit: l.credit,
                    description: l.description || null,
                  })),
                },
              },
            });
            await assignVoucherNumberIfPosted(tx, je.id, ctx.activeCompanyId!, 'POSTED');
          });

          postedCount++;
          current = addFrequency(current, frequency as 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY');
        }

        let nextExec = new Date(current.getFullYear(), current.getMonth(), current.getDate());
        const shouldComplete = endDateLocal !== null && nextExec.getTime() > endDateLocal.getTime();

        await db.recurringEntry.update({
          where: { id: entry.id },
          data: {
            lastExecuted: new Date(),
            nextExecution: nextExec,
            ...(shouldComplete ? { status: 'COMPLETED' } : {}),
          },
        });

        const updatedEntry = await db.recurringEntry.findFirst({
          where: { id: entry.id },
        });

        if (postedCount > 0) {
          logger.info(
            `[RECURRING-CREATE] Backfilled ${postedCount} journal entries for "${name}" (${startDate} → ${formatDateLocal(today)}) in company ${ctx.activeCompanyId}`,
          );
        }

        await auditCreate(
          ctx.id,
          'RecurringEntry',
          entry.id,
          { name, description: description || name, frequency, startDate, endDate, reference, lineCount: resolvedLines.length, totalDebit, totalCredit, backfilledCount: postedCount },
          requestMetadata(request),
          ctx.activeCompanyId
        );

        return NextResponse.json({ recurringEntry: updatedEntry || entry, backfilledCount: postedCount }, { status: 201 });
      }

      await auditCreate(
        ctx.id,
        'RecurringEntry',
        entry.id,
        { name, description: description || name, frequency, startDate, endDate, reference, lineCount: resolvedLines.length, totalDebit, totalCredit },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      return NextResponse.json({ recurringEntry: entry }, { status: 201 });
    } catch (error) {
      logger.error('Create recurring entry error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

// ─── PUT - Update a recurring entry template ──────────────────────────────

export const PUT = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_EDIT] },
  async (request, ctx) => {
    try {
      const body = await request.json();
      const { id, name, description, frequency, status, endDate, lines, reference } = body;

      if (!id) {
        return NextResponse.json(
          { error: 'Missing required field: id' },
          { status: 400 }
        );
      }

      
      const existing = await db.recurringEntry.findFirst({
        where: { id, ...tenantFilter(ctx) },
      });

      if (!existing) {
        return NextResponse.json({ error: 'Recurring entry not found' }, { status: 404 });
      }

      if (status !== undefined && !Object.values(RecurringStatus).includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${Object.values(RecurringStatus).join(', ')}` },
          { status: 400 }
        );
      }

      if (frequency !== undefined && !Object.values(PrismaFrequency).includes(frequency)) {
        return NextResponse.json(
          { error: `Invalid frequency. Must be one of: ${Object.values(PrismaFrequency).join(', ')}` },
          { status: 400 }
        );
      }

      if (lines !== undefined) {
        if (!Array.isArray(lines) || lines.length < 2) {
          return NextResponse.json(
            { error: 'A recurring entry must have at least 2 lines (double-entry)' },
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

        const accountIds = [...new Set(lines.map((l: { accountId: string }) => l.accountId))];
        const accountsForUpdate = await db.account.findMany({
          where: {
            id: { in: accountIds },
            ...tenantFilter(ctx),
            isActive: true,
          },
        });

        if (accountsForUpdate.length !== accountIds.length) {
          const foundIds = new Set(accountsForUpdate.map(a => a.id));
          const missingIds = accountIds.filter((aid: string) => !foundIds.has(aid));
          return NextResponse.json(
            { error: `Invalid or inactive account IDs: ${missingIds.join(', ')}` },
            { status: 400 }
          );
        }

        const totalDebit = lines.reduce((sum: number, l: { debit: number }) => sum + l.debit, 0);
        const totalCredit = lines.reduce((sum: number, l: { credit: number }) => sum + l.credit, 0);

        if (Math.abs(totalDebit - totalCredit) > 0.005) {
          return NextResponse.json(
            { error: `Journal entry is not balanced. Total debit: ${totalDebit}, Total credit: ${totalCredit}` },
            { status: 400 }
          );
        }
      }

      const updateData: Prisma.RecurringEntryUpdateInput = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (frequency !== undefined) updateData.frequency = frequency;
      if (status !== undefined) updateData.status = status;
      if (endDate !== undefined) updateData.endDate = endDate ? parseLocalDate(endDate) : null;
      if (lines !== undefined) updateData.lines = lines;
      if (reference !== undefined) updateData.reference = reference || null;

      const frequencyChanged = frequency !== undefined && frequency !== existing.frequency;
      const endDateChanged = endDate !== undefined;

      if (frequencyChanged || endDateChanged) {
        const baseDate = existing.lastExecuted
          ? parseLocalDate(existing.lastExecuted.toISOString().split('T')[0])
          : parseLocalDate(existing.startDate.toISOString().split('T')[0]);

        const newFrequency = frequency || existing.frequency;
        const recalculatedNext = addFrequency(baseDate, newFrequency as PrismaFrequency);

        const newEndDate = endDate !== undefined ? (endDate ? parseLocalDate(endDate) : null) : existing.endDate;

        if (newEndDate && recalculatedNext > newEndDate) {
          updateData.status = 'COMPLETED' as RecurringStatus;
        }

        updateData.nextExecution = recalculatedNext;
      }

      const entry = await db.recurringEntry.update({
        where: { id },
        data: updateData,
      });

      const oldData: Record<string, unknown> = {
        name: existing.name,
        description: existing.description,
        frequency: existing.frequency,
        status: existing.status,
        endDate: existing.endDate,
        reference: existing.reference,
      };

      const newData: Record<string, unknown> = {
        name: entry.name,
        description: entry.description,
        frequency: entry.frequency,
        status: entry.status,
        endDate: entry.endDate,
        reference: entry.reference,
        nextExecution: entry.nextExecution,
      };

      await auditUpdate(
        ctx.id,
        'RecurringEntry',
        id,
        oldData,
        newData,
        requestMetadata(request),
        ctx.activeCompanyId
      );

      return NextResponse.json({ recurringEntry: entry });
    } catch (error) {
      logger.error('Update recurring entry error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

// ─── DELETE - Soft-cancel a recurring entry ──────────────────────────────

export const DELETE = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_DELETE] },
  async (request, ctx) => {
    try {
      const body = await request.json();
      const { id } = body;

      if (!id) {
        return NextResponse.json(
          { error: 'Missing required field: id' },
          { status: 400 }
        );
      }

      
      const existing = await db.recurringEntry.findFirst({
        where: { id, ...tenantFilter(ctx) },
      });

      if (!existing) {
        return NextResponse.json({ error: 'Recurring entry not found' }, { status: 404 });
      }

      if (existing.status === 'COMPLETED') {
        return NextResponse.json(
          { error: 'Recurring entry is already completed/cancelled' },
          { status: 400 }
        );
      }

      const entry = await db.recurringEntry.update({
        where: { id },
        data: { status: 'COMPLETED' },
      });

      await auditCancel(
        ctx.id,
        'RecurringEntry',
        id,
        'Cancelled via DELETE request',
        requestMetadata(request),
        ctx.activeCompanyId
      );

      return NextResponse.json({ recurringEntry: entry });
    } catch (error) {
      logger.error('Delete recurring entry error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
