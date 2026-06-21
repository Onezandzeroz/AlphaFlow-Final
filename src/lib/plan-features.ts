/**
 * Plan-tier feature gating (FASE 5)
 *
 * The subscription plan is the authoritative source for which features a
 * tenant (and its team members) can access. This module provides:
 *
 *   - PlanTier enum (mirrors the Prisma enum)
 *   - Feature enum (one value per gated feature)
 *   - getPlanFeatures(tier) — the tier → feature mapping
 *   - hasFeature(ctx, feature) — runtime check used by API routes
 *   - getSeatCap(tier) — team member limits per tier
 *   - getBindingMonths(tier) — binding period for paid plans
 *   - frontendPlanIdToTier(id) — maps frontend plan IDs to DB tiers
 *   - isHermesAvailable / isProjectsAvailable / isAutoEinvoiceAvailable
 *     — combined helpers that fold in SuperDev override flags
 *
 * IMPORTANT — .tbkey proofs grant BOTH write access AND all features:
 *   - .tbkey proofs (TokenPay) grant WRITE ACCESS (read_write vs read_only)
 *     via lib/tokenpay.ts → requireAccess.
 *   - .tbkey proofs ALSO grant FEATURE ACCESS — a proof holder gets ALL
 *     features (highest tier = Business Extended) regardless of their
 *     Company.planTier. This is checked in session.ts: if the user has an
 *     active proof (tokenpay.getUserStatus → activeProof), all features are
 *     added to ctx.availableFeatures.
 *   - planTier grants FEATURE ACCESS for tenants WITHOUT a .tbkey proof.
 *   - SuperDev always gets all features regardless of plan tier or proof.
 *
 * IMPORTANT — SuperDev overrides:
 *   Manual SuperDev toggles (Company.projectModeEnabled, HermesAgent.enabled)
 *   are preserved as OVERRIDES that win over plan tier. This keeps the App
 *   Owner's intent for beta testers / courtesy access. To remove access, the
 *   App Owner must unset the override flag — changing the plan tier alone does
 *   not revoke a manual override.
 */

import type { AuthContext } from '@/lib/rbac';

// ─── Plan Tier ───────────────────────────────────────────────────────

export enum PlanTier {
  Free = 'free',
  Monthly = 'monthly',
  Annual = 'annual',
  TwoYear = 'twoyear',
  ThreeYear = 'threeyear',
}

/** Numeric rank for tier comparisons (higher = more features). */
export const TIER_RANK: Record<PlanTier, number> = {
  [PlanTier.Free]: 0,
  [PlanTier.Monthly]: 1,
  [PlanTier.Annual]: 2,
  [PlanTier.TwoYear]: 3,
  [PlanTier.ThreeYear]: 4,
};

/** All valid plan tiers (for iteration / validation). */
export const ALL_PLAN_TIERS: PlanTier[] = [
  PlanTier.Free,
  PlanTier.Monthly,
  PlanTier.Annual,
  PlanTier.TwoYear,
  PlanTier.ThreeYear,
];

// ─── Features ────────────────────────────────────────────────────────

export enum Feature {
  /** Manual e-invoicing — XML download (OIOUBL). Available to ALL tiers. */
  ManualEinvoice = 'MANUAL_EINVOICE',
  /** Real bank integration (Nordigen etc.). Free tier gets demo bank only. */
  RealBankIntegration = 'REAL_BANK_INTEGRATION',
  /** Advanced reports: cash flow, aging, budget-vs-actual. Månedlig+. */
  AdvancedReports = 'ADVANCED_REPORTS',
  /** Full data export (CSV/PDF). Månedlig+. */
  DataExport = 'DATA_EXPORT',
  /** Hermes AI advisory. Pro+. */
  Hermes = 'HERMES',
  /** Auto e-invoice via Peppol/NemHandel (Storecove). Business+. */
  AutoEinvoice = 'AUTO_EINVOICE',
  /** Annual report iXBRL for Erhvervsstyrelsen. Business+. */
  AnnualReportIxbnl = 'ANNUAL_REPORT_IXBRL',
  /** Unlimited team seats. Lower tiers have caps (see getSeatCap). */
  UnlimitedSeats = 'UNLIMITED_SEATS',
  /** Project accounting. Business Extended only. */
  ProjectAccounting = 'PROJECT_ACCOUNTING',
}

// ─── Tier → Feature mapping ──────────────────────────────────────────

/**
 * The canonical feature matrix. Each tier inherits all features from
 * lower tiers (cumulative). Mirrors the subscription plan descriptions
 * in subscription-plans-prompt.tsx.
 */
