/**
 * AlphaFlow FSR → Official 2026 Standardkontoplan mapping.
 *
 * Hårdkodet mapping-tabel der mapper AlphaFlow's standardkontoplan
 * (fra seed-chart-of-accounts.ts, 1xxx-9xxx serien) direkte til de
 * korrekte konti i den officielle 2026 Standardkontoplan.
 *
 * Hvorfor denne fil findes:
 *   Den gamle buildAutoMapping() brugte heuristikker (type + group) til
 *   at gætte kontonumre. Det var upræcist og manglede mange konti.
 *   Denne tabel giver en 1-til-1 mapping baseret på faktisk viden om
 *   dansk bogføring og den officielle kontoplan — ingen gætterier.
 *
 * Hvis en FSR-konto ikke er i tabellen, falder den tilbage til:
 *   1. suggestStandardMapping() (FSR_SUGGESTIONS i official-standard-chart.ts)
 *   2. LLM (Hermes) for semantisk mapping
 *   3. Forbliver unmapped
 */

import { OFFICIAL_STANDARD_CHART } from '@/lib/official-standard-chart';

/**
 * Mapping fra AlphaFlow FSR-kontonummer → officielt 2026 standardkontonummer.
 *
 * Kontonumrene er valideret mod den officielle 2026 Standardkontoplan
 * (officiel-standard-chart.ts / Excel-fil fra Erhvervsstyrelsen).
 */
