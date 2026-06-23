/**
 * Translate system-generated reason strings stored in the database.
 *
 * Backend APIs sometimes store English-only fallback strings (e.g. when no
 * reason was supplied by the user). This helper maps those known keys to
 * localized DA/EN labels so the UI always respects the active language.
 *
 * IMPORTANT: New system-generated reasons should use a `SYSTEM:` prefix
 * (e.g. `SYSTEM:USER_REQUESTED`) so they can be identified and translated
 * on the frontend without ambiguity.
 */

const SYSTEM_REASON_MAP: Record<string, { da: string; en: string }> = {
  // ── Cancel reasons (from transactions, invoices, journal-entries APIs) ──
  'User requested cancellation': {
    da: 'Annulleret af bruger',
    en: 'User requested cancellation',
  },
  'Cancelled via DELETE request': {
    da: 'Annulleret via sletteanmodning',
    en: 'Cancelled via DELETE request',
  },
  'Full data reset by user': {
    da: 'Fuld nulstilling af data af bruger',
    en: 'Full data reset by user',
  },

  // ── Future-proof: SYSTEM:-prefixed keys ──
  'SYSTEM:USER_REQUESTED': {
    da: 'Annulleret af bruger',
    en: 'User requested cancellation',
  },
  'SYSTEM:DELETE_REQUEST': {
    da: 'Annulleret via sletteanmodning',
    en: 'Cancelled via DELETE request',
  },
  'SYSTEM:DATA_RESET': {
    da: 'Fuld nulstilling af data af bruger',
    en: 'Full data reset by user',
  },
  'SYSTEM:DUPLICATE_INVOICE': {
    da: 'Dublet faktura – annulleret',
    en: 'Duplicate invoice – cancelled',
  },
  'Dublet faktura – annulleret': {
    da: 'Dublet faktura – annulleret',
    en: 'Duplicate invoice – cancelled',
  },
};

/**
 * Translate a system-generated reason string.
 * If the reason is a known system key, returns the localized version.
 * If not found (user-typed reason), returns the original string unchanged.
 */
export function translateSystemReason(reason: string | null | undefined, language: 'da' | 'en'): string {
  if (!reason) return '';
  const mapping = SYSTEM_REASON_MAP[reason];
  if (mapping) return mapping[language];
  return reason;
}

/**
 * Check whether a reason string is a known system-generated key
 * (as opposed to a user-typed reason that should be displayed verbatim).
 */
export function isSystemReason(reason: string | null | undefined): boolean {
  if (!reason) return false;
  return reason in SYSTEM_REASON_MAP;
}
