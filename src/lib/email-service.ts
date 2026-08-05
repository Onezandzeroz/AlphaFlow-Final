/**
 * Email Service for AlphaFlow Regnskab & Bogføring
 *
 * Features:
 * - SMTP transport (configurable via env vars)
 * - Dev mode: jsonTransport when no SMTP configured (logs to console)
 * - Helper functions for verification, password reset, invitation, owner notification
 * - Bilingual support (Danish/English)
 * - X-Email-Log-Id header for tracking
 * - EmailLog database entries for audit trail
 *
 * IMPORTANT: All env vars are read lazily at SEND TIME, not at module load.
 * Next.js may import this module during the build phase when .env vars
 * are not yet available. Module-level constants would be permanently
 * baked in to their default values.
 */

import { Prisma } from '@prisma/client';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  verificationEmailHtml,
  passwordResetHtml,
  invitationEmailHtml,
  ownerNotificationHtml,
  invoiceEmailHtml,
  subscriptionWelcomeHtml,
  paymentReceiptHtml,
  subscriptionCancelledHtml,
  paymentFailedHtml,
  preRenewalReminderHtml,
  termsChangeHtml,
  type SubscriptionWelcomeData,
  type PaymentReceiptData,
  type SubscriptionCancelledData,
  type PaymentFailedData,
  type PreRenewalReminderData,
  type TermsChangeData,
} from '@/lib/email-templates';

// ─── TYPES ────────────────────────────────────────────────────────

export type Language = 'da' | 'en';

// Template-union expanded in FASE 6 to cover all subscription-lifecycle emails
// required by the bank's payment-gateway compliance review.
export type EmailTemplate =
  | 'verification'
  | 'password-reset'
  | 'invitation'
  | 'owner-notification'
  | 'invoice'
  // FASE 6 — subscription lifecycle emails
  | 'subscription-welcome'        // (a) welcome/confirmation after subscription
  | 'payment-receipt'             // (d) receipt after each recurring charge
  | 'subscription-cancelled'      // (e) cancellation confirmation
  | 'payment-failed'              // (f) failed payment notification
  | 'pre-renewal-reminder'        // (c) reminder before renewal/binding expiry
  | 'pre-billing-reminder'        // (b) reminder before trial → paid conversion
  | 'terms-change-notice';        // (g)+(h) terms/service change notification

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  template: EmailTemplate;
  companyId?: string;
  metadata?: Record<string, unknown>;
  attachments?: Array<{
    filename: string;
    content: Buffer | Uint8Array;
    contentType?: string;
  }>;
}

// ─── LAZY ENV VARS ────────────────────────────────────────────────
// ALL process.env reads happen at CALL TIME, never at module load.
// Next.js imports modules during build when env vars may not be set,
// which would permanently lock values to their defaults.

function getEmailFrom(): string {
  return process.env.EMAIL_FROM || 'noreply@alphaai.dk';
}

function getAppUrl(): string {
  return process.env.APP_URL || 'http://localhost:3000';
}

// ─── TRANSPORT ────────────────────────────────────────────────────

interface TransportResult {
  transport: nodemailer.Transporter;
  isSmtpConfigured: boolean;
}

const _transportCache: { result: TransportResult | null; envSig: string | null } = {
  result: null,
  envSig: null,
};

let _transportLogged = false; // Log config once at startup, not on every send

function getTransport(): TransportResult {
  const sig = `${process.env.SMTP_HOST}|${process.env.SMTP_USER}|${process.env.SMTP_PASS}|${process.env.SMTP_PORT}`;
  // Re-use cached transport if env hasn't changed
  if (_transportCache.result && _transportCache.envSig === sig) {
    return _transportCache.result;
  }

  const configured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

  const result: TransportResult = configured
    ? {
        transport: nodemailer.createTransport({
          host: process.env.SMTP_HOST!,
          port: parseInt(process.env.SMTP_PORT || '587', 10),
          secure: parseInt(process.env.SMTP_PORT || '587', 10) === 465,
          pool: true,
          maxConnections: 5,
          maxMessages: 100,
          rateLimit: 10,
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 30000,
          auth: {
            user: process.env.SMTP_USER!,
            pass: process.env.SMTP_PASS!,
          },
        }),
        isSmtpConfigured: true,
      }
    : {
        transport: nodemailer.createTransport({ jsonTransport: true }),
        isSmtpConfigured: false,
      };

  // Log the email configuration (visible in production via warn)
  if (!_transportLogged) {
    if (configured) {
      logger.warn(`[EMAIL] ✅ SMTP configured — host=${process.env.SMTP_HOST} port=${process.env.SMTP_PORT || '587'} from=${getEmailFrom()} appUrl=${getAppUrl()}`);
    } else {
      logger.warn('[EMAIL] ⚠️ SMTP NOT configured — using dev mode (jsonTransport). No real emails will be sent. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env');
    }
    _transportLogged = true;
  }

  _transportCache.result = result;
  _transportCache.envSig = sig;
  return result;
}

