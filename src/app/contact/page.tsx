import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { ContactForm } from "@/components/marketing/contact-form";
import { CONTACT_CHANNELS, COMPANY_FACTS } from "@/lib/marketing-data";
import { SITE } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Kontakt — Skriv til AlphaFlow",
  description:
    "Kontakt AlphaFlow / AlphaAi Consult ApS. Skelagervej 124, 8200 Aarhus N. CVR 46312058. E-mail: info@alphaflow.dk. Telefon: +45 61 73 60 76. Vi svarer inden for én hverdag.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Kontakt — AlphaFlow",
    description:
      "Skriv til AlphaFlow. AlphaAi Consult ApS, Aarhus. CVR 46312058. Vi svarer inden for én hverdag.",
    url: "/contact",
  },
};

export default function ContactPage() {
  return (
    <MarketingShell>
      {/* ─── Hero ─── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16 lg:pt-20 pb-8">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f0fdf9] border border-[#ccfbef] text-[12px] font-medium text-[#0d9488] mb-5">
            <MessageCircle className="h-3.5 w-3.5" />
            Vi sidder klar til at hjælpe
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 tracking-tight leading-[1.15]">
            Kontakt{" "}
            <span className="bg-gradient-to-r from-[#0d9488] to-[#2dd4bf] bg-clip-text text-transparent">
              AlphaFlow
            </span>
          </h1>
          <p className="mt-5 text-base sm:text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto">
            Har du spørgsmål om AlphaFlow, priser eller funktioner? Udfyld
            formularen, eller brug vores kontaktoplysninger herunder. Vi
            svarer inden for én hverdag.
          </p>
        </div>
      </section>

      {/* ─── Contact channels ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {CONTACT_CHANNELS.map((channel) => {
            const Icon = channel.icon;
            return (
              <a
                key={channel.label}
                href={channel.href}
                target={
                  channel.href.startsWith("http") ? "_blank" : undefined
                }
                rel={
                  channel.href.startsWith("http")
                    ? "noopener noreferrer"
                    : undefined
                }
                className="group rounded-2xl bg-white/80 backdrop-blur-sm border border-[#e2e8e6]/80 shadow-sm p-5 hover:shadow-md hover:border-[#0d9488]/20 transition-all duration-200"
              >
                <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[#f0fdf9] border border-[#ccfbef] mb-3">
                  <Icon className="h-5 w-5 text-[#0d9488]" />
                </div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">
                  {channel.label}
                </p>
                <p className="text-[13px] font-medium text-gray-900 leading-snug group-hover:text-[#0d9488] transition-colors">
                  {channel.value}
                </p>
              </a>
            );
          })}
        </div>
      </section>

      {/* ─── Form + info ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
          {/* Form (3 cols) */}
          <div className="lg:col-span-3">
            <h2 className="text-lg font-bold text-gray-900 mb-1">
              Skriv til os
            </h2>
            <p className="text-[13px] text-gray-500 mb-5">
              Udfyld formularen, så vender vi tilbage hurtigst muligt.
            </p>
            <ContactForm />
          </div>

          {/* Info sidebar (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Response time */}
            <div className="rounded-2xl bg-gradient-to-br from-[#0d9488]/[0.06] to-[#2dd4bf]/[0.03] border border-[#0d9488]/10 p-5">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-[#0d9488]" />
                <h3 className="text-[14px] font-semibold text-gray-900">
                  Svartid
                </h3>
              </div>
              <p className="text-[13px] text-gray-600 leading-relaxed">
                Vi besvarer henvendelser hverdage{" "}
                <strong className="text-gray-900">
                  {COMPANY_FACTS.openingHours}
                </strong>
                . Normal svartid: under én hverdag.
              </p>
            </div>

            {/* Direct contact */}
            <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-[#e2e8e6]/80 shadow-sm p-5">
              <h3 className="text-[14px] font-semibold text-gray-900 mb-3">
                Direkte kontakt
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] text-gray-400 uppercase tracking-wider">
                    Virksomhed
                  </p>
                  <p className="text-[13px] font-medium text-gray-900">
                    {COMPANY_FACTS.name}
                  </p>
                  <p className="text-[12px] text-gray-500">
                    CVR: {COMPANY_FACTS.cvr}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 uppercase tracking-wider">
                    Adresse
                  </p>
                  <p className="text-[13px] font-medium text-gray-900">
                    {COMPANY_FACTS.address}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <a
                    href={`mailto:${COMPANY_FACTS.email}`}
                    className="text-[12px] font-medium text-[#0d9488] hover:text-[#0f766e] transition-colors break-all"
                  >
                    {COMPANY_FACTS.email}
                  </a>
                  <a
                    href={`tel:${COMPANY_FACTS.phone.replace(/\s/g, "")}`}
                    className="text-[12px] font-medium text-[#0d9488] hover:text-[#0f766e] transition-colors"
                  >
                    {COMPANY_FACTS.phone}
                  </a>
                </div>
              </div>
            </div>

            {/* Quick links */}
            <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-[#e2e8e6]/80 shadow-sm p-5">
              <h3 className="text-[14px] font-semibold text-gray-900 mb-3">
                Måske kan du finde svar her
              </h3>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/faq"
                    className="flex items-center justify-between text-[13px] text-gray-600 hover:text-[#0d9488] transition-colors py-1"
                  >
                    Ofte stillede spørgsmål
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link
                    href="/pricing"
                    className="flex items-center justify-between text-[13px] text-gray-600 hover:text-[#0d9488] transition-colors py-1"
                  >
                    Priser og abonnementer
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link
                    href="/features"
                    className="flex items-center justify-between text-[13px] text-gray-600 hover:text-[#0d9488] transition-colors py-1"
                  >
                    Funktioner
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link
                    href="/terms"
                    className="flex items-center justify-between text-[13px] text-gray-600 hover:text-[#0d9488] transition-colors py-1"
                  >
                    Forretningsbetingelser
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 pb-16 sm:pb-20">
        <div className="rounded-3xl bg-gradient-to-br from-[#0d9488] to-[#14b8a6] p-8 sm:p-12 text-center shadow-lg">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Klar til at prøve AlphaFlow?
          </h2>
          <p className="mt-3 text-[15px] text-[#ccfbef] max-w-xl mx-auto">
            Start din 60-dages gratis prøveperiode. Ingen kreditkort, ingen
            binding — fuld adgang til alle funktioner.
          </p>
          <Button
            asChild
            size="lg"
            className="mt-6 h-11 px-7 text-[15px] bg-white text-[#0d9488] hover:bg-white/90 hover:text-[#0f766e]"
          >
            <Link href="/">
              Opret gratis konto
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </MarketingShell>
  );
}
