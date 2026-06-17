import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { AccountType, ProjectStatus } from '@prisma/client';
import { logger } from '@/lib/logger';
import { tenantFilter, Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { notifyDataChange } from '@/lib/notify-data-change';

// Helper to round to 2 decimals
const r = (n: number) => Math.round(n * 100) / 100;

// ─── GET - List all projects for tenant with aggregated financial status ──

export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  async (request, ctx) => {
    try {
      const { searchParams } = new URL(request.url);
      const statusFilter = searchParams.get('status');

      const where: Record<string, unknown> = { ...tenantFilter(ctx) };
      if (statusFilter && Object.values(ProjectStatus).includes(statusFilter as ProjectStatus)) {
        where.status = statusFilter;
      }

      const projects = await db.project.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true } },
          journalLines: {
            where: {
              journalEntry: {
                status: 'POSTED',
                cancelled: false,
              },
            },
            include: {
              account: { select: { type: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const result = projects.map((project) => {
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

        // Remove journalLines from the response — only needed for computation
        const { journalLines, ...projectData } = project;

        return {
          ...projectData,
          budgetTotal,
          totalRevenue,
          totalExpenses,
          result: projectResult,
          budgetUsage,
        };
      });

      return NextResponse.json({ projects: result });
    } catch (error) {
      logger.error('Projects GET error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);

// ─── POST - Create a new project ────────────────────────────────────

export const POST = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_CREATE] },
  async (request, ctx) => {
    try {
      const body = await request.json();
      const { name, code, description, color, status, startDate, endDate, budgetTotal, customerId } = body;

      // Validate required fields
      if (!name || typeof name !== 'string' || !name.trim()) {
        return NextResponse.json(
          { error: 'Missing required field: name' },
          { status: 400 }
        );
      }

      // If code is provided, check uniqueness per company
      if (code && typeof code === 'string' && code.trim()) {
        const existing = await db.project.findFirst({
          where: {
            ...tenantFilter(ctx),
            code: code.trim(),
          },
        });
        if (existing) {
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
      if (customerId) {
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

      const project = await db.project.create({
        data: {
          name: name.trim(),
          code: code?.trim() || null,
          description: description || null,
          color: color || null,
          status: status || ProjectStatus.ACTIVE,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          budgetTotal: budgetTotal != null ? budgetTotal : null,
          customerId: customerId || null,
          companyId: ctx.activeCompanyId!,
          userId: ctx.id,
        },
        include: {
          customer: { select: { id: true, name: true } },
        },
      });

      await auditCreate(
        ctx.id,
        'Project',
        project.id,
        { name: project.name, code: project.code, status: project.status, budgetTotal: project.budgetTotal ? Number(project.budgetTotal) : null },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      notifyDataChange({ scope: 'projects', companyId: ctx.activeCompanyId!, action: 'create' }).catch(() => {});

      return NextResponse.json({ project }, { status: 201 });
    } catch (error) {
      logger.error('Project POST error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
