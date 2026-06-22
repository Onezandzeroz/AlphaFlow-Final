'use client';

/**
 * PaymentResultOverlay — fullscreen animated payment result feedback
 *
 * SEQUENTIAL flow (not simultaneous):
 *   Phase 1 (0–2.8s): Checkmark/X icon animation + title — visible 2.8s
 *   Phase 2 (2.8–3.3s): Icon + title fade OUT
 *   Phase 3 (3.3s+): Welcome card fades IN (full size, replaces icon)
 *   Phase 4 (6.5s): Auto-dismiss (or click)
 *
 * For error/cancel: icon shows 2.5s then auto-dismisses (no welcome card).
 *
 * The welcome card is sized to match the plans prompt (max-w-[1280px], 16:9)
 * and uses the same design language (dark navy + teal).
 */

import { useEffect, useState, memo } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { Sparkles, PartyPopper, Check } from 'lucide-react';

type ResultType = 'success' | 'error' | 'cancel';

type Phase = 'icon' | 'fading' | 'welcome';

interface PlanFeature {
  da: string;
  en: string;
}

interface PaymentResultOverlayProps {
  open: boolean;
  type: ResultType;
  planName?: string;
  /** Plan tagline / short description (e.g. "AI-rådgivning & stabil pris") */
  planTagline?: string;
  /** Plan price display (e.g. "169 kr./md.") */
  planPrice?: string;
  /** Binding period (e.g. "12 måneders binding") */
  planBinding?: string;
  /** Key features to highlight in the welcome card */
  planFeatures?: PlanFeature[];
  onDismiss: () => void;
}

