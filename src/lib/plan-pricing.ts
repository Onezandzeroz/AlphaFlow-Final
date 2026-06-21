/**
 * Subscription plan pricing (FASE 5)
 *
 * Single source of truth for plan prices, used by:
 *   - The subscription-plans-prompt (display)
 *   - /api/subscription/create-payment (charge the correct amount)
 *   - The Flatpay payment flow
 *
 * Prices are in DKK øre (1 DKK = 100 øre) for the FULL binding period.
 * For monthly plans, the amount is 1 month. For annual, 12 months. Etc.
 */

import { PlanTier, getBindingMonths } from '@/lib/plan-features';

export interface PlanPricing {
  /** Monthly price in DKK */
  monthlyPriceDKK: number;
  /** Total amount for the binding period in DKK øre (1 DKK = 100 øre) */
  totalAmountOre: number;
  /** Human-readable description for the Flatpay payment */
  descriptionDa: string;
  descriptionEn: string;
}

/** Monthly prices per tier (in DKK). */
const MONTHLY_PRICES: Record<PlanTier, number> = {
  [PlanTier.Free]: 0,
  [PlanTier.Monthly]: 199,
  [PlanTier.Annual]: 169,
  [PlanTier.TwoYear]: 149,
  [PlanTier.ThreeYear]: 145,
};

const DESCRIPTIONS_DA: Record<PlanTier, string> = {
  [PlanTier.Free]: 'Gratis',
  [PlanTier.Monthly]: 'AlphaFlow Månedlig — ingen binding',
  [PlanTier.Annual]: 'AlphaFlow Pro — 12 måneder',
  [PlanTier.TwoYear]: 'AlphaFlow Business — 24 måneder',
  [PlanTier.ThreeYear]: 'AlphaFlow Business Extended — 36 måneder',
};

const DESCRIPTIONS_EN: Record<PlanTier, string> = {
  [PlanTier.Free]: 'Free',
  [PlanTier.Monthly]: 'AlphaFlow Monthly — no commitment',
  [PlanTier.Annual]: 'AlphaFlow Pro — 12 months',
  [PlanTier.TwoYear]: 'AlphaFlow Business — 24 months',
  [PlanTier.ThreeYear]: 'AlphaFlow Business Extended — 36 months',
};

/** Get the pricing for a plan tier. */
export function getPlanPricing(tier: PlanTier): PlanPricing {
  const monthlyPriceDKK = MONTHLY_PRICES[tier] ?? 0;
  const bindingMonths = getBindingMonths(tier);
  // Monthly plan: charge 1 month. Binding plans: charge the full period.
  const monthsToCharge = bindingMonths > 0 ? bindingMonths : 1;
  const totalAmountOre = monthlyPriceDKK * monthsToCharge * 100;

  return {
    monthlyPriceDKK,
    totalAmountOre,
    descriptionDa: DESCRIPTIONS_DA[tier] ?? `AlphaFlow ${tier}`,
    descriptionEn: DESCRIPTIONS_EN[tier] ?? `AlphaFlow ${tier}`,
  };
}
