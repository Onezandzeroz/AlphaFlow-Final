import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { auditCreate, auditUpdate, auditLog, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { notifyOwner } from '@/lib/notify-owner';
import { notifyDataChange } from '@/lib/notify-data-change';

const guard = routeConfig['/api/company'];

// GET /api/company - Get active company info
export const GET = withGuard(guard.GET!, async (request, ctx) => {
  try {
    // Use explicit `select` to avoid failures when Prisma schema has columns
    // that haven't been synced to the database yet (e.g. after adding new features).
    const company = await db.company.findUnique({
      where: { id: ctx.activeCompanyId! },
      select: {
        id: true, logo: true, name: true, address: true, phone: true,
        email: true, cvrNumber: true, invoicePrefix: true,
        bankName: true, bankAccount: true, bankRegistration: true,
        bankIban: true, bankStreet: true, bankCity: true, bankCountry: true,
        companyType: true, invoiceTerms: true, invoiceNotesTemplate: true,
        nextInvoiceSequence: true, currentYear: true, isDemo: true, updatedAt: true,
        // E-invoice / eDelivery fields for onboarding status detection
        einvoiceEnabled: true, einvoiceRegistrationNo: true, einvoiceEndpointId: true,
        einvoiceDeliveryMode: true, storecoveConnected: true,
        // Project Mode gate (FASE 4) — SuperDev per-tenant visibility control
        projectModeEnabled: true,
      },
    });

    // Auto-fix stale currentYear: if the DB value doesn't match the actual year,
    // update it so the frontend preview shows the correct year.
    // Note: nextInvoiceSequence is NOT reset here — the invoice creation code
    // handles the year-rollover sequence reset when the first invoice is created.
    if (company && company.currentYear !== new Date().getFullYear()) {
      await db.company.update({
        where: { id: company.id },
        data: { currentYear: new Date().getFullYear() },
        select: { currentYear: true },
      });
      company.currentYear = new Date().getFullYear();
    }

    // Map Company model to the frontend-expected format (camelCase)
    const companyInfo = company ? {
      id: company.id,
      logo: company.logo,
      companyName: company.name,
      address: company.address,
      phone: company.phone,
      email: company.email,
      cvrNumber: company.cvrNumber,
      invoicePrefix: company.invoicePrefix,
      bankName: company.bankName,
      bankAccount: company.bankAccount,
      bankRegistration: company.bankRegistration,
      bankIban: company.bankIban,
      bankStreet: company.bankStreet,
      bankCity: company.bankCity,
      bankCountry: company.bankCountry,
      companyType: company.companyType,
      invoiceTerms: company.invoiceTerms,
      invoiceNotesTemplate: company.invoiceNotesTemplate,
      nextInvoiceSequence: company.nextInvoiceSequence,
      currentYear: company.currentYear,
      isDemo: company.isDemo,
      updatedAt: company.updatedAt,
      // E-invoice / eDelivery fields for onboarding status detection
      einvoiceEnabled: company.einvoiceEnabled,
      einvoiceRegistrationNo: company.einvoiceRegistrationNo,
      einvoiceEndpointId: company.einvoiceEndpointId,
      einvoiceDeliveryMode: company.einvoiceDeliveryMode,
      storecoveConnected: company.storecoveConnected,
      projectModeEnabled: company.projectModeEnabled,
    } : null;

    return NextResponse.json({ companyInfo });
  } catch (error) {
    logger.error('Failed to fetch company info:', error);
    return NextResponse.json({ error: 'Failed to fetch company info' }, { status: 500 });
  }
});

// POST /api/company - Create a new company
export const POST = withGuard(guard.POST!, async (request, ctx) => {
  try {
    const body = await request.json();
    const {
      logo, companyName, address, phone, email, cvrNumber, invoicePrefix,
      bankName, bankAccount, bankRegistration, bankIban, bankStreet, bankCity,
      bankCountry, invoiceTerms, companyType, invoiceNotesTemplate,
    } = body;

    if (!companyName) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    // Enforce unique company name — no two tenants may share a name
    const existingWithName = await db.company.findFirst({
      where: { name: companyName },
      select: { id: true, name: true },
    });
    if (existingWithName) {
      return NextResponse.json(
        { error: `A company named "${companyName}" already exists. Company names must be unique.` },
        { status: 409 }
      );
    }

    // Inherit AppOwner widget defaults for the new company
    const appOwnerCompany = await db.company.findUnique({
      where: { name: 'AlphaAi' },
      select: { dashboardWidgets: true },
    });
    const inheritedWidgets = appOwnerCompany?.dashboardWidgets as Record<string, unknown> | undefined;

    const company = await db.company.create({
      data: {
        name: companyName,
        logo: logo || null,
        address: address || '',
        phone: phone || '',
        email: email || '',
        cvrNumber: cvrNumber || '',
        invoicePrefix: invoicePrefix?.toUpperCase() || 'INV',
        currentYear: new Date().getFullYear(),
        isDemo: false,
        bankName: bankName || '',
        bankAccount: bankAccount || '',
        bankRegistration: bankRegistration || '',
        bankIban: bankIban || null,
        bankStreet: bankStreet || null,
        bankCity: bankCity || null,
        bankCountry: bankCountry || null,
        invoiceTerms: invoiceTerms || undefined,
        companyType: companyType || null,
        invoiceNotesTemplate: invoiceNotesTemplate || null,
        ...(inheritedWidgets && { dashboardWidgets: inheritedWidgets }),
      },
    });

    // Assign the user as OWNER of the new company
    await db.userCompany.create({
      data: {
        userId: ctx.id,
        companyId: company.id,
        role: 'OWNER',
      },
    });

    await auditCreate(ctx.id, 'Company', company.id, { companyName, cvrNumber }, requestMetadata(request), company.id);

    const companyInfo = {
      id: company.id,
      logo: company.logo,
      companyName: company.name,
      address: company.address,
      phone: company.phone,
      email: company.email,
      cvrNumber: company.cvrNumber,
      invoicePrefix: company.invoicePrefix,
      bankName: company.bankName,
      bankAccount: company.bankAccount,
      bankRegistration: company.bankRegistration,
      bankIban: company.bankIban,
      bankStreet: company.bankStreet,
      bankCity: company.bankCity,
      bankCountry: company.bankCountry,
      companyType: company.companyType,
      invoiceTerms: company.invoiceTerms,
      invoiceNotesTemplate: company.invoiceNotesTemplate,
      nextInvoiceSequence: company.nextInvoiceSequence,
      currentYear: company.currentYear,
      isDemo: company.isDemo,
      updatedAt: company.updatedAt,
    };

    return NextResponse.json({ companyInfo }, { status: 201 });
  } catch (error) {
    logger.error('Failed to create company:', error);
    return NextResponse.json({ error: 'Failed to create company' }, { status: 500 });
  }
});

// PUT /api/company - Update active company info
export const PUT = withGuard(guard.PUT!, async (request, ctx) => {
  try {
    const body = await request.json();
    const {
      logo, companyName, address, phone, email, cvrNumber, invoicePrefix,
      bankName, bankAccount, bankRegistration, bankIban, bankStreet, bankCity,
      bankCountry, invoiceTerms, companyType, invoiceNotesTemplate,
    } = body;

    const existing = await db.company.findUnique({
      where: { id: ctx.activeCompanyId! },
      select: {
        id: true, name: true, address: true, cvrNumber: true, phone: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Enforce unique company name — block rename if another company has that name
    if (companyName && companyName !== existing.name) {
      const nameTaken = await db.company.findFirst({
        where: { name: companyName },
        select: { id: true, name: true },
      });
      if (nameTaken) {
        return NextResponse.json(
          { error: `A company named "${companyName}" already exists. Company names must be unique.` },
          { status: 409 }
        );
      }
    }

    // Build old data snapshot for audit
    const oldData: Record<string, unknown> = { companyName: existing.name, cvrNumber: existing.cvrNumber };

    const company = await db.company.update({
      where: { id: ctx.activeCompanyId! },
      data: {
        ...(logo !== undefined && { logo }),
        ...(companyName && { name: companyName }),
        ...(address && { address }),
        ...(phone && { phone }),
        ...(email && { email }),
        ...(cvrNumber && { cvrNumber }),
        ...(invoicePrefix && { invoicePrefix: invoicePrefix.toUpperCase() }),
        ...(bankName && { bankName }),
        ...(bankAccount && { bankAccount }),
        ...(bankRegistration && { bankRegistration }),
        ...(bankIban !== undefined && { bankIban }),
        ...(bankStreet !== undefined && { bankStreet }),
        ...(bankCity !== undefined && { bankCity }),
        ...(bankCountry !== undefined && { bankCountry }),
        ...(invoiceTerms !== undefined && { invoiceTerms }),
        ...(companyType !== undefined && { companyType }),
        ...(invoiceNotesTemplate !== undefined && { invoiceNotesTemplate }),
      },
    });

    const newData: Record<string, unknown> = { companyName: company.name, cvrNumber: company.cvrNumber };
    await auditUpdate(ctx.id, 'Company', existing.id, oldData, newData, requestMetadata(request), ctx.activeCompanyId);

    // ─── Notify app owner on first complete company save ───────
    // Detect: previously empty required fields → now all filled.
    // "Complete" means: name (always set), address, cvrNumber, phone all have content.
    const wasComplete = !!(existing.address?.trim() && existing.cvrNumber?.trim() && existing.phone?.trim());
    const isNowComplete = !!(company.address?.trim() && company.cvrNumber?.trim() && company.phone?.trim());
    if (!wasComplete && isNowComplete) {
      notifyOwner(
        'Ny virksomhed fuldført',
        buildCompanyCompleteEmail(company, ctx.id, ctx.email),
        { event: 'company_completed', userId: ctx.id, companyId: company.id, companyName: company.name },
        'da'
      ).catch(() => { /* fire-and-forget */ });
    }

    const companyInfo = {
      id: company.id,
      logo: company.logo,
      companyName: company.name,
      address: company.address,
      phone: company.phone,
      email: company.email,
      cvrNumber: company.cvrNumber,
      invoicePrefix: company.invoicePrefix,
      bankName: company.bankName,
      bankAccount: company.bankAccount,
      bankRegistration: company.bankRegistration,
      bankIban: company.bankIban,
      bankStreet: company.bankStreet,
      bankCity: company.bankCity,
      bankCountry: company.bankCountry,
      companyType: company.companyType,
      invoiceTerms: company.invoiceTerms,
      invoiceNotesTemplate: company.invoiceNotesTemplate,
      nextInvoiceSequence: company.nextInvoiceSequence,
      currentYear: company.currentYear,
      isDemo: company.isDemo,
      updatedAt: company.updatedAt,
    };

    notifyDataChange({ scope: 'company-settings', companyId: ctx.activeCompanyId!, action: 'update' }).catch(() => {});

    return NextResponse.json({ companyInfo });
  } catch (error) {
    logger.error('Failed to update company:', error);
    return NextResponse.json({ error: 'Failed to update company' }, { status: 500 });
  }
});

// PATCH /api/company - SuperDev-only toggles for per-tenant feature flags
// Currently supports: projectModeEnabled (FASE 4)
// Body: { projectModeEnabled?: boolean }
export const PATCH = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, requireSuperDev: true },
  async (request, ctx) => {
    try {
      const body = await request.json();
      const { projectModeEnabled } = body as { projectModeEnabled?: boolean };

      if (typeof projectModeEnabled !== 'boolean') {
        return NextResponse.json(
          { error: 'Invalid body. Expected { projectModeEnabled: boolean }.' },
          { status: 400 }
        );
      }

      const existing = await db.company.findUnique({
        where: { id: ctx.activeCompanyId! },
        select: { id: true, name: true, projectModeEnabled: true },
      });
      if (!existing) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 });
      }

      // Only update + audit if the value actually changes
      if (existing.projectModeEnabled !== projectModeEnabled) {
        await db.company.update({
          where: { id: ctx.activeCompanyId! },
          data: { projectModeEnabled },
          select: { id: true, projectModeEnabled: true },
        });

        await auditLog({
          action: 'UPDATE',
          entityType: 'Company',
          entityId: existing.id,
          userId: ctx.id,
          companyId: existing.id,
          changes: { projectModeEnabled: { old: existing.projectModeEnabled, new: projectModeEnabled } },
          metadata: requestMetadata(request),
        });

        logger.info(
          `[Company PATCH] SuperDev ${ctx.id} set projectModeEnabled=${projectModeEnabled} for company ${existing.id}`
        );

        notifyDataChange({ scope: 'company-settings', companyId: ctx.activeCompanyId!, action: 'update' }).catch(() => {});
      }

      return NextResponse.json({
        projectModeEnabled,
        companyId: existing.id,
      });
    } catch (error) {
      logger.error('Failed to patch company flags:', error);
      return NextResponse.json({ error: 'Failed to update company flags' }, { status: 500 });
    }
  }
);

