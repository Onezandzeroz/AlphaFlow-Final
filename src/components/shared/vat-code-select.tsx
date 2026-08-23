'use client';

/**
 * VATCodeSelect — a reusable dropdown for selecting Danish VAT codes.
 *
 * This is the "Solution B" version: it is CODE-BASED, meaning `value` is the
 * VAT code string (e.g. "K25") and `onValueChange` returns the code. This
 * removes the rate-ambiguity problem (K25/KEU/KUF all = 25%) and lets the
 * backend post each line to the correct VAT account with the correct code.
 *
 * The trigger displays the rate (looked up from VAT_RATE_MAP) for compactness,
 * while the dropdown items show the code badge + rate + name.
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
  /** Currently selected VAT code (e.g. "K25", "S0"). */
  value: string;
  /** Called with the selected VAT code when the user picks one. */
  onValueChange: (code: string) => void;
  /** Which group of codes to show. Defaults to 'all'. */
  direction?: VATDirection;
  /** Disable the control (e.g. while loading). */
  disabled?: boolean;
  /** Extra classes for the trigger. */
  className?: string;
  /** Trigger classes; defaults to h-10 to match existing inputs. */
  triggerClassName?: string;
}

interface CodeEntry {
  code: string;
  rate: number;
  name: string;
  description: string;
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

  // The display rate for the trigger.
  const displayRate = VAT_RATE_MAP[value] ?? 0;
  // Show the code when it differs from the "default" code at that rate
  // (e.g. KEU, KUF, SEU are non-standard 25%/0% codes). K25 is the default
  // input-25% code, S25 is the default output-25% code, K0 is the default
  // input-0% code, S0 is the default output-0% code. Always show the code
  // so the user can distinguish KEU from K25, KUF from K25, SEU from S0, etc.
  const showCodeInTrigger = value && value !== 'NONE';

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
      value={value}
      onValueChange={(code) => onValueChange(code)}
      disabled={disabled}
    >
      <SelectTrigger className={`${triggerClassName} ${className || ''}`}>
        {/* Show code badge + rate in trigger so user can distinguish
            KEU from K25, KUF from K25, SEU from S0, etc. */}
        {showCodeInTrigger ? (
          <span className="flex items-center gap-1.5 font-medium tabular-nums">
            <span className="inline-flex items-center justify-center min-w-[1.75rem] px-1 py-0.5 rounded text-[9px] font-bold tracking-wide bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 border border-teal-200 dark:border-teal-800 leading-none">
              {value}
            </span>
            {displayRate}%
          </span>
        ) : (
          <span className="font-medium tabular-nums">{displayRate}%</span>
        )}
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
