import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getPaymentStatus, FLATPAY_CONFIGURED } from '@/lib/flatpay-client';
import { activatePlanAfterPayment } from '@/lib/plan-activation';

/**
 * GET /api/subscription/payment-callback
 *
 * The URL Flatpay redirects the user to after they complete (or cancel)
 * the payment on Flatpay's hosted checkout page.
 *
 * Query params:
 *   - payment_id   AlphaFlow's internal Payment.id
 *   - mock=1       (mock mode only) — auto-succeed the payment
 *   - return_url   (mock mode only) — where to send the user after
 *
 * This handler:
 *   1. Looks up the Payment row by payment_id
 *   2. If mock mode, auto-succeeds (no Flatpay API call)
 *   3. Otherwise, calls Flatpay's API to verify the payment status
 *   4. If succeeded, activates the plan via activatePlanAfterPayment
 *   5. Redirects the user to the app's subscription-success page
 *
 * NOTE: The redirect-back is user-facing and can be spoofed (the user
 * could manually visit this URL). The ACTUAL payment confirmation must
 * come from the webhook (/api/subscription/payment-webhook) which is
 * server-to-server and signature-verified. This callback is a UX
 * convenience — it activates the plan immediately if the Flatpay API
 * confirms success, so the user doesn't have to wait for the webhook.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get('payment_id');
    const isMock = searchParams.get('mock') === '1';
    // return_url is the FRONTEND URL to send the user to after processing.
    // In mock mode this is passed as a query param. In real mode, Flatpay
    // redirects directly to the returnUrl (the frontend page) and calls
    // this callback server-side — so return_url won't be set.
    const returnUrl = searchParams.get('return_url') || '/';

    if (!paymentId) {
      return NextResponse.redirect(new URL('/?payment=error', request.url));
    }

    const payment = await db.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, status: true, flatpayPaymentId: true, userId: true, planTier: true },
    });

    if (!payment) {
      logger.warn(`[PAYMENT CALLBACK] Payment ${paymentId} not found`);
      return NextResponse.redirect(new URL('/?payment=error', request.url));
    }

    // If already processed (by the webhook), just redirect to the app
    if (payment.status === 'succeeded') {
      const url = new URL(returnUrl, request.url);
      url.searchParams.set('payment', 'success');
      return NextResponse.redirect(url);
    }

    // Determine the payment status
    let status: 'succeeded' | 'pending' | 'failed' | 'cancelled';

    if (isMock || !FLATPAY_CONFIGURED) {
      // Mock mode — auto-succeed
      status = 'succeeded';
    } else if (payment.flatpayPaymentId) {
      // Real mode — verify with Flatpay API
      const result = await getPaymentStatus(payment.flatpayPaymentId);
      status = result.status;
    } else {
      // No Flatpay payment ID — can't verify
      status = 'pending';
    }

    if (status === 'succeeded') {
      // Activate the plan
      await activatePlanAfterPayment(paymentId, payment.userId);
      const url = new URL(returnUrl, request.url);
      url.searchParams.set('payment', 'success');
      return NextResponse.redirect(url);
    }

    if (status === 'failed' || status === 'cancelled') {
      // Update the payment status
      await db.payment.update({
        where: { id: paymentId },
        data: { status, completedAt: new Date() },
      });
      const url = new URL(returnUrl, request.url);
      url.searchParams.set('payment', 'failed');
      return NextResponse.redirect(url);
    }

    // Still pending — redirect with a "processing" flag
    const url = new URL(returnUrl, request.url);
    url.searchParams.set('payment', 'pending');
    return NextResponse.redirect(url);
  } catch (error) {
    logger.error('[PAYMENT CALLBACK] Error:', error);
    return NextResponse.redirect(new URL('/?payment=error', request.url));
  }
}
