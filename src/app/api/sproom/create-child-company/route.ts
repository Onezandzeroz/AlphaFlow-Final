import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { sproomClient } from '@/lib/sproom-client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

/**
 * POST /api/sproom/create-child-company
 *
 * Creates a Sproom "child company" for the active tenant. This is Sproom's
 * equivalent of Storecove's "legal entity" — the tenant's identity in the
 * Sproom platform that can send and receive e-invoices.
 *
 * After creating the child company, this route also:
 *   1. Registers the child in the NemHandel network (OIOUBL profiles)
 *   2. Registers the child in the Peppol network (BIS Billing 3.0 profile)
 *
 * The child company ID is stored on Company.sproomChildCompanyId.
 *
 * Preconditions:
 *   - Company.cvrNumber must be set and verified (CVR gate)
 *   - Sproom must be configured (SPROOM_USERNAME + SPROOM_PASSWORD in .env)
 *   - EINVOICE_ACCESS_POINT=sproom in .env
 */
export const POST = withGuard(
  {
    auth: true,
    requireCompany: true,
    blockOversight: true,
    blockDemo: true,
    requireTokenPay: true,
    permissions: [Permission.DATA_EDIT],
  },
  async (request, ctx) => {
    try {
      // Rate limit: 3 attempts per minute per IP
      const clientIp = getClientIp(request);
      const rl = rateLimit(`sproom-create-child:${clientIp}`, {
        maxRequests: 3,
        windowMs: 60 * 1000,
        message: 'Too many child company creation attempts. Please try again later.',
      });
      if (!rl.allowed) {
        return NextResponse.json(
          { error: 'Too many attempts. Please try again later.', retryAfter: rl.resetAt },
          { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
        );
      }

      // ── 1. Fetch + validate company ──────────────────────────────
      const company = await db.company.findUnique({
        where: { id: ctx.activeCompanyId! },
        select: {
          id: true,
          name: true,
          cvrNumber: true,
          cvrVerifiedAt: true,
          address: true,
          email: true,
          phone: true,
          sproomChildCompanyId: true,
        },
      });

      if (!company) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 });
      }

      // CVR gate
      if (!company.cvrVerifiedAt) {
        return NextResponse.json(
          {
            error: 'Dit CVR-nummer er ikke blevet verificeret. Bekræft dit CVR-nummer i Virksomhedsindstillinger før du opretter en child company i Sproom.',
            code: 'CVR_NOT_VERIFIED',
          },
          { status: 403 }
        );
      }

      const cvr = company.cvrNumber.trim();
      if (!/^\d{8}$/.test(cvr)) {
        return NextResponse.json(
          {
            error: `Ugyldigt CVR-nummer: "${cvr}". Et dansk CVR-nummer skal være præcis 8 cifre.`,
            code: 'INVALID_CVR',
          },
          { status: 400 }
        );
      }

      // Idempotency: refuse if already connected
      if (company.sproomChildCompanyId) {
        return NextResponse.json(
          {
            error: 'Denne virksomhed har allerede en Sproom child company.',
            code: 'ALREADY_CONNECTED',
            childCompanyId: company.sproomChildCompanyId,
          },
          { status: 409 }
        );
      }

      // Check Sproom is configured
      if (!sproomClient.isConfigured) {
        return NextResponse.json(
          {
            error: 'Sproom er ikke konfigureret på platformen. Sæt SPROOM_USERNAME og SPROOM_PASSWORD i .env.',
            code: 'PLATFORM_NOT_CONFIGURED',
          },
          { status: 503 }
        );
      }

      // ── 2. Create child company in Sproom ────────────────────────
      logger.info('[SPROOM_CREATE_CHILD] Creating child company', {
        companyId: ctx.activeCompanyId,
        companyName: company.name,
        cvr,
      });

      const childCompany = await sproomClient.createChildCompany({
        name: company.name,
        cvr,
        schemeId: 'DK:CVR',
      });

      if (!childCompany?.id) {
        return NextResponse.json(
          { error: 'Sproom returned no child company ID' },
          { status: 500 }
        );
      }

      logger.info('[SPROOM_CREATE_CHILD] Child company created', {
        companyId: ctx.activeCompanyId,
        childCompanyId: childCompany.id,
      });

      // ── 3. Register in NemHandel network ─────────────────────────
      let nemhandelRegistered = false;
      try {
        await sproomClient.registerNemHandel(
          { schemeId: 'DK:CVR', value: cvr },
          ['Nes5Customer'] // Standard invoice + credit note profile
        );
        nemhandelRegistered = true;
        logger.info('[SPROOM_CREATE_CHILD] Registered in NemHandel', { childCompanyId: childCompany.id });
      } catch (err) {
        logger.warn('[SPROOM_CREATE_CHILD] NemHandel registration failed (non-fatal)', {
          childCompanyId: childCompany.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // ── 4. Register in Peppol network ────────────────────────────
      let peppolRegistered = false;
      try {
        await sproomClient.registerPeppol(
          { schemeId: 'DK:CVR', value: cvr },
          ['PeppolBis3Billing'] // Peppol BIS Billing 3.0
        );
        peppolRegistered = true;
        logger.info('[SPROOM_CREATE_CHILD] Registered in Peppol', { childCompanyId: childCompany.id });
      } catch (err) {
        logger.warn('[SPROOM_CREATE_CHILD] Peppol registration failed (non-fatal)', {
          childCompanyId: childCompany.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // ── 5. Store child company ID + auto-configure e-invoicing ──
      await db.company.update({
        where: { id: ctx.activeCompanyId! },
        data: {
          sproomChildCompanyId: childCompany.id,
          sproomConnectedAt: new Date(),
          sproomLastTestedAt: new Date(),
          sproomNemHandelRegistered: nemhandelRegistered,
          sproomPeppolRegistered: peppolRegistered,
          // Auto-enable e-invoicing
          einvoiceEnabled: true,
          einvoiceEndpointId: `0184:${cvr}`,
          einvoicePeppolAs4Id: `0188:CVR${cvr}`,
          einvoiceDeliveryMode: 'automatic',
        },
      });

      // ── 6. Audit trail ───────────────────────────────────────────
      await auditCreate(
        ctx.id,
        'Company',
        ctx.activeCompanyId!,
        {
          action: 'sproom_child_company_created',
          childCompanyId: childCompany.id,
          nemhandelRegistered,
          peppolRegistered,
          cvr,
        },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      logger.info('[SPROOM_CREATE_CHILD] Complete', {
        companyId: ctx.activeCompanyId,
        childCompanyId: childCompany.id,
        nemhandelRegistered,
        peppolRegistered,
      });

      return NextResponse.json({
        connected: true,
        childCompanyId: childCompany.id,
        nemhandelRegistered,
        peppolRegistered,
        endpointId: `0184:${cvr}`,
      });
    } catch (error) {
      logger.error('[SPROOM_CREATE_CHILD] Failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to create child company';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
);
