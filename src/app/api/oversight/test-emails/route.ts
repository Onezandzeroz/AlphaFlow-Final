/**
 * POST /api/oversight/test-emails
 *
 * SuperDev-only endpoint that sends a test batch of system emails
 * to a specified address. Used for KYB documentation and QA.
 *
 * Body:
 *   { to: string, emails: string[], language?: 'da'|'en', planId?: string }
 *
 *   planId is one of: 'monthly', 'annual', '2year', '3year'
 *   (defaults to '3year' if omitted)
 *
 *   emails is an array of email type keys, e.g.:
 *     ["welcome", "receipt", "pre-renewal", "pre-billing",
 *      "cancelled", "payment-failed", "terms-change"]
 */

import { NextResponse } from 'next/server';
import { withGuard } from '@/lib/route-guard';
import { logger } from '@/lib/logger';
import {
  sendSubscriptionWelcomeEmail,
  sendPaymentReceiptEmail,
  sendPreRenewalReminderEmail,
  sendPreBillingReminderEmail,
  sendSubscriptionCancelledEmail,
  sendPaymentFailedEmail,
  sendTermsChangeEmail,
} from '@/lib/email-service';
import { generateSequentialInvoiceNumber } from '@/lib/invoice-number';
import { frontendPlanIdToTier, getBindingMonths, PlanTier } from '@/lib/plan-features';
import { getPlanPricing } from '@/lib/plan-pricing';

const APP_URL = process.env.APP_URL || 'https://alphaflow.dk';

// ── Plan name mapping ────────────────────────────────────────────

const PLAN_NAMES: Record<string, string> = {
  free: 'AlphaFlow Gratis',
  monthly: 'AlphaFlow Månedlig',
  annual: 'AlphaFlow Pro',
  '2year': 'AlphaFlow Business',
  '3year': 'AlphaFlow Business Extended',
};

const VALID_PLAN_IDS = ['monthly', 'annual', '2year', '3year'];

// ── Helper: resolve plan context ────────────────────────────────

interface PlanContext {
  planName: string;
  tier: PlanTier;
  monthlyPriceDKK: number;
  bindingMonths: number;
  amountExclVatDKK: number;  // total for the period (excl. VAT)
  vatDKK: number;
  totalDKK: number;           // total for the period (incl. VAT)
}

function resolvePlan(planId: string): PlanContext {
  const tier = frontendPlanIdToTier(planId);
  const pricing = getPlanPricing(tier);
  const bindingMonths = getBindingMonths(tier);
  const monthsToCharge = bindingMonths > 0 ? bindingMonths : 1;

  return {
    planName: PLAN_NAMES[planId] || 'AlphaFlow',
    tier,
    monthlyPriceDKK: pricing.monthlyPriceDKK,
    bindingMonths: monthsToCharge,
    amountExclVatDKK: pricing.totalAmountOre / 100,
    vatDKK: pricing.vatAmountOre / 100,
    totalDKK: pricing.totalAmountInclVatOre / 100,
  };
}

// ── Date helpers ────────────────────────────────────────────────

const NOW = new Date();
const inDays = (n: number) => new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + n);
const inMonths = (m: number) => {
  const d = new Date(NOW);
  d.setMonth(d.getMonth() + m);
  return d;
};

// ── Mock data factories (plan-aware) ────────────────────────────

async function sendWelcome(to: string, lang: 'da' | 'en', plan: PlanContext) {
  const bindingMonths = plan.bindingMonths;
  return sendSubscriptionWelcomeEmail(to, {
    planName: plan.planName,
    monthlyPriceDKK: plan.monthlyPriceDKK,
    bindingMonths,
    startDate: NOW.toISOString(),
    expiryDate: bindingMonths > 0 ? inMonths(bindingMonths).toISOString() : null,
    termsVersion: '2026-05-v1',
    appUrl: APP_URL,
  }, lang);
}

async function sendReceipt(to: string, lang: 'da' | 'en', plan: PlanContext) {
  let invoiceNumber: string | undefined;
  try { invoiceNumber = await generateSequentialInvoiceNumber(); } catch { /* fallback below */ }
  const bindingMonths = plan.bindingMonths;
  const periodEnd = bindingMonths > 0 ? inMonths(bindingMonths) : inMonths(1);
  const period = `${NOW.toLocaleDateString('da-DK')} – ${periodEnd.toLocaleDateString('da-DK')}`;

  return sendPaymentReceiptEmail(to, {
    planName: plan.planName,
    amountDKK: plan.amountExclVatDKK,
    vatDKK: plan.vatDKK,
    totalDKK: plan.totalDKK,
    monthlyPriceDKK: plan.monthlyPriceDKK,
    bindingMonths: bindingMonths > 1 ? bindingMonths : undefined,
    paymentDate: NOW.toISOString(),
    paymentId: 'test_payment_' + Date.now(),
    invoiceNumber,
    cardLast4: '4242',
    period,
    isRenewal: false,
    customerCompanyName: 'Test Virksomhed ApS',
    customerEmail: to,
    customerCvr: '12345678',
    customerAddress: 'Testvej 1, 8000 Aarhus C',
  }, lang);
}

async function sendPreRenewal(to: string, lang: 'da' | 'en', days: number, plan: PlanContext) {
  return sendPreRenewalReminderEmail(to, {
    planName: plan.planName,
    renewalDate: inDays(days).toISOString(),
    amountDKK: plan.totalDKK,  // template shows "incl. 25% moms"
    daysUntilRenewal: days,
    isAutoRenew: true,
    appUrl: APP_URL,
  }, lang);
}

