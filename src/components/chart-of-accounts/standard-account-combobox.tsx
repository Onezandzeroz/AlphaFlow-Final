'use client';

/**
 * StandardAccountCombobox
 *
 * Searchable dropdown for selecting a standard account from the official
 * 2026 Standardkontoplanen (652 accounts: 603 official + 49 legacy).
 *
 * Replaces the plain <Select> that required scrolling through 600+ items.
 * Uses the shadcn Popover + Command (cmdk) pattern — same as the invoice
 * search combobox in invoices-page.tsx.
 *
 * Features:
 *   - Type-ahead search by account number OR name (case-insensitive)
 *   - Shows account number + name + type badge in the trigger
 *   - Each account in the list shows a colored type badge (EXPENSE, REVENUE, etc.)
 *   - Highlights the "Unmapped" option separately (red)
 *   - Preserves the same onValueChange API as <Select> so it's a drop-in
 *     replacement at the call site.
 */

import { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { ChevronDown, Check } from 'lucide-react';
import type { StandardAccountType } from '@/lib/standard-chart-of-accounts';
import { MERGED_STANDARD_CHART } from './standard-mapping-data';

// ─── Account type labels + colors ───────────────────────────────────────
// Matches the color scheme used in chart-of-accounts-page.tsx for visual
// consistency. Each type gets a short badge label (DA/EN) + a tinted badge
// background + a text color for both light and dark mode.

interface TypeStyle {
  labelDa: string;
  labelEn: string;
  badgeClass: string; // bg + text classes for both light/dark
}

const TYPE_STYLES: Record<StandardAccountType, TypeStyle> = {
  EXPENSE: {
    labelDa: 'Omkostning',
    labelEn: 'Expense',
    badgeClass: 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400',
  },
  REVENUE: {
    labelDa: 'Indtægt',
    labelEn: 'Revenue',
    badgeClass: 'bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400',
  },
  INVENTORY: {
    labelDa: 'Varelager',
    labelEn: 'Inventory',
    badgeClass: 'bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400',
  },
  ASSET: {
    labelDa: 'Aktiv',
    labelEn: 'Asset',
    badgeClass: 'bg-[#7dabb5]/10 text-[#5a8b94] dark:bg-[#80c0cc]/15 dark:text-[#80c0cc]',
  },
  LIABILITY: {
    labelDa: 'Gæld',
    labelEn: 'Liability',
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400',
  },
  EQUITY: {
    labelDa: 'Egenkapital',
    labelEn: 'Equity',
    badgeClass: 'bg-[#0d9488]/10 text-[#0d9488] dark:bg-[#2dd4bf]/15 dark:text-[#2dd4bf]',
  },
  FINANCIAL: {
    labelDa: 'Finansielt',
    labelEn: 'Financial',
    badgeClass: 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400',
  },
  TAX: {
    labelDa: 'Skat/moms',
    labelEn: 'Tax/VAT',
    badgeClass: 'bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400',
  },
  YEAR_END: {
    labelDa: 'Årsafslutning',
    labelEn: 'Year-end',
    badgeClass: 'bg-gray-500/10 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400',
  },
  STATISTICAL: {
    labelDa: 'Statistik',
    labelEn: 'Statistical',
    badgeClass: 'bg-pink-500/10 text-pink-600 dark:bg-pink-500/20 dark:text-pink-400',
  },
};

function TypeBadge({ type, isDanish, compact = false }: { type: StandardAccountType; isDanish: boolean; compact?: boolean }) {
  const style = TYPE_STYLES[type];
  if (!style) return null;
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium leading-none whitespace-nowrap ${style.badgeClass} ${compact ? 'shrink-0' : ''}`}
    >
      {isDanish ? style.labelDa : style.labelEn}
    </span>
  );
}

export interface StandardAccountComboboxProps {
  /** Currently selected standard account number, or 'UNMAPPED' for none. */
  value: string;
  /** Called when the user picks an account. Receives the account number or 'UNMAPPED'. */
  onValueChange: (value: string) => void;
  /** Whether the current value is unmapped (shows red trigger border). */
  isUnmapped?: boolean;
  /** Language flag for Danish vs English labels. */
  isDanish: boolean;
  /** Optional className for the trigger button. */
  className?: string;
}

export function StandardAccountCombobox({
  value,
  onValueChange,
  isUnmapped = false,
  isDanish,
  className,
}: StandardAccountComboboxProps) {
  const [open, setOpen] = useState(false);

  // Find the currently selected account's display name
  const selected = useMemo(
    () => MERGED_STANDARD_CHART.find((a) => a.number === value),
    [value],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={`w-full justify-between text-xs sm:text-sm h-8 sm:h-9 font-normal ${
            isUnmapped
              ? 'border-red-200 dark:border-red-800/50 text-red-500'
              : 'border-input'
          } ${className ?? ''}`}
        >
          {value === 'UNMAPPED' || !selected ? (
            <span className="text-red-500">
              {isDanish ? '— Ikke mapped —' : '— Unmapped —'}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 truncate">
              <span className="font-mono font-medium shrink-0">{selected.number}</span>
              <span className="text-muted-foreground shrink-0">—</span>
              <span className="truncate">{selected.name}</span>
              <TypeBadge type={selected.type} isDanish={isDanish} compact />
            </span>
          )}
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[460px]" align="start">
        <Command>
          <CommandInput
            placeholder={
              isDanish
                ? 'Søg kontonr. eller navn…'
                : 'Search account no. or name…'
            }
          />
          <CommandList>
            <CommandEmpty>
              {isDanish ? 'Ingen konti fundet' : 'No accounts found'}
            </CommandEmpty>
            <CommandGroup
              heading={isDanish ? 'Ingen mapping' : 'No mapping'}
            >
              <CommandItem
                value="unmapped ikke mapped"
                onSelect={() => {
                  onValueChange('UNMAPPED');
                  setOpen(false);
                }}
                className="text-red-500"
              >
                <Check
                  className={`mr-2 h-4 w-4 ${
                    value === 'UNMAPPED' || !selected ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                {isDanish ? '— Ikke mapped —' : '— Unmapped —'}
              </CommandItem>
            </CommandGroup>
            <CommandGroup
              heading={
                isDanish
                  ? `Standardkontoplan (${MERGED_STANDARD_CHART.length})`
                  : `Standard chart (${MERGED_STANDARD_CHART.length})`
              }
            >
              {MERGED_STANDARD_CHART.map((std) => (
                <CommandItem
                  key={std.number}
                  value={`${std.number} ${std.name}`}
                  onSelect={() => {
                    onValueChange(std.number);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={`mr-2 h-4 w-4 shrink-0 ${
                      selected?.number === std.number ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                  <span className="font-mono text-xs shrink-0 w-12">{std.number}</span>
                  <span className="mx-1.5 text-muted-foreground shrink-0">—</span>
                  <span className="truncate flex-1">{std.name}</span>
                  <TypeBadge type={std.type} isDanish={isDanish} compact />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
