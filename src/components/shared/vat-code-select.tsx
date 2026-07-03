'use client';

/**
 * VATCodeSelect — a reusable dropdown for selecting Danish VAT codes.
 *
 * Replaces the previous hardcoded 0/12/25 dropdowns and free-text number
 * inputs with a single source of truth: the 10 Danish VAT codes from
 * VAT_CODE_TO_PUBLIC_MAPPING (S25/S12/S0/SEU for sales, K25/K12/K0/KEU/KUF
 * for purchases, plus NONE).
 *
 * Why this exists:
 *   The old UIs only offered 0%, 12%, 25% and (in some places) a manual
 *   number input. That (a) prevented EU/import codes from being selected,
 *   and (b) let users type arbitrary percentages that don't correspond to
 *   any real Danish VAT code — causing downstream mismatches in the VAT
 *   register and SAF-T export. This component restricts selection to valid
 *   codes while showing the human-readable name + rate.
 *
 * Architecture note (rate vs. code):
 *   The existing forms store `vatPercent: number` on line items. Because
 *   several VAT codes share the same rate (K25, KEU, KUF all = 25%), a rate
 *   alone is ambiguous. Internally this component uses the VAT *code*
 *   (e.g. "K25") as the SelectItem value — Radix Select requires unique
 *   values, so using the rate would break the dropdown. The component
 *   converts code↔rate at the boundary:
 *     • `value` prop (number) → resolved to the default code for that rate
 *       within the active direction (e.g. rate 25 + direction "input" → K25).
 *     • `onValueChange` returns the selected code's rate (number), keeping
 *       the component drop-in compatible with `vatPercent: number` fields.
 *   This means selecting KEU or KUF (both rate 25) and re-opening the
 *   dropdown will re-highlight K25 (the default for rate 25). A future
 *   "Solution B" refactor (see transactions/route.ts) would store the VAT
 *   *code* directly on the line item, removing this ambiguity entirely.
 *
 * Direction:
 *   - "output" → shows sales codes (S25, S12, S0, SEU) for invoices/sales
 *   - "input"  → shows purchase codes (K25, K12, K0, KEU, KUF) for purchases
 *   - "all"    → shows both groups (for filters / generic use)
 */

import { VAT_CODE_TO_PUBLIC_MAPPING } from '@/lib/standard-chart-of-accounts';
import { OUTPUT_VAT_CODES, INPUT_VAT_CODES, VAT_RATE_MAP } from '@/lib/vat-codes';
import { useTranslation } from '@/lib/use-translation';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from '@/components/ui/select';

export type VATDirection = 'output' | 'input' | 'all';

interface VATCodeSelectProps {
  /** Current VAT rate (number). 0/12/25 etc. */
  value: number;
  /** Called with the selected rate (number) when the user picks a code. */
  onValueChange: (rate: number) => void;
  /** Which group of codes to show. Defaults to 'all'. */
  direction?: VATDirection;
  /** Disable the control (e.g. while loading). */
  disabled?: boolean;
  /** Extra classes for the trigger. */
  className?: string;
  /** Trigger height via class; defaults to h-10 to match existing inputs. */
  triggerClassName?: string;
}

interface CodeEntry {
  code: string;
  rate: number;
  name: string;
  description: string;
}

/**
 * Resolve a rate to the DEFAULT VAT code for a given direction.
 * When multiple codes share a rate, we pick the domestic standard
 * (K25 over KEU/KUF for input; S25 over none for output).
 */
function resolveCodeFromRate(rate: number, direction: VATDirection): string {
  const pool = direction === 'output' ? OUTPUT_VAT_CODES : direction === 'input' ? INPUT_VAT_CODES : [...OUTPUT_VAT_CODES, ...INPUT_VAT_CODES];
  // Prefer the first code in the pool that matches the rate exactly.
  // The arrays are ordered so the domestic standard comes first
  // (S25 before SEU; K25 before KEU/KUF), which gives the right default.
  for (const code of pool) {
    if (VAT_RATE_MAP[code] === rate) return code;
  }
  // Fallback: first code in the pool
  return pool[0];
}

export function VATCodeSelect({
  value,
  onValueChange,
  direction = 'all',
  disabled,
  className,
  triggerClassName = 'h-10 bg-white dark:bg-white/5',
}: VATCodeSelectProps) {
  const { language } = useTranslation();
  const isDa = language === 'da';

  // Build the list of code entries from the canonical mapping.
  const outputCodes: CodeEntry[] = OUTPUT_VAT_CODES.map((code) => {
    const m = VAT_CODE_TO_PUBLIC_MAPPING[code];
    return { code, rate: m.rate, name: m.publicName, description: m.description };
  });
  const inputCodes: CodeEntry[] = INPUT_VAT_CODES.map((code) => {
    const m = VAT_CODE_TO_PUBLIC_MAPPING[code];
    return { code, rate: m.rate, name: m.publicName, description: m.description };
  });

  // Resolve the current rate to the code that should be highlighted.
  const selectedCode = resolveCodeFromRate(value, direction);

  // Render a single group of codes. Each item uses the CODE as its value
  // (unique per code) and displays a badge + rate + name.
  const renderGroup = (label: string, codes: CodeEntry[]) => (
    <SelectGroup key={label}>
      <SelectLabel className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-2 py-1.5 select-none">
        {label}
      </SelectLabel>
      {codes.map((entry) => (
        <SelectItem key={entry.code} value={entry.code} className="py-2">
          <div className="flex items-center gap-2 w-full">
            <span className="inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
              {entry.code}
            </span>
            <span className="font-medium tabular-nums">{entry.rate}%</span>
            <span className="text-gray-500 dark:text-gray-400 truncate">{entry.name}</span>
          </div>
        </SelectItem>
      ))}
    </SelectGroup>
  );

  return (
    <Select
      value={selectedCode}
      onValueChange={(code) => onValueChange(VAT_RATE_MAP[code] ?? 0)}
      disabled={disabled}
    >
      <SelectTrigger className={`${triggerClassName} ${className || ''}`}>
        {/* Compact trigger: show the rate only (fits narrow w-20 containers).
            The full code badge + name appears in the dropdown items below. */}
        <span className="font-medium tabular-nums">{value}%</span>
      </SelectTrigger>
      <SelectContent className="bg-white dark:bg-[#1a1f1e] dark:border-[#232740] max-h-80 overflow-y-auto min-w-[16rem]">
        {direction === 'output' && renderGroup(isDa ? 'Salg (udgående moms)' : 'Sales (output VAT)', outputCodes)}
        {direction === 'input' && renderGroup(isDa ? 'Køb (indgående moms)' : 'Purchases (input VAT)', inputCodes)}
        {direction === 'all' && (
          <>
            {renderGroup(isDa ? 'Salg (udgående moms)' : 'Sales (output VAT)', outputCodes)}
            {renderGroup(isDa ? 'Køb (indgående moms)' : 'Purchases (input VAT)', inputCodes)}
          </>
        )}
      </SelectContent>
    </Select>
  );
}
