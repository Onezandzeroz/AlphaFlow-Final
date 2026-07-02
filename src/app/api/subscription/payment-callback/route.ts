import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getPaymentStatus, FLATPAY_CONFIGURED } from '@/lib/flatpay-client';
import { activatePlanAfterPayment } from '@/lib/plan-activation';

/**
 * GET /api/subscription/payment-callback
 *
 * The `accept_url` that Frisbii redirects the user to after they complete
 * (or cancel) the payment on Frisbii's hosted checkout page.
 *
 * Query params:
 *   - payment_id   AlphaFlow's internal Payment.id (passed in our accept_url)
 *   - mock=1       (mock mode only) — auto-succeed the payment
 *
 * Frisbii also appends `id` (the charge session id) and `invoice` to the
 * accept_url on success — but we rely on our own `payment_id` param.
 *
 * This handler:
 *   1. Looks up the Payment row by payment_id
 *   2. If mock mode, auto-succeeds (no Frisbii API call)
 *   3. Otherwise, calls Frisbii's API to verify the session status
 *   4. If succeeded/authorized, activates the plan via activatePlanAfterPayment
 *   5. Redirects the user to the app root with a payment status flag
 *
 * NOTE: The redirect-back is user-facing and can be spoofed (the user
 * could manually visit this URL). The ACTUAL payment confirmation must
 * come from the webhook (/api/subscription/payment-webhook) which is
 * server-to-server and HMAC-signed. This callback is a UX convenience —
 * it activates the plan immediately if the Frisbii API confirms success,
 * so the user doesn't have to wait for the webhook.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get('payment_id');
    const isMock = searchParams.get('mock') === '1';
    // The frontend URL to redirect to after processing.
    // IMPORTANT: The SPA lives at /login (not /). The payment status query
    // param is read by the SPA's client-side hydration to show a toast and
    // refresh auth/plan tier.
    const appUrl = new URL('/login', request.url);

    if (!paymentId) {
      appUrl.searchParams.set('payment', 'error');
      return NextResponse.redirect(appUrl);
    }

    const payment = await db.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, status: true, flatpayPaymentId: true, userId: true, planTier: true },
    });

    if (!payment) {
      logger.warn(`[PAYMENT CALLBACK] Payment ${paymentId} not found`);
      appUrl.searchParams.set('payment', 'error');
      return NextResponse.redirect(appUrl);
    }

    // If already processed (by the webhook), just redirect to the app
    if (payment.status === 'succeeded') {
      appUrl.searchParams.set('payment', 'success');
      return NextResponse.redirect(appUrl);
    }

    // If already failed/cancelled, redirect with that status
    if (payment.status === 'failed' || payment.status === 'cancelled') {
      appUrl.searchParams.set('payment', payment.status);
      return NextResponse.redirect(appUrl);
    }

    // Determine the payment status
    let status: 'succeeded' | 'pending' | 'failed' | 'cancelled';

    if (isMock || !FLATPAY_CONFIGURED) {
      // Mock mode — auto-succeed
      status = 'succeeded';
    } else if (payment.flatpayPaymentId) {
      // Real mode — verify with Frisbii API
      const result = await getPaymentStatus(payment.flatpayPaymentId);
      status = result.status;
    } else {
      // No Frisbii session ID — can't verify, wait for webhook
      status = 'pending';
    }

    if (status === 'succeeded') {
      // Activate the plan (also updates Payment.status)
      await activatePlanAfterPayment(paymentId, payment.userId);
      appUrl.searchParams.set('payment', 'success');
      return NextResponse.redirect(appUrl);
    }

    if (status === 'failed' || status === 'cancelled') {
      // Update the payment status
      await db.payment.update({
        where: { id: paymentId },
        data: { status, completedAt: new Date() },
      });
      appUrl.searchParams.set('payment', status);
      return NextResponse.redirect(appUrl);
    }

    // Still pending — redirect with a "processing" flag.
    // The webhook will activate the plan when the payment settles.
    appUrl.searchParams.set('payment', 'pending');
    return NextResponse.redirect(appUrl);
  } catch (error) {
    logger.error('[PAYMENT CALLBACK] Error:', error);
    const appUrl = new URL('/login', request.url);
    appUrl.searchParams.set('payment', 'error');
    return NextResponse.redirect(appUrl);
  }
}
