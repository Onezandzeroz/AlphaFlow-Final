import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { storecoveClient } from '@/lib/storecove-client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

/**
 * POST /api/storecove/create-legal-entity
 *
 * Tenant-initiated creation of a Storecove legal entity.
 *
 * Architecture:
 *   - The Storecove API key is a PLATFORM-level secret stored only in .env
 *     (STORECOVE_API_KEY). Tenants never see or enter an API key.
 *   - Each tenant creates their OWN legal entity (representing their company
 *     as a Peppol sender) using the platform key.
 *   - KYC gate: only companies with a CVR-VERIFIED CVR number
 *     (company.cvrVerifiedAt != null) can create a legal entity. This
 *     satisfies Storecove's "KYC shifted to the contractor" requirement.
 *
 * The returned numeric legal_entity_id is stored on the Company row
 * (storecoveLegalEntityId) and used for all subsequent invoice submissions
 * by that tenant.
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
      const rl = rateLimit(`storecove-create-le:${clientIp}`, {
        maxRequests: 3,
        windowMs: 60 * 1000,
        message: 'Too many legal entity creation attempts. Please try again later.',
      });
      if (!rl.allowed) {
        return NextResponse.json(
          { error: 'Too many attempts. Please try again later.', retryAfter: rl.resetAt },
          { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
        );
      }

      // ── Fetch the company to validate CVR verification ──
      const company = await db.company.findUnique({
        where: { id: ctx.activeCompanyId! },
        select: {
          id: true,
          name: true,
          cvrNumber: true,
          cvrVerifiedAt: true,
          address: true,
          email: true,
          companyType: true,
          storecoveConnected: true,
          storecoveLegalEntityId: true,
        },
      });

      if (!company) {
        return NextResponse.json(
          { error: 'Company not found' },
          { status: 404 }
        );
      }

      // ── KYC gate: CVR must be verified ──
      if (!company.cvrVerifiedAt) {
        return NextResponse.json(
          {
            error:
              'Dit CVR-nummer er ikke blevet verificeret. Bekræft dit CVR-nummer i Virksomhedsindstillinger før du opretter en juridisk enhed i Storecove.',
            code: 'CVR_NOT_VERIFIED',
          },
          { status: 403 }
        );
      }

      // ── Validate CVR format (8 digits, Danish) ──
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

      // ── Idempotency: refuse if already connected with a legal entity ──
      if (company.storecoveConnected && company.storecoveLegalEntityId) {
        return NextResponse.json(
          {
            error: 'Denne virksomhed har allerede en juridisk enhed i Storecove.',
            code: 'ALREADY_CONNECTED',
            legalEntityId: company.storecoveLegalEntityId,
          },
          { status: 409 }
        );
      }

      // ── Check the platform Storecove key is configured ──
      if (!storecoveClient.isConfigured) {
        return NextResponse.json(
          {
            error:
              'Storecove er ikke konfigureret på platformen. API-nøglen mangler i .env (STORECOVE_API_KEY). Kontakt platform-administratoren.',
            code: 'PLATFORM_NOT_CONFIGURED',
          },
          { status: 503 }
        );
      }

      // ── Create the legal entity in Storecove ──
      // Peppol identifier scheme 0184 = Danish CVR register.
      // Storecove requires: party_name, line1, city, zip, country (all required).
      // The Company model stores address as a single string — we use it as line1
      // and try to extract a Danish postal code (4 digits) + city from it.
      const addressStr = company.address || company.name;
      // Danish postal codes are exactly 4 digits, often followed by the city name
      const postalMatch = addressStr.match(/(\d{4})\s+([A-Za-zÆØÅæøå\s]+)/);
      const line1 = addressStr.split(',').map(s => s.trim())[0] || company.name;
      const city = postalMatch ? postalMatch[2].trim() : (addressStr.split(',').map(s => s.trim())[1] || 'Danmark');
      const zip = postalMatch ? postalMatch[1] : '0000';

      const legalEntity = await storecoveClient.createLegalEntity({
        name: company.name,
        peppolIdentifiers: [{ scheme: '0184', identifier: cvr }],
        address: {
          country: 'DK',
          street: line1,
          city,
          zip,
        },
        tenantId: company.id, // multi-tenant isolation in Storecove
      });

      logger.info('[STORECOVE_CREATE_LE] Legal entity created', {
        companyId: ctx.activeCompanyId,
        userId: ctx.id,
        legalEntityId: legalEntity.id,
        legalEntityName: legalEntity.name,
      });

      // ── Store the legal entity ID + auto-configure e-invoicing ──
      // Identifiers are now MANAGED by the Storecove legal entity — tenants
      // never need to manually set EndpointID or Peppol AS4 ID. We auto-set
      // them here so the settings page can display them as read-only.
      // Delivery mode is also set to 'automatic' so the tenant immediately
      // sees the full sending options (channel, GLN, auto-send) instead of
      // having to manually pick "manual vs automatic" first.
      await db.company.update({
        where: { id: ctx.activeCompanyId! },
        data: {
          storecoveConnected: true,
          storecoveLegalEntityId: legalEntity.id,
          storecoveConnectedAt: new Date(),
          storecoveLastTestedAt: new Date(),
          // Auto-enable e-invoicing now that the company can send
          einvoiceEnabled: true,
          // Identifiers — auto-managed from the legal entity (read-only in UI)
          einvoiceEndpointId: `0184:${cvr}`,
          einvoicePeppolAs4Id: `0188:CVR${cvr}`,
          // Delivery mode — default to 'automatic' so the tenant sees the
          // full settings section immediately (channel, GLN, auto-send).
          // They can switch to 'manual' if they prefer manual XML upload.
          einvoiceDeliveryMode: 'automatic',
        },
      });

      // ── Audit trail ──
      await auditCreate(
        ctx.id,
        'Company',
        ctx.activeCompanyId!,
        {
          action: 'storecove_legal_entity_created',
          legalEntityId: legalEntity.id,
          legalEntityName: legalEntity.name,
          peppolIdentifier: `0184:${cvr}`,
          cvrVerifiedAt: company.cvrVerifiedAt,
        },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      return NextResponse.json({
        connected: true,
        legalEntityId: legalEntity.id,
        legalEntityName: legalEntity.name,
        peppolIdentifier: `0184:${cvr}`,
      });
    } catch (error) {
      logger.error('[STORECOVE_CREATE_LE] Failed to create legal entity:', error);
      const message = error instanceof Error ? error.message : 'Failed to create legal entity';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
);
