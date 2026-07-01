import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Check, Star, ShieldCheck, Clock, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CTAButton } from "@/components/marketing/cta-button";
import { PRICING_PLANS, TRUST_BADGES } from "@/lib/marketing-data";
import { SITE } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Priser — Transparente abonnementer fra 0 kr./md.",
  description:
    "AlphaFlow priser: Gratis plan (0 kr.), Månedlig (199 kr./md.), Pro (169 kr./md.), Business (149 kr./md.) og Business Extended (145 kr./md.). 60 dages gratis prøveperiode, ingen kreditkort, fuld bogføringslov compliance.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Priser — AlphaFlow Regnskabsprogram",
    description:
      "Priser fra 0 kr./md. Gratis plan, Månedlig 199 kr., Pro 169 kr., Business 149 kr., Business Extended 145 kr. 60 dages gratis prøveperiode.",
    url: "/pricing",
  },
};

export default function PricingPage() {
  return (
    <MarketingShell>
      {/* ═══════════════════════════════════════════════════════════════
          HERO — full-width dark gradient with banner-4
          ═══════════════════════════════════════════════════════════════ */}
      <section className="relative w-full overflow-hidden bg-gradient-to-br from-[#042f2e] via-[#0c4a6e] to-[#115e59]">
        <div className="absolute inset-0">
          <Image
            src="/banner-4.png"
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
            <ShieldCheck className="h-3.5 w-3.5 text-teal-300" />
            Ingen skjulte gebyrer
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-[1.08] max-w-3xl mx-auto">
            Priser der passer til{" "}
            <span className="bg-gradient-to-r from-teal-300 via-teal-200 to-sky-300 bg-clip-text text-transparent">
              din virksomhed
            </span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-teal-50/90 leading-relaxed max-w-2xl mx-auto">
            Start gratis, opgrader når du er klar. Alle priser er eksklusiv
            moms. Ingen opsigelsesfrist på månedligt abonnement.
          </p>
          <div className="mt-7 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-[13px] text-teal-50">
            <Clock className="h-4 w-4 text-teal-300" />
            60 dages gratis prøveperiode — ingen kreditkort påkrævet
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
          PRICING CARDS — all 5 plans
          ═══════════════════════════════════════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-4 sm:-mt-6 relative z-10 py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-5">
          {PRICING_PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-3xl border p-6 flex flex-col transition-all duration-200 ${
                plan.highlighted
                  ? "bg-gradient-to-br from-[#134e4a] to-[#0c4a6e] border-transparent shadow-2xl lg:scale-[1.04]"
                  : "bg-white border-[#e2e8e6]/80 shadow-sm hover:shadow-lg hover:border-[#0d9488]/30"
              }`}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-teal-400 to-sky-400 text-[#042f2e] text-[11px] font-bold shadow-lg">
                  <Star className="h-3 w-3 fill-[#042f2e]" />
                  Mest populær
                </span>
              )}
              {plan.savings && !plan.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center px-3 py-1 rounded-full bg-[#f0fdf9] border border-[#ccfbef] text-[#0d9488] text-[11px] font-semibold">
                  {plan.savings}
                </span>
              )}

              <div className="mb-4">
                <h3
                  className={`text-lg font-bold ${
                    plan.highlighted ? "text-white" : "text-gray-900"
                  }`}
                >
                  {plan.name}
                </h3>
                <p
                  className={`mt-1 text-[12px] leading-snug min-h-[2.5em] ${
                    plan.highlighted ? "text-teal-100/80" : "text-gray-500"
                  }`}
                >
                  {plan.description}
                </p>
              </div>

              <div className="mb-4 pb-4 border-b border-[#e2e8e6]/60">
                <div className="flex items-baseline gap-1">
                  <span
                    className={`text-3xl font-bold ${
                      plan.highlighted ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {plan.priceMonthly}
                  </span>
                  {!plan.isFree && (
                    <span
                      className={`text-[13px] ${
                        plan.highlighted ? "text-teal-100/70" : "text-gray-500"
                      }`}
                    >
                      /md.
                    </span>
                  )}
                </div>
                <p
                  className={`mt-1 text-[11px] leading-snug ${
                    plan.highlighted ? "text-teal-100/60" : "text-gray-400"
                  }`}
                >
                  {plan.pricePeriod}
                </p>
                {plan.savings && plan.highlighted && (
                  <p className="mt-2 inline-flex items-center px-2 py-0.5 rounded-md bg-white/15 text-[11px] font-semibold text-teal-100">
                    {plan.savings}
                  </p>
                )}
              </div>

              <div
                className={`mb-4 flex items-center gap-1.5 text-[12px] ${
                  plan.highlighted ? "text-teal-100/80" : "text-gray-500"
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                {plan.binding}
              </div>

              <ul className="space-y-2.5 mb-6 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check
                      className={`h-4 w-4 flex-shrink-0 mt-0.5 ${
                        plan.highlighted ? "text-teal-300" : "text-[#0d9488]"
                      }`}
                    />
                    <span
                      className={`text-[12px] leading-relaxed ${
                        plan.highlighted
                          ? "text-teal-50/90"
                          : "text-gray-600"
                      }`}
                    >
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              {plan.highlighted ? (
                <CTAButton
                  href="/login"
                  variant="primary-light"
                  className="w-full h-10 px-4 text-[14px] shadow-lg"
                >
                  {plan.cta}
                </CTAButton>
              ) : (
                <Button
                  asChild
                  variant="outline"
                  className="w-full h-10 text-[14px] rounded-md"
                >
                  <Link href="/login">{plan.cta}</Link>
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          INCLUDED IN ALL — comparison note
          ═══════════════════════════════════════════════════════════════ */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="rounded-3xl bg-white border border-[#e2e8e6]/80 shadow-sm p-7 sm:p-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center justify-center h-11 w-11 rounded-2xl bg-gradient-to-br from-[#134e4a] to-[#0d9488] shadow-lg">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
              Hvad er inkluderet i alle planer?
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              "Dobbelt bogføring med finansjournal",
              "FSR standard kontoplan (38 konti)",
              "Automatisk momsafregning (10 koder)",
              "Lukkede regnskabsperioder",
              "Uforanderlig revisionslog (audit trail)",
              "PWA med offline-support",
              "Multi-sprog (dansk/engelsk)",
              "Soft-delete med bevarelse",
            ].map((item) => (
              <div
                key={item}
                className="flex items-start gap-2.5 p-3 rounded-xl bg-[#f8faf9]"
              >
                <Check className="h-4 w-4 text-[#0d9488] flex-shrink-0 mt-0.5" />
                <span className="text-[14px] text-gray-700">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          TRUST BADGES — full-width dark section
          ═══════════════════════════════════════════════════════════════ */}
      <section className="w-full bg-gradient-to-br from-[#042f2e] via-[#0c4a6e] to-[#115e59] py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Trygt og sikkert
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
          FAQ TEASER CTA
          ═══════════════════════════════════════════════════════════════ */}
      <section className="w-full bg-gradient-to-br from-[#042f2e] via-[#0d9488] to-[#0c4a6e] py-16 sm:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Har du spørgsmål til priserne?
          </h2>
          <p className="mt-5 text-[16px] text-teal-50/90 max-w-lg mx-auto">
            Læs vores FAQ for svar på de mest almindelige spørgsmål, eller
            skriv til os — vi svarer inden for én hverdag.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <CTAButton href="/faq" variant="primary-light">
              Læs FAQ
            </CTAButton>
            <CTAButton href="/contact" variant="outline-light">
              Kontakt os
            </CTAButton>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
