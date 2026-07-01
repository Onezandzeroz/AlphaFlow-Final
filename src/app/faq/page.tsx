import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, HelpCircle, MessageCircle } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { FAQ_DA, SITE } from "@/lib/seo";

export const metadata: Metadata = {
  title: "FAQ — Ofte stillede spørgsmål om AlphaFlow",
  description:
    "Svar på de mest almindelige spørgsmål om AlphaFlow: gratis prøveperiode, momsafregning, Peppol e-fakturering, bogføringslov compliance, OCR scanning, sikkerhed og mere.",
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
      {/* ─── Hero ─── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16 lg:pt-20 pb-8">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f0fdf9] border border-[#ccfbef] text-[12px] font-medium text-[#0d9488] mb-5">
            <HelpCircle className="h-3.5 w-3.5" />
            Ofte stillede spørgsmål
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 tracking-tight leading-[1.15]">
            Spørgsmål?{" "}
            <span className="bg-gradient-to-r from-[#0d9488] to-[#2dd4bf] bg-clip-text text-transparent">
              Vi har svarene
            </span>
          </h1>
          <p className="mt-5 text-base sm:text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto">
            Alt du vil vide om AlphaFlow — fra priser og prøveperiode til
            moms, e-fakturering og sikkerhed. Kan du ikke finde svar, er du
            altid velkommen til at skrive til os.
          </p>
        </div>
      </section>

      {/* ─── FAQ Accordion ─── */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-[#e2e8e6]/80 shadow-sm p-2 sm:p-3">
          <Accordion type="single" collapsible className="w-full">
            {FAQ_DA.map((item, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="border-b border-[#e2e8e6]/60 last:border-b-0 px-3 sm:px-4"
              >
                <AccordionTrigger className="text-left text-[15px] sm:text-[16px] font-semibold text-gray-900 hover:text-[#0d9488] hover:no-underline py-5 transition-colors">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-[14px] text-gray-600 leading-relaxed pb-5">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ─── Quick links ─── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            href="/features"
            className="group rounded-2xl bg-white/80 backdrop-blur-sm border border-[#e2e8e6]/80 shadow-sm p-5 hover:shadow-md hover:border-[#0d9488]/20 transition-all duration-200"
          >
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[#f0fdf9] border border-[#ccfbef] mb-3">
              <HelpCircle className="h-5 w-5 text-[#0d9488]" />
            </div>
            <h3 className="text-[14px] font-semibold text-gray-900 mb-1">
              Se alle funktioner
            </h3>
            <p className="text-[12px] text-gray-500">
              Udforsk hvad AlphaFlow kan tilbyde
            </p>
          </Link>
          <Link
            href="/pricing"
            className="group rounded-2xl bg-white/80 backdrop-blur-sm border border-[#e2e8e6]/80 shadow-sm p-5 hover:shadow-md hover:border-[#0d9488]/20 transition-all duration-200"
          >
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[#f0fdf9] border border-[#ccfbef] mb-3">
              <ArrowRight className="h-5 w-5 text-[#0d9488]" />
            </div>
            <h3 className="text-[14px] font-semibold text-gray-900 mb-1">
              Se priser
            </h3>
            <p className="text-[12px] text-gray-500">
              Fra 0 kr./md. — find den rette plan
            </p>
          </Link>
          <Link
            href="/contact"
            className="group rounded-2xl bg-white/80 backdrop-blur-sm border border-[#e2e8e6]/80 shadow-sm p-5 hover:shadow-md hover:border-[#0d9488]/20 transition-all duration-200"
          >
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[#f0fdf9] border border-[#ccfbef] mb-3">
              <MessageCircle className="h-5 w-5 text-[#0d9488]" />
            </div>
            <h3 className="text-[14px] font-semibold text-gray-900 mb-1">
              Kontakt os
            </h3>
            <p className="text-[12px] text-gray-500">
              Skriv — vi svarer inden for én hverdag
            </p>
          </Link>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 pb-16 sm:pb-20">
        <div className="rounded-3xl bg-gradient-to-br from-[#0d9488]/[0.06] to-[#2dd4bf]/[0.03] border border-[#0d9488]/10 p-8 sm:p-10 text-center">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
            Stadig spørgsmål?
          </h2>
          <p className="mt-3 text-[14px] text-gray-600 max-w-lg mx-auto">
            Vores support-team sidder klar hverdage 09:00–17:00. Skriv til
            os, så hjælper vi dig i gang.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg" className="h-11 px-6 text-[15px]">
              <Link href="/contact">
                Skriv til os
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-11 px-6 text-[15px] border-[#0d9488]/30 text-[#0d9488] hover:bg-[#f0fdf9] hover:text-[#0f766e]"
            >
              <Link href="/login">Prøv gratis</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
