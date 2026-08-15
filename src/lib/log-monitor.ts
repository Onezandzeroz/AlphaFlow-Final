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
 * Send an e-mail summary of critical/high alerts to the configured
 * `ALERT_EMAIL_RECIPIENT`. This is OPTIONAL — if the env var is not set,
 * the function is a no-op. Safe to call from the scheduler.
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

  // Only e-mail critical + high alerts — medium/low are reviewed weekly.
  const notable = alerts.filter(
    (a) => a.severity === 'critical' || a.severity === 'high',
  );
  if (notable.length === 0) {
    return;
  }

  try {
    // Dynamic import keeps the email-service dependency out of the
    // synchronous scan path (and out of any client-side bundle — this
    // module is server-only by virtue of importing db, but the dynamic
    // import makes the dependency explicit at the call site).
    const { sendEmail } = await import('@/lib/email-service');

    const subject =
      `[AlphaFlow] ${notable.length} sikkerhedsadvarsel(le) kræver gennemgang — ` +
      `${new Date().toISOString().slice(0, 10)}`;

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
        severities: notable.map((a) => a.severity),
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
