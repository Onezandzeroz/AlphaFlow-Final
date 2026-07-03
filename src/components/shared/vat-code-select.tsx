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
 * Compatibility:
 *   The component works with the existing `vatPercent: number` field shape
 *   used across invoice line items and purchase lines. The `value` prop is
 *   a number (the rate), and `onValueChange` returns the selected rate as a
 *   number. The VAT *code* (e.g. "K25") is NOT stored on the line item —
 *   it is derived later from the rate + direction when the journal entry is
 *   created (see transactions/route.ts). This keeps the change non-breaking.
 *
 * Direction:
 *   - "output" → shows sales codes (S25, S12, S0, SEU) for invoices/sales
 *   - "input"  → shows purchase codes (K25, K12, K0, KEU, KUF) for purchases
 *   - "all"    → shows both groups (for filters / generic use)
 *
 * NOTE on rate collisions: several codes share the same rate (e.g. K25, KEU,
 *   KUF all have rate 25). Because the component is rate-based (for backwards
 *   compatibility), selecting "25%" from the dropdown cannot distinguish
 *   between K25 / KEU / KUF. The codes are still listed individually so the
 *   user understands what options exist, but the stored value is the rate.
 *   A future "Solution B" refactor (see transactions/route.ts) would store
 *   the VAT *code* directly on the line item, removing this ambiguity.
 */

import { VAT_CODE_TO_PUBLIC_MAPPING } from '@/lib/standard-chart-of-accounts';
// IMPORTANT: import the pure (db-free) constants from vat-codes, NOT vat-utils.
// vat-utils imports Prisma's `db` client, which crashes in the browser with
// "Extensions.defineExtension is unable to run in this browser environment"
// if pulled into a client bundle.
import { OUTPUT_VAT_CODES, INPUT_VAT_CODES } from '@/lib/vat-codes';
import { useTranslation } from '@/lib/use-translation';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
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

  // Render a single group of codes.
  const renderGroup = (label: string, codes: CodeEntry[]) => (
    <SelectGroup key={label}>
      <SelectLabel className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-2 py-1.5 select-none">
        {label}
      </SelectLabel>
      {codes.map((entry) => (
        <SelectItem key={entry.code} value={entry.rate.toString()}>
          <span className="font-medium">{entry.rate}%</span>
          <span className="text-gray-500 dark:text-gray-400 ml-2">— {entry.name}</span>
        </SelectItem>
      ))}
    </SelectGroup>
  );

  return (
    <Select
      value={value.toString()}
      onValueChange={(val) => onValueChange(parseFloat(val))}
      disabled={disabled}
    >
      <SelectTrigger className={`${triggerClassName} ${className || ''}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-white dark:bg-[#1a1f1e] dark:border-[#232740] max-h-80 overflow-y-auto">
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
