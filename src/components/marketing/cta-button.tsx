import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

/**
 * CTAButton — a plain Link styled as a button, bypassing shadcn's Button
 * component entirely.
 *
 * WHY THIS EXISTS:
 * The shadcn Button component uses `cn(buttonVariants({ variant, className }))`
 * which passes `className` INTO cva. When you override colors via className
 * (e.g. `bg-white text-[#042f2e]`), `twMerge` cannot resolve conflicts
 * between custom theme colors (like `text-primary-foreground` = white) and
 * arbitrary hex values (like `text-[#042f2e]`). Result: both classes stay,
 * white text on white background = invisible button.
 *
 * This component uses a plain `<Link>` with Tailwind classes only — no cva,
 * no twMerge conflicts, no invisible buttons. Used for all the white CTA
 * buttons on dark-background sections across the marketing pages.
 *
 * REGISTRATION vs LOGIN:
 * Set `register={true}` for buttons that recruit NEW users (package
 * selection, "Kom gratis i gang", "Start gratis", "Opret gratis konto").
 * These link to `/login?mode=register` which auto-shows the RegisterForm.
 * Omit it (or `register={false}`) for the "Log ind" button which sends
 * existing users to the login form.
 *
 * PLAN SELECTION:
 * Set `planId="annual"` (or any of 'free'|'monthly'|'annual'|'2year'|'3year')
 * to pass the selected plan through the registration flow. The login page
 * stashes it in localStorage so it survives email verification, and after
 * login the SubscriptionPlansPrompt auto-starts the payment flow for that
 * specific plan instead of showing the full plan chooser.
 */

type Variant = "primary-light" | "outline-light" | "primary-dark";

const variantClasses: Record<Variant, string> = {
  // White button with dark teal text — for dark backgrounds
  "primary-light":
    "bg-white text-[#042f2e] hover:bg-teal-50 hover:text-[#0f766e] shadow-xl",
  // Glassmorphism outline button — for dark backgrounds
  "outline-light":
    "bg-white/10 backdrop-blur-md border border-white/30 text-white hover:bg-white/20 hover:text-white hover:border-white/50",
  // Teal solid button — for light backgrounds
  "primary-dark":
    "bg-[#0d9488] text-white hover:bg-[#0f766e] shadow-lg",
};

interface CTAButtonProps {
  href: string;
  children: ReactNode;
  variant?: Variant;
  className?: string;
  /** Show an arrow icon after the label */
  showArrow?: boolean;
  /**
   * When true, appends ?mode=register to the href so the login page
   * auto-shows the registration form (for new-user CTAs like "Kom gratis
   * i gang", "Start gratis", package selection buttons).
   */
  register?: boolean;
  /**
   * Optional plan ID to pass through the registration → verification →
   * login flow. After login, the SubscriptionPlansPrompt auto-starts the
   * payment flow for this plan instead of showing the full chooser.
   * Valid values: 'free' | 'monthly' | 'annual' | '2year' | '3year'.
   */
  planId?: string;
}

export function CTAButton({
  href,
  children,
  variant = "primary-light",
  className = "",
  showArrow = false,
  register = false,
  planId,
}: CTAButtonProps) {
  const sizeClasses =
    "inline-flex items-center justify-center gap-2 h-12 px-8 text-[15px] font-medium rounded-md transition-all duration-200 whitespace-nowrap shrink-0";

  // Build the query string from register + planId props.
  // register=true  → ?mode=register
  // planId="annual" → &plan=annual
  const params: string[] = [];
  if (register) params.push("mode=register");
  if (planId) params.push(`plan=${planId}`);

  const finalHref =
    params.length > 0
      ? href.includes("?")
        ? `${href}&${params.join("&")}`
        : `${href}?${params.join("&")}`
      : href;

  return (
    <Link
      href={finalHref}
      className={`${sizeClasses} ${variantClasses[variant]} ${className}`}
    >
      {children}
      {showArrow && <ArrowRight className="h-4 w-4" />}
    </Link>
  );
}
