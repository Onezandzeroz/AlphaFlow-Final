/**
 * AI-assisted standard account mapping.
 *
 * Uses OpenRouter (LLM) to intelligently map a company's FSR chart of
 * accounts to the official 2026 Standardkontoplanen (603 accounts).
 *
 * Strategy:
 *   1. Phase 1 (heuristic): Exact FSR suggestions + type/group heuristics
 *      from buildAutoMapping() — instant, no LLM cost, handles the obvious
 *      cases (Bank → 3120, Kreditorer → 5710, etc.)
 *   2. Phase 2 (LLM): For accounts Phase 1 couldn't map confidently, send
 *      the account + its siblings + the relevant slice of the official
 *      chart to the LLM, which returns a JSON mapping with confidence
 *      scores and reasoning.
 *
 * Why LLM for this:
 *   The old heuristic-only mapper used the LEGACY PUBLIC_STANDARD_CHART
 *   (69 accounts, 0xxx-9xxx public-sector numbering) instead of the
 *   OFFICIAL_STANDARD_CHART (603 accounts, 1xxx-8xxx). This caused
 *   catastrophic mismatches — e.g. "Bank" (FSR 1100) was mapped to
 *   standard account 3200, which in the official chart is "Øvrige
 *   indtægter af kapitalandele i tilknyttede virksomheder" (financial
 *   income) — not "Bankindeståender" as the old chart said.
 *
 *   The LLM reads the account NAME and understands semantics — it knows
 *   that "Bankkonto" should map to 3120 (Bankindeståender) in the official
 *   chart, not 3200 (financial income). This is especially valuable for
 *   accounts with non-obvious names like "Driftskonto" or "Fælleskonto".
 */

import { callOpenRouter, LLMError } from '@/lib/openrouter';
import { logger } from '@/lib/logger';
import { OFFICIAL_STANDARD_CHART } from '@/lib/official-standard-chart';
import type { StandardAccount } from '@/lib/standard-chart-of-accounts';

export interface AiMappingResult {
  /** Map: FSR account number → standard account number */
  mapping: Map<string, string>;
  /** Per-account reasoning (for audit log / debugging) */
  reasons: Map<string, string>;
  /** How many accounts the LLM mapped (vs left unmapped) */
  llmMappedCount: number;
  /** How many accounts were skipped (already mapped by Phase 1) */
  heuristicMappedCount: number;
  /** Whether the LLM call succeeded (false = fallback to heuristic only) */
  usedLlm: boolean;
}

interface FsrAccount {
  number: string;
  name: string;
  type: string;
  group: string;
}

// Only send the LLM the accounts it needs to decide on — never all 603.
// We slice by type so the LLM sees a focused, manageable context.
const MAX_ACCOUNTS_PER_LLM_CALL = 80;

/**
 * Build an AI-assisted mapping for FSR accounts that the heuristic mapper
 * could not handle.
 *
 * @param allAccounts       All FSR accounts (the company's chart)
 * @param heuristicMapping  Phase 1 result — accounts already mapped heuristically
 * @returns AI mapping result with reasoning per account
 */
export async function buildAiMapping(
  allAccounts: FsrAccount[],
  heuristicMapping: Map<string, string>,
): Promise<AiMappingResult> {
  const mapping = new Map<string, string>(heuristicMapping);
  const reasons = new Map<string, string>();

  // Accounts the heuristic mapper couldn't handle
  const unmapped = allAccounts.filter((a) => !heuristicMapping.has(a.number));

  if (unmapped.length === 0) {
    return {
      mapping,
      reasons,
      llmMappedCount: 0,
      heuristicMappedCount: heuristicMapping.size,
      usedLlm: false,
    };
  }

  try {
    const llmResult = await callLlmForMapping(unmapped);
    if (!llmResult) {
      return {
        mapping,
        reasons,
        llmMappedCount: 0,
        heuristicMappedCount: heuristicMapping.size,
        usedLlm: false,
      };
    }

    let llmMappedCount = 0;
    for (const item of llmResult) {
      // Validate: standard account must exist in the official chart
      const stdExists = OFFICIAL_STANDARD_CHART.some(
        (a) => a.number === item.standardNumber,
      );
      if (!stdExists) {
        logger.warn(
          `[AI_MAPPING] LLM returned unknown standard account ${item.standardNumber} for FSR ${item.fsrNumber} — skipping`,
        );
        continue;
      }
      mapping.set(item.fsrNumber, item.standardNumber);
      reasons.set(item.fsrNumber, item.reason || 'LLM-mapped');
      llmMappedCount++;
    }

    return {
      mapping,
      reasons,
      llmMappedCount,
      heuristicMappedCount: heuristicMapping.size,
      usedLlm: true,
    };
  } catch (err) {
    const isLlmError = err instanceof LLMError;
    logger.warn(
      `[AI_MAPPING] LLM mapping failed (${isLlmError ? err.kind : 'unknown'}), falling back to heuristic-only`,
    );
    return {
      mapping,
      reasons,
      llmMappedCount: 0,
      heuristicMappedCount: heuristicMapping.size,
      usedLlm: false,
    };
  }
}

