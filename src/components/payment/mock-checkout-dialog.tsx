'use client';

/**
 * MockCheckoutDialog — visible test checkout for mock mode
 *
 * Custom overlay (not shadcn Dialog) styled to match the subscription
 * plans prompt: dark navy background, teal accents, amber highlights.
 * Renders ABOVE the plans prompt (z-[300] vs z-[200]) with a
 * semi-transparent blurred backdrop so the plans stay visible behind.
 *
 * Sized ~2x larger than the previous modal (sm:max-w-2xl) to feel
 * substantial and match the plans prompt's visual weight.
 *
 * In production (FLATPAY_API_KEY set), this dialog is never shown —
 * the real Frisbii Overlay Checkout opens instead.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/use-translation';
import { CreditCard, Loader2, AlertTriangle, CheckCircle2, X, Lock } from 'lucide-react';

interface MockCheckoutDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Plan description (from plan-pricing) */
  planDescription: string;
  /** Amount in øre (1 DKK = 100 øre) */
  amountOre: number;
  /** Currency code, e.g. "DKK" */
  currency: string;
  /** Called when the user clicks "Betal" (simulated success) */
  onSuccess: () => void;
  /** Called when the user clicks "Annuller" */
  onCancel: () => void;
  /** Called when the user clicks "Simuler fejl" */
  onError: () => void;
}

