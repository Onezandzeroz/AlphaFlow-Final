import type { MetadataRoute } from "next";
import { SITE, PUBLIC_ROUTES } from "@/lib/seo";

/**
 * Dynamic sitemap.xml generator.
 * Next.js App Router will serve this at /sitemap.xml automatically.
 *
 * The app is primarily an SPA with a single public route (/),
 * so the sitemap is intentionally minimal. Expand when public
 * marketing pages (e.g. /features, /pricing, /about) are added.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return PUBLIC_ROUTES.map((route) => ({
    url: `${SITE.url}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
