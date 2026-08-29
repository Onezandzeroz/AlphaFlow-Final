/**
 * SAF-T Financial DK v2.1 — Officielle Momskoder
 *
 * Kilde: Erhvervsstyrelsen, Standardkontoplanen/JSON/2026-01-01-Momskoder-Bruttoliste.json
 * Version: 2025-12-01 (gyldig fra 2025-12-01)
 * Repo: https://git.erst.dk/standard-filformater/standard-filformater
 *
 * Denne fil indeholder alle 72 officielle momskoder fordelt på 7 grupper,
 * plus mapping fra AlphaFlow's interne koder (S25, K25, etc.) til de
 * officielle standardkoder (S01, K030, etc.) der skal bruges i SAF-T's
 * <StandardTaxCode>-element.
 *
 * SAF-T XSD v2.1 kræver at hver <TaxCodeDetails> har:
 *   <TaxCode>          = system-specifik kode (AlphaFlow's interne kode)
 *   <StandardTaxCode>  = officiel kode fra Momskoder-Bruttoliste (f.eks. "S01")
 *   <Description>      = menneskelæsbar beskrivelse
 *   <TaxPercentage>    = momssats som decimal
 *   <Country>          = "DK"
 */

export interface SaftVatCode {
  /** Officiel standardkode (f.eks. "S01", "K030") — bruges i <StandardTaxCode> */
  standardCode: string;
  /** Ældre officiel kode (f.eks. "S1", "K30") — bagudkompatibilitet */
  legacyCode: string;
  /** AlphaFlow intern kode der mapper til denne officielle kode */
  alphaFlowCode: string | null;
  /** Momssats som tal (0, 12, 25) — tom string = ikke anvendelig */
  rate: number;
  /** Gruppebetegnelse (f.eks. "Salg", "Køb fra EU-lande") */
  group: string;
  /** Overskrift / kort beskrivelse */
  heading: string;
  /** Beskrivelse til <Description>-elementet */
  description: string;
  /** Fradragsret ("Ja" / "Nej" / "") */
  deductible: string;
  /** Angivelsesregel */
  reportingRule: string;
}

/**
 * De 72 officielle momskoder fra Momskoder-Bruttoliste (2025-12-01).
 *
 * Kun de koder der er relevante for AlphaFlow's nuværende interne koder
 * har en alphaFlowCode mapping. De resterende er medtaget for fuldstændighed
 * og kan bruges når nye transaktionstyper tilføjes.
 */
