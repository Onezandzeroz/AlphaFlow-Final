/**
 * AlphaFlow SEO — Single Source of Truth
 * All SEO metadata, keywords, structured data constants live here.
 * Import from this file wherever SEO data is needed.
 */

// ─── Site Identity ───────────────────────────────────────────────
export const SITE = {
  name: "AlphaFlow",
  domain: "alphaflow.dk",
  url: "https://alphaflow.dk" as const,
  company: "AlphaAi Consult ApS",
  cvr: "46312058",
  email: "info@alphaflow.dk",
  locale: "da_DK",
  localeAlt: "en_DK",
  language: "da",
  languageAlt: "en",
  tagline:
    "Intelligent regnskabsprogram for danske virksomheder — automatisk moms, Peppol e-faktura, OCR bilagsscanning & fuld bogføringslov compliance.",
} as const;

// ─── Danish Keywords (Primary Market) ────────────────────────────
export const KEYWORDS_DA: readonly string[] = [
  "regnskabsprogram",
  "bogføring",
  "økonomisystem",
  "momsafregning",
  "fakturering",
  "e-faktura",
  "peppol",
  "SAF-T",
  "bogføringslov",
  "regnskab for små virksomheder",
  "dansk bogføring",
  "moms",
  "Skattestyrelsen",
  "OCR kvitteringsscanning",
  "kontoplan",
  "finansrapport",
  "Årsafslutning",
  "bankafstemning",
  "kreditnota",
  "regnskabsprogram Danmark",
  "gratis regnskabsprogram",
  "bogføring online",
  "enkel bogføring",
  "regnskabssoftware",
  "faktura program",
  "elektronisk fakturering",
  "Nemhandel",
  "NemKonto",
  "ERP system Danmark",
  "kontoadministration",
  "projektregnskab",
  "budgetstyring",
  "likviditetsstyring",
  "finansielle rapporter",
  "OCR scanning",
  "dobbelt bogføring",
  "hovedbog",
  "finansjournal",
  "årsgang",
] as const;

// ─── English Keywords (Secondary Market) ─────────────────────────
export const KEYWORDS_EN: readonly string[] = [
  "accounting software Denmark",
  "Danish bookkeeping",
  "VAT reporting Denmark",
  "Peppol invoicing",
  "SAF-T export",
  "Danish Bookkeeping Act compliance",
  "small business accounting Denmark",
  "OCR receipt scanning",
  "multi-tenant accounting",
  "e-invoicing Denmark",
  "financial reporting",
  "Danish tax compliance",
  "project accounting Denmark",
  "budget management software",
  "cash flow forecasting",
] as const;

// ─── Meta Descriptions ────────────────────────────────────────────
export const META = {
  /** Primary Danish description (~280 chars, optimized for SERP display) */
  description:
    "AlphaFlow er et intelligent dansk regnskabsprogram med automatisk momsafregning, Peppol e-fakturering (OIOUBL), OCR bilagsscanning, SAF-T eksport og fuld compliance med dansk bogføringslov. 60 dages gratis prøveperiode — intet kreditkort påkrævet. Prøv gratis i dag.",

  /** Shorter Danish description for Open Graph social cards */
  ogDescription:
    "Intelligent regnskabsprogram for danske virksomheder — moms, e-faktura, OCR & bogføringslov compliance.",

  /** Danish description for Twitter/X cards */
  twitterDescription:
    "AlphaFlow: Intelligent bogføring for danske SMV'er. Momsafregning, Peppol e-faktura, OCR scanning. 60 dages gratis prøveperiode.",

  /** English alternate description */
  descriptionEN:
    "AlphaFlow is an intelligent Danish accounting platform with automatic VAT reporting, Peppol e-invoicing (OIOUBL), OCR receipt scanning, SAF-T export, and full Danish Bookkeeping Act compliance. 60-day free trial — no credit card required.",
} as const;

// ─── Open Graph Defaults ─────────────────────────────────────────
export const OPEN_GRAPH = {
  type: "website" as const,
  siteName: SITE.name,
  locale: SITE.locale,
  localeAlternate: SITE.localeAlt,
  image: "/og-image.png",
  imageWidth: 1200,
  imageHeight: 630,
  imageAlt:
    "AlphaFlow — Intelligent regnskabsprogram for danske virksomheder",
  imageType: "image/png",
  determiner: "the" as const,
} as const;

