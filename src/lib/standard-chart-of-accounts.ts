/**
 * SKAT Fællesoffentlig Standardkontoplan — Helpers + VAT-kodemapping
 *
 * Den nyeste reviderede standardkontoplan (2026, 603 konti) er defineret i
 * `./official-standard-chart.ts` (`OFFICIAL_STANDARD_CHART`) og er den eneste
 * standardkontoplan der benyttes i AlphaFlow (Erhvervsstyrelsen krav: kun den
 * nyeste reviderede).
 *
 * Dette modul eksporterer:
 *   - Types: `StandardAccount`, `StandardAccountType`
 *   - Helpers: `getStandardAccount`, `getStandardAccountsByType`,
 *     `getVATAccounts`, `suggestStandardMapping`, `buildAutoMapping`
 *   - VAT-kodemapping: `VAT_CODE_TO_PUBLIC_MAPPING`, `getPublicVATCode`
 */

// ─── Types ────────────────────────────────────────────────────────────────

import { OFFICIAL_STANDARD_CHART } from './official-standard-chart';
import { VALIDATED_MAPPING as FSR_DIRECT_MAPPING } from './fsr-official-mapping';

export interface StandardAccount {
  number: string
  name: string
  nameEn: string
  type: StandardAccountType
  description: string
  /** Suggested FSR account numbers for auto-mapping */
  suggestedFSR?: string[]
}

export type StandardAccountType =
  | 'EXPENSE'        // Driftsomkostninger
  | 'REVENUE'        // Driftsindtægter
  | 'INVENTORY'      // Varelager / vareforbrug
  | 'ASSET'          // Aktiver
  | 'LIABILITY'      // Gæld
  | 'EQUITY'         // Egenkapital
  | 'FINANCIAL'      // Finansielle poster
  | 'TAX'            // Skat og moms
  | 'YEAR_END'       // Årsafslutning
  | 'STATISTICAL'    // Statistiske konti

// ─── Helper Functions ────────────────────────────────────────────────────

/**
 * Get a standard account by number.
 *
 * Searches the official 2026 standardkontoplan (603 accounts) — den eneste
 * standardkontoplan der benyttes i AlphaFlow.
 */
export function getStandardAccount(number: string): StandardAccount | undefined {
  return OFFICIAL_STANDARD_CHART.find(a => a.number === number)
}

/**
 * Get all standard accounts grouped by type
 */
export function getStandardAccountsByType(): Record<StandardAccountType, StandardAccount[]> {
  const grouped: Record<string, StandardAccount[]> = {}
  for (const account of OFFICIAL_STANDARD_CHART) {
    if (!grouped[account.type]) {
      grouped[account.type] = []
    }
    grouped[account.type].push(account)
  }
  return grouped as Record<StandardAccountType, StandardAccount[]>
}

/**
 * Get standard accounts in the 7xxx range (VAT/Tax accounts)
 */
export function getVATAccounts(): StandardAccount[] {
  return OFFICIAL_STANDARD_CHART.filter(a => a.number.startsWith('7'))
}

/**
 * Get auto-mapping suggestions from FSR account number to standard account
 */
export function suggestStandardMapping(fsrNumber: string): StandardAccount | null {
  for (const stdAccount of OFFICIAL_STANDARD_CHART) {
    if (stdAccount.suggestedFSR?.includes(fsrNumber)) {
      return stdAccount
    }
  }
  return null
}

/**
 * Build a complete auto-mapping from all FSR accounts to standard accounts.
 * Returns a Map<fsrNumber, standardNumber>.
 */