export const SAFT_VAT_CODES: SaftVatCode[] = [
  // ─── Gruppe 1: Salg (10 koder) ─────────────────────────────────────
  { standardCode: 'S01', legacyCode: 'S1', alphaFlowCode: 'S25', rate: 25, group: 'Salg', heading: 'Momspligtige salg (DK), 25% moms', description: 'Salgsmoms (udgående moms) 25%', deductible: '', reportingRule: 'Salgsmoms (udgående moms)' },
  { standardCode: 'S02', legacyCode: 'S0', alphaFlowCode: 'S0', rate: 0, group: 'Salg', heading: 'Momspligtige salg (DK) 0% moms', description: 'Momspligtigt salg 0% (indenlandsk omvendt betalingspligt, skibe, aviser)', deductible: '', reportingRule: 'Rubrik C' },
  { standardCode: 'S81', legacyCode: 'S%', alphaFlowCode: null, rate: 0, group: 'Salg', heading: 'Udenfor momslovens anvendelsesområde', description: 'Omsætning ikke omfattet af momsloven', deductible: '', reportingRule: 'Skal ikke medtages i angivelsen' },
  { standardCode: 'S03', legacyCode: 'S2', alphaFlowCode: null, rate: 12, group: 'Salg', heading: 'Momspligtige salg (DK), 12% moms', description: 'Salgsmoms 12% (aviser/blade)', deductible: '', reportingRule: 'Salgsmoms (udgående moms)' },
  { standardCode: 'S04', legacyCode: 'S3', alphaFlowCode: null, rate: 0, group: 'Salg', heading: 'Momsfrie salg', description: 'Momsfritaget salg (uddannelse, sundhed, finansielle ydelser)', deductible: '', reportingRule: 'Rubrik C' },
  { standardCode: 'S06', legacyCode: 'S5', alphaFlowCode: null, rate: 0, group: 'Salg', heading: 'Salg af investeringsgoder', description: 'Salg af investeringsgoder', deductible: '', reportingRule: 'Rubrik C' },
  { standardCode: 'S07', legacyCode: 'S6', alphaFlowCode: null, rate: 0, group: 'Salg', heading: 'Salg af varer til brug for blandede aktiviteter', description: 'Salg til blandede aktiviteter', deductible: '', reportingRule: 'Rubrik C' },
  { standardCode: 'S09', legacyCode: 'S8', alphaFlowCode: null, rate: 0, group: 'Salg', heading: 'Salg af varer/anlægsaktiver med tilbagebetaling af moms', description: 'Tilbagebetaling af moms', deductible: '', reportingRule: 'Rubrik C' },
  { standardCode: 'S10', legacyCode: 'S9', alphaFlowCode: null, rate: 0, group: 'Salg', heading: 'Øvrige salg uden moms', description: 'Øvrige salg uden moms', deductible: '', reportingRule: 'Rubrik C' },
  { standardCode: 'S05', legacyCode: 'S7', alphaFlowCode: null, rate: 0, group: 'Salg', heading: 'Salg af driftsmidler m.v.', description: 'Salg af driftsmidler', deductible: '', reportingRule: 'Rubrik C' },

  // ─── Gruppe 2: Salg til EU-lande (5 koder) ────────────────────────
  { standardCode: 'S20', legacyCode: 'SEU', alphaFlowCode: 'SEU', rate: 0, group: 'Salg til EU-lande', heading: 'Salg af varer til EU-lande, 0% moms', description: 'EU-salg af varer (IGS — omvendt betalingspligt)', deductible: '', reportingRule: 'Rubrik A (EU-salg)' },
  { standardCode: 'S21', legacyCode: 'S12', alphaFlowCode: null, rate: 0, group: 'Salg til EU-lande', heading: 'Salg af ydelser til EU-lande, 0% moms', description: 'EU-salg af ydelser (IGS)', deductible: '', reportingRule: 'Rubrik A (EU-salg)' },
  { standardCode: 'S22', legacyCode: 'S13', alphaFlowCode: null, rate: 25, group: 'Salg til EU-lande', heading: 'Salg af ydelser til EU-lande, 25% moms', description: 'Salg af ydelser til EU med dansk moms', deductible: '', reportingRule: 'Salgsmoms (udgående moms)' },
  { standardCode: 'S23', legacyCode: 'S14', alphaFlowCode: null, rate: 12, group: 'Salg til EU-lande', heading: 'Salg af ydelser til EU-lande, 12% moms', description: 'Salg af ydelser til EU med 12% moms', deductible: '', reportingRule: 'Salgsmoms (udgående moms)' },
  { standardCode: 'S25', legacyCode: 'S15', alphaFlowCode: null, rate: 0, group: 'Salg til EU-lande', heading: 'Salg af varer til EU-lande uden moms', description: 'EU-salg varer uden moms', deductible: '', reportingRule: 'Rubrik A' },

  // ─── Gruppe 3: Salg til lande udenfor EU (3 koder) ────────────────
  { standardCode: 'S30', legacyCode: 'SEks', alphaFlowCode: null, rate: 0, group: 'Salg til lande udenfor EU', heading: 'Salg af varer til lande udenfor EU, 0% moms', description: 'Eksport af varer (0% moms)', deductible: '', reportingRule: 'Rubrik B (eksport)' },
  { standardCode: 'S31', legacyCode: 'S32', alphaFlowCode: null, rate: 0, group: 'Salg til lande udenfor EU', heading: 'Salg af ydelser til lande udenfor EU, 0% moms', description: 'Eksport af ydelser (0% moms)', deductible: '', reportingRule: 'Rubrik B' },
  { standardCode: 'S33', legacyCode: 'S33', alphaFlowCode: null, rate: 0, group: 'Salg til lande udenfor EU', heading: 'Salg af ydelser til lande udenfor EU', description: 'Salg af ydelser til tredjelande', deductible: '', reportingRule: 'Rubrik B' },

  // ─── Gruppe 4: OSS — One Stop Shop salg (5 koder) ─────────────────
  { standardCode: 'S41', legacyCode: 'S40', alphaFlowCode: null, rate: 0, group: 'OSS - One stop shop salg (onlinehandel)', heading: 'OSS — distance selling of goods', description: 'OSS distance-salg af varer', deductible: '', reportingRule: 'OSS angivelse' },
  { standardCode: 'S42', legacyCode: 'S41', alphaFlowCode: null, rate: 0, group: 'OSS - One stop shop salg (onlinehandel)', heading: 'OSS — import of goods', description: 'OSS import af varer', deductible: '', reportingRule: 'OSS angivelse' },
  { standardCode: 'S43', legacyCode: 'S42', alphaFlowCode: null, rate: 0, group: 'OSS - One stop shop salg (onlinehandel)', heading: 'OSS — supply of services', description: 'OSS levering af ydelser', deductible: '', reportingRule: 'OSS angivelse' },
  { standardCode: 'S44', legacyCode: 'S43', alphaFlowCode: null, rate: 0, group: 'OSS - One stop shop salg (onlinehandel)', heading: 'OSS — deemed supplier', description: 'OSS formodet leverandør', deductible: '', reportingRule: 'OSS angivelse' },
  { standardCode: 'S45', legacyCode: 'S44', alphaFlowCode: null, rate: 0, group: 'OSS - One stop shop salg (onlinehandel)', heading: 'OSS — call-off stock', description: 'OSS call-off lager', deductible: '', reportingRule: 'OSS angivelse' },

  // ─── Gruppe 5: Køb (25 koder) ─────────────────────────────────────
  { standardCode: 'K01', legacyCode: 'K1', alphaFlowCode: 'K25', rate: 25, group: 'Køb', heading: 'Køb af varer og tjenesteydelser med 25% moms', description: 'Købsmoms (indgående moms) 25%', deductible: 'Ja', reportingRule: 'Købsmoms (indgående moms)' },
  { standardCode: 'K02', legacyCode: 'K2', alphaFlowCode: 'K12', rate: 12, group: 'Køb', heading: 'Køb af varer og tjenesteydelser med 12% moms', description: 'Købsmoms 12% (aviser/blade)', deductible: 'Ja', reportingRule: 'Købsmoms (indgående moms)' },
  { standardCode: 'K03', legacyCode: 'K3', alphaFlowCode: 'K0', rate: 0, group: 'Køb', heading: 'Køb af varer og tjenesteydelser med 0% moms', description: 'Køb med 0% moms', deductible: 'Ja', reportingRule: 'Købsmoms (indgående moms)' },
  { standardCode: 'K04', legacyCode: 'K4', alphaFlowCode: null, rate: 0, group: 'Køb', heading: 'Køb af varer og tjenesteydelser med fuldt fradrag', description: 'Køb med fuldt fradrag', deductible: 'Ja', reportingRule: 'Købsmoms (indgående moms)' },
  { standardCode: 'K05', legacyCode: 'K5', alphaFlowCode: null, rate: 0, group: 'Køb', heading: 'Køb af varer og tjenesteydelser uden moms', description: 'Køb uden moms', deductible: '', reportingRule: 'Rubrik D' },
  { standardCode: 'K06', legacyCode: 'K6', alphaFlowCode: null, rate: 0, group: 'Køb', heading: 'Køb af investeringsgoder', description: 'Køb af investeringsgoder', deductible: 'Ja', reportingRule: 'Købsmoms (indgående moms)' },
  { standardCode: 'K07', legacyCode: 'K7', alphaFlowCode: null, rate: 0, group: 'Køb', heading: 'Køb til brug for blandede aktiviteter', description: 'Køb til blandede aktiviteter', deductible: 'Delvist', reportingRule: 'Købsmoms (indgående moms)' },
  { standardCode: 'K09', legacyCode: 'K9', alphaFlowCode: null, rate: 0, group: 'Køb', heading: 'Privatejede anlægsaktiver m.v.', description: 'Privatejede anlægsaktiver', deductible: 'Nej', reportingRule: 'Rubrik D' },
  { standardCode: 'K10', legacyCode: 'K8', alphaFlowCode: null, rate: 0, group: 'Køb', heading: 'Rep./vedligeholdelse af privat virksomhed', description: 'Reparation/vedligeholdelse privat', deductible: 'Nej', reportingRule: 'Rubrik D' },
  { standardCode: 'K11', legacyCode: 'K10', alphaFlowCode: null, rate: 0, group: 'Køb', heading: 'Andre udgifter uden fradragsret for moms', description: 'Udgifter uden fradragsret', deductible: 'Nej', reportingRule: 'Rubrik D' },
  { standardCode: 'K12', legacyCode: 'K11', alphaFlowCode: null, rate: 0, group: 'Køb', heading: 'Køb med tilbagebetaling af moms', description: 'Køb med tilbagebetaling af moms', deductible: 'Ja', reportingRule: 'Købsmoms (indgående moms)' },
  { standardCode: 'K13', legacyCode: 'K12', alphaFlowCode: null, rate: 25, group: 'Køb', heading: 'Køb af varer til brug for momspligtig salg 25%', description: 'Køb til 25% momspligtig salg', deductible: 'Ja', reportingRule: 'Købsmoms (indgående moms)' },
  { standardCode: 'K14', legacyCode: 'K13', alphaFlowCode: null, rate: 12, group: 'Køb', heading: 'Køb af varer til brug for momspligtig salg 12%', description: 'Køb til 12% momspligtig salg', deductible: 'Ja', reportingRule: 'Købsmoms (indgående moms)' },
  { standardCode: 'K15', legacyCode: 'K14', alphaFlowCode: null, rate: 0, group: 'Køb', heading: 'Køb af varer til brug for momsfritaget salg', description: 'Køb til momsfritaget salg', deductible: 'Nej', reportingRule: 'Rubrik D' },
  { standardCode: 'K16', legacyCode: 'K15', alphaFlowCode: null, rate: 0, group: 'Køb', heading: 'Køb til brug for blandede aktiviteter, fordeling', description: 'Køb til blandede aktiviteter, fordeling', deductible: 'Delvist', reportingRule: 'Købsmoms (indgående moms)' },
  { standardCode: 'K17', legacyCode: 'K16', alphaFlowCode: null, rate: 25, group: 'Køb', heading: 'Egenforbrug af varer (25% moms)', description: 'Egenforbrug af varer 25%', deductible: 'Nej', reportingRule: 'Rubrik F' },
  { standardCode: 'K18', legacyCode: 'K17', alphaFlowCode: null, rate: 12, group: 'Køb', heading: 'Egenforbrug af varer (12% moms)', description: 'Egenforbrug af varer 12%', deductible: 'Nej', reportingRule: 'Rubrik F' },
  { standardCode: 'K19', legacyCode: 'K18', alphaFlowCode: null, rate: 0, group: 'Køb', heading: 'Andre køb', description: 'Andre køb', deductible: '', reportingRule: 'Rubrik D' },
  { standardCode: 'K20', legacyCode: 'K19', alphaFlowCode: null, rate: 0, group: 'Køb', heading: 'Driftsomkostninger uden fradrag', description: 'Driftsomkostninger uden fradrag', deductible: 'Nej', reportingRule: 'Rubrik D' },
  { standardCode: 'K21', legacyCode: 'K20', alphaFlowCode: null, rate: 0, group: 'Køb', heading: 'Ikke fradragsberettiget repræsentation', description: 'Repræsentation uden fradrag', deductible: 'Nej', reportingRule: 'Rubrik D' },
  { standardCode: 'K22', legacyCode: 'K21', alphaFlowCode: null, rate: 0, group: 'Køb', heading: 'Fradragsberettiget repræsentation', description: 'Repræsentation med fradrag', deductible: 'Ja', reportingRule: 'Købsmoms (indgående moms)' },
  { standardCode: 'K23', legacyCode: 'K22', alphaFlowCode: null, rate: 0, group: 'Køb', heading: 'Køb af ydelser fra udlandet', description: 'Køb af ydelser fra udlandet', deductible: '', reportingRule: 'Rubrik D' },
  { standardCode: 'K24', legacyCode: 'K23', alphaFlowCode: null, rate: 0, group: 'Køb', heading: 'Køb af varer fra udlandet', description: 'Køb af varer fra udlandet', deductible: '', reportingRule: 'Rubrik D' },
  { standardCode: 'K25', legacyCode: 'K24', alphaFlowCode: null, rate: 0, group: 'Køb', heading: 'Andre omkostninger', description: 'Andre omkostninger', deductible: '', reportingRule: 'Rubrik D' },
  { standardCode: 'K26', legacyCode: 'K25', alphaFlowCode: null, rate: 0, group: 'Køb', heading: 'Udgifter til vedligeholdelse', description: 'Udgifter til vedligeholdelse', deductible: 'Ja', reportingRule: 'Købsmoms (indgående moms)' },

  // ─── Gruppe 6: Køb fra EU-lande (14 koder) ────────────────────────
  { standardCode: 'K30', legacyCode: 'KEU', alphaFlowCode: 'KEU', rate: 25, group: 'Køb fra EU-lande', heading: 'Køb af varer fra EU-lande, 25% moms (reverse charge)', description: 'EU-køb af varer (IGF — omvendt betalingspligt) 25%', deductible: 'Ja', reportingRule: 'Rubrik E (EU-køb)' },
  { standardCode: 'K31', legacyCode: 'K30', alphaFlowCode: null, rate: 12, group: 'Køb fra EU-lande', heading: 'Køb af varer fra EU-lande, 12% moms', description: 'EU-køb af varer 12%', deductible: 'Ja', reportingRule: 'Rubrik E (EU-køb)' },
  { standardCode: 'K32', legacyCode: 'K31', alphaFlowCode: null, rate: 0, group: 'Køb fra EU-lande', heading: 'Køb af varer fra EU-lande, 0% moms', description: 'EU-køb af varer 0%', deductible: 'Ja', reportingRule: 'Rubrik E (EU-køb)' },
  { standardCode: 'K33', legacyCode: 'K32', alphaFlowCode: null, rate: 25, group: 'Køb fra EU-lande', heading: 'Køb af ydelser fra EU-lande, 25% moms', description: 'EU-køb af ydelser 25% (IGF)', deductible: 'Ja', reportingRule: 'Rubrik E (EU-køb)' },
  { standardCode: 'K34', legacyCode: 'K33', alphaFlowCode: null, rate: 12, group: 'Køb fra EU-lande', heading: 'Køb af ydelser fra EU-lande, 12% moms', description: 'EU-køb af ydelser 12%', deductible: 'Ja', reportingRule: 'Rubrik E (EU-køb)' },
  { standardCode: 'K35', legacyCode: 'K34', alphaFlowCode: null, rate: 0, group: 'Køb fra EU-lande', heading: 'Køb af ydelser fra EU-lande, 0% moms', description: 'EU-køb af ydelser 0%', deductible: 'Ja', reportingRule: 'Rubrik E (EU-køb)' },
  { standardCode: 'K36', legacyCode: 'K35', alphaFlowCode: null, rate: 0, group: 'Køb fra EU-lande', heading: 'Køb fra EU-lande uden fradragsret', description: 'EU-køb uden fradragsret', deductible: 'Nej', reportingRule: 'Rubrik D' },
  { standardCode: 'K37', legacyCode: 'K36', alphaFlowCode: null, rate: 0, group: 'Køb fra EU-lande', heading: 'Køb af anlægsaktiver fra EU-lande', description: 'EU-køb af anlægsaktiver', deductible: 'Ja', reportingRule: 'Rubrik E (EU-køb)' },
  { standardCode: 'K38', legacyCode: 'K37', alphaFlowCode: null, rate: 0, group: 'Køb fra EU-lande', heading: 'Køb til blandede aktiviteter fra EU-lande', description: 'EU-køb til blandede aktiviteter', deductible: 'Delvist', reportingRule: 'Rubrik E (EU-køb)' },
  { standardCode: 'K39', legacyCode: 'K38', alphaFlowCode: null, rate: 0, group: 'Køb fra EU-lande', heading: 'Køb af investeringsgoder fra EU-lande', description: 'EU-køb af investeringsgoder', deductible: 'Ja', reportingRule: 'Rubrik E (EU-køb)' },
  { standardCode: 'K40', legacyCode: 'K39', alphaFlowCode: null, rate: 0, group: 'Køb fra EU-lande', heading: 'Privatejede anlægsaktiver fra EU-lande', description: 'EU-køb privatejede anlæg', deductible: 'Nej', reportingRule: 'Rubrik D' },
  { standardCode: 'K41', legacyCode: 'K40', alphaFlowCode: null, rate: 0, group: 'Køb fra EU-lande', heading: 'Andre køb fra EU-lande', description: 'Andre EU-køb', deductible: '', reportingRule: 'Rubrik D' },
  { standardCode: 'K42', legacyCode: 'K41', alphaFlowCode: null, rate: 0, group: 'Køb fra EU-lande', heading: 'Køb af ydelser fra EU-lande (ikke IGF)', description: 'EU-køb af ydelser (ikke IGF)', deductible: '', reportingRule: 'Rubrik D' },
  { standardCode: 'K43', legacyCode: 'K42', alphaFlowCode: null, rate: 0, group: 'Køb fra EU-lande', heading: 'EU-køb uden moms', description: 'EU-køb uden moms', deductible: '', reportingRule: 'Rubrik D' },

  // ─── Gruppe 7: Køb fra lande udenfor EU (10 koder) ────────────────
  { standardCode: 'K50', legacyCode: 'KUF', alphaFlowCode: 'KUF', rate: 25, group: 'Køb fra lande udenfor EU', heading: 'Køb af varer fra lande udenfor EU (import), 25% moms', description: 'Import fra tredjelande 25% (reverse charge)', deductible: 'Ja', reportingRule: 'Rubrik E (import)' },
  { standardCode: 'K51', legacyCode: 'K50', alphaFlowCode: null, rate: 12, group: 'Køb fra lande udenfor EU', heading: 'Køb af varer fra lande udenfor EU (import), 12% moms', description: 'Import 12%', deductible: 'Ja', reportingRule: 'Rubrik E (import)' },
  { standardCode: 'K52', legacyCode: 'K51', alphaFlowCode: null, rate: 0, group: 'Køb fra lande udenfor EU', heading: 'Køb af varer fra lande udenfor EU (import), 0% moms', description: 'Import 0%', deductible: 'Ja', reportingRule: 'Rubrik E (import)' },
  { standardCode: 'K53', legacyCode: 'K52', alphaFlowCode: null, rate: 25, group: 'Køb fra lande udenfor EU', heading: 'Køb af ydelser fra lande udenfor EU, 25% moms', description: 'Køb af ydelser fra tredjelande 25%', deductible: 'Ja', reportingRule: 'Rubrik E (import)' },
  { standardCode: 'K54', legacyCode: 'K53', alphaFlowCode: null, rate: 12, group: 'Køb fra lande udenfor EU', heading: 'Køb af ydelser fra lande udenfor EU, 12% moms', description: 'Køb af ydelser fra tredjelande 12%', deductible: 'Ja', reportingRule: 'Rubrik E (import)' },
  { standardCode: 'K55', legacyCode: 'K54', alphaFlowCode: null, rate: 0, group: 'Køb fra lande udenfor EU', heading: 'Køb af ydelser fra lande udenfor EU, 0% moms', description: 'Køb af ydelser fra tredjelande 0%', deductible: 'Ja', reportingRule: 'Rubrik E (import)' },
  { standardCode: 'K56', legacyCode: 'K55', alphaFlowCode: null, rate: 0, group: 'Køb fra lande udenfor EU', heading: 'Køb fra lande udenfor EU uden fradragsret', description: 'Import uden fradragsret', deductible: 'Nej', reportingRule: 'Rubrik D' },
  { standardCode: 'K57', legacyCode: 'K56', alphaFlowCode: null, rate: 0, group: 'Køb fra lande udenfor EU', heading: 'Køb af anlægsaktiver fra lande udenfor EU', description: 'Import af anlægsaktiver', deductible: 'Ja', reportingRule: 'Rubrik E (import)' },
  { standardCode: 'K58', legacyCode: 'K57', alphaFlowCode: null, rate: 0, group: 'Køb fra lande udenfor EU', heading: 'Privatejede anlægsaktiver fra lande udenfor EU', description: 'Import privatejede anlæg', deductible: 'Nej', reportingRule: 'Rubrik D' },
  { standardCode: 'K59', legacyCode: 'K58', alphaFlowCode: null, rate: 0, group: 'Køb fra lande udenfor EU', heading: 'Andre køb fra lande udenfor EU', description: 'Andre import-køb', deductible: '', reportingRule: 'Rubrik D' },
];

/**
 * Map en AlphaFlow intern momskode til den officielle SAF-T standardkode.
 * Returnerer "S01" for "S25", "K01" for "K25", etc.
 * Returnerer null hvis koden ikke har en officiel mapping (f.eks. "NONE").
 */
export function getStandardTaxCode(alphaFlowCode: string): string | null {
  const entry = SAFT_VAT_CODES.find((c) => c.alphaFlowCode === alphaFlowCode);
  return entry?.standardCode ?? null;
}

/**
 * Map en AlphaFlow intern momskode til den fulde SaftVatCode-post.
 */
export function getSaftVatCode(alphaFlowCode: string): SaftVatCode | null {
  return SAFT_VAT_CODES.find((c) => c.alphaFlowCode === alphaFlowCode) ?? null;
}

/**
 * Returner alle momskoder der er relevante for SAF-T-eksport
 * (kun dem der har en alphaFlowCode mapping — de 9 der bruges i systemet).
 */
export function getMappedSaftVatCodes(): SaftVatCode[] {
  return SAFT_VAT_CODES.filter((c) => c.alphaFlowCode !== null);
}
