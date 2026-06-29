// ============================================================
// seed-hermes-skills.ts — Seed the Hermes skill catalog
// ============================================================
// Run: bun scripts/seed-hermes-skills.ts
// Installs the default Hermes skills into the database.
// Safe to run multiple times (upserts by name).
// ============================================================

import { db } from '../src/lib/db'

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

## Structural Patterns to Avoid

- Binary contrasts: "Not because X. Because Y." → State Y directly.
- Negative listing: "Not a X... Not a Y... A Z." → State Z.
- Dramatic fragmentation: "X. That's it. That's the [thing]." → Complete sentences.
- Rhetorical setups: "What if [reframe]?", "Here's what I mean:", "Think about it:" → Make the point directly.
- False agency: "The decision emerges" → Name the person deciding.

## Quick Checks Before Delivering

- Any adverbs? Kill them.
- Any passive voice? Find the actor, make them the subject.
- Sentence starts with a Wh- word? Restructure it.
- Any "not X, it's Y" contrasts? State Y directly.
- Three consecutive sentences match length? Break one.
- Paragraph ends with punchy one-liner? Vary it.
- Em-dash anywhere? Remove it.
- Vague declarative? Name the specific thing.
- Meta-joiners? Delete. Let the text move.`

const STOP_SLOP_PROMPT_DA = `# Stop Slop — Fjern AI-skrivemønstre

Du har "Stop Slop"-færdigheden aktiv. Anvend disse regler på ALT dit prosa-output.

## Kerneegler

1. **Skær fyldord væk.** Fjern indledningsfremstillinger, fremhævelses-krykker og alle adverbier. Ingen "her er sagen:", "det viser sig,", "lad det synke ind,", "tag ikke fejl."

2. **Bryd formelstrukturer.** Undgå binære kontraster ("Ikke X. Fordi Y."), negativ opregning, dramatisk fragmentering, retoriske opsætninger, falsk handlekraft. Sig dit pointe direkte.

3. **Brug aktiv form.** Hver sætning skal have et subjekt der gør noget. Ingen passiv konstruktion. Ingen livløse ting der udfører menneskelige handlinger.

4. **Vær specifik.** Ingen vage erklæringer ("Årsagerne er strukturelle"). Navngiv den specifikke ting. Ingen dovenskabs-ekstremer ("hver," "altid," "aldrig") der gør vagt arbejde.

5. **Sæt læseren i rummet.** Ingen fortæller-fra-afstand-stemme. "Du" slår "Folk." Konkrete slår abstraktioner.

6. **Varier rytme.** Bland sætningslængder. To punkter slår tre. Afslut afsnit forskelligt. Ingen em-streger.

7. **Stol på læserne.** Sig fakta direkte. Spring blødgøring, begrundelse og håndholdning over.

8. **Skær citatvenligt væk.** Hvis det lyder som et citat, omskriv det.

## Forbudte fraser

Brug aldrig disse mønstre:
- Indledningsfyld: "Her er sagen:", "Her er hvad/hvorfor", "Det viser sig", "Den ubehagelige sandhed er", "Lad mig være tydelig"
- Fremhævelses-krykker: "Punktum.", "Lad det synke ind.", "Dette betyder noget fordi", "Tag ikke fejl"
- Forretningsjargon: "navigere udfordringer", "udpakke analyse", "læn sig ind i", "game-changer", "deep dive", "circle back"
- Adverbier: virkelig, bare, bogstaveligt talt, oprigtigt, ærligt, simpelthen, faktisk, dybt, sandt, fundamentalt, uundgåeligt, vigtigt, afgørende
- Fyld: "I sin kerne", "I dagens [X]", "Det er værd at bemærke", "Når alt kommer til alt", "Når det gælder", "I en verden hvor", "Virkeligheden er"
- Meta-kommentar: "Hint:", "Plot-twist:", "Spoiler:", "Du ved det allerede, men"

## Strukturelle mønstre der skal undgås

- Binære kontraster: "Ikke fordi X. Fordi Y." → Sig Y direkte.
- Negativ opregning: "Ikke en X... Ikke en Y... En Z." → Sig Z.
- Dramatisk fragmentering: "X. Det er det. Det er [tingen]." → Fulde sætninger.
- Retoriske opsætninger: "Hvad hvis [omramning]?", "Her er hvad jeg mener:", "Tænk på det:" → Sig pointen direkte.
- Falsk handlekraft: "Beslutningen opstår" → Navngiv personen der beslutter.

## Hurtige tjek før levering

- Nogen adverbier? Dræb dem.
- Nogen passiv form? Find aktøren, gør dem til subjekt.
- Sætning starter med et Wh-ord? Omstrukturer den.
- Nogen "ikke X, det er Y"-kontraster? Sig Y direkte.
- Tre på hinanden følgende sætninger har samme længde? Bryd en.
- Afsnit slutter med én-linje punchline? Varier det.
- Em-streg nogen steder? Fjern den.
- Vag erklæring? Navngiv den specifikke ting.
- Meta-oversigter? Slet. Lad teksten bevæge sig.`

async function main() {
  console.log('🌱 Seeding Hermes skills...')

  // ── Stop Slop skill ──
  const stopSlop = await db.hermesSkill.upsert({
    where: { name: 'stop-slop' },
    create: {
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
    update: {
      version: '1.0.0',
      descriptionEn: 'Remove AI writing patterns from prose. Catches predictable phrases, formulaic structures, and forced emphasis. Makes AI output sound more natural and human.',
      descriptionDa: 'Fjern AI-skrivemønstre fra prosa. Fanger forudsigelige fraser, formelagtige strukturer og tvungen fremhævelse. Gør AI-output mere naturligt og menneskeligt.',
      promptEn: STOP_SLOP_PROMPT_EN,
      promptDa: STOP_SLOP_PROMPT_DA,
      enabledByDefault: true,
      isBuiltIn: true,
      category: 'writing',
    },
  })

  console.log(`  ✅ Upserted skill: ${stopSlop.name} (id: ${stopSlop.id})`)
  console.log('🌱 Done!')
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
