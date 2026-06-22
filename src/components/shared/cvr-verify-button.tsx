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

// ─── PERSISTENCE ─────────────────────────────────────────────────
//
// Verification status is persisted to localStorage so it survives
// navigation away and back. We key by CVR number and store the result
// plus a timestamp. Entries expire after 24h (a company's CVR data can
// change, so we don't want to show stale "Verified" forever).
//
// Format: "alphaflow:cvr-verify:<cvr>" → JSON { info, verifiedAt }

const CVR_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function readPersistedVerification(cvr: string): CvrInfo | null {
  if (!cvr || cvr.length !== 8 || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`alphaflow:cvr-verify:${cvr}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { info: CvrInfo; verifiedAt: number };
    if (Date.now() - parsed.verifiedAt > CVR_VERIFY_TTL_MS) {
      window.localStorage.removeItem(`alphaflow:cvr-verify:${cvr}`);
      return null;
    }
    return parsed.info;
  } catch {
    return null;
  }
}

function writePersistedVerification(cvr: string, info: CvrInfo): void {
  if (!cvr || cvr.length !== 8 || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      `alphaflow:cvr-verify:${cvr}`,
      JSON.stringify({ info, verifiedAt: Date.now() })
    );
  } catch {
    // localStorage quota / disabled — non-fatal, verification still works in-session.
  }
}

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
  /** Short company form from CVR, e.g. "ApS", "A/S", "ENK" — mapped to companyType by the parent form */
  companyForm?: string;
  /** Long company form from CVR, e.g. "Anpartsselskab" */
  companyFormLong?: string;
  simulated?: boolean;
}

type LookupState = 'idle' | 'loading' | 'success' | 'notfound' | 'error';

/**
 * Map a CVR company form short code (kortBeskrivelse) to AlphaFlow's
 * companyType select values. AlphaFlow supports: ApS, A/S, IVS,
 * Enkeltmandsvirksomhed, Holdingselskab, Andet.
 *
 * CVR uses: ApS, A/S, ENK (Enkeltmandsvirksomhed), IVS, I/S, K/S,
 * A.M.B.A, FFO, Forening, Fond, etc. Anything without a direct match
 * falls back to "Andet".
 *
 * Note: "Holdingselskab" is not a CVR form — a holding company is
 * typically an ApS or A/S legally, so CVR returns the underlying form.
 * The user can manually change the type afterwards if they want the
 * "Holdingselskab" label for their own categorisation.
 */
export function mapCvrFormToCompanyType(companyForm?: string): string | undefined {
  if (!companyForm) return undefined;
  const form = companyForm.trim().toUpperCase();
  switch (form) {
    case 'APS':
      return 'ApS';
    case 'A/S':
      return 'A/S';
    case 'IVS':
      return 'IVS';
    case 'ENK':
      return 'Enkeltmandsvirksomhed';
    // All other forms (I/S, K/S, A.M.B.A, FFO, Forening, Fond, G/S, etc.)
    // have no direct AlphaFlow equivalent — use "Andet".
    default:
      return 'Andet';
  }
}

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

  // Normalise the incoming CVR once — used for the lazy initial state below
  // so the "Bekræftet" badge restores immediately on mount when the user
  // navigates away and back to the page.
  const cvrDigits = (cvr || '').toUpperCase().replace(/^DK/, '').replace(/\D/g, '');
  const isValid = cvrDigits.length === 8;

  // Lazy initial state: if this CVR was verified before (within 24h) and
  // is still in localStorage, restore the "success" state immediately.
  // This runs only ONCE per mount (useState initializer), so there's no
  // setState-in-effect lint issue.
  const [state, setState] = useState<LookupState>(() => {
    if (!isValid) return 'idle';
    const persisted = readPersistedVerification(cvrDigits);
    return persisted && persisted.exists ? 'success' : 'idle';
  });
  const [result, setResult] = useState<CvrInfo | null>(() => {
    if (!isValid) return null;
    return readPersistedVerification(cvrDigits);
  });
  const [errorMsg, setErrorMsg] = useState<string>('');
  // The CVR that was last verified. Initialised from persistence so the
  // isStale check below keeps the restored badge visible.
  const [verifiedCvr, setVerifiedCvr] = useState<string>(() => {
    if (!isValid) return '';
    return readPersistedVerification(cvrDigits) ? cvrDigits : '';
  });
  const loadingRef = useRef(false);

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
        // Persist the verification so the "Bekræftet" badge survives
        // navigation away and back (expires after 24h).
        writePersistedVerification(cvrDigits, info);
        // Auto-fill parent form + toast confirmation
        if (onVerified) {
          onVerified(info);
          const filledFields: string[] = [];
          if (info.name) filledFields.push(language === 'da' ? 'navn' : 'name');
          if (info.companyForm)
            filledFields.push(language === 'da' ? 'virksomhedstype' : 'company type');
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
