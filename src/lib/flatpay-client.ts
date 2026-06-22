/**
 * Frisbii (formerly Flatpay / Billwerk+) Checkout API Client
 *
 * Integration with Frisbii's hosted payment page for subscription plan
 * purchases. When a user selects a paid plan, we create a charge session
 * with Frisbii, redirect the user to Frisbii's hosted checkout, and
 * activate the plan only after a confirmed payment (via callback or
 * webhook).
 *
 * ─── Frisbii API ──
 *
 * API base URL:  https://checkout-api.frisbii.com/v1
 * Create session: POST /session/charge
 * Get session:    GET  /session/charge/{id}
 * Auth:           HTTP Basic Auth — username = private API key (priv_...),
 *                 password = empty. base64(priv_XXXX:).
 * Docs:           https://docs.frisbii.com/docs/new-web-shop
 * API credentials: https://app.frisbii.com under Developers → API Credentials
 *
 * ─── Configuration ──
 *
 * Set these environment variables in .env:
 *   FLATPAY_API_KEY        — Your Frisbii private API key (priv_...)
 *   FLATPAY_API_BASE_URL   — Frisbii API base (default: https://checkout-api.frisbii.com/v1)
 *   FLATPAY_WEBHOOK_SECRET — Optional override for webhook HMAC key (defaults to API key)
 *
 * Note: FLATPAY_MERCHANT_ID is NOT used by Frisbii (kept for backward compat).
 *
 * ─── Mock mode ──
 *
 * When FLATPAY_API_KEY is NOT set, the client runs in "mock mode" — it
 * simulates the payment flow without calling Frisbii. This lets you test
 * the full subscription-purchase flow locally (the mock checkout page
 * auto-succeeds). In production, set FLATPAY_API_KEY to use the real API.
 *
 * ─── Hosted-checkout flow ──
 *
 *   1. User picks a paid plan → frontend calls POST /api/subscription/create-payment
 *   2. Backend creates a Payment row (status=pending) + calls Frisbii to
 *      create a charge session → gets back { id, url }
 *   3. Frontend redirects the user to `url` (Frisbii's hosted checkout)
 *   4. User completes payment on Frisbii's hosted page
 *   5. Frisbii redirects the user back to `accept_url` (our callback)
 *      → callback verifies status, activates plan, redirects to app
 *   6. Frisbii also sends a webhook (invoice_authorized / invoice_settled)
 *      → webhook handler verifies HMAC signature, activates plan
 *
 * ─── Webhook configuration ──
 *
 * Webhooks are configured in the Frisbii admin UI (https://app.frisbii.com),
 * NOT via the API call. Set the webhook URL to:
 *   https://your-domain.com/api/subscription/payment-webhook
 * Listen for: invoice_authorized, invoice_settled, invoice_failed events.
 *
 * @see https://docs.frisbii.com/docs/new-web-shop
 * @see https://docs.frisbii.com/docs/billwerk-checkout
 */

import { logger } from '@/lib/logger';
import { createHmac, timingSafeEqual } from 'crypto';

// ─── Config ───────────────────────────────────────────────────────────

const FRISBII_API_KEY = process.env.FLATPAY_API_KEY || '';
const FRISBII_API_BASE_URL = (
  process.env.FLATPAY_API_BASE_URL || 'https://checkout-api.frisbii.com/v1'
).replace(/\/$/, '');
// Frisbii webhook HMAC uses the private API key by default. Allow a
// separate secret override for flexibility (some setups use a distinct key).
const FRISBII_WEBHOOK_SECRET = process.env.FLATPAY_WEBHOOK_SECRET || FRISBII_API_KEY;

/** True when Frisbii is configured (real API mode). False = mock mode. */
export const FLATPAY_CONFIGURED = Boolean(FRISBII_API_KEY && FRISBII_API_BASE_URL);

// ─── Types ────────────────────────────────────────────────────────────

export interface CreatePaymentSessionInput {
  /** AlphaFlow's internal payment ID (Payment.id) — used as order.handle */
  paymentId: string;
  /** Amount in øre (1 DKK = 100 øre) */
  amount: number;
  currency: string;
  /** Human-readable description (stored locally; Frisbii charge sessions don't have a description field) */
  description: string;
  /** URL Frisbii redirects the user to on SUCCESS (our callback handler) */
  acceptUrl: string;
  /** URL Frisbii redirects the user to on CANCEL (frontend page) */
  cancelUrl: string;
  /** Customer email */
  customerEmail?: string;
  /** Customer handle (unique reference, e.g. user ID) */
  customerHandle?: string;
  /** Customer first name */
  customerFirstName?: string;
  /** Customer last name */
  customerLastName?: string;
}

export interface CreatePaymentSessionResult {
  /** Frisbii charge session ID (cs_...) */
  flatpayPaymentId: string;
  /** The hosted checkout URL the user should be redirected to */
  checkoutUrl: string;
  /** Raw response from Frisbii (for debugging/logging) */
  raw?: unknown;
}

export interface PaymentStatusResult {
  /** Frisbii charge session ID */
  flatpayPaymentId: string;
  /** Final status: 'succeeded' | 'pending' | 'failed' | 'cancelled' */
  status: 'succeeded' | 'pending' | 'failed' | 'cancelled';
  /** Raw response from Frisbii */
  raw?: unknown;
}

// ─── Auth helper ──────────────────────────────────────────────────────

