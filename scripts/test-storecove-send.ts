/**
 * Test Storecove invoice submission directly — shows the EXACT error
 * from Storecove's API (422 validation details, etc.)
 *
 * Usage:
 *   bun scripts/test-storecove-send.ts
 *
 * Bun auto-loads .env, so no need to source it first.
 */

import { db } from '../src/lib/db';

async function main() {
  console.log('═'.repeat(60));
  console.log('  Storecove Test Submission — Diagnostic');
  console.log('═'.repeat(60));

  // 1. Check env vars
  const apiUrl = process.env.STORECOVE_API_URL;
  const apiKey = process.env.STORECOVE_API_KEY;
  const testScheme = process.env.STORECOVE_TEST_RECEIVER_SCHEME;
  const testIdentifier = process.env.STORECOVE_TEST_RECEIVER_IDENTIFIER;

  console.log('\n=== Environment ===');
  console.log('STORECOVE_API_URL:', apiUrl || '(missing)');
  console.log('STORECOVE_API_KEY:', apiKey ? `${apiKey.slice(0, 12)}...` : '(missing)');
  console.log('TEST_RECEIVER_SCHEME:', testScheme || '(missing)');
  console.log('TEST_RECEIVER_IDENTIFIER:', testIdentifier || '(missing)');

  if (!apiUrl || !apiKey) {
    console.error('\n✗ STORECOVE_API_URL or STORECOVE_API_KEY not set in .env');
    process.exit(1);
  }

  // 2. Get legal entity ID from DB
  console.log('\n=== Legal Entity from DB ===');
  const company = await db.company.findFirst({
    where: { storecoveConnected: true, storecoveLegalEntityId: { not: null } },
    select: {
      id: true,
      name: true,
      cvrNumber: true,
      storecoveLegalEntityId: true,
      storecoveConnected: true,
    },
  });

  if (!company || !company.storecoveLegalEntityId) {
    console.error('\n✗ No company with a connected Storecove legal entity found.');
    console.error('  Create one via the UI: Settings → eLevering → Opret juridisk enhed i Storecove');
    process.exit(1);
  }

  console.log('Company:', company.name);
  console.log('CVR:', company.cvrNumber);
  console.log('Legal Entity ID:', company.storecoveLegalEntityId);

  // 3. Build minimal test OIOUBL XML
  const testXml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01</cbc:ProfileID>
  <cbc:ID>TEST-001</cbc:ID>
  <cbc:IssueDate>2026-09-12</cbc:IssueDate>
  <cbc:DueDate>2026-10-12</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>DKK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0184">${company.cvrNumber}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${company.name}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Test Address</cbc:StreetName>
        <cbc:CityName>Aarhus</cbc:CityName>
        <cbc:PostalZone>8000</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>DK</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>DK${company.cvrNumber}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${company.name}</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="${testScheme || 'DK:DIGST'}">${testIdentifier || 'DK10101011'}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Storecove Test Receiver</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Test</cbc:StreetName>
        <cbc:CityName>Test</cbc:CityName>
        <cbc:PostalZone>0000</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>DK</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="DKK">2500.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="DKK">10000.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="DKK">2500.00</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="DKK">10000.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="DKK">10000.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="DKK">12500.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="DKK">12500.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">5</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="DKK">10000.00</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Description>Test item</cbc:Description>
      <cbc:Name>Test item</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="DKK">2000.00</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  // 4. Build request payload — Storecove DocumentSubmission format
  // The document field is an OBJECT (not a raw string), containing
  // documentType + rawDocumentData with base64-encoded XML.
  const base64Xml = Buffer.from(testXml, 'utf-8').toString('base64');
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
      eIdentifiers: {
        scheme: testScheme || 'DK:DIGST',
        identifier: testIdentifier || 'DK10101011',
      },
    },
  };

  console.log('\n=== Request ===');
  console.log('URL:', `${apiUrl}/document_submissions`);
  console.log('Legal Entity ID:', payload.legalEntityId);
  console.log('Routing scheme:', payload.routing.eIdentifiers.scheme);
  console.log('Routing identifier:', payload.routing.eIdentifiers.identifier);
  console.log('XML length:', testXml.length, 'chars');

  // 5. Send to Storecove
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
    console.log('Raw body:');
    console.log(responseText);

    // Try to parse as JSON for pretty-print
    try {
      const parsed = JSON.parse(responseText);
      console.log('\n=== Parsed JSON ===');
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      // Not JSON — already printed raw
    }

    if (response.ok) {
      console.log('\n✓ SUCCESS — invoice submitted to Storecove');
    } else {
      console.log(`\n✗ FAILED — Storecove returned ${response.status}`);
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
