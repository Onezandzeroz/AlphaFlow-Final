import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPin, Building2, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import {
  COMPANY_FACTS,
  COMPANY_TIMELINE,
  COMPANY_VALUES,
  MARKETING_STATS,
} from "@/lib/marketing-data";
import { SITE } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Om os — AlphaAi Consult ApS",
  description:
    "AlphaFlow udvikles af AlphaAi Consult ApS i Aarhus. Læs om vores mission: at gøre dansk bogføring intelligent, tilgængeligt og compliance-sikret for små og mellemstore virksomheder.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "Om os — AlphaAi Consult ApS",
    description:
      "AlphaFlow udvikles af AlphaAi Consult ApS i Aarhus. Mission: intelligent, tilgængelig og compliance-sikret bogføring for danske SMV'er.",
    url: "/about",
  },
};

export default function AboutPage() {
  return (
    <MarketingShell>
      {/* ─── Hero ─── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16 lg:pt-20 pb-8">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f0fdf9] border border-[#ccfbef] text-[12px] font-medium text-[#0d9488] mb-5">
            <Building2 className="h-3.5 w-3.5" />
            {COMPANY_FACTS.name}
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 tracking-tight leading-[1.15]">
            Vi gør dansk bogføring{" "}
            <span className="bg-gradient-to-r from-[#0d9488] to-[#2dd4bf] bg-clip-text text-transparent">
              intelligent og tilgængelig
            </span>
          </h1>
          <p className="mt-5 text-base sm:text-lg text-gray-600 leading-relaxed">
            AlphaFlow er udviklet af {COMPANY_FACTS.name} — et dansk
            tech-selskab baseret i Aarhus. Vores mission er at give små og
            mellemstore virksomheder et regnskabsprogram, der er bygget til
            dansk bogføringslov fra bunden, uden at koste en formue.
          </p>
        </div>
      </section>

      {/* ─── Stats ─── */}
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

      {/* ─── Mission ─── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="rounded-3xl bg-white/80 backdrop-blur-sm border border-[#e2e8e6]/80 shadow-sm p-6 sm:p-10">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">
            Vores mission
          </h2>
          <div className="space-y-4 text-[15px] text-gray-600 leading-relaxed">
            <p>
              For mange danske småvirksomheder er bogføring en byrde —
              komplekse regler, dyre konsulenter og software der enten er
              for simpelt eller for kompliceret. Vi så et behov for et
              regnskabsprogram, der tager dansk compliance alvorligt uden
              at kræve en kandidat i regnskab for at bruge det.
            </p>
            <p>
              AlphaFlow er bygget omkring tre principper:{" "}
              <strong className="text-gray-900">compliance først</strong> — vi
              implementerer bogføringslovens krav som fundament, ikke som
              eftertanke;{" "}
              <strong className="text-gray-900">automatisering</strong> — vi
              bruger AI og OCR til at fjerne manuelt arbejde; og{" "}
              <strong className="text-gray-900">fair priser</strong> —
              regnskabssoftware behøver ikke koste tusindvis af kroner om
              måneden.
            </p>
            <p>
              Vi er stolt danskudviklede: dansk kontoplan, danske momskoder,
              Peppol e-fakturering, SAF-T eksport og support på dansk. Alt
              bygget i Danmark, for danske virksomheder.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Values ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="text-center mb-8 sm:mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Vores værdier
          </h2>
          <p className="mt-3 text-[14px] text-gray-500 max-w-xl mx-auto">
            Det der driver os hver dag, når vi bygger AlphaFlow
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {COMPANY_VALUES.map((value) => {
            const Icon = value.icon;
            return (
              <div
                key={value.title}
                className="rounded-2xl bg-white/80 backdrop-blur-sm border border-[#e2e8e6]/80 shadow-sm p-6 hover:shadow-md hover:border-[#0d9488]/20 transition-all duration-200"
              >
                <div className="flex items-center justify-center h-11 w-11 rounded-2xl bg-gradient-to-br from-[#0d9488]/10 to-[#2dd4bf]/5 border border-[#0d9488]/10 mb-4">
                  <Icon className="h-5 w-5 text-[#0d9488]" />
                </div>
                <h3 className="text-[16px] font-semibold text-gray-900 mb-2">
                  {value.title}
                </h3>
                <p className="text-[13px] text-gray-600 leading-relaxed">
                  {value.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── Timeline ─── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="text-center mb-8 sm:mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Vores rejse
          </h2>
          <p className="mt-3 text-[14px] text-gray-500">
            Fra idé til platform
          </p>
        </div>
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-4 sm:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-[#0d9488]/30 via-[#0d9488]/20 to-transparent sm:-translate-x-1/2" />

          <div className="space-y-8">
            {COMPANY_TIMELINE.map((item, index) => {
              const isLeft = index % 2 === 0;
              return (
                <div
                  key={index}
                  className={`relative flex items-start gap-4 sm:gap-0 ${
                    isLeft ? "sm:flex-row" : "sm:flex-row-reverse"
                  }`}
                >
                  {/* Dot */}
                  <div className="absolute left-4 sm:left-1/2 -translate-x-1/2 z-10 flex items-center justify-center h-8 w-8 rounded-full bg-white border-2 border-[#0d9488] shadow-sm">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#0d9488]" />
                  </div>

                  {/* Content */}
                  <div
                    className={`ml-12 sm:ml-0 sm:w-1/2 ${
                      isLeft ? "sm:pr-12 sm:text-right" : "sm:pl-12"
                    }`}
                  >
                    <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-[#e2e8e6]/80 shadow-sm p-5 sm:p-6">
                      <span className="inline-block px-2.5 py-0.5 rounded-md bg-[#f0fdf9] border border-[#ccfbef] text-[11px] font-semibold text-[#0d9488] mb-2">
                        {item.year}
                      </span>
                      <h3 className="text-[15px] font-semibold text-gray-900 mb-1.5">
                        {item.title}
                      </h3>
                      <p className="text-[13px] text-gray-600 leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── Company info card ─── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-[#e2e8e6]/80 shadow-sm p-6 sm:p-8">
          <h2 className="text-lg font-bold text-gray-900 mb-5">
            Virksomhedsoplysninger
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-[#f0fdf9] border border-[#ccfbef] flex-shrink-0">
                <Building2 className="h-4 w-4 text-[#0d9488]" />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">
                  Selskab
                </p>
                <p className="text-[14px] font-medium text-gray-900">
                  {COMPANY_FACTS.name}
                </p>
                <p className="text-[12px] text-gray-500">
                  Ejet af {COMPANY_FACTS.parent}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-[#f0fdf9] border border-[#ccfbef] flex-shrink-0">
                <MapPin className="h-4 w-4 text-[#0d9488]" />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">
                  Adresse
                </p>
                <p className="text-[14px] font-medium text-gray-900">
                  {COMPANY_FACTS.address}
                </p>
                <p className="text-[12px] text-gray-500">
                  CVR: {COMPANY_FACTS.cvr}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-[#f0fdf9] border border-[#ccfbef] flex-shrink-0">
                <Mail className="h-4 w-4 text-[#0d9488]" />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">
                  E-mail
                </p>
                <a
                  href={`mailto:${COMPANY_FACTS.email}`}
                  className="text-[14px] font-medium text-gray-900 hover:text-[#0d9488] transition-colors"
                >
                  {COMPANY_FACTS.email}
                </a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-[#f0fdf9] border border-[#ccfbef] flex-shrink-0">
                <Phone className="h-4 w-4 text-[#0d9488]" />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">
                  Telefon
                </p>
                <a
                  href={`tel:${COMPANY_FACTS.phone.replace(/\s/g, "")}`}
                  className="text-[14px] font-medium text-gray-900 hover:text-[#0d9488] transition-colors"
                >
                  {COMPANY_FACTS.phone}
                </a>
                <p className="text-[12px] text-gray-500">
                  {COMPANY_FACTS.openingHours}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 pb-16 sm:pb-20">
        <div className="rounded-3xl bg-gradient-to-br from-[#0d9488] to-[#14b8a6] p-8 sm:p-12 text-center shadow-lg">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Prøv AlphaFlow gratis
          </h2>
          <p className="mt-3 text-[15px] text-[#ccfbef] max-w-xl mx-auto">
            Opret en gratis konto og kom i gang på 5 minutter. 60 dages
            fuld adgang — ingen kreditkort.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="h-11 px-7 text-[15px] bg-white text-[#0d9488] hover:bg-white/90 hover:text-[#0f766e]"
            >
              <Link href="/">
                Start gratis
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-11 px-7 text-[15px] border-white/40 text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/contact">Skriv til os</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
