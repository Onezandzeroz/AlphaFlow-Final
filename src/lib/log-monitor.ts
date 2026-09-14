/**
 * Log Monitor — Automated AuditLog Security Alerting
 *
 * Required by Danish Business Authority compliance review (Krav 18, row 18):
 *   "Hvem står for logning / hvor ofte gennemgås logs / er der advarsler /
 *    beredskab ved brud"
 *
 * This module scans the immutable AuditLog (see `src/lib/audit.ts`) for
 * security-relevant events within a rolling time window (default 24h) and
 * aggregates them into actionable `LogAlert` records. It is invoked:
 *
 *   1. Daily at 06:00 Europe/Copenhagen via a node-cron schedule registered
 *      in `src/lib/log-monitor-scheduler.ts` (started from instrumentation.ts).
 *      Critical/high alerts trigger an optional e-mail to the configured
 *      `ALERT_EMAIL_RECIPIENT` (typically the SuperDev/owner).
 *
 *   2. On demand from the SuperDev/Admin UI via the
 *      `/api/audit-logs/alerts` route (rate-limited 5/min/user).
 *
 * DESIGN PRINCIPLES
 *   - Defensive: every DB call is wrapped in try/catch. The function NEVER
 *     throws — on failure it returns `[]` and logs via `logger`.
 *   - Read-only: it only reads from AuditLog (which is itself immutable by
 *     PostgreSQL triggers — see prisma/audit-immutability.sql). No writes,
 *     no side effects other than the optional e-mail hook.
 *   - Aggregated: multiple events of the same kind (e.g. 200 LOGIN_FAILED
 *     from one IP) collapse into ONE alert with `count`, `firstSeen`,
 *     `lastSeen`, affected users and companies.
 *
 * The AuditLog schema (prisma/schema.prisma) stores the originating IP
 * address inside the JSON `metadata` field (see `requestMetadata()` in
 * audit.ts): `metadata.ip` / `metadata.userAgent` / `metadata.timestamp`.
 * There is no dedicated `ipAddress` column.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// ─── Types ────────────────────────────────────────────────────────────────

export type LogAlertSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface LogAlert {
  id: string;
  severity: LogAlertSeverity;
  category: string;
  title: string;
  description: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  affectedUsers: string[];
  affectedCompanies: string[];
  recommendedAction: string;
}

export interface ScanAuditLogOptions {
  /** How far back to scan. Default 24 hours. */
  sinceHours?: number;
}

// ─── Internal helpers ─────────────────────────────────────────────────────

/**
 * Safely read the originating IP from an AuditLog.metadata JSON column.
 * `requestMetadata()` writes it as `metadata.ip`, but we accept a few
 * historical variants (`ipAddress`, `clientIp`) for forward-compatibility.
 */
function readIp(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  if (typeof m.ip === 'string' && m.ip.length > 0) return m.ip;
  if (typeof m.ipAddress === 'string' && m.ipAddress.length > 0) return m.ipAddress;
  if (typeof m.clientIp === 'string' && m.clientIp.length > 0) return m.clientIp;
  return null;
}

/**
 * True if a DELETE_ATTEMPT (or any audit event) metadata indicates the
 * attachment was rejected by the antivirus scanner. The upload pipeline
 * records `virusName` and `scanResult: 'infected'` when ClamAV flags a file.
 */
function metadataHasVirus(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const m = metadata as Record<string, unknown>;
  if (m.virusName && typeof m.virusName === 'string') return true;
  if (m.virus && typeof m.virus === 'string') return true;
  if (m.scanResult === 'infected' || m.avResult === 'infected') return true;
  return false;
}

/**
 * True if a BACKUP_* event metadata indicates failure. Backup engine writes
 * `metadata.status` (or `metadata.result`) = 'failed'/'error' on failure,
 * or sets `metadata.error` to the underlying message.
 */
function metadataIsBackupFailure(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const m = metadata as Record<string, unknown>;
  const statusRaw = m.status ?? m.result ?? m.outcome;
  if (typeof statusRaw === 'string') {
    const s = statusRaw.toLowerCase();
    if (s === 'failed' || s === 'error' || s === 'partial') return true;
  }
  if (m.error != null && m.error !== '') return true;
  if (m.errorMessage != null && m.errorMessage !== '') return true;
  return false;
}

/**
 * True if the event metadata indicates the request was rate-limited
 * (429 Too Many Requests). The rate-limit middleware tags audit metadata
 * with `rateLimited: true` or `rateLimit: { ... }` when applicable.
 */
