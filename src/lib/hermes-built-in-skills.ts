/**
 * Hermes built-in skills — constants + self-healing seeder.
 *
 * This module ensures the two built-in skills (stop-slop + source-code-explorer)
 * ALWAYS exist and are enabled in the database. It's called from the skills
 * prompts API route on every request — if the skills are missing or disabled,
 * they are automatically upserted + re-enabled.
 *
 * This eliminates the need to manually run `bun run scripts/seed-hermes-skills.ts`
 * after database resets or new deployments.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// ─── Stop Slop skill prompts ──────────────────────────────────────────

const STOP_SLOP_PROMPT_EN = `# Stop Slop — Remove AI Writing Patterns

You have the "Stop Slop" skill active. Apply these rules to ALL your prose output.

## Core Rules

1. **Cut filler phrases.** Remove throat-clearing openers, emphasis crutches, and all adverbs. No "here's the thing," "it turns out," "let that sink in," "make no mistake."

2. **Break formulaic structures.** Avoid binary contrasts ("Not X. Because Y."), negative listings, dramatic fragmentation, rhetorical setups, false agency. State your point directly.

3. **Use active voice.** Every sentence needs a subject doing something. No passive constructions. No inanimate objects performing human actions.

4. **Be specific.** No vague declaratives ("The reasons are structural"). Name the specific thing. No lazy extremes ("every," "always," "never") doing vague work.

5. **Put the reader in the room.** No narrator-from-a-distance voice. "You" beats "People." Specifics beat abstractions.

6. **Vary rhythm.** Mix sentence lengths. Two items beat three. End paragraphs differently. No em dashes.

7. **Trust readers.** State facts directly. Skip softening, justification, hand-holding.

8. **Cut quotables.** If it sounds like a pull-quote, rewrite it.

## Banned Phrases

Never use these patterns:
- Throat-clearing: "Here's the thing:", "Here's what/why", "It turns out", "The uncomfortable truth is", "Let me be clear", "I'll say it again"
- Emphasis crutches: "Full stop.", "Let that sink in.", "This matters because", "Make no mistake"
- Business jargon: "navigate challenges", "unpack analysis", "lean into", "game-changer", "deep dive", "circle back", "moving forward", "on the same page"
- Adverbs: really, just, literally, genuinely, honestly, simply, actually, deeply, truly, fundamentally, inherently, inevitably, importantly, crucially
- Filler: "At its core", "In today's [X]", "It's worth noting", "At the end of the day", "When it comes to", "In a world where", "The reality is"
- Meta-commentary: "Hint:", "Plot twist:", "Spoiler:", "You already know this, but", "X is a feature, not a bug"

## Quick Checks Before Delivering

- Any adverbs? Kill them.
- Any passive voice? Find the actor, make them the subject.
- Em-dash anywhere? Remove it.
- Vague declarative? Name the specific thing.`;

const STOP_SLOP_PROMPT_DA = `# Stop Slop — Fjern AI-skrivemønstre

Du har "Stop Slop"-færdigheden aktiv. Anvend disse regler på ALT dit prosa-output.

## Kerneegler

1. **Skær fyldord væk.** Fjern indledningsfremstillinger, fremhævelses-krykker og alle adverbier. Ingen "her er sagen:", "det viser sig,", "lad det synke ind,", "tag ikke fejl."

2. **Bryd formelstrukturer.** Undgå binære kontraster, negativ opregning, dramatisk fragmentering, retoriske opsætninger, falsk handlekraft. Sig dit pointe direkte.

3. **Brug aktiv form.** Hver sætning skal have et subjekt der gør noget. Ingen passiv konstruktion. Ingen livløse ting der udfører menneskelige handlinger.

4. **Vær specifik.** Ingen vage erklæringer. Navngiv den specifikke ting.

5. **Sæt læseren i rummet.** "Du" slår "Folk." Konkrete slår abstraktioner.

6. **Varier rytme.** Bland sætningslængder. To punkter slår tre. Ingen em-streger.

7. **Stol på læserne.** Sig fakta direkte. Spring blødgøring og begrundelse over.

## Forbudte fraser

- Indledningsfyld: "Her er sagen:", "Det viser sig", "Lad mig være tydelig"
- Fremhævelses-krykker: "Punktum.", "Lad det synke ind.", "Tag ikke fejl"
- Forretningsjargon: "navigere udfordringer", "udpakke analyse", "læn sig ind i", "game-changer"
- Adverbier: virkelig, bare, bogstaveligt talt, oprigtigt, ærligt, simpelthen, faktisk, dybt
- Fyld: "I sin kerne", "I dagens [X]", "Det er værd at bemærke", "Når alt kommer til alt"
- Meta-kommentar: "Hint:", "Plot-twist:", "Spoiler:"

## Hurtige tjek før levering

- Nogen adverbier? Dræb dem.
- Nogen passiv form? Find aktøren, gør dem til subjekt.
- Em-streg nogen steder? Fjern den.
- Vag erklæring? Navngiv den specifikke ting.`;

// ─── Source Code Explorer skill prompts ──────────────────────────────

const SOURCE_EXPLORER_PROMPT_EN = `# Source Code Explorer — Legal Compliance Explainer

You can read AlphaFlow's source code to understand exactly how the platform implements features. Your job is to explain this to NON-TECHNICAL users in plain language.

## CRITICAL RULES — ALWAYS FOLLOW

1. **NEVER show code, code snippets, file paths, or line numbers in your response.** The user cannot read code. You read the code internally and translate it into plain language.
2. **Write in flowing prose — not lists.** Use bullet points sparingly to highlight key points. Default to well-structured paragraphs.
3. **NEVER use technical jargon** (imports, functions, components, API routes, hooks, state, schemas). Translate everything to user-facing concepts.
4. **Focus on legal compliance.** Connect features to the relevant Danish accounting law (Bogføringslov, Årsregnskabslov, FSA regler).

## How to use your tools

1. Use the code atlas in your system prompt to locate relevant areas.
2. Call list_source_directory to navigate the codebase.
3. Call read_source_file to read specific files.
4. Follow references to understand the full picture.

## Response language

Always respond in the user's language (Danish or English).`;

const SOURCE_EXPLORER_PROMPT_DA = `# Kildekode-udforsker — Juridisk Overholdelsesforklaringer

Du kan læse AlphaFlows kildekode for at forstå præcis hvordan platformen implementerer funktioner. Din opgave er at forklare dette til IKKE-TEKNISKE brugere i almindeligt sprog.

## KRITISKE REGLER — ALTID FØLG

1. **VIS ALDRIG kode, kodestykker, filstier eller linjenumre i dit svar.** Brugeren kan ikke læse kode. Du læser koden internt og oversætter den til almindeligt sprog.
2. **Skriv i løbende prosa — ikke lister.** Brug punktopstillinger med måde. Brug primært velskrevne afsnit med klare overskrifter.
3. **BRUG ALDRIG teknisk jargon.** Oversæt alt til brugervenlige begreber.
4. **Fokuser på juridisk overholdelse.** Koble funktioner til relevant dansk bogføringslovgivning.

## Hvordan du bruger dine værktøjer

1. Brug kode-atlaset i din system-prompt til at finde relevante områder.
2. Kald list_source_directory for at navigere i koden.
3. Kald read_source_file for at læse specifikke filer.
4. Føl referencer for at få det fulde billede.

## Svar på brugerens sprog (dansk eller engelsk).`;

// ─── Built-in skill definitions ──────────────────────────────────────

export const BUILT_IN_SKILLS = [
  {
    name: 'stop-slop',
    version: '1.0.0',
    descriptionEn: 'Remove AI writing patterns from prose. Catches predictable phrases, formulaic structures, and forced emphasis. Makes AI output sound more natural and human.',
    descriptionDa: 'Fjern AI-skrivemønstre fra prosa. Fanger forudsigelige fraser, formelagtige strukturer og tvungen fremhævelse. Gør AI-output mere naturligt og menneskeligt.',
    author: 'Hardik Pandya',
    sourceUrl: 'https://github.com/hardikpandya/stop-slop',
    promptEn: STOP_SLOP_PROMPT_EN,
    promptDa: STOP_SLOP_PROMPT_DA,
    enabledByDefault: true,
    isBuiltIn: true,
    category: 'writing',
  },
  {
    name: 'source-code-explorer',
    version: '2.0.0',
    descriptionEn: 'Read AlphaFlow source code and explain features in plain language for non-technical users, focused on legal compliance with Danish accounting law.',
    descriptionDa: 'Læs AlphaFlow-kildekoden og forklar funktioner i almindeligt sprog for ikke-tekniske brugere, med fokus på juridisk overholdelse af dansk bogføringslovgivning.',
    author: 'AlphaFlow',
    sourceUrl: null,
    promptEn: SOURCE_EXPLORER_PROMPT_EN,
    promptDa: SOURCE_EXPLORER_PROMPT_DA,
    enabledByDefault: true,
    isBuiltIn: true,
    category: 'productivity',
  },
] as const;

/**
 * Ensure all built-in skills exist and are enabled in the database.
 *
 * This is called from the skills prompts API route on EVERY request.
 * If a skill is missing or disabled, it's automatically upserted + re-enabled.
 * This makes the skills self-healing — no manual seed script needed.
 *
 * Uses upsert so it's safe to call on every request (idempotent).
 * The DB round-trip only happens if the skill count is wrong.
 */
export async function ensureBuiltInSkills(): Promise<void> {
  try {
    // Quick check: are all built-in skills present AND enabled?
    const existing = await db.hermesSkill.findMany({
      where: { name: { in: BUILT_IN_SKILLS.map((s) => s.name) } },
      select: { name: true, enabledByDefault: true },
    });

    const needsFix = BUILT_IN_SKILLS.some((skill) => {
      const dbSkill = existing.find((e) => e.name === skill.name);
      return !dbSkill || !dbSkill.enabledByDefault;
    });

    if (!needsFix) return; // All good — skip the upserts

    logger.info('[HERMES-SKILLS] Self-healing: upserting built-in skills...');

    for (const skill of BUILT_IN_SKILLS) {
      await db.hermesSkill.upsert({
        where: { name: skill.name },
        create: { ...skill },
        update: {
          ...skill,
          enabledByDefault: true, // Force-enable even if someone disabled it
        },
      });
    }

    logger.info('[HERMES-SKILLS] Self-healing complete — all built-in skills enabled');
  } catch (err) {
    logger.warn('[HERMES-SKILLS] Self-healing failed:', err);
    // Non-fatal — skills API will return whatever's in the DB
  }
}
