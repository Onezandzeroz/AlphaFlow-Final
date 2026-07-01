import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ShieldCheck,
  Sparkles,
  BookOpen,
  Scale,
  ScanLine,
  Bot,
  BarChart3,
  Clock,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/marketing-shell";
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

// Curated highlights for the landing page hero section (top 6 features,
// one icon each — pulled from FEATURE_CATEGORIES).
const HERO_FEATURES = [
  { icon: BookOpen, label: "Dobbelt bogføring" },
  { icon: Scale, label: "Automatisk moms (10 koder)" },
  { icon: ScanLine, label: "OCR bilagsscanning" },
  { icon: BarChart3, label: "Finansielle rapporter" },
  { icon: Bot, label: "Hermes AI-assistent" },
  { icon: ShieldCheck, label: "Bogføringslov compliant" },
];

export default function LandingPage() {
  // Pick the 3 most relevant plans for the pricing teaser
  const teaserPlans = PRICING_PLANS.filter((p) =>
    ["free", "annual", "2year"].includes(p.id)
  );
  // Top 3 FAQ items for the landing page
  const teaserFaqs = FAQ_DA.slice(0, 3);

  return (
    <MarketingShell>
      {/* ─── Hero ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16 lg:pt-24 pb-10">
        <div className="text-center max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f0fdf9] border border-[#ccfbef] text-[12px] font-medium text-[#0d9488] mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            Dansk regnskabsprogram · 60 dages gratis prøveperiode
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 tracking-tight leading-[1.08]">
            Intelligent bogføring{" "}
            <span className="bg-gradient-to-r from-[#0d9488] to-[#2dd4bf] bg-clip-text text-transparent">
              for danske virksomheder
            </span>
          </h1>
          <p className="mt-6 text-base sm:text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto">
            {SITE.tagline}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-7 text-[15px]">
              <Link href="/login">
                Kom gratis i gang
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-12 px-7 text-[15px] border-[#0d9488]/30 text-[#0d9488] hover:bg-[#f0fdf9] hover:text-[#0f766e]"
            >
              <Link href="/features">Se alle funktioner</Link>
            </Button>
          </div>
          <p className="mt-4 text-[12px] text-gray-400">
            Ingen kreditkort · Ingen binding · Opsætning på 5 minutter
          </p>
        </div>

        {/* Hero feature pills */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-2.5 max-w-3xl mx-auto">
          {HERO_FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <span
                key={feature.label}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/80 backdrop-blur-sm border border-[#e2e8e6]/80 shadow-sm text-[13px] font-medium text-gray-700"
              >
                <Icon className="h-4 w-4 text-[#0d9488]" />
                {feature.label}
              </span>
            );
          })}
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

      {/* ─── Feature highlights (top 3 categories) ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="text-center mb-8 sm:mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Alt samlet i ét system
          </h2>
          <p className="mt-3 text-[14px] text-gray-500 max-w-xl mx-auto">
            Fra daglig bogføring til årsafslutning — bygget til dansk
            bogføringslov og danske momskoder
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          {FEATURE_CATEGORIES.slice(0, 3).map((category) => {
            const Icon = category.icon;
            return (
              <Link
                key={category.id}
                href="/features"
                className="group rounded-2xl bg-white/80 backdrop-blur-sm border border-[#e2e8e6]/80 shadow-sm p-6 hover:shadow-md hover:border-[#0d9488]/20 transition-all duration-200"
              >
                <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-br from-[#0d9488]/10 to-[#2dd4bf]/5 border border-[#0d9488]/10 mb-4">
                  <Icon className="h-6 w-6 text-[#0d9488]" />
                </div>
                <h3 className="text-[17px] font-bold text-gray-900 mb-1.5">
                  {category.title}
                </h3>
                <p className="text-[13px] text-gray-500 leading-relaxed mb-4">
                  {category.subtitle}
                </p>
                <ul className="space-y-2 mb-4">
                  {category.features.slice(0, 3).map((f) => (
                    <li
                      key={f.title}
                      className="flex items-start gap-2 text-[13px] text-gray-600"
                    >
                      <Check className="h-4 w-4 text-[#0d9488] flex-shrink-0 mt-0.5" />
                      <span className="leading-snug">{f.title}</span>
                    </li>
                  ))}
                </ul>
                <span className="inline-flex items-center gap-1 text-[13px] font-medium text-[#0d9488] group-hover:gap-1.5 transition-all">
                  Se alle
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ─── Pricing teaser ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="text-center mb-8 sm:mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Simple, fair priser
          </h2>
          <p className="mt-3 text-[14px] text-gray-500 max-w-xl mx-auto">
            Start gratis, opgrader når du er klar. Ingen skjulte gebyrer.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 max-w-4xl mx-auto">
          {teaserPlans.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl border p-6 flex flex-col ${
                plan.highlighted
                  ? "bg-white border-[#0d9488] shadow-lg md:scale-[1.03]"
                  : "bg-white/80 backdrop-blur-sm border-[#e2e8e6]/80 shadow-sm"
              }`}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-[#0d9488] to-[#14b8a6] text-white text-[11px] font-semibold shadow-sm">
                  <Star className="h-3 w-3 fill-white" />
                  Mest populær
                </span>
              )}
              <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
              <div className="mt-2 mb-4">
                <span className="text-3xl font-bold text-gray-900">
                  {plan.priceMonthly}
                </span>
                {!plan.isFree && (
                  <span className="text-[13px] text-gray-500">/md.</span>
                )}
              </div>
              <p className="text-[12px] text-gray-500 mb-4 min-h-[2.5em]">
                {plan.description}
              </p>
              <ul className="space-y-2 mb-5 flex-1">
                {plan.features.slice(0, 4).map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-[#0d9488] flex-shrink-0 mt-0.5" />
                    <span className="text-[12px] text-gray-600">{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                asChild
                className="w-full h-10 text-[14px]"
                variant={plan.highlighted ? "default" : "outline"}
              >
                <Link href="/login">{plan.cta}</Link>
              </Button>
            </div>
          ))}
        </div>
        <div className="text-center mt-6">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1 text-[14px] font-medium text-[#0d9488] hover:text-[#0f766e] transition-colors"
          >
            Se alle 5 planer
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ─── Trust badges ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="rounded-3xl bg-gradient-to-br from-[#0d9488]/[0.06] to-[#2dd4bf]/[0.03] border border-[#0d9488]/10 p-6 sm:p-10">
          <h2 className="text-center text-lg sm:text-xl font-bold text-gray-900 mb-1">
            Bygget til dansk compliance
          </h2>
          <p className="text-center text-[13px] text-gray-500 mb-8">
            AlphaFlow opfylder bogføringsloven og understøtter alle danske
            standarder
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* ─── FAQ teaser ─── */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Ofte stillede spørgsmål
          </h2>
        </div>
        <div className="space-y-3">
          {teaserFaqs.map((faq, i) => (
            <div
              key={i}
              className="rounded-2xl bg-white/80 backdrop-blur-sm border border-[#e2e8e6]/80 shadow-sm p-5"
            >
              <h3 className="text-[15px] font-semibold text-gray-900 mb-2">
                {faq.question}
              </h3>
              <p className="text-[13px] text-gray-600 leading-relaxed">
                {faq.answer}
              </p>
            </div>
          ))}
        </div>
        <div className="text-center mt-6">
          <Link
            href="/faq"
            className="inline-flex items-center gap-1 text-[14px] font-medium text-[#0d9488] hover:text-[#0f766e] transition-colors"
          >
            Se alle 12 spørgsmål
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 pb-16 sm:pb-20">
        <div className="rounded-3xl bg-gradient-to-br from-[#0d9488] to-[#14b8a6] p-8 sm:p-12 lg:p-16 text-center shadow-lg">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight">
            Klar til at komme i gang?
          </h2>
          <p className="mt-4 text-[15px] sm:text-[16px] text-[#ccfbef] max-w-xl mx-auto">
            Start din 60-dages gratis prøveperiode i dag. Ingen kreditkort,
            ingen binding — fuld adgang til alle funktioner.
          </p>
          <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="h-12 px-8 text-[15px] bg-white text-[#0d9488] hover:bg-white/90 hover:text-[#0f766e]"
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
              className="h-12 px-8 text-[15px] border-white/40 text-white hover:bg-white/10 hover:text-white hover:border-white/60"
            >
              <Link href="/contact">Kontakt os</Link>
            </Button>
          </div>
          <div className="mt-6 flex items-center justify-center gap-5 text-[12px] text-[#ccfbef]/80">
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5" />
              Ingen kreditkort
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Opsætning på 5 min
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" />
              Dansk support
            </span>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