// ─── CORE SEND ────────────────────────────────────────────────────

/**
 * Send an email and log it to the database.
 * In dev mode (no SMTP), emails are logged to console via jsonTransport.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<{ success: boolean; logId: string }> {
  const logId = crypto.randomUUID();

  let smtpResult: { info: unknown; isSmtpConfigured: boolean } | null = null;

  try {
    const { transport, isSmtpConfigured } = getTransport();
    const emailFrom = getEmailFrom();

    const info = await transport.sendMail({
      from: emailFrom,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      attachments: opts.attachments?.map(a => ({
        ...a,
        content: Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content),
      })),
      headers: {
        'X-Email-Log-Id': logId,
      },
    });

    // Store result for logging outside the DB write try/catch
    smtpResult = { info, isSmtpConfigured };

    const status: string = isSmtpConfigured ? 'sent' : 'dev-logged';

    // Log to database — fire-and-forget so DB latency doesn't block the response
    const logData = {
      id: logId,
      to: opts.to,
      subject: opts.subject,
      template: opts.template,
      status,
      metadata: (opts.metadata ?? null) as Prisma.InputJsonValue,
      companyId: opts.companyId ?? null,
    };
    db.emailLog.create({ data: logData }).catch((dbError) => {
      logger.warn(`[EMAIL] Email was ${status} but DB log write failed for logId=${logId}`, dbError);
    });

    // In dev mode, log the email to console for easy inspection
    if (!isSmtpConfigured) {
      const envelope = (info as unknown as Record<string, unknown>).message;
      logger.warn(`[EMAIL-DEV] To: ${opts.to}`, {
        subject: opts.subject,
        template: opts.template,
        logId,
        envelope,
      });
    }

    // Use warn for all email status so it's visible in production logs
    if (status === 'dev-logged') {
      logger.warn(`[EMAIL] ${status}: to=${opts.to} template=${opts.template} logId=${logId} from=${emailFrom}`);
    } else {
      logger.warn(`[EMAIL] ${status}: to=${opts.to} template=${opts.template} logId=${logId} from=${emailFrom}`);
    }

    return { success: true, logId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Log failure to database — fire-and-forget
    db.emailLog.create({
      data: {
        id: logId,
        to: opts.to,
        subject: opts.subject,
        template: opts.template,
        status: 'failed',
        errorMessage,
        metadata: (opts.metadata ?? null) as Prisma.InputJsonValue,
        companyId: opts.companyId ?? null,
      },
    }).catch((dbError) => {
      logger.error('[EMAIL] Failed to write email log:', dbError);
    });

    logger.error(`[EMAIL] ❌ Failed to send to=${opts.to} from=${getEmailFrom()}: ${errorMessage}`);
    return { success: false, logId };
  }
}

// ─── VERIFICATION EMAIL ───────────────────────────────────────────

export async function sendVerificationEmail(
  to: string,
  token: string,
  language: Language = 'da',
  companyId?: string
): Promise<{ success: boolean; logId: string }> {
  // IMPORTANT: The SPA lives at /login (not /). The verify token is read
  // from the URL query string by the SPA's client-side hydration.
  const verifyUrl = `${getAppUrl()}/login?verify=${token}`;
  const subject =
    language === 'da'
      ? 'Bekræft din e-mailadresse — AlphaFlow Regnskab & Bogføring'
      : 'Verify your email address — AlphaFlow Regnskab & Bogføring';

  return sendEmail({
    to,
    subject,
    html: verificationEmailHtml(language, verifyUrl),
    template: 'verification',
    companyId,
    metadata: { token, language },
  });
}

// ─── PASSWORD RESET EMAIL ─────────────────────────────────────────

export async function sendPasswordResetEmail(
  to: string,
  token: string,
  language: Language = 'da',
  companyId?: string
): Promise<{ success: boolean; logId: string }> {
  // IMPORTANT: The SPA lives at /login. The reset token is read from ?token=
  // (or ?reset=) by the SPA's client-side hydration. We use ?token= here.
  const resetUrl = `${getAppUrl()}/login?token=${token}`;
  const subject =
    language === 'da'
      ? 'Nulstil din adgangskode — AlphaFlow Regnskab & Bogføring'
      : 'Reset your password — AlphaFlow Regnskab & Bogføring';

  return sendEmail({
    to,
    subject,
    html: passwordResetHtml(language, resetUrl),
    template: 'password-reset',
    companyId,
    metadata: { token, language },
  });
}

// ─── INVITATION EMAIL ─────────────────────────────────────────────

export async function sendInvitationEmail(
  to: string,
  companyName: string,
  role: string,
  token: string,
  language: Language = 'da',
  companyId?: string,
  password?: string
): Promise<{ success: boolean; logId: string }> {
  // IMPORTANT: The SPA lives at /login (not /). The invite token is read
  // from the URL query string by the SPA's client-side hydration.
  const acceptUrl = `${getAppUrl()}/login?invite=${token}`;
  const subject =
    language === 'da'
      ? `Invitation til ${companyName} — AlphaFlow Regnskab & Bogføring`
      : `Invitation to ${companyName} — AlphaFlow Regnskab & Bogføring`;

  return sendEmail({
    to,
    subject,
    html: invitationEmailHtml(language, companyName, role, acceptUrl, password),
    template: 'invitation',
    companyId,
    metadata: { token, language, companyName, role, newUser: !!password },
  });
}

// ─── OWNER NOTIFICATION EMAIL ─────────────────────────────────────

export async function sendOwnerNotification(
  to: string,
  subject: string,
  bodyHtml: string,
  language: Language = 'da',
  metadata?: Record<string, unknown>
): Promise<{ success: boolean; logId: string }> {
  return sendEmail({
    to,
    subject: `🔔 ${subject} — AlphaFlow Regnskab & Bogføring`,
    html: ownerNotificationHtml(language, subject, bodyHtml),
    template: 'owner-notification',
    metadata,
  });
}

// ─── INVOICE EMAIL ─────────────────────────────────────────────

export async function sendInvoiceEmail(
  to: string,
  subject: string,
  message: string,
  pdfBuffer: Buffer | Uint8Array,
  invoiceNumber: string,
  companyName: string,
  language: Language = 'da',
  companyId?: string,
): Promise<{ success: boolean; logId: string }> {
  return sendEmail({
    to,
    subject,
    html: invoiceEmailHtml(language, companyName, invoiceNumber, message),
    template: 'invoice',
    companyId,
    metadata: { invoiceNumber, companyName },
    attachments: [
      {
        filename: `faktura-${invoiceNumber}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
}

// ═══════════════════════════════════════════════════════════════════
// FASE 6 — SUBSCRIPTION LIFECYCLE EMAILS
// ═══════════════════════════════════════════════════════════════════
// These functions cover all email types required by the bank's payment-
// gateway compliance review. Each is fire-and-forget safe — the caller
// does NOT need to await them, and any send failure is logged to EmailLog
// with status='failed' for retry/audit.
// ═══════════════════════════════════════════════════════════════════

// ─── (a) SUBSCRIPTION WELCOME / CONFIRMATION ───────────────────────
// Sent immediately after a paid plan is activated (post Flatpay payment
// success). Confirms the purchase, price, binding period, start date,
// and the terms version the user agreed to.

export async function sendSubscriptionWelcomeEmail(
  to: string,
  data: SubscriptionWelcomeData,
  language: Language = 'da',
  companyId?: string,
): Promise<{ success: boolean; logId: string }> {
  const subject = language === 'da'
    ? `Velkommen til AlphaFlow — dit ${data.planName}-abonnement er aktiveret`
    : `Welcome to AlphaFlow — your ${data.planName} subscription is active`;

  return sendEmail({
    to,
    subject,
    html: subscriptionWelcomeHtml(language, data),
    template: 'subscription-welcome',
    companyId,
    metadata: {
      planName: data.planName,
      monthlyPriceDKK: data.monthlyPriceDKK,
      bindingMonths: data.bindingMonths,
      totalAmountDKK: data.totalAmountDKK,
      termsVersion: data.termsVersion,
    },
  });
}

// ─── (d) PAYMENT RECEIPT ───────────────────────────────────────────
// Sent after each successful payment — both the initial subscription
// purchase AND every recurring renewal charge. The metadata.paymentId
// makes it possible to look up the receipt from the Payment record.

export async function sendPaymentReceiptEmail(
  to: string,
  data: PaymentReceiptData,
  language: Language = 'da',
  companyId?: string,
): Promise<{ success: boolean; logId: string }> {
  const subject = language === 'da'
    ? (data.isRenewal ? 'Kvittering på fornyelse af abonnement' : 'Betalingskvittering — AlphaFlow')
    : (data.isRenewal ? 'Subscription renewal receipt — AlphaFlow' : 'Payment receipt — AlphaFlow');

  // Generate PDF invoice and attach it
  let attachments: Array<{ filename: string; content: Buffer | Uint8Array; contentType?: string }> | undefined;
  try {
    const { generateInvoicePdf } = await import('@/lib/invoice-pdf');
    const pdfBytes = await generateInvoicePdf({
      planName: data.planName,
      amountExclVatDKK: data.amountDKK,
      vatDKK: data.vatDKK,
      totalDKK: data.totalDKK,
      paymentDate: new Date(data.paymentDate),
      paymentId: data.paymentId,
      period: data.period,
      isRenewal: data.isRenewal,
      customerCompanyName: data.customerCompanyName,
      customerEmail: data.customerEmail,
      customerCvr: data.customerCvr ?? null,
      customerAddress: data.customerAddress ?? null,
      cardLast4: data.cardLast4 ?? null,
    });
    const invNumber = `AF-${data.paymentId.slice(-8).toUpperCase()}`;
    attachments = [{
      filename: `Faktura-${invNumber}.pdf`,
      content: pdfBytes,
      contentType: 'application/pdf',
    }];
  } catch (pdfError) {
    logger.warn('[EMAIL] Failed to generate PDF invoice for receipt — sending email without attachment:', pdfError);
  }

  return sendEmail({
    to,
    subject,
    html: paymentReceiptHtml(language, data),
    template: 'payment-receipt',
    companyId,
    attachments,
    metadata: {
      paymentId: data.paymentId,
      planName: data.planName,
      totalDKK: data.totalDKK,
      isRenewal: data.isRenewal,
      paymentDate: data.paymentDate,
    },
  });
}

// ─── (e) SUBSCRIPTION CANCELLED ────────────────────────────────────
// Sent when the user (or admin) cancels a subscription. Confirms the
// cancellation and the access-until date (binding end or current period end).

export async function sendSubscriptionCancelledEmail(
  to: string,
  data: SubscriptionCancelledData,
  language: Language = 'da',
  companyId?: string,
): Promise<{ success: boolean; logId: string }> {
  const subject = language === 'da'
    ? 'Bekræftelse på opsigelse af dit AlphaFlow-abonnement'
    : 'Cancellation confirmation — AlphaFlow subscription';

  return sendEmail({
    to,
    subject,
    html: subscriptionCancelledHtml(language, data),
    template: 'subscription-cancelled',
    companyId,
    metadata: {
      planName: data.planName,
      reason: data.reason,
      accessUntilDate: data.accessUntilDate,
    },
  });
}

// ─── (f) PAYMENT FAILED ────────────────────────────────────────────
// Sent when a renewal payment fails (Frisbii invoice_failed event).
// Includes retry info and a link to update the payment method.

export async function sendPaymentFailedEmail(
  to: string,
  data: PaymentFailedData,
  language: Language = 'da',
  companyId?: string,
): Promise<{ success: boolean; logId: string }> {
  const subject = language === 'da'
    ? 'Betaling mislykkedes — handling kræves'
    : 'Payment failed — action required';

  return sendEmail({
    to,
    subject,
    html: paymentFailedHtml(language, data),
    template: 'payment-failed',
    companyId,
    metadata: {
      planName: data.planName,
      amountDKK: data.amountDKK,
      retryDate: data.retryDate,
    },
  });
}

// ─── (c) PRE-RENEWAL REMINDER ──────────────────────────────────────
// Sent X days before a binding period ends or before a monthly recurring
// renewal. The billing-scheduler calls this with daysUntilRenewal ∈
// {14, 7, 3, 1} — and the Company.lastReminderSentAt field prevents
// duplicate sends within the same window.

export async function sendPreRenewalReminderEmail(
  to: string,
  data: PreRenewalReminderData,
  language: Language = 'da',
  companyId?: string,
): Promise<{ success: boolean; logId: string }> {
  const subject = language === 'da'
    ? `Påmindelse: Dit AlphaFlow-abonnement ${data.isAutoRenew ? 'fornyes' : 'udløber'} om ${data.daysUntilRenewal} ${data.daysUntilRenewal === 1 ? 'dag' : 'dage'}`
    : `Reminder: Your AlphaFlow subscription ${data.isAutoRenew ? 'renews' : 'expires'} in ${data.daysUntilRenewal} ${data.daysUntilRenewal === 1 ? 'day' : 'days'}`;

  return sendEmail({
    to,
    subject,
    html: preRenewalReminderHtml(language, data),
    template: 'pre-renewal-reminder',
    companyId,
    metadata: {
      planName: data.planName,
      renewalDate: data.renewalDate,
      daysUntilRenewal: data.daysUntilRenewal,
      isAutoRenew: data.isAutoRenew,
    },
  });
}

// ─── (b) PRE-BILLING REMINDER (trial → paid conversion) ────────────
// Sent before a free trial converts to a paid subscription. Currently the
// AlphaFlow platform uses a revenue-gated Free tier (not a time-limited
// trial), so this function is wired up for future use and parity with
// the bank's checklist. Reuses pre-renewal template with isAutoRenew=true.

export async function sendPreBillingReminderEmail(
  to: string,
  data: PreRenewalReminderData,
  language: Language = 'da',
  companyId?: string,
): Promise<{ success: boolean; logId: string }> {
  const subject = language === 'da'
    ? `Din prøveperiode konverteres til betalt abonnement om ${data.daysUntilRenewal} ${data.daysUntilRenewal === 1 ? 'dag' : 'dage'}`
    : `Your trial converts to a paid subscription in ${data.daysUntilRenewal} ${data.daysUntilRenewal === 1 ? 'day' : 'days'}`;

  return sendEmail({
    to,
    subject,
    html: preRenewalReminderHtml(language, { ...data, isAutoRenew: true }),
    template: 'pre-billing-reminder',
    companyId,
    metadata: {
      planName: data.planName,
      renewalDate: data.renewalDate,
      daysUntilRenewal: data.daysUntilRenewal,
      isAutoRenew: true,
    },
  });
}

// ─── (g)+(h) TERMS CHANGE NOTIFICATION ─────────────────────────────
// Broadcast to all active subscribers when the terms-of-service version
// changes. The caller (admin script or oversight UI) supplies the summary
// of changes as HTML bullet points. This is the legally-required notice
// for material changes under Forbrugeraftaleloven §14.

export async function sendTermsChangeEmail(
  to: string,
  data: TermsChangeData,
  language: Language = 'da',
  companyId?: string,
): Promise<{ success: boolean; logId: string }> {
  const subject = language === 'da'
    ? 'Vigtigt: Ændringer af vores forretningsbetingelser'
    : 'Important: Changes to our terms of service';

  return sendEmail({
    to,
    subject,
    html: termsChangeHtml(language, data),
    template: 'terms-change-notice',
    companyId,
    metadata: {
      oldVersion: data.oldVersion,
      newVersion: data.newVersion,
      effectiveDate: data.effectiveDate,
    },
  });
}
