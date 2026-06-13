import { NextResponse } from 'next/server';
import { storecoveClient, StorecoveWebhookEvent } from '@/lib/storecove-client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditCreate } from '@/lib/audit';

// POST /api/storecove/webhook — Receive Storecove webhook events (NO AUTH)
// This endpoint is called by Storecove servers, not by authenticated users.
// Authenticity is verified via HMAC-SHA256 signature.
export async function POST(request: Request) {
  try {
    // Read raw body as text for signature verification
    const rawBody = await request.text();

    // Get the signature header
    const signature = request.headers.get('X-Storecove-Signature');

    if (!signature) {
      logger.warn('[STORECOVE_WEBHOOK] Missing X-Storecove-Signature header');
      return NextResponse.json(
        { error: 'Missing signature header' },
        { status: 401 }
      );
    }

    // Verify the webhook signature
    const isValid = storecoveClient.verifyWebhookSignature(rawBody, signature);

    if (!isValid) {
      logger.warn('[STORECOVE_WEBHOOK] Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Parse the webhook event
    let event: StorecoveWebhookEvent;
    try {
      event = JSON.parse(rawBody) as StorecoveWebhookEvent;
    } catch {
      logger.warn('[STORECOVE_WEBHOOK] Failed to parse webhook payload');
      return NextResponse.json(
        { error: 'Invalid payload' },
        { status: 400 }
      );
    }

    logger.info('[STORECOVE_WEBHOOK] Received webhook event', {
      event: event.event,
      submissionId: event.data.id,
      status: event.data.status,
    });

    // Only process status change events for invoice submissions
    if (event.event !== 'invoice_submission.status_changed') {
      logger.info('[STORECOVE_WEBHOOK] Ignoring non-status-change event', {
        event: event.event,
      });
      return NextResponse.json({ received: true });
    }

    // Look up the EInvoiceSending by storecoveSubmissionId
    const sending = await db.eInvoiceSending.findFirst({
      where: { storecoveSubmissionId: event.data.id },
    });

    if (!sending) {
      logger.warn('[STORECOVE_WEBHOOK] No EInvoiceSending found for submission ID', {
        submissionId: event.data.id,
      });
      // Return 200 anyway — Storecove will retry on non-2xx responses
      return NextResponse.json({ received: true });
    }

    // Map the Storecove status to EInvoiceSending updates
    const status = event.data.status;
    const now = new Date();

    let updateData: Record<string, unknown> = {};
    let newStatus: string;

    switch (status) {
      case 'delivered':
        newStatus = 'DELIVERED';
        updateData = {
          status: 'DELIVERED',
          deliveredAt: now,
        };
        break;

      case 'accepted':
        newStatus = 'ACCEPTED';
        updateData = {
          status: 'ACCEPTED',
          acceptedAt: now,
        };
        break;

      case 'rejected':
        newStatus = 'REJECTED';
        updateData = {
          status: 'REJECTED',
          errorMessage: event.data.rejection_reason || 'Recipient rejected the invoice',
        };
        break;

      case 'undeliverable':
      case 'expired':
      case 'failed':
        newStatus = 'FAILED';
        updateData = {
          status: 'FAILED',
          errorMessage: event.data.rejection_reason || `Invoice delivery ${status}`,
        };
        break;

      case 'processing':
        newStatus = 'SENDING';
        updateData = {
          status: 'SENDING',
        };
        break;

      default:
        logger.warn('[STORECOVE_WEBHOOK] Unknown status received', { status });
        return NextResponse.json({ received: true });
    }

    // Update the EInvoiceSending record
    await db.eInvoiceSending.update({
      where: { id: sending.id },
      data: updateData,
    });

    // Audit trail for the status change
    await auditCreate(
      sending.sentBy,
      'EInvoiceSending',
      sending.id,
      {
        action: 'storecove_webhook_status_change',
        previousStatus: sending.status,
        newStatus,
        storecoveStatus: status,
        rejectionReason: event.data.rejection_reason || null,
      },
      {
        source: 'storecove_webhook',
        storecoveSubmissionId: event.data.id,
        storecoveStorecoveId: String(event.data.storecove_id),
        timestamp: event.timestamp,
      },
      sending.companyId
    );

    logger.info('[STORECOVE_WEBHOOK] Updated EInvoiceSending status', {
      sendingId: sending.id,
      previousStatus: sending.status,
      newStatus,
      storecoveStatus: status,
      companyId: sending.companyId,
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error('[STORECOVE_WEBHOOK] Failed to process webhook:', error);
    // Return 200 to prevent Storecove from retrying on internal errors
    // We'll catch up via polling if needed
    return NextResponse.json({ received: true });
  }
}
