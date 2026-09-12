/**
 * Test Storecove invoice submission — JSON Pure mode with supplier tax identifier.
 *
 * Root cause of "sender has no VAT number" error:
 *   The LegalEntity in Storecove has a Peppol identifier (0184:CVR) which is
 *   the ROUTING identifier, but Storecove also needs a TAX identifier to fill
 *   in the PartyTaxScheme/CompanyID (VAT number) in the generated UBL.
 *
 *   For Denmark, the tax identifier scheme is "DK:ERST" (Erhvervsstyrelsen).
 *   See Storecove docs §6.3 "Receiver Identifiers" table:
 *     EU DK B+G DK:DIGST DK:ERST DK:DIGST
 *                  (Legal)  (Tax)  (Routing)
 *
 *   The LegalEntity schema has no explicit VAT number field, so the tax
 *   identifier must be provided in the Invoice JSON's
 *   accountingSupplierParty.publicIdentifiers.
 *
 * Usage: bun scripts/test-storecove-send.ts
 */

import { db } from '../src/lib/db';

async function main() {
  console.log('═'.repeat(60));
  console.log('  Storecove Test — JSON Pure + Supplier Tax ID');
  console.log('═'.repeat(60));

  const apiUrl = process.env.STORECOVE_API_URL!;
  const apiKey = process.env.STORECOVE_API_KEY!;
  const testScheme = process.env.STORECOVE_TEST_RECEIVER_SCHEME;
  const testIdentifier = process.env.STORECOVE_TEST_RECEIVER_IDENTIFIER;

  // ── 1. Get DRAFT invoice + company ─────────────────────────────
  const invoice = await db.invoice.findFirst({
    where: { status: 'DRAFT' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, invoiceNumber: true, customerName: true, customerAddress: true,
      issueDate: true, dueDate: true, lineItems: true,
      subtotal: true, vatTotal: true, total: true, currency: true,
    },
  });
  if (!invoice) { console.error('\n✗ No DRAFT invoice found.'); process.exit(1); }

  const company = await db.company.findFirst({
    where: { storecoveConnected: true, storecoveLegalEntityId: { not: null } },
    select: {
      name: true, cvrNumber: true, address: true, email: true, phone: true,
      bankIban: true, bankAccount: true, storecoveLegalEntityId: true,
    },
  });
  if (!company?.storecoveLegalEntityId) { console.error('\n✗ No Storecove legal entity.'); process.exit(1); }

  console.log('Invoice:', invoice.invoiceNumber);
  console.log('Company:', company.name, 'CVR:', company.cvrNumber);
  console.log('Legal Entity ID:', company.storecoveLegalEntityId);

  // ── 2. Parse line items + build tax subtotals ──────────────────
  const lines = (Array.isArray(invoice.lineItems) ? invoice.lineItems : []) as any[];
  const vatGroups = new Map<number, { taxable: number; tax: number; percent: number }>();
  for (const line of lines) {
    const percent = Number(line.vatPercent || line.vatRate || 25);
    const lineNet = (Number(line.quantity) || 1) * (Number(line.unitPrice) || Number(line.price) || 0);
    const grp = vatGroups.get(percent) || { taxable: 0, tax: 0, percent };
    grp.taxable += lineNet;
    grp.tax += lineNet * (percent / 100);
    vatGroups.set(percent, grp);
  }

  const subtotal = Number(invoice.subtotal) || 0;
  const total = Number(invoice.total) || 0;
  const cvr = company.cvrNumber;
  const vatNumber = `DK${cvr}`; // Danish VAT = "DK" + 8-digit CVR

  // ── 3. Build JSON Pure invoice payload ─────────────────────────
  // KEY FIX: Include accountingSupplierParty.publicIdentifiers with
  // the tax identifier (DK:ERST) so Storecove can fill in the
  // PartyTaxScheme/CompanyID (VAT number) in the generated UBL.
  const payload = {
    document: {
      documentType: 'invoice',
      invoice: {
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.issueDate.toISOString().slice(0, 10),
        dueDate: invoice.dueDate.toISOString().slice(0, 10),
        documentCurrencyCode: invoice.currency || 'DKK',

        // ── Supplier (sender) ──────────────────────────────────
        // Most supplier data comes from the LegalEntity, but we
        // provide the tax identifier explicitly so Storecove can
        // fill in PartyTaxScheme/CompanyID (VAT number).
        accountingSupplierParty: {
          publicIdentifiers: [
            // Legal identifier (CVR) — scheme 0184 = Danish CVR register
            { scheme: '0184', id: cvr },
            // Tax identifier (VAT) — scheme DK:ERST = Erhvervsstyrelsen
            // This is what Storecove uses for PartyTaxScheme/CompanyID
            { scheme: 'DK:ERST', id: vatNumber },
          ],
        },

        // ── Customer (receiver) ────────────────────────────────
        accountingCustomerParty: {
          party: {
            partyName: invoice.customerName,
            address: {
              country: 'DK',
              line1: invoice.customerAddress || 'Test Address',
              city: 'Test',
              zip: '0000',
            },
            publicIdentifiers: [
              { scheme: testScheme || 'DK:DIGST', id: testIdentifier || 'DK10101011' },
            ],
          },
        },

        // ── Invoice lines ──────────────────────────────────────
        invoiceLines: lines.map((line: any) => ({
          description: line.description || line.name || 'Linje',
          quantity: Number(line.quantity) || 1,
          itemPrice: Number(line.unitPrice) || Number(line.price) || 0,
          tax: {
            percent: Number(line.vatPercent) || Number(line.vatRate) || 25,
            category: (Number(line.vatPercent) || Number(line.vatRate) || 25) === 0 ? 'Z' : 'S',
          },
        })),

        // ── Tax subtotals ──────────────────────────────────────
        taxSubtotals: Array.from(vatGroups.values()).map(g => ({
          taxableAmount: Number(g.taxable.toFixed(2)),
          taxAmount: Number(g.tax.toFixed(2)),
          percent: g.percent,
          category: g.percent === 0 ? 'Z' : 'S',
        })),

        // ── Monetary totals ────────────────────────────────────
        monetaryTotal: {
          lineExtensionAmount: Number(subtotal.toFixed(2)),
          taxExclusiveAmount: Number(subtotal.toFixed(2)),
          taxInclusiveAmount: Number(total.toFixed(2)),
          payableAmount: Number(total.toFixed(2)),
        },

        // ── Payment means ──────────────────────────────────────
        paymentMeans: {
          typeCode: '30',
          payeeAccount: {
            iban: company.bankIban || undefined,
            accountNumber: company.bankAccount || undefined,
          },
        },
      },
    },
    legalEntityId: company.storecoveLegalEntityId,
    routing: {
      eIdentifiers: [
        { scheme: testScheme || 'DK:DIGST', id: testIdentifier || 'DK10101011' },
      ],
    },
  };

  console.log('\n=== Request ===');
  console.log('Supplier tax ID:', `${vatNumber} (scheme: DK:ERST)`);
  console.log('Routing:', `${testScheme}:${testIdentifier}`);
  console.log('Lines:', payload.document.invoice.invoiceLines.length);

  // ── 4. Send to Storecove ───────────────────────────────────────
  console.log('\n=== Sending... ===');
  try {
    const response = await fetch(`${apiUrl}/document_submissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    console.log('\n=== Response ===');
    console.log('Status:', response.status, response.statusText);
    console.log('Body:', text);
    try { console.log('\nParsed:', JSON.stringify(JSON.parse(text), null, 2)); } catch {}

    if (response.ok) console.log('\n✓ SUCCESS!');
    else console.log(`\n✗ FAILED — ${response.status}`);
  } catch (err) {
    console.error('\n✗ Error:', err instanceof Error ? err.message : err);
  }

  await db.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n✗ Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