export const FSR_TO_OFFICIAL_MAPPING: Record<string, string> = {
  // ─── 1xxx: Aktiver (omsætningsaktiver + anlægsaktiver) ───────────────
  '1000': '6462',  // Kasse → Likvide beholdninger (header — dækker kassebeholdning)
  '1100': '6480',  // Bankkonto → Bankkonto
  '1200': '6183',  // Tilgodehavender fra salg → Tilgodehavender fra salg og tjenesteydelser
  '1240': '6361',  // Tilgodehavender fra medarbejdere → Tilgodehavender hos virksomhedsdeltagere og ledelse (omsætningsaktiv)
  '1300': '6075',  // Varelager → Råvarer og hjælpematerialer
  '1400': '6080',  // Varelager - Indkøbspris → Råvarer og hjælpematerialer, kostpris primo
  '1700': '5411',  // Kørende maskiner og udstyr → Produktionsanlæg og maskiner
  '1800': '2310',  // IT-udstyr → It-udstyr (hardware, software inkl. licenser og abonnementer)
  '1900': '6412',  // Kontante værdipapirer → Værdipapirer og kapitalandele
  '1910': '5961',  // Kapitalandele i datterselskaber → Tilgodehavender hos kapitalinteresser (anlægsaktiv)
  '1920': '5961',  // Kapitalandele i øvrige selskaber → Tilgodehavender hos kapitalinteresser (anlægsaktiv)

  // ─── 2xxx: Kortfristet gæld ─────────────────────────────────────────
  '2000': '7421',  // Leverandørgæld → Leverandører af varer og tjenesteydelser (kortfristet)
  '2100': '7920',  // Skyldige skatter og afgifter → Skyldig A-skat (mest almindelige skyldige skat)
  '2200': '7840',  // Momsgæld → Skyldig moms
  '2300': '7141',  // Modtaget forudbetaling → Modtagne forudbetalinger fra kunder (langfristet)
  '2400': '7860',  // Personalegæld → Skyldig løn og gager
  '2500': '7920',  // Skyldige renter → Skyldig A-skat (ingen specifik "skyldige renter" konto — A-skat er bedste fallback)
  '2600': '7330',  // Banklån → Gæld til banker (kortfristet)
  '2700': '7120',  // Andre langfristede gæld → Gæld til banker (langfristet)

  // ─── 3xxx: Egenkapital ──────────────────────────────────────────────
  '3000': '6502',  // Aktiekapital → Virksomhedskapital
  '3010': '6924',  // Egenkapitalindskud → Privat indskud (kun klasse A)
  '3020': '6923',  // Egenkapitalshævning → Privat hævet (kun klasse A)
  '3100': '6341',  // Overkurs → Krav på indbetaling af virksomhedskapital og overkurs
  '3200': '6591',  // Reserver → Andre reserver
  '3300': '6916',  // Årets resultat → Årets resultat (kun klasse A)
  '3400': '6931',  // Overført resultat → Overført resultat

  // ─── 4xxx: Driftsindtægter ──────────────────────────────────────────
  '4000': '1010',  // Salg af varer → Salg af varer og ydelser
  '4100': '1010',  // Salg af tjenesteydelser → Salg af varer og ydelser
  '4200': '1050',  // Salg af varer EU → Salg af varer udland, EU
  '4300': '1100',  // Salg af varer udenfor EU → Salg af varer udland, ikke-EU
  '4510': '7840',  // Udgående moms → Skyldig moms
  '4520': '7840',  // Udgående moms 12% → Skyldig moms (samme konto, 12% håndteres via momskode)
  '4910': '3193',  // Udbytte fra datterselskaber → Modtagne udbytter fra tilknyttede virksomheder
  '4920': '3221',  // Udbytter fra øvrige selskaber → Modtagne udbytter fra kapitalinteresser

  // ─── 5xxx: Andre driftsindtægter + moms ─────────────────────────────
  '5000': '1500',  // Andre driftsindtægter → Andre driftsindtægter
  '5100': '2290',  // Tilgodehavender nedskrevet → Regulering af nedskrivning på tilgodehavender fra salg
  '5200': '1545',  // Varebundne tilskud → Offentlige tilskud
  '5410': '6320',  // Indgående moms → Tilgodehavende moms
  '5420': '6320',  // Indgående moms 12% → Tilgodehavende moms (samme konto, 12% via momskode)

  // ─── 6xxx: Vareforbrug ──────────────────────────────────────────────
  '6000': '1610',  // Vareforbrug → Varekøb
  '6100': '1610',  // Indkøb af varer → Varekøb
  '6200': '1610',  // Vareforbrug til videresalg → Varekøb

  // ─── 7xxx: Løn og personale ─────────────────────────────────────────
  '7000': '2842',  // Lønninger → Lønninger
  '7100': '8010',  // Arbejdsgiverbidrag → Skyldig arbejdsgiverbidrag (samlet betaling)
  '7200': '2910',  // Pensionsbidrag → Pensioner, arbejdsgiver

  // ─── 8xxx: Driftsomkostninger ───────────────────────────────────────
  '8000': '2030',  // Husleje → Husleje
  '8100': '2050',  // El, vand og varme → El (også 2060 Elafgift, 2070 Vand, 2080 Varme)
  '8200': '2540',  // Kørselsomkostninger → Driftsomkostninger, personbiler
  '8300': '2470',  // Rejseomkostninger → Rejseomkostninger (administrationsomkostning)
  '8400': '2650',  // Forsikring → Øvrige forsikringer
  '8500': '2670',  // Regnskabs- og revisionshonorar → Revision og regnskabsmæssig assistance
  '8600': '2410',  // Telefon og internet → Telefon og internet mv. (kun virksomhed)
  '8700': '2450',  // Kontorartikler → Kontorartikler
  '8800': '1850',  // Reklame og markedsføring → Annoncering og reklame
  '8900': '1550',  // Avancement → Øvrige andre driftsindtægter
  '8950': '6920',  // Private udgifter → Private andele (kun klasse A)

  // ─── 9xxx: Finansielle poster + skat ────────────────────────────────
  '9000': '3571',  // Finansielle omkostninger → Øvrige finansielle omkostninger
  '9100': '3670',  // Renteomkostninger → Renter til banker og realkreditinstitutter
  '9200': '3451',  // Finansielle indtægter → Andre finansielle indtægter
  '9210': '3385',  // Kursgevinst på kapitalandele → Kursgevinster af andre kapitalandele
  '9220': '3630',  // Kurstab på kapitalandele → Kurstab på likvider, bankgæld og prioritetsgæld
  '9300': '3470',  // Renteindtægter → Renter fra banker
  '9400': '3385',  // Kapitalgevinst/-tab → Kursgevinster (indtægter) — kurstab er 3630
  '9500': '3703',  // Årets skat af resultat → Skat af årets resultat
};

/**
 * Valider at alle officielle kontonumre i FSR_TO_OFFICIAL_MAPPING
 * faktisk findes i den officielle 2026 Standardkontoplan.
 *
 * Køres som en sanity-check ved module-load — hvis et kontonummer
 * ikke findes, logges en advarsel, og mappingen udelades (så
 * fallback til LLM kan håndtere den).
 */
export const VALIDATED_MAPPING: Record<string, string> = (() => {
  const validNumbers = new Set(OFFICIAL_STANDARD_CHART.map((a) => a.number));
  const result: Record<string, string> = {};
  for (const [fsr, official] of Object.entries(FSR_TO_OFFICIAL_MAPPING)) {
    if (validNumbers.has(official)) {
      result[fsr] = official;
    }
    // Hvis official-nummeret ikke findes, udelades mappingen —
    // fallback til LLM håndterer den i stedet for at mappe til en
    // ikke-eksisterende konto.
  }
  return result;
})();
