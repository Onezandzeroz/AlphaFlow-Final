/**
 * Storecove Test — Definitive JSON Pure mode based on OpenAPI spec.
 *
 * Field names confirmed from Storecove's OpenAPI 2.0 spec at
 * https://api.storecove.com/api/v2/openapi.json
 *
 * Usage: bun scripts/test-storecove-send.ts
 */

import { db } from '../src/lib/db';

async function main() {
  console.log('═'.repeat(60));
  console.log('  Storecove Test — Definitive (OpenAPI spec)');
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
    select: { name: true, cvrNumber: true, bankIban: true, bankAccount: true, storecoveLegalEntityId: true },
  });
  if (!company?.storecoveLegalEntityId) { console.error('\n✗ No Storecove legal entity.'); process.exit(1); }

  console.log('Invoice:', invoice.invoiceNumber);
  console.log('Company:', company.name, 'CVR:', company.cvrNumber);

  const lines = (Array.isArray(invoice.lineItems) ? invoice.lineItems : []) as any[];
  const cvr = company.cvrNumber;
  const vatNumber = `DK${cvr}`;
  const subtotal = Number(invoice.subtotal) || 0;
  const vatTotal = Number(invoice.vatTotal) || 0;
  const total = Number(invoice.total) || 0;

  // Map UBL category → Storecove enum (from OpenAPI spec Tax.category)
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

  // Build the InvoiceSubmission payload per OpenAPI spec:
  // - InvoiceSubmission.invoice = Invoice object
  // - InvoiceLine uses: description, quantity, amountExcludingTax, tax{country,percentage,category}
  // - Tax uses "percentage" (NOT "percent"), "country", "category"
  // - TaxSubtotal uses: taxableAmount, taxAmount, percentage, category, country
  // - Party uses "companyName" (NOT "partyName")
  // - Invoice top-level: amountIncludingTax (EXPERIMENTAL but accepted)
  const payload = {
    legalEntityId: company.storecoveLegalEntityId,
    routing: {
      eIdentifiers: [{ scheme: testScheme || 'DK:DIGST', id: testIdentifier || 'DK10101011' }],
    },
    invoice: {
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate.toISOString().slice(0, 10),
      dueDate: invoice.dueDate.toISOString().slice(0, 10),
      documentCurrencyCode: invoice.currency || 'DKK',
      amountIncludingTax: Number(total.toFixed(2)),

      // Supplier — tax identifier required for VAT number
      accountingSupplierParty: {
        publicIdentifiers: [
          { scheme: '0184', id: cvr },
          { scheme: 'DK:ERST', id: vatNumber },
        ],
      },

      // Customer (receiver)
      accountingCustomerParty: {
        party: {
          companyName: invoice.customerName,
          address: {
            country: 'DK',
            line1: invoice.customerAddress || 'Test Address',
            city: 'Test',
            zip: '0000',
          },
        },
        publicIdentifiers: [{ scheme: testScheme || 'DK:DIGST', id: testIdentifier || 'DK10101011' }],
      },

      // Invoice lines — amountExcludingTax + tax{country,percentage,category}
      invoiceLines: lines.map((line: any) => {
        const percent = Number(line.vatPercent) || Number(line.vatRate) || 25;
        const qty = Number(line.quantity) || 1;
        const unitPrice = Number(line.unitPrice) || Number(line.price) || 0;
        const lineNet = qty * unitPrice;
        return {
          description: line.description || line.name || 'Linje',
          quantity: qty,
          amountExcludingTax: Number(lineNet.toFixed(2)),
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

  console.log('\n=== Payload structure ===');
  console.log('Top-level keys:', Object.keys(payload));
  console.log('Invoice keys:', Object.keys(payload.invoice));
  console.log('First line keys:', Object.keys((payload.invoice as any).invoiceLines[0] || {}));
  console.log('Tax keys:', Object.keys((payload.invoice as any).invoiceLines[0]?.tax || {}));

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