// ─── Twitter Card Defaults ───────────────────────────────────────
export const TWITTER_CARD = {
  card: "summary_large_image" as const,
  site: "@alphaflow_dk",
  creator: "@alphaflow_dk",
  image: OPEN_GRAPH.image,
} as const;

// ─── FAQ (Danish) — for FAQPage JSON-LD schema ────────────────────
export const FAQ_DA: readonly {
  question: string;
  answer: string;
}[] = [
  {
    question: "Hvad er AlphaFlow?",
    answer:
      "AlphaFlow er et cloud-baseret regnskabsprogram udviklet specifikt til danske virksomheder. Det tilbyder dobbelt bogføring, automatisk momsafregning med alle 10 danske momskoder, Peppol e-fakturering, OCR bilagsscanning, projektregnskab, budgetstyring og fuld compliance med dansk bogføringslov.",
  },
  {
    question: "Er AlphaFlow gratis?",
    answer:
      "Ja, AlphaFlow tilbyder 60 dages gratis prøveperiode med fuld adgang til alle funktioner. Der kræves intet kreditkort for at starte. Efter prøveperioden tilbydes fleksible abonnementer.",
  },
  {
    question: "Hvordan fungerer momsafregning i AlphaFlow?",
    answer:
      "AlphaFlow understøtter alle 10 danske momskoder (salgsmoms, købsmoms, EU-indkøb, EU-salg, reverse charge mv.). Systemet beregner automatisk momsbalancen for hver afregningsperiode og genererer klar momsrapporter til Skattestyrelsen.",
  },
  {
    question: "Kan jeg sende e-fakturaer med AlphaFlow?",
    answer:
      "Ja, AlphaFlow understøtter Peppol-netværket via OIOUBL BIS Billing 3.0-standarden. Du kan registrere dit virksomhedsnummer, sende og modtage e-fakturaer direkte i systemet, og spore afsendelsesstatus. Integration med Storecove for nem tilmelding.",
  },
  {
    question: "Er AlphaFlow compliant med dansk bogføringslov?",
    answer:
      "Ja. AlphaFlow opfylder kravene i bogføringslovens §10-12 med uforanderlig revisionslog (audit trail), §4-8 med soft-delete (sletning med bevarelse), lukkede regnskabsperioder, og SHA-256 checksum-beskyttede backupper med op til 60 måneders retention.",
  },
  {
    question: "Hvad er SAF-T eksport?",
    answer:
      "SAF-T (Standard Audit File for Tax) er et internationalt standardformat for finansielle data. AlphaFlow eksporterer i Dansk Finansskema v1.0-formatet, som Skattestyrelsen anvender. Eksporten inkluderer hovedbogsposter, saldi og transaktioner.",
  },
  {
    question: "Kan flere brugere bruge AlphaFlow sammen?",
    answer:
      "Ja, AlphaFlow er et multi-tenant system med rollebaseret adgangskontrol (RBAC). Tilgængelige roller: Ejer, Administrator, Bogholder, Læser og Revisor. Invitation af teammedlemmer sker via e-mail.",
  },
  {
    question: "Hvordan fungerer OCR scanning af bilag?",
    answer:
      "AlphaFlow bruger Tesseract.js og OpenCV til at analysere uploadede kvitteringer og fakturaer. Systemet udtrækker automatisk beløb, datoer, momssatser og CVR-numre, og foreslår konto-kategorisering baseret på dansk kontoplan-standard.",
  },
  {
    question: "Hvilke virksomhedstyper understøttes?",
    answer:
      "AlphaFlow understøtter alle danske virksomhedstyper: Enkeltmandsvirksomhed, ApS, A/S, IVS, og Holdingselskaber. Kontoplanen tilpasses automatisk baseret på virksomhedstype med FSR-standard kontoplan (38 standardkonti).",
  },
  {
    question: "Kan jeg bruge AlphaFlow på min telefon?",
    answer:
      "Ja, AlphaFlow er en PWA (Progressive Web App) med offline-support, kamera-baseret bilagsscanning, og fuld mobiloptimeret brugerflade. Appen kan installeres direkte fra browseren på iOS og Android.",
  },
  {
    question: "Hvordan sikres mine data i AlphaFlow?",
    answer:
      "Alle dataoverførsler krypteres via HTTPS. Adgangskoder hashes med bcrypt. Sessioner håndteres via HTTP-only cookies. Backupper beskyttes med SHA-256 checksum. Der foretages aldrig fysisk sletning af regnskabsdata — kun soft-delete med bevarelse til revision.",
  },
  {
    question: "Hvilke eksportformater understøttes?",
    answer:
      "AlphaFlow understøtter CSV-eksport af posteringer og rapporter, SAF-T XML til Skattestyrelsen, OIOUBL/Peppol e-faktura, ZIP-backupper med komplet data, og inter-instance dataoverførsel for migrering mellem installationer.",
  },
] as const;

