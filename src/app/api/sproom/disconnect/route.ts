import { NextResponse } from 'next/server';
import { sproomClient } from '@/lib/sproom-client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

/**
 * POST /api/sproom/disconnect
 *
 * Deletes the tenant's Sproom child company (Sproom's
 * DELETE /api/child-companies/{id} — the ChildCompany endpoint in
 * https://staging.sproom.net/swagger) and clears the Sproom connection
 * fields on the Company record.
 *
 * This is the "Afbryd forbindelse" action exposed in the Sproom Access
 * Point card. After disconnect, the UI shows "Ikke forbundet" and the
 * user can create a fresh child company.
 *
 * Idempotent: sproomClient.deleteChildCompany treats HTTP 404 (child
 * already gone — e.g. deleted directly on the Sproom dashboard) as
 * success, so this route always clears the local DB state once the
 * Sproom side is gone. Non-404 failures (auth/network/5xx) throw and
 * do NOT clear the local state — the user can retry.
 *
 * Preconditions:
 *   - A Sproom child company must exist (Company.sproomChildCompanyId)
 *   - Sproom must be configured (SPROOM_API_TOKEN in .env)
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
        },
      });

      if (!company) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 });
      }

      if (!company.sproomChildCompanyId) {
        return NextResponse.json(
          {
            error: 'Ingen Sproom child company at afbryde.',
            code: 'NOT_CONNECTED',
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

      const childCompanyId = company.sproomChildCompanyId;

      // ── 2. Delete the child company in Sproom ─────────────────────
      // DELETE /api/child-companies/{id} (idempotent — 404 = already gone,
      // treated as success inside deleteChildCompany). Non-404 failures
      // throw and are NOT cleared locally — the user can retry.
      try {
        await sproomClient.deleteChildCompany(childCompanyId);
        logger.info('[SPROOM_DISCONNECT] Deleted child company in Sproom', {
          companyId: ctx.activeCompanyId,
          childCompanyId,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('[SPROOM_DISCONNECT] Sproom DELETE failed — NOT clearing local state', {
          companyId: ctx.activeCompanyId,
          childCompanyId,
          error: msg,
        });
        return NextResponse.json(
          {
            error: `Kunne ikke slette child company i Sproom: ${msg}`,
            code: 'SPROOM_DELETE_FAILED',
          },
          { status: 502 }
        );
      }

      // ── 3. Clear the Sproom connection fields in DB ───────────────
      await db.company.update({
        where: { id: ctx.activeCompanyId! },
        data: {
          sproomChildCompanyId: null,
          sproomConnectedAt: null,
          sproomLastTestedAt: null,
          sproomNemHandelRegistered: false,
          sproomPeppolRegistered: false,
        },
      });

      logger.info('[SPROOM_DISCONNECT] Sproom connection cleared', {
        companyId: ctx.activeCompanyId,
        childCompanyId,
      });

      // ── 4. Audit trail ────────────────────────────────────────────
      await auditCreate(
        ctx.id,
        'Company',
        ctx.activeCompanyId!,
        {
          action: 'sproom_child_company_disconnected',
          childCompanyId,
          cvr: company.cvrNumber,
        },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      return NextResponse.json({ success: true, disconnected: true });
    } catch (error) {
      logger.error('[SPROOM_DISCONNECT] Failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to disconnect Sproom';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
);
