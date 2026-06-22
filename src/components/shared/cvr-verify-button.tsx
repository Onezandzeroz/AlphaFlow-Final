'use client';

/**
 * CvrVerifyButton — verifies a Danish CVR number against the CVR register
 * and (optionally) auto-fills company details into the parent form.
 *
 * Usage:
 *   <CvrVerifyButton
 *     cvr={form.cvrNumber}
 *     onVerified={(info) => {
 *       updateField('companyName', info.name ?? '');
 *       updateField('address', info.address ?? '');
 *     }}
 *   />
 *
 * The component is self-contained: it manages its own loading / success /
 * error state and surfaces a short inline message. When `onVerified` is
 * provided and returns company info, a toast confirms the auto-fill.
 *
 * Visual states:
 *   - idle     → "Tjek CVR" button (disabled when CVR isn't 8 digits)
 *   - loading  → spinner + "Tjekker CVR..."
 *   - success  → green check + "Bekræftet: {name}" (simulated badge if mock)
 *   - notfound → red alert + "CVR-nummeret findes ikke..."
 *   - error    → red alert + "CVR-opslag fejlede..."
 */

import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/lib/use-translation';
import { toast } from 'sonner';
import {
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Building2,
} from 'lucide-react';

// ─── TYPES ───────────────────────────────────────────────────────

/** Shape returned by /api/cvr/lookup — mirrors CvrResult from cvr-client.ts. */
export interface CvrInfo {
  exists: boolean;
  cvrNumber: string;
  name?: string;
  status?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  simulated?: boolean;
}

type LookupState = 'idle' | 'loading' | 'success' | 'notfound' | 'error';

interface CvrVerifyButtonProps {
  /** Current CVR value from the parent form (8 digits expected). */
  cvr: string;
  /**
   * Called with the verified company info when the lookup succeeds and
   * the company exists. Use this to auto-fill name/address/etc. in the
   * parent form. If omitted, the button only shows verification status.
   */
  onVerified?: (info: CvrInfo) => void;
  /** Optional: override the button label (defaults to translated "Tjek CVR"). */
  label?: string;
  /** Optional: compact mode renders just an icon button (for tight layouts). */
  compact?: boolean;
  /** Optional: extra Tailwind classes for the button. */
  className?: string;
}

// ─── COMPONENT ───────────────────────────────────────────────────

