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
 * SPROOM-OMKOSTNINGER (platformsejer: AlphaAi Consult ApS):
 *   Platformens Sproom-abonnement koster 399 kr./md. og INKLUDERER 500
 *   transaktioner (afsendelse/modtagelse) samlet på tværs af ALLE tenants.
 *   Forbrug derover koster 0,8 kr. pr. transaktion. Konstanterne
 *   (SPROOM_PLATFORM_COST) dokumenterer dette og bruges af oversight-ruten
 *   (/api/oversight/usage-addons) til at vise platformens samlede forbrug
 *   mod de 500 inkluderede + estimeret merforbrug.
 *   Sproom-AFSENDELSER (send-einvoice/retry-ruterne) kræver en betalende
 *   plan (Feature.AutoEinvoice — Månedlig og opefter); Gratis har manuel
 *   OIOUBL-eksport, og MODTAGELSE er tilgængelig for alle planer.
 *   Tilkøbte e-faktura-transaktioner sælges til 1,0 kr. pr. transaktion
 *   (EINVOICE_ADDON_PRICE_DKK) — Sprooms merpris er 0,8 kr., så hver
 *   tilkøbt transaktion dækker omkostningen med 0,2 kr. i margin.
 *
 * TILKØB (add-ons):
 *   - Company.addonHermesQuota / Company.addonEinvoiceQuota lægges oveni
 *     planens grundkvote. Aktiveres af App Owner via oversight-ruten efter
 *     kundehenvendelse — derfor er tilkøb nemt og hurtigt (minutter).
 *     Indtil selvbetjenings-flow (Flatpay) er bygget, faktureres tilkøb
 *     uden for appen efter aftale.
 *   - E-faktura: FASTE pakker à 200/500/1.000/2.000 transaktioner til 1,0
 *     kr. pr. transaktion (EINVOICE_ADDON_PACKAGES +
 *     EINVOICE_ADDON_PRICE_DKK). En aktiveret pakke udvider den månedlige
 *     kvote med pakkens størrelse, indtil App Owner fjerner den igen.
 *   - Hermes: pakkestørrelser til reference (HERMES_ADDON_PACKAGES) —
 *     pris aftales individuelt uden for appen.
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

/**
 * Platformens SPROOM-abonnement (AlphaAi Consult ApS, platformsejer).
 *
 * Abonnementet er ÉT samlet op til hele platformen (alle tenants):
 *   - Fast månedligt abonnement: 399 kr.
 *   - Inkluderet forbrug: 500 transaktioner/md. (afsendelse + modtagelse
 *     på tværs af alle tenants)
 *   - Merforbrug: 0,8 kr. pr. transaktion ud over de 500
 *
 * Bruges af /api/oversight/usage-addons (GET) til at vise platformens
 * samlede Sproom-forbrug denne kalendermåned + estimeret merforbrugspris,
 * så App Owner kan følge omkostningseksponeringen løbende.
 */
export const SPROOM_PLATFORM_COST = {
  /** Fast abonnementspris pr. måned (kr.). */
  monthlyFeeDkk: 399,
  /** Inkluderede transaktioner pr. kalendermåned (samlet, alle tenants). */
  includedTransactions: 500,
  /** Pris pr. transaktion UD OVER de inkluderede (kr.). */
  overageDkkPerTransaction: 0.8,
} as const;

/** Hermes AI-beskeder pr. måned pr. plan (0 = ingen adgang). */
export const HERMES_MONTHLY_QUOTA: Record<PlanTier, number> = {
  [PlanTier.Free]: 0,
  [PlanTier.Monthly]: 0,
  [PlanTier.Annual]: 200,
  [PlanTier.TwoYear]: 500,
  [PlanTier.ThreeYear]: 1000,
};

/**
 * E-fakturaer/kreditnotaer (send + modtaget) pr. kalendermåned pr. plan.
 *
 * Fordelingen afspejler platformens Sproom-abonnement: de 500 INKLUDEREDE
 * transaktioner (SPROOM_PLATFORM_COST.includedTransactions) dækker planerne
 * med god margin — én kunde pr. plan ved fuldt forbrug bruger 340 af de 500
 * inkluderede (10+30+50+100+150 = 340), hvilket efterlader 160 transaktioner
 * til ekstra kunder, FØR merforbrug hos Sproom (0,8 kr./transaktion) slår
 * ind. App Owner følger omkostningseksponeringen løbende i oversight-ruten
 * (/api/oversight/usage-addons → platformSproom), og overskridelser hos den
 * enkelte kunde dækkes af tilkøbspakker (1,0 kr./transaktion vs. Sprooms
 * 0,8 kr.). Summen (340) holdes bevidst under includedTransactions (500).
 *
 * Gratis (10) dækker MODTAGELSE + manuel XML-upload — afsendelse via Sproom
 * kræver en betalende plan (Feature.AutoEinvoice, se plan-features.ts).
 */
export const EINVOICE_MONTHLY_QUOTA: Record<PlanTier, number> = {
  [PlanTier.Free]: 10,       // ┐
  [PlanTier.Monthly]: 30,    // │ Tilsammen 340 — bevidst under de 500
  [PlanTier.Annual]: 50,     // │ inkluderede Sproom-transaktioner
  [PlanTier.TwoYear]: 100,   // │ pr. måned (160 til ekstra kunder) —
  [PlanTier.ThreeYear]: 150, // ┘ se SPROOM_PLATFORM_COST ovenfor
};

// ─── Tilkøbspakker (add-on packages) ────────────────────────────────
//
// E-faktura: faste pakkestørrelser (antal ekstra transaktioner) til FAST
// pris pr. transaktion: 1,0 kr. (Sprooms merpris er 0,8 kr. — hver tilkøbt
// transaktion dækker omkostningen med 0,2 kr. i margin). Pakkepriser:
//   200 stk → 200 kr. · 500 stk → 500 kr. · 1.000 stk → 1.000 kr. ·
//   2.000 stk → 2.000 kr.
// Oversight-ruten (/api/oversight/usage-addons) foreslår samme pakker, og
// prissidens tilkøbs-banner viser dem (spejl i marketing-data.ts).
//
// Hermes: pakkestørrelser til reference — pris aftales uden for appen.

/** Pris pr. tilkøbt e-faktura-transaktion (kr.) — AlphaFlows salgspris. */
export const EINVOICE_ADDON_PRICE_DKK = 1.0;

export const EINVOICE_ADDON_PACKAGES: readonly number[] = [200, 500, 1000, 2000];
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
