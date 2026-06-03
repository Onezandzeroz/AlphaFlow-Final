/**
 * VAT Submission Module — Skattestyrelsen Moms-API Integration
 *
 * Handles VAT report preparation and submission to Skattestyrelsen
 * (Danish Tax Authority) via their REST API (NemVirksomhed).
 *
 * Features:
 *   - OAuth2 token management (client_credentials grant)
 *   - Prepare VAT submission data from computeVATRegister()
 *   - Submit to Skattestyrelsen Moms-API
 *   - Quarterly reporting periods (Q1-Q4) and YEARLY
 *   - Store submissions in VATSubmission model (Prisma)
 *   - Audit logging
 *
 * NOTE: Since Skattestyrelsen API requires real OAuth credentials,
 * the module includes a simulated response path when no credentials are
 * configured, returning a structured mock response.
 *
 * Exports:
 *   - prepareVATSubmission(companyId, year, period, userId)
 *   - submitVATToSkat(submissionId, userId)
 *   - getVATSubmissions(companyId, year?)
 *   - getQuarterDates(year, period)
 */

import { db } from '@/lib/db';
import { computeVATRegister, r2 } from '@/lib/vat-utils';
import { auditLog, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';

// ─── Types ────────────────────────────────────────────────────────────────

export type VATReportingPeriod = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'YEARLY';

// ─── Skattestyrelsen API Configuration ───────────────────────────────────

const SKAT_API_BASE = process.env.SKAT_API_BASE || 'https://api.skat.dk/moms';
const SKAT_CLIENT_ID = process.env.SKAT_CLIENT_ID || '';
const SKAT_CLIENT_SECRET = process.env.SKAT_CLIENT_SECRET || '';

/** Check if Skattestyrelsen API credentials are configured */
function hasSkatCredentials(): boolean {
  return !!(SKAT_CLIENT_ID && SKAT_CLIENT_SECRET);
}

// ─── OAuth2 Token Management ──────────────────────────────────────────────

/** In-memory token cache */
let cachedToken: { accessToken: string; expiresAt: Date } | null = null;

/**
 * Get an OAuth2 access token from Skattestyrelsen.
 * Uses client_credentials grant with token caching.
 *
 * When no credentials are configured, throws an error.
 */
async function getSkatAccessToken(): Promise<string> {
  if (!hasSkatCredentials()) {
    throw new Error(
      'SKAT_API_CREDENTIALS_MISSING: Skattestyrelsen API credentials are not configured. ' +
      'Set SKAT_CLIENT_ID and SKAT_CLIENT_SECRET environment variables to enable live VAT submission.',
    );
  }

  // Return cached token if still valid
  if (cachedToken && cachedToken.expiresAt > new Date()) {
    return cachedToken.accessToken;
  }

  // Request new token
  const tokenUrl = `${SKAT_API_BASE}/oauth/token`;

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: SKAT_CLIENT_ID,
      client_secret: SKAT_CLIENT_SECRET,
      scope: 'moms:indberet',
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new Error(`SKAT_OAUTH_FAILED: Failed to obtain access token (${response.status}): ${errorBody}`);
  }

  const tokenData = await response.json();
  const accessToken = tokenData.access_token as string;
  const expiresIn = (tokenData.expires_in as number) || 3600;

  // Cache the token (expire 5 minutes early for safety)
  cachedToken = {
    accessToken,
    expiresAt: new Date(Date.now() + (expiresIn - 300) * 1000),
  };

  logger.info('[VAT-Submit] Obtained new Skattestyrelsen access token');
  return accessToken;
}

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
  }
}

// ─── Core: Prepare VAT Submission ──────────────────────────────────────────

/**
 * Prepare a VAT submission draft from the VAT register data.
 *
 * Computes the VAT register for the given period, creates a VATSubmission
 * record with status DRAFT, and stores the full VAT data snapshot.
 *
 * @param companyId - Company database ID
 * @param year - Fiscal year
 * @param period - Q1, Q2, Q3, Q4, or YEARLY
 * @param userId - User performing the action
 * @returns The created VATSubmission record
 */
