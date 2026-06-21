/**
 * Flatpay API Client
 *
 * Integration with Flatpay's hosted payment page for subscription plan
 * purchases. When a user selects a paid plan (Månedlig / Pro / Business /
 * Business Extended), we create a payment session with Flatpay, redirect
 * the user to Flatpay's hosted checkout, and activate the plan only after
 * a confirmed payment (via callback redirect or webhook).
 *
 * ─── Configuration ──
 *
 * Set these environment variables in .env:
 *   FLATPAY_API_KEY       — Your Flatpay API key (from the Flatpay Portal)
 *   FLATPAY_API_BASE_URL  — Flatpay's API base URL (e.g. https://api.flatpay.com/v1)
 *   FLATPAY_MERCHANT_ID   — Your Flatpay merchant ID
 *   FLATPAY_WEBHOOK_SECRET— Secret used to verify webhook signatures
 *
 * ─── Mock mode ──
 *
 * When FLATPAY_API_KEY is NOT set, the client runs in "mock mode" — it
 * simulates the payment flow without calling Flatpay. This lets you test
 * the full subscription-purchase flow locally (the mock checkout page
 * auto-succeeds). In production, set the env vars to use the real API.
 *
 * ─── Standard hosted-checkout flow ──
 *
 *   1. User picks a paid plan → frontend calls POST /api/subscription/create-payment
 *   2. Backend creates a Payment row (status=pending) + calls Flatpay to
 *      create a payment session → gets back a hosted checkout URL
 *   3. Frontend redirects the user to the Flatpay URL
 *   4. User completes payment on Flatpay's hosted page
 *   5. Flatpay redirects back to /api/subscription/payment-callback?payment_id=...
 *      (user-facing redirect — shows a success/pending page)
 *   6. Flatpay also sends a server-to-server webhook to
 *      /api/subscription/payment-webhook with the final status
 *   7. Backend verifies the payment status (via API or webhook), sets
 *      Payment.status = succeeded, and activates Company.planTier
 *
 * NOTE: The exact Flatpay API endpoints may differ from what's implemented
 * here. Once you have the official Flatpay API documentation from your
 * account manager, adjust the createPaymentSession / getPaymentStatus /
 * verifyWebhookSignature methods to match. The surrounding flow (Payment
 * model, routes, activation logic) stays the same.
 */

import { logger } from '@/lib/logger';

// ─── Config ───────────────────────────────────────────────────────────

const FLATPAY_API_KEY = process.env.FLATPAY_API_KEY || '';
const FLATPAY_API_BASE_URL = process.env.FLATPAY_API_BASE_URL || 'https://api.flatpay.com/v1';
const FLATPAY_MERCHANT_ID = process.env.FLATPAY_MERCHANT_ID || '';
const FLATPAY_WEBHOOK_SECRET = process.env.FLATPAY_WEBHOOK_SECRET || '';

/** True when Flatpay is configured (real API mode). False = mock mode. */
export const FLATPAY_CONFIGURED = Boolean(FLATPAY_API_KEY && FLATPAY_API_BASE_URL);

// ─── Types ────────────────────────────────────────────────────────────

export interface CreatePaymentSessionInput {
  /** AlphaFlow's internal payment ID (Payment.id) — used as the order reference */
  paymentId: string;
  /** Amount in øre (1 DKK = 100 øre) */
  amount: number;
  currency: string;
  /** Human-readable description (e.g. "AlphaFlow Pro — 12 måneder") */
  description: string;
  /** FRONTEND URL Flatpay redirects the user to after payment (the app page) */
  returnUrl: string;
  /** SERVER-side URL Flatpay calls to confirm the payment (our callback handler) */
  callbackUrl: string;
  /** URL Flatpay sends the server-to-server webhook to */
  webhookUrl: string;
  /** Customer email (for receipt) */
  customerEmail?: string;
}

export interface CreatePaymentSessionResult {
  /** Flatpay's payment/session ID */
  flatpayPaymentId: string;
  /** The hosted checkout URL the user should be redirected to */
  checkoutUrl: string;
  /** Raw response from Flatpay (for debugging/logging) */
  raw?: unknown;
}

export interface PaymentStatusResult {
  /** Flatpay's payment ID */
  flatpayPaymentId: string;
  /** Final status: 'succeeded' | 'pending' | 'failed' | 'cancelled' */
  status: 'succeeded' | 'pending' | 'failed' | 'cancelled';
  /** Raw response from Flatpay */
  raw?: unknown;
}

// ─── Mock mode helpers ────────────────────────────────────────────────

/**
 * In mock mode, we generate a fake checkout URL that points to our own
 * callback endpoint with a `mock=1` flag. The callback handler detects
 * this, auto-succeeds the payment (activating the plan), and then
 * redirects the user to the frontend returnUrl (the app page).
 *
 * This simulates the full Flatpay flow: user is "redirected to Flatpay"
 * (actually to our callback), payment is "completed" (auto-succeeded),
 * and the user is sent back to the app.
 */
