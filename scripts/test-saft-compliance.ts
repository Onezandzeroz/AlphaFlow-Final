/**
 * SAF-T v2.1 Compliance Test Script
 *
 * Generates a minimal valid SAF-T XML document and validates it against
 * the v2.1 validator. Run with: `bun run scripts/test-saft-compliance.ts`
 *
 * This is NOT a unit test framework — it's a simple smoke test that:
 * 1. Builds a minimal v2.1-compliant XML (Header + MasterFiles + GL Entries)
 * 2. Runs validateSAFT() against it
 * 3. Prints pass/fail for each check
 * 4. Also generates an intentionally-broken XML to verify the validator
 *    catches common violations (wrong namespace, bad AccountType, dangling refs)
 */

import { validateSAFT } from '../src/lib/saft-validator';

// ─── Minimal valid SAF-T v2.1 XML ────────────────────────────────────

const VALID_SAFT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<AuditFile xmlns="urn:StandardAuditFile-Taxation-Financial:DK" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Header>
    <AuditFileVersion>2.1</AuditFileVersion>
    <AuditFileCountry>DK</AuditFileCountry>
    <AuditFileDateCreated>2026-01-15T10:30:00.000Z</AuditFileDateCreated>
    <SoftwareCompanyName>AlphaFlow</SoftwareCompanyName>
    <SoftwareID>AlphaFlow v1.0</SoftwareID>
    <SoftwareVersion>1.0.0</SoftwareVersion>
    <CompanyID>DK12345678</CompanyID>
    <TaxRegistrationNumber>DK12345678</TaxRegistrationNumber>
    <Company>
      <RegistrationNumber>DK12345678</RegistrationNumber>
      <Name>Test Company ApS</Name>
      <Address>
        <StreetName>Testvej 1</StreetName>
        <Country>DK</Country>
      </Address>
    </Company>
    <SelectionCriteria>
      <PeriodStart>2026-01-01</PeriodStart>
      <PeriodEnd>2026-01-31</PeriodEnd>
    </SelectionCriteria>
  </Header>
  <MasterFiles>
    <GeneralLedgerAccounts>
      <NameOfStandardAccount>Standardkontoplanen</NameOfStandardAccount>
      <VersionOfStandardAccount>20260101</VersionOfStandardAccount>
      <Account>
        <AccountID>1000</AccountID>
        <AccountDescription>Salgsindtægter</AccountDescription>
        <AccountType>Sale</AccountType>
      </Account>
      <Account>
        <AccountID>2000</AccountID>
        <AccountDescription>Leverandørgæld</AccountDescription>
        <AccountType>Liability</AccountType>
      </Account>
      <Account>
        <AccountID>3000</AccountID>
        <AccountDescription>Kasse</AccountDescription>
        <AccountType>Asset</AccountType>
      </Account>
    </GeneralLedgerAccounts>
    <TaxTable>
      <TaxCodeDetails>
        <TaxCode>S25</TaxCode>
        <StandardTaxCode>S01</StandardTaxCode>
        <Description>Salgsmoms 25%</Description>
        <TaxPercentage>25</TaxPercentage>
        <Country>DK</Country>
      </TaxCodeDetails>
      <TaxCodeDetails>
        <TaxCode>K25</TaxCode>
        <StandardTaxCode>K01</StandardTaxCode>
        <Description>Købsmoms 25%</Description>
        <TaxPercentage>25</TaxPercentage>
        <Country>DK</Country>
      </TaxCodeDetails>
    </TaxTable>
    <Customers>
      <Customer>
        <CustomerID>CUST-001</CustomerID>
        <CompanyName>Test Customer A/S</CompanyName>
        <CustomerTaxID>DK87654321</CustomerTaxID>
        <Address>
          <StreetName>Kundevej 2</StreetName>
          <City>København</City>
          <PostalCode>1000</PostalCode>
          <Country>DK</Country>
        </Address>
      </Customer>
    </Customers>
    <Suppliers>
      <Supplier>
        <SupplierID>SUPP-001</SupplierID>
        <CompanyName>Test Supplier ApS</CompanyName>
        <SupplierTaxID>DK11223344</SupplierTaxID>
        <Address>
          <StreetName>Leverandørvej 3</StreetName>
          <City>Aarhus</City>
          <PostalCode>8000</PostalCode>
          <Country>DK</Country>
        </Address>
      </Supplier>
    </Suppliers>
  </MasterFiles>
  <GeneralLedgerEntries>
    <NumberOfEntries>1</NumberOfEntries>
    <TotalDebit>1000.00</TotalDebit>
    <TotalCredit>1000.00</TotalCredit>
    <Journal>
      <JournalID>GL</JournalID>
      <Description>General Ledger</Description>
      <Type>GL</Type>
      <Transaction>
        <TransactionID>TXN-001</TransactionID>
        <TransactionDate>2026-01-15</TransactionDate>
        <SourceDocumentID>INV-001</SourceDocumentID>
        <Lines>
          <Line>
            <RecordID>TXN-001-1</RecordID>
            <AccountID>3000</AccountID>
            <Description>Salg til kunde</Description>
            <DebitAmount>1000.00</DebitAmount>
            <CreditAmount>0.00</CreditAmount>
            <TaxPointDate>2026-01-15</TaxPointDate>
          </Line>
          <Line>
            <RecordID>TXN-001-2</RecordID>
            <AccountID>1000</AccountID>
            <Description>Salgsindtægt</Description>
            <DebitAmount>0.00</DebitAmount>
            <CreditAmount>1000.00</CreditAmount>
          </Line>
        </Lines>
      </Transaction>
    </Journal>
  </GeneralLedgerEntries>
  <SourceDocuments>
    <SalesInvoices>
      <Invoice>
        <InvoiceNo>INV-001</InvoiceNo>
        <InvoiceDate>2026-01-15</InvoiceDate>
        <CustomerID>CUST-001</CustomerID>
        <InvoiceType>Invoice</InvoiceType>
        <Lines>
          <Line>
            <LineNumber>1</LineNumber>
            <Description>Test ydelse</Description>
            <Quantity>1</Quantity>
            <UnitPrice>1000.00</UnitPrice>
            <TaxBaseAmount>1000.00</TaxBaseAmount>
            <Tax>
              <TaxCode>S25</TaxCode>
              <TaxAmount>250.00</TaxAmount>
            </Tax>
          </Line>
        </Lines>
        <Settlement>
          <SettlementAmount>1250.00</SettlementAmount>
        </Settlement>
      </Invoice>
    </SalesInvoices>
  </SourceDocuments>
