import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { PwaProvider } from "@/components/pwa/pwa-register";
import { OfflineNotice } from "@/components/pwa/offline-notice";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { HermesProvider } from "@/components/hermes";
import { DataSyncProvider } from "@/components/providers/data-sync-provider";
import { AlphaFlowStructuredData } from "@/components/SEO/structured-data";
import {
  SITE,
  KEYWORDS_DA,
  KEYWORDS_EN,
  META,
  OPEN_GRAPH,
  TWITTER_CARD,
  GEO,
} from "@/lib/seo";

// ─── Fonts ────────────────────────────────────────────────────────
const geistSans = localFont({
  src: [
    { path: "../fonts/GeistSans-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/GeistSans-Medium.woff2", weight: "500", style: "normal" },
    { path: "../fonts/GeistSans-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../fonts/GeistSans-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = localFont({
  src: [
    { path: "../fonts/GeistMono-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/GeistMono-Medium.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-geist-mono",
  display: "swap",
});

// ─── Metadata (Next.js Metadata API) ──────────────────────────────
export const metadata: Metadata = {
  // ── Title ──────────────────────────────────────────────────────
  title: {
    default: `${SITE.name} — Intelligent regnskabsprogram for danske virksomheder | Bogføring, Moms & E-faktura`,
    template: `%s · ${SITE.name} Regnskabsprogram`,
  },

  // ── Description ────────────────────────────────────────────────
  description: META.description,

  // ── Keywords ───────────────────────────────────────────────────
  keywords: [...KEYWORDS_DA, ...KEYWORDS_EN],

  // ── Authors & Publisher ────────────────────────────────────────
  authors: [{ name: SITE.company }, { name: SITE.name }],
  creator: SITE.company,
  publisher: SITE.company,

  // ── Base URL & Canonical ───────────────────────────────────────
  metadataBase: new URL(SITE.url),
  alternates: {
    canonical: "/",
    languages: {
      "da-DK": "/",
      "en-DK": "/?lang=en",
    },
  },

  // ── Icons ──────────────────────────────────────────────────────
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },

  // ── PWA Manifest ───────────────────────────────────────────────
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: SITE.name,
    startupImage: [
      {
        url: "/apple-touch-icon.png",
        media: "(device-width: 768px) and (device-height: 1024px)",
      },
    ],
  },

  // ── Open Graph ─────────────────────────────────────────────────
  openGraph: {
    type: OPEN_GRAPH.type,
    locale: OPEN_GRAPH.locale,
    alternateLocale: OPEN_GRAPH.localeAlternate,
    url: SITE.url,
    siteName: OPEN_GRAPH.siteName,
    title: `${SITE.name} — Intelligent regnskabsprogram for danske virksomheder`,
    description: META.ogDescription,
    images: [
      {
        url: OPEN_GRAPH.image,
        width: OPEN_GRAPH.imageWidth,
        height: OPEN_GRAPH.imageHeight,
        alt: OPEN_GRAPH.imageAlt,
        type: OPEN_GRAPH.imageType,
        secureUrl: `${SITE.url}${OPEN_GRAPH.image}`,
      },
    ],
    determiner: OPEN_GRAPH.determiner,
  },

  // ── Twitter Card ───────────────────────────────────────────────
  twitter: {
    card: TWITTER_CARD.card,
    site: TWITTER_CARD.site,
    creator: TWITTER_CARD.creator,
    title: `${SITE.name} — Intelligent bogføring for danske SMV'er`,
    description: META.twitterDescription,
    images: [TWITTER_CARD.image],
  },

  // ── Robots Directives ──────────────────────────────────────────
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  // ── Verification (add real tokens when available) ───────────────
  // verification: {
  //   google: "YOUR_GOOGLE_VERIFICATION_TOKEN",
  //   yandex: "YOUR_YANDEX_VERIFICATION_TOKEN",
  // },

  // ── Classification ─────────────────────────────────────────────
  category: "Regnskab og Bogføring",
  classification: "Finansiel Software - Regnskabsprogram - Danmark",

  // ── Custom Meta Tags ───────────────────────────────────────────
  other: {
    "mobile-web-app-capable": "yes",
    "theme-color": "#0d9488",
    "msapplication-TileColor": "#0d9488",
    "msapplication-TileImage": "/icon-512.png",
    "geo.region": GEO.region,
    "geo.placename": GEO.placename,
    "geo.position": GEO.position,
    ICBM: `${GEO.latitude}, ${GEO.longitude}`,
    "product:brand": SITE.name,
    "product:category": "Regnskabssoftware",
    "app-name": SITE.name,
    "application-name": SITE.name,
    "business:cvr": SITE.cvr,
    "business:company": SITE.company,
  },
};

// ─── Viewport ─────────────────────────────────────────────────────
export const viewport: Viewport = {
  themeColor: "#0d9488",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

// ─── Root Layout ──────────────────────────────────────────────────
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="da" dir="ltr" suppressHydrationWarning>
      <head>
        {/* ── Hreflang Links (belt-and-suspenders with metadata.alternates) ── */}
        <link rel="alternate" hrefLang="da-DK" href={`${SITE.url}/`} />
        <link rel="alternate" hrefLang="en-DK" href={`${SITE.url}/?lang=en`} />
        <link rel="alternate" hrefLang="x-default" href={`${SITE.url}/`} />

        {/* ── DNS Prefetch for external resources ────────────────── */}
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://www.google-analytics.com" />

        {/* ── Structured Data (JSON-LD) ──────────────────────────── */}
        <AlphaFlowStructuredData />

        {/* ── Geo Meta Tags (redundant with metadata.other for max compat) ── */}
        <meta name="geo.region" content={GEO.region} />
        <meta name="geo.placename" content={GEO.placename} />
        <meta name="geo.position" content={GEO.position} />
        <meta name="ICBM" content={`${GEO.latitude}, ${GEO.longitude}`} />

        {/* ── Author ─────────────────────────────────────────────── */}
        <meta name="author" content={SITE.company} />

        {/* ── Robots ────────────────────────────────────────────── */}
        <meta
          name="robots"
          content="index, follow, max-snippet:-1, max-image-preview:large"
        />

        {/* ── Danish/Norwegian local search engine meta ──────────── */}
        <meta name="page-topic" content="Regnskab" />
        <meta name="page-type" content="Regnskabssoftware" />
        <meta
          name="audience"
          content="SMV, Iværksættere, Revisorer, Bogholdere"
        />

        {/* ── Legacy IE compat ───────────────────────────────────── */}
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {/* ── Noscript fallback for crawlers and non-JS users ──── */}
        <noscript>
          <div
            style={{
              fontFamily: "system-ui, sans-serif",
              maxWidth: "800px",
              margin: "2rem auto",
              padding: "2rem",
              lineHeight: 1.6,
              color: "#1a1d1c",
            }}
          >
            <h1
              style={{
                fontSize: "1.75rem",
                fontWeight: 700,
                marginBottom: "1rem",
              }}
            >
              AlphaFlow — Intelligent regnskabsprogram for danske
              virksomheder
            </h1>
            <p>
              AlphaFlow er et cloud-baseret regnskabsprogram udviklet specifikt
              til danske virksomheder. Det tilbyder dobbelt bogføring,
              automatisk momsafregning med alle 10 danske momskoder, Peppol
              e-fakturering (OIOUBL BIS Billing 3.0), OCR bilagsscanning med
              Tesseract.js og OpenCV, SAF-T eksport (Dansk Finansskema v1.0),
              projektregnskab, budgetstyring, likviditetsprognose og fuld
              compliance med dansk bogføringslov.
            </p>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "1.5rem 0 0.75rem" }}>
              Nøglefunktioner
            </h2>
            <ul style={{ paddingLeft: "1.5rem" }}>
              <li>Automatisk momsafregning med alle 10 danske momskoder</li>
              <li>Peppol e-fakturering (OIOUBL BIS Billing 3.0)</li>
              <li>OCR bilagsscanning med Tesseract.js og OpenCV</li>
              <li>SAF-T eksport (Dansk Finansskema v1.0)</li>
              <li>FSR standard kontoplan med 38 konti</li>
              <li>Multi-virksomhed med rollebaseret adgangskontrol (RBAC)</li>
              <li>AI-baseret bankafstemning</li>
              <li>Finansielle rapporter (resultatopgørelse, balance, pengestrøm)</li>
              <li>Projektregnskab med under-budgets</li>
              <li>Likviditetsprognose og aldersopdelt rapport</li>
              <li>Årsafslutning med automatisk resultatopgørelse og balance</li>
              <li>PWA med offline-support og kamera-scanning</li>
              <li>Open Banking integration (Danske Bank, Nordea, Jyske Bank)</li>
              <li>Hermes AI-assistent til regnskabsspørgsmål</li>
              <li>Gratis så længe omsætningen er under 50.000 kr. — intet kreditkort påkrævet</li>
            </ul>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "1.5rem 0 0.75rem" }}>
                Compliance & Sikkerhed
              </h2>
              <p>
                AlphaFlow opfylder kravene i dansk bogføringslov (§10-12) med
                uforanderlig revisionslog, soft-delete med bevarelse, lukkede
                regnskabsperioder, og SHA-256 checksum-beskyttede backupper med op
                til 60 måneders retention. Alle dataoverførsler krypteres via
                HTTPS med HTTP-only session cookies.
              </p>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "1.5rem 0 0.75rem" }}>
                Om AlphaFlow
              </h2>
              <p>
                AlphaFlow er udviklet af {SITE.company} (CVR: {SITE.cvr}).
                Understøtter virksomhedstyper: Enkeltmandsvirksomhed, ApS, A/S,
                IVS og Holdingselskaber. Tilgængelig på dansk og engelsk.
              </p>
            <p style={{ marginTop: "1.5rem", fontWeight: 600 }}>
              For at bruge AlphaFlow skal du aktivere JavaScript i din browser.
            </p>
          </div>
        </noscript>

        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <OfflineNotice />
          <PwaProvider>
            <DataSyncProvider>
              <HermesProvider>{children}</HermesProvider>
            </DataSyncProvider>
          </PwaProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
