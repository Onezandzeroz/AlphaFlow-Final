/**
 * VAT Codes — pure constants, safe for both client and server.
 *
 * This file is deliberately FREE of any `db` / `@prisma/client` imports so it
 * can be imported from client components without pulling Prisma into the
 * browser bundle (which crashes with "Extensions.defineExtension is unable to
 * run in this browser environment").
 *
 * Server-only VAT functions (computeVATRegister, enrichTransactionsWithVAT,
 * enrichInvoicesWithVAT) live in vat-utils.ts and MUST NOT be imported from
 * client code. This file holds only the pure data definitions they share.
 *
 * VAT Code Mapping (Prisma enum):
 *   Output (salg):  S25, S12, S0, SEU
 *   Input (køb):    K25, K12, K0, KEU, KUF
 *   Special:        NONE
 */

// ─── Single canonical VAT definitions ────────────────────────────────────────

/** VAT code → rate mapping — the ONLY place this is defined */
export const VAT_RATE_MAP: Record<string, number> = {
  S25: 25, S12: 12, S0: 0, SEU: 0,
  K25: 25, K12: 12, K0: 0, KEU: 0, KUF: 0, NONE: 0,
};

/** Output VAT codes (udgående / salgsmoms) */
export const OUTPUT_VAT_CODES = ['S25', 'S12', 'S0', 'SEU'] as const;
/** Input VAT codes (indgående / købsmoms) */
export const INPUT_VAT_CODES = ['K25', 'K12', 'K0', 'KEU', 'KUF'] as const;

/** Valid VAT percentages for Danish tax — the ONLY place this set is defined */
export const VALID_VAT_PERCENTAGES = [0, 12, 25] as const;
