'use client';

/**
 * PaymentResultOverlay — fullscreen animated payment result feedback
 *
 * Shows a large animated checkmark (success) or X (error/cancel) on a
 * semi-transparent overlay, followed by a "Welcome to {plan}" card on
 * success. Matches the subscription-plans-prompt dark navy + teal design.
 *
 * Layout: the icon + title stay fixed in the center. The welcome card
 * appears as an ABSOLUTE overlay IN FRONT of the icon (not below it),
 * so adding it doesn't shift the icon's position — no jarring jump.
 *
 * Flow:
 *   1. User completes/cancels payment → caller sets result state
 *   2. Overlay shows: icon animation (0.8s) → title (1.1s)
 *   3. Success: welcome card fades in FRONT of icon (1.2s), covering it
 *   4. Auto-dismiss: success 3.5s, error/cancel 2.5s — or click anywhere
 */

import { useEffect, useState } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { Sparkles, PartyPopper } from 'lucide-react';

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

  useEffect(() => {
    if (!open) return;

    if (type === 'success') {
      const t = setTimeout(() => setShowWelcome(true), 1200);
      const dismiss = setTimeout(() => onDismiss(), 3500);
      return () => {
        clearTimeout(t);
        clearTimeout(dismiss);
      };
    }

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
    // Fullscreen semi-transparent overlay — z-[400] above everything.
    // No animate-in on this container (avoids re-trigger blink on re-render);
    // the inner content animates instead.
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4
        bg-black/60 backdrop-blur-md cursor-pointer"
      onClick={onDismiss}
    >
      {/* ── Relative container — icon + title stay centered, card overlaps ── */}
      <div
        className="relative flex flex-col items-center gap-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Animated icon (stays fixed in position) ── */}
        <div className="relative flex items-center justify-center">
          {/* Pulsing glow */}
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

        {/* ── Title + subtitle (fades in after icon) ── */}
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

        {/* ── Welcome card (success only) — ABSOLUTE, overlaps icon ── */}
        {/* Sized to match the plans prompt (max-w-[1280px], 16:9) so it
            feels like a natural replacement of the plans prompt. Fades
            in IN FRONT of the icon without shifting it. */}
        {isSuccess && showWelcome && planName && (
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
              w-full max-w-[1280px] aspect-[16/9] max-h-[95vh]
              rounded-t-3xl sm:rounded-2xl overflow-hidden
              border border-[#1a2d4d]/60
              bg-[#0c1a33]
              shadow-2xl shadow-black/60
              animate-fade-in-scale-overlay z-10"
          >
            {/* Inner card — matches plans prompt structure */}
            <div className="relative flex flex-col h-full overflow-hidden bg-[#0c1a33] border border-[#1a2d4d]/60 sm:rounded-2xl rounded-t-3xl">
              {/* Background dot grid (matches plans prompt) */}
              <div
                className="absolute inset-0 opacity-[0.08] pointer-events-none"
                style={{
                  backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
                  backgroundSize: '24px 24px',
                }}
              />

              {/* ── Gradient header band (top ~30%) ── */}
              <div className="relative overflow-hidden h-[32%]
                bg-gradient-to-br from-[#0d9488] via-[#0f766e] to-[#134e4a]">
                <div className="absolute inset-0 opacity-25 pointer-events-none
                  bg-[radial-gradient(circle_at_top_right,rgba(45,212,191,0.6),transparent_60%)]" />
                <div className="relative h-full flex items-center justify-center px-6 sm:px-10 gap-5">
                  <div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl
                    bg-white/15 border border-white/25 backdrop-blur-sm shrink-0">
                    <Sparkles className="h-8 w-8 sm:h-10 sm:w-10 text-white" />
                  </div>
                  <div className="min-w-0 text-center sm:text-left">
                    <p className="text-white/70 text-sm sm:text-base uppercase tracking-wider font-semibold">
                      {isDa ? 'Velkommen til' : 'Welcome to'}
                    </p>
                    <h3 className="text-3xl sm:text-5xl font-bold text-white tracking-tight truncate">
                      AlphaFlow {planName}
                    </h3>
                  </div>
                </div>
              </div>

              {/* ── Card body — fills remaining ~68% ── */}
              <div className="relative h-[68%] px-6 sm:px-10 py-6 sm:py-8
                flex flex-col items-center justify-center text-center">
                <p className="text-white/80 text-base sm:text-xl leading-relaxed max-w-2xl">
                  {isDa
                    ? 'Tak for din tillid. Du har nu adgang til alle funktioner i din nye plan. God arbejdslyst!'
                    : 'Thank you for your trust. You now have access to all features in your new plan. Enjoy!'}
                </p>
                <div className="mt-5 sm:mt-7 flex items-center justify-center gap-2.5 text-[#2dd4bf]">
                  <PartyPopper className="h-5 w-5 sm:h-6 sm:w-6" />
                  <span className="text-sm sm:text-base font-semibold uppercase tracking-widest">
                    {isDa ? 'Abonnement aktiv' : 'Subscription active'}
                  </span>
                  <PartyPopper className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Click to dismiss hint ── */}
        <p className="text-white/30 text-xs animate-fade-in delay-[2000ms]">
          {isDa ? '(Klik for at fortsætte)' : '(Click to continue)'}
        </p>
      </div>

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
        @keyframes fade-in-scale-overlay {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.92); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
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
        .animate-fade-in-scale-overlay {
          opacity: 0;
          animation: fade-in-scale-overlay 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        .delay-\\[600ms\\] { animation-delay: 600ms; }
        .delay-\\[1100ms\\] { animation-delay: 1100ms; }
        .delay-\\[2000ms\\] { animation-delay: 2000ms; }
      `}</style>
    </div>
  );
}