// ─── LLM call ────────────────────────────────────────────────────────────

interface LlmMappingItem {
  fsrNumber: string;
  standardNumber: string;
  reason: string;
}

async function callLlmForMapping(
  accounts: FsrAccount[],
): Promise<LlmMappingItem[] | null> {
  // If too many accounts, slice to keep the prompt under token limits.
  // The LLM sees the account list + the relevant slice of the official chart.
  const accountsToSend = accounts.slice(0, MAX_ACCOUNTS_PER_LLM_CALL);

  // Build a compact list of the official chart for the prompt.
  // We only send number + name + type to keep token usage low.
  const officialChart = OFFICIAL_STANDARD_CHART.map(
    (a) => `${a.number} ${a.name} [${a.type}]`,
  ).join('\n');

  const accountList = accountsToSend
    .map(
      (a) =>
        `${a.number} ${a.name} [type=${a.type} group=${a.group}]`,
    )
    .join('\n');

  const prompt = `Du er en dansk bogholderi-ekspert med dyb viden om SKATs fællesoffentlige Standardkontoplan (2026-versionen).

Opgave: Map hver af virksomhedens konti (FSR) til den bedst matchende konto i Standardkontoplanen.

VIRKSOMHEDENS KONTI (FSR):
${accountList}

OFFICIEL STANDARDKONTOPLAN (603 konti):
${officialChart}

Regler:
- Map KUN til konti der findes i den officielle standardkontoplan ovenfor
- Brug kontonummeret (f.eks. "3120") som standardNumber
- Vælg den konto der bedst matcher SEMANTISK ud fra FSR-kontoens navn, type og gruppe
- Eksempler: "Bankkonto" → 3120 (Bankindeståender), "Kreditorer" → 5710 (Skyldige leverandører), "Salg" → 1010 (Salg af varer og ydelser), "Lønninger" → 2000 (Lønninger til fastansatte), "Varekøb" → 1610 (Varekøb), "Husleje" → 2030 (Husleje)
- Hvis en FSR-konto ikke har et klart match, udelad den fra svaret

Svar KUN med JSON i dette format (ingen markdown, ingen forklaring):
{"mappings": [{"fsrNumber": "1100", "standardNumber": "3120", "reason": "Bankkonto matcher Bankindeståender"}, ...]}`;

  const content = await callOpenRouter(
    [{ role: 'user', content: prompt }],
    { temperature: 0.1, maxTokens: 4096 },
  );

  const parsed = parseJsonLoose(content);
  if (!parsed || !Array.isArray(parsed.mappings)) {
    logger.warn('[AI_MAPPING] LLM returned malformed JSON, ignoring');
    return null;
  }

  return parsed.mappings
    .filter(
      (m: any) =>
        typeof m.fsrNumber === 'string' &&
        typeof m.standardNumber === 'string',
    )
    .map((m: any) => ({
      fsrNumber: String(m.fsrNumber).trim(),
      standardNumber: String(m.standardNumber).trim(),
      reason: typeof m.reason === 'string' ? m.reason : 'LLM-mapped',
    }));
}

function parseJsonLoose(content: string): any | null {
  if (!content) return null;
  // Strip ```json fences if the model wrapped the response.
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : content;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}
