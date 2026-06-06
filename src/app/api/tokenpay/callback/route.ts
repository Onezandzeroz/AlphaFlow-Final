import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { tokenpay, type WebhookPayload } from '@/lib/tokenpay';
import { auditLog } from '@/lib/audit';
import { db } from '@/lib/db';
import { isAlphaAiOwner, ensureOwnerAccess } from '@/lib/access-guard';
import { withGuard } from '@/lib/route-guard';

const WEBHOOK_SECRET = process.env.TOKENPAY_API_KEY || 'tokenpay-dev-key-2026';

/**
 * POST /api/tokenpay/callback
 */
export const POST = withGuard({ auth: false }, async (request: NextRequest) => {
  try {
    // 1. Read the raw body for signature verification
    const rawBody = await request.text();
    const signature = request.headers.get('x-tokenpay-signature') || '';
    const eventType = request.headers.get('x-tokenpay-event') || '';

    // 2. Verify HMAC-SHA256 signature
    const expectedSignature = createHmac('sha256', WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    if (!timingSafeEqual(signature, expectedSignature)) {
      console.warn('[TokenPay Callback] Invalid signature — rejecting');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // 3. Parse the payload
    const payload: WebhookPayload = JSON.parse(rawBody);

    console.log(`[TokenPay Callback] ${payload.event} for user ${payload.userId}`);

    // 4. Handle the event
    await handleWebhookEvent(payload);

    return NextResponse.json({ received: true, event: payload.event });
  } catch (error) {
    console.error('[TokenPay Callback] Error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
});

/**
 * Handle webhook events
 */
async function handleWebhookEvent(payload: WebhookPayload): Promise<void> {
  switch (payload.event) {
    case 'access.granted':
      console.log(
        `[TokenPay] Access GRANTED: ${payload.userId} ` +
        `${payload.previousLevel} → ${payload.newLevel} ` +
        `(reason: ${payload.reason})`
      );

      try {
        await auditLog({
          action: 'UPDATE',
          entityType: 'User',
          entityId: payload.userId,
          userId: payload.userId,
          changes: {
            accessLevel: {
              old: payload.previousLevel,
              new: payload.newLevel,
            },
          },
          metadata: {
            source: 'tokenpay-webhook',
            event: 'access.granted',
            reason: payload.reason,
            proofId: payload.proofId || null,
            timestamp: payload.timestamp,
          },
        });
      } catch (auditError) {
        console.error('[TokenPay Callback] Audit log failed for access.granted:', auditError);
      }
      break;

    case 'access.revoked':
      if (await isAlphaAiOwner(payload.userId)) {
        console.log(
          `[AccessGuard] BLOCKED revocation of AlphaAi owner ${payload.userId}. ` +
          `Re-granting read_write access.`
        );

        try {
          await auditLog({
            action: 'UPDATE',
            entityType: 'User',
            entityId: payload.userId,
            userId: payload.userId,
            changes: {
              accessLevel: {
                old: payload.newLevel,
                new: 'read_write',
              },
            },
            metadata: {
              source: 'access-guard',
              event: 'owner_protection',
              blockedEvent: 'access.revoked',
              blockedReason: payload.reason,
              message: 'AlphaAi owner access cannot be revoked — auto-restored to read_write',
              timestamp: payload.timestamp,
            },
          });
        } catch (auditError) {
          console.error('[AccessGuard] Audit log failed for owner protection:', auditError);
        }

        await ensureOwnerAccess(payload.userId);
        break;
      }

      console.log(
        `[TokenPay] Access REVOKED: ${payload.userId} ` +
        `${payload.previousLevel} → ${payload.newLevel} ` +
        `(reason: ${payload.reason})`
      );

      try {
        await auditLog({
          action: 'UPDATE',
          entityType: 'User',
          entityId: payload.userId,
          userId: payload.userId,
          changes: {
            accessLevel: {
              old: payload.previousLevel,
              new: payload.newLevel,
            },
          },
          metadata: {
            source: 'tokenpay-webhook',
            event: 'access.revoked',
            reason: payload.reason,
            proofId: payload.proofId || null,
            timestamp: payload.timestamp,
          },
        });
      } catch (auditError) {
        console.error('[TokenPay Callback] Audit log failed for access.revoked:', auditError);
      }
      break;

    case 'access.expiring':
      if (await isAlphaAiOwner(payload.userId)) {
        console.log(
          `[AccessGuard] Skipped expiry warning for AlphaAi owner ${payload.userId}. ` +
          `Owner has permanent access.`
        );
        break;
      }

      console.log(
        `[TokenPay] Access EXPIRING SOON: ${payload.userId} ` +
        `(level: ${payload.newLevel})`
      );
      break;
  }
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
