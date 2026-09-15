import { NextResponse } from 'next/server';
import { sproomClient } from '@/lib/sproom-client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

/**
 * POST /api/sproom/register-nemhandel
 *
 * Registers the tenant's Sproom child company in the NemHandel network
 * (OIOUBL 2.1 profiles) and PERSISTS the result on
 * Company.sproomNemHandelRegistered = true.
 *
 * This is the standalone NemHandel network registration for an EXISTING
 * child company. The create-child-company route already attempts this
 * registration, but it is non-fatal there — if it failed (network glitch,
 * Sproom not yet ready, etc.), this route lets the user retry it without
 * recreating the child company.
 *
 * Preconditions:
 *   - A Sproom child company must already exist (Company.sproomChildCompanyId)
 *   - Company.cvrNumber must be set
 *   - Sproom must be configured (SPROOM_API_TOKEN in .env)
 *
 * Idempotent: if sproomNemHandelRegistered is already true, returns
 * success without re-calling the Sproom API.
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
      // ── 1. Fetch + validate company ──────────────────────────────
      const company = await db.company.findUnique({
        where: { id: ctx.activeCompanyId! },
        select: {
          id: true,
          cvrNumber: true,
          sproomChildCompanyId: true,
          sproomNemHandelRegistered: true,
        },
      });

      if (!company) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 });
      }

      if (!company.sproomChildCompanyId) {
        return NextResponse.json(
          {
            error: 'Ingen Sproom child company fundet. Opret en child company først.',
            code: 'NO_CHILD_COMPANY',
          },
          { status: 400 }
        );
      }

      if (!company.cvrNumber) {
        return NextResponse.json(
          {
            error: 'CVR-nummer mangler. Sæt og verificér dit CVR først.',
            code: 'NO_CVR',
          },
          { status: 400 }
        );
      }

      if (!sproomClient.isConfigured) {
        return NextResponse.json(
          {
            error: 'Sproom er ikke konfigureret på platformen. Sæt SPROOM_API_TOKEN i .env.',
            code: 'PLATFORM_NOT_CONFIGURED',
          },
          { status: 503 }
        );
      }

      // ── 2. Idempotency: already registered? ───────────────────────
      if (company.sproomNemHandelRegistered) {
        logger.info('[SPROOM_NEMHANDEL] Already registered — skipping', {
          companyId: ctx.activeCompanyId,
          childCompanyId: company.sproomChildCompanyId,
        });
        return NextResponse.json({ success: true, registered: true, already: true });
      }

      // ── 3. Register child company endpoint in NemHandel network ──
      logger.info('[SPROOM_NEMHANDEL] Registering in NemHandel', {
        companyId: ctx.activeCompanyId,
        childCompanyId: company.sproomChildCompanyId,
        cvr: company.cvrNumber,
      });

      const nemhandelResult = await sproomClient.registerNemHandel(
        { schemeId: 'DK:CVR', value: company.cvrNumber },
        ['Nes5Customer'], // Standard invoice + credit note profile
        { childCompanyId: company.sproomChildCompanyId } // impersonate the child company
      );

      // ── 4. Persist NHR flag in DB ────────────────────────────────
      await db.company.update({
        where: { id: ctx.activeCompanyId! },
        data: {
          sproomNemHandelRegistered: true,
          sproomLastTestedAt: new Date(),
        },
      });

      logger.info('[SPROOM_NEMHANDEL] Registered in NemHandel', {
        companyId: ctx.activeCompanyId,
        childCompanyId: company.sproomChildCompanyId,
        networkId: nemhandelResult.networkId,
      });

      // ── 5. Audit trail ───────────────────────────────────────────
      await auditCreate(
        ctx.id,
        'Company',
        ctx.activeCompanyId!,
        {
          action: 'sproom_nemhandel_registered',
          childCompanyId: company.sproomChildCompanyId,
          cvr: company.cvrNumber,
        },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      return NextResponse.json({ success: true, registered: true });
    } catch (error) {
      logger.error('[SPROOM_NEMHANDEL] Registration failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to register in NemHandel';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
);
