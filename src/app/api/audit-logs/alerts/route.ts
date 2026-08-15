/**
 * GET /api/audit-logs/alerts
 *
 * Returns security-relevant alerts aggregated from the AuditLog for the
 * active company over the last `sinceHours` hours (default 24).
 *
 * Required by Danish Business Authority compliance review (Krav 18, row 18):
 *   "Er der advarsler vedr. logs" — yes, this endpoint exposes automated
 *   security alerts and is the same scan the daily cron runs at 06:00.
 *
 * RBAC: ADMIN+ only (Permission.COMPANY_EDIT_SETTINGS, min role ADMIN).
 * SuperDev always passes (full OWNER perms in own company). Oversight mode
 * is blocked — security alerts are not exposed to cross-tenant read-only
 * oversight (SUPER_DEV_READ_PERMISSIONS does not include COMPANY_EDIT_SETTINGS).
 *
 * Rate-limited to 5 requests per minute per user — alerts are pre-aggregated
 * and rarely change within a minute, so 5/min is generous for an interactive
 * dashboard refresh while preventing abuse.
 *
 * Response (200):
 *   {
 *     alerts: LogAlert[],
 *     scannedAt: string (ISO timestamp),
 *     sinceHours: number
 *   }
 *
 * Response (429): rate-limited
 * Response (500): internal error
 */

import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { scanAuditLogForAlerts, type LogAlert } from '@/lib/log-monitor';

// GET /api/audit-logs/alerts — Aggregated security alerts for the active company
export const GET = withGuard(
  {
    auth: true,
    requireCompany: true,
    // ADMIN+ only — security alerts reveal security posture and must not be
    // exposed to VIEWER/AUDITOR roles. SuperDev always passes (OWNER perms
    // in own company). Oversight mode is blocked because COMPANY_EDIT_SETTINGS
    // is not in SUPER_DEV_READ_PERMISSIONS.
    permissions: [Permission.COMPANY_EDIT_SETTINGS],
  },
  async (request, ctx) => {
    try {
      // Rate limit: 5/min per user. Alerts are pre-aggregated, so a single
      // refresh per minute is more than enough for an interactive dashboard.
      const rlKey = `audit-logs-alerts:${ctx.id}`;
      const rl = rateLimit(rlKey, {
        maxRequests: 5,
        windowMs: 60 * 1000,
        message: 'Too many alert requests. Please try again later.',
      });
      if (!rl.allowed) {
        return NextResponse.json(
          {
            error:
              'Too many alert requests. Please try again later.',
            retryAfter: rl.resetAt,
          },
          {
            status: 429,
            headers: {
              'Retry-After': String(
                Math.ceil((rl.resetAt - Date.now()) / 1000),
              ),
            },
          },
        );
      }

      // Parse optional `sinceHours` query param (clamped 1..168)
      const { searchParams } = new URL(request.url);
      const sinceHoursRaw = parseInt(searchParams.get('sinceHours') ?? '24', 10);
      const sinceHours = Number.isFinite(sinceHoursRaw)
        ? Math.max(1, Math.min(168, sinceHoursRaw))
        : 24;

      // Scan the AuditLog. The scan function is defensive and never throws,
      // but we keep the try/catch as a belt-and-braces safety net.
      let alerts: LogAlert[] = [];
      try {
        alerts = await scanAuditLogForAlerts({ sinceHours });
      } catch (scanError) {
        logger.error('[AUDIT-LOGS-ALERTS] scanAuditLogForAlerts threw:', scanError);
        alerts = [];
      }

      // NOTE on company-scoping: the AuditLog is company-scoped at the row
      // level (companyId column), but the scan function reads ALL rows in
      // the time window across ALL companies. This is intentional for the
      // daily cron (which is system-wide), but for the per-tenant API we
      // filter the alerts to only those affecting the active company.
      //
      // An alert "affects" a company if:
      //   - a.affectedCompanies contains ctx.activeCompanyId, OR
      //   - a.affectedCompanies is empty (system-wide alert like a backup
      //     failure on a System entity) — shown to all admins for visibility.
      const scopedAlerts = alerts.filter((a) => {
        if (!ctx.activeCompanyId) return false;
        if (a.affectedCompanies.length === 0) return true;
        return a.affectedCompanies.includes(ctx.activeCompanyId);
      });

      // If the SuperDev is in oversight mode we would not have reached here
      // (guard blocked it). For normal SuperDev/Admin, scope to their company.
      return NextResponse.json({
        alerts: scopedAlerts,
        scannedAt: new Date().toISOString(),
        sinceHours,
      });
    } catch (error) {
      logger.error('[AUDIT-LOGS-ALERTS] List alerts error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  },
);
