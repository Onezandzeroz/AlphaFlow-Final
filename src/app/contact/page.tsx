import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Clock, HelpCircle, FileText } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CTAButton } from "@/components/marketing/cta-button";
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
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-[1.12]">
            Kontakt{" "}
            <span className="bg-gradient-to-r from-teal-300 via-teal-200 to-sky-300 bg-clip-text text-transparent">
              AlphaFlow
            </span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-teal-50/90 leading-relaxed max-w-2xl mx-auto">
            Har du spørgsmål om AlphaFlow, priser eller funktioner? Udfyld
            formularen, eller brug vores kontaktoplysninger herunder. Vi
            svarer inden for én hverdag.
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
          CONTACT CHANNELS — 4 cards
          ═══════════════════════════════════════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
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
                className="group rounded-3xl bg-white border border-[#e2e8e6]/80 shadow-sm p-6 hover:shadow-xl hover:border-[#0d9488]/30 transition-all duration-300"
              >
                <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-br from-[#134e4a] to-[#0d9488] mb-4 shadow-lg">
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">
                  {channel.label}
                </p>
                <p className="text-[14px] font-semibold text-gray-900 leading-snug group-hover:text-[#0d9488] transition-colors">
                  {channel.value}
                </p>
              </a>
            );
          })}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          FORM + SIDEBAR
          ═══════════════════════════════════════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
          {/* Form (3 cols) */}
          <div className="lg:col-span-3">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
              Skriv til os
            </h2>
            <p className="text-[14px] text-gray-500 mb-6">
              Udfyld formularen, så vender vi tilbage hurtigst muligt.
            </p>
            <ContactForm />
          </div>

          {/* Info sidebar (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Response time */}
            <div className="rounded-3xl bg-gradient-to-br from-[#042f2e] via-[#0c4a6e] to-[#115e59] p-6 shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-5 w-5 text-teal-300" />
                <h3 className="text-[15px] font-semibold text-white">
                  Svartid
                </h3>
              </div>
              <p className="text-[13px] text-teal-100/80 leading-relaxed">
                Vi besvarer henvendelser hverdage{" "}
                <strong className="text-white">
                  {COMPANY_FACTS.openingHours}
                </strong>
                . Normal svartid: under én hverdag.
              </p>
            </div>

            {/* Direct contact */}
            <div className="rounded-3xl bg-white border border-[#e2e8e6]/80 shadow-sm p-6">
              <h3 className="text-[15px] font-semibold text-gray-900 mb-4">
                Direkte kontakt
              </h3>
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] text-gray-400 uppercase tracking-wider">
                    Virksomhed
                  </p>
                  <p className="text-[14px] font-semibold text-gray-900">
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
                  <p className="text-[14px] font-semibold text-gray-900">
                    {COMPANY_FACTS.address}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 pt-2">
                  <a
                    href={`mailto:${COMPANY_FACTS.email}`}
                    className="text-[13px] font-medium text-[#0d9488] hover:text-[#0f766e] transition-colors break-all"
                  >
                    {COMPANY_FACTS.email}
                  </a>
                  <a
                    href={`tel:${COMPANY_FACTS.phone.replace(/\s/g, "")}`}
                    className="text-[13px] font-medium text-[#0d9488] hover:text-[#0f766e] transition-colors"
                  >
                    {COMPANY_FACTS.phone}
                  </a>
                </div>
              </div>
            </div>

            {/* Quick links */}
            <div className="rounded-3xl bg-white border border-[#e2e8e6]/80 shadow-sm p-6">
              <h3 className="text-[15px] font-semibold text-gray-900 mb-4">
                Måske kan du finde svar her
              </h3>
              <ul className="space-y-1">
                <li>
                  <Link
                    href="/faq"
                    className="flex items-center justify-between text-[14px] text-gray-600 hover:text-[#0d9488] transition-colors py-2"
                  >
                    <span className="inline-flex items-center gap-2">
                      <HelpCircle className="h-4 w-4 text-[#0d9488]/60" />
                      Ofte stillede spørgsmål
                    </span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link
                    href="/pricing"
                    className="flex items-center justify-between text-[14px] text-gray-600 hover:text-[#0d9488] transition-colors py-2"
                  >
                    <span className="inline-flex items-center gap-2">
                      <FileText className="h-4 w-4 text-[#0d9488]/60" />
                      Priser og abonnementer
                    </span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link
                    href="/features"
                    className="flex items-center justify-between text-[14px] text-gray-600 hover:text-[#0d9488] transition-colors py-2"
                  >
                    <span className="inline-flex items-center gap-2">
                      <ArrowRight className="h-4 w-4 text-[#0d9488]/60" />
                      Funktioner
                    </span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          FINAL CTA — full-width dark gradient
          ═══════════════════════════════════════════════════════════════ */}
      <section className="w-full bg-gradient-to-br from-[#042f2e] via-[#0d9488] to-[#0c4a6e] py-16 sm:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
            Klar til at prøve AlphaFlow?
          </h2>
          <p className="mt-5 text-[16px] sm:text-[17px] text-teal-50/90 max-w-xl mx-auto leading-relaxed">
            Start gratis i dag — fuld adgang så længe din omsætning er
            under 50.000 kr. Ingen kreditkort, ingen binding.
          </p>
          <CTAButton href="/login" variant="primary-light" showArrow register className="mt-9">
            Opret gratis konto
          </CTAButton>
        </div>
      </section>
    </MarketingShell>
  );
}