const TIER_FEATURES: Record<PlanTier, Feature[]> = {
  [PlanTier.Free]: [
    Feature.ManualEinvoice,
  ],
  [PlanTier.Monthly]: [
    Feature.ManualEinvoice,
    Feature.RealBankIntegration,
    Feature.AdvancedReports,
    Feature.DataExport,
  ],
  [PlanTier.Annual]: [
    Feature.ManualEinvoice,
    Feature.RealBankIntegration,
    Feature.AdvancedReports,
    Feature.DataExport,
    Feature.Hermes,
  ],
  [PlanTier.TwoYear]: [
    Feature.ManualEinvoice,
    Feature.RealBankIntegration,
    Feature.AdvancedReports,
    Feature.DataExport,
    Feature.Hermes,
    Feature.AutoEinvoice,
    Feature.AnnualReportIxbnl,
    Feature.UnlimitedSeats,
  ],
  [PlanTier.ThreeYear]: [
    Feature.ManualEinvoice,
    Feature.RealBankIntegration,
    Feature.AdvancedReports,
    Feature.DataExport,
    Feature.Hermes,
    Feature.AutoEinvoice,
    Feature.AnnualReportIxbnl,
    Feature.UnlimitedSeats,
    Feature.ProjectAccounting,
  ],
};

/** Get the full feature set for a plan tier. */
export function getPlanFeatures(tier: PlanTier): Set<Feature> {
  return new Set(TIER_FEATURES[tier] ?? TIER_FEATURES[PlanTier.Free]);
}

/** Check if a tier includes a specific feature (pure function, no ctx). */
export function tierHasFeature(tier: PlanTier, feature: Feature): boolean {
  return getPlanFeatures(tier).has(feature);
}

// ─── Seat caps ───────────────────────────────────────────────────────

/**
 * Team member seat cap per tier. null = unlimited.
 * Counted as: UserCompany rows + pending Invitations for the company.
 */
export function getSeatCap(tier: PlanTier): number | null {
  switch (tier) {
    case PlanTier.Free: return 1;       // Owner only — no invites
    case PlanTier.Monthly: return 3;
    case PlanTier.Annual: return 5;
    case PlanTier.TwoYear: return null;  // unlimited
    case PlanTier.ThreeYear: return null; // unlimited
    default: return 1;
  }
}

// ─── Binding periods ─────────────────────────────────────────────────

/** Binding period in months. 0 = no binding (free + monthly). */
export function getBindingMonths(tier: PlanTier): number {
  switch (tier) {
    case PlanTier.Free: return 0;
    case PlanTier.Monthly: return 0;
    case PlanTier.Annual: return 12;
    case PlanTier.TwoYear: return 24;
    case PlanTier.ThreeYear: return 36;
    default: return 0;
  }
}

// ─── Frontend plan ID ↔ PlanTier conversion ─────────────────────────

/**
 * Map a frontend plan ID (from subscription-plans-prompt.tsx PLANS array)
 * to the database PlanTier enum value.
 *
 * Frontend IDs: 'free', 'monthly', 'annual', '2year', '3year'
 * DB values:    'free', 'monthly', 'annual', 'twoyear', 'threeyear'
 *
 * The mismatch is because Prisma enum values must start with a letter.
 */
export function frontendPlanIdToTier(id: string): PlanTier {
  switch (id) {
    case 'free': return PlanTier.Free;
    case 'monthly': return PlanTier.Monthly;
    case 'annual': return PlanTier.Annual;
    case '2year': return PlanTier.TwoYear;
    case '3year': return PlanTier.ThreeYear;
    default: return PlanTier.Free;
  }
}

/** Reverse: PlanTier → frontend plan ID. */
export function tierToFrontendPlanId(tier: PlanTier): string {
  switch (tier) {
    case PlanTier.Free: return 'free';
    case PlanTier.Monthly: return 'monthly';
    case PlanTier.Annual: return 'annual';
    case PlanTier.TwoYear: return '2year';
    case PlanTier.ThreeYear: return '3year';
    default: return 'free';
  }
}

// ─── Runtime feature check (used by API routes) ──────────────────────

/**
 * Check if the current user's active company has access to a feature.
 *
 * Resolution order:
 *   1. SuperDev always wins — App Owner can see all features in any tenant.
 *   2. Oversight mode — SuperDev overseeing a tenant gets read access to ALL
 *      features of that tenant (writes are already blocked by
 *      blockOversightMutation). Without this, oversight would crash on
 *      feature-gated read routes.
 *   3. No active company → no features (except SuperDev above).
 *   4. Check ctx.planTier against the feature matrix.
 *
 * Note: ctx.planTier + ctx.availableFeatures are loaded by session.ts
 * from the active Company row.
 */