export function buildAutoMapping(
  fsrAccounts: Array<{ number: string; name: string; type: string; group: string }>,
): Map<string, string> {
  const mapping = new Map<string, string>()

  // Phase 0: Direct FSR number lookup from the hardcoded AlphaFlow mapping table.
  //
  // This table maps AlphaFlow's standard FSR account numbers (1xxx-9xxx from
  // seed-chart-of-accounts.ts) directly to the correct official 2026
  // Standardkontoplan numbers — no heuristics, no guessing.
  //
  // Only accounts not in this table fall through to Phase 1 (FSR_SUGGESTIONS)
  // and Phase 2 (heuristics).
  for (const fsr of fsrAccounts) {
    const direct = FSR_DIRECT_MAPPING[fsr.number];
    if (direct) {
      mapping.set(fsr.number, direct);
      continue;
    }
  }

  // Phase 1: Exact FSR number match from suggestions (fallback)
  for (const fsr of fsrAccounts) {
    if (mapping.has(fsr.number)) continue;
    const suggestion = suggestStandardMapping(fsr.number)
    if (suggestion) {
      mapping.set(fsr.number, suggestion.number);
      continue;
    }
  }

  // Phase 2: Type/group heuristics for remaining unmapped accounts.
  // Only used for accounts NOT in the hardcoded table — handles custom
  // accounts the user created beyond the standard seed chart.
  const findOfficial = (num: string) =>
    OFFICIAL_STANDARD_CHART.find((a) => a.number === num)

  for (const fsr of fsrAccounts) {
    if (mapping.has(fsr.number)) continue

    let candidate: StandardAccount | undefined

    switch (fsr.type) {
      case 'ASSET':
        if (fsr.group === 'BANK') candidate = findOfficial('6480')
        else if (fsr.group === 'RECEIVABLES') candidate = findOfficial('6183')
        else if (fsr.group === 'INVENTORY') candidate = findOfficial('6075')
        else if (fsr.group === 'INPUT_VAT') candidate = findOfficial('6320')
        break

      case 'LIABILITY':
        if (fsr.group === 'OUTPUT_VAT') candidate = findOfficial('7840')
        else if (fsr.group === 'SHORT_TERM_DEBT') candidate = findOfficial('7330')
        else if (fsr.group === 'LONG_TERM_DEBT') candidate = findOfficial('7120')
        break

      case 'EQUITY':
        if (fsr.group === 'RETAINED_EARNINGS') candidate = findOfficial('6931')
        break

      case 'REVENUE':
        if (fsr.group === 'SALES_REVENUE') candidate = findOfficial('1010')
        else if (fsr.group === 'OTHER_REVENUE') candidate = findOfficial('1500')
        break

      case 'EXPENSE':
        if (fsr.group === 'COST_OF_GOODS') candidate = findOfficial('1610')
        else if (fsr.group === 'PERSONNEL') candidate = findOfficial('2842')
        else if (fsr.group === 'OTHER_OPERATING') candidate = findOfficial('2810')
        break
    }

    if (candidate) {
      mapping.set(fsr.number, candidate.number)
    }
  }

  return mapping
}

// ─── VAT Code Mapping (intern → SKAT offentlig) ─────────────────────────

/**
 * Mapping fra interne VAT codes til SKAT's offentlige momskoder.
 * Bruges for e-invoicing (OIOUBL) og momsindberetning.
 */
export const VAT_CODE_TO_PUBLIC_MAPPING: Record<string, {
  publicCode: string
  publicName: string
  rate: number
  description: string
}> = {
  S25: {
    publicCode: 'U25',
    publicName: 'Udgående moms 25%',
    rate: 25,
    description: 'Salgsmoms indenlands — standard sats 25%',
  },
  S12: {
    publicCode: 'U12',
    publicName: 'Udgående moms 12%',
    rate: 12,
    description: 'Salgsmoms indenlands — nedsat sats 12%',
  },
  S0: {
    publicCode: 'U0',
    publicName: 'Udgående moms 0%',
    rate: 0,
    description: 'Salgsmoms 0% (fritaget) ikke EU',
  },
  SEU: {
    publicCode: 'UE',
    publicName: 'EU-omsætning (IGS)',
    rate: 0,
    description: 'Salg til EU-land med CVR (Udgående EU, IGS)',
  },
  K25: {
    publicCode: 'I25',
    publicName: 'Indgående moms 25%',
    rate: 25,
    description: 'Købsmoms — standard sats 25%',
  },
  K12: {
    publicCode: 'I12',
    publicName: 'Indgående moms 12%',
    rate: 12,
    description: 'Købsmoms — nedsat sats 12%',
  },
  K0: {
    publicCode: 'I0',
    publicName: 'Indgående moms 0%',
    rate: 0,
    description: 'Købsmoms 0% (fritaget)',
  },
  KEU: {
    publicCode: 'IE',
    publicName: 'Indkøb EU (IGF)',
    rate: 25,
    description: 'Indkøb fra EU-land (Indgående EU, IGF) — omvendt betalingspligt',
  },
  KUF: {
    publicCode: 'IF',
    publicName: 'Indkøb udenfor EU (Import)',
    rate: 25,
    description: 'Import fra land udenfor EU — omvendt betalingspligt',
  },
  NONE: {
    publicCode: 'N',
    publicName: 'Ingen moms',
    rate: 0,
    description: 'Momsfritaget eller ikke momspligtig',
  },
}

/**
 * Get the public VAT code for an internal VAT code
 */
export function getPublicVATCode(internalCode: string): typeof VAT_CODE_TO_PUBLIC_MAPPING[string] | undefined {
  return VAT_CODE_TO_PUBLIC_MAPPING[internalCode]
}
