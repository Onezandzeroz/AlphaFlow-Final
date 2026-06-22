'use client';

/**
 * PaymentResultOverlay — fullscreen animated payment result feedback
 *
 * Shows a large animated checkmark (success) or X (error/cancel) on a
 * semi-transparent overlay, followed by a "Welcome to {plan}" card on
 * success. Matches the subscription-plans-prompt dark navy + teal design.
 *
 * Flow:
 *   1. User completes/cancels payment → caller sets result state
 *   2. Overlay shows: icon animation (1.2s) → welcome card (success only)
 *   3. Auto-dismisses after 3.5s (success) or 2.5s (error/cancel),
 *      or on click anywhere
 *
 * The SVG animations use stroke-dashoffset for a "drawing" effect —
 * no external animation library needed (pure CSS keyframes).
 */

import { useEffect, useState } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { Check, X, Sparkles, PartyPopper } from 'lucide-react';

type ResultType = 'success' | 'error' | 'cancel';

interface PaymentResultOverlayProps {
  /** Whether the overlay is showing */
  open: boolean;
  /** Result type — determines icon + welcome card */
  type: ResultType;
  /** Plan display name for the welcome card (e.g. "Pro", "Månedlig") */
  planName?: string;
  /** Called when the overlay auto-dismisses or user clicks to dismiss */
  onDismiss: () => void;
}

export function PaymentResultOverlay({
  open,
  type,
  planName,
  onDismiss,
}: PaymentResultOverlayProps) {
  const { language } = useTranslation();
  const isDa = language === 'da';
  const [showWelcome, setShowWelcome] = useState(false);

  // Auto-show welcome card + auto-dismiss timers.
  // The component is keyed by `open` from the parent so it re-mounts
  // fresh each time it opens (resetting showWelcome to false).
  useEffect(() => {
    if (!open) return;

    if (type === 'success') {
      // Welcome card appears after the checkmark draws (1.2s)
      const t = setTimeout(() => setShowWelcome(true), 1200);
      // Auto-dismiss after welcome card has been visible (3.5s total)
      const dismiss = setTimeout(() => onDismiss(), 3500);
      return () => {
        clearTimeout(t);
        clearTimeout(dismiss);
      };
    }

    // Error/cancel: auto-dismiss after 2.5s
    const dismiss = setTimeout(() => onDismiss(), 2500);
    return () => clearTimeout(dismiss);
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

  return (
    // Fullscreen semi-transparent overlay — z-[400] above everything
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4
        bg-black/60 backdrop-blur-md animate-in fade-in duration-200 cursor-pointer"
      onClick={onDismiss}
    >
      <div className="flex flex-col items-center gap-6" onClick={(e) => e.stopPropagation()}>
        {/* ── Animated icon ── */}
        <div className="relative flex items-center justify-center">
          {/* Pulsing glow behind the icon */}
          <div
            className={`absolute inset-0 rounded-full blur-2xl animate-ping-slow
              ${isSuccess ? 'bg-emerald-500/30' : 'bg-red-500/30'}`}
          />
          {/* Circle background */}
          <div
            className={`relative flex h-32 w-32 sm:h-40 sm:w-40 items-center justify-center
              rounded-full border-4 animate-scale-in
              ${isSuccess
                ? 'bg-emerald-500/10 border-emerald-500/40 shadow-2xl shadow-emerald-500/20'
                : 'bg-red-500/10 border-red-500/40 shadow-2xl shadow-red-500/20'
              }`}
          >
            {/* SVG animated checkmark or X */}
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
                // Checkmark path — draws via stroke-dashoffset animation
                <path
                  className="checkmark-path"
                  d="M14 27 L22 35 L38 17"
                  stroke="#10b981"
                />
              ) : (
                // X path — two strokes that draw in sequence
                <>
                  <path
                    className="x-path-1"
                    d="M18 18 L34 34"
                    stroke="#ef4444"
                  />
                  <path
                    className="x-path-2"
                    d="M34 18 L18 34"
                    stroke="#ef4444"
                  />
                </>
              )}
            </svg>
          </div>
        </div>

        {/* ── Title + subtitle ── */}
        <div
          className={`text-center animate-fade-in-up
            ${isSuccess ? 'delay-[1100ms]' : 'delay-[600ms]'}`}
        >
          <h2
            className={`text-2xl sm:text-3xl font-bold tracking-tight
              ${isSuccess ? 'text-emerald-400' : 'text-red-400'}`}
          >
            {title}
          </h2>
          <p className="text-white/60 text-sm sm:text-base mt-2">{subtitle}</p>
        </div>

        {/* ── Welcome card (success only) ── */}
        {isSuccess && showWelcome && planName && (
          <div
            className="relative w-full max-w-md rounded-2xl overflow-hidden
              border border-[#1e3a5f]/60
              bg-gradient-to-br from-[#0a1628]/95 to-[#0e1f3d]/95
              shadow-2xl shadow-black/50
              animate-fade-in-up-scale"
          >
            {/* Decorative gradient header */}
            <div className="relative overflow-hidden
              bg-gradient-to-br from-[#0d9488] via-[#0f766e] to-[#134e4a]
              px-6 py-5">
              <div className="absolute inset-0 opacity-25 pointer-events-none
                bg-[radial-gradient(circle_at_top_right,rgba(45,212,191,0.6),transparent_60%)]" />
              <div className="relative flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl
                  bg-white/15 border border-white/25 backdrop-blur-sm">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-white/70 text-xs uppercase tracking-wider font-semibold">
                    {isDa ? 'Velkommen til' : 'Welcome to'}
                  </p>
                  <h3 className="text-xl font-bold text-white tracking-tight">
                    AlphaFlow {planName}
                  </h3>
                </div>
              </div>
            </div>

            {/* Card body */}
            <div className="px-6 py-5 text-center">
              <p className="text-white/70 text-sm leading-relaxed">
                {isDa
                  ? 'Tak for din tillid. Du har nu adgang til alle funktioner i din nye plan. God arbejdslyst!'
                  : 'Thank you for your trust. You now have access to all features in your new plan. Enjoy!'}
              </p>
              <div className="mt-4 flex items-center justify-center gap-2 text-[#2dd4bf]">
                <PartyPopper className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">
                  {isDa ? 'Abonnement aktiv' : 'Subscription active'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Click to dismiss hint ── */}
        <p className="text-white/30 text-xs animate-fade-in delay-[2000ms]">
          {isDa ? '(Klik for at fortsætte)' : '(Click to continue)'}
        </p>
      </div>

      {/* ── Inline keyframes for SVG drawing animations ── */}
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
        @keyframes fade-in-up-scale {
          0% { opacity: 0; transform: translateY(20px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
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
        .animate-fade-in-up-scale {
          opacity: 0;
          animation: fade-in-up-scale 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        .delay-\\[600ms\\] { animation-delay: 600ms; }
        .delay-\\[1100ms\\] { animation-delay: 1100ms; }
        .delay-\\[2000ms\\] { animation-delay: 2000ms; }
      `}</style>
    </div>
  );
}
