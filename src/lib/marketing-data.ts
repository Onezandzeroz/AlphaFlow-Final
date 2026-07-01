/**
 * Marketing data — single source of truth for public marketing pages.
 *
 * This module centralises all content used by the server-rendered public
 * pages (/features, /pricing, /about, /faq, /contact). Keeping it here
 * (rather than inside dashboard components) means the marketing pages
 * stay free of auth/client dependencies and can be statically rendered
 * for SEO.
 *
 * Pricing data mirrors src/lib/plan-pricing.ts (Monthly=199, Annual=169,
 * TwoYear=149, ThreeYear=145 DKK/mo) and the PLANS copy from
 * subscription-plans-prompt.tsx.
 */

import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Receipt,
  FileText,
  ScanLine,
  DatabaseBackup,
  BarChart3,
  Bot,
  Landmark,
  ShieldCheck,
  Smartphone,
  Wallet,
  Users,
  Globe,
  Scale,
  TrendingUp,
  RefreshCw,
  Target,
  Building2,
  CreditCard,
  FileCheck2,
} from "lucide-react";

// ─── Navigation ───────────────────────────────────────────────────────

export interface NavLink {
  href: string;
  label: string;
}

export const MARKETING_NAV: readonly NavLink[] = [
  { href: "/features", label: "Funktioner" },
  { href: "/pricing", label: "Priser" },
  { href: "/about", label: "Om os" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Kontakt" },
] as const;

// ─── Feature categories (for /features page) ─────────────────────────

export interface FeatureItem {
  title: string;
  description: string;
}

export interface FeatureCategory {
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  features: FeatureItem[];
}

/**
 * Curated feature categories for the /features marketing page.
 * Grouped from the flat FEATURES_DA list in seo.ts into themed sections
 * with rich descriptions for SEO.
 */
export const FEATURE_CATEGORIES: readonly FeatureCategory[] = [
  {
    id: "bogforing",
    title: "Bogføring & Hovedbog",
    subtitle: "Dobbelt bogføring bygget til danske bogføringsregler",
    icon: BookOpen,
    features: [
      {
        title: "Dobbelt bogføring med automatisk finansjournal",
        description:
          "Hver postering opretter automatisk de korresponderende debit/kredit-poster i finansjournalen. Fulld dobbelt bogføring uden manuelt arbejde.",
      },
      {
        title: "FSR standard kontoplan med 38 konti",
        description:
          "Kontoplanen følger FSR's danske standard og tilpasses automatisk din virksomhedstype (Enkeltmandsvirksomhed, ApS, A/S, IVS eller Holding).",
      },
      {
        title: "Finansjournal & hovedbog",
        description:
          "Komplet hovedbog med løbende saldo, kontokort og journaloversigt. Søg og filtrér på dato, konto, beløb og tekst.",
      },
      {
        title: "Tilbagevendende posteringer",
        description:
          "Opret gentagende posteringer (husleje, forsikringer, abonnementer) der automatisk bogføres på de valgte datoer.",
      },
    ],
  },
  {
    id: "moms",
    title: "Moms & Skat",
    subtitle: "Automatisk momsafregning med alle 10 danske momskoder",
    icon: Scale,
    features: [
      {
        title: "Automatisk momsafregning — alle 10 momskoder",
        description:
          "Understøtter salgsmoms (25%, 12%, 0%), købsmoms, EU-indkøb, EU-salg, reverse charge og udenlandske ydelser. Systemet beregner automatisk momsbalancen pr. afregningsperiode.",
      },
      {
        title: "Momsrapport til Skattestyrelsen",
        description:
          "Generer klar momsrapport med indkøbs- og salgsmoms, der kan indberettes direkte til Skattestyrelsen via TastSelv.",
      },
      {
        title: "SAF-T eksport (Dansk Finansskema v1.0)",
        description:
          "Eksportér komplette finansielle data i Skattestyrelsens SAF-T-format. Kræves ved skattemæssig revision.",
      },
      {
        title: "Årsafslutning & årsrapport (iXBRL)",
        description:
          "Automatisk resultatopgørelse og balance ved årsafslutning. Eksportér i iXBRL-format til Erhvervsstyrelsen.",
      },
    ],
  },
  {
    id: "fakturering",
    title: "Fakturering & E-faktura",
    subtitle: "Peppol e-fakturering og komplet fakturahåndtering",
    icon: FileText,
    features: [
      {
        title: "Peppol e-fakturering (OIOUBL BIS Billing 3.0)",
        description:
          "Send og modtag e-fakturaer via Peppol-netværket med OIOUBL-standarden. Registrer dit virksomhedsnummer og spore afsendelsesstatus.",
      },
      {
        title: "Auto e-faktura (Peppol / NemHandel)",
        description:
          "Business-plan og opefter sender e-fakturaer automatisk via Storecove adgangspunkt — ingen manuelt upload af XML-filer.",
      },
      {
        title: "Kreditnota-håndtering",
        description:
          "Opret kreditnoter linket til originale fakturaer med automatisk momsjustering og fuld sporbarehed.",
      },
      {
        title: "CVR-opslag direkte i systemet",
        description:
          "Indtast et CVR-nummer og hent automatisk virksomhedsnavn, adresse og type fra Det Centrale Virksomhedsregister.",
      },
    ],
  },
  {
    id: "bilag",
    title: "Bilagsscanning & OCR",
    subtitle: "AI-drevet scanning af kvitteringer og fakturaer",
    icon: ScanLine,
    features: [
      {
        title: "OCR bilagsscanning med Tesseract.js og OpenCV",
        description:
          "Upload et billede eller PDF af en kvittering — systemet udtrækker automatisk beløb, datoer, momssatser og CVR-numre.",
      },
      {
        title: "Automatisk konto-kategorisering",
        description:
          "AI foreslår den korrekte konto baseret på dansk kontoplan-standard og dine tidligere bogføringer. Du godkender med ét klik.",
      },
      {
        title: "Kamera-scanning via PWA",
        description:
          "Brug din mobilkamera til at fotografere bilag direkte i appen. Billedet OCR-scannes og kategoriseres automatisk.",
      },
    ],
  },
  {
    id: "rapporter",
    title: "Rapporter & Analyse",
    subtitle: "Finansielle rapporter og indsigter i realtid",
    icon: BarChart3,
    features: [
      {
        title: "Resultatopgørelse, balance & pengestrømsanalyse",
        description:
          "Generer finansielle nøgletal på ethvert tidspunkt. Sammenlign perioder og se udvikling over tid.",
      },
      {
        title: "Budgetstyring med afvigelsesanalyse",
        description:
          "Opret budgetter pr. konto eller afdeling og følg automatisk afvigelser mellem budget og realiserede tal.",
      },
      {
        title: "Likviditetsprognose",
        description:
          "Forudsig din likviditet baseret på åbne fakturaer, tilbagevendende posteringer og historiske mønstre.",
      },
      {
        title: "Aldersopdelt debitor/creditor-rapport",
        description:
          "Se hvem der skylder dig penge — og hvem du skylder — opdelt i aldersgrupper (30/60/90+ dage).",
      },
      {
        title: "Projektregnskab med under-budgets",
        description:
          "Følg lønsomhed pr. projekt med separate budgetter, timeregistrering og projekt specifikke rapporter.",
      },
    ],
  },
  {
    id: "bank",
    title: "Bank & Afstemning",
    subtitle: "Open Banking integration og AI-bankafstemning",
    icon: Landmark,
    features: [
      {
        title: "AI-baseret bankafstemning",
        description:
          "Systemet matcher automatisk banktransaktioner med dine bogførte posteringer ved hjælp af fuzzy matching og maskinlæring.",
      },
      {
        title: "Open Banking integration",
        description:
          "Direkte integration med Danske Bank, Nordea og Jyske Bank via PSD2/Open Banking. Hent transaktioner automatisk.",
      },
      {
        title: "Valutahåndtering med automatisk kursopdatering",
        description:
          "Bogfør i flere valutaer med dagopdaterede valutakurser. Gevinst/tab beregnes automatisk.",
      },
    ],
  },
  {
    id: "ai",
    title: "Hermes AI-assistent",
    subtitle: "Stil regnskabsspørgsmål og få svar på dansk",
    icon: Bot,
    features: [
      {
        title: "Hermes AI-rådgivning",
        description:
          "Spørg Hermes om din likviditet, momsbalance, største udgifter eller bogføringsregler. Få svar på dansk baseret på dine egne data.",
      },
      {
        title: "Naturlig sprog-håndtering",
        description:
          "Hermes forstår dansk bogføringsterminologi og kan forklare komplekse regler i plain language.",
      },
    ],
  },
  {
    id: "compliance",
    title: "Compliance & Sikkerhed",
    subtitle: "Fuld overholdelse af dansk bogføringslov",
    icon: ShieldCheck,
    features: [
      {
        title: "Uforanderlig revisionslog (audit trail)",
        description:
          "Hver ændring logges i en uforanderlig audit trail der opfylder bogføringslovens §10-12. Kan ikke ændres eller slettes.",
      },
      {
        title: "Lukkede regnskabsperioder",
        description:
          "Luk en periode når den er bogført færdig. Lukkede perioder kan ikke ændres — kun via korrektionsposteringer.",
      },
      {
        title: "60 måneders backup retention med SHA-256",
        description:
          "Alle backupper beskyttes med SHA-256 checksum og opbevares i op til 60 måneder — langt over bogføringslovens 5-års krav.",
      },
      {
        title: "Soft-delete med bevarelse",
        description:
          "Ingen fysisk sletning af regnskabsdata — kun soft-delete med fuld bevarelse til revision, som bogføringsloven kræver.",
      },
    ],
  },
  {
    id: "platform",
    title: "Platform & Samarbejde",
    subtitle: "Multi-virksomhed, teams og mobil adgang",
    icon: Users,
    features: [
      {
        title: "Multi-virksomhed med rollebaseret adgang (RBAC)",
        description:
          "Administrer flere virksomheder i én konto. Roller: Ejer, Administrator, Bogholder, Læser og Revisor.",
      },
      {
        title: "PWA med offline-support",
        description:
          "Installer appen direkte fra browseren på iOS og Android. Arbejd offline — ændringer synkroniseres når du er online igen.",
      },
      {
        title: "Multi-sprog (dansk/engelsk)",
        description:
          "Skift mellem dansk og engelsk brugerflade. Regnskabsdata forbliver altid på dansk for compliance.",
      },
      {
        title: "Eksport af alle data (CSV, PDF, ZIP)",
        description:
          "Eksportér posteringer, rapporter og komplette backupper. Du ejer altid dine data — ingen vendor lock-in.",
      },
    ],
  },
] as const;

// ─── Pricing plans (for /pricing page) ───────────────────────────────

export interface PricingPlan {
  id: string;
  name: string;
  priceMonthly: string;
  pricePeriod: string;
  description: string;
  binding: string;
  savings?: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
  isFree?: boolean;
}

/**
 * Public pricing tiers. Prices mirror src/lib/plan-pricing.ts:
 *   Free=0, Monthly=199, Annual=169, TwoYear=149, ThreeYear=145 DKK/mo.
 * Copy adapted from subscription-plans-prompt.tsx PLANS array.
 */
export const PRICING_PLANS: readonly PricingPlan[] = [
  {
    id: "free",
    name: "Gratis",
    priceMonthly: "0 kr.",
    pricePeriod: "ved omsætning under 50.000 kr./år",
    description: "Kom i gang — ingen omkostninger",
    binding: "Ingen binding",
    cta: "Start gratis",
    isFree: true,
    features: [
      "Alle grundlæggende regnskabsfunktioner",
      "Dobbelt bogføring & finansjournal",
      "FSR standard kontoplan (38 konti)",
      "E-fakturering (manuel XML-download)",
      "Bankintegration (demo-tilstand)",
      "1 bruger (kun ejer)",
    ],
  },
  {
    id: "monthly",
    name: "Månedlig",
    priceMonthly: "199 kr.",
    pricePeriod: "pr. måned — ingen binding",
    description: "Fleksibelt abonnement uden binding",
    binding: "Ingen binding",
    cta: "Vælg Månedlig",
    features: [
      "Alt fra Gratis",
      "Ubegrænset omsætning",
      "Avancerede rapporter (cash flow, aldersopdeling, budget vs. actual)",
      "Eksport af alle data (CSV, PDF, ZIP)",
      "Moms & årsregnskab (iXBRL for Erhvervsstyrelsen)",
      "Egte bankintegration (Danske Bank, Nordea, Jyske Bank)",
      "Op til 3 teammedlemmer",
    ],
  },
  {
    id: "annual",
    name: "Pro",
    priceMonthly: "169 kr.",
    pricePeriod: "pr. måned — 2.028 kr./år",
    description: "AI-rådgivning og stabil pris i 12 måneder",
    binding: "12 måneders binding",
    savings: "Spar 360 kr./år",
    cta: "Vælg Pro",
    highlighted: true,
    features: [
      "Alt fra Månedlig",
      "Hermes AI-rådgivning",
      "Prioriteret support",
      "Stabil pris i 12 måneder",
      "Op til 5 teammedlemmer",
    ],
  },
  {
    id: "2year",
    name: "Business",
    priceMonthly: "149 kr.",
    pricePeriod: "pr. måned — 3.576 kr./24 md.",
    description: "Til etablerede virksomheder",
    binding: "24 måneders binding",
    savings: "Spar 1.200 kr.",
    cta: "Vælg Business",
    features: [
      "Alt fra Pro",
      "Auto e-faktura (Peppol / NemHandel)",
      "Storecove Peppol-adgangspunkt inkluderet",
      "Ubegrænsede teammedlemmer",
    ],
  },
  {
    id: "3year",
    name: "Business Extended",
    priceMonthly: "145 kr.",
    pricePeriod: "pr. måned — 5.220 kr./36 md.",
    description: "Fuld pakke med maksimal rabat",
    binding: "36 måneders binding",
    savings: "Spar 1.944 kr.",
    cta: "Vælg Business Extended",
    features: [
      "Alt fra Business",
      "Projektregnskab med under-budgets",
      "Højeste prioritet på support",
      "Nye funktioner først",
    ],
  },
] as const;

// ─── Stats (for /about and /features) ────────────────────────────────

export interface StatItem {
  value: string;
  label: string;
}

export const MARKETING_STATS: readonly StatItem[] = [
  { value: "10", label: "Danske momskoder understøttet" },
  { value: "38", label: "FSR standardkonti" },
  { value: "60", label: "Måneders backup retention" },
  { value: "50k", label: "Gratis omsætning under 50.000 kr." },
] as const;

// ─── Trust badges (for /pricing and /about) ──────────────────────────

export interface TrustBadge {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const TRUST_BADGES: readonly TrustBadge[] = [
  {
    icon: ShieldCheck,
    title: "Bogføringslov §10-12",
    description: "Uforanderlig revisionslog og soft-delete med bevarelse",
  },
  {
    icon: FileCheck2,
    title: "SAF-T & iXBRL",
    description: "Eksport til Skattestyrelsen og Erhvervsstyrelsen",
  },
  {
    icon: DatabaseBackup,
    title: "SHA-256 backupper",
    description: "Krypterede backupper med checksum-verificering",
  },
  {
    icon: Globe,
    title: "Peppol / OIOUBL",
    description: "EU-standard e-fakturering via Storecove adgangspunkt",
  },
] as const;

// ─── Company facts (for /about) ──────────────────────────────────────

export const COMPANY_FACTS = {
  name: "AlphaAi Consult ApS",
  parent: "AlphaCloud Holding ApS",
  cvr: "46312058",
  address: "Skelagervej 124, 8200 Aarhus N, Danmark",
  email: "info@alphaflow.dk",
  emailAlt: "alphaaiconsult@gmail.com",
  phone: "+45 61 73 60 76",
  website: "www.alphaflow.dk",
  founded: "2024",
  openingHours: "Hverdage 09:00–17:00",
} as const;

// ─── Timeline (for /about) ───────────────────────────────────────────

export interface TimelineItem {
  year: string;
  title: string;
  description: string;
}

export const COMPANY_TIMELINE: readonly TimelineItem[] = [
  {
    year: "2024",
    title: "AlphaFlow stiftes",
    description:
      "AlphaAi Consult ApS grundlægges med missionen om at gøre dansk bogføring tilgængeligt, intelligent og compliance-sikret for små og mellemstore virksomheder.",
  },
  {
    year: "2024",
    title: "Første version lanceres",
    description:
      "Dobbelt bogføring, FSR kontoplan, momsafregning og Peppol e-fakturering gøres tilgængeligt i en PWA-first platform.",
  },
  {
    year: "2025",
    title: "Hermes AI integreres",
    description:
      "AI-assistenten Hermes tilføjes, så brugere kan stille regnskabsspørgsmål på dansk og få svar baseret på deres egne finansielle data.",
  },
  {
    year: "2025",
    title: "Open Banking & OCR",
    description:
      "Integration med Danske Bank, Nordea og Jyske Bank via PSD2, samt OCR-scanning af bilag med Tesseract.js og OpenCV.",
  },
] as const;

// ─── Value propositions (for /about) ─────────────────────────────────

export interface ValueProp {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const COMPANY_VALUES: readonly ValueProp[] = [
  {
    icon: ShieldCheck,
    title: "Compliance først",
    description:
      "Vi bygger AlphaFlow til dansk bogføringslov fra bunden — ikke som en eftertanke. Revisionslog, lukkede perioder og SHA-256 backupper er indbygget fra dag ét.",
  },
  {
    icon: TrendingUp,
    title: "Automatisering",
    description:
      "Manuel bogføring hører fortiden til. Vi automatiserer momsafregning, bankafstemning og bilagsscanning så du kan fokusere på din virksomhed.",
  },
  {
    icon: Wallet,
    title: "Fair priser",
    description:
      "Regnskabssoftware behøver ikke at koste en formue. Vores priser starter ved 0 kr. og maksimerer ved 199 kr./md. — ingen skjulte gebyrer.",
  },
  {
    icon: Users,
    title: "Lavet i Danmark",
    description:
      "AlphaFlow er udviklet i Danmark, for danske virksomheder. Support på dansk, dansk kontoplan, danske momskoder og dansk bogføringslov.",
  },
  {
    icon: RefreshCw,
    title: "Du ejer dine data",
    description:
      "Eksportér alle data når som helst — CSV, PDF, SAF-T XML eller komplet ZIP-backup. Ingen vendor lock-in, ingen data tagging.",
  },
  {
    icon: Target,
    title: "Til SMV'er",
    description:
      "Vi fokuserer på små og mellemstore virksomheder: enkeltmandsvirksomheder, ApS, A/S og holdingselskaber. Ikke for koncerne — for dig.",
  },
] as const;

// ─── Contact info (for /contact) ─────────────────────────────────────

export interface ContactChannel {
  icon: LucideIcon;
  label: string;
  value: string;
  href: string;
}

export const CONTACT_CHANNELS: readonly ContactChannel[] = [
  {
    icon: Building2,
    label: "Adresse",
    value: "Skelagervej 124, 8200 Aarhus N, Danmark",
    href: "https://maps.google.com/?q=Skelagervej+124+8200+Aarhus+N+Danmark",
  },
  {
    icon: CreditCard,
    label: "CVR-nummer",
    value: "46312058",
    href: "https://datacvr.virk.dk/enhed/virksomhed/46312058",
  },
  {
    icon: FileText,
    label: "E-mail",
    value: "info@alphaflow.dk",
    href: "mailto:info@alphaflow.dk",
  },
  {
    icon: Smartphone,
    label: "Telefon",
    value: "+45 61 73 60 76",
    href: "tel:+4561736076",
  },
] as const;
