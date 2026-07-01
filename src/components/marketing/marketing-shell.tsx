import type { ReactNode } from "react";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

/**
 * Shared layout shell for public marketing pages.
 *
 * Server component — wraps every public marketing route with:
 *   - The `light-forced` class (locks light theme, matching login/terms)
 *   - `min-h-[100dvh] flex flex-col` so the footer sticks to the bottom
 *   - The marketing header + footer
 *
 * Full-width: sections inside pages manage their own max-width and padding,
 * allowing hero/banner sections to span edge-to-edge for a modern look.
 */
export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#f8faf9] light-forced">
      <MarketingHeader />
      <main className="flex-1 relative">{children}</main>
      <MarketingFooter />
    </div>
  );
}