export function hasFeature(ctx: AuthContext | null, feature: Feature): boolean {
  if (!ctx) return false;

  // 1. SuperDev always has all features
  if (ctx.isSuperDev) return true;

  // 2. Oversight mode: read access to all features of the overseen tenant
  if (ctx.isOversightMode) return true;

  // 3. No active company → no features
  if (!ctx.activeCompanyId) return false;

  // 4. Check the pre-computed availableFeatures array on the context.
  //    session.ts populates this from getPlanFeatures(planTier) + overrides.
  if (ctx.availableFeatures && ctx.availableFeatures.length > 0) {
    return ctx.availableFeatures.includes(feature);
  }

  // Fallback: check planTier directly (e.g. if availableFeatures wasn't
  // populated yet — shouldn't happen, but be defensive).
  if (ctx.planTier) {
    return tierHasFeature(ctx.planTier, feature);
  }

  return false;
}

// ─── Combined availability helpers (fold in SuperDev override flags) ─

/**
 * Hermes availability: plan tier >= Pro (annual) OR HermesAgent.enabled
 * override OR SuperDev.
 *
 * The HermesAgent.enabled flag is a manual SuperDev override that allows
 * Hermes on sub-Pro tiers (e.g. for beta testers). The owner must also
 * opt in via HermesAgent.dataAccessEnabled before Hermes reads their data.
 */
export function isHermesAvailable(ctx: AuthContext | null): boolean {
  if (!ctx) return false;
  if (ctx.isSuperDev) return true;
  if (ctx.isOversightMode) return true;
  // availableFeatures already includes the override expansion (computed
  // in session.ts). So we just check for the HERMES feature.
  return hasFeature(ctx, Feature.Hermes);
}

/**
 * Projects availability: plan tier == Business Extended (threeyear) OR
 * Company.projectModeEnabled override OR SuperDev.
 */
export function isProjectsAvailable(ctx: AuthContext | null): boolean {
  if (!ctx) return false;
  if (ctx.isSuperDev) return true;
  if (ctx.isOversightMode) return true;
  return hasFeature(ctx, Feature.ProjectAccounting);
}

/**
 * Auto e-invoice availability: plan tier >= Business (twoyear) AND
 * Storecove is connected. The storecoveConnected flag is a technical
 * config flag, not a tier gate — but auto-send requires both.
 */
export function isAutoEinvoiceAvailable(ctx: AuthContext | null): boolean {
  if (!ctx) return false;
  if (ctx.isSuperDev) return true;
  if (ctx.isOversightMode) return true;
  return hasFeature(ctx, Feature.AutoEinvoice);
}

// ─── Human-readable labels (for UI + error messages) ─────────────────

export const FEATURE_LABELS_DA: Record<Feature, string> = {
  [Feature.ManualEinvoice]: 'Manuel e-fakturering',
  [Feature.RealBankIntegration]: 'Egte bankintegration',
  [Feature.AdvancedReports]: 'Avancerede rapporter',
  [Feature.DataExport]: 'Data eksport',
  [Feature.Hermes]: 'Hermes AI-rådgivning',
  [Feature.AutoEinvoice]: 'Auto e-faktura (Peppol)',
  [Feature.AnnualReportIxbnl]: 'Årsrapport (iXBRL)',
  [Feature.UnlimitedSeats]: 'Ubegrænsede teammedlemmer',
  [Feature.ProjectAccounting]: 'Projektregnskab',
};

export const FEATURE_LABELS_EN: Record<Feature, string> = {
  [Feature.ManualEinvoice]: 'Manual e-invoicing',
  [Feature.RealBankIntegration]: 'Real bank integration',
  [Feature.AdvancedReports]: 'Advanced reports',
  [Feature.DataExport]: 'Data export',
  [Feature.Hermes]: 'Hermes AI advisory',
  [Feature.AutoEinvoice]: 'Auto e-invoice (Peppol)',
  [Feature.AnnualReportIxbnl]: 'Annual report (iXBRL)',
  [Feature.UnlimitedSeats]: 'Unlimited team members',
  [Feature.ProjectAccounting]: 'Project accounting',
};

/** Get a localized feature label. */
export function getFeatureLabel(feature: Feature, language: 'da' | 'en'): string {
  return language === 'da' ? FEATURE_LABELS_DA[feature] : FEATURE_LABELS_EN[feature];
}

/** Minimum tier required to unlock a feature (for upgrade prompts). */
export function getMinimumTierForFeature(feature: Feature): PlanTier {
  switch (feature) {
    case Feature.ManualEinvoice: return PlanTier.Free;
    case Feature.RealBankIntegration:
    case Feature.AdvancedReports:
    case Feature.DataExport:
      return PlanTier.Monthly;
    case Feature.Hermes:
      return PlanTier.Annual;
    case Feature.AutoEinvoice:
    case Feature.AnnualReportIxbnl:
    case Feature.UnlimitedSeats:
      return PlanTier.TwoYear;
    case Feature.ProjectAccounting:
      return PlanTier.ThreeYear;
    default: return PlanTier.Free;
  }
}
