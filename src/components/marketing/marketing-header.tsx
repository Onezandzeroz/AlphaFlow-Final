import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileNav } from "@/components/marketing/mobile-nav";
import { MARKETING_NAV } from "@/lib/marketing-data";
import { SITE } from "@/lib/seo";

/**
 * Sticky public marketing header.
 *
 * Server component (no 'use client') — the only interactive part is the
 * <MobileNav /> island which manages its own state.
 *
 * Layout: logo flush left at screen edge · desktop nav with margin after
 * logo · login CTA + mobile menu flush right at screen edge. Content
 * spans the full viewport width (no max-width container), with horizontal
 * padding only so items reach the screen edges on all breakpoints.
 */
export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl shadow-[0_1px_3px_rgba(0,0,0,0.06)] border-b border-[#e2e8e6]/80">
      <div className="flex items-center justify-between h-16 sm:h-20 px-4 sm:px-6 lg:px-8">
        {/* Left: logo + desktop nav */}
        <div className="flex items-center gap-8 lg:gap-10">
          <Link
            href="/"
            className="flex items-center gap-2 group"
            aria-label={`${SITE.name} — forsiden`}
          >
            <Image
              src="/logo-clean.png"
              alt={`${SITE.name} logo`}
              width={217}
              height={145}
              className="object-contain h-12 sm:h-14 w-auto transition-transform group-hover:scale-[1.03]"
              priority
            />
          </Link>

          {/* Desktop nav — left-aligned with margin after logo */}
          <nav className="hidden lg:flex items-center gap-1">
            {MARKETING_NAV.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-[#0d9488] hover:bg-[#f0fdf9] transition-all duration-150"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Right: CTA + mobile menu */}
        <div className="flex items-center gap-2">
          <Button
            asChild
            size="sm"
            className="hidden sm:inline-flex h-9 text-sm"
          >
            <Link href="/login">
              Log ind
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
