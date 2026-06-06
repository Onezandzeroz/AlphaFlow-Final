import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { SESSION_COOKIE_NAME } from '@/lib/session';
import { seedDemoCompany } from '@/lib/seed-demo-company';
import { logger } from '@/lib/logger';
import { cookies } from 'next/headers';
import { auditLog, requestMetadata } from '@/lib/audit';
import { withGuard } from '@/lib/route-guard';

// ─── GET: Check demo mode status ──────────────────────────────────

export const GET = withGuard({ auth: true }, async (request, ctx) => {
  try {
    const isDemoCompany = ctx.isDemoCompany;

    return NextResponse.json({
      demoModeEnabled: isDemoCompany,
      isDemoCompany,
      demoCompanyName: isDemoCompany ? ctx.activeCompanyName : null,
    });
  } catch (error) {
    logger.error('[Demo Mode GET] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

// ─── POST: Enter / Exit demo mode ─────────────────────────────────

export const POST = withGuard({
  auth: true,
  blockOversight: true,
}, async (request, ctx) => {
  try {
    const body = await request.json();
    const { action } = body as { action: 'enter' | 'exit' | 'reseed' };

    if (action !== 'enter' && action !== 'exit' && action !== 'reseed') {
      return NextResponse.json(
        { error: 'Invalid action. Must be "enter", "exit", or "reseed".' },
        { status: 400 }
      );
    }

    // ── Reseed demo company ────────────
    if (action === 'reseed') {
      const demoCompany = await db.company.findFirst({
        where: { isDemo: true, isActive: true, cvrNumber: '29876543' },
      });
      if (!demoCompany) {
        return NextResponse.json({ error: 'Demo company not found' }, { status: 404 });
      }

      await db.$transaction([
        db.journalEntryLine.deleteMany({ where: { journalEntry: { companyId: demoCompany.id } } }),
        db.journalEntry.deleteMany({ where: { companyId: demoCompany.id } }),
        db.bankStatementLine.deleteMany({ where: { bankStatement: { companyId: demoCompany.id } } }),
        db.bankStatement.deleteMany({ where: { companyId: demoCompany.id } }),
        db.budgetEntry.deleteMany({ where: { budget: { companyId: demoCompany.id } } }),
        db.budget.deleteMany({ where: { companyId: demoCompany.id } }),
        db.transaction.deleteMany({ where: { companyId: demoCompany.id } }),
        db.invoice.deleteMany({ where: { companyId: demoCompany.id } }),
        db.fiscalPeriod.deleteMany({ where: { companyId: demoCompany.id } }),
        db.contact.deleteMany({ where: { companyId: demoCompany.id } }),
        db.account.deleteMany({ where: { companyId: demoCompany.id } }),
        db.recurringEntry.deleteMany({ where: { companyId: demoCompany.id } }),
        db.bankConnection.deleteMany({ where: { companyId: demoCompany.id } }),
      ]);

      await seedDemoCompany(demoCompany.id, ctx.id);

      logger.info('[Demo Mode] Reseeded demo company:', demoCompany.id);
      await auditLog({
        action: 'UPDATE',
        entityType: 'Company',
        entityId: demoCompany.id,
        userId: ctx.id,
        companyId: ctx.activeCompanyId,
        changes: { reseed: { old: true, new: true } },
        metadata: requestMetadata(request),
      });

      return NextResponse.json({ message: 'Demo company reseeded successfully' });
    }

    // ── Get current session token ──
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (action === 'enter') {
      // Find the shared demo company
      let demoCompany = await db.company.findFirst({
        where: {
          isActive: true,
          cvrNumber: '29876543',
        },
      });
      let demoCompanyId: string;

      if (!demoCompany) {
        const appOwnerCompany = await db.company.findUnique({
          where: { name: 'AlphaAi' },
          select: { dashboardWidgets: true },
        });
        const inheritedWidgets = appOwnerCompany?.dashboardWidgets as Record<string, unknown> | undefined;

        demoCompany = await db.company.create({
          data: {
            name: 'Nordisk Erhverv ApS',
            address: 'Vesterbrogade 42, 3. sal',
            phone: '+45 33 12 34 56',
            email: 'info@nordiskerhverv.dk',
            cvrNumber: '29876543',
            companyType: 'ApS',
            invoicePrefix: 'NE',
            invoiceTerms: 'Netto 30 dage',
            nextInvoiceSequence: 1,
            currentYear: new Date().getFullYear(),
            bankName: 'Nordea',
            bankAccount: '1234 567890',
            bankRegistration: '2190',
            bankIban: 'DK9520001234567890',
            bankStreet: 'Strøget 10',
            bankCity: 'København K',
            bankCountry: 'Danmark',
            isDemo: true,
            isActive: true,
            ...(inheritedWidgets && { dashboardWidgets: inheritedWidgets }),
          },
        });

        demoCompanyId = demoCompany.id;
        await seedDemoCompany(demoCompanyId, ctx.id);
        logger.info('[Demo Mode] Created and seeded demo company:', demoCompanyId);
      } else {
        demoCompanyId = demoCompany.id;

        await db.$transaction([
          db.journalEntryLine.deleteMany({ where: { journalEntry: { companyId: demoCompany.id } } }),
          db.journalEntry.deleteMany({ where: { companyId: demoCompany.id } }),
          db.bankStatementLine.deleteMany({ where: { bankStatement: { companyId: demoCompany.id } } }),
          db.bankStatement.deleteMany({ where: { companyId: demoCompany.id } }),
          db.budgetEntry.deleteMany({ where: { budget: { companyId: demoCompany.id } } }),
          db.budget.deleteMany({ where: { companyId: demoCompany.id } }),
          db.transaction.deleteMany({ where: { companyId: demoCompany.id } }),
          db.invoice.deleteMany({ where: { companyId: demoCompany.id } }),
          db.fiscalPeriod.deleteMany({ where: { companyId: demoCompany.id } }),
          db.contact.deleteMany({ where: { companyId: demoCompany.id } }),
          db.account.deleteMany({ where: { companyId: demoCompany.id } }),
          db.recurringEntry.deleteMany({ where: { companyId: demoCompany.id } }),
          db.bankConnection.deleteMany({ where: { companyId: demoCompany.id } }),
        ]);

        await seedDemoCompany(demoCompanyId, ctx.id);
        logger.info('[Demo Mode] Re-seeded existing demo company:', demoCompanyId);
      }

      // Ensure the user has a UserCompany membership for the demo company
      const existingMembership = await db.userCompany.findUnique({
        where: {
          userId_companyId: { userId: ctx.id, companyId: demoCompanyId },
        },
      });

      if (!existingMembership) {
        await db.userCompany.create({
          data: {
            userId: ctx.id,
            companyId: demoCompanyId,
            role: 'VIEWER',
          },
        });
      }

      // Save the user's current (original) company ID in userPrefs
      const user = await db.user.findUnique({
        where: { id: ctx.id },
        select: { userPrefs: true },
      });

      const currentPrefs = user?.userPrefs
        ? (user.userPrefs as Record<string, unknown>)
        : {};

      if (ctx.activeCompanyId && !currentPrefs.originalCompanyId) {
        currentPrefs.originalCompanyId = ctx.activeCompanyId;
        await db.user.update({
          where: { id: ctx.id },
          data: { userPrefs: currentPrefs },
        });
      }

      // Update session's activeCompanyId to the demo company
      if (token) {
        await db.session.update({
          where: { token },
          data: { activeCompanyId: demoCompanyId },
        });
      }

      await db.user.update({
        where: { id: ctx.id },
        data: { demoModeEnabled: true },
      });

      await auditLog({
        action: 'UPDATE',
        entityType: 'User',
        entityId: ctx.id,
        userId: ctx.id,
        companyId: ctx.activeCompanyId,
        changes: { demoModeEnabled: { old: false, new: true } },
        metadata: requestMetadata(request),
      });

      return NextResponse.json({
        message: 'Demo mode enabled',
        demoModeEnabled: true,
        isDemoCompany: true,
        activeCompanyId: demoCompanyId,
        activeCompanyName: demoCompany.name,
      });
    }

    // ── Exit demo mode ──────────────────────────────────────────

    if (!ctx.isDemoCompany) {
      await db.user.update({
        where: { id: ctx.id },
        data: { demoModeEnabled: false },
      });

      await auditLog({
        action: 'UPDATE',
        entityType: 'User',
        entityId: ctx.id,
        userId: ctx.id,
        companyId: ctx.activeCompanyId,
        changes: { demoModeEnabled: { old: true, new: false } },
        metadata: requestMetadata(request),
      });

      return NextResponse.json({
        message: 'Demo mode exited',
        demoModeEnabled: false,
        isDemoCompany: false,
        activeCompanyId: ctx.activeCompanyId,
        activeCompanyName: ctx.activeCompanyName,
      });
    }

    const user = await db.user.findUnique({
      where: { id: ctx.id },
      select: { userPrefs: true },
    });

    const prefs = user?.userPrefs ? (user.userPrefs as Record<string, any>) : {};
    let originalCompanyId: string | null = (prefs.originalCompanyId as string) ?? null;

    if (!originalCompanyId) {
      const firstNonDemoCompany = await db.userCompany.findFirst({
        where: {
          userId: ctx.id,
          company: { isDemo: false, isActive: true },
        },
        orderBy: { joinedAt: 'asc' },
        select: { companyId: true },
      });
      originalCompanyId = firstNonDemoCompany?.companyId ?? null;
    }

    if (originalCompanyId) {
      const originalCompany = await db.company.findUnique({
        where: { id: originalCompanyId },
        select: { id: true, name: true, isActive: true },
      });

      if (!originalCompany || !originalCompany.isActive) {
        const fallback = await db.userCompany.findFirst({
          where: {
            userId: ctx.id,
            company: { isDemo: false, isActive: true },
          },
          orderBy: { joinedAt: 'asc' },
          select: { companyId: true },
        });
        originalCompanyId = fallback?.companyId ?? null;
      }
    }

    if (token && originalCompanyId) {
      await db.session.update({
        where: { token },
        data: { activeCompanyId: originalCompanyId },
      });
    }

    await db.user.update({
      where: { id: ctx.id },
      data: { demoModeEnabled: false },
    });

    await auditLog({
      action: 'UPDATE',
      entityType: 'User',
      entityId: ctx.id,
      userId: ctx.id,
      companyId: ctx.activeCompanyId,
      changes: { demoModeEnabled: { old: true, new: false } },
      metadata: requestMetadata(request),
    });

    if (prefs.originalCompanyId) {
      delete prefs.originalCompanyId;
      await db.user.update({
        where: { id: ctx.id },
        data: { userPrefs: prefs },
      });
    }

    let activeCompanyName: string | null = null;
    if (originalCompanyId) {
      const company = await db.company.findUnique({
        where: { id: originalCompanyId },
        select: { name: true },
      });
      activeCompanyName = company?.name ?? null;
    }

    return NextResponse.json({
      message: 'Demo mode exited',
      demoModeEnabled: false,
      isDemoCompany: false,
      activeCompanyId: originalCompanyId,
      activeCompanyName,
    });
  } catch (error) {
    logger.error('[Demo Mode POST] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
