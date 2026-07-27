/**
 * Consent helpers (FASE 6)
 *
 * Functions for recording and querying explicit user consent. Used by
 * /api/subscription/create-payment to log the RECURRING_BILLING consent
 * before creating a Flatpay payment session, and by the cancel route to
 * log consent withdrawal.
 *
 * Each consent event is written to ConsentLog with:
 *   - userId, companyId — who and which tenant
 *   - consentType — TERMS_OF_SERVICE | RECURRING_BILLING | PRIVACY_POLICY | MARKETING
 *   - consentVersion — the version of the document the user agreed to
 *   - consentIp, consentUserAgent — for forensic evidence
 *   - paymentId — optional link to the Payment the consent authorized
 *
 * The ConsentLog table is append-only by convention (see audit-immutability
 * for the pattern). Withdrawing consent sets withdrawnAt — we never delete
 * the original consent record.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getClientIp } from '@/lib/rate-limit';
import type { NextRequest } from 'next/server';
import type { ConsentType } from '@prisma/client';

export interface RecordConsentOptions {
  userId: string;
  companyId: string;
  consentType: ConsentType;
  consentVersion: string;
  request?: NextRequest;            // for IP + user-agent extraction
  paymentId?: string;               // optional link to a Payment
  metadata?: Record<string, unknown>;
}

/**
 * Record an explicit consent event. Returns the created ConsentLog row id.
 * Throws on DB errors (the caller should decide whether to fail the request
 * or proceed — for billing consent we fail the request, since a payment
 * without logged consent is non-compliant).
 */
export async function recordConsent(opts: RecordConsentOptions): Promise<string> {
  const consentIp = opts.request ? getClientIp(opts.request) : null;
  const consentUserAgent = opts.request?.headers.get('user-agent') ?? null;

  const consent = await db.consentLog.create({
    data: {
      userId: opts.userId,
      companyId: opts.companyId,
      consentType: opts.consentType,
      consentVersion: opts.consentVersion,
      consentIp,
      consentUserAgent,
      paymentId: opts.paymentId ?? null,
    },
  });

  logger.info(
    `[CONSENT] Recorded ${opts.consentType} v${opts.consentVersion} for user ${opts.userId} (company ${opts.companyId}, payment ${opts.paymentId ?? 'n/a'}) — IP ${consentIp}`,
  );

  return consent.id;
}

/**
 * Withdraw a previously-given consent. Sets withdrawnAt on the most recent
 * active consent of the given type for the user. Does NOT delete the record
 * (we keep the audit trail of when consent was given AND when it was
 * withdrawn — required for legal evidence).
 */
export async function withdrawConsent(
  userId: string,
  consentType: ConsentType,
): Promise<void> {
  // Find the most recent active (non-withdrawn) consent of this type
  const latest = await db.consentLog.findFirst({
    where: {
      userId,
      consentType,
      withdrawnAt: null,
    },
    orderBy: { consentedAt: 'desc' },
    select: { id: true },
  });

  if (!latest) {
    logger.info(`[CONSENT] No active ${consentType} consent to withdraw for user ${userId}`);
    return;
  }

  await db.consentLog.update({
    where: { id: latest.id },
    data: { withdrawnAt: new Date() },
  });

  logger.info(`[CONSENT] Withdrew ${consentType} consent (id ${latest.id}) for user ${userId}`);
}

/**
 * Verify that a user has given the required consent type, with the current
 * terms version, and has not withdrawn it. Returns true if valid consent
 * exists, false otherwise. Used by access guards that require active consent.
 */
export async function hasValidConsent(
  userId: string,
  consentType: ConsentType,
  requiredVersion?: string,
): Promise<boolean> {
  const latest = await db.consentLog.findFirst({
    where: {
      userId,
      consentType,
      withdrawnAt: null,
    },
    orderBy: { consentedAt: 'desc' },
    select: { consentVersion: true },
  });

  if (!latest) return false;
  if (requiredVersion && latest.consentVersion !== requiredVersion) return false;
  return true;
}