export function CvrVerifyButton({
  cvr,
  onVerified,
  label,
  compact = false,
  className,
}: CvrVerifyButtonProps) {
  const { t, language } = useTranslation();
  const [state, setState] = useState<LookupState>('idle');
  const [result, setResult] = useState<CvrInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  // The CVR that was last verified. When the input changes away from
  // this value, the displayed status resets to idle (derived below).
  const [verifiedCvr, setVerifiedCvr] = useState<string>('');
  const loadingRef = useRef(false);

  const cvrDigits = (cvr || '').toUpperCase().replace(/^DK/, '').replace(/\D/g, '');
  const isValid = cvrDigits.length === 8;

  // Derived: the verification result is only relevant while the input
  // still matches the verified CVR. If the user edits the field, we
  // fall back to idle without needing a setState-in-effect.
  const isStale = verifiedCvr !== '' && cvrDigits !== verifiedCvr;
  const displayState: LookupState = isStale ? 'idle' : state;
  const displayResult = isStale ? null : result;

  const handleLookup = useCallback(async () => {
    if (!isValid || loadingRef.current) return;

    loadingRef.current = true;
    setState('loading');
    setErrorMsg('');
    setResult(null);

    try {
      const res = await fetch(`/api/cvr/lookup?cvr=${encodeURIComponent(cvrDigits)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      const data = (await res.json().catch(() => null)) as CvrInfo | { error?: string } | null;

      if (!res.ok) {
        const message =
          (data && typeof data === 'object' && 'error' in data && data.error) ||
          (language === 'da' ? 'CVR-opslag fejlede' : 'CVR lookup failed');
        setState('error');
        setErrorMsg(message);
        return;
      }

      const info = data as CvrInfo;
      setVerifiedCvr(cvrDigits);
      setResult(info);

      if (info.exists) {
        setState('success');
        // Auto-fill parent form + toast confirmation
        if (onVerified) {
          onVerified(info);
          const filledFields: string[] = [];
          if (info.name) filledFields.push(language === 'da' ? 'navn' : 'name');
          if (info.address) filledFields.push(language === 'da' ? 'adresse' : 'address');
          if (info.postalCode || info.city)
            filledFields.push(language === 'da' ? 'postnr./by' : 'postal/city');
          const detail =
            filledFields.length > 0
              ? `${t('cvrAutoFilled')}${
                  info.simulated ? ` (${t('cvrSimulationBadge')})` : ''
                } · ${filledFields.join(', ')}`
              : info.simulated
                ? t('cvrSimulationBadge')
                : undefined;
          toast.success(`${t('cvrVerified')}: ${info.name ?? info.cvrNumber}`, {
            description: detail,
          });
        }
      } else {
        setState('notfound');
      }
    } catch {
      setState('error');
      setErrorMsg(t('cvrLookupError'));
    } finally {
      loadingRef.current = false;
    }
  }, [cvrDigits, isValid, onVerified, language, t]);

  // ─── RENDER ────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size={compact ? 'icon' : 'sm'}
          onClick={handleLookup}
          disabled={!isValid || displayState === 'loading'}
          className={className}
          aria-label={label ?? t('cvrVerify')}
          title={label ?? t('cvrVerify')}
        >
          {displayState === 'loading' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : displayState === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          ) : displayState === 'notfound' ? (
            <XCircle className="h-4 w-4 text-red-500" />
          ) : displayState === 'error' ? (
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {!compact && <span>{displayState === 'loading' ? t('cvrVerifying') : label ?? t('cvrVerify')}</span>}
        </Button>

        {displayState === 'success' && displayResult && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-medium text-emerald-700 dark:text-emerald-400">
              {t('cvrVerified')}
            </span>
            {displayResult.name && (
              <span className="text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                · {displayResult.name}
              </span>
            )}
            {displayResult.simulated && (
              <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                {t('cvrSimulationBadge')}
              </span>
            )}
          </div>
        )}
      </div>

      {displayState === 'notfound' && (
        <div className="flex items-center gap-1 text-xs text-red-500">
          <XCircle className="h-3 w-3 shrink-0" />
          <span>{t('cvrNotFound')}</span>
        </div>
      )}
      {displayState === 'error' && (
        <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>{errorMsg || t('cvrLookupError')}</span>
        </div>
      )}
    </div>
  );
}

// ─── CONVENIENCE: CVR INPUT WITH VERIFY ──────────────────────────

/**
 * A combined CVR input + verify button, for forms that don't already have
 * a CVR field and want the full inline experience in one component.
 *
 * Example:
 *   <CvrInputWithVerify
 *     value={form.cvrNumber}
 *     onChange={(v) => updateField('cvrNumber', v)}
 *     onVerified={(info) => autoFill(info)}
 *   />
 */
interface CvrInputWithVerifyProps {
  value: string;
  onChange: (value: string) => void;
  onVerified?: (info: CvrInfo) => void;
  label?: string;
  placeholder?: string;
  id?: string;
  required?: boolean;
  className?: string;
}

export function CvrInputWithVerify({
  value,
  onChange,
  onVerified,
  label,
  placeholder,
  id = 'cvrNumber',
  required = false,
  className,
}: CvrInputWithVerifyProps) {
  const { t, language } = useTranslation();

  return (
    <div className="space-y-2">
      {label && (
        <Label htmlFor={id} className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
      )}
      <div className="flex items-start gap-2">
        <div className="relative flex-1">
          <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            id={id}
            value={value}
            onChange={(e) => {
              // Strip non-digits, cap at 8 (matches existing CVR inputs)
              const val = e.target.value.replace(/\D/g, '').slice(0, 8);
              onChange(val);
            }}
            placeholder={placeholder ?? (language === 'da' ? 'f.eks. 12345678' : 'e.g. 12345678')}
            maxLength={8}
            inputMode="numeric"
            className={`h-10 pl-9 ${className ?? ''}`}
          />
        </div>
        <CvrVerifyButton cvr={value} onVerified={onVerified} />
      </div>
    </div>
  );
}
