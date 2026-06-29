"use client";

import React from "react";
import {
  SITE,
  KEYWORDS_DA,
  META,
  FEATURES_DA,
  CATEGORIES,
  FAQ_DA,
  BREADCRUMBS,
  GEO,
  BUSINESS,
} from "@/lib/seo";

// ─── Helper ───────────────────────────────────────────────────────
function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

// ─── 1. Organization Schema ───────────────────────────────────────
function OrganizationSchema() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": `${SITE.url}/#organization`,
        name: SITE.name,
        alternateName: `${SITE.name} Regnskabsprogram`,
        url: SITE.url,
        logo: {
          "@type": "ImageObject",
          url: `${SITE.url}/logo.png`,
          width: 340,
          height: 228,
          caption: `${SITE.name} logo`,
        },
        foundingLocation: {
          "@type": "PostalAddress",
          addressCountry: "DK",
          addressLocality: "København",
        },
        contactPoint: [
          {
            "@type": "ContactPoint",
            contactType: "customer support",
            email: SITE.email,
            availableLanguage: [SITE.language, SITE.languageAlt],
          },
          {
            "@type": "ContactPoint",
            contactType: "sales",
            email: SITE.email,
            availableLanguage: [SITE.language, SITE.languageAlt],
          },
        ],
        // Add social profiles when available:
        // sameAs: [
        //   "https://linkedin.com/company/alphaflow",
        //   "https://twitter.com/alphaflow_dk",
        //   "https://facebook.com/alphaflow",
        // ],
        taxID: SITE.cvr,
        legalName: SITE.company,
        knowsLanguage: [SITE.language, SITE.languageAlt],
        areaServed: {
          "@type": "Country",
          name: "Denmark",
          identifier: "DK",
        },
        industry: "Regnskab og bogføring",
        keywords: KEYWORDS_DA.join(", "),
        subjectOf: {
          "@type": "Thing",
          name: "Dansk bogføringslov (Bogføringsloven)",
          description:
            "AlphaFlow er udviklet i overensstemmelse med dansk bogføringslov (LBK nr. 1473 af 14/12/2023) med krav til dokumentation, bogføring, opbevaring og revisionslog.",
        },
      }}
    />
  );
}

// ─── 2. SoftwareApplication Schema ───────────────────────────────
function SoftwareApplicationSchema() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: SITE.name,
        alternateName: `${SITE.name} Regnskabsprogram`,
        applicationCategory: CATEGORIES.join(", "),
        operatingSystem: "Web, iOS, Android",
        browserRequirements:
          "Kræver JavaScript. Understøtter Chrome, Firefox, Safari, Edge.",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "DKK",
          description:
            "60 dages gratis prøveperiode med fuld adgang. Intet kreditkort påkrævet.",
          availability: "https://schema.org/OnlineOnly",
          billingIncrement: {
            "@type": "UnitPriceSpecification",
            billingDuration: {
              "@type": "QuantitativeValue",
              value: 60,
              unitCode: "DAY",
            },
          },
        },
        featureList: FEATURES_DA.join("; "),
        softwareVersion: "1.0.0",
        // NOTE: aggregateRating should only be included when backed by
        // a real review system. Uncomment and populate from real data:
        // aggregateRating: {
        //   "@type": "AggregateRating",
        //   ratingValue: "4.8",
        //   bestRating: "5",
        //   worstRating: "1",
        //   ratingCount: "127",
        // },
        author: {
          "@type": "Organization",
          "@id": `${SITE.url}/#organization`,
        },
        publisher: {
          "@type": "Organization",
          "@id": `${SITE.url}/#organization`,
        },
        inLanguage: [SITE.locale, SITE.localeAlt],
        screenshot: {
          "@type": "ImageObject",
          url: `${SITE.url}/og-image.png`,
          caption: `${SITE.name} Dashboard`,
        },
      }}
    />
  );
}

