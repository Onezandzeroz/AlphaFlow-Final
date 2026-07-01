import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import {
  FEATURE_CATEGORIES,
  MARKETING_STATS,
  TRUST_BADGES,
} from "@/lib/marketing-data";
import { SITE, META } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Funktioner — Regnskabsprogram med moms, e-faktura & OCR",
  description:
    "Se alle funktioner i AlphaFlow: dobbelt bogføring, automatisk momsafregning med 10 momskoder, Peppol e-fakturering, OCR bilagsscanning, SAF-T eksport, Hermes AI og mere. Bygget til danske virksomheder.",
  alternates: { canonical: "/features" },
  openGraph: {
    title: "Funktioner — AlphaFlow Regnskabsprogram",
    description:
      "Dobbelt bogføring, moms, Peppol e-faktura, OCR scanning, SAF-T & Hermes AI. Bygget til danske virksomheder.",
    url: "/features",
  },
};

export default function FeaturesPage() {
  return (
    <MarketingShell>
      {/* ─── Hero ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16 lg:pt-20 pb-8">
        <div className="text-center max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f0fdf9] border border-[#ccfbef] text-[12px] font-medium text-[#0d9488] mb-5">
            <Sparkles className="h-3.5 w-3.5" />
            Komplet regnskabsplatform
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 tracking-tight leading-[1.1]">
            Alt du behøver for at{" "}
            <span className="bg-gradient-to-r from-[#0d9488] to-[#2dd4bf] bg-clip-text text-transparent">
              bogføre i Danmark
            </span>
          </h1>
          <p className="mt-5 text-base sm:text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto">
            {SITE.tagline}
          </p>
          <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg" className="h-11 px-6 text-[15px]">
              <Link href="/login">
                Prøv gratis i 60 dage
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-11 px-6 text-[15px] border-[#0d9488]/30 text-[#0d9488] hover:bg-[#f0fdf9] hover:text-[#0f766e]"
            >
              <Link href="/pricing">Se priser</Link>
            </Button>
          </div>
          <p className="mt-3 text-[12px] text-gray-400">
            Ingen kreditkort · Ingen binding · Opsætning på 5 minutter
          </p>
        </div>
      </section>

      {/* ─── Stats bar ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {MARKETING_STATS.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl bg-white/80 backdrop-blur-sm border border-[#e2e8e6]/80 shadow-sm p-5 sm:p-6 text-center"
            >
              <div className="text-2xl sm:text-3xl font-bold text-[#0d9488]">
                {stat.value}
              </div>
              <div className="mt-1 text-[12px] sm:text-[13px] text-gray-500 leading-snug">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Feature categories ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="space-y-12 sm:space-y-16">
          {FEATURE_CATEGORIES.map((category, index) => {
            const Icon = category.icon;
            const isReversed = index % 2 === 1;
            return (
              <div key={category.id} id={category.id} className="scroll-mt-20">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-start">
                  {/* Header column */}
                  <div
                    className={`lg:col-span-4 ${isReversed ? "lg:order-2" : ""}`}
                  >
                    <div className="lg:sticky lg:top-24">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex items-center justify-center h-11 w-11 rounded-2xl bg-gradient-to-br from-[#0d9488]/10 to-[#2dd4bf]/5 border border-[#0d9488]/10">
                          <Icon className="h-5 w-5 text-[#0d9488]" />
                        </div>
                        <span className="text-[12px] font-medium text-[#0d9488] uppercase tracking-wider">
                          {category.subtitle}
                        </span>
                      </div>
                      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight leading-tight">
                        {category.title}
                      </h2>
                    </div>
                  </div>

                  {/* Features grid */}
                  <div
                    className={`lg:col-span-8 ${isReversed ? "lg:order-1" : ""}`}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      {category.features.map((feature) => (
                        <div
                          key={feature.title}
                          className="rounded-2xl bg-white/80 backdrop-blur-sm border border-[#e2e8e6]/80 shadow-sm p-5 sm:p-6 hover:shadow-md hover:border-[#0d9488]/20 transition-all duration-200"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-[#f0fdf9] border border-[#ccfbef] flex-shrink-0 mt-0.5">
                              <Check className="h-4 w-4 text-[#0d9488]" />
                            </div>
                            <div>
                              <h3 className="text-[15px] font-semibold text-gray-900 leading-snug">
                                {feature.title}
                              </h3>
                              <p className="mt-1.5 text-[13px] text-gray-600 leading-relaxed">
                                {feature.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── Trust badges ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="rounded-3xl bg-gradient-to-br from-[#0d9488]/[0.06] to-[#2dd4bf]/[0.03] border border-[#0d9488]/10 p-6 sm:p-10">
          <h2 className="text-center text-lg sm:text-xl font-bold text-gray-900 mb-1">
            Bygget til dansk compliance
          </h2>
          <p className="text-center text-[13px] sm:text-[14px] text-gray-500 mb-8">
            AlphaFlow opfylder bogføringsloven og understøtter alle danske
            standarder
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TRUST_BADGES.map((badge) => {
              const Icon = badge.icon;
              return (
                <div
                  key={badge.title}
                  className="rounded-2xl bg-white/70 backdrop-blur-sm border border-[#e2e8e6]/80 p-5 text-center"
                >
                  <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[#f0fdf9] border border-[#ccfbef] mx-auto mb-3">
                    <Icon className="h-5 w-5 text-[#0d9488]" />
                  </div>
                  <h3 className="text-[14px] font-semibold text-gray-900 mb-1">
                    {badge.title}
                  </h3>
                  <p className="text-[12px] text-gray-500 leading-snug">
                    {badge.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 pb-16 sm:pb-20">
        <div className="rounded-3xl bg-gradient-to-br from-[#0d9488] to-[#14b8a6] p-8 sm:p-12 text-center shadow-lg">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Klar til at komme i gang?
          </h2>
          <p className="mt-3 text-[15px] text-[#ccfbef] max-w-xl mx-auto">
            Start din 60-dages gratis prøveperiode i dag. Ingen kreditkort,
            ingen binding — fuld adgang til alle funktioner.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="h-11 px-7 text-[15px] bg-white text-[#0d9488] hover:bg-white/90 hover:text-[#0f766e]"
            >
              <Link href="/login">
                Opret gratis konto
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-11 px-7 text-[15px] border-white/40 text-white hover:bg-white/10 hover:text-white hover:border-white/60"
            >
              <Link href="/contact">Kontakt os</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
