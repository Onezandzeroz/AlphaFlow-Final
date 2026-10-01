/**
 * VAT Submission Module — Skattestyrelsen RSU B2B SOAP Integration
 *
 * Handles VAT report preparation and submission to Skattestyrelsen
 * (Danish Tax Authority) via the RSU B2B SOAP web service gateway (NemVirksomhed).
 *
 * Architecture:
 *   - 3 SOAP services: VirksomhedKalenderHent, ModtagMomsangivelseForeloebig,
 *     MomsangivelseKvitteringHent
 *   - Authentication: mutual TLS (mTLS) with VOCES3 System (S1) certificate
 *     + WS-Security XML signature
 *   - Format: SOAP 1.1 document/literal XML
 *   - Flow: submit DRAFT → user approves via MitID on TastSelv → fetch receipt
 *
 * The RSU (AlphaFlow) submits a DRAFT. The legal entity (customer company)
 * must approve it via MitID on TastSelv Erhverv through the returned deep link.
 *
 * When SKAT mTLS credentials are not configured, the module runs in simulation
 * mode so the full UI flow can be tested.
 *
 * Exports:
 *   - prepareVATSubmission(companyId, year, period, userId)
 *   - submitVATToSkat(submissionId, userId)
 *   - fetchVATReceipt(submissionId, userId)   — poll for receipt after approval
 *   - getVATSubmissions(companyId, year?)
 *   - getQuarterDates(year, period)
 */

