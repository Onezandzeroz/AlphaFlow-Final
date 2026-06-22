'use client';

/**
 * MockCheckoutDialog — visible test checkout for mock mode
 *
 * When the backend runs without FLATPAY_API_KEY (mock mode), the real
 * Frisbii Overlay Checkout SDK can't be used (no real session exists).
 * This dialog provides a visible, interactive checkout experience so
 * the full payment flow can be tested locally:
 *
 *   - Shows plan name + amount (same as production would charge)
 *   - "Betal (simuler succes)" → fires onSuccess (plan activates)
 *   - "Annuller" → fires onCancel
 *   - "Simuler fejl" → fires onError (test error handling)
 *
 * In production (FLATPAY_API_KEY set), this dialog is never shown —
 * the real Frisbii Overlay Checkout opens instead.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useTranslation } from '@/lib/use-translation';
import { CreditCard, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';

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

  const amountDKK = (amountOre / 100).toLocaleString(isDa ? 'da-DK' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const handlePay = () => {
    setProcessing('success');
    // Brief processing delay to simulate the payment being captured
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
    <Dialog open={open} onOpenChange={(o) => !o && handleCancel()}>
      <DialogContent className="sm:max-w-md" style={{ zIndex: 300 }}>
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
              <CreditCard className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <DialogTitle className="text-lg">
                {isDa ? 'Mock Betaling' : 'Mock Payment'}
              </DialogTitle>
              <DialogDescription>
                {isDa
                  ? 'Testtilstand — ingen rigtig betaling'
                  : 'Test mode — no real payment'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Mock badge */}
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {isDa
              ? 'Dette er en simuleret betaling. Sæt FLATPAY_API_KEY for at aktivere rigtig Frisbii checkout.'
              : 'This is a simulated payment. Set FLATPAY_API_KEY to enable real Frisbii checkout.'}
          </span>
        </div>

        {/* Order summary */}
        <div className="space-y-2 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">
              {isDa ? 'Produkt' : 'Product'}
            </span>
            <span className="font-medium text-right">{planDescription}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">
              {isDa ? 'Valuta' : 'Currency'}
            </span>
            <span className="font-medium">{currency}</span>
          </div>
          <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between">
            <span className="font-semibold">
              {isDa ? 'Total' : 'Total'}
            </span>
            <span className="font-bold text-lg text-teal-600 dark:text-teal-400">
              {amountDKK} {currency}
            </span>
          </div>
        </div>

        {/* Processing state */}
        {processing === 'success' && (
          <div className="flex items-center justify-center gap-2 py-2 text-emerald-600 dark:text-emerald-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-medium">
              {isDa ? 'Behandler betaling…' : 'Processing payment…'}
            </span>
          </div>
        )}
        {processing === 'error' && (
          <div className="flex items-center justify-center gap-2 py-2 text-red-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-medium">
              {isDa ? 'Simulerer fejl…' : 'Simulating error…'}
            </span>
          </div>
        )}

        {/* Buttons */}
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={handlePay}
            disabled={processing !== 'idle'}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white"
          >
            {processing === 'success' ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-2" />
            )}
            {isDa ? `Betal ${amountDKK} ${currency} (simuler succes)` : `Pay ${amountDKK} ${currency} (simulate success)`}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleSimulateError}
              disabled={processing !== 'idle'}
              className="flex-1"
            >
              {isDa ? 'Simuler fejl' : 'Simulate error'}
            </Button>
            <Button
              variant="ghost"
              onClick={handleCancel}
              disabled={processing !== 'idle'}
              className="flex-1"
            >
              {isDa ? 'Annuller' : 'Cancel'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