export function MockCheckoutDialog({
  open,
  planDescription,
  amountOre,
  currency,
  onSuccess,
  onCancel,
  onError,
}: MockCheckoutDialogProps) {
  const { language } = useTranslation();
  const isDa = language === 'da';
  const [processing, setProcessing] = useState<'idle' | 'success' | 'error'>('idle');

  if (!open) return null;

  const amountDKK = (amountOre / 100).toLocaleString(isDa ? 'da-DK' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const handlePay = () => {
    setProcessing('success');
    setTimeout(() => {
      onSuccess();
    }, 800);
  };

  const handleSimulateError = () => {
    setProcessing('error');
    setTimeout(() => {
      onError();
    }, 800);
  };

  const handleCancel = () => {
    setProcessing('idle');
    onCancel();
  };

  return (
    // Fixed overlay — z-[300] sits above the plans prompt (z-[200]).
    // Semi-transparent + blur so the plans stay visible but de-emphasised.
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4
        bg-black/40 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        // Click on backdrop (not content) cancels
        if (e.target === e.currentTarget) handleCancel();
      }}
    >
      {/* ── Checkout card — dark navy, teal accents, 2x size ── */}
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto
          rounded-2xl border border-[#1e3a5f]/60
          bg-[#0a1628]/95 dark:bg-[#0a1628]/95
          shadow-2xl shadow-black/50
          animate-in zoom-in-95 fade-in duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header band — teal gradient ── */}
        <div className="relative overflow-hidden rounded-t-2xl
          bg-gradient-to-br from-[#0d9488] via-[#0f766e] to-[#134e4a]
          px-6 py-5 sm:px-8 sm:py-6">
          <div className="absolute inset-0 opacity-20 pointer-events-none
            bg-[radial-gradient(circle_at_top_right,rgba(45,212,191,0.4),transparent_60%)]" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl
                bg-white/10 border border-white/20 backdrop-blur-sm">
                <CreditCard className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  {isDa ? 'Betalingsbekræftelse' : 'Payment Checkout'}
                </h2>
                <p className="text-white/70 text-sm mt-0.5">
                  {isDa ? 'Testtilstand — ingen rigtig betaling' : 'Test mode — no real payment'}
                </p>
              </div>
            </div>
            <button
              onClick={handleCancel}
              disabled={processing !== 'idle'}
              className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10
                transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label={isDa ? 'Luk' : 'Close'}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ── Mock badge ── */}
        <div className="px-6 sm:px-8 pt-4">
          <div className="flex items-start gap-2.5 rounded-lg
            bg-[#f59e0b]/10 border border-[#f59e0b]/30 px-4 py-3
            text-sm text-[#fbbf24]">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="leading-snug">
              {isDa
                ? 'Dette er en simuleret betaling. Sæt FLATPAY_API_KEY i .env for at aktivere rigtig Frisbii checkout med kortbetaling.'
                : 'This is a simulated payment. Set FLATPAY_API_KEY in .env to enable real Frisbii checkout with card payment.'}
            </span>
          </div>
        </div>

        {/* ── Order summary ── */}
        <div className="px-6 sm:px-8 py-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">
            {isDa ? 'Ordreoversigt' : 'Order Summary'}
          </h3>
          <div className="rounded-xl border border-[#1e3a5f]/50 bg-[#0e1f3d]/60 divide-y divide-[#1e3a5f]/40">
            <div className="flex justify-between items-start px-5 py-4">
              <div>
                <p className="text-white/50 text-xs uppercase tracking-wide">
                  {isDa ? 'Produkt' : 'Product'}
                </p>
                <p className="font-medium text-white mt-1">{planDescription}</p>
              </div>
            </div>
            <div className="flex justify-between items-center px-5 py-4">
              <span className="text-white/50 text-sm">
                {isDa ? 'Valuta' : 'Currency'}
              </span>
              <span className="font-medium text-white/80">{currency}</span>
            </div>
            <div className="flex justify-between items-center px-5 py-5 bg-[#0d9488]/5">
              <span className="font-bold text-white text-lg">
                {isDa ? 'Total' : 'Total'}
              </span>
              <div className="text-right">
                <span className="font-bold text-2xl sm:text-3xl text-[#2dd4bf] tracking-tight">
                  {amountDKK}
                </span>
                <span className="text-[#2dd4bf]/70 font-semibold ml-1.5">{currency}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Processing state ── */}
        {processing === 'success' && (
          <div className="px-6 sm:px-8 pb-2">
            <div className="flex items-center justify-center gap-2.5 py-3
              rounded-lg bg-emerald-500/10 border border-emerald-500/30
              text-emerald-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm font-medium">
                {isDa ? 'Behandler betaling…' : 'Processing payment…'}
              </span>
            </div>
          </div>
        )}
        {processing === 'error' && (
          <div className="px-6 sm:px-8 pb-2">
            <div className="flex items-center justify-center gap-2.5 py-3
              rounded-lg bg-red-500/10 border border-red-500/30
              text-red-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm font-medium">
                {isDa ? 'Simulerer fejl…' : 'Simulating error…'}
              </span>
            </div>
          </div>
        )}

        {/* ── Action buttons ── */}
        <div className="px-6 sm:px-8 pb-6 pt-2 space-y-3">
          <Button
            onClick={handlePay}
            disabled={processing !== 'idle'}
            className="w-full h-12 text-base font-semibold
              bg-[#0d9488] hover:bg-[#0f766e] active:bg-[#115e59]
              text-white border border-[#0d9488]/50
              shadow-lg shadow-[#0d9488]/20 hover:shadow-[#0d9488]/30
              transition-all disabled:opacity-60"
          >
            {processing === 'success' ? (
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
            ) : (
              <CheckCircle2 className="h-5 w-5 mr-2" />
            )}
            {isDa
              ? `Betal ${amountDKK} ${currency} (simuler succes)`
              : `Pay ${amountDKK} ${currency} (simulate success)`}
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              onClick={handleSimulateError}
              disabled={processing !== 'idle'}
              className="h-10 border-[#1e3a5f]/60 bg-[#0e1f3d]/40 text-white/70
                hover:bg-[#1e3a5f]/30 hover:text-white hover:border-[#1e3a5f]
                transition-colors"
            >
              {isDa ? 'Simuler fejl' : 'Simulate error'}
            </Button>
            <Button
              variant="ghost"
              onClick={handleCancel}
              disabled={processing !== 'idle'}
              className="h-10 text-white/50 hover:text-white hover:bg-white/5
                transition-colors"
            >
              {isDa ? 'Annuller' : 'Cancel'}
            </Button>
          </div>
        </div>

        {/* ── Security footer ── */}
        <div className="px-6 sm:px-8 pb-5 pt-1 border-t border-[#1e3a5f]/30">
          <div className="flex items-center justify-center gap-2 text-white/25 text-xs">
            <Lock className="h-3 w-3" />
            <span>
              {isDa
                ? 'Mock mode — betaling simuleres lokalt'
                : 'Mock mode — payment simulated locally'}
            </span>
            <Lock className="h-3 w-3" />
          </div>
        </div>
      </div>
    </div>
  );
}
