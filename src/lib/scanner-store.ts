import { create } from 'zustand';

/**
 * Independent scanner module store.
 *
 * Architecture:
 *   - Any component can call `openScanner(ownerId)` to show the fullscreen scanner.
 *     The `ownerId` identifies WHO opened the scanner, so the captured file is
 *     delivered back to the right consumer.
 *   - When the user captures a receipt ("Brug denne kvittering"), `completeScan(file)`
 *     stores the result and closes the scanner.
 *   - Consuming components subscribe to `pendingResult`. When a result arrives,
 *     they call `claimResult(consumerId)` — but ONLY the owner (or, if no owner,
 *     PosteringerPage as the fallback) succeeds.
 *
 * ── Ownership model (fixes the multi-instance race) ────────────────────────
 * The previous "first caller wins" model had a critical bug: on desktop, when
 * `currentView === 'create'`, TWO AddTransactionForm instances mount (the
 * `layout="cards"` desktop form + the hidden mobile dialog form). Both
 * subscribed and raced to claim the scan — the hidden desktop form often won,
 * attaching the receipt to a form the user couldn't see, while the visible
 * mobile dialog form got nothing.
 *
 * The fix: `openScanner(ownerId)` records who opened the scanner. The owner is
 * the ONLY AddTransactionForm instance allowed to claim. If no owner is set
 * (FAB flow), PosteringerPage claims as the fallback and opens a fresh dialog.
 *
 *   - AddTransactionForm.handleOpenScanner() → openScanner(this.formConsumerId)
 *   - page.tsx handleOpenScanner (FAB)       → openScanner(null)  // no owner
 *   - On completeScan: pendingResult + scannerOwner are set together
 *   - claimResult(consumerId): succeeds only if consumerId === scannerOwner,
 *     OR if scannerOwner is null and consumerId === 'posteringer' (fallback).
 *   - On successful claim, scannerOwner is cleared.
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

  /**
   * The consumerId of the AddTransactionForm instance that opened the scanner,
   * or null if the scanner was opened ownerless (FAB flow → PosteringerPage
   * will claim and open a new dialog). This prevents hidden desktop form
   * instances from stealing scans meant for the visible mobile dialog form.
   */
  scannerOwner: string | null;

  /**
   * Open the standalone scanner.
   * @param ownerId - the consumerId of the form opening the scanner, or null
   *                  for the FAB flow (PosteringerPage will claim the result).
   */
  openScanner: (ownerId?: string | null) => void;

  /** Close the scanner without capturing (user dismissed). */
  closeScanner: () => void;

  /** Capture the file and close the scanner. Stores the result for claiming. */
  completeScan: (file: File) => void;

  /**
   * Claim the pending result. Succeeds only if:
   *   - this consumer IS the scannerOwner, OR
   *   - scannerOwner is null AND this consumer is the fallback ('posteringer')
   * This ensures the scan goes to the form that opened the scanner, not a
   * hidden competing instance.
   */
  claimResult: (consumerId: string, onlyIfId?: number) => ScanResult | null;

  /**
   * @deprecated Use `claimResult(consumerId)`. Kept for backward compat.
   */
  consumeResult: () => ScanResult | null;
}

let nextResultId = 0;

export const useScannerStore = create<ScannerState>((set, get) => ({
  isOpen: false,
  pendingResult: null,
  scannerOwner: null,

  openScanner: (ownerId: string | null = null) =>
    set({ isOpen: true, pendingResult: null, scannerOwner: ownerId }),

  closeScanner: () =>
    set({ isOpen: false, pendingResult: null, scannerOwner: null }),

  completeScan: (file: File) => {
    const id = ++nextResultId;
    const owner = get().scannerOwner;
    // Close scanner AND store result in a single batch. scannerOwner is
    // preserved so the correct form can claim on the next tick.
    console.log(`[RECEIPT-FLOW] completeScan: file=${file.name} (${file.size} bytes), id=${id}, owner=${owner}`);
    set({ isOpen: false, pendingResult: { file, id } });
  },

  claimResult: (consumerId: string, onlyIfId?: number) => {
    const state = get();
    const result = state.pendingResult;
    if (!result) {
      console.log(`[RECEIPT-FLOW] claimResult(${consumerId}): no pending result`);
      return null;
    }
    // If the caller asked for a specific id, make sure it matches.
    if (onlyIfId !== undefined && result.id !== onlyIfId) {
      console.log(`[RECEIPT-FLOW] claimResult(${consumerId}): id mismatch (want ${onlyIfId}, have ${result.id})`);
      return null;
    }

    // Ownership check: only the owner (or the fallback if no owner) may claim.
    const owner = state.scannerOwner;
    const isOwner = owner !== null && owner === consumerId;
    const isFallback = owner === null && consumerId === 'posteringer';
    if (!isOwner && !isFallback) {
      console.log(`[RECEIPT-FLOW] claimResult(${consumerId}): DENIED — owner=${owner}, isOwner=${isOwner}, isFallback=${isFallback}`);
      return null;
    }

    // Atomically clear the pending result + owner so no other consumer can claim.
    set({ pendingResult: null, scannerOwner: null });
    console.log(`[RECEIPT-FLOW] claimResult(${consumerId}): SUCCESS — claimed id=${result.id}`);
    return result;
  },

  consumeResult: () => {
    // Legacy path — behaves as the posteringer fallback. Kept for any callers
    // that haven't migrated to claimResult(consumerId).
    return get().claimResult('posteringer');
  },
}));
