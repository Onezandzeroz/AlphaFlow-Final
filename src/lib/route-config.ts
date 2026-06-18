/**
 * Declarative Route Guard Configuration for AlphaFlow
 *
 * This file is the SINGLE SOURCE OF TRUTH for all API route protection.
 * Every route's guard requirements are declared here, making it:
 * - Impossible to forget a guard (missing entry = 500 error)
 * - Easy to audit (read this file to see all protection at a glance)
 * - Documentation for Erhvervsstyrelsen compliance
 *
 * Categories:
 * - PUBLIC:      No auth required (login, register, webhooks)
 * - READ:        Auth + company scope (standard data reads)
 * - MUTATE:      Full guard chain (auth + company + oversight + demo + tokenpay)
 * - AUTH_ONLY:   Auth but no company requirement (user-level operations)
 * - SUPERDEV:    Auth + SuperDev role required
 * - Custom:      Per-route specific combinations
 */

import { Permission } from '@/lib/rbac';
import type { GuardConfig } from '@/lib/route-guard';

// ─── Config Type ──────────────────────────────────────────────

export interface RouteMethodConfig {
  GET?: GuardConfig;
  POST?: GuardConfig;
  PUT?: GuardConfig;
  DELETE?: GuardConfig;
  PATCH?: GuardConfig;
}

export type RouteConfigMap = Record<string, RouteMethodConfig>;

// ─── Complete Route Configuration ─────────────────────────────

