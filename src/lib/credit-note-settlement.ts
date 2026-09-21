/**
 * Credit note settlement detection.
 *
 * Determines whether a journal entry's reference invoice is fully covered
 * by one or more credit notes — i.e. the invoice + its credit notes net out
 * to zero (or the credit notes exceed the invoice amount).
 *
 * When this is the case, both the invoice's journal entry AND the credit
 * note's journal entry should be marked as "Udlignet" (settled) in the
 * Finansjournal UI, because the receivable has been fully reversed.
 *
 * Used by:
 *   - GET /api/journal-entries (to annotate entries with isSettledByCreditNote)
 *
 * The detection works by:
 *   1. Looking up the Invoice row matching je.reference (invoiceNumber)
 *   2. If it's an invoice (documentType=INVOICE), summing its credit notes' totals
 *   3. If credit notes total >= invoice total → settled
 *   4. If it's a credit note (documentType=CREDIT_NOTE), checking its original
 *      invoice — if the original invoice's total <= sum of all its credit notes,
 *      then this credit note is part of a full settlement → settled
 *
 * Amounts are compared using the Invoice.total field (gross, incl. VAT).
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Result of the settlement check for a single journal entry.
 */
export interface SettlementResult {
  /** True if this JE's invoice is fully covered by credit notes (or this JE's
   *  credit note fully covers its original invoice). */
  isSettledByCreditNote: boolean;
  /** The invoice number that was checked (for debugging). */
  invoiceNumber: string | null;
  /** The invoice total (gross, incl. VAT) — null if not found. */
  invoiceTotal: number | null;
  /** Sum of credit note totals that offset the invoice. */
  creditNotesTotal: number | null;
}

/**
 * Batch-check settlement status for multiple journal entries.
 *
 * For each JE whose `reference` matches an invoice number, determines whether
 * that invoice is fully covered by credit notes. Returns a map from JE id →
 * SettlementResult. Entries whose reference doesn't match an invoice are
 * returned with isSettledByCreditNote=false.
 *
 * @param entries - Journal entries to check (must include `id` + `reference`)
 * @param companyId - The tenant ID (for scoping the invoice lookup)
 * @returns Map from JE id → SettlementResult
 */
export async function checkCreditNoteSettlement(
  entries: Array<{ id: string; reference: string | null }>,
  companyId: string,
): Promise<Map<string, SettlementResult>> {
  const result = new Map<string, SettlementResult>();

  if (entries.length === 0) return result;

  // Collect all non-null references (invoice numbers) from the JEs
  const references = entries
    .map((e) => e.reference)
    .filter((r): r is string => !!r && r.trim().length > 0);

  if (references.length === 0) {
    // No references to check — all entries are not settled
    for (const e of entries) {
      result.set(e.id, {
        isSettledByCreditNote: false,
        invoiceNumber: e.reference,
        invoiceTotal: null,
        creditNotesTotal: null,
      });
    }
    return result;
  }

  // Fetch all invoices matching the references in one query (N+1 avoidance).
  // Include creditNotes relation so we can sum their totals without extra queries.
  const invoices = await db.invoice.findMany({
    where: {
      companyId,
      invoiceNumber: { in: references },
    },
    select: {
      id: true,
      invoiceNumber: true,
      documentType: true,
      total: true,
      originalInvoiceId: true,
      originalInvoice: {
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          creditNotes: {
            select: { id: true, total: true, invoiceNumber: true },
          },
        },
      },
      creditNotes: {
        select: { id: true, total: true, invoiceNumber: true },
      },
    },
  });

  // Build a lookup: invoiceNumber → invoice (with credit notes)
  const invoiceByNumber = new Map<string, typeof invoices[number]>();
  for (const inv of invoices) {
    invoiceByNumber.set(inv.invoiceNumber, inv);
  }

  // For each JE, determine settlement status
  for (const entry of entries) {
    const ref = entry.reference;
    if (!ref) {
      result.set(entry.id, {
        isSettledByCreditNote: false,
        invoiceNumber: null,
        invoiceTotal: null,
        creditNotesTotal: null,
      });
      continue;
    }

    const invoice = invoiceByNumber.get(ref);
    if (!invoice) {
      // Reference doesn't match any invoice (could be a manual JE reference)
      result.set(entry.id, {
        isSettledByCreditNote: false,
        invoiceNumber: ref,
        invoiceTotal: null,
        creditNotesTotal: null,
      });
      continue;
    }

    // Case 1: This JE's reference is an INVOICE
    // → check if its credit notes sum to >= invoice total
    if (invoice.documentType === 'INVOICE') {
      const invoiceTotal = Number(invoice.total);
      const creditNotesTotal = invoice.creditNotes.reduce(
        (sum, cn) => sum + Number(cn.total),
        0,
      );
      // Use a small epsilon to handle floating-point rounding (0.005 DKK)
      const isSettled = creditNotesTotal >= invoiceTotal - 0.005;
      result.set(entry.id, {
        isSettledByCreditNote: isSettled,
        invoiceNumber: invoice.invoiceNumber,
        invoiceTotal,
        creditNotesTotal,
      });
      continue;
    }

    // Case 2: This JE's reference is a CREDIT_NOTE
    // → check if its original invoice is fully covered by credit notes
    // (i.e. this credit note + any sibling credit notes sum to >= original total)
    if (invoice.documentType === 'CREDIT_NOTE') {
      const original = invoice.originalInvoice;
      if (!original) {
        // Freestanding credit note (no original invoice) — can't be "settled"
        // in the credit-note-offsets-invoice sense.
        result.set(entry.id, {
          isSettledByCreditNote: false,
          invoiceNumber: invoice.invoiceNumber,
          invoiceTotal: Number(invoice.total),
          creditNotesTotal: null,
        });
        continue;
      }
      const originalTotal = Number(original.total);
      const allCreditNotesTotal = original.creditNotes.reduce(
        (sum, cn) => sum + Number(cn.total),
        0,
      );
      const isSettled = allCreditNotesTotal >= originalTotal - 0.005;
      result.set(entry.id, {
        isSettledByCreditNote: isSettled,
        invoiceNumber: invoice.invoiceNumber,
        invoiceTotal: originalTotal,
        creditNotesTotal: allCreditNotesTotal,
      });
      continue;
    }

    // Other document types (CORRECTED, SELF_BILLED) — not handled, default to not settled
    result.set(entry.id, {
      isSettledByCreditNote: false,
      invoiceNumber: invoice.invoiceNumber,
      invoiceTotal: Number(invoice.total),
      creditNotesTotal: null,
    });
  }

  return result;
}
