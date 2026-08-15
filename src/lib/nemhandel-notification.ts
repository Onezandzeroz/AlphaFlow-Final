/**
 * NemHandel Customer Notification Utility
 *
 * Implements Erhvervsstyrelsen compliance requirements:
 *   Bilag 2, Row 47 (Krav 8): The digital bookkeeping system MUST notify
 *     existing AND new customers about the possibility of being registered
 *     in NemHandelsregisteret.
 *   Bilag 2, Row 48 (Krav 9): The system MUST at setup, or via direct message
 *     to existing customers, be able to show information about and enrollment
 *     functionality for the NemHandelsregisteret.
 *
 * Two entry points:
 *
 * 1. `notifyNewCustomerAboutNemHandel(userId, email, companyId)` — called
 *    immediately after a new user registers (see api/auth/register/route.ts).
 *    Fire-and-forget; never throws.
 *
 * 2. `notifyExistingCustomersAboutNemHandel(companyIds?)` — invoked by the
 *    SuperDev-only oversight endpoint at /api/oversight/notify-nemhandel.
 *    Sends the notice to the OWNER of each active company. Returns the count
 *    of emails successfully dispatched.
 *
 * Both functions log an AuditLog entry (action: CREATE on the Company entity
 * with metadata describing the notice send) so the dispatch is fully traceable
 * for compliance review. EmailLog rows are written automatically by the
 * underlying sendEmail() in email-service.ts.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditLog } from '@/lib/audit';
import { sendNemHandelNoticeEmail, type Language } from '@/lib/email-service';

// ─── Helpers ────────────────────────────────────────────────────────

function getAppUrl(): string {
  return process.env.APP_URL || 'http://localhost:3000';
}

// ─── 1. NEW CUSTOMER NOTIFICATION ───────────────────────────────────

/**
 * Send the NemHandel registration notice to a freshly-registered customer.
 *
 * This fulfils Bilag 2, Row 47 (Krav 8) — the system MUST notify NEW
 * customers at registration time about the possibility of being enrolled
 * in NemHandelsregisteret.
 *
 * Safe to call fire-and-forget: never throws to the caller. All errors are
 * caught and logged via the logger. A successful dispatch is recorded in the
 * AuditLog (action: CREATE, entityType: Company) and in the EmailLog
 * (handled automatically by sendEmail()).
 *
 * @param userId    The newly created user's ID
 * @param email     The user's email address (recipient)
 * @param companyId The newly created company's ID (used for tenant scoping)
 */
export async function notifyNewCustomerAboutNemHandel(
  userId: string,
  email: string,
  companyId: string,
): Promise<void> {
  try {
    // Default language is Danish — the User model has no preferredLanguage
    // field yet; new registrations always start in 'da'. When a language
    // preference is added later, read it here.
    const language: Language = 'da';

    const appUrl = getAppUrl();

    const result = await sendNemHandelNoticeEmail(
      email,
      { appUrl, settingsPath: '/settings-edelivery' },
      language,
      companyId,
      { trigger: 'new_customer_registration' },
    );

    // Audit the dispatch — Bilag 2 compliance traceability. We log on both
    // success and failure so the oversight team can confirm every new
    // customer received (or failed to receive) the notice.
    await auditLog({
      action: 'CREATE',
      entityType: 'Company',
      entityId: companyId,
      userId,
      companyId,
      performedByUserId: userId,
      metadata: {
        type: 'nemhandel_registration_notice_sent',
        trigger: 'new_customer_registration',
        recipientEmail: email,
        language,
        emailLogId: result.logId,
        emailSuccess: result.success,
      },
    });

    if (!result.success) {
      logger.warn(
        `[NEMHANDEL-NOTIFY] New-customer notice FAILED for userId=${userId} companyId=${companyId} email=${email} logId=${result.logId}`,
      );
    } else {
      logger.warn(
        `[NEMHANDEL-NOTIFY] New-customer notice sent to ${email} (companyId=${companyId}, logId=${result.logId})`,
      );
    }
  } catch (error) {
    // NEVER throw to the caller — registration flow must not be blocked.
    logger.error(
      `[NEMHANDEL-NOTIFY] Unexpected error while notifying new customer userId=${userId} companyId=${companyId}:`,
      error,
    );
  }
}

// ─── 2. EXISTING CUSTOMERS BATCH NOTIFICATION ───────────────────────

interface ExistingCustomerRecipient {
  companyId: string;
  companyName: string;
  ownerId: string;
  ownerEmail: string;
}

/**
 * Resolve the OWNER of each active company for batch notification.
 *
 * - If `companyIds` is provided, only those companies are considered
 *   (still filtered to active + non-demo + with an OWNER).
 * - If `companyIds` is omitted/empty, all active companies are considered.
 *
 * Demo companies and companies without an OWNER are skipped.
 */
