import type { Metadata } from "next";
import Image from "next/image";
import { Check, Sparkles, ShieldCheck } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CTAButton } from "@/components/marketing/cta-button";
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
      {/* ═══════════════════════════════════════════════════════════════
          HERO — full-width dark gradient with banner-3
          ═══════════════════════════════════════════════════════════════ */}
      <section className="relative w-full overflow-hidden bg-gradient-to-br from-[#042f2e] via-[#0c4a6e] to-[#115e59]">
        <div className="absolute inset-0">
          <Image
            src="/banner-3.png"
            alt=""
            fill
            priority
            className="object-cover opacity-30"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[#042f2e]/80 via-[#0c4a6e]/70 to-[#115e59]/80" />
        </div>
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 sm:pt-28 lg:pt-32 pb-20 sm:pb-24">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-[12px] font-medium text-teal-100 mb-6">
              <Sparkles className="h-3.5 w-3.5 text-teal-300" />
              Komplet regnskabsplatform
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-[1.08]">
              Alt du behøver for at{" "}
              <span className="bg-gradient-to-r from-teal-300 via-teal-200 to-sky-300 bg-clip-text text-transparent">
                bogføre i Danmark
              </span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-teal-50/90 leading-relaxed max-w-2xl">
              {SITE.tagline}
            </p>
            <div className="mt-9 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <CTAButton href="/login" variant="primary-light" showArrow register>
                Prøv gratis
              </CTAButton>
              <CTAButton href="/pricing" variant="outline-light">
                Se priser
              </CTAButton>
            </div>
            <p className="mt-5 text-[13px] text-teal-100/70">
              Ingen kreditkort · Ingen binding · Opsætning på 5 minutter
            </p>
          </div>
        </div>
        <div className="relative">
          <svg
            className="block w-full h-[60px] sm:h-[80px]"
            viewBox="0 0 1440 80"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M0,40 C360,80 1080,0 1440,40 L1440,80 L0,80 Z"
              fill="#f8faf9"
            />
          </svg>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          STATS BAR — dark gradient floating card
          ═══════════════════════════════════════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-4 sm:-mt-6 relative z-10">
        <div className="rounded-3xl bg-gradient-to-br from-[#134e4a] via-[#0d9488] to-[#0c4a6e] shadow-2xl p-6 sm:p-8 lg:p-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
            {MARKETING_STATS.map((stat) => {
              const Icon = stat.icon;
              return (
              <div key={stat.label} className="text-center">
                <div className="flex items-center justify-center gap-2">
                  {Icon && <Icon className="h-7 w-7 sm:h-8 sm:w-8 text-teal-300" />}
                  <span className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
                    {stat.value}
                  </span>
                </div>
                <div className="mt-2 text-[12px] sm:text-[13px] text-teal-100/80 leading-snug">
                  {stat.label}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          FEATURE CATEGORIES — alternating dark/light sections
          ═══════════════════════════════════════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="space-y-16 sm:space-y-24">
          {FEATURE_CATEGORIES.map((category, index) => {
            const Icon = category.icon;
            const isDark = index % 2 === 1;
            return (
              <div key={category.id} id={category.id} className="scroll-mt-24">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-start">
                  {/* Header column */}
                  <div className="lg:col-span-4">
                    <div className="lg:sticky lg:top-24">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-br from-[#134e4a] to-[#0d9488] shadow-lg">
                          <Icon className="h-6 w-6 text-white" />
                        </div>
                        <span className="text-[12px] font-semibold text-[#0d9488] uppercase tracking-wider">
                          {category.subtitle}
                        </span>
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight leading-tight">
                        {category.title}
                      </h2>
                    </div>
                  </div>

                  {/* Features grid */}
                  <div className="lg:col-span-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {category.features.map((feature) => (
                        <div
                          key={feature.title}
                          className="group rounded-2xl bg-white border border-[#e2e8e6]/80 shadow-sm p-5 sm:p-6 hover:shadow-lg hover:border-[#0d9488]/30 transition-all duration-300"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-[#f0fdf9] to-[#ccfbef] border border-[#ccfbef] flex-shrink-0 mt-0.5">
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

      {/* ═══════════════════════════════════════════════════════════════
          TRUST BADGES — full-width dark section
          ═══════════════════════════════════════════════════════════════ */}
      <section className="w-full bg-gradient-to-br from-[#042f2e] via-[#0c4a6e] to-[#115e59] py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Bygget til dansk compliance
            </h2>
            <p className="mt-3 text-[14px] text-teal-100/70 max-w-xl mx-auto">
              AlphaFlow opfylder bogføringsloven og understøtter alle danske
              standarder
            </p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {TRUST_BADGES.map((badge) => {
              const Icon = badge.icon;
              return (
                <div
                  key={badge.title}
                  className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 p-6 text-center"
                >
                  <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-white/10 border border-white/20 mx-auto mb-4">
                    <Icon className="h-6 w-6 text-teal-300" />
                  </div>
                  <h3 className="text-[15px] font-semibold text-white mb-1.5">
                    {badge.title}
                  </h3>
                  <p className="text-[12px] text-teal-100/70 leading-snug">
                    {badge.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          FINAL CTA — full-width dark gradient
          ═══════════════════════════════════════════════════════════════ */}
      <section className="w-full bg-gradient-to-br from-[#042f2e] via-[#0d9488] to-[#0c4a6e] py-16 sm:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
            Klar til at komme i gang?
          </h2>
          <p className="mt-5 text-[16px] sm:text-[17px] text-teal-50/90 max-w-xl mx-auto leading-relaxed">
            Start gratis i dag — fuld adgang så længe din omsætning er
            under 50.000 kr. Ingen kreditkort, ingen binding.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <CTAButton href="/login" variant="primary-light" showArrow register>
              Opret gratis konto
            </CTAButton>
            <CTAButton href="/contact" variant="outline-light">
              Kontakt os
            </CTAButton>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-teal-100/80">
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-4 w-4 text-teal-300" />
              Ingen kreditkort
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-teal-300" />
              Bogføringslov compliant
            </span>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
