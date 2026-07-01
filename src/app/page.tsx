import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Check,
  ShieldCheck,
  Clock,
  Star,
  Zap,
  FileText,
  TrendingUp,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CTAButton } from "@/components/marketing/cta-button";
import {
  FEATURE_CATEGORIES,
  MARKETING_STATS,
  PRICING_PLANS,
  TRUST_BADGES,
} from "@/lib/marketing-data";
import { SITE, META, FAQ_DA } from "@/lib/seo";

export const metadata: Metadata = {
  title: SITE.name + " — Intelligent regnskabsprogram for danske virksomheder",
  description: META.description,
  alternates: { canonical: "/" },
  openGraph: {
    title: SITE.name + " — Intelligent regnskabsprogram",
    description: META.ogDescription,
    url: "/",
  },
};

export default function LandingPage() {
  const teaserPlans = PRICING_PLANS.filter((p) =>
    ["free", "annual", "2year"].includes(p.id)
  );
  const teaserFaqs = FAQ_DA.slice(0, 3);

  return (
    <MarketingShell>
      {/* ═══════════════════════════════════════════════════════════════
          HERO — full-width dark gradient with banner image overlay
          ═══════════════════════════════════════════════════════════════ */}
      <section className="relative w-full overflow-hidden bg-gradient-to-br from-[#042f2e] via-[#0c4a6e] to-[#115e59]">
        {/* Banner image as background */}
        <div className="absolute inset-0">
          <Image
            src="/banner-1.png"
            alt=""
            fill
            priority
            className="object-cover opacity-30"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[#042f2e]/80 via-[#0c4a6e]/70 to-[#115e59]/80" />
        </div>

        {/* Decorative grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* Content */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 sm:pt-28 lg:pt-36 pb-20 sm:pb-28 lg:pb-36">
          <div className="max-w-3xl">
            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold text-white tracking-tight leading-[1.05]">
              Intelligent bogføring{" "}
              <span className="bg-gradient-to-r from-teal-300 via-teal-200 to-sky-300 bg-clip-text text-transparent">
                for danske virksomheder
              </span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-teal-50/90 leading-relaxed max-w-2xl">
              {SITE.tagline}
            </p>
            <div className="mt-9 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <CTAButton href="/login" variant="primary-light" showArrow>
                Kom gratis i gang
              </CTAButton>
              <CTAButton href="/features" variant="outline-light">
                Se alle funktioner
              </CTAButton>
            </div>
            <p className="mt-5 text-[13px] text-teal-100/70">
              Ingen kreditkort · Ingen binding · Opsætning på 5 minutter
            </p>
          </div>
        </div>

        {/* Wave divider transitioning to light section */}
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
          STATS BAR — full-width with dark teal/blue gradient
          ═══════════════════════════════════════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-4 sm:-mt-6 relative z-10">
        <div className="rounded-3xl bg-gradient-to-br from-[#134e4a] via-[#0d9488] to-[#0c4a6e] shadow-2xl p-6 sm:p-8 lg:p-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
            {MARKETING_STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
                  {stat.value}
                </div>
                <div className="mt-2 text-[12px] sm:text-[13px] text-teal-100/80 leading-snug">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          UI PREVIEW — full-width screenshot with floating effect
          ═══════════════════════════════════════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 pb-8">
        <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-12">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f0fdf9] border border-[#ccfbef] text-[12px] font-medium text-[#0d9488] mb-4">
            <Zap className="h-3.5 w-3.5" />
            Se platformen
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
            Hermes AI — din danske regnskabsassistent
          </h2>
          <p className="mt-4 text-[15px] sm:text-[16px] text-gray-600 leading-relaxed">
            Spørg Hermes om din likviditet, momsbalance eller bogføringsregler.
            Få svar på dansk baseret på dine egne data.
          </p>
        </div>

        {/* Screenshot with gradient glow behind */}
        <div className="relative">
          <div className="absolute -inset-4 bg-gradient-to-r from-[#0d9488]/20 via-[#2dd4bf]/20 to-[#0c4a6e]/20 rounded-3xl blur-2xl opacity-60" />
          <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-[#e2e8e6]/60 bg-white">
            <Image
              src="/ui-screenshot.jpg"
              alt="Screenshot af AlphaFlow med Hermes AI-assistenten — regnskabsplatformen der viser dashboard og chat"
              width={1870}
              height={958}
              className="w-full h-auto"
              sizes="(max-width: 1280px) 100vw, 1280px"
              priority
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          FEATURE HIGHLIGHTS — 3 cards with icon
          ═══════════════════════════════════════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="text-center mb-10 sm:mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
            Alt samlet i ét system
          </h2>
          <p className="mt-4 text-[15px] text-gray-500 max-w-xl mx-auto">
            Fra daglig bogføring til årsafslutning — bygget til dansk
            bogføringslov og danske momskoder
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {FEATURE_CATEGORIES.slice(0, 3).map((category) => {
            const Icon = category.icon;
            return (
              <Link
                key={category.id}
                href="/features"
                className="group relative rounded-3xl bg-white border border-[#e2e8e6]/80 shadow-sm p-7 sm:p-8 hover:shadow-xl hover:border-[#0d9488]/30 transition-all duration-300 overflow-hidden"
              >
                {/* Subtle gradient corner */}
                <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-gradient-to-br from-[#0d9488]/5 to-[#0c4a6e]/5 blur-2xl group-hover:from-[#0d9488]/10 group-hover:to-[#0c4a6e]/10 transition-all duration-300" />
                <div className="relative">
                  <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-[#134e4a] to-[#0d9488] mb-5 shadow-lg">
                    <Icon className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    {category.title}
                  </h3>
                  <p className="text-[14px] text-gray-500 leading-relaxed mb-5">
                    {category.subtitle}
                  </p>
                  <ul className="space-y-2.5 mb-6">
                    {category.features.slice(0, 3).map((f) => (
                      <li
                        key={f.title}
                        className="flex items-start gap-2.5 text-[14px] text-gray-700"
                      >
                        <Check className="h-4 w-4 text-[#0d9488] flex-shrink-0 mt-0.5" />
                        <span className="leading-snug">{f.title}</span>
                      </li>
                    ))}
                  </ul>
                  <span className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#0d9488] group-hover:gap-2 transition-all">
                    Se alle funktioner
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          BANNER IMAGE SECTION — full-width with overlay text
          ═══════════════════════════════════════════════════════════════ */}
      <section className="relative w-full overflow-hidden">
        <div className="relative h-[400px] sm:h-[500px] lg:h-[560px]">
          <Image
            src="/banner-2.png"
            alt="AlphaFlow regnskabsplatform — visuel banner"
            fill
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#042f2e]/85 via-[#0c4a6e]/70 to-transparent" />
          <div className="absolute inset-0 flex items-center">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
              <div className="max-w-xl">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-[12px] font-medium text-teal-100 mb-5">
                  <Globe className="h-3.5 w-3.5 text-teal-300" />
                  Peppol e-fakturering
                </span>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight leading-tight">
                  Send e-fakturaer via Peppol-netværket
                </h2>
                <p className="mt-5 text-[15px] sm:text-[17px] text-teal-50/90 leading-relaxed">
                  OIOUBL BIS Billing 3.0 understøttelse. Send og modtag
                  e-fakturaer direkte i systemet med automatisk
                  afsendelsesstatus via Storecove adgangspunkt.
                </p>
                <CTAButton href="/features" variant="primary-light" showArrow className="mt-7 px-7">
                  Læs mere
                </CTAButton>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          PRICING TEASER — 3 plans
          ═══════════════════════════════════════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="text-center mb-10 sm:mb-14">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f0fdf9] border border-[#ccfbef] text-[12px] font-medium text-[#0d9488] mb-4">
            <FileText className="h-3.5 w-3.5" />
            Gennemsigtige priser
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
            Simple, fair priser
          </h2>
          <p className="mt-4 text-[15px] text-gray-500 max-w-xl mx-auto">
            Start gratis, opgrader når du er klar. Ingen skjulte gebyrer.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {teaserPlans.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-3xl border p-7 sm:p-8 flex flex-col ${
                plan.highlighted
                  ? "bg-gradient-to-br from-[#134e4a] to-[#0c4a6e] border-transparent shadow-2xl md:scale-[1.05]"
                  : "bg-white border-[#e2e8e6]/80 shadow-sm"
              }`}
            >
              {plan.highlighted && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-teal-400 to-sky-400 text-[#042f2e] text-[11px] font-bold shadow-lg">
                  <Star className="h-3 w-3 fill-[#042f2e]" />
                  Mest populær
                </span>
              )}
              <h3
                className={`text-xl font-bold mb-1 ${
                  plan.highlighted ? "text-white" : "text-gray-900"
                }`}
              >
                {plan.name}
              </h3>
              <p
                className={`text-[13px] mb-5 min-h-[2.5em] ${
                  plan.highlighted ? "text-teal-100/80" : "text-gray-500"
                }`}
              >
                {plan.description}
              </p>
              <div className="mb-5">
                <span
                  className={`text-4xl font-bold ${
                    plan.highlighted ? "text-white" : "text-gray-900"
                  }`}
                >
                  {plan.priceMonthly}
                </span>
                {!plan.isFree && (
                  <span
                    className={`text-[14px] ${
                      plan.highlighted ? "text-teal-100/70" : "text-gray-500"
                    }`}
                  >
                    /md.
                  </span>
                )}
              </div>
              <ul className="space-y-2.5 mb-6 flex-1">
                {plan.features.slice(0, 4).map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check
                      className={`h-4 w-4 flex-shrink-0 mt-0.5 ${
                        plan.highlighted ? "text-teal-300" : "text-[#0d9488]"
                      }`}
                    />
                    <span
                      className={`text-[13px] ${
                        plan.highlighted ? "text-teal-50/90" : "text-gray-600"
                      }`}
                    >
                      {f}
                    </span>
                  </li>
                ))}
              </ul>
              {plan.highlighted ? (
                <CTAButton
                  href="/login"
                  variant="primary-light"
                  className="w-full h-11 px-4 text-[14px] shadow-lg"
                >
                  {plan.cta}
                </CTAButton>
              ) : (
                <Button
                  asChild
                  variant="outline"
                  className="w-full h-11 text-[14px] rounded-md"
                >
                  <Link href="/login">{plan.cta}</Link>
                </Button>
              )}
            </div>
          ))}
        </div>
        <div className="text-center mt-8">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-[#0d9488] hover:text-[#0f766e] transition-colors"
          >
            Se alle 5 planer
            <ArrowRight className="h-4 w-4" />
          </Link>
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
          FAQ TEASER — 3 questions
          ═══════════════════════════════════════════════════════════════ */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
            Ofte stillede spørgsmål
          </h2>
        </div>
        <div className="space-y-4">
          {teaserFaqs.map((faq, i) => (
            <div
              key={i}
              className="rounded-2xl bg-white border border-[#e2e8e6]/80 shadow-sm p-6 hover:shadow-md transition-shadow"
            >
              <h3 className="text-[16px] font-semibold text-gray-900 mb-2.5">
                {faq.question}
              </h3>
              <p className="text-[14px] text-gray-600 leading-relaxed">
                {faq.answer}
              </p>
            </div>
          ))}
        </div>
        <div className="text-center mt-8">
          <Link
            href="/faq"
            className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-[#0d9488] hover:text-[#0f766e] transition-colors"
          >
            Se alle 12 spørgsmål
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          FINAL CTA — full-width dark gradient
          ═══════════════════════════════════════════════════════════════ */}
      <section className="w-full bg-gradient-to-br from-[#042f2e] via-[#0d9488] to-[#0c4a6e] py-16 sm:py-24 lg:py-28">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
            Klar til at komme i gang?
          </h2>
          <p className="mt-5 text-[16px] sm:text-[17px] text-teal-50/90 max-w-xl mx-auto leading-relaxed">
            Start din 60-dages gratis prøveperiode i dag. Ingen kreditkort,
            ingen binding — fuld adgang til alle funktioner.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <CTAButton href="/login" variant="primary-light" showArrow>
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
              <Clock className="h-4 w-4 text-teal-300" />
              Opsætning på 5 min
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-teal-300" />
              Dansk support
            </span>
            <span className="inline-flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-teal-300" />
              Ingen binding
            </span>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
