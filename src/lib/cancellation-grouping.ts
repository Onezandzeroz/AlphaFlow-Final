/**
 * Cancellation grouping utility — shared across all views that display
 * transactions / journal entries.
 *
 * When a transaction is cancelled, the backend creates a reversal journal
 * entry with reference `REVERSAL-TX-<id8>` (where `<id8>` is the first 8
 * chars of the transaction id). The original journal entry keeps its
 * reference `TX-<id8>`.
 *
 * This module provides helpers to pair these entries so the UI can collapse
 * each (original + reversal) pair into a single visual unit, improving
 * overview by not letting cancelled entries take up space.
 *
 * Used by:
 *   - transactions-page.tsx       (cancelled transactions collapsed)
 *   - journal-entries-page.tsx    (original + reversal JE paired + collapsed)
 *   - dashboard.tsx               (activity feed items paired + collapsed)
 */

/**
 * Extract the transaction short-id from a journal entry reference.
 * Returns null if the reference doesn't follow the TX-/REVERSAL-TX- pattern.
 *
 * Examples:
 *   "TX-abc12345"             → { txId8: "abc12345", isReversal: false }
 *   "REVERSAL-TX-abc12345"    → { txId8: "abc12345", isReversal: true  }
 *   "INV-2026-001"            → null  (invoice reference, not a transaction)
 *   null / undefined          → null
 */
export function parseTxReference(
  reference: string | null | undefined
): { txId8: string; isReversal: boolean } | null {
  if (!reference) return null;
  if (reference.startsWith('REVERSAL-TX-')) {
    return { txId8: reference.slice('REVERSAL-TX-'.length), isReversal: true };
  }
  if (reference.startsWith('TX-')) {
    return { txId8: reference.slice('TX-'.length), isReversal: false };
  }
  return null;
}

/**
 * A grouped item: either a standalone entry, or a pair (original + reversal)
 * that should be rendered as a single collapsible unit.
 */
export interface CancellationGroup<T> {
  /** Unique key for React rendering. */
  key: string;
  /** true if this is a cancelled pair (original + reversal), false if standalone. */
  isCancelledPair: boolean;
  /** The original entry (if part of a cancelled pair). */
  original: T | null;
  /** The reversal entry (if part of a cancelled pair). */
  reversal: T | null;
  /** Standalone entry (when not part of a cancelled pair). */
  standalone: T | null;
}

/**
 * Group a list of journal entries (or transaction-like items with a
 * `reference` field) into cancellation pairs + standalone items.
 *
 * Items whose reference matches the TX-/REVERSAL-TX- pattern are paired:
 * the original (TX-<id8>) and its reversal (REVERSAL-TX-<id8>) become one
 * group with isCancelledPair=true. All other items become standalone groups.
 *
 * The output preserves the original sort order (first occurrence wins for
 * standalone; for pairs, the original's position is used).
 *
 * @param items  The flat list to group.
 * @param getReference  Accessor for the reference string (entries use
 *                      `e.reference`; transactions don't have one, so pass
 *                      a synthetic ref like `TX-${id.slice(0,8)}`).
 */
export function groupByCancellation<T>(
  items: T[],
  getReference: (item: T) => string | null | undefined
): CancellationGroup<T>[] {
  // Build a map: txId8 → { original, reversal }
  const pairs = new Map<string, { original: T | null; reversal: T | null; firstIndex: number }>();

  // Track which items have been consumed into a pair (by reference)
  const consumed = new Set<number>();

  items.forEach((item, index) => {
    const ref = getReference(item);
    const parsed = parseTxReference(ref);
    if (!parsed) return; // not a transaction reference → standalone
    const { txId8, isReversal } = parsed;
    if (!pairs.has(txId8)) {
      pairs.set(txId8, { original: null, reversal: null, firstIndex: index });
    }
    const pair = pairs.get(txId8)!;
    if (isReversal) {
      pair.reversal = item;
    } else {
      pair.original = item;
    }
    consumed.add(index);
  });

  // Build the result: iterate items in order; emit a group for each.
  const result: CancellationGroup<T>[] = [];
  const emittedPairs = new Set<string>();

  items.forEach((item, index) => {
    if (consumed.has(index)) {
      // This item is part of a pair — emit the pair once (at the original's position).
      const ref = getReference(item);
      const parsed = parseTxReference(ref);
      if (!parsed) return;
      const { txId8 } = parsed;
      if (emittedPairs.has(txId8)) return; // already emitted
      emittedPairs.add(txId8);
      const pair = pairs.get(txId8)!;
      // Only collapse as a cancelled pair if BOTH sides exist.
      // A lone TX- without a REVERSAL- is NOT cancelled (just a normal entry).
      if (pair.original && pair.reversal) {
        result.push({
          key: `pair-${txId8}`,
          isCancelledPair: true,
          original: pair.original,
          reversal: pair.reversal,
          standalone: null,
        });
      } else {
        // Only one side exists — treat the original as standalone.
        // (A reversal without an original in this batch is unusual but
        // possible if the original was filtered out; treat as standalone.)
        const single = pair.original ?? pair.reversal!;
        result.push({
          key: `solo-${txId8}-${index}`,
          isCancelledPair: false,
          original: null,
          reversal: null,
          standalone: single,
        });
      }
    } else {
      // Standalone item (no TX- reference)
      result.push({
        key: `standalone-${index}`,
        isCancelledPair: false,
        original: null,
        reversal: null,
        standalone: item,
      });
    }
  });

  return result;
}
