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

import { useEffect, useState } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { Sparkles, PartyPopper } from 'lucide-react';

type ResultType = 'success' | 'error' | 'cancel';

type Phase = 'icon' | 'fading' | 'welcome';

interface PaymentResultOverlayProps {
  open: boolean;
  type: ResultType;
  planName?: string;
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
  const [phase, setPhase] = useState<Phase>('icon');

  useEffect(() => {
    if (!open) return;

    if (type === 'success') {
      // Phase 1: icon visible for 2.8s
      // Phase 2: fade out (0.5s)
      // Phase 3: welcome card visible
      // Phase 4: auto-dismiss at 6.5s
      const t1 = setTimeout(() => setPhase('fading'), 2800);
      const t2 = setTimeout(() => setPhase('welcome'), 3300);
      const dismiss = setTimeout(() => onDismiss(), 6500);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(dismiss);
      };
    }

    // Error/cancel: show icon 2.5s then dismiss
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

  // Icon phase fades out during 'fading' phase, hidden during 'welcome'
  const iconVisible = phase === 'icon';
  const iconFading = phase === 'fading';
  const showWelcome = phase === 'welcome';

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4
        bg-black/60 backdrop-blur-md cursor-pointer"
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

      {/* ── Welcome card (Phase 3) — full size, matches plans prompt ── */}
      {isSuccess && showWelcome && planName && (
        <div
          className="relative w-full max-w-[1280px] aspect-[16/9] max-h-[95vh]
            rounded-t-3xl sm:rounded-2xl overflow-hidden
            border border-[#1a2d4d]/60
            bg-[#0c1a33]
            shadow-2xl shadow-black/60
            animate-welcome-in
            mx-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Inner card — matches plans prompt structure */}
          <div className="relative flex flex-col h-full overflow-hidden bg-[#0c1a33] border border-[#1a2d4d]/60 sm:rounded-2xl rounded-t-3xl">
            {/* Background dot grid */}
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
