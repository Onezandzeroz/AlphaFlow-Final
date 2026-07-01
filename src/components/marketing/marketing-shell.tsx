import type { ReactNode } from "react";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

/**
 * Shared layout shell for public marketing pages.
 *
 * Server component — wraps every public marketing route with:
 *   - The `light-forced` class (locks light theme, matching login/terms)
 *   - The `login-mesh` class (subtle animated background blobs)
 *   - `min-h-[100dvh] flex flex-col` so the footer sticks to the bottom
 *   - The marketing header + footer
 *
 * Pages render their content inside <main className="flex-1 ...">.
 */
export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#f8faf9] light-forced login-mesh">
      {/* Decorative background blob (matches terms-of-service page) */}
      <div className="login-shape-3 absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gradient-to-br from-[#0d9488]/[0.04] to-[#7c9a82]/[0.03] rounded-full blur-3xl pointer-events-none" />

      <MarketingHeader />
      <main className="flex-1 relative z-10">{children}</main>
      <MarketingFooter />
    </div>
  );
}
