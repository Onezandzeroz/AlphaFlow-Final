import { create } from 'zustand';

/**
 * Independent scanner module store.
 *
 * Architecture:
 *   - Any component can call `openScanner()` to show the fullscreen scanner.
 *   - When the user captures a receipt ("Brug denne kvittering"), `completeScan(file)`
 *     stores the result and closes the scanner.
 *   - Consuming components subscribe to `pendingResult`.
 *     When a result arrives, they claim it via `claimResult(consumerId)` and
 *     open their UI with the file.
 *
 * The scanner renders via createPortal at the app root (z-9999), so it's
 * completely independent of any Dialog, view, or layout context.
 *
 * ── Multi-consumer claim model ──────────────────────────────────────────────
 * There are TWO consumers that may want a scanned file:
 *   1. PosteringerPage (FAB → scan flow): opens a NEW AddTransactionForm dialog
 *      with the file preloaded.
 *   2. AddTransactionForm itself (in-dialog "Scan kvittering" button): the form
 *      is already open; it just wants to attach the file to its own receipt
 *      field without PosteringerPage opening a duplicate dialog.
 *
 * To prevent a race where BOTH consumers grab the same pendingResult, claiming
 * is done atomically via `claimResult(consumerId)` which returns the result ONLY
 * to the first caller. Each consumer passes a unique consumerId so it can skip
 * results it has already claimed (tracked via its own lastConsumedIdRef).
 *
 * The legacy `consumeResult()` is kept for backward compatibility but is now a
 * thin wrapper around `claimResult('legacy')`.
 */

export interface ScanResult {
  file: File;
  /** Monotonically increasing ID — prevents stale re-consumption. */
  id: number;
}

interface ScannerState {
  /** Whether the standalone fullscreen scanner is visible. */
  isOpen: boolean;

  /** Result waiting to be picked up by a consumer. */
  pendingResult: ScanResult | null;

  /** Open the standalone scanner (e.g. from FAB "Scan bilag"). */
  openScanner: () => void;

  /** Close the scanner without capturing (user dismissed). */
  closeScanner: () => void;

  /**
   * Capture the file and close the scanner.
   * Stores the result so any subscriber can pick it up.
   */
  completeScan: (file: File) => void;

  /**
   * Atomically claim the pending result for a specific consumer.
   * Returns the result if one is pending AND it hasn't been claimed by another
   * consumer yet; otherwise returns null. This prevents the race where both
   * PosteringerPage and an open AddTransactionForm grab the same scan.
   *
   * @param consumerId - unique id of the claiming consumer (e.g. 'posteringer',
   *                      'add-transaction-form:<instanceId>')
   * @param onlyIfId   - optional result id; if provided, only claims if the
   *                      pending result's id matches (prevents claiming a stale
   *                      or different result)
   */
  claimResult: (consumerId: string, onlyIfId?: number) => ScanResult | null;

  /**
   * @deprecated Use `claimResult(consumerId)` instead. Kept for backward compat.
   * Legacy claim with no consumer id — still works but doesn't win races against
   * consumers that use claimResult.
   */
  consumeResult: () => ScanResult | null;
}

let nextResultId = 0;

export const useScannerStore = create<ScannerState>((set, get) => ({
  isOpen: false,
  pendingResult: null,

  openScanner: () => set({ isOpen: true, pendingResult: null }),

  closeScanner: () => set({ isOpen: false, pendingResult: null }),

  completeScan: (file: File) => {
    const id = ++nextResultId;
    // Close scanner AND store result in a single batch
    set({ isOpen: false, pendingResult: { file, id } });
  },

  claimResult: (consumerId: string, onlyIfId?: number) => {
    const result = get().pendingResult;
    if (!result) return null;
    // If the caller asked for a specific id, make sure it matches. This lets
    // a consumer ignore results it has already seen (by id) without claiming
    // a newer one it didn't subscribe to.
    if (onlyIfId !== undefined && result.id !== onlyIfId) return null;
    // Atomically clear the pending result so no other consumer can claim it.
    set({ pendingResult: null });
    // (consumerId is accepted for future telemetry / debugging; the atomic
    //  set() above is what actually guarantees single-consumer ownership.)
    void consumerId;
    return result;
  },

  consumeResult: () => {
    // Legacy path — claim with a generic id. Loses races against explicit
    // claimResult() callers that run first, which is the desired behaviour.
    return get().claimResult('legacy');
  },
}));