async function resolveExistingCustomerRecipients(
  companyIds?: string[],
): Promise<ExistingCustomerRecipient[]> {
  const where: Record<string, unknown> = {
    isActive: true,
    isDemo: false,
  };
  if (companyIds && companyIds.length > 0) {
    where.id = { in: companyIds };
  }

  const companies = await db.company.findMany({
    where,
    select: {
      id: true,
      name: true,
      einvoiceEnabled: true,
      members: {
        where: { role: 'OWNER' },
        select: {
          userId: true,
          user: {
            select: {
              id: true,
              email: true,
              deactivatedAt: true,
            },
          },
        },
      },
    },
  });

  const recipients: ExistingCustomerRecipient[] = [];
  for (const c of companies) {
    for (const m of c.members) {
      // Skip deactivated owners (account disabled but data retained per
      // Bogføringsloven §10-12).
      if (m.user.deactivatedAt) continue;
      recipients.push({
        companyId: c.id,
        companyName: c.name,
        ownerId: m.user.id,
        ownerEmail: m.user.email,
      });
    }
  }
  return recipients;
}

/**
 * Send the NemHandel registration notice to existing customers in batch.
 *
 * This fulfils Bilag 2, Row 47 (Krav 8) — the system MUST notify EXISTING
 * customers after the system is registered with Erhvervsstyrelsen.
 *
 * Also fulfils Bilag 2, Row 48 (Krav 9) — the system MUST be able to show
 * information about NemHandelsregisteret enrollment via a direct message
 * to existing customers.
 *
 * Each send is wrapped in try/catch and never throws. Each dispatch is
 * recorded in the AuditLog and EmailLog. Returns the count of emails
 * successfully dispatched.
 *
 * @param companyIds Optional list of company IDs to target. If omitted/empty,
 *                   all active non-demo companies with an OWNER are notified.
 */
export async function notifyExistingCustomersAboutNemHandel(
  companyIds?: string[],
): Promise<{ notified: number; attempted: number; skipped: number }> {
  const appUrl = getAppUrl();
  const language: Language = 'da';

  let recipients: ExistingCustomerRecipient[] = [];
  try {
    recipients = await resolveExistingCustomerRecipients(companyIds);
  } catch (error) {
    logger.error(
      '[NEMHANDEL-NOTIFY] Failed to resolve existing customer recipients:',
      error,
    );
    return { notified: 0, attempted: 0, skipped: 0 };
  }

  if (recipients.length === 0) {
    logger.warn(
      '[NEMHANDEL-NOTIFY] No existing customer recipients found for batch notify.',
    );
    return { notified: 0, attempted: 0, skipped: 0 };
  }

  let notified = 0;
  let attempted = 0;
  let skipped = 0;

  // Sequential send to avoid overwhelming the SMTP pool. Each recipient
  // gets its own try/catch so a single failure does not abort the batch.
  for (const r of recipients) {
    attempted++;
    try {
      const result = await sendNemHandelNoticeEmail(
        r.ownerEmail,
        { appUrl, settingsPath: '/settings-edelivery' },
        language,
        r.companyId,
        {
          trigger: 'existing_customer_batch',
          companyName: r.companyName,
        },
      );

      // Audit each dispatch — Bilag 2 traceability.
      await auditLog({
        action: 'CREATE',
        entityType: 'Company',
        entityId: r.companyId,
        userId: r.ownerId,
        companyId: r.companyId,
        // SuperDev is the actor for batch sends — but we don't have their
        // userId here. Use the owner as the performedBy fallback; the
        // metadata.trigger makes the SuperDev batch context clear.
        performedByUserId: r.ownerId,
        metadata: {
          type: 'nemhandel_registration_notice_sent',
          trigger: 'existing_customer_batch',
          recipientEmail: r.ownerEmail,
          companyName: r.companyName,
          language,
          emailLogId: result.logId,
          emailSuccess: result.success,
        },
      });

      if (result.success) {
        notified++;
      } else {
        skipped++;
        logger.warn(
          `[NEMHANDEL-NOTIFY] Batch send reported failure for companyId=${r.companyId} email=${r.ownerEmail} logId=${result.logId}`,
        );
      }
    } catch (error) {
      skipped++;
      logger.error(
        `[NEMHANDEL-NOTIFY] Batch send threw for companyId=${r.companyId} email=${r.ownerEmail}:`,
        error,
      );
    }
  }

  logger.warn(
    `[NEMHANDEL-NOTIFY] Batch complete — attempted=${attempted} notified=${notified} skipped=${skipped}`,
  );

  return { notified, attempted, skipped };
}