// ─── 3. WebSite Schema ────────────────────────────────────────────
function WebSiteSchema() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": `${SITE.url}/#website`,
        name: SITE.name,
        url: SITE.url,
        publisher: {
          "@type": "Organization",
          "@id": `${SITE.url}/#organization`,
        },
        inLanguage: [
          {
            "@type": "Language",
            name: "Dansk",
            alternateName: "da",
          },
          {
            "@type": "Language",
            name: "English",
            alternateName: "en",
          },
        ],
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${SITE.url}/?q={search_term_string}`,
          },
          "actionPlatform": [
            "https://schema.org/DesktopWebPlatform",
            "https://schema.org/MobileWebPlatform",
            "https://schema.org/IOSPlatform",
            "https://schema.org/AndroidPlatform",
          ],
        },
      }}
    />
  );
}

// ─── 4. FAQPage Schema ────────────────────────────────────────────
function FAQPageSchema() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "@id": `${SITE.url}/#faq`,
        mainEntity: FAQ_DA.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
        publisher: {
          "@type": "Organization",
          "@id": `${SITE.url}/#organization`,
        },
      }}
    />
  );
}

// ─── 5. BreadcrumbList Schema ─────────────────────────────────────
function BreadcrumbListSchema() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "@id": `${SITE.url}/#breadcrumb`,
        itemListElement: BREADCRUMBS.map((crumb, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: crumb.name,
          item: `${SITE.url}${crumb.path}`,
        })),
      }}
    />
  );
}

// ─── 6. LocalBusiness Schema ─────────────────────────────────────
function LocalBusinessSchema() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": ["Organization", "LocalBusiness"],
        "@id": `${SITE.url}/#localbusiness`,
        name: SITE.name,
        tradingName: SITE.name,
        url: SITE.url,
        hasOfferCatalog: {
          "@type": "OfferCatalog",
          name: "AlphaFlow Tjenester",
          itemListElement: [
            {
              "@type": "Offer",
              itemOffered: {
                "@type": "Service",
                name: "Cloud Regnskabsprogram",
                description:
                  "Komplet cloud-baseret regnskabssoftware med dobbelt bogføring, automatisk moms, e-faktura og rapportering.",
              },
            },
            {
              "@type": "Offer",
              itemOffered: {
                "@type": "Service",
                name: "Peppol E-fakturering",
                description:
                  "Send og modtag e-fakturaer via Peppol-netværket med OIOUBL BIS Billing 3.0 standard.",
              },
            },
            {
              "@type": "Offer",
              itemOffered: {
                "@type": "Service",
                name: "SAF-T Eksport",
                description:
                  "Eksporter regnskabsdata i Dansk Finansskema v1.0 format til Skattestyrelsen.",
              },
            },
          ],
        },
        areaServed: {
          "@type": "GeoCircle",
          geoMidpoint: {
            "@type": "GeoCoordinates",
            latitude: GEO.latitude,
            longitude: GEO.longitude,
          },
          geoRadius: `${BUSINESS.serviceRadius} km`,
        },
        priceRange: BUSINESS.priceRange,
        currenciesAccepted: BUSINESS.currenciesAccepted,
        paymentAccepted: BUSINESS.paymentAccepted,
        openingHoursSpecification: {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: [
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
          ],
          opens: "09:00",
          closes: "17:00",
        },
      }}
    />
  );
}

// ─── 7. WebPage Schema ────────────────────────────────────────────
function WebPageSchema() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "WebPage",
        "@id": `${SITE.url}/#webpage`,
        name: `${SITE.name} — ${META.ogDescription}`,
        description: META.description,
        url: SITE.url,
        inLanguage: SITE.locale,
        isPartOf: {
          "@type": "WebSite",
          "@id": `${SITE.url}/#website`,
        },
        about: {
          "@type": "Organization",
          "@id": `${SITE.url}/#organization`,
        },
        datePublished: "2025-01-15T00:00:00+01:00",
        dateModified: new Date().toISOString().split("T")[0],
      }}
    />
  );
}

// ─── Combined Export ──────────────────────────────────────────────
/**
 * Renders ALL JSON-LD structured data schemas for the page.
 * Place once in the root layout <head>.
 */
export function AlphaFlowStructuredData() {
  return (
    <>
      <OrganizationSchema />
      <LocalBusinessSchema />
      <SoftwareApplicationSchema />
      <WebSiteSchema />
      <FAQPageSchema />
      <BreadcrumbListSchema />
      <WebPageSchema />
    </>
  );
}
