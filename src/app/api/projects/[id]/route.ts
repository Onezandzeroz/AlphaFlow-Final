import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditUpdate, auditCancel, requestMetadata } from '@/lib/audit';
import { AccountType, ProjectStatus } from '@prisma/client';
import { logger } from '@/lib/logger';
import { tenantFilter, Permission } from '@/lib/rbac';
import { withGuard, READ, MUTATE } from '@/lib/route-guard';
import { notifyDataChange } from '@/lib/notify-data-change';

// Helper to round to 2 decimals
const r = (n: number) => Math.round(n * 100) / 100;

// ─── GET - Get single project with computed KPIs ───────────────────

export const GET = withGuard(
  { ...READ, permissions: [Permission.DATA_READ] },
  async (request, ctx, context) => {
    try {
      const { id } = await context.params as { id: string };

      const project = await db.project.findFirst({
        where: { id, ...tenantFilter(ctx) },
        include: {
          customer: { select: { id: true, name: true } },
          budgetEntries: {
            include: {
              account: true,
            },
          },
          // Include full invoice details for the Invoices tab
          invoices: {
            select: {
              id: true,
              invoiceNumber: true,
              issueDate: true,
              dueDate: true,
              status: true,
              totalAmount: true,
              currency: true,
              customerName: true,
            },
            orderBy: { issueDate: 'desc' },
          },
          // Include journal lines WITH their parent journal entry so the
          // Transactions tab can show date, description, voucher number, etc.
          journalLines: {
            where: {
              journalEntry: {
                status: 'POSTED',
                cancelled: false,
              },
            },
            include: {
              account: { select: { id: true, number: true, name: true, type: true } },
              journalEntry: {
                select: {
                  id: true,
                  date: true,
                  description: true,
                  reference: true,
                  voucherNumber: true,
                  status: true,
                },
              },
            },
            orderBy: {
              journalEntry: { date: 'desc' },
            },
          },
        },
      });

      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      // Compute KPIs from posted journal lines
      let totalRevenue = 0;
      let totalExpenses = 0;

      for (const line of project.journalLines) {
        if (line.account.type === AccountType.REVENUE) {
          totalRevenue += Number(line.credit || 0) - Number(line.debit || 0);
        } else if (line.account.type === AccountType.EXPENSE) {
          totalExpenses += Number(line.debit || 0) - Number(line.credit || 0);
        }
      }

      totalRevenue = r(totalRevenue);
      totalExpenses = r(totalExpenses);
      const projectResult = r(totalRevenue - totalExpenses);
      const budgetTotal = project.budgetTotal ? Number(project.budgetTotal) : 0;
      const budgetUsage = budgetTotal > 0 ? r((totalExpenses / budgetTotal) * 100) : 0;

      // Build a transactions list for the Transactions tab — one row per
      // journal line (so multi-line entries appear as multiple rows).
      // The journalEntry is denormalized onto each row for easy display.
      const transactions = project.journalLines.map((line) => ({
        id: line.id,
        date: line.journalEntry.date,
        description: line.journalEntry.description,
        reference: line.journalEntry.reference,
        voucherNumber: line.journalEntry.voucherNumber,
        accountNumber: line.account.number,
        accountName: line.account.name,
        accountType: line.account.type,
        lineDescription: line.description,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
      }));

      // Map invoice Decimal fields to numbers for JSON serialization
      const invoices = project.invoices.map((inv) => ({
        ...inv,
        totalAmount: inv.totalAmount ? Number(inv.totalAmount) : 0,
        issueDate: inv.issueDate?.toISOString() || null,
        dueDate: inv.dueDate?.toISOString() || null,
      }));

      // Remove raw relations from the response — we've extracted what we need
      const { journalLines: _jl, invoices: _inv, ...projectData } = project;

      return NextResponse.json({
        project: {
          ...projectData,
          budgetTotal,
          invoiceCount: invoices.length,
          invoices,
          transactions,
        },
        kpis: {
          totalRevenue,
          totalExpenses,
          projectResult,
          budgetUsage,
        },
      });
    } catch (error) {
      logger.error('Project GET by ID error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);

// ─── PUT - Update project ──────────────────────────────────────────

export const PUT = withGuard(
  { ...MUTATE, permissions: [Permission.DATA_EDIT] },
  async (request, ctx, context) => {
    try {
      const { id } = await context.params as { id: string };
      const body = await request.json();
      const { name, code, description, color, status, startDate, endDate, budgetTotal, customerId } = body;

      const existing = await db.project.findFirst({
        where: { id, ...tenantFilter(ctx) },
      });

      if (!existing) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      // If code is being changed, check uniqueness per company
      if (code !== undefined && code !== null && code.trim() !== '' && code.trim() !== existing.code) {
        const duplicate = await db.project.findFirst({
          where: {
            ...tenantFilter(ctx),
            code: code.trim(),
            id: { not: id },
          },
        });
        if (duplicate) {
          return NextResponse.json(
            { error: 'A project with this code already exists in this company' },
            { status: 409 }
          );
        }
      }

      // Validate status if provided
      if (status && !Object.values(ProjectStatus).includes(status as ProjectStatus)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${Object.values(ProjectStatus).join(', ')}` },
          { status: 400 }
        );
      }

      // Validate customerId if provided
      if (customerId !== undefined && customerId !== null) {
        const customer = await db.contact.findFirst({
          where: { id: customerId, ...tenantFilter(ctx) },
        });
        if (!customer) {
          return NextResponse.json(
            { error: 'Customer not found' },
            { status: 400 }
          );
        }
      }

      // Build update data
      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name.trim();
      if (code !== undefined) updateData.code = code?.trim() || null;
      if (description !== undefined) updateData.description = description || null;
      if (color !== undefined) updateData.color = color || null;
      if (status !== undefined) updateData.status = status;
      if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
      if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
      if (budgetTotal !== undefined) updateData.budgetTotal = budgetTotal != null ? budgetTotal : null;
      if (customerId !== undefined) updateData.customerId = customerId || null;

      const oldData: Record<string, unknown> = {
        name: existing.name,
        code: existing.code,
        description: existing.description,
        color: existing.color,
        status: existing.status,
        startDate: existing.startDate,
        endDate: existing.endDate,
        budgetTotal: existing.budgetTotal ? Number(existing.budgetTotal) : null,
        customerId: existing.customerId,
      };

      const project = await db.project.update({
        where: { id },
        data: updateData,
        include: {
          customer: { select: { id: true, name: true } },
        },
      });

      const newData: Record<string, unknown> = {};
      if (name !== undefined) newData.name = name.trim();
      if (code !== undefined) newData.code = code?.trim() || null;
      if (status !== undefined) newData.status = status;
      if (budgetTotal !== undefined) newData.budgetTotal = budgetTotal;
      if (customerId !== undefined) newData.customerId = customerId || null;

      await auditUpdate(
        ctx.id,
        'Project',
        id,
        oldData,
        newData,
        requestMetadata(request),
        ctx.activeCompanyId
      );

      notifyDataChange({ scope: 'projects', companyId: ctx.activeCompanyId!, action: 'update' }).catch(() => {});

      return NextResponse.json({ project });
    } catch (error) {
      logger.error('Project PUT error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);

// ─── DELETE - Soft delete (set status to CANCELLED) ────────────────

export const DELETE = withGuard(
  { ...MUTATE, permissions: [Permission.DATA_DELETE] },
  async (request, ctx, context) => {
    try {
      const { id } = await context.params as { id: string };

      const existing = await db.project.findFirst({
        where: { id, ...tenantFilter(ctx) },
      });

      if (!existing) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      if (existing.status === ProjectStatus.CANCELLED) {
        return NextResponse.json(
          { error: 'Project is already cancelled' },
          { status: 400 }
        );
      }

      const project = await db.project.update({
        where: { id },
        data: { status: ProjectStatus.CANCELLED },
        include: {
          customer: { select: { id: true, name: true } },
        },
      });

      await auditCancel(
        ctx.id,
        'Project',
        id,
        'Project cancelled via DELETE',
        requestMetadata(request),
        ctx.activeCompanyId
      );

      notifyDataChange({ scope: 'projects', companyId: ctx.activeCompanyId!, action: 'delete' }).catch(() => {});

      return NextResponse.json({ project });
    } catch (error) {
      logger.error('Project DELETE error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