function metadataHasRateLimit(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const m = metadata as Record<string, unknown>;
  if (m.rateLimited === true) return true;
  if (m.rateLimitedAt != null) return true;
  if (m.rateLimit && typeof m.rateLimit === 'object') return true;
  // Some legacy entries use `blocked: 'rate-limit'`
  if (typeof m.blocked === 'string' && m.blocked.toLowerCase().includes('rate')) return true;
  return false;
}

/** Push-unique helper: add a value to an array only if not already present. */
function pushUnique(arr: string[], value: string | null | undefined): void {
  if (!value) return;
  if (!arr.includes(value)) arr.push(value);
}

interface AuditLogRow {
  id: string;
  userId: string | null;
  companyId: string | null;
  performedByUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: unknown;
  changes: unknown;
  createdAt: Date;
}

interface AlertAccumulator {
  severity: LogAlertSeverity;
  category: string;
  title: string;
  description: string;
  recommendedAction: string;
  count: number;
  firstSeen: Date | null;
  lastSeen: Date | null;
  affectedUsers: Set<string>;
  affectedCompanies: Set<string>;
  // Optional secondary key used in `id` (e.g. IP for brute-force)
  key: string;
}

function finalizeAlert(acc: AlertAccumulator): LogAlert {
  return {
    id: `${acc.category}:${acc.key}`,
    severity: acc.severity,
    category: acc.category,
    title: acc.title,
    description: acc.description,
    count: acc.count,
    firstSeen: acc.firstSeen ?? new Date(0),
    lastSeen: acc.lastSeen ?? new Date(0),
    affectedUsers: Array.from(acc.affectedUsers).sort(),
    affectedCompanies: Array.from(acc.affectedCompanies).sort(),
    recommendedAction: acc.recommendedAction,
  };
}

function bumpAcc(acc: AlertAccumulator, row: AuditLogRow): void {
  acc.count += 1;
  if (acc.firstSeen === null || row.createdAt < acc.firstSeen) {
    acc.firstSeen = row.createdAt;
  }
  if (acc.lastSeen === null || row.createdAt > acc.lastSeen) {
    acc.lastSeen = row.createdAt;
  }
  pushUniqueIntoSet(acc.affectedUsers, row.userId);
  pushUniqueIntoSet(acc.affectedUsers, row.performedByUserId);
  pushUniqueIntoSet(acc.affectedCompanies, row.companyId);
}

function pushUniqueIntoSet(set: Set<string>, value: string | null | undefined): void {
  if (!value) return;
  set.add(value);
}

// ─── Core scan function ───────────────────────────────────────────────────

/**
 * Scan the AuditLog for security-relevant events in the last `sinceHours`
 * hours (default 24) and return a list of aggregated `LogAlert` records.
 *
 * Detection categories:
 *   - Brute-force login (>5 LOGIN_FAILED per IP)                → high
 *   - Virus upload attempts (DELETE_ATTEMPT with virusName)     → high
 *   - Oversight access (OVERSIGHT action)                       → medium
 *   - Account deactivations (ACCOUNT_DEACTIVATED)               → medium
 *   - Session invalidation spike (>10 SESSION_INVALIDATE)       → medium
 *   - Backup failures (BACKUP_* with failure metadata)          → high
 *   - DELETE_ATTEMPT on JournalEntry/Transaction                → critical
 *     (immutability violation attempt — posted entries cannot be deleted)
 *   - 2FA disable (TWO_FACTOR_DISABLED)                         → medium
 *   - Rate-limit hits (metadata rate-limit info)                → low
 *
 * The function is read-only and never throws. On any DB error it logs
 * via `logger` and returns `[]`.
 */
