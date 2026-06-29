import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

/**
 * Dynamic robots.txt generator.
 * Next.js App Router will serve this at /robots.txt automatically.
 *
 * - Disallows crawling of API routes and internal documents
 * - Per-bot crawl delays to manage crawl budget
 * - Social media crawlers explicitly allowed for OG/Twitter card rendering
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // ── Google: full access, no delay ─────────────────────────
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: ["/api/", "/documents/", "/receipts/"],
      },
      // ── Bing: full access, 1s delay ───────────────────────────
      {
        userAgent: "Bingbot",
        allow: "/",
        disallow: ["/api/", "/documents/", "/receipts/"],
        crawlDelay: 1,
      },
      // ── Yahoo (via Bing) ───────────────────────────────────────
      {
        userAgent: "Slurp",
        allow: "/",
        disallow: ["/api/", "/documents/", "/receipts/"],
      },
      // ── DuckDuckGo ─────────────────────────────────────────────
      {
        userAgent: "DuckDuckBot",
        allow: "/",
        disallow: ["/api/", "/documents/", "/receipts/"],
      },
      // ── Twitter/X: allow for card rendering ────────────────────
      {
        userAgent: "Twitterbot",
        allow: "/",
        disallow: "/api/",
      },
      // ── Facebook: allow for OG rendering ───────────────────────
      {
        userAgent: "facebookexternalhit",
        allow: "/",
        disallow: "/api/",
      },
      // ── LinkedIn: allow for preview rendering ──────────────────
      {
        userAgent: "LinkedInBot",
        allow: "/",
        disallow: "/api/",
      },
      // ── All other bots: conservative crawl ─────────────────────
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/documents/", "/receipts/"],
        crawlDelay: 2,
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