export const routeConfig: RouteConfigMap = {
  // ═══════════════════════════════════════════════════════════
  // PUBLIC ROUTES (no auth required)
  // ═══════════════════════════════════════════════════════════

  '/api': {
    GET: { auth: false }, // Health check
  },

  '/api/auth/login': {
    POST: { auth: false },
  },
  '/api/auth/register': {
    POST: { auth: false },
  },
  '/api/auth/forgot-password': {
    POST: { auth: false },
  },
  '/api/auth/reset-password': {
    POST: { auth: false },
  },
  '/api/auth/verify-email': {
    POST: { auth: false },
  },
  '/api/auth/resend-verification': {
    POST: { auth: false },
  },
  '/api/auth/2fa/verify-login': {
    POST: { auth: false },
  },
  '/api/auth/me': {
    GET: { auth: 'optional' }, // Returns null user if unauthenticated
  },

  // Webhooks (verified by HMAC/signature, not session)
  '/api/tokenpay/callback': {
    POST: { auth: false },
  },
  '/api/bank-connections/consent-callback': {
    GET: { auth: false },
    POST: { auth: false },
  },

  // Static data (no sensitive info)
  '/api/vat-codes/mapping': {
    GET: { auth: false },
  },

  // ═══════════════════════════════════════════════════════════
  // AUTH-ONLY ROUTES (session required, no company)
  // ═══════════════════════════════════════════════════════════

  '/api/auth/logout': {
    POST: { auth: true },
  },
  '/api/auth/send-verification': {
    POST: { auth: true },
  },
  '/api/auth/2fa/setup': {
    POST: { auth: true },
  },
  '/api/auth/2fa/activate': {
    POST: { auth: true },
  },
  '/api/auth/2fa/disable': {
    POST: { auth: true },
  },
  '/api/auth/2fa/status': {
    GET: { auth: true },
  },
  '/api/auth/2fa/backup-codes': {
    GET: { auth: true },
    POST: { auth: true },
  },
  '/api/auth/delete-account': {
    DELETE: { auth: true, blockOversight: true },
  },
  '/api/auth/promote-superdev': {
    POST: { auth: true }, // Internal logic checks AlphaAi company
  },

  // ═══════════════════════════════════════════════════════════
  // STANDARD READ ROUTES (auth + company)
  // ═══════════════════════════════════════════════════════════

  '/api/transactions': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_CREATE] },
    PUT: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_EDIT] },
    DELETE: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_DELETE] },
  },
  '/api/transactions/upload': {
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_CREATE] },
  },
  '/api/transactions/export': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.REPORTS_EXPORT] },
  },
  '/api/transactions/export-peppol': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.REPORTS_EXPORT] },
  },
  '/api/transactions/recent-descriptions': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  },

  '/api/accounts': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_CREATE] },
  },
  '/api/accounts/[id]': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
    PUT: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_EDIT] },
    DELETE: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_DELETE] },
  },
  '/api/accounts/seed': {
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_CREATE] },
  },
  '/api/accounts/posting-guide': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
    PUT: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_EDIT] },
  },
  '/api/accounts/standard-mapping': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
    PUT: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_EDIT] },
  },
  '/api/accounts/standard-mapping/auto': {
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_EDIT] },
  },

  '/api/invoices': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_CREATE] },
    DELETE: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_DELETE] },
  },
  '/api/invoices/[id]': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
    PUT: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_EDIT] },
  },
  '/api/invoices/[id]/pdf': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  },
  '/api/invoices/[id]/oioubl': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  },
  '/api/invoices/[id]/oioubl/validate': {
    POST: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  },
  '/api/invoices/[id]/send': {
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_EDIT] },
  },
  '/api/invoices/[id]/send-einvoice': {
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_EDIT] },
  },
  '/api/invoices/[id]/einvoice-sends': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  },
  '/api/invoices/[id]/einvoice-sends/[sendingId]/retry': {
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_EDIT] },
  },
  '/api/invoices/receive': {
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, permissions: [Permission.DATA_CREATE] },
  },
  '/api/invoices/receive/validate': {
    POST: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  },
  '/api/invoices/received': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  },
  '/api/invoices/received/[id]': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
    PUT: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_EDIT] },
    DELETE: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_DELETE] },
  },

  '/api/contacts': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_CREATE] },
  },
  '/api/contacts/[id]': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
    PUT: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_EDIT] },
    DELETE: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_DELETE] },
  },

  '/api/journal-entries': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_CREATE] },
  },
  '/api/journal-entries/[id]': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
    PUT: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_EDIT] },
    DELETE: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_CANCEL] },
  },

  '/api/ledger': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  },

  '/api/reports': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.REPORTS_VIEW] },
  },
  '/api/reports/annual-xbrl': {
    GET: { auth: true, requireCompany: true, blockOversight: true, requireTokenPay: true, permissions: [Permission.REPORTS_EXPORT] },
  },
  '/api/reports/annual-csv': {
    GET: { auth: true, requireCompany: true, blockOversight: true, requireTokenPay: true, permissions: [Permission.REPORTS_EXPORT] },
  },

  '/api/profit-loss': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.REPORTS_VIEW] },
  },

  '/api/budgets': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_CREATE] },
    PUT: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_EDIT] },
    DELETE: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_DELETE] },
  },
  '/api/budget-vs-actual': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.REPORTS_VIEW] },
  },

  '/api/cash-flow': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.REPORTS_VIEW] },
  },
  '/api/cash-flow-forecast': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.REPORTS_VIEW] },
  },
  '/api/account-trend': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.REPORTS_VIEW] },
  },
  '/api/financial-health': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.REPORTS_VIEW] },
  },
  '/api/aging-reports': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.REPORTS_VIEW] },
  },

  '/api/vat-register': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.REPORTS_VIEW] },
  },
  '/api/vat-report/submit': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.REPORTS_VIEW] },
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_CREATE] },
  },
  '/api/vat-report/submissions': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.REPORTS_VIEW] },
  },

  '/api/expense-categories': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  },
  '/api/exchange-rate': {
    GET: { auth: true },
  },

  '/api/recurring-entries': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_CREATE] },
    PUT: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_EDIT] },
    DELETE: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_DELETE] },
  },
  '/api/recurring-entries/execute': {
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_CREATE] },
  },

  '/api/fiscal-periods': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.PERIOD_CLOSE] },
  },
  '/api/fiscal-periods/[id]': {
    PUT: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.PERIOD_OPEN] },
  },

  '/api/year-end-closing': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.REPORTS_VIEW] },
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.YEAR_END_CLOSE] },
  },

  '/api/audit-logs': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  },

  '/api/ai-categorize': {
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_EDIT] },
  },

  // ═══════════════════════════════════════════════════════════
  // BANKING ROUTES
  // ═══════════════════════════════════════════════════════════

  '/api/bank-connections': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.BANK_CONNECT] },
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.BANK_CONNECT] },
  },
  '/api/bank-connections/[id]': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.BANK_CONNECT] },
    DELETE: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.BANK_CONNECT] },
    PATCH: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.BANK_CONNECT] },
  },
  '/api/bank-connections/[id]/sync': {
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.BANK_SYNC] },
  },
  '/api/bank-connections/[id]/consent': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.BANK_CONNECT] },
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.BANK_CONNECT] },
  },

  '/api/bank-reconciliation': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.BANK_SYNC] },
    PUT: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.BANK_SYNC] },
  },

  // ═══════════════════════════════════════════════════════════
  // DOCUMENT & RECEIPT ROUTES
  // ═══════════════════════════════════════════════════════════

  '/api/documents': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_CREATE] },
    DELETE: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_DELETE] },
  },
  '/api/documents/serve/[...path]': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  },
  '/api/documents/[id]': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
    DELETE: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_DELETE] },
  },
  '/api/receipts/[...path]': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  },

  // ═══════════════════════════════════════════════════════════
  // BACKUP & EXPORT ROUTES
  // ═══════════════════════════════════════════════════════════

  '/api/backups': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
    POST: { auth: true, requireCompany: true, blockOversight: true, requireTokenPay: true, permissions: [Permission.BACKUP_CREATE] },
  },
  '/api/backups/scheduler-status': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  },
  '/api/backups/download/[id]': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.BACKUP_CREATE] },
  },
  '/api/backups/upload-restore': {
    POST: { auth: true, requireCompany: true, blockOversight: true, requireTokenPay: true, permissions: [Permission.BACKUP_RESTORE] },
  },
  '/api/backups/[id]': {
    POST: { auth: true, requireCompany: true, blockOversight: true, requireTokenPay: true, permissions: [Permission.BACKUP_RESTORE] },
    DELETE: { auth: true, requireCompany: true, blockOversight: true, requireTokenPay: true, permissions: [Permission.BACKUP_CREATE] },
  },

  '/api/export-saft': {
    GET: { auth: true, requireCompany: true, requireTokenPay: true, permissions: [Permission.REPORTS_SAFT] },
  },
  '/api/export-tenant': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  },
  '/api/import-tenant': {
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.BACKUP_RESTORE] },
  },

  // ═══════════════════════════════════════════════════════════
  // COMPANY & MEMBERSHIP ROUTES
  // ═══════════════════════════════════════════════════════════

  '/api/company': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.COMPANY_VIEW_SETTINGS] },
    POST: { auth: true, blockOversight: true, requireTokenPay: true }, // Create new company
    PUT: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.COMPANY_EDIT_SETTINGS] },
    PATCH: { auth: true, requireCompany: true, blockOversight: true, requireSuperDev: true }, // SuperDev per-tenant flags (projectModeEnabled)
    DELETE: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.COMPANY_DELETE] },
  },
  '/api/company/switch': {
    POST: { auth: true, blockOversight: true, requireTokenPay: true },
  },
  '/api/company/export-info': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  },
  '/api/company/einvoice-register': {
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, permissions: [Permission.COMPANY_EDIT_SETTINGS] },
  },
  '/api/company/einvoice-settings': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.COMPANY_VIEW_SETTINGS] },
    PUT: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, permissions: [Permission.COMPANY_EDIT_SETTINGS] },
  },
  '/api/company/toggle-2fa': {
    POST: { auth: true, requireCompany: true, blockOversight: true, permissions: [Permission.COMPANY_EDIT_SETTINGS] },
  },

  '/api/companies': {
    GET: { auth: true },
  },
  '/api/companies/[id]/members': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.MEMBERS_VIEW] },
  },
  '/api/companies/[id]/members/[userId]': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.MEMBERS_VIEW] },
    PUT: { auth: true, requireCompany: true, blockOversight: true, permissions: [Permission.MEMBERS_CHANGE_ROLE] },
    DELETE: { auth: true, requireCompany: true, blockOversight: true, permissions: [Permission.MEMBERS_REMOVE] },
  },
  '/api/companies/[id]/invitations': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.MEMBERS_VIEW] },
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.MEMBERS_INVITE] },
  },
  '/api/companies/[id]/invitations/[inviteId]': {
    DELETE: { auth: true, requireCompany: true, blockOversight: true, permissions: [Permission.MEMBERS_REMOVE] },
  },

  // ═══════════════════════════════════════════════════════════
  // SUPERDEV / OVERSIGHT ROUTES
  // ═══════════════════════════════════════════════════════════

  '/api/oversight/switch': {
    POST: { auth: true, requireSuperDev: true },
  },
  '/api/oversight/clear': {
    POST: { auth: true, requireSuperDev: true },
  },
  '/api/oversight/tenants': {
    GET: { auth: true, requireSuperDev: true },
  },
  '/api/oversight/trial': {
    POST: { auth: true, requireSuperDev: true },
  },

  '/api/hermes/config': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.COMPANY_VIEW_SETTINGS] },
  },
  '/api/hermes/data-access': {
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, permissions: [Permission.COMPANY_EDIT_SETTINGS] },
  },
  '/api/hermes/tenants': {
    GET: { auth: true, requireSuperDev: true },
  },
  '/api/hermes/toggle': {
    POST: { auth: true, requireSuperDev: true, blockOversight: true },
  },

  // ═══════════════════════════════════════════════════════════
  // USER & NOTIFICATION ROUTES
  // ═══════════════════════════════════════════════════════════

  '/api/user/preferences': {
    GET: { auth: true, requireCompany: true, permissions: [Permission.COMPANY_VIEW_SETTINGS] },
    PUT: { auth: true, requireCompany: true, blockOversight: true, requireTokenPay: true, permissions: [Permission.COMPANY_EDIT_SETTINGS] },
  },

  '/api/notifications/read-state': {
    GET: { auth: true },
  },
  '/api/notifications/mark-read': {
    POST: { auth: true },
  },

  // ═══════════════════════════════════════════════════════════
  // TOKENPAY ACCESS ROUTES (now properly protected)
  // ═══════════════════════════════════════════════════════════

  '/api/proof-upload': {
    POST: { auth: true }, // Was unprotected — now requires auth
  },
  '/api/proof-activate': {
    POST: { auth: true }, // Was unprotected — now requires auth
  },
  '/api/access/[userId]': {
    GET: { auth: true }, // Was unprotected — now requires auth (route checks userId ownership)
  },
  '/api/access/[userId]/status': {
    GET: { auth: true }, // Was unprotected — now requires auth (route checks userId ownership)
  },
  '/api/messages/[userId]': {
    GET: { auth: true }, // Was unprotected — now requires auth (route checks userId ownership)
  },

  // ═══════════════════════════════════════════════════════════
  // COMPUTE-INTENSIVE ROUTES (now properly protected)
  // ═══════════════════════════════════════════════════════════

  '/api/ocr/pdf': {
    POST: { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.DATA_CREATE] }, // Was unprotected
  },
  '/api/pdf-to-png': {
    POST: { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] }, // Was unprotected
  },

  // ═══════════════════════════════════════════════════════════
  // MISC ROUTES
  // ═══════════════════════════════════════════════════════════

  '/api/demo-mode': {
    GET: { auth: true },
    POST: { auth: true, blockOversight: true },
  },
  '/api/demo-seed': {
    POST: { auth: true, requireCompany: true, blockOversight: true, requireTokenPay: true, permissions: [Permission.DATA_CREATE] },
  },

  '/api/widget-settings': {
    GET: { auth: true },
    PUT: { auth: true, blockOversight: true, blockDemo: true },
  },

  '/api/invitations/verify': {
    GET: { auth: true },
  },
  '/api/invitations/accept': {
    POST: { auth: true, blockOversight: true, requireTokenPay: true },
  },

  '/api/trial/start': {
    POST: { auth: true, blockOversight: true, blockDemo: true },
  },

  // ── Project Mode (FASE 4) ──
  // Enter/exit project context. The SuperDev gate (projectModeEnabled) is
  // enforced inside the handler because it is a per-tenant DB flag, not a
  // guard-chain concern.
  '/api/project-mode': {
    GET: { auth: true },
    POST: { auth: true, requireCompany: true, blockOversight: true },
  },
};
