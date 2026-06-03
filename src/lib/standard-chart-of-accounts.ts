/**
 * SKAT Fællesoffentlig Standardkontoplan
 *
 * Officiel standardkontoplan brugt af den fællesoffentlige sektor i Danmark.
 * Defineret af SKAT og Økonomistyrelsen til brug for momsindberetning,
 * årsregnskab og e-invoicing (OIOUBL / NemHandel / Peppol).
 *
 * Kontostruktur:
 *   0xxx = Driftsomkostninger (Operating expenses)
 *   1xxx = Driftsindtægter (Operating revenue)
 *   2xxx = Varelager og vareforbrug (Inventory and COGS)
 *   3xxx = Aktiver (Assets)
 *   4xxx = Gæld (Liabilities)
 *   5xxx = Egenkapital (Equity)
 *   6xxx = Finansielle poster (Financial items)
 *   7xxx = Skat og moms (Tax and VAT)
 *   8xxx = Årsafslutning (Year-end closing)
 *   9xxx = Statistiske konti (Statistical accounts)
 */

// ─── Types ────────────────────────────────────────────────────────────────

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

// ─── Standard Chart of Accounts ──────────────────────────────────────────

export const PUBLIC_STANDARD_CHART: StandardAccount[] = [
  // ─── 0xxx: Driftsomkostninger ────────────────────────────────────────
  {
    number: '0100',
    name: 'Lønninger til fastansatte',
    nameEn: 'Salaries — permanent staff',
    type: 'EXPENSE',
    description: 'Bruttolønninger til fastansatte inkl. ATP-bidrag',
    suggestedFSR: ['7000'],
  },
  {
    number: '0110',
    name: 'Lønninger til tidsbegrænsede ansatte',
    nameEn: 'Salaries — temporary staff',
    type: 'EXPENSE',
    description: 'Lønninger til midlertidigt ansatte og vikarer',
    suggestedFSR: ['7000'],
  },
  {
    number: '0120',
    name: 'Arbejdsgiverbidrag',
    nameEn: 'Employer contributions',
    type: 'EXPENSE',
    description: 'ATP, Feriepenge, AUB, pensionsbidrag arbejdsgiver',
    suggestedFSR: ['7100'],
  },
  {
    number: '0130',
    name: 'Pension — arbejdsgiver',
    nameEn: 'Pension — employer',
    type: 'EXPENSE',
    description: 'Arbejdsgivers pensionsbidrag (arbejdsmarkeds- og tjenestemandspension)',
    suggestedFSR: ['7200'],
  },
  {
    number: '0140',
    name: 'Udgift til konsulenter',
    nameEn: 'Consulting expenses',
    type: 'EXPENSE',
    description: 'Honorar til eksterne konsulenter og rådgivere',
    suggestedFSR: ['8500'],
  },
  {
    number: '0200',
    name: 'Indkøb af varer og tjenesteydelser',
    nameEn: 'Purchases of goods and services',
    type: 'EXPENSE',
    description: 'Løbende indkøb til driften',
    suggestedFSR: ['6100'],
  },
  {
    number: '0210',
    name: 'Vareforbrug',
    nameEn: 'Cost of goods consumed',
    type: 'EXPENSE',
    description: 'Vareforbrug i perioden (lagerændring + indkøb)',
    suggestedFSR: ['6000', '6200'],
  },
  {
    number: '0300',
    name: 'Leje af lokaler',
    nameEn: 'Rent of premises',
    type: 'EXPENSE',
    description: 'Husleje, kontorleje og lagerleje',
    suggestedFSR: ['8000'],
  },
  {
    number: '0310',
    name: 'El, vand og varme',
    nameEn: 'Utilities',
    type: 'EXPENSE',
    description: 'El, gas, vand, varme og affaldsafgift',
    suggestedFSR: ['8100'],
  },
  {
    number: '0320',
    name: 'Kørselsomkostninger',
    nameEn: 'Transportation expenses',
    type: 'EXPENSE',
    description: 'Brændstof, bilafgift, vedligeholdelse af køretøjer',
    suggestedFSR: ['8200'],
  },
  {
    number: '0330',
    name: 'Rejseomkostninger',
    nameEn: 'Travel expenses',
    type: 'EXPENSE',
    description: 'Rejse- og opholdsudgifter i forbindelse med arbejde',
    suggestedFSR: ['8300'],
  },
  {
    number: '0340',
    name: 'Forsikring',
    nameEn: 'Insurance',
    type: 'EXPENSE',
    description: 'Erhvervsforsikringer, ansvarsforsikring, cyberforsikring m.m.',
    suggestedFSR: ['8400'],
  },
  {
    number: '0350',
    name: 'Regnskabs- og revisorhonorar',
    nameEn: 'Accounting and audit fees',
    type: 'EXPENSE',
    description: 'Honorar til revisor og regnskabsassistance',
    suggestedFSR: ['8500'],
  },
  {
    number: '0360',
    name: 'Telefon og internet',
    nameEn: 'Telecom',
    type: 'EXPENSE',
    description: 'Telefonabonnementer, internetforbindelse, mobiltelefoni',
    suggestedFSR: ['8600'],
  },
  {
    number: '0370',
    name: 'Kontorartikler og tryksager',
    nameEn: 'Office supplies',
    type: 'EXPENSE',
    description: 'Kontorartikler, papir, toner, tryksager',
    suggestedFSR: ['8700'],
  },
  {
    number: '0380',
    name: 'Reklame og markedsføring',
    nameEn: 'Advertising and marketing',
    type: 'EXPENSE',
    description: 'Markedsføring, annoncer, PR, messestande',
    suggestedFSR: ['8800'],
  },
  {
    number: '0390',
    name: 'IT-drift og licenser',
    nameEn: 'IT operations and licenses',
    type: 'EXPENSE',
    description: 'Softwarelicenser, cloud services, hosting, support',
    suggestedFSR: [],
  },
  {
    number: '0400',
    name: 'Afskrivninger — anlægsaktiver',
    nameEn: 'Depreciation — fixed assets',
    type: 'EXPENSE',
    description: 'Afskrivning på maskiner, IT-udstyr, inventar m.m.',
    suggestedFSR: ['8900'],
  },
  {
    number: '0500',
    name: 'Anden driftsomkostning',
    nameEn: 'Other operating expenses',
    type: 'EXPENSE',
    description: 'Diverse driftsomkostninger der ikke hører under andre konti',
    suggestedFSR: [],
  },

  // ─── 1xxx: Driftsindtægter ───────────────────────────────────────────
  {
    number: '1100',
    name: 'Salg af varer — Danmark',
    nameEn: 'Sales of goods — Denmark',
    type: 'REVENUE',
    description: 'Salgsindtægter fra varesalg indenlands (momspligtigt)',
    suggestedFSR: ['4000'],
  },
  {
    number: '1110',
    name: 'Salg af varer — EU',
    nameEn: 'Sales of goods — EU',
    type: 'REVENUE',
    description: 'Salgsindtægter fra varesalg til EU-lande (IGS, uden dansk moms)',
    suggestedFSR: ['4200'],
  },
  {
    number: '1120',
    name: 'Salg af varer — uden for EU (eksport)',
    nameEn: 'Sales of goods — non-EU export',
    type: 'REVENUE',
    description: 'Salgsindtægter fra varesalg uden for EU',
    suggestedFSR: ['4300'],
  },
  {
    number: '1200',
    name: 'Salg af tjenesteydelser — Danmark',
    nameEn: 'Service revenue — Denmark',
    type: 'REVENUE',
    description: 'Indtægter fra tjenesteydelsessalg indenlands',
    suggestedFSR: ['4100'],
  },
  {
    number: '1210',
    name: 'Salg af tjenesteydelser — udland',
    nameEn: 'Service revenue — abroad',
    type: 'REVENUE',
    description: 'Indtægter fra tjenesteydelsessalg til udlandet',
    suggestedFSR: ['4100'],
  },
  {
    number: '1300',
    name: 'Tilskud til drift',
    nameEn: 'Operating subsidies',
    type: 'REVENUE',
    description: 'Offentlige tilskud og driftsstøtte',
    suggestedFSR: ['5200'],
  },
  {
    number: '1400',
    name: 'Anden driftsindtægt',
    nameEn: 'Other operating income',
    type: 'REVENUE',
    description: 'Diverse driftsindtægter',
    suggestedFSR: ['5000'],
  },
  {
    number: '1500',
    name: 'Nedskrivning af tilgodehavender',
    nameEn: 'Bad debt write-off (reversal)',
    type: 'REVENUE',
    description: 'Nedskrivning af tilgodehavender modregnes her (genindtægter)',
    suggestedFSR: ['5100'],
  },

  // ─── 2xxx: Varelager ──────────────────────────────────────────────────
  {
    number: '2100',
    name: 'Varelager',
    nameEn: 'Inventory',
    type: 'INVENTORY',
    description: 'Varelager til videresalg, værdiansat til indkøbspris',
    suggestedFSR: ['1300', '1400'],
  },

  // ─── 3xxx: Aktiver ────────────────────────────────────────────────────
  {
    number: '3100',
    name: 'Kassebeholdning',
    nameEn: 'Cash on hand',
    type: 'ASSET',
    description: 'Kontanter i kassen',
    suggestedFSR: ['1000'],
  },
  {
    number: '3200',
    name: 'Bankindeståender',
    nameEn: 'Bank deposits',
    type: 'ASSET',
    description: 'Pengeinstitutindeståender (bankkonto, NETS-konto)',
    suggestedFSR: ['1100'],
  },
  {
    number: '3300',
    name: 'Tilgodehavender fra salg',
    nameEn: 'Trade receivables',
    type: 'ASSET',
    description: 'Kunde tilgodehavender fra salg af varer og tjenesteydelser',
    suggestedFSR: ['1200'],
  },
  {
    number: '3310',
    name: 'Tilgodehavender fra medarbejdere',
    nameEn: 'Employee receivables',
    type: 'ASSET',
    description: 'Tilgodehavender fra ansatte (f.eks. lån, avance)',
    suggestedFSR: ['1240'],
  },
  {
    number: '3400',
    name: 'Fordringer på offentlige myndigheder',
    nameEn: 'Receivables from public authorities',
    type: 'ASSET',
    description: 'Moms til gode, skat til gode m.m.',
    suggestedFSR: [],
  },
  {
    number: '3500',
    name: 'Anlægsaktiver — maskiner og udstyr',
    nameEn: 'Fixed assets — machinery & equipment',
    type: 'ASSET',
    description: 'Driftsmaskiner, produktionsudstyr, køretøjer',
    suggestedFSR: ['1700'],
  },
  {
    number: '3510',
    name: 'Anlægsaktiver — IT-udstyr',
    nameEn: 'Fixed assets — IT equipment',
    type: 'ASSET',
    description: 'Computere, servere, netværksudstyr',
    suggestedFSR: ['1800'],
  },
  {
    number: '3520',
    name: 'Anlægsaktiver — inventar og fitout',
    nameEn: 'Fixed assets — fixtures & fittings',
    type: 'ASSET',
    description: 'Kontormøbler, maskiner, installationer',
    suggestedFSR: ['1700'],
  },
  {
    number: '3600',
    name: 'Immaterielle anlægsaktiver',
    nameEn: 'Intangible fixed assets',
    type: 'ASSET',
    description: 'Softwareudvikling, patenter, goodwill, domæner',
    suggestedFSR: [],
  },
  {
    number: '3700',
    name: 'Korte finansielle anbringelser',
    nameEn: 'Short-term financial investments',
    type: 'ASSET',
    description: 'Likvide værdipapirer, kortfristede placeringer',
    suggestedFSR: ['1900'],
  },
  {
    number: '3800',
    name: 'Andre aktiver',
    nameEn: 'Other assets',
    type: 'ASSET',
    description: 'Forudbetalinger, deposita, diverse aktiver',
    suggestedFSR: [],
  },

  // ─── 4xxx: Gæld ───────────────────────────────────────────────────────
  {
    number: '4100',
    name: 'Leverandørgæld',
    nameEn: 'Trade payables',
    type: 'LIABILITY',
    description: 'Skyldige beløb til leverandører af varer og tjenesteydelser',
    suggestedFSR: ['2000'],
  },
  {
    number: '4200',
    name: 'Skyldige lønninger og gager',
    nameEn: 'Wages and salaries payable',
    type: 'LIABILITY',
    description: 'Akkumulerede men ikke udbetalte lønninger',
    suggestedFSR: ['2400'],
  },
  {
    number: '4210',
    name: 'Personalegæld — feriepenge m.m.',
    nameEn: 'Employee benefits payable',
    type: 'LIABILITY',
    description: 'Feriepenge, pensionsforpligtelser, bonus',
    suggestedFSR: ['2400'],
  },
  {
    number: '4300',
    name: 'Skyldig skat og afgifter',
    nameEn: 'Taxes payable',
    type: 'LIABILITY',
    description: 'Skyldig A-skat, AM-bidrag, selskabsskat m.m.',
    suggestedFSR: ['2100'],
  },
  {
    number: '4400',
    name: 'Modtaget forudbetaling',
    nameEn: 'Deferred revenue (advances)',
    type: 'LIABILITY',
    description: 'Forudbetalte beløb fra kunder for endnu ikke leverede ydelser',
    suggestedFSR: ['2300'],
  },
  {
    number: '4500',
    name: 'Kortfristet gæld',
    nameEn: 'Short-term debt',
    type: 'LIABILITY',
    description: 'Kortfristede lån, kassekredit, skyldige renter',
    suggestedFSR: ['2500'],
  },
  {
    number: '4600',
    name: 'Langfristet gæld',
    nameEn: 'Long-term debt',
    type: 'LIABILITY',
    description: 'Banklån, realkreditlån, obligationer med løbetid > 1 år',
    suggestedFSR: ['2600', '2700'],
  },
  {
    number: '4700',
    name: 'Anden gæld',
    nameEn: 'Other liabilities',
    type: 'LIABILITY',
    description: 'Diverse forpligtelser der ikke hører under andre gældskonti',
    suggestedFSR: [],
  },

  // ─── 5xxx: Egenkapital ─────────────────────────────────────────────────
  {
    number: '5100',
    name: 'Tegnet kapital',
    nameEn: 'Share capital',
    type: 'EQUITY',
    description: 'Selskabets tegnede kapital (aktiekapital eller anpartskapital)',
    suggestedFSR: ['3000'],
  },
  {
    number: '5110',
    name: 'Overkurs',
    nameEn: 'Share premium',
    type: 'EQUITY',
    description: 'Overkurs ved udstedelse af kapital',
    suggestedFSR: ['3100'],
  },
  {
    number: '5200',
    name: 'Reserver',
    nameEn: 'Reserves',
    type: 'EQUITY',
    description: 'Opbyggede reserver, herunder lovpligtige reserver og frivillige reserver',
    suggestedFSR: ['3200'],
  },
  {
    number: '5300',
    name: 'Overført resultat',
    nameEn: 'Retained earnings',
    type: 'EQUITY',
    description: 'Akkumulerede overskud/underskud fra tidligere år',
    suggestedFSR: ['3400'],
  },
  {
    number: '5400',
    name: 'Årets resultat',
    nameEn: 'Net income for the year',
    type: 'EQUITY',
    description: 'Årets resultat før overførsel til overført resultat',
    suggestedFSR: ['3300'],
  },

  // ─── 6xxx: Finansielle poster ────────────────────────────────────────
  {
    number: '6100',
    name: 'Renteomkostninger',
    nameEn: 'Interest expenses',
    type: 'FINANCIAL',
    description: 'Renteomkostninger på lån, kassekredit m.m.',
    suggestedFSR: ['9100'],
  },
  {
    number: '6110',
    name: 'Kurstab',
    nameEn: 'Foreign exchange losses',
    type: 'FINANCIAL',
    description: 'Tab på valutakursændringer',
    suggestedFSR: ['9400'],
  },
  {
    number: '6200',
    name: 'Renteindtægter',
    nameEn: 'Interest income',
    type: 'FINANCIAL',
    description: 'Renteindtægter fra bankindeståender m.m.',
    suggestedFSR: ['9300'],
  },
  {
    number: '6210',
    name: 'Kursgevinst',
    nameEn: 'Foreign exchange gains',
    type: 'FINANCIAL',
    description: 'Gevinst på valutakursændringer',
    suggestedFSR: ['9400'],
  },
  {
    number: '6300',
    name: 'Kapitalgevinst/-tab',
    nameEn: 'Capital gains/losses',
    type: 'FINANCIAL',
    description: 'Gevinster eller tab på salg af aktiver og værdipapirer',
    suggestedFSR: ['9400'],
  },

  // ─── 7xxx: Skat og moms ───────────────────────────────────────────────
  {
    number: '7100',
    name: 'Udgående moms (salgsmoms) 25%',
    nameEn: 'Output VAT 25%',
    type: 'TAX',
    description: 'Udgående moms af salg til dansk CVR-registrerede (standard 25%)',
    suggestedFSR: ['4510'],
  },
  {
    number: '7110',
    name: 'Udgående moms (salgsmoms) 12%',
    nameEn: 'Output VAT 12%',
    type: 'TAX',
    description: 'Udgående moms af salg med nedsat sats (12%)',
    suggestedFSR: ['4520'],
  },
  {
    number: '7120',
    name: 'Udgående moms 0% (EU/eksport)',
    nameEn: 'Output VAT 0% (EU/export)',
    type: 'TAX',
    description: 'EU-omsætning og eksport (0% moms, IGS)',
    suggestedFSR: [],
  },
  {
    number: '7200',
    name: 'Indgående moms (købsmoms) 25%',
    nameEn: 'Input VAT 25%',
    type: 'TAX',
    description: 'Indgående moms af indkøb (standard 25%)',
    suggestedFSR: ['5410'],
  },
  {
    number: '7210',
    name: 'Indgående moms (købsmoms) 12%',
    nameEn: 'Input VAT 12%',
    type: 'TAX',
    description: 'Indgående moms af indkøb med nedsat sats (12%)',
    suggestedFSR: ['5420'],
  },
  {
    number: '7300',
    name: 'Momsgæld til Skattestyrelsen',
    nameEn: 'VAT payable to SKAT',
    type: 'TAX',
    description: 'Skyldig udgående moms til Skattestyrelsen (netto)',
    suggestedFSR: ['2200'],
  },
  {
    number: '7400',
    name: 'Moms til gode fra Skattestyrelsen',
    nameEn: 'VAT receivable from SKAT',
    type: 'TAX',
    description: 'Indgående moms til gode fra Skattestyrelsen (netto)',
    suggestedFSR: [],
  },
  {
    number: '7500',
    name: 'Årets skat af resultat',
    nameEn: 'Corporate tax',
    type: 'TAX',
    description: 'Selskabsskat af årets resultat (22%)',
    suggestedFSR: ['9500'],
  },

  // ─── 8xxx: Årsafslutning ──────────────────────────────────────────────
  {
    number: '8100',
    name: 'Resultatopgørelse — driftsindtægter',
    nameEn: 'Income statement — operating revenue',
    type: 'YEAR_END',
    description: 'Samlekonto for driftsindtægter ved årsafslutning',
    suggestedFSR: [],
  },
  {
    number: '8200',
    name: 'Resultatopgørelse — driftsomkostninger',
    nameEn: 'Income statement — operating expenses',
    type: 'YEAR_END',
    description: 'Samlekonto for driftsomkostninger ved årsafslutning',
    suggestedFSR: [],
  },
  {
    number: '8300',
    name: 'Resultatopgørelse — finansielle poster',
    nameEn: 'Income statement — financial items',
    type: 'YEAR_END',
    description: 'Samlekonto for finansielle indtægter/omkostninger ved årsafslutning',
    suggestedFSR: [],
  },
  {
    number: '8400',
    name: 'Årets resultat',
    nameEn: 'Net income for the year (closing)',
    type: 'YEAR_END',
    description: 'Resultatopgørelsens resultat overføres til egenkapitalen',
    suggestedFSR: ['3300'],
  },
]

