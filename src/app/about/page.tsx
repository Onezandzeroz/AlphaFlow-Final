import type { Metadata } from "next";
import Image from "next/image";
import { Building2, MapPin, Mail, Phone, Target } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CTAButton } from "@/components/marketing/cta-button";
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
      {/* ═══════════════════════════════════════════════════════════════
          HERO — full-width dark gradient with banner-5
          ═══════════════════════════════════════════════════════════════ */}
      <section className="relative w-full overflow-hidden bg-gradient-to-br from-[#042f2e] via-[#0c4a6e] to-[#115e59]">
        <div className="absolute inset-0">
          <Image
            src="/banner-5.png"
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
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 sm:pt-28 lg:pt-32 pb-20 sm:pb-24 text-center">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-[12px] font-medium text-teal-100 mb-6">
            <Building2 className="h-3.5 w-3.5 text-teal-300" />
            {COMPANY_FACTS.name}
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-[1.12] max-w-4xl mx-auto">
            Vi gør dansk bogføring{" "}
            <span className="bg-gradient-to-r from-teal-300 via-teal-200 to-sky-300 bg-clip-text text-transparent">
              intelligent og tilgængelig
            </span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-teal-50/90 leading-relaxed max-w-2xl mx-auto">
            AlphaFlow er udviklet af {COMPANY_FACTS.name} — et dansk
            tech-selskab baseret i Aarhus. Vores mission er at give små og
            mellemstore virksomheder et regnskabsprogram, der er bygget til
            dansk bogføringslov fra bunden, uden at koste en formue.
          </p>
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
          MISSION — light section
          ═══════════════════════════════════════════════════════════════ */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="rounded-3xl bg-white border border-[#e2e8e6]/80 shadow-sm p-7 sm:p-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-br from-[#134e4a] to-[#0d9488] shadow-lg">
              <Target className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
              Vores mission
            </h2>
          </div>
          <div className="space-y-5 text-[15px] sm:text-[16px] text-gray-600 leading-relaxed">
            <p>
              For mange danske småvirksomheder er bogføring en byrde —
              komplekse regler, dyre konsulenter og software der enten er
              for simpelt eller for kompliceret. Vi så et behov for et
              regnskabsprogram, der tager dansk compliance alvorligt uden
              at kræve en kandidat i regnskab for at bruge det.
            </p>
            <p>
              AlphaFlow er bygget omkring tre principser:{" "}
              <strong className="text-gray-900">compliance først</strong> — vi
              implementerer bogføringslovens krav som fundament, ikke som
              eftertanke;{" "}
              <strong className="text-gray-900">automatisering</strong> — vi
              bruger AI og OCR til at fjerne manuelt arbejde; og{" "}
              <strong className="text-gray-900">fair priser</strong> —
              regnskabssoftware behøver ikke at koste tusindvis af kroner om
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

      {/* ═══════════════════════════════════════════════════════════════
          VALUES — 6 cards
          ═══════════════════════════════════════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="text-center mb-10 sm:mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
            Vores værdier
          </h2>
          <p className="mt-4 text-[15px] text-gray-500 max-w-xl mx-auto">
            Det der driver os hver dag, når vi bygger AlphaFlow
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {COMPANY_VALUES.map((value) => {
            const Icon = value.icon;
            return (
              <div
                key={value.title}
                className="group relative rounded-3xl bg-white border border-[#e2e8e6]/80 shadow-sm p-7 hover:shadow-xl hover:border-[#0d9488]/30 transition-all duration-300 overflow-hidden"
              >
                <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-gradient-to-br from-[#0d9488]/5 to-[#0c4a6e]/5 blur-2xl group-hover:from-[#0d9488]/10 group-hover:to-[#0c4a6e]/10 transition-all duration-300" />
                <div className="relative">
                  <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-[#134e4a] to-[#0d9488] mb-5 shadow-lg">
                    <Icon className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-[17px] font-bold text-gray-900 mb-2">
                    {value.title}
                  </h3>
                  <p className="text-[14px] text-gray-600 leading-relaxed">
                    {value.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          TIMELINE — dark section
          ═══════════════════════════════════════════════════════════════ */}
      <section className="w-full bg-gradient-to-br from-[#042f2e] via-[#0c4a6e] to-[#115e59] py-16 sm:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              Vores rejse
            </h2>
            <p className="mt-3 text-[14px] text-teal-100/70">
              Fra idé til platform
            </p>
          </div>
          <div className="relative">
            <div className="absolute left-4 sm:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-teal-300/50 via-teal-300/30 to-transparent sm:-translate-x-1/2" />
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
                    <div className="absolute left-4 sm:left-1/2 -translate-x-1/2 z-10 flex items-center justify-center h-8 w-8 rounded-full bg-white border-2 border-teal-400 shadow-lg">
                      <div className="h-2.5 w-2.5 rounded-full bg-teal-500" />
                    </div>
                    <div
                      className={`ml-12 sm:ml-0 sm:w-1/2 ${
                        isLeft ? "sm:pr-12 sm:text-right" : "sm:pl-12"
                      }`}
                    >
                      <div className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 p-5 sm:p-6">
                        <span className="inline-block px-2.5 py-0.5 rounded-md bg-teal-400/20 border border-teal-300/30 text-[11px] font-semibold text-teal-200 mb-2">
                          {item.year}
                        </span>
                        <h3 className="text-[16px] font-semibold text-white mb-1.5">
                          {item.title}
                        </h3>
                        <p className="text-[13px] text-teal-100/80 leading-relaxed">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          COMPANY INFO — light section
          ═══════════════════════════════════════════════════════════════ */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="rounded-3xl bg-white border border-[#e2e8e6]/80 shadow-sm p-7 sm:p-10">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">
            Virksomhedsoplysninger
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center h-11 w-11 rounded-2xl bg-gradient-to-br from-[#134e4a] to-[#0d9488] shadow-lg flex-shrink-0">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">
                  Selskab
                </p>
                <p className="text-[15px] font-semibold text-gray-900">
                  {COMPANY_FACTS.name}
                </p>
                <p className="text-[13px] text-gray-500">
                  Ejet af {COMPANY_FACTS.parent}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center h-11 w-11 rounded-2xl bg-gradient-to-br from-[#134e4a] to-[#0d9488] shadow-lg flex-shrink-0">
                <MapPin className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">
                  Adresse
                </p>
                <p className="text-[15px] font-semibold text-gray-900">
                  {COMPANY_FACTS.address}
                </p>
                <p className="text-[13px] text-gray-500">
                  CVR: {COMPANY_FACTS.cvr}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center h-11 w-11 rounded-2xl bg-gradient-to-br from-[#134e4a] to-[#0d9488] shadow-lg flex-shrink-0">
                <Mail className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">
                  E-mail
                </p>
                <a
                  href={`mailto:${COMPANY_FACTS.email}`}
                  className="text-[15px] font-semibold text-gray-900 hover:text-[#0d9488] transition-colors"
                >
                  {COMPANY_FACTS.email}
                </a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center h-11 w-11 rounded-2xl bg-gradient-to-br from-[#134e4a] to-[#0d9488] shadow-lg flex-shrink-0">
                <Phone className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">
                  Telefon
                </p>
                <a
                  href={`tel:${COMPANY_FACTS.phone.replace(/\s/g, "")}`}
                  className="text-[15px] font-semibold text-gray-900 hover:text-[#0d9488] transition-colors"
                >
                  {COMPANY_FACTS.phone}
                </a>
                <p className="text-[13px] text-gray-500">
                  {COMPANY_FACTS.openingHours}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          FINAL CTA
          ═══════════════════════════════════════════════════════════════ */}
      <section className="w-full bg-gradient-to-br from-[#042f2e] via-[#0d9488] to-[#0c4a6e] py-16 sm:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
            Prøv AlphaFlow gratis
          </h2>
          <p className="mt-5 text-[16px] sm:text-[17px] text-teal-50/90 max-w-xl mx-auto leading-relaxed">
            Opret en gratis konto og kom i gang på 5 minutter. Gratis så
            længe din omsætning er under 50.000 kr. — ingen kreditkort.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <CTAButton href="/login" variant="primary-light" showArrow register>
              Start gratis
            </CTAButton>
            <CTAButton href="/contact" variant="outline-light">
              Skriv til os
            </CTAButton>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
