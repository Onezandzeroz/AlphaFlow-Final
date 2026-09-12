/**
 * Test Storecove invoice submission — JSON Pure mode (corrected).
 *
 * Key findings from Storecove docs:
 * 1. Tax category uses full words: "standard" (not "S"), "zero_rated" (not "Z")
 * 2. Tax requires a "country" field (e.g. "DK")
 * 3. Supplier needs publicIdentifiers with scheme "DK:ERST" for VAT number
 *
 * Usage: bun scripts/test-storecove-send.ts
 */

import { db } from '../src/lib/db';

async function main() {
  console.log('═'.repeat(60));
  console.log('  Storecove Test — JSON Pure (corrected)');
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
  console.log('Legal Entity ID:', company.storecoveLegalEntityId);

  const lines = (Array.isArray(invoice.lineItems) ? invoice.lineItems : []) as any[];
  const cvr = company.cvrNumber;
  const vatNumber = `DK${cvr}`;
  const subtotal = Number(invoice.subtotal) || 0;
  const total = Number(invoice.total) || 0;

  // Map UBL category codes → Storecove enum values
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
    document: {
      documentType: 'invoice',
      invoice: {
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.issueDate.toISOString().slice(0, 10),
        dueDate: invoice.dueDate.toISOString().slice(0, 10),
        documentCurrencyCode: invoice.currency || 'DKK',
        accountingSupplierParty: {
          publicIdentifiers: [
            { scheme: '0184', id: cvr },
            { scheme: 'DK:ERST', id: vatNumber },
          ],
        },
        accountingCustomerParty: {
          party: {
            partyName: invoice.customerName,
            address: { country: 'DK', line1: invoice.customerAddress || 'Test Address', city: 'Test', zip: '0000' },
            publicIdentifiers: [{ scheme: testScheme || 'DK:DIGST', id: testIdentifier || 'DK10101011' }],
          },
        },
        invoiceLines: lines.map((line: any) => {
          const percent = Number(line.vatPercent) || Number(line.vatRate) || 25;
          return {
            description: line.description || line.name || 'Linje',
            quantity: Number(line.quantity) || 1,
            itemPrice: Number(line.unitPrice) || Number(line.price) || 0,
            tax: {
              country: 'DK',
              percent,
              category: mapCategory(percent === 0 ? 'Z' : 'S'),
            },
          };
        }),
        taxSubtotals: Array.from(vatGroups.values()).map(g => ({
          country: 'DK',
          taxableAmount: Number(g.taxable.toFixed(2)),
          taxAmount: Number(g.tax.toFixed(2)),
          percent: g.percent,
          category: mapCategory(g.percent === 0 ? 'Z' : 'S'),
        })),
        monetaryTotal: {
          lineExtensionAmount: Number(subtotal.toFixed(2)),
          taxExclusiveAmount: Number(subtotal.toFixed(2)),
          taxInclusiveAmount: Number(total.toFixed(2)),
          payableAmount: Number(total.toFixed(2)),
        },
        paymentMeans: {
          typeCode: '30',
          payeeAccount: { iban: company.bankIban || undefined, accountNumber: company.bankAccount || undefined },
        },
      },
    },
    legalEntityId: company.storecoveLegalEntityId,
    routing: { eIdentifiers: [{ scheme: testScheme || 'DK:DIGST', id: testIdentifier || 'DK10101011' }] },
  };

  console.log('\n=== Request ===');
  console.log('Tax category: standard (25% DK VAT)');
  console.log('Routing:', testScheme + ':' + testIdentifier);

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