import { db } from '@/lib/db';
import { computeVATRegister } from '@/lib/vat-utils';
import { auditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import {
  submitModtagMomsangivelseForeloebig,
  getMomsangivelseKvitteringHent,
  mapVatRegisterToSkatFields,
  hasSkatCredentials,
  SkatApiError,
} from '@/lib/skat-soap-client';

// ─── Types ────────────────────────────────────────────────────────────────

export type VATReportingPeriod = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'YEARLY';

// ─── Quarter Date Helpers ──────────────────────────────────────────────────

/**
 * Returns the date range for a given reporting period.
 *
 * @param year - Fiscal year
 * @param period - Q1, Q2, Q3, Q4, or YEARLY
 * @returns Object with from and to dates
 */
export function getQuarterDates(
  year: number,
  period: VATReportingPeriod,
): { from: Date; to: Date } {
  switch (period) {
    case 'Q1':
      return {
        from: new Date(year, 0, 1),
        to: new Date(year, 2, 31, 23, 59, 59, 999),
      };
    case 'Q2':
      return {
        from: new Date(year, 3, 1),
        to: new Date(year, 5, 30, 23, 59, 59, 999),
      };
    case 'Q3':
      return {
        from: new Date(year, 6, 1),
        to: new Date(year, 8, 30, 23, 59, 59, 999),
      };
    case 'Q4':
      return {
        from: new Date(year, 9, 1),
        to: new Date(year, 11, 31, 23, 59, 59, 999),
      };
    case 'YEARLY':
      return {
        from: new Date(year, 0, 1),
        to: new Date(year, 11, 31, 23, 59, 59, 999),
      };
    default:
      throw new Error(`Invalid period: ${period}`);
  }
}

// ─── Core: Prepare VAT Submission ──────────────────────────────────────────

/**
 * Prepare a VAT submission record by computing the VAT register for the
 * given period and storing it as a DRAFT.
 *
 * @param companyId - Company database ID
 * @param year - Fiscal year
 * @param period - Q1, Q2, Q3, Q4, or YEARLY
 * @param userId - User preparing the submission
 * @returns The created VATSubmission record
 */
export async function prepareVATSubmission(
  companyId: string,
  year: number,
  period: VATReportingPeriod,
  userId: string,
) {
  const { from, to } = getQuarterDates(year, period);

  // Compute the VAT register for the period
  // computeVATRegister takes a whereClause (same shape as db.journalEntry.findMany)
  const vatRegister = await computeVATRegister({
    companyId,
    status: 'POSTED',
    cancelled: false,
    date: { gte: from, lte: to },
  });

  // Check for existing submission
  const existing = await db.vATSubmission.findUnique({
    where: { companyId_year_period: { companyId, year, period } },
  });

  if (existing && existing.status === 'SUBMITTED') {
    throw new Error(
      `VAT_SUBMISSION_EXISTS: A submission for ${year} ${period} already exists with status ${existing.status}.`,
    );
  }

  // Create or update the submission record
  const submission = await db.vATSubmission.upsert({
    where: { companyId_year_period: { companyId, year, period } },
    create: {
      year,
      period,
      periodFrom: from,
      periodTo: to,
      totalOutputVAT: vatRegister.totalOutputVAT,
      totalInputVAT: vatRegister.totalInputVAT,
      netVATPayable: vatRegister.netVATPayable,
      vatDataJson: {
        outputVAT: vatRegister.outputVAT,
        inputVAT: vatRegister.inputVAT,
        totalOutputVAT: vatRegister.totalOutputVAT,
        totalInputVAT: vatRegister.totalInputVAT,
        netVATPayable: vatRegister.netVATPayable,
        totalRevenue: vatRegister.totalRevenue,
        totalExpenses: vatRegister.totalExpenses,
        computedAt: new Date().toISOString(),
        periodFrom: from.toISOString(),
        periodTo: to.toISOString(),
      },
      status: 'DRAFT',
      companyId,
    },
    update: {
      periodFrom: from,
      periodTo: to,
      totalOutputVAT: vatRegister.totalOutputVAT,
      totalInputVAT: vatRegister.totalInputVAT,
      netVATPayable: vatRegister.netVATPayable,
      vatDataJson: {
        outputVAT: vatRegister.outputVAT,
        inputVAT: vatRegister.inputVAT,
        totalOutputVAT: vatRegister.totalOutputVAT,
        totalInputVAT: vatRegister.totalInputVAT,
        netVATPayable: vatRegister.netVATPayable,
        totalRevenue: vatRegister.totalRevenue,
        totalExpenses: vatRegister.totalExpenses,
        computedAt: new Date().toISOString(),
        periodFrom: from.toISOString(),
        periodTo: to.toISOString(),
      },
      status: 'DRAFT',
      // Clear any previous submission artifacts when re-preparing
      referenceId: null,
      responseXml: null,
      errorMessage: null,
      errorCode: null,
      transactionIdentifier: null,
      deepLink: null,
      receiptPdfBase64: null,
      advisoryCode: null,
    },
  });

  // Audit log
  await auditLog({
    action: 'CREATE',
    entityType: 'VATSubmission',
    entityId: submission.id,
    userId,
    companyId,
    changes: {
      year: { old: null, new: year },
      period: { old: null, new: period },
      netVATPayable: { old: null, new: vatRegister.netVATPayable },
    },
    metadata: {
      source: 'computeVATRegister',
      outputVATCodes: vatRegister.outputVAT.map(v => v.code),
      inputVATCodes: vatRegister.inputVAT.map(v => v.code),
    },
  });

  logger.info(
    `[VAT-Submit] Prepared VAT submission: ${year} ${period}, ` +
    `Output: ${vatRegister.totalOutputVAT}, Input: ${vatRegister.totalInputVAT}, ` +
    `Net: ${vatRegister.netVATPayable}`,
  );

  return submission;
}

// ─── Core: Submit VAT to Skattestyrelsen via SOAP ─────────────────────────

/**
 * Submit a VAT report DRAFT to Skattestyrelsen via the RSU B2B SOAP gateway.
 *
 * Calls ModtagMomsangivelseForeloebig with the 17 VAT field values mapped
 * from AlphaFlow's VAT register. Returns a deep link to TastSelv Erhverv
 * where the user must approve the draft with MitID.
 *
 * Flow:
 *   1. Validate submission is in DRAFT status
 *   2. Get company SE-number (CVR)
 *   3. Map VAT register data to the 17 SKAT MomsAngivelse fields
 *   4. Call ModtagMomsangivelseForeloebig via SOAP (or simulation mode)
 *   5. Store transactionIdentifier + deepLink + advisoryCode
 *   6. Update status to SUBMITTED (awaiting user approval)
 *
 * @param submissionId - The VATSubmission database ID
 * @param userId - User performing the action
 * @returns Updated VATSubmission record with deepLink
 */
export async function submitVATToSkat(
  submissionId: string,
  userId: string,
) {
  // Fetch the submission
  const submission = await db.vATSubmission.findUnique({
    where: { id: submissionId },
  });

  if (!submission) {
    throw new Error(`VAT_SUBMISSION_NOT_FOUND: Submission ${submissionId} not found.`);
  }

  if (submission.status !== 'DRAFT') {
    throw new Error(
      `VAT_SUBMISSION_NOT_DRAFT: Submission ${submissionId} has status ${submission.status}. ` +
      `Only DRAFT submissions can be submitted.`,
    );
  }

  // Get company CVR (used as SE-number for SKAT)
  const company = await db.company.findUnique({
    where: { id: submission.companyId },
    select: { cvrNumber: true, name: true },
  });

  const seNumber = company?.cvrNumber || '';
  if (!seNumber) {
    throw new Error(
      'COMPANY_SE_NUMBER_MISSING: The company has no CVR/SE-number. ' +
      'A valid SE-number is required to submit VAT to Skattestyrelsen.',
    );
  }

  // Map VAT register data to the 17 SKAT MomsAngivelse fields
  const vatFields = mapVatRegisterToSkatFields({
    totalOutputVAT: Number(submission.totalOutputVAT),
    totalInputVAT: Number(submission.totalInputVAT),
    netVATPayable: Number(submission.netVATPayable),
    outputVAT: (submission.vatDataJson as Record<string, unknown>)?.outputVAT as Array<{ code: string; netAmount: number }> | undefined,
    inputVAT: (submission.vatDataJson as Record<string, unknown>)?.inputVAT as Array<{ code: string; netAmount: number }> | undefined,
  });

  const formatDate = (d: Date) => d.toISOString().split('T')[0];
  const periodFrom = formatDate(submission.periodFrom);
  const periodTo = formatDate(submission.periodTo);

  let newStatus: 'SUBMITTED' | 'ERROR' = 'SUBMITTED';
  let errorMessage: string | null = null;
  let errorCode: string | null = null;
  let transactionIdentifier: string | null = null;
  let deepLink: string | null = null;
  let advisoryCode: string | null = null;
  let responseXml: string | null = null;
  let referenceId: string | null = null;

  try {
    // Call ModtagMomsangivelseForeloebig via SOAP (or simulation mode)
    const result = await submitModtagMomsangivelseForeloebig(
      seNumber,
      periodFrom,
      periodTo,
      vatFields,
    );

    transactionIdentifier = result.transactionIdentifier;
    deepLink = result.deepLink;
    advisoryCode = result.advisoryCode;
    responseXml = result.responseXml;
    // referenceId = transactionIdentifier (for backward compat with UI)
    referenceId = result.transactionIdentifier;

    logger.info(
      `[VAT-Submit] DRAFT submitted to SKAT: ${submission.year} ${submission.period}, ` +
      `txId=${transactionIdentifier}, advisory=${advisoryCode}, ` +
      `deepLink=${deepLink ? 'yes' : 'no'}, simulated=${!hasSkatCredentials()}`,
    );
  } catch (error) {
    newStatus = 'ERROR';
    if (error instanceof SkatApiError) {
      errorCode = error.code;
      errorMessage = error.message;
    } else {
      errorCode = 'SUBMISSION_FAILED';
      errorMessage = error instanceof Error ? error.message : 'Unknown error during submission';
    }

    logger.error(
      `[VAT-Submit] Submission error [${errorCode}]: ${errorMessage}`,
      error,
    );
  }

  // Update the submission record
  const updatedSubmission = await db.vATSubmission.update({
    where: { id: submissionId },
    data: {
      status: newStatus,
      submittedAt: new Date(),
      submittedBy: userId,
      referenceId,
      responseXml,
      errorMessage,
      errorCode,
      transactionIdentifier,
      deepLink,
      advisoryCode,
    },
  });

  // Audit log
  await auditLog({
    action: 'UPDATE',
    entityType: 'VATSubmission',
    entityId: submissionId,
    userId,
    companyId: submission.companyId,
    changes: {
      status: { old: 'DRAFT', new: newStatus },
      transactionIdentifier: { old: null, new: transactionIdentifier },
      deepLink: { old: null, new: deepLink ? '[URL]' : null },
    },
    metadata: {
      year: submission.year,
      period: submission.period,
      netVATPayable: submission.netVATPayable,
      seNumber,
      simulated: !hasSkatCredentials(),
      advisoryCode,
    },
  });

  logger.info(
    `[VAT-Submit] VAT submission ${newStatus}: ${submission.year} ${submission.period}, ` +
    `txId: ${transactionIdentifier}, Net: ${submission.netVATPayable}`,
  );

  return updatedSubmission;
}

// ─── Core: Fetch VAT Receipt (after user approval) ─────────────────────────

/**
 * Fetch the VAT receipt from Skattestyrelsen via MomsangivelseKvitteringHent.
 *
 * This should be called AFTER the user has approved the draft in TastSelv
 * Erhverv via the deep link. If the draft has not yet been approved, SKAT
 * returns error code 4810 and this function returns the submission with
 * status still SUBMITTED.
 *
 * @param submissionId - The VATSubmission database ID
 * @param userId - User fetching the receipt
 * @returns Updated VATSubmission record with receiptPdfBase64 if approved
 */
export async function fetchVATReceipt(
  submissionId: string,
  userId: string,
) {
  const submission = await db.vATSubmission.findUnique({
    where: { id: submissionId },
  });

  if (!submission) {
    throw new Error(`VAT_SUBMISSION_NOT_FOUND: Submission ${submissionId} not found.`);
  }

  if (!submission.transactionIdentifier) {
    throw new Error(
      'VAT_SUBMISSION_NO_TRANSACTION_ID: This submission has no transactionIdentifier. ' +
      'Cannot fetch receipt — the draft was not successfully submitted.',
    );
  }

  if (submission.status !== 'SUBMITTED' && submission.status !== 'ACCEPTED') {
    throw new Error(
      `VAT_SUBMISSION_NOT_SUBMITTED: Submission ${submissionId} has status ${submission.status}. ` +
      `Receipt can only be fetched for SUBMITTED submissions.`,
    );
  }

  let newStatus: 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | 'ERROR' = submission.status;
  let errorMessage: string | null = submission.errorMessage;
  let errorCode: string | null = submission.errorCode;
  let receiptPdfBase64: string | null = submission.receiptPdfBase64;

  try {
    const result = await getMomsangivelseKvitteringHent(submission.transactionIdentifier);

    if (result.approved) {
      newStatus = 'ACCEPTED';
      receiptPdfBase64 = result.receiptPdfBase64;
      logger.info(
        `[VAT-Submit] Receipt fetched: ${submission.year} ${submission.period}, ` +
        `txId=${submission.transactionIdentifier}, hasPdf=${!!result.receiptPdfBase64}`,
      );
    } else if (result.errorCode === '4810') {
      // Not yet approved — keep status as SUBMITTED
      newStatus = 'SUBMITTED';
      logger.info(
        `[VAT-Submit] Receipt not yet available (4810 — user has not approved yet): ` +
        `${submission.year} ${submission.period}`,
      );
    } else if (result.errorCode === '4811') {
      // Rejected
      newStatus = 'REJECTED';
      errorMessage = 'VAT submission was rejected in TastSelv Erhverv.';
      errorCode = '4811';
      logger.warn(
        `[VAT-Submit] Receipt rejected (4811): ${submission.year} ${submission.period}`,
      );
    } else {
      // Other error
      newStatus = 'ERROR';
      errorMessage = `SKAT receipt error: ${result.errorCode}`;
      errorCode = result.errorCode;
      logger.error(
        `[VAT-Submit] Receipt error [${result.errorCode}]: ${submission.year} ${submission.period}`,
      );
    }
  } catch (error) {
    newStatus = 'ERROR';
    if (error instanceof SkatApiError) {
      errorCode = error.code;
      errorMessage = error.message;
    } else {
      errorCode = 'RECEIPT_FETCH_FAILED';
      errorMessage = error instanceof Error ? error.message : 'Unknown error during receipt fetch';
    }

    logger.error(`[VAT-Submit] Receipt fetch error:`, error);
  }

  // Update the submission record
  const updatedSubmission = await db.vATSubmission.update({
    where: { id: submissionId },
    data: {
      status: newStatus,
      receiptPdfBase64,
      errorMessage,
      errorCode,
    },
  });

  // Audit log
  await auditLog({
    action: 'UPDATE',
    entityType: 'VATSubmission',
    entityId: submissionId,
    userId,
    companyId: submission.companyId,
    changes: {
      status: { old: submission.status, new: newStatus },
      receiptFetched: { old: !!submission.receiptPdfBase64, new: !!receiptPdfBase64 },
    },
    metadata: {
      year: submission.year,
      period: submission.period,
      transactionIdentifier: submission.transactionIdentifier,
      simulated: !hasSkatCredentials(),
    },
  });

  return updatedSubmission;
}

// ─── Core: Get VAT Submissions ───────────────────────────────────────────

/**
 * List VAT submissions for a company, optionally filtered by year.
 *
 * @param companyId - Company database ID
 * @param year - Optional year filter
 * @returns Array of VATSubmission records, ordered by most recent first
 */
export async function getVATSubmissions(
  companyId: string,
  year?: number,
) {
  const where: Record<string, unknown> = { companyId };

  if (year) {
    where.year = year;
  }

  const submissions = await db.vATSubmission.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  return submissions;
}