// ─── Feature List (for SoftwareApplication schema) ───────────────
export const FEATURES_DA: readonly string[] = [
  "Dobbelt bogføring med automatisk finansjournal",
  "Automatisk momsafregning med alle 10 danske momskoder",
  "Peppol e-fakturering (OIOUBL BIS Billing 3.0)",
  "OCR bilagsscanning med Tesseract.js og OpenCV",
  "SAF-T eksport (Dansk Finansskema v1.0)",
  "FSR standard kontoplan med 38 konti",
  "Multi-virksomhed med rollebaseret adgangskontrol (RBAC)",
  "AI-baseret bankafstemning",
  "Finansielle rapporter (resultatopgørelse, balance, pengestrømsanalyse)",
  "Lukkede regnskabsperioder",
  "Budgetstyring med afvigelsesanalyse",
  "Tilbagevendende posteringer",
  "Uforanderlig revisionslog (audit trail)",
  "60 måneders backup retention med SHA-256 checksum",
  "PWA med offline-support og kamera-scanning",
  "Open Banking integration (Danske Bank, Nordea, Jyske Bank)",
  "Projektregnskab med under-budgets",
  "Likviditetsprognose",
  "Aldersopdelt debitor/creditor-rapport",
  "Årsafslutning med automatisk resultatopgørelse og balance",
  "CVR-opslag direkte i systemet",
  "Valutahåndtering med automatisk kursopdatering",
  "Multi-sprog (dansk/engelsk)",
  "Hermes AI-assistent til regnskabsspørgsmål",
  "Storecove Peppol-adgangspunkt integration",
  "Kreditnota-håndtering",
] as const;

// ─── Schema.org Application Categories ────────────────────────────
export const CATEGORIES = [
  "FinanceApplication",
  "BusinessApplication",
  "AccountingApplication",
  "ProductivityApplication",
] as const;

// ─── Breadcrumbs ──────────────────────────────────────────────────
export const BREADCRUMBS: readonly {
  name: string;
  path: string;
}[] = [
  { name: "Forside", path: "/" },
  { name: "Dashboard", path: "/" },
  { name: "Posteringer", path: "/transactions" },
  { name: "Fakturaer", path: "/invoices" },
  { name: "Momsafregning", path: "/vat-report" },
  { name: "Regnskabsrapporter", path: "/reports" },
  { name: "Bankafstemning", path: "/bank-recon" },
  { name: "Kontoplan", path: "/accounts" },
  { name: "Eksport", path: "/exports" },
  { name: "Projekter", path: "/projects" },
  { name: "Indstillinger", path: "/settings" },
] as const;

// ─── Public Routes (for sitemap) ─────────────────────────────────
export const PUBLIC_ROUTES: readonly {
  path: string;
  changeFrequency:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority: number;
}[] = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },
  { path: "/terms", changeFrequency: "monthly", priority: 0.3 },
] as const;

// ─── Geo Targeting (Copenhagen, Denmark) ─────────────────────────
export const GEO = {
  region: "DK",
  placename: "Danmark",
  latitude: 55.6761,
  longitude: 9.5463,
  position: "55.6761;9.5463",
} as const;

// ─── Business Info (for LocalBusiness schema) ─────────────────────
export const BUSINESS = {
  priceRange: "0 DKK – 499 DKK/måned",
  currenciesAccepted: "DKK",
  paymentAccepted: "Kreditkort, MobilePay, Bankoverførsel",
  openingHours: "Mo-Fr 09:00-17:00",
  serviceRadius: 50, // km from Copenhagen
} as const;
