"use client";

import { MARKETING_NAV } from "@/lib/marketing-data";

/**
 * Minimal marketing navigation for unauthenticated screens (login,
 * verify-email, reset-password).
 *
 * Renders a horizontal row of links: Forside (landing page) + the public
 * marketing pages (Funktioner, Priser, Om os, FAQ, Kontakt). Placed at the
 * top of the SPA's auth screens so users can discover and browse the
 * marketing site without being trapped on the login screen.
 *
 * Uses plain <a> tags (full page navigation) because the marketing pages
 * are server-rendered routes — navigating from the SPA to them must be a
 * full page load, not a client-side pushState.
 */
export function AuthMarketingNav() {
  const links = [
    { href: "/", label: "Forside" },
    ...MARKETING_NAV,
  ];
  return (
    <nav
      aria-label="Marketing"
      className="relative z-20 w-full flex items-center justify-center flex-wrap gap-x-0.5 gap-y-1 px-4 pt-4 sm:pt-5"
    >
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          className="px-2.5 sm:px-3 py-1.5 rounded-lg text-[12px] sm:text-[13px] font-medium text-gray-500 hover:text-[#0d9488] hover:bg-[#0d9488]/5 transition-all duration-150"
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}
