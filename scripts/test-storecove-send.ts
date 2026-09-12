/**
 * Test Storecove invoice submission — uses AlphaFlow's REAL OIOUBL
 * generator output (same as processEInvoiceSend produces) instead of
 * hand-crafted XML. This tests the actual integration.
 *
 * Usage:
 *   bun scripts/test-storecove-send.ts
 *
 * Bun auto-loads .env.
 */

import { db } from '../src/lib/db';
import { generateOIOUBL } from '../src/lib/oioubl-generator';

async function main() {
  console.log('═'.repeat(60));
  console.log('  Storecove Test Submission — Real OIOUBL XML');
  console.log('═'.repeat(60));

  const apiUrl = process.env.STORECOVE_API_URL;
  const apiKey = process.env.STORECOVE_API_KEY;
  const testScheme = process.env.STORECOVE_TEST_RECEIVER_SCHEME;
  const testIdentifier = process.env.STORECOVE_TEST_RECEIVER_IDENTIFIER;

  console.log('\n=== Environment ===');
  console.log('API_URL:', apiUrl);
  console.log('API_KEY:', apiKey ? `${apiKey.slice(0, 12)}...` : '(missing)');
  console.log('TEST_SCHEME:', testScheme || '(missing)');
  console.log('TEST_IDENTIFIER:', testIdentifier || '(missing)');

  if (!apiUrl || !apiKey) {
    console.error('\n✗ Missing env vars');
    process.exit(1);
  }

  // ── 1. Get a DRAFT invoice + company from DB ──────────────────
  console.log('\n=== Finding a DRAFT invoice ===');
  const invoice = await db.invoice.findFirst({
    where: { status: 'DRAFT' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, invoiceNumber: true, customerName: true, customerAddress: true,
      customerEmail: true, customerPhone: true, customerCvr: true,
      issueDate: true, dueDate: true, lineItems: true,
      subtotal: true, vatTotal: true, total: true, currency: true,
      notes: true, documentType: true, originalInvoiceId: true,
      originalInvoice: { select: { invoiceNumber: true } },
    },
  });

  if (!invoice) {
    console.error('\n✗ No DRAFT invoice found. Create one first.');
    process.exit(1);
  }

  console.log('Invoice:', invoice.invoiceNumber, '(', invoice.customerName, ')');
  console.log('Customer CVR:', invoice.customerCvr || '(none)');

  const company = await db.company.findFirst({
    where: { storecoveConnected: true, storecoveLegalEntityId: { not: null } },
    select: {
      id: true, name: true, address: true, email: true, phone: true,
      cvrNumber: true, bankName: true, bankAccount: true, bankIban: true,
      storecoveLegalEntityId: true,
    },
  });

  if (!company || !company.storecoveLegalEntityId) {
    console.error('\n✗ No company with Storecove legal entity connected.');
    process.exit(1);
  }

  console.log('Company:', company.name, '(CVR:', company.cvrNumber + ')');
  console.log('Legal Entity ID:', company.storecoveLegalEntityId);

  // ── 2. Generate REAL OIOUBL XML (same as processEInvoiceSend) ─
  // Apply test-receiver override to customer CVR + endpointScheme
  // so the XML's <cbc:EndpointID> matches the routing endpoint.
  const invoiceInput = {
    ...invoice,
    originalInvoiceNumber: invoice.originalInvoice?.invoiceNumber ?? null,
    // Override customer CVR so XML EndpointID matches routing
    customerCvr: testIdentifier || invoice.customerCvr,
  };

  // Build OIOUBL data (mirrors buildOIOUBLData in einvoice-sender.ts)
  const lines = (Array.isArray(invoiceInput.lineItems) ? invoiceInput.lineItems : []) as Array<{
    description?: string; name?: string; quantity?: number; unitCode?: string;
    unitPrice?: number; price?: number; vatPercent?: number; vatRate?: number;
  }>;

  const invoiceData = {
    invoiceId: invoiceInput.invoiceNumber,
    issueDate: invoiceInput.issueDate.toISOString().slice(0, 10),
    dueDate: invoiceInput.dueDate.toISOString().slice(0, 10),
    invoiceTypeCode: invoiceInput.documentType === 'CREDIT_NOTE' ? '381' : '380',
    originalInvoiceNumber: invoiceInput.documentType === 'CREDIT_NOTE'
      ? (invoiceInput.originalInvoiceNumber || undefined) : undefined,
    supplier: {
      id: company.cvrNumber || 'DK00000000',
      name: company.name,
      streetAddress: company.address || undefined,
      city: undefined,
      country: 'DK',
      vatNumber: company.cvrNumber ? `DK${company.cvrNumber}` : undefined,
      contactEmail: company.email || undefined,
      contactPhone: company.phone || undefined,
    },
    customer: {
      id: invoiceInput.customerCvr || `CUST-${invoiceInput.invoiceNumber}`,
      endpointScheme: testScheme, // e.g. 'DK:DIGST' for test receiver
      name: invoiceInput.customerName,
      streetAddress: invoiceInput.customerAddress || undefined,
      city: undefined,
      country: 'DK',
      vatNumber: invoiceInput.customerCvr ? `DK${invoiceInput.customerCvr}` : undefined,
      contactEmail: invoiceInput.customerEmail || undefined,
    },
    lines: lines.map((line, index) => ({
      id: String(index + 1),
      description: line.description || line.name || 'Linje',
      quantity: Number(line.quantity) || 1,
      unitCode: line.unitCode || 'EA',
      unitPrice: Number(line.unitPrice) || Number(line.price) || 0,
      vatPercent: Number(line.vatPercent) || Number(line.vatRate) || 25,
      vatCategoryCode: (Number(line.vatPercent) || Number(line.vatRate) || 25) === 0 ? 'Z' : 'S',
    })),
    taxTotal: Number(invoiceInput.vatTotal) || 0,
    payableAmount: Number(invoiceInput.total) || 0,
    taxExclusiveAmount: Number(invoiceInput.subtotal) || 0,
    taxInclusiveAmount: Number(invoiceInput.total) || 0,
    paymentMeansCode: '30',
    paymentAccountId: company.bankIban || company.bankAccount || undefined,
    currencyCode: invoiceInput.currency || 'DKK',
  };

  const xmlContent = generateOIOUBL(invoiceData);

  console.log('\n=== Generated OIOUBL XML (first 800 chars) ===');
  console.log(xmlContent.slice(0, 800) + '\n...');

  // ── 3. Build Storecove DocumentSubmission payload ─────────────
  const base64Xml = Buffer.from(xmlContent, 'utf-8').toString('base64');
  const payload = {
    document: {
      documentType: 'invoice',
      rawDocumentData: {
        document: base64Xml,
        parseStrategy: 'ubl',
      },
    },
    legalEntityId: company.storecoveLegalEntityId,
    routing: {
      eIdentifiers: [
        {
          scheme: testScheme || 'DK:DIGST',
          id: testIdentifier || 'DK10101011',
        },
      ],
    },
  };

  console.log('\n=== Request ===');
  console.log('URL:', `${apiUrl}/document_submissions`);
  console.log('Legal Entity ID:', payload.legalEntityId);
  console.log('Routing:', `${testScheme}:${testIdentifier}`);
  console.log('XML length:', xmlContent.length, 'chars');

  // ── 4. Send to Storecove ──────────────────────────────────────
  console.log('\n=== Sending to Storecove... ===');
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

    const responseText = await response.text();

    console.log('\n=== Response ===');
    console.log('Status:', response.status, response.statusText);
    console.log('Body:');
    console.log(responseText);

    try {
      const parsed = JSON.parse(responseText);
      console.log('\n=== Parsed ===');
      console.log(JSON.stringify(parsed, null, 2));
    } catch {}

    if (response.ok) {
      console.log('\n✓ SUCCESS — invoice submitted to Storecove!');
    } else {
      console.log(`\n✗ FAILED — ${response.status}`);
    }
  } catch (err) {
    console.error('\n✗ Network error:', err instanceof Error ? err.message : err);
  }

  await db.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n✗ Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
