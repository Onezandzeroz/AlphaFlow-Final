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
    "Intelligent regnskabsprogram til danske virksomheder — automatisk moms, e-faktura og bilagsscanning, bygget til bogføringslovens krav.",
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
    "AlphaFlow er et intelligent dansk regnskabsprogram med automatisk momsafregning, Peppol e-fakturering (OIOUBL 2.1), OCR bilagsscanning, SAF-T eksport og overholdelse af dansk bogføringslov. Gratis så længe din omsætning er under 50.000 kr. — intet kreditkort påkrævet. Prøv gratis i dag.",

  /** Shorter Danish description for Open Graph social cards */
  ogDescription:
    "Intelligent regnskabsprogram til danske virksomheder — moms, e-faktura, OCR og bogføringslovens krav indbygget fra start.",

  /** Danish description for Twitter/X cards */
  twitterDescription:
    "AlphaFlow: Intelligent bogføring for danske SMV'er. Momsafregning, Peppol e-faktura, OCR scanning. Gratis så længe omsætningen er under 50.000 kr.",

  /** English alternate description */
  descriptionEN:
    "AlphaFlow is an intelligent Danish accounting platform with automatic VAT reporting, Peppol e-invoicing (OIOUBL 2.1), OCR receipt scanning, SAF-T export, and full Danish Bookkeeping Act compliance. Free as long as your revenue is below 50,000 DKK — no credit card required.",
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
      "AlphaFlow er et netbaseret regnskabsprogram, der er udviklet specifikt til danske virksomheder. Du får dobbelt bogføring, automatisk momsafregning med alle 10 danske momskoder, e-fakturering via Peppol, scanning af bilag med kameraet samt projektregnskab og budgetstyring — bygget til bogføringslovens krav.",
  },
  {
    question: "Er AlphaFlow gratis?",
    answer:
      "Ja — AlphaFlow er gratis, så længe din virksomheds omsætning er under 50.000 kr. om året. Du får fuld adgang til alle grundlæggende funktioner, og du skal ikke oplyse kortoplysninger. Når omsætningen overstiger 50.000 kr., kan du vælge et af vores fleksible abonnementer.",
  },
  {
    question: "Hvordan fungerer momsafregning i AlphaFlow?",
    answer:
      "AlphaFlow understøtter alle 10 danske momskoder — fra salgs- og købsmoms til EU-handel og udenlandske ydelser. Systemet beregner automatisk momsbalancen for hver afregningsperiode og genererer en momsrapport, der er klar til indberetning til Skattestyrelsen.",
  },
  {
    question: "Kan jeg sende e-fakturaer med AlphaFlow?",
    answer:
      "Ja. AlphaFlow er tilsluttet Peppol-netværket, så du kan sende og modtage e-fakturaer direkte fra systemet og følge status på hver afsendelse. Tilmeldingen til Peppol sker nemt via vores samarbejdspartner Sproom.",
  },
  {
    question: "Lever AlphaFlow op til bogføringsloven?",
    answer:
      "Ja. AlphaFlow er bygget til bogføringslovens krav: en revisionslog, der ikke kan ændres (§ 10-12), sletning med fuld bevarelse af historikken (§ 4-8), mulighed for at låse regnskabsperioder samt krypterede sikkerhedskopier, der opbevares i op til 60 måneder — mere end lovens 5-årskrav.",
  },
  {
    question: "Hvad er SAF-T eksport?",
    answer:
      "SAF-T er et standardformat, som Skattestyrelsen bruger til at læse regnskabsdata elektronisk. AlphaFlow kan eksportere hele regnskabet i det danske SAF-T-format — fx hvis Skattestyrelsen beder om det i forbindelse med en revision.",
  },
  {
    question: "Kan flere brugere bruge AlphaFlow sammen?",
    answer:
      "Ja. Du kan invitere teammedlemmer via e-mail og give dem præcis den adgang, de skal bruge: Ejer, Administrator, Bogholder, Læser eller Revisor. Det gør det nemt at samarbejde med en ekstern bogholder eller revisor.",
  },
  {
    question: "Hvordan fungerer scanning af bilag?",
    answer:
      "Du fotograferer eller uploader bilaget, hvorefter systemet automatisk læser beløb, dato, momssats og CVR-nummer. Derefter foreslår AI'en den rette konto ud fra din kontoplan og dine tidligere bogføringer — du skal blot godkende.",
  },
  {
    question: "Hvilke virksomhedstyper understøttes?",
    answer:
      "AlphaFlow understøtter alle almindelige danske virksomhedstyper: enkeltmandsvirksomhed, ApS, A/S, IVS og holdingselskaber. Kontoplanen tilpasses automatisk din virksomhedstype og bygger på FSR-standarden — som enkeltmandsvirksomhed får du automatisk konti til egenkapital, indskud, hævninger og private udgifter, og som holdingselskab får du konti til kapitalandele og udbytter.",
  },
  {
    question: "Kan jeg bruge AlphaFlow på min telefon?",
    answer:
      "Ja. AlphaFlow virker på mobil og tablet og kan installeres direkte fra browseren — uden app-store. Du kan scanne bilag med kameraet, og appen virker endda offline; ændringerne synkroniseres automatisk, når du er online igen.",
  },
  {
    question: "Hvordan sikres mine data i AlphaFlow?",
    answer:
      "Al trafik mellem dig og systemet er krypteret, og adgangskoder opbevares kun i krypteret form. Dine regnskabsdata slettes aldrig fysisk — posteringer kan altid findes frem igen til revision — og sikkerhedskopierne kontrolleres automatisk og opbevares i op til 5 år.",
  },
  {
    question: "Hvilke eksportformater understøttes?",
    answer:
      "Du kan eksportere posteringer og rapporter som CSV eller PDF, e-fakturaer i Peppol-format samt hele regnskabet som SAF-T eller komplet backup. Dine data er altid dine og kan tages med, når som helst.",
  },
  {
    question: "Hvad sker der, hvis jeg når min månedlige grænse for Hermes eller e-faktura?",
    answer:
      "Brug af Hermes AI og afsendelse/modtagelse af e-fakturaer og kreditnotaer er inkluderet frem til et månedligt forbrug, der passer til din plan (fx 50 e-fakturaer og 200 Hermes-beskeder på Pro). Når grænsen er nået, kan du tilkøbe ekstra e-faktura-forbrug i faste pakker à 200, 500, 1.000 eller 2.000 transaktioner til 1 kr. pr. transaktion — skriv til os via kontaktsiden, og vi udvider dit forbrug med det samme. E-faktura-grænsen gælder det samlede antal afsendte og modtagne e-fakturaer pr. kalendermåned og fornyes automatisk den 1. i den følgende måned.",
  },
] as const;

