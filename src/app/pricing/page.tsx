import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Star, ShieldCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/marketing-shell";
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
      {/* ─── Hero ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16 lg:pt-20 pb-8">
        <div className="text-center max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f0fdf9] border border-[#ccfbef] text-[12px] font-medium text-[#0d9488] mb-5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Ingen skjulte gebyrer
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 tracking-tight leading-[1.1]">
            Priser der passer til{" "}
            <span className="bg-gradient-to-r from-[#0d9488] to-[#2dd4bf] bg-clip-text text-transparent">
              din virksomhed
            </span>
          </h1>
          <p className="mt-5 text-base sm:text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto">
            Start gratis, opgrader når du er klar. Alle priser er eksklusiv
            moms. Ingen opsigelsesfrist på månedligt abonnement.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 text-[13px] text-gray-500">
            <Clock className="h-4 w-4 text-[#0d9488]" />
            60 dages gratis prøveperiode — ingen kreditkort påkrævet
          </div>
        </div>
      </section>

      {/* ─── Pricing cards ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Mobile: horizontal scroll, Desktop: grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-5">
          {PRICING_PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl border p-6 flex flex-col transition-all duration-200 ${
                plan.highlighted
                  ? "bg-white border-[#0d9488] shadow-lg lg:scale-[1.04] lg:-mt-2 lg:mb-2"
                  : "bg-white/80 backdrop-blur-sm border-[#e2e8e6]/80 shadow-sm hover:shadow-md hover:border-[#0d9488]/20"
              }`}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-[#0d9488] to-[#14b8a6] text-white text-[11px] font-semibold shadow-sm">
                  <Star className="h-3 w-3 fill-white" />
                  Mest populær
                </span>
              )}
              {plan.savings && !plan.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center px-3 py-1 rounded-full bg-[#f0fdf9] border border-[#ccfbef] text-[#0d9488] text-[11px] font-semibold">
                  {plan.savings}
                </span>
              )}

              {/* Plan name + description */}
              <div className="mb-4">
                <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                <p className="mt-1 text-[12px] text-gray-500 leading-snug min-h-[2.5em]">
                  {plan.description}
                </p>
              </div>

              {/* Price */}
              <div className="mb-4 pb-4 border-b border-[#e2e8e6]/60">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-gray-900">
                    {plan.priceMonthly}
                  </span>
                  {!plan.isFree && (
                    <span className="text-[13px] text-gray-500">/md.</span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-gray-400 leading-snug">
                  {plan.pricePeriod}
                </p>
                {plan.savings && plan.highlighted && (
                  <p className="mt-2 inline-flex items-center px-2 py-0.5 rounded-md bg-[#f0fdf9] border border-[#ccfbef] text-[11px] font-semibold text-[#0d9488]">
                    {plan.savings}
                  </p>
                )}
              </div>

              {/* Binding */}
              <div className="mb-4 flex items-center gap-1.5 text-[12px] text-gray-500">
                <Clock className="h-3.5 w-3.5 text-[#0d9488]/60" />
                {plan.binding}
              </div>

              {/* Features */}
              <ul className="space-y-2.5 mb-6 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check
                      className={`h-4 w-4 flex-shrink-0 mt-0.5 ${
                        plan.highlighted ? "text-[#0d9488]" : "text-[#0d9488]/70"
                      }`}
                    />
                    <span className="text-[12px] text-gray-600 leading-relaxed">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Button
                asChild
                className={`w-full h-10 text-[14px] ${
                  plan.highlighted
                    ? ""
                    : "bg-white border border-[#0d9488]/30 text-[#0d9488] hover:bg-[#f0fdf9] hover:text-[#0f766e]"
                }`}
                variant={plan.highlighted ? "default" : "outline"}
              >
                <Link href="/login">
                  {plan.cta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Comparison note ─── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-[#e2e8e6]/80 shadow-sm p-6 sm:p-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            Hvad er inkluderet i alle planer?
          </h2>
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
              <div key={item} className="flex items-start gap-2">
                <Check className="h-4 w-4 text-[#0d9488] flex-shrink-0 mt-0.5" />
                <span className="text-[13px] text-gray-600">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Trust badges ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {TRUST_BADGES.map((badge) => {
            const Icon = badge.icon;
            return (
              <div
                key={badge.title}
                className="rounded-2xl bg-white/80 backdrop-blur-sm border border-[#e2e8e6]/80 shadow-sm p-5 text-center"
              >
                <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[#f0fdf9] border border-[#ccfbef] mx-auto mb-3">
                  <Icon className="h-5 w-5 text-[#0d9488]" />
                </div>
                <h3 className="text-[13px] font-semibold text-gray-900 mb-1">
                  {badge.title}
                </h3>
                <p className="text-[11px] text-gray-500 leading-snug">
                  {badge.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── FAQ teaser ─── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 pb-16 sm:pb-20">
        <div className="rounded-3xl bg-gradient-to-br from-[#0d9488]/[0.06] to-[#2dd4bf]/[0.03] border border-[#0d9488]/10 p-8 sm:p-10 text-center">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
            Har du spørgsmål til priserne?
          </h2>
          <p className="mt-3 text-[14px] text-gray-600 max-w-lg mx-auto">
            Læs vores FAQ for svar på de mest almindelige spørgsmål, eller
            skriv til os — vi svarer inden for én hverdag.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg" className="h-11 px-6 text-[15px]">
              <Link href="/faq">Læs FAQ</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-11 px-6 text-[15px] border-[#0d9488]/30 text-[#0d9488] hover:bg-[#f0fdf9] hover:text-[#0f766e]"
            >
              <Link href="/contact">Kontakt os</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