</AuditFile>`;

// ─── Intentionally broken XML (should FAIL validation) ───────────────

const BROKEN_SAFT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<AuditFile xmlns="urn:Oasis/Tax/Accounting/SAF-T/Financial/DK" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Header>
    <AuditFileVersion>1.0</AuditFileVersion>
    <AuditFileCountry>DK</AuditFileCountry>
    <AuditFileDateCreated>2026-01-15</AuditFileDateCreated>
    <SoftwareCompanyName>AlphaFlow</SoftwareCompanyName>
    <SoftwareID>AlphaFlow</SoftwareID>
    <CompanyID>DK12345678</CompanyID>
    <Company>
      <RegistrationNumber>DK12345678</RegistrationNumber>
      <Name>Test</Name>
    </Company>
    <SelectionCriteria>
      <PeriodStart>2026-01-01</PeriodStart>
      <PeriodEnd>2026-01-31</PeriodEnd>
    </SelectionCriteria>
  </Header>
  <MasterFiles>
    <GeneralLedgerAccounts>
      <Account>
        <AccountID>1000</AccountID>
        <AccountDescription>Test</AccountDescription>
        <AccountType>OT</AccountType>
      </Account>
    </GeneralLedgerAccounts>
    <TaxTable>
      <TaxCodeDetails>
        <TaxCode>S25</TaxCode>
        <Description>Test</Description>
        <TaxPercentage>25</TaxPercentage>
        <Country>DK</Country>
      </TaxCodeDetails>
    </TaxTable>
  </MasterFiles>
  <GeneralLedgerEntries>
    <NumberOfEntries>1</NumberOfEntries>
    <TotalDebit>1000.00</TotalDebit>
    <TotalCredit>500.00</TotalCredit>
    <Journal>
      <JournalID>GL</JournalID>
      <Type>GL</Type>
      <Transaction>
        <TransactionID>TXN-001</TransactionID>
        <TransactionDate>2026-01-15</TransactionDate>
        <Lines>
          <Line>
            <RecordID>TXN-001-1</RecordID>
            <AccountID>9999</AccountID>
            <Description>Dangling ref</Description>
            <DebitAmount>1000.00</DebitAmount>
            <CreditAmount>0.00</CreditAmount>
          </Line>
        </Lines>
      </Transaction>
    </Journal>
  </GeneralLedgerEntries>
</AuditFile>`;

// ─── Test runner ─────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}`);
    failed++;
  }
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  SAF-T v2.1 Compliance Test Suite');
console.log('═══════════════════════════════════════════════════════════════\n');

// ── Test 1: Valid XML should pass ────────────────────────────────────
console.log('Test 1: Valid SAF-T v2.1 XML — should pass all checks');
const validResult = validateSAFT(VALID_SAFT_XML);
assert(validResult.isValid, 'Valid XML passes validation (no errors)');
assert(validResult.errors.length === 0, `No errors (got ${validResult.errors.length})`);
assert(validResult.summary.passed >= 10, `At least 10 checks passed (got ${validResult.summary.passed})`);
if (validResult.errors.length > 0) {
  console.log('  Errors:');
  validResult.errors.forEach(e => console.log(`    [${e.code}] ${e.message}`));
}
console.log('');

// ── Test 2: Broken XML should fail with specific errors ──────────────
console.log('Test 2: Broken SAF-T XML — should fail with specific errors');
const brokenResult = validateSAFT(BROKEN_SAFT_XML);
assert(!brokenResult.isValid, 'Broken XML fails validation');
const errorCodes = brokenResult.errors.map(e => e.code);
assert(errorCodes.includes('INVALID_NAMESPACE'), 'Catches wrong namespace');
assert(errorCodes.includes('INVALID_VERSION'), 'Catches wrong version (1.0)');
assert(errorCodes.includes('INVALID_ACCOUNT_TYPE'), `Catches invalid AccountType "OT" (codes: ${errorCodes.join(', ')})`);
assert(errorCodes.includes('BALANCE_MISMATCH'), 'Catches debit/credit mismatch');
assert(errorCodes.includes('DANGLING_ACCOUNT_REF'), 'Catches dangling AccountID reference (9999)');
console.log('  All expected errors detected:');
brokenResult.errors.forEach(e => console.log(`    [${e.code}] ${e.message.substring(0, 80)}`));
console.log('');

// ── Summary ──────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
