/**
 * POST /api/oversight/test-emails
 *
 * SuperDev-only endpoint that sends a test batch of system emails
 * to a specified address. Used for KYB documentation and QA.
 *
 * Body:
 *   { to: string, emails: string[], language?: 'da'|'en' }
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

const APP_URL = process.env.APP_URL || 'https://alphaflow.dk';

// ── Mock data factories ──────────────────────────────────────────

const NOW = new Date();
const inDays = (n: number) => new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + n);

async function sendWelcome(to: string, lang: 'da' | 'en') {
  return sendSubscriptionWelcomeEmail(to, {
    planName: 'AlphaFlow Business Extended',
    monthlyPriceDKK: 145,
    bindingMonths: 36,
    startDate: NOW.toISOString(),
    expiryDate: inDays(36 * 30).toISOString(),
    termsVersion: '2026-05-v1',
    appUrl: APP_URL,
  }, lang);
}

async function sendReceipt(to: string, lang: 'da' | 'en') {
  let invoiceNumber: string | undefined;
  try { invoiceNumber = await generateSequentialInvoiceNumber(); } catch { /* fallback below */ }
  const renewalDate = inDays(36 * 30);
  return sendPaymentReceiptEmail(to, {
    planName: 'AlphaFlow Business Extended',
    amountDKK: 5220,
    vatDKK: 1305,
    totalDKK: 6525,
    monthlyPriceDKK: 145,
    bindingMonths: 36,
    paymentDate: NOW.toISOString(),
    paymentId: 'test_payment_' + Date.now(),
    invoiceNumber,
    cardLast4: '4242',
    period: `${NOW.toLocaleDateString('da-DK')} – ${renewalDate.toLocaleDateString('da-DK')}`,
    isRenewal: false,
    customerCompanyName: 'Test Virksomhed ApS',
    customerEmail: to,
    customerCvr: '12345678',
    customerAddress: 'Testvej 1, 8000 Aarhus C',
  }, lang);
}

async function sendPreRenewal(to: string, lang: 'da' | 'en', days = 14) {
  return sendPreRenewalReminderEmail(to, {
    planName: 'AlphaFlow Business Extended',
    renewalDate: inDays(days).toISOString(),
    amountDKK: 6525,
    daysUntilRenewal: days,
    isAutoRenew: true,
    appUrl: APP_URL,
  }, lang);
}

async function sendPreBilling(to: string, lang: 'da' | 'en', days = 7) {
  return sendPreBillingReminderEmail(to, {
    planName: 'AlphaFlow Business Extended',
    renewalDate: inDays(days).toISOString(),
    amountDKK: 6525,
    daysUntilRenewal: days,
    isAutoRenew: true,
    appUrl: APP_URL,
  }, lang);
}

async function sendCancelled(to: string, lang: 'da' | 'en') {
  return sendSubscriptionCancelledEmail(to, {
    planName: 'AlphaFlow Business Extended',
    cancelledDate: NOW.toISOString(),
    accessUntilDate: inDays(36 * 30).toISOString(),
    reason: 'user_request',
    appUrl: APP_URL,
  }, lang);
}

async function sendFailed(to: string, lang: 'da' | 'en') {
  return sendPaymentFailedEmail(to, {
    planName: 'AlphaFlow Business Extended',
    amountDKK: 145,
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

async function sendTestEmail(type: EmailType, to: string, lang: 'da' | 'en'): Promise<{ type: string; success: boolean; logId: string; error?: string }> {
  try {
    let result: { success: boolean; logId: string };
    switch (type) {
      case 'welcome':      result = await sendWelcome(to, lang); break;
      case 'receipt':       result = await sendReceipt(to, lang); break;
      case 'pre-renewal':   result = await sendPreRenewal(to, lang); break;
      case 'pre-billing':   result = await sendPreBilling(to, lang); break;
      case 'cancelled':     result = await sendCancelled(to, lang); break;
      case 'payment-failed': result = await sendFailed(to, lang); break;
      case 'terms-change':  result = await sendTermsChange(to, lang); break;
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
      const { to, emails, language } = body as {
        to: string;
        emails: string[];
        language?: 'da' | 'en';
      };

      // Validate
      if (!to || typeof to !== 'string' || !to.includes('@')) {
        return NextResponse.json(
          { error: 'Gyldig e-mailadresse kræves' },
          { status: 400 },
        );
      }

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

      const lang = (language === 'en' ? 'en' : 'da') as 'da' | 'en';

      // Send all selected emails sequentially
      const results = [];
      for (const type of emails as EmailType[]) {
        const r = await sendTestEmail(type, to, lang);
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
