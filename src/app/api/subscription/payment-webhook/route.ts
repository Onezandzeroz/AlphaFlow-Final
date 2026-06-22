import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { verifyWebhookSignature } from '@/lib/flatpay-client';
import { activatePlanAfterPayment } from '@/lib/plan-activation';

/**
 * POST /api/subscription/payment-webhook
 *
 * Server-to-server webhook from Frisbii (formerly Billwerk+ / Reepay).
 * This is the AUTHORITATIVE payment confirmation — unlike the callback
 * redirect (which is user-facing and can be spoofed), the webhook is sent
 * by Frisbii's servers and signature-verified.
 *
 * Frisbii sends webhooks for these relevant events:
 *   - invoice_authorized  — payment authorized (reserved)
 *   - invoice_settled     — payment settled (captured) ← definitive success
 *   - invoice_failed      — payment failed
 *   - invoice_cancelled   — invoice cancelled
 *
 * The webhook payload includes:
 *   - event         — the event type (e.g. "invoice_settled")
 *   - order_handle  — AlphaFlow's Payment.id (the order.handle we passed)
 *   - invoice       — Frisbii's invoice/charge ID
 *   - amount, currency, timestamp, etc.
 *
 * Signature verification:
 *   Frisbii sends the `Reepay-Signature` header containing a base64-encoded
 *   HMAC-SHA256 of the raw request body, using the private API key as the
 *   HMAC secret. We recompute and compare timing-safely.
 *
 * This route is PUBLIC (no auth) — verified via the HMAC signature.
 */
export async function POST(request: NextRequest) {
  try {
    // Read the raw body (needed for signature verification)
    const rawBody = await request.text();

    // Frisbii/Reepay uses the "Reepay-Signature" header
    const signatureHeader =
      request.headers.get('reepay-signature') ||
      request.headers.get('frisbii-signature') ||
      null;

    // Verify the signature
    if (!verifyWebhookSignature(rawBody, signatureHeader)) {
      logger.warn('[PAYMENT WEBHOOK] Invalid Frisbii signature — rejecting');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse the Frisbii webhook payload
    const payload = JSON.parse(rawBody) as {
      id?: string;                          // Frisbii event ID
      event?: string;                       // "invoice_settled" | "invoice_authorized" | ...
      invoice?: string;                     // Frisbii invoice/charge ID
      order_handle?: string;                // AlphaFlow's Payment.id (our order reference)
      customer?: string;                    // customer handle
      subscription?: string;                // subscription handle (if applicable)
      transaction?: string;                 // transaction ID
      amount?: number;                      // amount in øre
      currency?: string;                    // "DKK"
      error?: string | null;                // error message (for failed payments)
      timestamp?: number;                   // unix timestamp
    };

    const eventType = (payload.event || '').toLowerCase();
    // order_handle is our Payment.id — the order.handle we passed when
    // creating the charge session.
    const paymentId = payload.order_handle || '';
    const frisbiiInvoiceId = payload.invoice || payload.id || '';

    logger.info(
      `[PAYMENT WEBHOOK] Frisbii event: ${eventType}, paymentId=${paymentId}, invoice=${frisbiiInvoiceId}`,
    );

    if (!paymentId) {
      logger.warn('[PAYMENT WEBHOOK] No order_handle in Frisbii payload');
      return NextResponse.json({ error: 'No order reference' }, { status: 400 });
    }

    // Look up the payment
    const payment = await db.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, status: true, userId: true, flatpayPaymentId: true },
    });

    if (!payment) {
      logger.warn(`[PAYMENT WEBHOOK] Payment ${paymentId} not found`);
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    // If already succeeded, no-op (idempotent — Frisbii may retry webhooks)
    if (payment.status === 'succeeded') {
      logger.info(`[PAYMENT WEBHOOK] Payment ${paymentId} already succeeded — skipping`);
      return NextResponse.json({ success: true, message: 'Already processed' });
    }

    // Map Frisbii event types to our internal payment status.
    // Both "authorized" (reserved) and "settled" (captured) count as success —
    // the plan activates immediately; the payment will be auto-settled.
    let newStatus: 'succeeded' | 'failed' | 'cancelled' | 'pending';
    if (
      eventType === 'invoice_settled' ||
      eventType === 'invoice_authorized'
    ) {
      newStatus = 'succeeded';
    } else if (
      eventType === 'invoice_failed' ||
      eventType === 'charge_failed'
    ) {
      newStatus = 'failed';
    } else if (
      eventType === 'invoice_cancelled' ||
      eventType === 'charge_cancelled'
    ) {
      newStatus = 'cancelled';
    } else {
      // Unknown event — log and leave as pending (no state change)
      logger.info(`[PAYMENT WEBHOOK] Unhandled Frisbii event: ${eventType} — ignoring`);
      return NextResponse.json({ success: true, message: `Event ${eventType} ignored` });
    }

    // Update the payment status
    await db.payment.update({
      where: { id: paymentId },
      data: {
        status: newStatus,
        completedAt: new Date(),
        // Store the full webhook payload for audit/debugging
        metadata: payload as unknown as Record<string, unknown>,
      },
    });

    // Activate the plan if succeeded
    if (newStatus === 'succeeded') {
      await activatePlanAfterPayment(paymentId, payment.userId);
      logger.info(`[PAYMENT WEBHOOK] Plan activated for payment ${paymentId}`);
    }

    return NextResponse.json({ success: true, status: newStatus, event: eventType });
  } catch (error) {
    logger.error('[PAYMENT WEBHOOK] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
