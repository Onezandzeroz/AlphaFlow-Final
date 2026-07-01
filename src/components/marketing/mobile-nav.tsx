"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X, ArrowRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { MARKETING_NAV } from "@/lib/marketing-data";
import { SITE } from "@/lib/seo";

/**
 * Mobile navigation drawer for public marketing pages.
 *
 * This is the only client component in the marketing header — it manages
 * the open/closed state of the Sheet (hamburger menu). The rest of the
 * header is server-rendered; this island hydrates only the toggle button
 * and the slide-out panel.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Åbn menu"
          className="lg:hidden flex items-center justify-center h-10 w-10 rounded-xl bg-white/70 hover:bg-white border border-[#e2e8e6]/80 hover:border-[#0d9488]/30 text-gray-600 hover:text-[#0d9488] transition-all duration-150 shadow-sm hover:shadow-md cursor-pointer"
        >
          <Menu className="h-5 w-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full max-w-sm bg-[#f8faf9] p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col h-full">
          {/* Top bar with logo + close */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#e2e8e6]/60">
            <Link
              href="/"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2"
            >
              <Image
                src="/logo-clean.png"
                alt="AlphaFlow"
                width={120}
                height={80}
                className="object-contain h-8 w-auto"
                priority
              />
            </Link>
            <button
              type="button"
              aria-label="Luk menu"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center h-9 w-9 rounded-xl hover:bg-[#f0fdf9] text-gray-500 hover:text-[#0d9488] transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Nav links */}
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <ul className="space-y-1">
              {MARKETING_NAV.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between px-4 py-3 rounded-xl text-[15px] font-medium text-gray-700 hover:text-[#0d9488] hover:bg-[#f0fdf9] transition-all duration-150"
                  >
                    {link.label}
                    <ArrowRight className="h-4 w-4 text-gray-300" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* CTA */}
          <div className="px-5 py-5 border-t border-[#e2e8e6]/60">
            <Button asChild className="w-full h-11 text-[15px]">
              <Link href="/" onClick={() => setOpen(false)}>
                Prøv gratis i 60 dage
              </Link>
            </Button>
            <p className="text-center text-[11px] text-gray-400 mt-3">
              Ingen kreditkort · {SITE.company}
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