export async function prepareVATSubmission(
  companyId: string,
  year: number,
  period: VATReportingPeriod,
  userId: string,
) {
  // Check for existing submission for this period
  const existing = await db.vATSubmission.findUnique({
    where: {
      companyId_year_period: { companyId, year, period },
    },
  });

  if (existing) {
    throw new Error(
      `VAT_SUBMISSION_EXISTS: A VAT submission for ${year} ${period} already exists (status: ${existing.status}). ` +
      `Use getVATSubmissions() to check the existing submission.`,
    );
  }

  // Get period dates
  const { from, to } = getQuarterDates(year, period);

  // Compute VAT register
  const vatRegister = await computeVATRegister({
    companyId,
    status: 'POSTED',
    cancelled: false,
    date: { gte: from, lte: to },
  });

  // Create the submission record
  const submission = await db.vATSubmission.create({
    data: {
      companyId,
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

// ─── Core: Submit VAT to Skattestyrelsen ───────────────────────────────────

/**
 * Submit a VAT report draft to Skattestyrelsen.
 *
 * If Skattestyrelsen API credentials are configured, submits via their
 * REST API. Otherwise, returns a simulated response.
 *
 * @param submissionId - The VATSubmission database ID
 * @param userId - User performing the action
 * @returns Updated VATSubmission record
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

  // Build submission payload
  const payload = {
    cvrNumber: '', // Will be filled from company data
    period: {
      year: submission.year,
      periodType: submission.period,
      from: submission.periodFrom.toISOString().split('T')[0],
      to: submission.periodTo.toISOString().split('T')[0],
    },
    vatData: {
      totalOutputVAT: submission.totalOutputVAT,
      totalInputVAT: submission.totalInputVAT,
      netVATPayable: submission.netVATPayable,
      outputVATBreakdown: (submission.vatDataJson as Record<string, unknown>)?.outputVAT || [],
      inputVATBreakdown: (submission.vatDataJson as Record<string, unknown>)?.inputVAT || [],
    },
  };

  // Get company CVR
  const company = await db.company.findUnique({
    where: { id: submission.companyId },
    select: { cvrNumber: true, name: true },
  });

  if (company) {
    payload.cvrNumber = company.cvrNumber;
  }

  let referenceId: string | null = null;
  let responseXml: string | null = null;
  let newStatus: 'SUBMITTED' | 'ERROR' = 'SUBMITTED';
  let errorMessage: string | null = null;
  let errorCode: string | null = null;

  if (hasSkatCredentials()) {
    // ── Live submission path ──
    try {
      const accessToken = await getSkatAccessToken();

      const response = await fetch(`${SKAT_API_BASE}/v1/indberet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        newStatus = 'ERROR';
        errorMessage = `Skattestyrelsen API returned ${response.status}`;
        errorCode = `SKAT_API_${response.status}`;

        logger.error(
          `[VAT-Submit] Skattestyrelsen API error: ${response.status} — ${errorBody}`,
        );
      } else {
        const result = await response.json();
        referenceId = result.referenceId || result.id || `SKAT-${Date.now()}`;
        responseXml = result.responseXml || JSON.stringify(result);
        newStatus = 'SUBMITTED';
      }
    } catch (error) {
      newStatus = 'ERROR';
      errorMessage = error instanceof Error ? error.message : 'Unknown error during submission';
      errorCode = 'SUBMISSION_FAILED';

      logger.error(`[VAT-Submit] Submission error:`, error);
    }
  } else {
    // ── Simulated submission path (no credentials configured) ──
    referenceId = `SIMULATED-${submission.year}-${submission.period}-${Date.now()}`;
    responseXml = JSON.stringify({
      type: 'simulated',
      message: 'VAT submission simulated. No Skattestyrelsen API credentials configured.',
      payload,
      simulatedAt: new Date().toISOString(),
    });

    logger.info(
      `[VAT-Submit] SIMULATED submission (no API credentials configured): ` +
      `${submission.year} ${submission.period}`,
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
      referenceId: { old: null, new: referenceId },
    },
    metadata: {
      year: submission.year,
      period: submission.period,
      netVATPayable: submission.netVATPayable,
      simulated: !hasSkatCredentials(),
    },
  });

  logger.info(
    `[VAT-Submit] VAT submission ${newStatus}: ${submission.year} ${submission.period}, ` +
    `Ref: ${referenceId}, Net: ${submission.netVATPayable}`,
  );

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