export async function scanAuditLogForAlerts(
  options?: ScanAuditLogOptions,
): Promise<LogAlert[]> {
  const sinceHours = Math.max(1, Math.min(720, options?.sinceHours ?? 24));
  const sinceDate = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

  let logs: AuditLogRow[] = [];

  try {
    logs = await db.auditLog.findMany({
      where: { createdAt: { gte: sinceDate } },
      orderBy: { createdAt: 'asc' },
      // Cap to a defensive maximum — the rolling window is bounded by
      // sinceHours (default 24h) so realistic volumes stay well below this.
      // If a tenant generates more than 5000 audit rows in 24h we have
      // bigger problems than a single truncated scan.
      take: 5000,
    });
  } catch (error) {
    logger.error('[LOG-MONITOR] Failed to query AuditLog:', error);
    return [];
  }

  // ── Aggregators keyed by detection category ──────────────────────────

  // Brute-force: keyed by originating IP
  const bruteForceByIp = new Map<string, AlertAccumulator>();
  const BRUTE_FORCE_THRESHOLD = 5;

  // Virus upload attempts: keyed by "any" → single aggregated alert
  let virusAcc: AlertAccumulator | null = null;

  // Oversight access: single aggregated alert
  let oversightAcc: AlertAccumulator | null = null;

  // Account deactivations: single aggregated alert
  let deactivationAcc: AlertAccumulator | null = null;

  // Session invalidation spike: single aggregated alert (only emitted > 10)
  let sessionInvalidateAcc: AlertAccumulator | null = null;
  const SESSION_INVALIDATE_THRESHOLD = 10;

  // Backup failures: keyed by backup action (BACKUP_CREATE / BACKUP_RESTORE / BACKUP_DELETE)
  const backupFailureByAction = new Map<string, AlertAccumulator>();

  // DELETE_ATTEMPT on posted JournalEntry/Transaction (immutability violation attempt)
  let immutabilityAcc: AlertAccumulator | null = null;

  // 2FA disable: single aggregated alert
  let twoFaDisableAcc: AlertAccumulator | null = null;

  // Rate-limit hits: single aggregated alert
  let rateLimitAcc: AlertAccumulator | null = null;

  for (const row of logs) {
    const action = row.action;
    const entityType = row.entityType;
    const ip = readIp(row.metadata);

    // ── Brute force ────────────────────────────────────────────────────
    if (action === 'LOGIN_FAILED') {
      const key = ip ?? 'unknown-ip';
      let acc = bruteForceByIp.get(key);
      if (!acc) {
        acc = {
          severity: 'high',
          category: 'brute_force_login',
          title: ip
            ? `Brute-force login attempts from ${ip}`
            : 'Brute-force login attempts (unknown IP)',
          description:
            `More than ${BRUTE_FORCE_THRESHOLD} failed login attempts were recorded ` +
            `from a single IP address within the last ${sinceHours} hours. ` +
            `This is indicative of an automated credential-stuffing or brute-force attack.`,
          recommendedAction:
            'Block the offending IP at the Caddy/WAF layer (Caddyfile `rate_limit` ' +
            'directive), review the targeted user accounts, and force a password reset ' +
            'if any account was compromised. Consider enabling 2FA for the affected users.',
          key,
          count: 0,
          firstSeen: null,
          lastSeen: null,
          affectedUsers: new Set(),
          affectedCompanies: new Set(),
        };
        bruteForceByIp.set(key, acc);
      }
      bumpAcc(acc, row);
    }

    // ── Virus upload attempts ──────────────────────────────────────────
    if (action === 'DELETE_ATTEMPT' && metadataHasVirus(row.metadata)) {
      if (!virusAcc) {
        virusAcc = {
          severity: 'high',
          category: 'virus_upload_attempt',
          title: 'Malicious file upload detected (antivirus)',
          description:
            'One or more uploaded files were quarantined by the antivirus scanner ' +
            '(ClamAV). The files were blocked before reaching disk and recorded as ' +
            'DELETE_ATTEMPT entries with a `virusName` metadata field.',
          recommendedAction:
            'Confirm the files were quarantined (not persisted to disk). Review the ' +
            'originating user account for compromise. If the same user repeatedly ' +
            'uploads malware, deactivate the account and notify the company owner.',
          key: 'all',
          count: 0,
          firstSeen: null,
          lastSeen: null,
          affectedUsers: new Set(),
          affectedCompanies: new Set(),
        };
      }
      bumpAcc(virusAcc, row);
    }

    // ── Oversight access ───────────────────────────────────────────────
    if (action === 'OVERSIGHT') {
      if (!oversightAcc) {
        oversightAcc = {
          severity: 'medium',
          category: 'oversight_access',
          title: 'SuperDev oversight access logged',
          description:
            'A SuperDev exercised cross-tenant read-only oversight access. ' +
            'Oversight is a privileged operation that must be reviewed regularly ' +
            'to confirm it was used for legitimate support/audit purposes.',
          recommendedAction:
            'Review each oversight event against the support ticket / audit ' +
            'request that justified it. Investigate any oversight access that ' +
            'cannot be tied to a documented business need.',
          key: 'all',
          count: 0,
          firstSeen: null,
          lastSeen: null,
          affectedUsers: new Set(),
          affectedCompanies: new Set(),
        };
      }
      bumpAcc(oversightAcc, row);
    }

    // ── Account deactivations ──────────────────────────────────────────
    if (action === 'ACCOUNT_DEACTIVATED') {
      if (!deactivationAcc) {
        deactivationAcc = {
          severity: 'medium',
          category: 'account_deactivated',
          title: 'User account deactivation(s)',
          description:
            'One or more user accounts were deactivated. Account deactivation ' +
            'preserves all audit logs (no hard delete) but the user can no longer ' +
            'log in. Confirm each deactivation was authorised.',
          recommendedAction:
            'Cross-check deactivations against the offboarding register or the ' +
            'GDPR Art. 17 deletion request log. Verify the deactivated user did ' +
            'not have pending or unposted journal entries.',
          key: 'all',
          count: 0,
          firstSeen: null,
          lastSeen: null,
          affectedUsers: new Set(),
          affectedCompanies: new Set(),
        };
      }
      bumpAcc(deactivationAcc, row);
    }

    // ── Session invalidation spike ─────────────────────────────────────
    if (action === 'SESSION_INVALIDATE') {
      if (!sessionInvalidateAcc) {
        sessionInvalidateAcc = {
          severity: 'medium',
          category: 'session_invalidation_spike',
          title: 'Elevated session invalidation volume',
          description:
            `More than ${SESSION_INVALIDATE_THRESHOLD} sessions were invalidated ` +
            `within the last ${sinceHours} hours. This may indicate a coordinated ` +
            `security response (e.g. after a suspected breach) or an automated ` +
            `process revoking sessions programmatically.`,
          recommendedAction:
            'Determine whether the invalidations were triggered manually by an ' +
            'administrator (expected after a security incident) or by an unexpected ' +
            'automated source. If unexpected, audit the triggering user account.',
          key: 'all',
          count: 0,
          firstSeen: null,
          lastSeen: null,
          affectedUsers: new Set(),
          affectedCompanies: new Set(),
        };
      }
      bumpAcc(sessionInvalidateAcc, row);
    }

    // ── Backup failures ────────────────────────────────────────────────
    if (action.startsWith('BACKUP_') && metadataIsBackupFailure(row.metadata)) {
      let acc = backupFailureByAction.get(action);
      if (!acc) {
        acc = {
          severity: 'high',
          category: 'backup_failure',
          title: `${action} failed`,
          description:
            `One or more ${action} operations failed within the last ${sinceHours} ` +
            `hours. Backup integrity is required by Bogføringsloven §15 — any ` +
            `backup failure must be investigated and resolved the same day.`,
          recommendedAction:
            'Check the CronExecution log for the underlying error message. Verify ' +
            'database connectivity, encryption key availability, and disk space. ' +
            'Manually trigger a backup once the root cause is resolved.',
          key: action,
          count: 0,
          firstSeen: null,
          lastSeen: null,
          affectedUsers: new Set(),
          affectedCompanies: new Set(),
        };
        backupFailureByAction.set(action, acc);
      }
      bumpAcc(acc, row);
    }

    // ── DELETE_ATTEMPT on posted JournalEntry / Transaction ────────────
    // (immutability violation attempt — these entities are protected by
    // PostgreSQL triggers; any DELETE_ATTEMPT here is a user trying to
    // circumvent immutability, which is itself a critical compliance event)
    if (
      action === 'DELETE_ATTEMPT' &&
      (entityType === 'JournalEntry' || entityType === 'Transaction')
    ) {
      if (!immutabilityAcc) {
        immutabilityAcc = {
          severity: 'critical',
          category: 'immutability_violation_attempt',
          title: 'Attempted deletion of posted entry (immutability violation)',
          description:
            'A user attempted to delete a posted JournalEntry or Transaction. ' +
            'Posted entries are immutable by Danish Bookkeeping Law (Bogføringsloven ' +
            '§10-12) and protected at the database level by PostgreSQL triggers. ' +
            'The deletion was blocked, but the attempt itself is a critical ' +
            'compliance event that must be investigated immediately.',
          recommendedAction:
            'Identify the user and the entity they attempted to delete. Cross-check ' +
            'with the user change/diff (metadata.changes). Trigger Beredskabsplan ' +
            'trin 1 (indetægtning, isolering) per Bilag-09. Consider whether the ' +
            'account should be temporarily suspended pending review.',
          key: 'all',
          count: 0,
          firstSeen: null,
          lastSeen: null,
          affectedUsers: new Set(),
          affectedCompanies: new Set(),
        };
      }
      bumpAcc(immutabilityAcc, row);
    }

    // ── 2FA disable ────────────────────────────────────────────────────
    if (action === 'TWO_FACTOR_DISABLED') {
      if (!twoFaDisableAcc) {
        twoFaDisableAcc = {
          severity: 'medium',
          category: 'two_factor_disabled',
          title: 'Two-factor authentication disabled',
          description:
            'One or more users disabled 2FA. Disabling 2FA reduces account security ' +
            'and may indicate account takeover (attacker disabling 2FA after gaining ' +
            'password access) or an insider preparing to exfiltrate data.',
          recommendedAction:
            'Verify with each affected user that they intended to disable 2FA. ' +
            'For ADMIN/OWNER roles, require re-enabling 2FA within 24 hours or ' +
            'temporarily demote the account.',
          key: 'all',
          count: 0,
          firstSeen: null,
          lastSeen: null,
          affectedUsers: new Set(),
          affectedCompanies: new Set(),
        };
      }
      bumpAcc(twoFaDisableAcc, row);
    }

    // ── Rate-limit hits ────────────────────────────────────────────────
    if (metadataHasRateLimit(row.metadata)) {
      if (!rateLimitAcc) {
        rateLimitAcc = {
          severity: 'low',
          category: 'rate_limit_hit',
          title: 'Rate-limit triggered',
          description:
            'One or more requests were rejected by the rate limiter (429 Too Many ' +
            'Requests). A small number of rate-limit hits is normal (legitimate ' +
            'users retrying). A large number from a single IP/user indicates abuse.',
          recommendedAction:
            'Inspect the originating IP in the audit metadata. If the same IP ' +
            'accounts for most hits, consider blocking it at the Caddy/WAF layer. ' +
            'Cross-reference with brute_force_login alerts — rate-limit hits are ' +
            'often a precursor to credential attacks.',
          key: 'all',
          count: 0,
          firstSeen: null,
          lastSeen: null,
          affectedUsers: new Set(),
          affectedCompanies: new Set(),
        };
      }
      bumpAcc(rateLimitAcc, row);
    }
  }

  // ── Assemble the final alert list (severity-sorted) ───────────────────

  const alerts: LogAlert[] = [];

  // Critical: immutability violation attempts
  if (immutabilityAcc) alerts.push(finalizeAlert(immutabilityAcc));

  // High: brute force (only above threshold), virus uploads, backup failures
  for (const acc of bruteForceByIp.values()) {
    if (acc.count > BRUTE_FORCE_THRESHOLD) {
      alerts.push(finalizeAlert(acc));
    }
  }
  if (virusAcc) alerts.push(finalizeAlert(virusAcc));
  for (const acc of backupFailureByAction.values()) {
    alerts.push(finalizeAlert(acc));
  }

  // Medium: oversight, account deactivations, session-invalidation spike,
  // 2FA disable
  if (oversightAcc) alerts.push(finalizeAlert(oversightAcc));
  if (deactivationAcc) alerts.push(finalizeAlert(deactivationAcc));
  if (sessionInvalidateAcc && sessionInvalidateAcc.count > SESSION_INVALIDATE_THRESHOLD) {
    alerts.push(finalizeAlert(sessionInvalidateAcc));
  }
  if (twoFaDisableAcc) alerts.push(finalizeAlert(twoFaDisableAcc));

  // Low: rate-limit hits
  if (rateLimitAcc) alerts.push(finalizeAlert(rateLimitAcc));

  return alerts;
}

