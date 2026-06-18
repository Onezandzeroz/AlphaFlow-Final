/**
 * Bilingual API Error Handler
 *
 * Maps backend error codes to user-facing bilingual messages.
 * Backend returns JSON with `error` (English) and optional `code` field.
 * This utility translates those codes to DA/ENG using the translation system.
 */

import { Language } from './language-store';
import { t } from './translations';

export interface ApiError {
  status: number;
  code?: string;
  message: string;
  translatedMessage: string;
  translatedTitle?: string;
}

/** Known error code → translation key mapping */
const ERROR_CODE_MAP: Record<string, { titleKey?: string; messageKey: string }> = {
  // TokenPay access errors
  ACCESS_DENIED: {
    titleKey: 'accessDeniedTitle',
    messageKey: 'accessDeniedDescription',
  },
  ACCESS_EXPIRED: {
    titleKey: 'accessDeniedExpiredTitle',
    messageKey: 'accessExpiredDescription',
  },

  // RBAC errors
  DEMO_COMPANY_READ_ONLY: {
    messageKey: 'demoCompanyReadOnly',
  },
  OVERSIGHT_READ_ONLY: {
    messageKey: 'oversightReadOnly',
  },
  REQUIRES_APP_OWNER: {
    messageKey: 'insufficientPermissions',
  },
};

/** HTTP status → fallback translation key */
const STATUS_FALLBACK: Partial<Record<number, string>> = {
  400: 'anErrorOccurred',
  401: 'authenticationRequired',
  403: 'insufficientPermissions',
  404: 'anErrorOccurred',
  429: 'anErrorOccurred',
  500: 'anErrorOccurred',
};

/**
 * Parse an API error response and return a bilingual error object.
 *
 * @example
 * const res = await fetch('/api/transactions', { method: 'POST', ... });
 * if (!res.ok) {
 *   const body = await res.json();
 *   const err = parseApiError(body, res.status, language);
 *   toast.error(err.translatedTitle || err.translatedMessage);
 * }
 */
export function parseApiError(
  body: Record<string, unknown>,
  status: number,
  language: Language
): ApiError {
  const code = body.code as string | undefined;
  const rawMessage = (body.error as string) || `Error ${status}`;

  // Try exact code match first
  if (code && ERROR_CODE_MAP[code]) {
    const mapping = ERROR_CODE_MAP[code];
    return {
      status,
      code,
      message: rawMessage,
      translatedMessage: t(mapping.messageKey as Parameters<typeof t>[0], language),
      translatedTitle: mapping.titleKey
        ? t(mapping.titleKey as Parameters<typeof t>[0], language)
        : undefined,
    };
  }

  // Fallback to HTTP status-based translation
  const fallbackKey = STATUS_FALLBACK[status];
  if (fallbackKey) {
    // For error-class statuses (400/404/429/500) prefer the server's own
    // descriptive `error` message when present — it is almost always more
    // actionable than the generic "an error occurred" translation (e.g. a
    // Prisma validation message or route-specific validation text). Auth
    // statuses (401/403) keep their friendly translated text.
    const preferServerMessage = fallbackKey === 'anErrorOccurred';
    const serverMessage = body.error as string | undefined;
    return {
      status,
      code,
      message: rawMessage,
      translatedMessage:
        preferServerMessage && serverMessage && serverMessage.trim()
          ? serverMessage
          : t(fallbackKey as Parameters<typeof t>[0], language),
    };
  }

  // Generic fallback — prefer the server's own error message when available
  // (e.g. Prisma validation messages, route-specific validation text) so the
  // user sees what actually went wrong instead of a misleading generic toast.
  const serverMessage = body.error as string | undefined;
  return {
    status,
    code,
    message: rawMessage,
    translatedMessage:
      serverMessage && serverMessage.trim()
        ? serverMessage
        : t('anErrorOccurred', language),
  };
}

/**
 * Check if an API response is a TokenPay access denial.
 * Returns true for ACCESS_DENIED or ACCESS_EXPIRED codes.
 */
export function isAccessDenied(body: Record<string, unknown>): boolean {
  const code = body.code as string | undefined;
  return code === 'ACCESS_DENIED' || code === 'ACCESS_EXPIRED';
}

/**
 * Extract error info from a fetch Response and return translated messages.
 * Convenience wrapper that parses JSON and calls parseApiError.
 */
export async function handleApiError(
  res: Response,
  language: Language
): Promise<ApiError> {
  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    // JSON parse failed
  }
  return parseApiError(body, res.status, language);
}
