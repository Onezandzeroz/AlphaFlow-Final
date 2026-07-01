import Link from "next/link";
import { Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { MARKETING_NAV, COMPANY_FACTS } from "@/lib/marketing-data";
import { SITE } from "@/lib/seo";

/**
 * Shared public marketing footer.
 *
 * Server component — purely static. Renders a multi-column footer with
 * navigation links, company info, and legal links. Follows the visual
 * pattern of the terms-of-service page footer.
 */
export function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative z-10 border-t border-[#e2e8e6]/60 bg-[#f8faf9]/80">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand column */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-br from-[#0d9488]/10 to-[#2dd4bf]/10 border border-[#0d9488]/10 text-[11px] font-medium text-[#0d9488]">
                <ShieldCheck className="h-3 w-3" />
                Bogføringslov compliant
              </span>
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              {SITE.name}
            </h3>
            <p className="text-[13px] text-gray-500 leading-relaxed max-w-xs">
              {SITE.tagline}
            </p>
          </div>

          {/* Navigation column */}
          <div>
            <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-4">
              Navigation
            </h4>
            <ul className="space-y-2.5">
              {MARKETING_NAV.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[13px] text-gray-600 hover:text-[#0d9488] transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/terms"
                  className="text-[13px] text-gray-600 hover:text-[#0d9488] transition-colors"
                >
                  Forretningsbetingelser
                </Link>
              </li>
            </ul>
          </div>

          {/* Company column */}
          <div>
            <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-4">
              Virksomhed
            </h4>
            <ul className="space-y-2.5">
              <li>
                <p className="text-[13px] font-medium text-gray-900">
                  {COMPANY_FACTS.name}
                </p>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 text-[#0d9488] mt-0.5 flex-shrink-0" />
                <span className="text-[13px] text-gray-600">
                  {COMPANY_FACTS.address}
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[13px] text-gray-600">
                  CVR: {COMPANY_FACTS.cvr}
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-[#0d9488] flex-shrink-0" />
                <a
                  href={`tel:${COMPANY_FACTS.phone.replace(/\s/g, "")}`}
                  className="text-[13px] text-gray-600 hover:text-[#0d9488] transition-colors"
                >
                  {COMPANY_FACTS.phone}
                </a>
              </li>
            </ul>
          </div>

          {/* Contact column */}
          <div>
            <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-4">
              Kontakt
            </h4>
            <ul className="space-y-2.5">
              <li className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-[#0d9488] flex-shrink-0" />
                <a
                  href={`mailto:${COMPANY_FACTS.email}`}
                  className="text-[13px] text-gray-600 hover:text-[#0d9488] transition-colors"
                >
                  {COMPANY_FACTS.email}
                </a>
              </li>
              <li>
                <p className="text-[13px] text-gray-600">
                  {COMPANY_FACTS.openingHours}
                </p>
              </li>
            </ul>
            <Link
              href="/contact"
              className="inline-flex items-center gap-1 mt-4 text-[13px] font-medium text-[#0d9488] hover:text-[#0f766e] transition-colors"
            >
              Skriv til os
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-[#e2e8e6]/60 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11px] text-gray-400 text-center sm:text-left">
            © {year} {COMPANY_FACTS.name} — CVR {COMPANY_FACTS.cvr}. Alle
            rettigheder forbeholdes.
          </p>
          <p className="text-[11px] text-gray-300 text-center sm:text-right">
            {COMPANY_FACTS.name} er fuldt ejet af {COMPANY_FACTS.parent}
          </p>
        </div>
      </div>
    </footer>
  );
}
