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
          "Hver postering bogføres automatisk på begge sider af regnskabet — korrekt dobbelt bogføring uden manuelt tastearbejde.",
      },
      {
        title: "FSR standard kontoplan, tilpasset din virksomhedstype",
        description:
          "Kontoplanen bygger på FSR's danske standard og sammensættes automatisk ud fra din virksomhedstype — som enkeltmandsvirksomhed får du konti til egenkapital, indskud, hævninger og private udgifter, og som holdingselskab får du konti til kapitalandele og udbytter.",
      },
      {
        title: "Finansjournal & hovedbog",
        description:
          "Du får det fulde overblik med løbende saldo og kontokort — og kan søge og filtrere på dato, konto, beløb og tekst.",
      },
      {
        title: "Tilbagevendende posteringer",
        description:
          "Opret faste posteringer som husleje og abonnementer én gang — derefter bliver de automatisk bogført på de aftalte datoer.",
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
          "Fra salgs- og købsmoms til EU-handel og udenlandske ydelser — alle 10 danske momskoder er dækket. Momsbalancen beregnes automatisk for hver afregningsperiode.",
      },
      {
        title: "Momsrapport til Skattestyrelsen",
        description:
          "Momsrapporten viser købs- og salgsmoms og er klar til indberetning til Skattestyrelsen via TastSelv.",
      },
      {
        title: "SAF-T eksport (Dansk Finansskema v1.0)",
        description:
          "Eksportér hele regnskabet i Skattestyrelsens SAF-T-format — fx hvis Skattestyrelsen beder om det ved en revision.",
      },
      {
        title: "Årsafslutning & årsrapport (iXBRL)",
        description:
          "Resultatopgørelse og balance samles automatisk ved årsafslutning — klar til indsendelse til Erhvervsstyrelsen.",
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
          "Send og modtag e-fakturaer via Peppol-netværket. Registrér dit virksomhedsnummer én gang, og følg status på hver enkelt afsendelse.",
      },
      {
        title: "Auto e-faktura (Peppol / NemHandel)",
        description:
          "Med Business-planen og derover sendes e-fakturaer automatisk via Peppol — helt uden manuel filhåndtering.",
      },
      {
        title: "Kreditnota-håndtering",
        description:
          "Opret kreditnotaer direkte på originalfakturaen — momsbeløbet justeres automatisk, og hele forløbet er sporbart.",
      },
      {
        title: "CVR-opslag direkte i systemet",
        description:
          "Indtast et CVR-nummer, så hentes virksomhedens navn, adresse og type automatisk — uden manuel tastning.",
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
        title: "Intelligent scanning af bilag (OCR)",
        description:
          "Tag et billede eller upload en PDF — beløb, dato, momssats og CVR-nummer læses automatisk og er klar til bogføring.",
      },
      {
        title: "Automatisk konto-kategorisering",
        description:
          "AI'en foreslår den rette konto ud fra din kontoplan og dine tidligere valg — du godkender med ét klik.",
      },
      {
        title: "Kamera-scanning via PWA",
        description:
          "Fotografér bilagene direkte med mobilkameraet — billedet scannes og kategoriseres automatisk.",
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
          "Få dine nøgletal på ethvert tidspunkt — og sammenlign perioder, så du kan følge udviklingen i virksomheden.",
      },
      {
        title: "Budgetstyring med afvigelsesanalyse",
        description:
          "Opret budgetter pr. konto eller afdeling, og se automatisk, hvor de realiserede tal afviger fra planen.",
      },
      {
        title: "Likviditetsprognose",
        description:
          "Få et billede af den fremtidige likviditet — beregnet ud fra åbne fakturaer, faste posteringer og historik.",
      },
      {
        title: "Aldersopdelt debitor/creditor-rapport",
        description:
          "Se hvem der skylder dig penge — og hvem du skylder — opdelt i aldersgrupper (30/60/90+ dage).",
      },
      {
        title: "Projektregnskab med under-budgets",
        description:
          "Følg lønsomheden pr. projekt med egne budgetter, timeregistrering og projektspecifikke rapporter.",
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
          "Banktransaktioner matches automatisk med dine posteringer — og afstemningen bliver smartere, jo mere du bruger den.",
      },
      {
        title: "Open Banking integration",
        description:
          "Hent transaktioner automatisk fra Danske Bank, Nordea og Jyske Bank via Open Banking.",
      },
      {
        title: "Valutahåndtering med automatisk kursopdatering",
        description:
          "Bogfør i flere valutaer med dagligt opdaterede kurser — kursgevinst og -tab beregnes automatisk.",
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
          "Spørg Hermes om likviditet, momsbalance eller de største udgifter — og få svaret på dansk, bygget på dine egne tal.",
      },
      {
        title: "Svar på almindelig dansk",
        description:
          "Hermes forstår dansk bogføringsterminologi og forklarer selv komplekse regler i klart sprog.",
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
          "Hver ændring registreres i en log, der hverken kan ændres eller slettes — præcis som bogføringslovens § 10-12 kræver.",
      },
      {
        title: "Lukkede regnskabsperioder",
        description:
          "Når en periode er færdigbogført, kan du låse den. Fejl rettes kun med synlige korrektionsposteringer — aldrig ved at ændre historikken.",
      },
      {
        title: "Sikkerhedskopier i 60 måneder",
        description:
          "Alle sikkerhedskopier krypteres og kontrolleres automatisk og opbevares i op til 60 måneder — langt over bogføringslovens 5-årskrav.",
      },
      {
        title: "Sletning med fuld historik",
        description:
          "Regnskabsdata slettes aldrig fysisk — slettede poster kan altid findes frem igen til revision, som bogføringsloven kræver.",
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
        title: "Flere virksomheder og roller i én konto",
        description:
          "Administrér alle dine virksomheder fra én konto, og giv bogholder, revisor og medarbejdere præcis den adgang, de skal bruge: Ejer, Administrator, Bogholder, Læser eller Revisor.",
      },
      {
        title: "App til mobil og tablet — virker offline",
        description:
          "Installér appen direkte fra browseren på mobil og tablet. Bogfør endda offline — ændringerne synkroniseres, når du er online igen.",
      },
      {
        title: "Multi-sprog (dansk/engelsk)",
        description:
          "Skift mellem dansk og engelsk brugerflade — regnskabsdata forbliver altid på dansk, som reglerne kræver.",
      },
      {
        title: "Eksport af alle data (CSV, PDF, ZIP)",
        description:
          "Eksportér posteringer, rapporter eller hele regnskabet, når det passer dig. Dine data er altid dine — ingen leverandørlåsning.",
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
      "FSR standard kontoplan (fra 55 konti)",
      "E-fakturering (manuel fil-eksport)",
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
      "Avancerede rapporter (pengestrøm, aldersopdeling, budget vs. realiseret)",
      "Eksport af alle data (CSV, PDF, ZIP)",
      "Moms & årsregnskab (iXBRL for Erhvervsstyrelsen)",
      "Ægte bankintegration (Danske Bank, Nordea, Jyske Bank)",
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
      "Sproom Peppol-adgangspunkt inkluderet",
      "Ubegrænsede teammedlemmer",
    ],
  },
  {
    id: "3year",
    name: "Business Extended",
    priceMonthly: "145 kr.",
    pricePeriod: "pr. måned — 5.220 kr./36 md.",
    description: "Fuld pakke med størst mulig rabat",
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
  /** Optional lucide icon component to render inline with the value */
  icon?: LucideIcon;
}