/**
 * Build the Basic Auth header for Frisbii.
 * Format: Basic base64(priv_XXXX:) — username = API key, password = empty.
 */
function basicAuthHeader(): string {
  return 'Basic ' + Buffer.from(`${FRISBII_API_KEY}:`).toString('base64');
}

// ─── Mock mode helpers ────────────────────────────────────────────────

/**
 * In mock mode, we generate a fake checkout URL that points to our own
 * callback endpoint with a `mock=1` flag. The callback handler detects
 * this, auto-succeeds the payment (activating the plan), and then
 * redirects the user to the frontend.
 */
function mockCheckoutUrl(paymentId: string, acceptUrl: string): string {
  // Point to our callback which auto-succeeds and redirects
  const url = new URL(acceptUrl);
  url.searchParams.set('mock', '1');
  return url.toString();
}

// ─── API methods ──────────────────────────────────────────────────────

/**
 * Create a Frisbii Pay Checkout charge session.
 *
 * POST /session/charge with the order details, accept_url, and cancel_url.
 * Returns the session ID and hosted checkout URL.
 *
 * @see https://docs.frisbii.com/docs/new-web-shop
 */
export async function createPaymentSession(
  input: CreatePaymentSessionInput
): Promise<CreatePaymentSessionResult> {
  // ── Mock mode ──
  if (!FLATPAY_CONFIGURED) {
    logger.info(
      `[Frisbii] MOCK MODE — createPaymentSession for ${input.paymentId} (${input.amount} ${input.currency})`
    );
    return {
      flatpayPaymentId: `mock_${input.paymentId}`,
      checkoutUrl: mockCheckoutUrl(input.paymentId, input.acceptUrl),
    };
  }

  // ── Real API mode ──
  // Build the Frisbii charge session request body.
  // The order.handle is our Payment.id — Frisbii echoes it back in webhooks
  // as `order_handle`, so we can match webhook events to our Payment rows.
  const requestBody: Record<string, unknown> = {
    order: {
      handle: input.paymentId,
      amount: input.amount,
      currency: input.currency,
      ...(input.customerEmail || input.customerHandle || input.customerFirstName || input.customerLastName
        ? {
            customer: {
              ...(input.customerHandle ? { handle: input.customerHandle } : {}),
              ...(input.customerEmail ? { email: input.customerEmail } : {}),
              ...(input.customerFirstName ? { first_name: input.customerFirstName } : {}),
              ...(input.customerLastName ? { last_name: input.customerLastName } : {}),
            },
          }
        : {}),
    },
    accept_url: input.acceptUrl,
    cancel_url: input.cancelUrl,
  };

  const response = await fetch(`${FRISBII_API_BASE_URL}/session/charge`, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.error(`[Frisbii] createPaymentSession failed (${response.status}): ${body}`);
    throw new Error(`Frisbii API error (${response.status}): ${body}`);
  }

  const data = (await response.json()) as { id?: string; url?: string };

  if (!data.id || !data.url) {
    logger.error('[Frisbii] createPaymentSession — missing id or url in response:', data);
    throw new Error('Frisbii API returned an invalid response (missing id or url)');
  }

  return {
    flatpayPaymentId: data.id,
    checkoutUrl: data.url,
    raw: data,
  };
}

/**
 * Get the status of a Frisbii charge session.
 *
 * GET /session/charge/{id} — returns the session with a `state` field.
 * Used by the callback handler to verify the payment before activating
 * the plan (defence in depth — the webhook is the primary confirmation).
 *
 * Frisbii session states:
 *   new        — session created, no payment yet
 *   authorized — payment authorized (reserved)
 *   settled    — payment settled (captured) ← success
 *   failed     — payment failed
 *   cancelled  — session cancelled
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
  const response = await fetch(
    `${FRISBII_API_BASE_URL}/session/charge/${encodeURIComponent(flatpayPaymentId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: basicAuthHeader(),
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.error(`[Frisbii] getPaymentStatus failed (${response.status}): ${body}`);
    throw new Error(`Frisbii API error (${response.status}): ${body}`);
  }

  const data = (await response.json()) as { state?: string; status?: string };
  const rawState = (data.state || data.status || '').toLowerCase();

  let status: PaymentStatusResult['status'] = 'pending';
  if (rawState === 'settled' || rawState === 'authorized') {
    // authorized = payment reserved (will be auto-settled for instant-settle sessions)
    // settled = payment captured
    // Both count as success for plan activation.
    status = 'succeeded';
  } else if (rawState === 'failed') {
    status = 'failed';
  } else if (rawState === 'cancelled') {
    status = 'cancelled';
  }

  return { flatpayPaymentId, status, raw: data };
}

/**
 * Verify the signature of a Frisbii (Reepay) webhook.
 *
 * Frisbii sends the `Reepay-Signature` header containing a base64-encoded
 * HMAC-SHA256 of the raw request body, using the private API key as the
 * HMAC secret. This function recomputes the HMAC and compares it
 * timing-safely.
 *
 * @see https://docs.frisbii.com/reference/intro_webhooks
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  // In mock mode (no key configured), accept all webhooks
  if (!FRISBII_WEBHOOK_SECRET) return true;
  if (!signatureHeader) return false;

  const expected = createHmac('sha256', FRISBII_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('base64');

  // Timing-safe comparison (both are base64 strings of equal length)
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
