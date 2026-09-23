/**
 * Plan-baserede månedlige forbrugskvoter (usage quotas).
 *
 * Kilde til sandhed for:
 *   - Prissidens sammenligningstabel (docs i marketing-data.ts trækker tallene herfra)
 *   - Kvote-tjek i POST /api/invoices/[id]/send-einvoice (afsendelser blokeres)
 *   - Kvote-tjek i POST /api/invoices/receive (manuel upload blokeres)
 *   - Oversight-aktivering af tilkøb (/api/oversight/usage-addons)
 *
 * MODEL:
 *   - Hermes AI: månedlig beskedkvote pr. plan (rullende 30-dage vindue
 *     håndhæves af mini-services/hermes-agent/rate-limiter.ts, som spejler
 *     HERMES_MONTHLY_QUOTA). Tilgængelig fra Pro (årlig) og opefter —
 *     Gratis/Månedlig har 0 (Hermes er feature-gated til Pro+ alligevel).
 *   - E-faktura/kreditnota: SAMLET forbrug pr. kalendermåned = afsendte
 *     e-fakturaer/kreditnotaer (EInvoiceSending) + modtagne (ReceivedInvoice,
 *     både Sproom-webhook og manuel XML-upload). Automatisk Sproom-modtagelse
 *     opretter ALTID ReceivedInvoice (data går aldrig tabt) — men forbruget
 *     tæller med, så grænsen håndhæves ved afsendelse og manuel upload.
 *
 * TILKØB (add-ons):
 *   - Company.addonHermesQuota / Company.addonEinvoiceQuota lægges oveni
 *     planens grundkvote. Aktiveres af App Owner via oversight-ruten efter
 *     kundehenvendelse — derfor er tilkøb nemt og hurtigt (minutter).
 *     Indtil selvbetjenings-flow (Flatpay) er bygget, faktureres tilkøb
 *     uden for appen efter aftale.
 *
 * BEMÆRK: SuperDev kan altid sætte en manuel rate-limit-override pr. tenant
 * (HermesAgent.rateLimitCustom=true) — manuelle værdier vinder over
 * plan-kvoten.
 *
 * Tallene nedenfor er konfigurerbare produktbeslutninger — justér her og i
 * mini-services/hermes-agent/rate-limiter.ts (spejl) + marketing-data.ts
 * (tabel-tekster), hvis prissætningen ændres.
 */

import { db } from '@/lib/db';
import { PlanTier } from '@/lib/plan-features';

// ─── Kvote-tal pr. plan ─────────────────────────────────────────────

/** Hermes AI-beskeder pr. måned pr. plan (0 = ingen adgang). */
export const HERMES_MONTHLY_QUOTA: Record<PlanTier, number> = {
  [PlanTier.Free]: 0,
  [PlanTier.Monthly]: 0,
  [PlanTier.Annual]: 200,
  [PlanTier.TwoYear]: 500,
  [PlanTier.ThreeYear]: 1000,
};

/** E-fakturaer/kreditnotaer (send + modtaget) pr. kalendermåned pr. plan. */
export const EINVOICE_MONTHLY_QUOTA: Record<PlanTier, number> = {
  [PlanTier.Free]: 10,
  [PlanTier.Monthly]: 25,
  [PlanTier.Annual]: 50,
  [PlanTier.TwoYear]: 150,
  [PlanTier.ThreeYear]: 300,
};

// ─── Tilkøbspakker (størrelser til reference — priser aftales/faktureres
// uden for appen indtil selvbetjening er bygget) ──────────────────────

export const EINVOICE_ADDON_PACKAGES: readonly number[] = [25, 50, 100, 250];
export const HERMES_ADDON_PACKAGES: readonly number[] = [250, 500, 1000, 2000];

// ─── Hjælpefunktioner ────────────────────────────────────────────────

/** Start på den aktuelle kalendermåned (for e-faktura-forbrug). */
export function currentMonthStart(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

/** Planens Hermes-månedskvote + evt. tilkøb (bruges af oversight/UI). */
export function getHermesMonthlyLimit(planTier: PlanTier, addonQuota: number): number {
  return (HERMES_MONTHLY_QUOTA[planTier] ?? 0) + Math.max(0, addonQuota | 0);
}

/** Planens e-faktura-månedskvote + evt. tilkøb. */
export function getEInvoiceMonthlyLimit(planTier: PlanTier, addonQuota: number): number {
  return (EINVOICE_MONTHLY_QUOTA[planTier] ?? 0) + Math.max(0, addonQuota | 0);
}

// ─── E-faktura forbrugsopslag ────────────────────────────────────────

export interface EInvoiceUsageSnapshot {
  /** E-fakturaer/kreditnotaer afsendt denne kalendermåned. */
  sentThisMonth: number;
  /** E-fakturaer/kreditnotaer modtaget denne kalendermåned (Sproom + manuel upload). */
  receivedThisMonth: number;
  /** Samlet forbrug (send + modtaget). */
  used: number;
  /** Planens grundkvote. */
  planQuota: number;
  /** Tilkiøbt ekstra kvote. */
  addonQuota: number;
  /** Grundkvote + tilkøb. */
  totalQuota: number;
  /** Resterende forbrug i måneden (aldrig negativ). */
  remaining: number;
  /** Første dag i næste kalendermåned (hvornår kvoten fornyes). */
  resetsAt: Date;
}

/**
 * Henter den aktive virksomheds e-faktura-forbrug for den aktuelle
 * kalendermåned og den samlede kvote (plan + tilkøb).
 *
 * Tæller:
 *   - EInvoiceSending rows oprettet denne måned (afsendelser, inkl. kreditnotaer)
 *   - ReceivedInvoice rows oprettet denne måned (modtagelser, begge kilder)
 */
export async function getEInvoiceUsage(companyId: string): Promise<EInvoiceUsageSnapshot> {
  const monthStart = currentMonthStart();
  const now = new Date();
  const resetsAt = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);

  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { planTier: true, addonEinvoiceQuota: true },
  });

  const planTier: PlanTier = (company?.planTier as PlanTier | undefined) ?? PlanTier.Free;
  const addonQuota = Math.max(0, company?.addonEinvoiceQuota ?? 0);
  const planQuota = EINVOICE_MONTHLY_QUOTA[planTier] ?? 0;
  const totalQuota = planQuota + addonQuota;

  const [sentThisMonth, receivedThisMonth] = await Promise.all([
    db.eInvoiceSending.count({
      where: { companyId, createdAt: { gte: monthStart } },
    }),
    db.receivedInvoice.count({
      where: { companyId, createdAt: { gte: monthStart } },
    }),
  ]);

  const used = sentThisMonth + receivedThisMonth;

  return {
    sentThisMonth,
    receivedThisMonth,
    used,
    planQuota,
    addonQuota,
    totalQuota,
    remaining: Math.max(0, totalQuota - used),
    resetsAt,
  };
}