export const MARKETING_STATS: readonly StatItem[] = [
  { value: "0 kr.", label: "Gratis under 50.000 kr. omsætning" },
  { value: "5 min", label: "Opsætning af din virksomhed" },
  { value: "24/7", label: "Adgang når det passer dig" },
  { value: "5 ÅR", label: "Opbevaring af sikkerhedskopier", icon: ShieldCheck },
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
    title: "Bogføringslov § 10-12",
    description: "Uforanderlig revisionslog og sletning med fuld historik",
  },
  {
    icon: FileCheck2,
    title: "SAF-T & iXBRL",
    description: "Eksport til Skattestyrelsen og Erhvervsstyrelsen",
  },
  {
    icon: DatabaseBackup,
    title: "Krypterede sikkerhedskopier",
    description: "Krypterede sikkerhedskopier, der kontrolleres automatisk",
  },
  {
    icon: Globe,
    title: "Peppol / OIOUBL",
    description: "E-fakturering via Peppol-netværket",
  },
] as const;

// ─── Company facts (for /about) ──────────────────────────────────────

export const COMPANY_FACTS = {
  name: "AlphaAi Consult ApS",
  parent: "AlphaCloud Holding ApS",
  cvr: "46312058",
  address: "Skelagervej 124, 8200 Aarhus N, Danmark",
  email: "info@alphaflow.dk",
  emailAlt: "support@alphaflow.dk",
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
      "AlphaAi Consult ApS grundlægges med mission om at gøre dansk bogføring tilgængelig og intelligent — for små virksomheder og deres bogholdere.",
  },
  {
    year: "2024",
    title: "Første version lanceres",
    description:
      "Dobbelt bogføring, FSR-kontoplan, momsafregning og Peppol e-fakturering samles i én platform, der virker på computer, mobil og tablet.",
  },
  {
    year: "2025",
    title: "Hermes AI integreres",
    description:
      "AI-assistenten Hermes tilføjes, så du kan stille regnskabsspørgsmål på dansk og få svar bygget på dine egne tal.",
  },
  {
    year: "2025",
    title: "Open Banking & OCR",
    description:
      "Bankintegration med Danske Bank, Nordea og Jyske Bank — og intelligent scanning af bilag direkte fra kameraet.",
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
    title: "Reglerne først",
    description:
      "Vi bygger AlphaFlow til dansk bogføringslov fra bunden — ikke som en eftertanke. Revisionslog, låste perioder og krypterede sikkerhedskopier er med fra dag ét.",
  },
  {
    icon: TrendingUp,
    title: "Automatisering",
    description:
      "Manuel bogføring hører fortiden til. Vi automatiserer momsafregning, bankafstemning og bilagsscanning, så du kan bruge tiden på din virksomhed.",
  },
  {
    icon: Wallet,
    title: "Fair priser",
    description:
      "Godt regnskabssoftware behøver ikke at koste en formue. Vores priser starter ved 0 kr. og går aldrig over 199 kr./md. — ingen skjulte gebyrer.",
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
      "Eksportér dine data, når det passer dig — som CSV, PDF, SAF-T eller komplet backup. Ingen leverandørlåsning og ingen skjulte betingelser.",
  },
  {
    icon: Target,
    title: "Til små virksomheder",
    description:
      "Vi fokuserer på danske småvirksomheder: enkeltmandsvirksomheder, ApS, A/S og holdingselskaber. Ikke bygget til koncerner — men til dig og din virksomhed.",
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