// Memoized so the parent (subscription-plans-prompt) re-rendering on
// auth:refresh doesn't cause this component to re-render and restart
// its animation. Props are stable (open, type, planName, onDismiss are
// all either primitives or stable callbacks).
function PaymentResultOverlayComponent({
  open,
  type,
  planName,
  planTagline,
  planPrice,
  planBinding,
  planFeatures,
  onDismiss,
}: PaymentResultOverlayProps) {
  const { language } = useTranslation();
  const isDa = language === 'da';
  const [phase, setPhase] = useState<Phase>('icon');

  useEffect(() => {
    if (!open) return;

    if (type === 'success') {
      // Phase 1: icon visible for 1.5s
      // Phase 2: fade out (0.5s)
      // Phase 3: welcome card visible for 15s (user can click to close earlier)
      // Phase 4: auto-dismiss at 17s (2s icon + 15s welcome)
      const t1 = setTimeout(() => setPhase('fading'), 1500);
      const t2 = setTimeout(() => setPhase('welcome'), 2000);
      const dismiss = setTimeout(() => onDismiss(), 17000);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(dismiss);
      };
    }

    // Error/cancel: icon visible 1.5s → fade out (0.5s) → dismiss at 2.0s
    const t1 = setTimeout(() => setPhase('fading'), 1500);
    const dismiss = setTimeout(() => onDismiss(), 2000);
    return () => {
      clearTimeout(t1);
      clearTimeout(dismiss);
    };
  }, [open, type, onDismiss]);

  if (!open) return null;

  const isSuccess = type === 'success';
  const isError = type === 'error';
  const isCancel = type === 'cancel';

  const title = isSuccess
    ? isDa
      ? 'Betaling gennemført!'
      : 'Payment successful!'
    : isError
      ? isDa
        ? 'Betaling mislykkedes'
        : 'Payment failed'
      : isDa
        ? 'Betaling annulleret'
        : 'Payment cancelled';

  const subtitle = isSuccess
    ? isDa
      ? 'Dit abonnement er nu aktiveret'
      : 'Your subscription is now active'
    : isError
      ? isDa
        ? 'Der opstod en fejl. Prøv igen senere.'
        : 'An error occurred. Please try again later.'
      : isDa
        ? 'Du har annulleret betalingen'
        : 'You cancelled the payment';

  // Icon phase fades out during 'fading' phase, hidden during 'welcome'
  const iconVisible = phase === 'icon';
  const iconFading = phase === 'fading';
  const showWelcome = phase === 'welcome';

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4
        bg-black/70 backdrop-blur-sm cursor-pointer"
      onClick={onDismiss}
    >
      {/* ── Icon + title (Phase 1 & 2) — fades out before welcome card ── */}
      <div
        className={`absolute flex flex-col items-center gap-6 transition-opacity duration-500
          ${iconVisible ? 'opacity-100' : iconFading ? 'opacity-0' : 'opacity-0 pointer-events-none'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Animated icon */}
        <div className="relative flex items-center justify-center">
          <div
            className={`absolute inset-0 rounded-full blur-2xl animate-ping-slow
              ${isSuccess ? 'bg-emerald-500/30' : 'bg-red-500/30'}`}
          />
          <div
            className={`relative flex h-32 w-32 sm:h-40 sm:w-40 items-center justify-center
              rounded-full border-4 animate-scale-in
              ${isSuccess
                ? 'bg-emerald-500/10 border-emerald-500/40 shadow-2xl shadow-emerald-500/20'
                : 'bg-red-500/10 border-red-500/40 shadow-2xl shadow-red-500/20'
              }`}
          >
            <svg
              viewBox="0 0 52 52"
              className="h-20 w-20 sm:h-24 sm:w-24"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {isSuccess ? (
                <path className="checkmark-path" d="M14 27 L22 35 L38 17" stroke="#10b981" />
              ) : (
                <>
                  <path className="x-path-1" d="M18 18 L34 34" stroke="#ef4444" />
                  <path className="x-path-2" d="M34 18 L18 34" stroke="#ef4444" />
                </>
              )}
            </svg>
          </div>
        </div>

        {/* Title + subtitle */}
        <div className="text-center animate-fade-in-up delay-[300ms]">
          <h2
            className={`text-2xl sm:text-3xl font-bold tracking-tight
              ${isSuccess ? 'text-emerald-400' : 'text-red-400'}`}
          >
            {title}
          </h2>
          <p className="text-white/60 text-sm sm:text-base mt-2">{subtitle}</p>
        </div>
      </div>

      {/* ── Welcome card (Phase 3) — magazine-style layout ── */}
      {/* Card background is semi-transparent (bg-[#0c1a33]/80) so the dark
          overlay behind shows through. Text stays fully opaque for readability. */}
      {isSuccess && showWelcome && planName && (
        <div
          className="relative w-full max-w-[1280px] aspect-[16/9] max-h-[95vh]
            rounded-t-3xl sm:rounded-3xl overflow-hidden
            border border-[#1a2d4d]/60
            bg-[#0c1a33]/80 backdrop-blur-md
            shadow-2xl shadow-black/60
            animate-welcome-in
            mx-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Inner card */}
          <div className="relative flex h-full overflow-hidden bg-transparent">
            {/* Background dot grid */}
            <div
              className="absolute inset-0 opacity-[0.06] pointer-events-none"
              style={{
                backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />

            {/* ── LEFT PANEL (40%) — hero / brand side ── */}
            {/* Gradient with 85% opacity so the dark overlay behind shows through */}
            <div className="relative w-[40%] flex flex-col justify-between p-8 sm:p-12 overflow-hidden
              bg-gradient-to-br from-[#0d9488]/85 via-[#0f766e]/85 to-[#134e4a]/85">
              {/* Radial glow */}
              <div className="absolute inset-0 opacity-30 pointer-events-none
                bg-[radial-gradient(circle_at_top_right,rgba(45,212,191,0.7),transparent_55%)]" />
              {/* Decorative large faded icon */}
              <Sparkles className="absolute -bottom-8 -right-8 h-48 w-48 text-white/5 pointer-events-none" />

              {/* Top: badge */}
              <div className="relative">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
                  bg-white/15 border border-white/25 backdrop-blur-sm
                  text-white text-xs sm:text-sm font-semibold uppercase tracking-widest">
                  <Sparkles className="h-3.5 w-3.5" />
                  {isDa ? 'Abonnement aktiv' : 'Subscription active'}
                </span>
              </div>

              {/* Middle: plan name (hero) */}
              <div className="relative">
                <p className="text-white/60 text-sm sm:text-base uppercase tracking-[0.2em] font-medium mb-2">
                  {isDa ? 'Velkommen til' : 'Welcome to'}
                </p>
                <h3 className="text-5xl sm:text-7xl font-black text-white tracking-tight leading-[0.95]">
                  AlphaFlow
                </h3>
                <p className="mt-2 text-3xl sm:text-5xl font-bold text-[#2dd4bf] tracking-tight">
                  {planName}
                </p>
                {planTagline && (
                  <p className="mt-4 text-white/70 text-base sm:text-lg italic leading-snug max-w-xs">
                    {isDa ? planTagline : planTagline}
                  </p>
                )}
              </div>

              {/* Bottom: price + binding */}
              <div className="relative flex items-end gap-6">
                {planPrice && (
                  <div>
                    <p className="text-white/50 text-xs uppercase tracking-wider mb-0.5">
                      {isDa ? 'Pris' : 'Price'}
                    </p>
                    <p className="text-2xl sm:text-3xl font-bold text-white">{planPrice}</p>
                  </div>
                )}
                {planBinding && (
                  <div>
                    <p className="text-white/50 text-xs uppercase tracking-wider mb-0.5">
                      {isDa ? 'Binding' : 'Commitment'}
                    </p>
                    <p className="text-sm sm:text-base font-medium text-white/80">{planBinding}</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── RIGHT PANEL (60%) — features + message ── */}
            <div className="relative w-[60%] flex flex-col justify-between p-8 sm:p-12">
              {/* Top: headline message */}
              <div>
                <p className="text-[#2dd4bf] text-xs sm:text-sm font-bold uppercase tracking-[0.25em] mb-3">
                  {isDa ? 'Du er nu i gang' : "You're all set"}
                </p>
                <h4 className="text-2xl sm:text-4xl font-bold text-white tracking-tight leading-tight">
                  {isDa
                    ? 'Tak for din tillid.'
                    : 'Thank you for your trust.'}
                </h4>
                <p className="mt-2 text-white/60 text-base sm:text-lg leading-relaxed max-w-md">
                  {isDa
                    ? 'Du har nu adgang til alle funktioner i din nye plan. Her er hvad du kan se frem til:'
                    : 'You now have access to all features in your new plan. Here is what you can look forward to:'}
                </p>
              </div>

              {/* Middle: feature highlights */}
              {planFeatures && planFeatures.length > 0 && (
                <div className="my-6 grid gap-3 sm:gap-4">
                  {planFeatures.slice(0, 4).map((feat, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 sm:gap-4
                        rounded-xl bg-white/[0.03] border border-white/[0.06]
                        px-4 sm:px-5 py-2.5 sm:py-3"
                    >
                      <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg
                        bg-[#0d9488]/20 border border-[#0d9488]/30 shrink-0">
                        <Check className="h-4 w-4 sm:h-5 sm:w-5 text-[#2dd4bf]" />
                      </div>
                      <span className="text-white/85 text-sm sm:text-base font-medium leading-snug">
                        {isDa ? feat.da : feat.en}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Bottom: celebratory footer */}
              <div className="flex items-center gap-3 pt-4 border-t border-white/[0.08]">
                <PartyPopper className="h-5 w-5 sm:h-6 sm:w-6 text-[#2dd4bf] shrink-0" />
                <p className="text-white/50 text-sm sm:text-base">
                  {isDa
                    ? 'God arbejdslyst! Vi er her, hvis du har spørgsmål.'
                    : 'Enjoy! We are here if you have any questions.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Click to dismiss hint ── */}
      <p className="absolute bottom-8 text-white/30 text-xs animate-fade-in delay-[2000ms]">
        {isDa ? '(Klik for at fortsætte)' : '(Click to continue)'}
      </p>

      {/* ── Inline keyframes ── */}
      <style>{`
        @keyframes draw-checkmark {
          0% { stroke-dashoffset: 48; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes draw-x-1 {
          0% { stroke-dashoffset: 24; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes draw-x-2 {
          0%, 40% { stroke-dashoffset: 24; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes ping-slow {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        @keyframes scale-in {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes fade-in-up {
          0% { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes welcome-in {
          0% { opacity: 0; transform: scale(0.95) translateY(20px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes fade-in {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .checkmark-path {
          stroke-dasharray: 48;
          stroke-dashoffset: 48;
          animation: draw-checkmark 0.8s ease-out 0.3s forwards;
        }
        .x-path-1 {
          stroke-dasharray: 24;
          stroke-dashoffset: 24;
          animation: draw-x-1 0.4s ease-out 0.3s forwards;
        }
        .x-path-2 {
          stroke-dasharray: 24;
          stroke-dashoffset: 24;
          animation: draw-x-2 0.6s ease-out 0.3s forwards;
        }
        .animate-ping-slow {
          animation: ping-slow 1.8s ease-out infinite;
        }
        .animate-scale-in {
          animation: scale-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        .animate-fade-in-up {
          opacity: 0;
          animation: fade-in-up 0.5s ease-out forwards;
        }
        .animate-welcome-in {
          opacity: 0;
          animation: welcome-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        .animate-fade-in {
          opacity: 0;
          animation: fade-in 0.5s ease-out forwards;
        }
        .delay-\\[300ms\\] { animation-delay: 300ms; }
        .delay-\\[2000ms\\] { animation-delay: 2000ms; }
      `}</style>
    </div>
  );
}

// Export memoized component — prevents parent re-renders (from auth:refresh)
// from restarting the animation and causing the welcome card to blink.
export const PaymentResultOverlay = memo(PaymentResultOverlayComponent);
