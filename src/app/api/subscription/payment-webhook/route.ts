import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { verifyWebhookSignature } from '@/lib/flatpay-client';
import { activatePlanAfterPayment } from '@/lib/plan-activation';

/**
 * POST /api/subscription/payment-webhook
 *
 * Server-to-server webhook from Flatpay. This is the AUTHORITATIVE
 * payment confirmation — unlike the callback redirect (which is
 * user-facing and can be spoofed), the webhook is sent by Flatpay's
 * servers and signature-verified.
 *
 * Flatpay sends this webhook when a payment's status changes (succeeded,
 * failed, cancelled, refunded). The handler:
 *   1. Reads the raw body + signature header
 *   2. Verifies the signature (HMAC-SHA256 with FLATPAY_WEBHOOK_SECRET)
 *   3. Looks up the Payment row by flatpayPaymentId (or reference)
 *   4. Updates the payment status
 *   5. If succeeded, activates the plan via activatePlanAfterPayment
 *
 * NOTE: The exact webhook payload shape + signature header name depend
 * on Flatpay's API. Adjust the field names once you have the official
 * docs. The signature verification logic is in flatpay-client.ts.
 *
 * This route is PUBLIC (no auth) — it's verified via the webhook secret
 * instead. Route config: { auth: false }.
 */
export async function POST(request: NextRequest) {
  try {
    // Read the raw body (needed for signature verification)
    const rawBody = await request.text();
    const signatureHeader = request.headers.get('flatpay-signature')
      || request.headers.get('x-flatpay-signature')
      || null;

    // Verify the signature
    if (!verifyWebhookSignature(rawBody, signatureHeader)) {
      logger.warn('[PAYMENT WEBHOOK] Invalid signature — rejecting');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse the webhook payload
    const payload = JSON.parse(rawBody) as {
      // The exact field names depend on Flatpay's API — these are
      // common patterns. Adjust once you have the official docs.
      id?: string;                    // Flatpay payment ID
      reference?: string;             // AlphaFlow's Payment.id (our order ref)
      status?: string;                // 'succeeded' | 'failed' | 'cancelled' | ...
      event?: string;                 // 'payment.succeeded' | 'payment.failed' | ...
      amount?: number;
      currency?: string;
    };

    const flatpayPaymentId = payload.id || '';
    const paymentId = payload.reference || '';
    const status = (payload.status || payload.event || '').toLowerCase();

    logger.info(
      `[PAYMENT WEBHOOK] Received: flatpayPaymentId=${flatpayPaymentId}, paymentId=${paymentId}, status=${status}`,
    );

    if (!paymentId) {
      logger.warn('[PAYMENT WEBHOOK] No payment reference in payload');
      return NextResponse.json({ error: 'No payment reference' }, { status: 400 });
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

    // Determine the new status
    let newStatus: 'succeeded' | 'failed' | 'cancelled' | 'pending';
    if (status.includes('succeed') || status.includes('captured') || status.includes('completed') || status.includes('paid')) {
      newStatus = 'succeeded';
    } else if (status.includes('fail') || status.includes('decline') || status.includes('error')) {
      newStatus = 'failed';
    } else if (status.includes('cancel') || status.includes('expire') || status.includes('abandon')) {
      newStatus = 'cancelled';
    } else {
      newStatus = 'pending';
    }

    // If already succeeded, no-op (idempotent)
    if (payment.status === 'succeeded') {
      logger.info(`[PAYMENT WEBHOOK] Payment ${paymentId} already succeeded — skipping`);
      return NextResponse.json({ success: true, message: 'Already processed' });
    }

    // Update the payment status
    if (newStatus !== 'pending') {
      await db.payment.update({
        where: { id: paymentId },
        data: {
          status: newStatus,
          completedAt: new Date(),
          // Store the webhook payload for audit/debugging
          metadata: payload as unknown as Record<string, unknown>,
        },
      });
    }

    // Activate the plan if succeeded
    if (newStatus === 'succeeded') {
      await activatePlanAfterPayment(paymentId, payment.userId);
    }

    return NextResponse.json({ success: true, status: newStatus });
  } catch (error) {
    logger.error('[PAYMENT WEBHOOK] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
