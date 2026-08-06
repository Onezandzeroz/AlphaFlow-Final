/**
 * Legal constants — Terms of Service versioning (FASE 6)
 *
 * Single source of truth for the current terms-of-service version. Used by:
 *   - The subscription-plans-prompt (sent in the consent payload)
 *   - The /api/subscription/create-payment route (validated + stored in ConsentLog)
 *   - The subscription-welcome email (displayed to the customer as receipt)
 *   - The terms-change broadcast (oldVersion → newVersion comparison)
 *
 * WHY VERSIONING MATTERS:
 *   Consent is only legally valid against the SPECIFIC version the user agreed
 *   to. If we update the terms, we must either:
 *     (a) obtain fresh consent from existing users, OR
 *     (b) notify them of the change and allow cancellation (Forbrugeraftaleloven §14).
 *   The version string lets us produce evidence of EXACTLY which terms a given
 *   customer accepted at a given point in time.
 *
 * VERSIONING SCHEME:
 *   "<YYYY-MM-DD>-v<n>"  e.g. "2026-05-v1"
 *   - Bump the date when the terms content changes
 *   - Bump the version number for same-day corrections
 *
 * BUMP INSTRUCTIONS:
 *   1. Update the terms content in src/components/legal/terms-of-service.tsx
 *      (the "lastUpdated" field and any changed sections)
 *   2. Update CURRENT_TERMS_VERSION below
 *   3. Optionally run the terms-change broadcast (see scripts/ for a future
 *      helper) to notify all active subscribers
 */

// The terms version currently in force. Match this to the "lastUpdated" date
// in src/components/legal/terms-of-service.tsx (currently "maj 2026").
export const CURRENT_TERMS_VERSION = '2026-05-v1';

// The date the current terms took effect.
export const CURRENT_TERMS_EFFECTIVE_DATE = '2026-05';

// The previous terms version (used by the terms-change broadcast to populate
// the "oldVersion" field). Update this when bumping CURRENT_TERMS_VERSION.
export const PREVIOUS_TERMS_VERSION: string | null = null;

/**
 * Get the current terms version. Exposed as a function (not a constant) so
 * that future implementations can read it from the database if we move to
 * dynamic terms management. For now it returns the compile-time constant.
 */
export function getCurrentTermsVersion(): string {
  return CURRENT_TERMS_VERSION;
}

/**
 * The URL where the full terms of service can be read. Used in email footers
 * and the consent checkbox UI.
 */
export function getTermsUrl(appUrl?: string): string {
  const base = appUrl || process.env.APP_URL || 'https://alphaflow.dk';
  return `${base}/legal/terms`;
}
