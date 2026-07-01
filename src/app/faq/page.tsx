import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, HelpCircle, MessageCircle, ShieldCheck } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CTAButton } from "@/components/marketing/cta-button";
import { FAQ_DA, SITE } from "@/lib/seo";

export const metadata: Metadata = {
  title: "FAQ — Ofte stillede spørgsmål om AlphaFlow",
  description:
    "Svar på de mest almindelige spørgsmål om AlphaFlow: gratis under 50.000 kr. omsætning, momsafregning, Peppol e-fakturering, bogføringslov compliance, OCR scanning, sikkerhed og mere.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "FAQ — AlphaFlow Regnskabsprogram",
    description:
      "Ofte stillede spørgsmål om AlphaFlow: priser, moms, e-faktura, bogføringslov, sikkerhed og mere.",
    url: "/faq",
  },
};

export default function FaqPage() {
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
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 sm:pt-28 lg:pt-32 pb-20 sm:pb-24 text-center">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-[12px] font-medium text-teal-100 mb-6">
            <HelpCircle className="h-3.5 w-3.5 text-teal-300" />
            Ofte stillede spørgsmål
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-[1.12]">
            Spørgsmål?{" "}
            <span className="bg-gradient-to-r from-teal-300 via-teal-200 to-sky-300 bg-clip-text text-transparent">
              Vi har svarene
            </span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-teal-50/90 leading-relaxed max-w-2xl mx-auto">
            Alt du vil vide om AlphaFlow — fra priser og gratis oprettelse til
            moms, e-fakturering og sikkerhed. Kan du ikke finde svar, er du
            altid velkommen til at skrive til os.
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
          FAQ ACCORDION
          ═══════════════════════════════════════════════════════════════ */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="rounded-3xl bg-white border border-[#e2e8e6]/80 shadow-sm p-3 sm:p-4">
          <Accordion type="single" collapsible className="w-full">
            {FAQ_DA.map((item, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="border-b border-[#e2e8e6]/60 last:border-b-0 px-4 sm:px-6"
              >
                <AccordionTrigger className="text-left text-[15px] sm:text-[17px] font-semibold text-gray-900 hover:text-[#0d9488] hover:no-underline py-6 transition-colors">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-[14px] sm:text-[15px] text-gray-600 leading-relaxed pb-6">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          QUICK LINKS — 3 cards
          ═══════════════════════════════════════════════════════════════ */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Link
            href="/features"
            className="group relative rounded-3xl bg-white border border-[#e2e8e6]/80 shadow-sm p-7 hover:shadow-xl hover:border-[#0d9488]/30 transition-all duration-300 overflow-hidden"
          >
            <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-gradient-to-br from-[#0d9488]/5 to-[#0c4a6e]/5 blur-2xl group-hover:from-[#0d9488]/10 group-hover:to-[#0c4a6e]/10 transition-all duration-300" />
            <div className="relative">
              <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-[#134e4a] to-[#0d9488] mb-5 shadow-lg">
                <HelpCircle className="h-7 w-7 text-white" />
              </div>
              <h3 className="text-[16px] font-bold text-gray-900 mb-1.5">
                Se alle funktioner
              </h3>
              <p className="text-[13px] text-gray-500">
                Udforsk hvad AlphaFlow kan tilbyde
              </p>
            </div>
          </Link>
          <Link
            href="/pricing"
            className="group relative rounded-3xl bg-white border border-[#e2e8e6]/80 shadow-sm p-7 hover:shadow-xl hover:border-[#0d9488]/30 transition-all duration-300 overflow-hidden"
          >
            <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-gradient-to-br from-[#0d9488]/5 to-[#0c4a6e]/5 blur-2xl group-hover:from-[#0d9488]/10 group-hover:to-[#0c4a6e]/10 transition-all duration-300" />
            <div className="relative">
              <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-[#134e4a] to-[#0d9488] mb-5 shadow-lg">
                <ArrowRight className="h-7 w-7 text-white" />
              </div>
              <h3 className="text-[16px] font-bold text-gray-900 mb-1.5">
                Se priser
              </h3>
              <p className="text-[13px] text-gray-500">
                Fra 0 kr./md. — find den rette plan
              </p>
            </div>
          </Link>
          <Link
            href="/contact"
            className="group relative rounded-3xl bg-white border border-[#e2e8e6]/80 shadow-sm p-7 hover:shadow-xl hover:border-[#0d9488]/30 transition-all duration-300 overflow-hidden"
          >
            <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-gradient-to-br from-[#0d9488]/5 to-[#0c4a6e]/5 blur-2xl group-hover:from-[#0d9488]/10 group-hover:to-[#0c4a6e]/10 transition-all duration-300" />
            <div className="relative">
              <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-[#134e4a] to-[#0d9488] mb-5 shadow-lg">
                <MessageCircle className="h-7 w-7 text-white" />
              </div>
              <h3 className="text-[16px] font-bold text-gray-900 mb-1.5">
                Kontakt os
              </h3>
              <p className="text-[13px] text-gray-500">
                Skriv — vi svarer inden for én hverdag
              </p>
            </div>
          </Link>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          FINAL CTA — full-width dark gradient
          ═══════════════════════════════════════════════════════════════ */}
      <section className="w-full bg-gradient-to-br from-[#042f2e] via-[#0d9488] to-[#0c4a6e] py-16 sm:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Stadig spørgsmål?
          </h2>
          <p className="mt-5 text-[16px] text-teal-50/90 max-w-lg mx-auto">
            Vores support-team sidder klar hverdage 09:00–17:00. Skriv til
            os, så hjælper vi dig i gang.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <CTAButton href="/contact" variant="primary-light" showArrow>
              Skriv til os
            </CTAButton>
            <CTAButton href="/login" variant="outline-light" register>
              Prøv gratis
            </CTAButton>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-teal-100/80">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-teal-300" />
              Dansk support
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="h-4 w-4 text-teal-300" />
              Svar inden for én hverdag
            </span>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