function mockCheckoutUrl(paymentId: string, frontendReturnUrl: string): string {
  // Encode the frontend return URL so the callback can forward to it
  const encodedReturn = encodeURIComponent(frontendReturnUrl);
  return `/api/subscription/payment-callback?payment_id=${paymentId}&mock=1&return_url=${encodedReturn}`;
}

// ─── API methods ──────────────────────────────────────────────────────

/**
 * Create a payment session with Flatpay.
 *
 * Returns the hosted checkout URL the user should be redirected to.
 * In mock mode, returns a URL pointing to our own callback (auto-succeed).
 */
export async function createPaymentSession(
  input: CreatePaymentSessionInput
): Promise<CreatePaymentSessionResult> {
  // ── Mock mode ──
  if (!FLATPAY_CONFIGURED) {
    logger.info(`[Flatpay] MOCK MODE — createPaymentSession for ${input.paymentId} (${input.amount} ${input.currency})`);
    return {
      flatpayPaymentId: `mock_${input.paymentId}`,
      checkoutUrl: mockCheckoutUrl(input.paymentId, input.returnUrl),
    };
  }

  // ── Real API mode ──
  //
  // NOTE: The exact endpoint and request body shape depend on Flatpay's
  // API documentation. This is a standard hosted-checkout pattern. Adjust
  // the endpoint path + field names to match Flatpay's actual API once
  // you have the official docs.
  const response = await fetch(`${FLATPAY_API_BASE_URL}/payments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${FLATPAY_API_KEY}`,
      'Content-Type': 'application/json',
      ...(FLATPAY_MERCHANT_ID ? { 'X-Merchant-Id': FLATPAY_MERCHANT_ID } : {}),
    },
    body: JSON.stringify({
      // AlphaFlow's order reference
      reference: input.paymentId,
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      // redirect_url: the FRONTEND URL Flatpay sends the user to after payment
      redirect_url: input.returnUrl,
      // callback_url: the SERVER-side URL Flatpay calls to confirm (our callback handler)
      callback_url: input.callbackUrl,
      // notify_url: the server-to-server webhook URL
      notify_url: input.webhookUrl,
      ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.error(`[Flatpay] createPaymentSession failed (${response.status}): ${body}`);
    throw new Error(`Flatpay API error (${response.status}): ${body}`);
  }

  const data = await response.json();
  return {
    flatpayPaymentId: data.id || data.payment_id || data.reference,
    checkoutUrl: data.checkout_url || data.url || data.hosted_page_url,
    raw: data,
  };
}

/**
 * Get the status of a payment from Flatpay.
 * Used by the callback handler to verify the payment before activating
 * the plan (defence in depth — the webhook is the primary confirmation,
 * but the callback also checks).
 */
export async function getPaymentStatus(
  flatpayPaymentId: string
): Promise<PaymentStatusResult> {
  // ── Mock mode ──
  if (!FLATPAY_CONFIGURED) {
    return {
      flatpayPaymentId,
      status: 'succeeded',
    };
  }

  // ── Real API mode ──
  const response = await fetch(`${FLATPAY_API_BASE_URL}/payments/${flatpayPaymentId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${FLATPAY_API_KEY}`,
      ...(FLATPAY_MERCHANT_ID ? { 'X-Merchant-Id': FLATPAY_MERCHANT_ID } : {}),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.error(`[Flatpay] getPaymentStatus failed (${response.status}): ${body}`);
    throw new Error(`Flatpay API error (${response.status}): ${body}`);
  }

  const data = await response.json();
  // Map Flatpay's status to our internal status. The exact field names
  // depend on Flatpay's API — adjust once you have the docs.
  const rawStatus = (data.status || data.state || '').toLowerCase();
  let status: PaymentStatusResult['status'] = 'pending';
  if (['succeeded', 'captured', 'completed', 'paid', 'settled'].includes(rawStatus)) {
    status = 'succeeded';
  } else if (['failed', 'declined', 'error'].includes(rawStatus)) {
    status = 'failed';
  } else if (['cancelled', 'canceled', 'expired', 'abandoned'].includes(rawStatus)) {
    status = 'cancelled';
  }

  return { flatpayPaymentId, status, raw: data };
}

/**
 * Verify the signature of a Flatpay webhook request.
 *
 * Flatpay typically sends a signature header (e.g. `Flatpay-Signature`)
 * computed as HMAC-SHA256 of the raw request body using the webhook
 * secret. This function verifies that signature to ensure the webhook
 * is genuinely from Flatpay.
 *
 * NOTE: The exact header name + signature algorithm depend on Flatpay's
 * API. Adjust once you have the official docs.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  // In mock mode (no secret configured), accept all webhooks
  if (!FLATPAY_WEBHOOK_SECRET) return true;

  if (!signatureHeader) return false;

  // Standard HMAC-SHA256 verification
  const crypto = require('crypto');
  const expected = crypto
    .createHmac('sha256', FLATPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison
  if (expected.length !== signatureHeader.length) return false;
  let result = 0;
  for (let i = 0; i < signatureHeader.length; i++) {
    result |= expected.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  }
  return result === 0;
}