// ─── Helper Functions ────────────────────────────────────────────────────

/**
 * Get a standard account by number
 */
export function getStandardAccount(number: string): StandardAccount | undefined {
  return PUBLIC_STANDARD_CHART.find(a => a.number === number)
}

/**
 * Get all standard accounts grouped by type
 */
export function getStandardAccountsByType(): Record<StandardAccountType, StandardAccount[]> {
  const grouped: Record<string, StandardAccount[]> = {}
  for (const account of PUBLIC_STANDARD_CHART) {
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
  return PUBLIC_STANDARD_CHART.filter(a => a.number.startsWith('7'))
}

/**
 * Get auto-mapping suggestions from FSR account number to standard account
 */
export function suggestStandardMapping(fsrNumber: string): StandardAccount | null {
  for (const stdAccount of PUBLIC_STANDARD_CHART) {
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

  // Phase 1: Exact FSR number match from suggestions
  for (const fsr of fsrAccounts) {
    const suggestion = suggestStandardMapping(fsr.number)
    if (suggestion) {
      mapping.set(fsr.number, suggestion.number)
      continue
    }
  }

  // Phase 2: Type-based heuristics for unmapped accounts
  for (const fsr of fsrAccounts) {
    if (mapping.has(fsr.number)) continue

    let candidate: StandardAccount | undefined

    switch (fsr.type) {
      case 'ASSET':
        if (fsr.group === 'CASH') candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '3100')
        else if (fsr.group === 'BANK') candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '3200')
        else if (fsr.group === 'RECEIVABLES') candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '3300')
        else if (fsr.group === 'INVENTORY') candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '2100')
        else if (fsr.group === 'FIXED_ASSETS') candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '3500')
        else if (fsr.group === 'OUTPUT_VAT') candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '7200')
        else if (fsr.group === 'INPUT_VAT') candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '7200')
        else candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '3800')
        break

      case 'LIABILITY':
        if (fsr.group === 'PAYABLES') candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '4100')
        else if (fsr.group === 'SHORT_TERM_DEBT') candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '4500')
        else if (fsr.group === 'LONG_TERM_DEBT') candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '4600')
        else if (fsr.group === 'OUTPUT_VAT') candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '7100')
        else candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '4700')
        break

      case 'EQUITY':
        if (fsr.group === 'SHARE_CAPITAL') candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '5100')
        else if (fsr.group === 'RETAINED_EARNINGS') {
          if (fsr.number === '3400') candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '5300')
          else candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '5400')
        }
        else candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '5200')
        break

      case 'REVENUE':
        if (fsr.group === 'SALES_REVENUE') candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '1100')
        else if (fsr.group === 'OTHER_REVENUE') candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '1400')
        else if (fsr.group === 'FINANCIAL_INCOME') candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '6200')
        else candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '1400')
        break

      case 'EXPENSE':
        if (fsr.group === 'COST_OF_GOODS') candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '0210')
        else if (fsr.group === 'PERSONNEL') candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '0100')
        else if (fsr.group === 'OTHER_OPERATING') candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '0500')
        else if (fsr.group === 'FINANCIAL_EXPENSE') candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '6100')
        else if (fsr.group === 'TAX') candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '7500')
        else candidate = PUBLIC_STANDARD_CHART.find(a => a.number === '0500')
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