async function sendPreBilling(to: string, lang: 'da' | 'en', days: number, plan: PlanContext) {
  return sendPreBillingReminderEmail(to, {
    planName: plan.planName,
    renewalDate: inDays(days).toISOString(),
    amountDKK: plan.totalDKK,  // template shows "incl. 25% moms"
    daysUntilRenewal: days,
    isAutoRenew: true,
    appUrl: APP_URL,
  }, lang);
}

async function sendCancelled(to: string, lang: 'da' | 'en', plan: PlanContext) {
  const bindingMonths = plan.bindingMonths;
  return sendSubscriptionCancelledEmail(to, {
    planName: plan.planName,
    cancelledDate: NOW.toISOString(),
    accessUntilDate: bindingMonths > 0 ? inMonths(bindingMonths).toISOString() : inMonths(1).toISOString(),
    reason: 'user_request',
    appUrl: APP_URL,
  }, lang);
}

async function sendFailed(to: string, lang: 'da' | 'en', plan: PlanContext) {
  return sendPaymentFailedEmail(to, {
    planName: plan.planName,
    amountDKK: plan.totalDKK,  // template shows "incl. 25% moms" — this is the full period charge
    attemptDate: NOW.toISOString(),
    retryDate: inDays(3).toISOString(),
    appUrl: APP_URL,
  }, lang);
}

async function sendTermsChange(to: string, lang: 'da' | 'en') {
  return sendTermsChangeEmail(to, {
    oldVersion: '2025-07-v1',
    newVersion: '2026-05-v1',
    effectiveDate: '2026-05-01',
    summaryHtml: lang === 'da'
      ? '<ul><li>Opdateret prisstruktur for Business-planer</li><li>Nye betalingsbetingelser for årlig fornyelse</li><li>Udvidet dataretention-politik</li></ul>'
      : '<ul><li>Updated pricing structure for Business plans</li><li>New payment terms for annual renewal</li><li>Extended data retention policy</li></ul>',
    termsUrl: `${APP_URL}/legal/terms`,
  }, lang);
}

// ── Map of email type keys to send functions ─────────────────────

type EmailType = 'welcome' | 'receipt' | 'pre-renewal' | 'pre-billing' | 'cancelled' | 'payment-failed' | 'terms-change';

const VALID_EMAILS: EmailType[] = [
  'welcome', 'receipt', 'pre-renewal', 'pre-billing',
  'cancelled', 'payment-failed', 'terms-change',
];

async function sendTestEmail(
  type: EmailType,
  to: string,
  lang: 'da' | 'en',
  plan: PlanContext,
): Promise<{ type: string; success: boolean; logId: string; error?: string }> {
  try {
    let result: { success: boolean; logId: string };
    switch (type) {
      case 'welcome':        result = await sendWelcome(to, lang, plan); break;
      case 'receipt':        result = await sendReceipt(to, lang, plan); break;
      case 'pre-renewal':    result = await sendPreRenewal(to, lang, 14, plan); break;
      case 'pre-billing':    result = await sendPreBilling(to, lang, 7, plan); break;
      case 'cancelled':      result = await sendCancelled(to, lang, plan); break;
      case 'payment-failed': result = await sendFailed(to, lang, plan); break;
      case 'terms-change':   result = await sendTermsChange(to, lang); break;
    }
    return { type, success: result.success, logId: result.logId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[TEST-EMAILS] Failed to send ${type}:`, err);
    return { type, success: false, logId: '', error: msg };
  }
}

// ── Route handler ─────────────────────────────────────────────────

export const POST = withGuard(
  { auth: true, requireSuperDev: true },
  async (request) => {
    try {
      const body = await request.json();
      const { to, emails, language, planId } = body as {
        to: string;
        emails: string[];
        language?: 'da' | 'en';
        planId?: string;
      };

      // Validate recipient
      if (!to || typeof to !== 'string' || !to.includes('@')) {
        return NextResponse.json(
          { error: 'Gyldig e-mailadresse kræves' },
          { status: 400 },
        );
      }

      // Validate email types
      if (!Array.isArray(emails) || emails.length === 0) {
        return NextResponse.json(
          { error: 'Vælg mindst én e-mailtype' },
          { status: 400 },
        );
      }

      const invalid = emails.filter((e) => !VALID_EMAILS.includes(e as EmailType));
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: `Ugyldige e-mailtyper: ${invalid.join(', ')}` },
          { status: 400 },
        );
      }

      // Validate & resolve plan
      const resolvedPlanId = (planId && VALID_PLAN_IDS.includes(planId)) ? planId : '3year';
      const plan = resolvePlan(resolvedPlanId);

      const lang = (language === 'en' ? 'en' : 'da') as 'da' | 'en';

      logger.warn(`[TEST-EMAILS] Sending batch to ${to}: plan=${resolvedPlanId} (${plan.planName}), emails=${emails.join(',')}, lang=${lang}`);

      // Send all selected emails sequentially
      const results: Array<{ type: string; success: boolean; logId: string; error?: string }> = [];
      for (const type of emails as EmailType[]) {
        const r = await sendTestEmail(type, to, lang, plan);
        results.push(r);
      }

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      logger.warn(`[TEST-EMAILS] Batch sent to ${to}: ${succeeded} succeeded, ${failed} failed`);

      return NextResponse.json({
        success: failed === 0,
        sent: succeeded,
        failed,
        results,
        planUsed: resolvedPlanId,
        planName: plan.planName,
      });
    } catch (err) {
      logger.error('[TEST-EMAILS] Batch failed:', err);
      return NextResponse.json(
        { error: 'Kunne ikke sende test-e-mails' },
        { status: 500 },
      );
    }
  },
);
