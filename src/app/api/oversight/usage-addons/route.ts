import { NextRequest, NextResponse } from 'next/server';
import { withGuard } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditLog, requestMetadata } from '@/lib/audit';
import { notifyDataChange } from '@/lib/notify-data-change';
import {
  getEInvoiceUsage,
  HERMES_MONTHLY_QUOTA,
  EINVOICE_MONTHLY_QUOTA,
  EINVOICE_ADDON_PACKAGES,
  HERMES_ADDON_PACKAGES,
} from '@/lib/usage-quotas';
import { PlanTier } from '@/lib/plan-features';

/**
 * Forbrugstilkøb (usage add-ons) — SuperDev-only (App Owner oversight).
 *
 * GET  /api/oversight/usage-addons  — alle tenants: plan-kvoter, forbrug
 *                                     denne kalendermåned og aktive add-ons.
 * PUT  /api/oversight/usage-addons  — aktivér/justér et tilkøb for én tenant
 *                                     (addonHermesQuota / addonEinvoiceQuota).
 *
 * Forretningsmodel (jf. prissiden): Hermes-brug og afsendelse/modtagelse af
 * e-faktura/kreditnota er begrænset til et månedligt forbrug pr. plan.
 * Kunden kan tilkøbe ekstra forbrug, der passer virksomhedens behov —
 * tilkøb er nemt og hurtigt: kunden skriver til os (kontaktsiden), og
 * App Owner aktiverer pakken her i oversight (minutter). Indtil et selv-
 * betjenings-flow (Flatpay) er bygget, faktureres tilkøb uden for appen
 * efter aftale med kunden.
 *
 * Add-on-kvoten lægges oveni planens grundkvote og gælder løbende
 * (framework: month-quota = plan + add-on; se lib/usage-quotas.ts).
 */

const MAX_ADDON = 100_000; // sikkerheds-øvre grænse pr. add-on-felt

function clampAddon(v: unknown): number | null {
  const n = typeof v === 'number' ? Math.floor(v) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(n, MAX_ADDON);
}

// ─── GET: alle tenants med kvoter + forbrug ───────────────────────

export const GET = withGuard(routeConfig['/api/oversight/usage-addons'].GET!, async (request, ctx) => {
  try {
    const companies = await db.company.findMany({
      select: {
        id: true,
        name: true,
        planTier: true,
        addonHermesQuota: true,
        addonEinvoiceQuota: true,
        hermesAgent: { select: { enabled: true, rateLimitCustom: true, rateLimitMonth: true } },
        usageRecord: { select: { monthCount: true } },
      },
      orderBy: { name: 'asc' },
    });

    const tenants = await Promise.all(
      companies.map(async (company) => {
        const planTier = (company.planTier as PlanTier) ?? PlanTier.Free;
        const einvoice = await getEInvoiceUsage(company.id);

        return {
          companyId: company.id,
          companyName: company.name,
          planTier,
          hermes: {
            planQuota: HERMES_MONTHLY_QUOTA[planTier] ?? 0,
            addonQuota: company.addonHermesQuota,
            // Effektiv kvote: manuel rate-limit-override vinder (som i rate-limiteren)
            effectiveQuota: company.hermesAgent?.rateLimitCustom
              ? company.hermesAgent.rateLimitMonth
              : (HERMES_MONTHLY_QUOTA[planTier] ?? 0) + company.addonHermesQuota,
            manualOverride: company.hermesAgent?.rateLimitCustom ?? false,
            usedThisMonth: company.usageRecord?.monthCount ?? 0,
          },
          einvoice: {
            planQuota: einvoice.planQuota,
            addonQuota: einvoice.addonQuota,
            effectiveQuota: einvoice.totalQuota,
            sentThisMonth: einvoice.sentThisMonth,
            receivedThisMonth: einvoice.receivedThisMonth,
            usedThisMonth: einvoice.used,
            remainingThisMonth: einvoice.remaining,
            resetsAt: einvoice.resetsAt,
          },
        };
      })
    );

    return NextResponse.json({
      tenants,
      addonPackages: {
        einvoice: EINVOICE_ADDON_PACKAGES,
        hermes: HERMES_ADDON_PACKAGES,
      },
    });
  } catch (error) {
    logger.error('[USAGE-ADDONS] Failed to list tenants:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// ─── PUT: aktivér/justér tilkøb for én tenant ─────────────────────

export const PUT = withGuard(routeConfig['/api/oversight/usage-addons'].PUT!, async (request, ctx) => {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      companyId?: string;
      addonHermesQuota?: number;
      addonEinvoiceQuota?: number;
    };

    const { companyId } = body;
    if (typeof companyId !== 'string' || !companyId) {
      return NextResponse.json({ error: 'Missing companyId' }, { status: 400 });
    }

    // Mindst ét add-on-felt skal være sat i requesten
    const hermesAddon =
      body.addonHermesQuota === undefined ? undefined : clampAddon(body.addonHermesQuota);
    const einvoiceAddon =
      body.addonEinvoiceQuota === undefined ? undefined : clampAddon(body.addonEinvoiceQuota);
    if (hermesAddon === null || einvoiceAddon === null) {
      return NextResponse.json(
        { error: 'Add-on quotas must be non-negative integers' },
        { status: 400 }
      );
    }
    if (hermesAddon === undefined && einvoiceAddon === undefined) {
      return NextResponse.json(
        { error: 'Provide addonHermesQuota and/or addonEinvoiceQuota' },
        { status: 400 }
      );
    }

    const company = await db.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        planTier: true,
        addonHermesQuota: true,
        addonEinvoiceQuota: true,
      },
    });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const oldAddons = {
      hermes: company.addonHermesQuota,
      einvoice: company.addonEinvoiceQuota,
    };
    const newAddons = {
      hermes: hermesAddon ?? company.addonHermesQuota,
      einvoice: einvoiceAddon ?? company.addonEinvoiceQuota,
    };

    const updated = await db.company.update({
      where: { id: companyId },
      data: {
        ...(hermesAddon !== undefined ? { addonHermesQuota: hermesAddon } : {}),
        ...(einvoiceAddon !== undefined ? { addonEinvoiceQuota: einvoiceAddon } : {}),
      },
      select: { id: true, addonHermesQuota: true, addonEinvoiceQuota: true },
    });

    await auditLog({
      action: 'UPDATE',
      entityType: 'Company',
      entityId: companyId,
      userId: ctx.id,
      companyId,
      performedByUserId: ctx.id,
      changes: { usageAddons: { old: oldAddons, new: newAddons } },
      metadata: {
        ...requestMetadata(request),
        source: 'usage_addons',
        companyName: company.name,
      },
    });

    logger.info('[USAGE-ADDONS] Updated usage add-ons', {
      companyId,
      companyName: company.name,
      oldAddons,
      newAddons,
      performedBy: ctx.id,
    });

    // Notificér tilkoblede klienter i virksomheden om den nye kvote
    notifyDataChange({
      scope: 'usage-addons',
      companyId,
      action: 'update',
    }).catch(() => { /* non-critical */ });

    return NextResponse.json({ success: true, addons: updated });
  } catch (error) {
    logger.error('[USAGE-ADDONS] Failed to update add-ons:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
