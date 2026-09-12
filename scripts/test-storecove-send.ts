/**
 * Storecove Test — Final definitive version based on OpenAPI spec.
 *
 * Key fixes:
 * 1. address.street1 (NOT line1)
 * 2. taxSystem: "tax_line_percentages" (NOT default tax_line_amounts)
 * 3. tax.percentage (NOT tax.percent)
 * 4. invoiceLine.price: { priceAmount, baseQuantity } (unit price object)
 * 5. invoiceLine.amountExcludingTax (line total excluding VAT)
 * 6. party.companyName (NOT partyName)
 * 7. invoice.amountIncludingTax (top-level, NOT monetaryTotal)
 * 8. accountingSupplierParty.publicIdentifiers with DK:ERST for VAT number
 *
 * Usage: bun scripts/test-storecove-send.ts
 */

import { db } from '../src/lib/db';

async function main() {
  console.log('═'.repeat(60));
  console.log('  Storecove Test — Final (OpenAPI spec)');
  console.log('═'.repeat(60));

  const apiUrl = process.env.STORECOVE_API_URL!;
  const apiKey = process.env.STORECOVE_API_KEY!;
  const testScheme = process.env.STORECOVE_TEST_RECEIVER_SCHEME;
  const testIdentifier = process.env.STORECOVE_TEST_RECEIVER_IDENTIFIER;

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
    select: { name: true, cvrNumber: true, address: true, bankIban: true, bankAccount: true, storecoveLegalEntityId: true },
  });
  if (!company?.storecoveLegalEntityId) { console.error('\n✗ No Storecove legal entity.'); process.exit(1); }

  console.log('Invoice:', invoice.invoiceNumber);
  console.log('Company:', company.name, 'CVR:', company.cvrNumber);

  const lines = (Array.isArray(invoice.lineItems) ? invoice.lineItems : []) as any[];
  const cvr = company.cvrNumber;
  const vatNumber = `DK${cvr}`;
  const total = Number(invoice.total) || 0;

  const mapCategory = (ubl: string): string => {
    switch (ubl) {
      case 'S': return 'standard';
      case 'Z': return 'zero_rated';
      case 'E': return 'exempt';
      case 'AE': return 'reverse_charge';
      default: return 'standard';
    }
  };

  // Build tax subtotals grouped by VAT rate
  const vatGroups = new Map<number, { taxable: number; tax: number; percent: number }>();
  for (const line of lines) {
    const percent = Number(line.vatPercent || line.vatRate || 25);
    const lineNet = (Number(line.quantity) || 1) * (Number(line.unitPrice) || Number(line.price) || 0);
    const grp = vatGroups.get(percent) || { taxable: 0, tax: 0, percent };
    grp.taxable += lineNet;
    grp.tax += lineNet * (percent / 100);
    vatGroups.set(percent, grp);
  }

  const payload = {
    legalEntityId: company.storecoveLegalEntityId,
    routing: { eIdentifiers: [{ scheme: testScheme || 'DK:DIGST', id: testIdentifier || 'DK10101011' }] },
    invoice: {
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate.toISOString().slice(0, 10),
      dueDate: invoice.dueDate.toISOString().slice(0, 10),
      documentCurrencyCode: invoice.currency || 'DKK',
      taxSystem: 'tax_line_percentages',
      amountIncludingTax: Number(total.toFixed(2)),

      // Supplier — publicIdentifiers with tax identifier (DK:ERST)
      accountingSupplierParty: {
        publicIdentifiers: [
          { scheme: '0184', id: cvr },
          { scheme: 'DK:ERST', id: vatNumber },
        ],
      },

      // Customer (receiver) — address uses street1 (NOT line1)
      accountingCustomerParty: {
        party: {
          companyName: invoice.customerName,
          address: {
            country: 'DK',
            street1: invoice.customerAddress || 'Test Street 1',
            city: 'Test City',
            zip: '0000',
          },
        },
        publicIdentifiers: [{ scheme: testScheme || 'DK:DIGST', id: testIdentifier || 'DK10101011' }],
      },

      // Invoice lines — price object + amountExcludingTax + tax{country,percentage,category}
      invoiceLines: lines.map((line: any) => {
        const percent = Number(line.vatPercent) || Number(line.vatRate) || 25;
        const qty = Number(line.quantity) || 1;
        const unitPrice = Number(line.unitPrice) || Number(line.price) || 0;
        return {
          description: line.description || line.name || 'Linje',
          quantity: qty,
          amountExcludingTax: Number((qty * unitPrice).toFixed(2)),
          price: {
            priceAmount: Number(unitPrice.toFixed(2)),
            baseQuantity: 1,
          },
          tax: {
            country: 'DK',
            percentage: percent,
            category: mapCategory(percent === 0 ? 'Z' : 'S'),
          },
        };
      }),

      // Tax subtotals
      taxSubtotals: Array.from(vatGroups.values()).map(g => ({
        taxableAmount: Number(g.taxable.toFixed(2)),
        taxAmount: Number(g.tax.toFixed(2)),
        percentage: g.percent,
        category: mapCategory(g.percent === 0 ? 'Z' : 'S'),
        country: 'DK',
      })),
    },
  };

  console.log('\n=== Sending... ===');
  try {
    const response = await fetch(`${apiUrl}/document_submissions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    console.log('\n=== Response ===');
    console.log('Status:', response.status, response.statusText);
    console.log('Body:', text);
    try { console.log('\nParsed:', JSON.stringify(JSON.parse(text), null, 2)); } catch {}
    if (response.ok) console.log('\n✓ SUCCESS!'); else console.log(`\n✗ FAILED — ${response.status}`);
  } catch (err) {
    console.error('\n✗ Error:', err instanceof Error ? err.message : err);
  }

  await db.$disconnect();
  process.exit(0);
}

main().catch((err) => { console.error('\n✗ Fatal:', err instanceof Error ? err.message : err); process.exit(1); });