/**
 * Build a nicely formatted HTML email body for the app owner
 * when a tenant completes their company information for the first time.
 */
function buildCompanyCompleteEmail(
  company: {
    name: string;
    email: string;
    address: string;
    phone: string;
    cvrNumber: string;
    companyType: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  userId: string,
  userEmail: string,
): string {
  const now = new Date().toLocaleString('da-DK');
  const created = new Date(company.createdAt).toLocaleString('da-DK');
  const row = (label: string, value: string) =>
    `<tr><td style="padding:8px 12px;font-weight:600;color:#374151;white-space:nowrap;vertical-align:top;border-bottom:1px solid #f3f4f6;">${label}</td><td style="padding:8px 12px;color:#6b7280;border-bottom:1px solid #f3f4f6;">${value || '<em style="color:#9ca3af;">—</em>'}</td></tr>`;

  return `
    <p style="margin:0 0 16px;font-size:14px;color:#374151;">
      En ny virksomhed har fuldført deres virksomhedsoplysninger i AlphaFlow:
    </p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:0 0 20px;">
      <tbody>
        ${row('Virksomhed', company.name)}
        ${row('CVR-nummer', company.cvrNumber)}
        ${row('Type', company.companyType || '—')}
        ${row('Adresse', company.address)}
        ${row('Telefon', company.phone)}
        ${row('E-mail', company.email)}
        ${row('Bruger', userEmail)}
      </tbody>
    </table>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
      <tbody>
        <tr>
          <td style="padding:6px 12px;font-size:12px;color:#9ca3af;">Registreret: ${created}</td>
          <td style="padding:6px 12px;font-size:12px;color:#9ca3af;text-align:right;">Fuldført: ${now}</td>
        </tr>
      </tbody>
    </table>
    <p style="margin:0;font-size:12px;color:#9ca3af;">
      Dette er en automatisk notifikation fra AlphaFlow.
    </p>
  `;
}

// DELETE /api/company - Reset all data (with audit trail)
export const DELETE = withGuard(guard.DELETE!, async (request, ctx) => {
  try {
    // Audit the data reset BEFORE it happens
    await auditLog({
      action: 'DATA_RESET',
      entityType: 'System',
      entityId: ctx.activeCompanyId!,
      userId: ctx.id,
      companyId: ctx.activeCompanyId!,
      metadata: requestMetadata(request),
    });

    const { tenantFilter } = await import('@/lib/rbac');
    const filter = tenantFilter(ctx);

    // Cancel all transactions (soft-delete)
    await db.transaction.updateMany({
      where: { ...filter, cancelled: false },
      data: { cancelled: true, cancelReason: 'SYSTEM:DATA_RESET' },
    });

    // Cancel all invoices (soft-delete)
    await db.invoice.updateMany({
      where: { ...filter, cancelled: false },
      data: { cancelled: true, cancelReason: 'SYSTEM:DATA_RESET', status: 'CANCELLED' },
    });

    return NextResponse.json({ success: true, message: 'All data cleared successfully' });
  } catch (error) {
    logger.error('Failed to clear data:', error);
    return NextResponse.json({ error: 'Failed to clear data' }, { status: 500 });
  }
});
