'use client';

import { useState, useEffect, useRef } from 'react';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useTranslation } from '@/lib/use-translation';

interface ReactivationScreenProps {
  token: string;
  onGoToLogin: () => void;
}

/**
 * ReactivationScreen
 *
 * Shown when a (logged-out, deactivated) user clicks the reactivation link in
 * the deactivation email. Auto-POSTs the token to /api/auth/reactivate-account
 * and shows success/error states. On success, the user is invited to log in.
 */
export function ReactivationScreen({ token, onGoToLogin }: ReactivationScreenProps) {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const { isDanish } = useTranslation();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000); // 15s timeout

    (async () => {
      try {
        const response = await fetch('/api/auth/reactivate-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (cancelled) return;

        let data: Record<string, unknown>;
        try {
          data = await response.json();
        } catch {
          setStatus('error');
          setErrorMessage(isDanish ? 'Uventet svar fra serveren.' : 'Unexpected server response.');
          return;
        }

        if (cancelled) return;

        if (response.ok) {
          setStatus('success');
        } else {
          setStatus('error');
          setErrorMessage((data.error as string) || (isDanish ? 'Kunne ikke genaktivere kontoen' : 'Could not reactivate the account'));
        }
      } catch (err) {
        clearTimeout(timeout);
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'AbortError') {
          setStatus('error');
          setErrorMessage(isDanish ? 'Forespørgsel tog for lang tid. Prøv igen.' : 'Request timed out. Please try again.');
        } else {
          setStatus('error');
          setErrorMessage(isDanish ? 'Netværksfejl. Prøv igen.' : 'Network error. Please try again.');
        }
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [token, isDanish]);

  return (
    <div className="w-full max-w-md flex flex-col items-center">
      <div className="w-full relative">
        {/* Top accent bar */}
        <div className="login-accent-bar" />
        <div className="bg-white/80 backdrop-blur-xl shadow-xl rounded-2xl p-6 border border-white/60 overflow-hidden">
          {status === 'loading' && (
            <div className="space-y-5 py-6 text-center">
              <div className="flex justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-teal-600" />
              </div>
              <p className="text-sm text-slate-600">
                {isDanish ? 'Genaktiverer din konto…' : 'Reactivating your account…'}
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-5 py-2">
              {/* Success icon */}
              <div className="flex justify-center">
                <div className="relative">
                  <div className="h-16 w-16 rounded-full bg-teal-50 flex items-center justify-center">
                    <CheckCircle className="h-9 w-9 text-teal-600" />
                  </div>
                </div>
              </div>

              {/* Heading */}
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold text-slate-900">
                  {isDanish ? 'Velkommen tilbage!' : 'Welcome back!'}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {isDanish
                    ? 'Din konto er blevet genaktiveret. Du kan nu logge ind igen.'
                    : 'Your account has been reactivated. You can now log in again.'}
                </p>
              </div>

              {/* Info card */}
              <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
                <p className="text-xs text-teal-800 leading-relaxed">
                  {isDanish
                    ? 'Dine data er stadig bevaret i overensstemmelse med Bogføringslovens 5-års opbevaringspligt (§10-12).'
                    : 'Your data has been preserved in accordance with the Danish Bookkeeping Act\u2019s 5-year retention requirement (§10-12).'}
                </p>
              </div>

              {/* Login button */}
              <button
                type="button"
                className="w-full h-11 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"
                onClick={onGoToLogin}
              >
                {isDanish ? 'Log ind' : 'Log in'}
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-5 py-2">
              {/* Error icon */}
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center">
                  <XCircle className="h-9 w-9 text-slate-500" />
                </div>
              </div>

              {/* Heading */}
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold text-slate-900">
                  {isDanish ? 'Kunne ikke genaktivere' : 'Reactivation failed'}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {errorMessage || (isDanish
                    ? 'Reaktiveringslinket er ugyldigt eller udløbet.'
                    : 'The reactivation link is invalid or expired.')}
                </p>
              </div>

              {/* Info card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <p className="text-xs text-slate-600 leading-relaxed">
                  {isDanish
                    ? 'Reaktiveringslinket er gyldigt i 30 dage fra deaktiveringen. Er linket udløbet, kan du kontakte support for at få genaktiveret din konto.'
                    : 'The reactivation link is valid for 30 days from deactivation. If the link has expired, contact support to have your account reactivated.'}
                </p>
              </div>

              {/* Back to login button */}
              <button
                type="button"
                className="w-full h-11 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"
                onClick={onGoToLogin}
              >
                {isDanish ? 'Tilbage til login' : 'Back to login'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
