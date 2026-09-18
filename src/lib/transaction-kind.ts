import { ArrowUpCircle, ArrowDownCircle, FileMinus, FileText, type LucideIcon } from 'lucide-react';

/**
 * The application's 4-type transaction system.
 *
 * The legacy `TransactionType` enum (SALE/PURCHASE/SALARY/BANK/Z_REPORT/
 * PRIVATE/ADJUSTMENT) is collapsed into these 4 user-facing kinds. Credit
 * notes are distinguished by `documentType`, not by `type` — a sales credit
 * note is still `type: 'SALE'` + `documentType: 'SALE_CREDIT_NOTE'`, and a
 * purchase credit note is `type: 'PURCHASE'` + `documentType:
 * 'PURCHASE_CREDIT_NOTE'`. This keeps the bookkeeping type stable while
 * giving the UI a single, consistent categorisation.
 */
export type TransactionKind =
  | 'SALE' // Salg — money IN
  | 'PURCHASE' // Køb — money OUT
  | 'SALE_CREDIT_NOTE' // Kreditnota (salg) — reversal, money OUT
  | 'PURCHASE_CREDIT_NOTE' // Kreditnota (køb) — reversal, money IN
  | 'OTHER'; // Legacy/imported types that don't fit the 4-type system

export interface KindStyle {
  /** Money-flow direction: 'in' = money received (green), 'out' = money paid (red) */
  direction: 'in' | 'out' | 'neutral';
  /** Lucide icon component reference */
  icon: LucideIcon;
  /** Tailwind text-color class for amounts/figures */
  textClass: string;
  /** Tailwind badge background+text class */
  badgeClass: string;
}

/**
 * Derive the 4-type "kind" from a transaction's `type` + `documentType`.
 *
 * Credit notes are detected via `documentType` (takes precedence over `type`)
 * so a `type: 'SALE'` credit note is correctly categorised as a sales credit
 * note, not a regular sale.
 */
export function getTransactionKind(tx: {
  type?: string | null;
  documentType?: string | null;
}): TransactionKind {
  const dt = tx.documentType;
  if (dt === 'PURCHASE_CREDIT_NOTE' || dt === 'SALE_CREDIT_NOTE') return dt;
  const type = tx.type;
  if (type === 'SALE' || !type) return 'SALE';
  if (type === 'PURCHASE') return 'PURCHASE';
  // Legacy types (SALARY, BANK, Z_REPORT, PRIVATE, ADJUSTMENT) — not part of
  // the app's 4-type system. Mapped to OTHER so they render with a neutral
  // style if they ever surface (e.g. legacy/imported data).
  return 'OTHER';
}

/** Localised label for a kind, e.g. "Salg" / "Sale". */
export function getKindLabel(kind: TransactionKind, language: 'da' | 'en'): string {
  const da = language === 'da';
  switch (kind) {
    case 'SALE':
      return da ? 'Salg' : 'Sale';
    case 'PURCHASE':
      return da ? 'Køb' : 'Purchase';
    case 'SALE_CREDIT_NOTE':
      return da ? 'Kreditnota (salg)' : 'Credit note (sale)';
    case 'PURCHASE_CREDIT_NOTE':
      return da ? 'Kreditnota (køb)' : 'Credit note (purchase)';
    default:
      return da ? 'Andet' : 'Other';
  }
}

/**
 * Green/red style for a kind, based on money-flow direction.
 *
 * Convention (consistent across the platform):
 *   GREEN (money IN):  SALE (sale received), PURCHASE_CREDIT_NOTE (supplier refund)
 *   RED   (money OUT): PURCHASE (purchase paid), SALE_CREDIT_NOTE (sale refunded)
 *
 * This mirrors how the dashboard colours revenue (green) vs. expenses/liabilities
 * (red), so a sale and a purchase credit note look the same "money in" green,
 * and a purchase and a sales credit note look the same "money out" red.
 */
export function getKindStyle(kind: TransactionKind): KindStyle {
  switch (kind) {
    case 'SALE':
      return {
        direction: 'in',
        icon: ArrowUpCircle,
        textClass: 'text-green-600 dark:text-green-400',
        badgeClass: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
      };
    case 'PURCHASE':
      return {
        direction: 'out',
        icon: ArrowDownCircle,
        textClass: 'text-red-600 dark:text-red-400',
        badgeClass: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      };
    case 'SALE_CREDIT_NOTE':
      // Reversal of a sale → money goes back out → red
      return {
        direction: 'out',
        icon: FileMinus,
        textClass: 'text-red-600 dark:text-red-400',
        badgeClass: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      };
    case 'PURCHASE_CREDIT_NOTE':
      // Reversal of a purchase → money comes back in → green
      return {
        direction: 'in',
        icon: FileMinus,
        textClass: 'text-green-600 dark:text-green-400',
        badgeClass: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
      };
    default:
      return {
        direction: 'neutral',
        icon: FileText,
        textClass: 'text-gray-600 dark:text-gray-400',
        badgeClass: 'bg-gray-50 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300',
      };
  }
}