// ─── Feature List (for SoftwareApplication schema) ───────────────
export const FEATURES_DA: readonly string[] = [
  "Dobbelt bogføring med automatisk finansjournal",
  "Automatisk momsafregning med alle 10 danske momskoder",
  "Peppol e-fakturering (OIOUBL 2.1 & BIS Billing 3.0)",
  "Intelligent scanning af bilag (OCR)",
  "SAF-T eksport (Dansk Finansskema v2.1)",
  "FSR standard kontoplan, der tilpasses din virksomhedstype",
  "Flere virksomheder og roller i én konto",
  "AI-baseret bankafstemning",
  "Finansielle rapporter (resultatopgørelse, balance, pengestrømsanalyse)",
  "Lukkede regnskabsperioder",
  "Budgetstyring med afvigelsesanalyse",
  "Tilbagevendende posteringer",
  "Uforanderlig revisionslog (audit trail)",
  "Sikkerhedskopier i 60 måneder",
  "App til mobil og tablet — virker offline",
  "Open Banking integration (Danske Bank, Nordea, Jyske Bank)",
  "Projektregnskab med under-budgets",
  "Likviditetsprognose",
  "Aldersopdelt debitor/creditor-rapport",
  "Årsafslutning med automatisk resultatopgørelse og balance",
  "CVR-opslag direkte i systemet",
  "Valutahåndtering med automatisk kursopdatering",
  "Multi-sprog (dansk/engelsk)",
  "Hermes AI-assistent til regnskabsspørgsmål",
  "Sproom Peppol-adgangspunkt integration",
  "Kreditnota-håndtering",
  "Plan-baserede forbrugsgrænser for AI og e-faktura med nemt tilkøb af ekstra forbrug",
] as const;

// ─── Schema.org Application Categories ────────────────────────────
export const CATEGORIES = [
  "FinanceApplication",
  "BusinessApplication",
  "AccountingApplication",
  "ProductivityApplication",
] as const;

// ─── Breadcrumbs ──────────────────────────────────────────────────
// Public marketing breadcrumbs (crawlable). In-app breadcrumbs are handled
// client-side and are not included here.
export const BREADCRUMBS: readonly {
  name: string;
  path: string;
}[] = [
  { name: "Forside", path: "/" },
  { name: "Funktioner", path: "/features" },
  { name: "Priser", path: "/pricing" },
  { name: "Om os", path: "/about" },
  { name: "FAQ", path: "/faq" },
  { name: "Kontakt", path: "/contact" },
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
  { path: "/features", changeFrequency: "monthly", priority: 0.9 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.9 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.7 },
  { path: "/about", changeFrequency: "yearly", priority: 0.6 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.5 },
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
  priceRange: "0 DKK – 199 DKK/måned",
  currenciesAccepted: "DKK",
  paymentAccepted: "Kreditkort, MobilePay, Bankoverførsel",
  openingHours: "Mo-Fr 09:00-17:00",
  serviceRadius: 50, // km from Copenhagen
} as const;