// ─── Optional e-mail hook (for the daily cron) ────────────────────────────

/**
 * Send an e-mail summary of alerts to the configured
 * `ALERT_EMAIL_RECIPIENT`. This is OPTIONAL — if the env var is not set,
 * the function is a no-op. Safe to call from the scheduler.
 *
 * BEHAVIOUR:
 *   - If there ARE critical/high alerts → sends a detailed alert table.
 *   - If there are NO critical/high alerts → sends a "system nominal"
 *     confirmation email stating no incidents were observed and the
 *     application is operating normally.
 *   - Medium/low alerts are included in the nominal email as a count
 *     summary but do not trigger the detailed alert table.
 *
 * The e-mail is sent via the existing `sendEmail` infrastructure so it is
 * logged in the EmailLog table and respects the SMTP configuration.
 *
 * This function never throws — e-mail failures are logged and swallowed.
 */
export async function notifyAlertsViaEmail(alerts: LogAlert[]): Promise<void> {
  const recipient = process.env.ALERT_EMAIL_RECIPIENT;
  if (!recipient) {
    // E-mail alerts are disabled — caller may log to console instead.
    return;
  }

  // Separate critical/high (notable) from medium/low
  const notable = alerts.filter(
    (a) => a.severity === 'critical' || a.severity === 'high',
  );
  const mediumCount = alerts.filter((a) => a.severity === 'medium').length;
  const lowCount = alerts.filter((a) => a.severity === 'low').length;

  try {
    // Dynamic import keeps the email-service dependency out of the
    // synchronous scan path (and out of any client-side bundle — this
    // module is server-only by virtue of importing db, but the dynamic
    // import makes the dependency explicit at the call site).
    const { sendEmail } = await import('@/lib/email-service');

    const dateStr = new Date().toISOString().slice(0, 10);

    if (notable.length === 0) {
      // ── "All nominal" daily digest ──────────────────────────────
      //
      // No critical/high alerts in the last 24 hours. Send a
      // confirmation email so the SuperDev knows the monitor is
      // running and the system is healthy. This is important: if the
      // SuperDev stops receiving the daily email, they know something
      // is wrong with the monitor itself.
      const subject = `[AlphaFlow] Daglig status — ingen hændelser (${dateStr})`;

      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:760px;">
          <h2 style="margin:0 0 8px 0;">Daglig sikkerhedsstatus — AlphaFlow</h2>
          <p style="margin:0 0 16px 0;color:#4b5563;">
            Den automatiske log-scanning har gennemført sit daglige tjek af alle
            tenants for de seneste 24 timer.
          </p>
          <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:16px;margin:16px 0;">
            <p style="margin:0;font-size:15px;color:#065f46;">
              <strong>✓ Ingen kritiske eller høj-severitets hændelser observeret.</strong><br/>
              Applikationen opererer nominelt.
            </p>
          </div>
          <table style="border-collapse:collapse;width:100%;font-size:13px;margin:16px 0;">
            <tr style="background:#f3f4f6;">
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;">Scanningsperiode</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">Seneste 24 timer (alle tenants)</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;">Kritiske hændelser</td>
              <td style="padding:8px;border:1px solid #e5e7eb;color:#059669;font-weight:600;">0</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;">Høj-severitet hændelser</td>
              <td style="padding:8px;border:1px solid #e5e7eb;color:#059669;font-weight:600;">0</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;">Medium-severitet hændelser</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${mediumCount}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;">Lav-severitet hændelser</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${lowCount}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;">Næste scanning</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">06:00 Europe/Copenhagen (i morgen)</td>
            </tr>
          </table>
          <p style="margin-top:16px;color:#6b7280;font-size:12px;">
            Denne e-mail sendes automatisk hver dag kl. 06:00 af log-monitor cron.
            Hvis du ikke længere modtager denne e-mail, kan det indikere at
            overvågningen er stoppet — undersøg omgående. Svares ikke på denne e-mail.
          </p>
        </div>
      `;

      await sendEmail({
        to: recipient,
        subject,
        html,
        template: 'owner-notification',
        metadata: {
          source: 'log-monitor-cron',
          alertCount: 0,
          type: 'daily_nominal',
          mediumCount,
          lowCount,
        },
      });

      logger.info(
        `[LOG-MONITOR] Daily nominal e-mail sent to ${recipient} (0 critical/high alerts, ${mediumCount} medium, ${lowCount} low)`,
      );
      return;
    }

    // ── Alert digest (critical/high alerts present) ──────────────
    const subject =
      `[AlphaFlow] ${notable.length} sikkerhedsadvarsel(le) kræver gennemgang — ` +
      dateStr;

    const rows = notable
      .map((a) => {
        const users = a.affectedUsers.length > 0 ? a.affectedUsers.join(', ') : '—';
        const companies =
          a.affectedCompanies.length > 0 ? a.affectedCompanies.join(', ') : '—';
        return (
          `<tr>` +
          `<td style="padding:6px;border:1px solid #e5e7eb;font-weight:600;">${a.severity.toUpperCase()}</td>` +
          `<td style="padding:6px;border:1px solid #e5e7eb;">${a.title}</td>` +
          `<td style="padding:6px;border:1px solid #e5e7eb;text-align:center;">${a.count}</td>` +
          `<td style="padding:6px;border:1px solid #e5e7eb;font-family:monospace;font-size:11px;">${users}</td>` +
          `<td style="padding:6px;border:1px solid #e5e7eb;font-family:monospace;font-size:11px;">${companies}</td>` +
          `<td style="padding:6px;border:1px solid #e5e7eb;">${a.recommendedAction}</td>` +
          `</tr>`
        );
      })
      .join('');

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:760px;">
        <h2 style="margin:0 0 8px 0;">Sikkerhedsadvarsler — AlphaFlow</h2>
        <p style="margin:0 0 16px 0;color:#4b5563;">
          Den automatiske log-scanning har fundet ${notable.length}
          kritisk/høj-severitetsadvarsel(er). Se Beredskabsplan (Bilag-09) for
          incident response proceduren.
        </p>
        <table style="border-collapse:collapse;width:100%;font-size:13px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:6px;border:1px solid #e5e7eb;text-align:left;">Severitet</th>
              <th style="padding:6px;border:1px solid #e5e7eb;text-align:left;">Titel</th>
              <th style="padding:6px;border:1px solid #e5e7eb;">Antal</th>
              <th style="padding:6px;border:1px solid #e5e7eb;text-align:left;">Brugere</th>
              <th style="padding:6px;border:1px solid #e5e7eb;text-align:left;">Virksomheder</th>
              <th style="padding:6px;border:1px solid #e5e7eb;text-align:left;">Anbefaling</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        ${mediumCount + lowCount > 0 ? `<p style="margin-top:12px;color:#6b7280;font-size:12px;">Derudover blev ${mediumCount} medium- og ${lowCount} lav-severitets hændelser registreret. Disse kræver ikke øjeblikkelig handling men gennemgås ved den ugentlige manuelle review.</p>` : ''}
        <p style="margin-top:16px;color:#6b7280;font-size:12px;">
          E-mail sendt af log-monitor cron (06:00 Europe/Copenhagen). Svares ikke på denne e-mail.
        </p>
      </div>
    `;

    await sendEmail({
      to: recipient,
      subject,
      html,
      template: 'owner-notification',
      metadata: {
        source: 'log-monitor-cron',
        alertCount: notable.length,
        type: 'alert_digest',
        severities: notable.map((a) => a.severity),
        mediumCount,
        lowCount,
      },
    });

    logger.info(
      `[LOG-MONITOR] Alert e-mail sent to ${recipient} (${notable.length} alerts)`,
    );
  } catch (error) {
    // Never let an e-mail failure crash the scheduler.
    logger.error('[LOG-MONITOR] Failed to send alert e-mail:', error);
  }
}

// ─── Immediate critical-incident notification ─────────────────────────────
//
// While the daily scan (06:00) catches everything within 24h, CRITICAL
// events must trigger an immediate email so the SuperDev can respond
// right away — not wait up to 24 hours for the next scan.
//
// This function is called from auditLog() (see audit.ts) whenever a
// critical-severity event is written to the AuditLog. It sends an
// immediate alert email with the event details.
//
// CRITICAL events (per scanAuditLogForAlerts):
//   - DELETE_ATTEMPT on JournalEntry/Transaction (immutability violation)
//   - Future: any event tagged severity='critical' in the scan logic
//
// Rate-limited: max 1 immediate email per 5 minutes per category to
// avoid email flooding during an attack. The daily digest still runs
// at 06:00 regardless.

const _lastImmediateEmail: Map<string, number> = new Map();
const IMMEDIATE_EMAIL_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Send an IMMEDIATE alert email for a critical-severity audit event.
 * Called from auditLog() when a critical event is detected — does NOT
 * wait for the daily 06:00 scan.
 *
 * Rate-limited per category to prevent email flooding (5 min cooldown).
 *
 * @param event - The critical audit event details
 * @returns true if email was sent, false if suppressed (cooldown or no recipient)
 */
export async function notifyCriticalEventImmediately(event: {
  action: string;
  entityType: string;
  entityId: string;
  userId?: string | null;
  companyId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  const recipient = process.env.ALERT_EMAIL_RECIPIENT;
  if (!recipient) {
    return false; // No recipient configured
  }

  // Rate-limit: max 1 email per category per 5 minutes
  const categoryKey = `${event.action}:${event.entityType}`;
  const now = Date.now();
  const lastSent = _lastImmediateEmail.get(categoryKey);
  if (lastSent && now - lastSent < IMMEDIATE_EMAIL_COOLDOWN_MS) {
    // Within cooldown — suppress to prevent flooding
    logger.debug('[LOG-MONITOR] Immediate alert suppressed (cooldown)', {
      categoryKey,
      cooldownRemaining: Math.ceil((IMMEDIATE_EMAIL_COOLDOWN_MS - (now - lastSent)) / 1000) + 's',
    });
    return false;
  }

  try {
    const { sendEmail } = await import('@/lib/email-service');
    const timestamp = new Date().toISOString();
    const dateStr = timestamp.slice(0, 19).replace('T', ' ');

    const subject = `[AlphaFlow Kritisk] ${event.action} på ${event.entityType} — ØJEBLIKELIGELIG handling påkrævet`;

    const metaRows = event.metadata
      ? Object.entries(event.metadata)
          .slice(0, 10)
          .map(([k, v]) => `<tr><td style="padding:4px 8px;border:1px solid #e5e7eb;font-weight:600;">${k}</td><td style="padding:4px 8px;border:1px solid #e5e7eb;font-family:monospace;font-size:11px;">${JSON.stringify(v)}</td></tr>`)
          .join('')
      : '<tr><td style="padding:4px 8px;border:1px solid #e5e7eb;color:#9ca3af;">(ingen metadata)</td></tr>';

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:760px;">
        <div style="background:#fef2f2;border:2px solid #dc2626;border-radius:8px;padding:16px;margin-bottom:16px;">
          <h2 style="margin:0 0 8px 0;color:#dc2626;">⚠ KRITISK SIKKERHEDSHÆNDELSE</h2>
          <p style="margin:0;color:#991b1b;font-size:14px;">
            En kritisk hændelse er registreret og kræver <strong>øjeblikkelig</strong> undersøgelse.
            Den daglige log-scanning vil også inkludere denne hændelse i digesten kl. 06:00.
          </p>
        </div>
        <table style="border-collapse:collapse;width:100%;font-size:13px;margin:16px 0;">
          <tr style="background:#f3f4f6;">
            <td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;">Tidspunkt</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">${dateStr} UTC</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;">Handling</td>
            <td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;color:#dc2626;">${event.action}</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;">Entitetstype</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">${event.entityType}</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;">Entitet ID</td>
            <td style="padding:8px;border:1px solid #e5e7eb;font-family:monospace;font-size:11px;">${event.entityId}</td>
          </tr>
          ${event.userId ? `<tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;">Bruger ID</td><td style="padding:8px;border:1px solid #e5e7eb;font-family:monospace;font-size:11px;">${event.userId}</td></tr>` : ''}
          ${event.companyId ? `<tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;">Tenant ID</td><td style="padding:8px;border:1px solid #e5e7eb;font-family:monospace;font-size:11px;">${event.companyId}</td></tr>` : ''}
        </table>
        <h3 style="margin:16px 0 8px 0;">Metadata</h3>
        <table style="border-collapse:collapse;width:100%;font-size:12px;">
          ${metaRows}
        </table>
        <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:12px;margin:16px 0;">
          <p style="margin:0;font-size:13px;color:#92400e;">
            <strong>Beredskabsplan (Bilag-09):</strong> Start trin 1 (indtekning/isolering) omgående.
            Identificér den brugerkonto der udførte handlingen, og vurder om kontoen skal suspenderes
            midlertidigt mens hændelsen undersøges.
          </p>
        </div>
        <p style="margin-top:16px;color:#6b7280;font-size:12px;">
          Denne e-mail er sendt øjeblikkeligt da hændelsen blev registreret (ikke ventet på daglig scanning).
          Rate-limiter: maks 1 email pr. 5 minutter pr. hændelsestype. Svares ikke på denne e-mail.
        </p>
      </div>
    `;

    await sendEmail({
      to: recipient,
      subject,
      html,
      template: 'owner-notification',
      metadata: {
        source: 'log-monitor-immediate',
        type: 'critical_immediate',
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        timestamp,
      },
    });

    _lastImmediateEmail.set(categoryKey, now);
    logger.warn(
      `[LOG-MONITOR] Immediate critical alert sent to ${recipient} — ${event.action} on ${event.entityType}`,
      { entityId: event.entityId, userId: event.userId, companyId: event.companyId },
    );
    return true;
  } catch (error) {
    logger.error('[LOG-MONITOR] Failed to send immediate critical alert:', error);
    return false;
  }
}

/**
 * Check if an audit action/entityType combination is a critical event
 * that should trigger immediate notification (not wait for daily scan).
 * Used by auditLog() to decide whether to call notifyCriticalEventImmediately.
 *
 * Returns the severity if critical, or null if not critical.
 */
export function getCriticalEventSeverity(
  action: string,
  entityType: string,
): 'critical' | null {
  // DELETE_ATTEMPT on posted JournalEntry/Transaction = immutability
  // violation attempt — this is the highest-severity event in the system
  // (someone trying to circumvent Bogføringsloven §10-12).
  if (
    action === 'DELETE_ATTEMPT' &&
    (entityType === 'JournalEntry' || entityType === 'Transaction')
  ) {
    return 'critical';
  }

  // Future critical events can be added here:
  // - DATA_RESET on a company with posted entries
  // - Bulk account deactivation by a non-owner
  // - Encryption key compromise
  // - etc.

  return null;
}
