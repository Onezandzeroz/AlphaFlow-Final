import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tenantFilter } from '@/lib/rbac';
import { create } from 'xmlbuilder2';
import { logger } from '@/lib/logger';
import {
  validateSAFT,
  logValidationResults,
} from '@/lib/saft-validator';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

// Danish SAF-T Financial DK v2.1 export endpoint
// Based on Danish_SAF-T_Financial_Schema_v_2_1.xsd (Erhvervsstyrelsen, 2026-07-03)
// Repo: https://git.erst.dk/standard-filformater/standard-filformater
//
// v2.1 compliance:
// - Namespace: urn:StandardAuditFile-Taxation-Financial:DK
// - AuditFileVersion: "2.1"
// - AccountType: Asset | Liability | Sale | Expense | Other (XSD enum)
// - TaxTable > TaxCodeDetails with TaxCode + StandardTaxCode
// - MasterFiles includes GeneralLedgerAccounts, TaxTable, Customers, Suppliers
// - GeneralLedgerEntries contains NumberOfEntries/TotalDebit/TotalCredit directly
//   (NO separate <Totals> element — it doesn't exist in the XSD)

import { VAT_RATE_MAP, OUTPUT_VAT_CODES, INPUT_VAT_CODES } from '@/lib/vat-utils';
import { getMappedSaftVatCodes, getSaftVatCode } from '@/lib/saft-vat-codes';
import { STANDARDKONTOPLAN_VERSION } from '@/lib/official-standard-chart';

// ─── SAF-T v2.1 Constants ────────────────────────────────────────────

const SAFT_NAMESPACE = 'urn:StandardAuditFile-Taxation-Financial:DK';
const SAFT_VERSION = '2.1';
const SAFT_XSD_FILENAME = 'Danish_SAF-T_Financial_Schema_v_2_1.xsd';

// AccountType enum per XSD v2.1 (closed list)
// AlphaFlow AccountType → SAF-T AccountType
const ACCOUNT_TYPE_MAP: Record<string, string> = {
  ASSET: 'Asset',
  LIABILITY: 'Liability',
  EQUITY: 'Other',      // EQUITY is not in the XSD enum; "Other" is the closest
  REVENUE: 'Sale',
  EXPENSE: 'Expense',
};

// ─── Helpers ────────────────────────────────────────────────────────

const r = (n: number) => Math.round(n * 100) / 100;
const formatDate = (date: Date) => date.toISOString().substring(0, 10);
const formatDateTime = (date: Date) => date.toISOString();
const formatNumber = (num: number) => num.toFixed(2);

// ─── GET Handler ────────────────────────────────────────────────────

export const GET = withGuard(
  { auth: true, requireCompany: true, requireTokenPay: true, permissions: [Permission.REPORTS_SAFT] },
  async (request, ctx) => {
    try {
      // ── Period parsing ──
      const { searchParams } = new URL(request.url);
      const month = searchParams.get('month');
      const startDate = searchParams.get('startDate');
      const endDate = searchParams.get('endDate');

      let periodStart: Date;
      let periodEnd: Date;

      if (month) {
        const [year, monthNum] = month.split('-').map(Number);
        periodStart = new Date(year, monthNum - 1, 1);
        periodEnd = new Date(year, monthNum, 0, 23, 59, 59, 999);
      } else if (startDate && endDate) {
        periodStart = new Date(startDate);
        periodEnd = new Date(endDate);
        periodEnd.setHours(23, 59, 59, 999);
      } else {
        const now = new Date();
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      }

      // ── Company info ──
      const companyData = ctx.activeCompanyId
        ? await db.company.findUnique({
            where: { id: ctx.activeCompanyId },
            select: { name: true, cvrNumber: true, address: true, email: true, phone: true },
          })
        : null;

      const companyName = companyData?.name || ctx.businessName || ctx.email.split('@')[0];
      const companyCVR = companyData?.cvrNumber || 'DK' + ctx.id.substring(0, 8).toUpperCase();
      const companyAddress = companyData?.address || '';
      const companyEmail = companyData?.email || ctx.email;
      const companyPhone = companyData?.phone || '';

      // ── Fetch journal entries (POSTED, non-cancelled) ──
      const filter = tenantFilter(ctx);

      const journalEntries = await db.journalEntry.findMany({
        where: {
          ...filter,
          status: 'POSTED',
          cancelled: false,
          date: { gte: periodStart, lte: periodEnd },
        },
        include: {
          lines: {
            include: { account: true },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { date: 'asc' },
      });

      logger.info(
        `[SAF-T Export] Fetched ${journalEntries.length} journal entries for period ${month || 'custom'}`,
      );

      // ── Calculate VAT totals from journal entry lines ──
      const vatCodeMap = new Map<string, { debitTotal: number; creditTotal: number }>();

      for (const entry of journalEntries) {
        for (const line of entry.lines) {
          const code = line.vatCode || 'NONE';
          const existing = vatCodeMap.get(code) || { debitTotal: 0, creditTotal: 0 };
          existing.debitTotal += Number(line.debit) || 0;
          existing.creditTotal += Number(line.credit) || 0;
          vatCodeMap.set(code, existing);
        }
      }

      let totalOutputVAT = 0;
      let totalInputVAT = 0;

      for (const code of OUTPUT_VAT_CODES) {
        const data = vatCodeMap.get(code);
        if (data && (data.debitTotal > 0 || data.creditTotal > 0)) {
          totalOutputVAT += r(data.creditTotal - data.debitTotal);
        }
      }

      for (const code of INPUT_VAT_CODES) {
        const data = vatCodeMap.get(code);
        if (data && (data.debitTotal > 0 || data.creditTotal > 0)) {
          totalInputVAT += r(data.debitTotal - data.creditTotal);
        }
      }

      totalOutputVAT = r(totalOutputVAT);
      totalInputVAT = r(totalInputVAT);

      // VAT breakdown by code
      const vatBreakdown: Array<{
        code: string;
        rate: number;
        description: string;
        debitTotal: number;
        creditTotal: number;
        netAmount: number;
      }> = [];

      const allVatCodes = [...OUTPUT_VAT_CODES, ...INPUT_VAT_CODES, 'NONE'];
      for (const code of allVatCodes) {
        const data = vatCodeMap.get(code);
        if (data && (data.debitTotal > 0 || data.creditTotal > 0)) {
          const isOutput = (OUTPUT_VAT_CODES as readonly string[]).includes(code);
          const netAmount = isOutput
            ? r(data.creditTotal - data.debitTotal)
            : r(data.debitTotal - data.creditTotal);

          vatBreakdown.push({
            code,
            rate: VAT_RATE_MAP[code] ?? 0,
            description: getVatCodeDescription(code),
            debitTotal: r(data.debitTotal),
            creditTotal: r(data.creditTotal),
            netAmount,
          });
        }
      }

      // ── Calculate general ledger totals ──
      let totalDebit = 0;
      let totalCredit = 0;
      let transactionCount = 0;

      for (const entry of journalEntries) {
        if (entry.lines && entry.lines.length > 0) {
          transactionCount++;
          for (const line of entry.lines) {
            totalDebit += Number(line.debit) || 0;
            totalCredit += Number(line.credit) || 0;
          }
        }
      }

      totalDebit = r(totalDebit);
      totalCredit = r(totalCredit);

      // ── Build SAF-T XML v2.1 ──
      logger.info('[SAF-T Export] Building XML structure (v2.1)...');

      const doc = create({ version: '1.0', encoding: 'UTF-8' });

      const root = doc.ele('AuditFile', {
        xmlns: SAFT_NAMESPACE,
        'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        // Note: xsi:schemaLocation is omitted — the XSD is served from /schemas/
        // and consumers validate against it. Including a relative path here can
        // confuse some validators. The namespace alone is authoritative.
      });

      // ═══════════════════════════════════════════════════════════════
      // 1. Header (M 1..1) — per HeaderStructure + CompanyHeaderStructure
      // XSD requires this exact element order:
      //   AuditFileVersion, AuditFileCountry, AuditFileDateCreated (xs:date!),
      //   SoftwareCompanyName, SoftwareID, SoftwareVersion,
      //   Company { RegistrationNumber|CVR, Name, Address, TaxRegistration?,
      //             BankAccount (M!) },
      //   DefaultCurrencyCode (M!), SelectionCriteria, HeaderComment?
      // ═══════════════════════════════════════════════════════════════
      const header = root.ele('Header');
      header.ele('AuditFileVersion').txt(SAFT_VERSION);
      header.ele('AuditFileCountry').txt('DK');
      // XSD: AuditFileDateCreated is xs:date — YYYY-MM-DD only (no time/zone)
      header.ele('AuditFileDateCreated').txt(formatDate(new Date()));
      header.ele('SoftwareCompanyName').txt('AlphaFlow');
      header.ele('SoftwareID').txt('AlphaFlow v1.0');
      header.ele('SoftwareVersion').txt('1.0.0');

      // Company (CompanyHeaderStructure) — CVR or RegistrationNumber, Name,
      // Address (M! — requires StreetName, City, PostalCode, Country),
      // TaxRegistration (O), BankAccount (M!)
      const company = header.ele('Company');
      company.ele('RegistrationNumber').txt(companyCVR);
      company.ele('Name').txt(companyName);

      // XSD: AddressStructure requires StreetName, City, PostalCode, Country
      const companyAddressNode = company.ele('Address');
      companyAddressNode.ele('StreetName').txt(companyAddress || 'Unknown');
      companyAddressNode.ele('City').txt('Unknown');
      companyAddressNode.ele('PostalCode').txt('0000');
      companyAddressNode.ele('Country').txt('DK');

      // TaxRegistration (TaxIDStructure) — TaxRegistrationNumber FIRST, then TaxType
      const taxReg = company.ele('TaxRegistration');
      taxReg.ele('TaxRegistrationNumber').txt(companyCVR);
      taxReg.ele('TaxType').txt('VAT');
      taxReg.ele('Country').txt('DK');

      // BankAccount — mandatory per XSD (maxOccurs unbounded). We emit a
      // single placeholder since AlphaFlow doesn't yet store bank accounts.
      const bankAcct = company.ele('BankAccount');
      bankAcct.ele('IBANNumber').txt('DK0000000000000000');

      // DefaultCurrencyCode (mandatory after Company)
      header.ele('DefaultCurrencyCode').txt('DKK');

      // XSD: SelectionCriteria uses SelectionStartDate/SelectionEndDate (xs:date),
      // NOT PeriodStart/PeriodEnd (which are month numbers in this schema)
      const period = header.ele('SelectionCriteria');
      period.ele('SelectionStartDate').txt(formatDate(periodStart));
      period.ele('SelectionEndDate').txt(formatDate(periodEnd));

      header.ele('HeaderComment').txt('SAF-T export generated by AlphaFlow (double-entry journal) — v2.1');
      // XSD: TaxEntity is mandatory in the Header extension
      header.ele('TaxEntity').txt(companyName);

      // ═══════════════════════════════════════════════════════════════
      // 2. MasterFiles (M 1..1) — XSD requires this exact child order:
      //    GeneralLedgerAccounts (M), Customers (O), Suppliers (O),
      //    TaxTable (M), UOMTable (O), AnalysisTypeTable (O), ...
      // NOTE: Customers and Suppliers MUST come BEFORE TaxTable!
      // ═══════════════════════════════════════════════════════════════
      const masterFiles = root.ele('MasterFiles');

      // Fetch all tenant contacts ONCE (used for both Customers and Suppliers)
      const tenantContacts = await db.contact.findMany({
        where: { ...filter },
        orderBy: { name: 'asc' },
      });
      const customerContacts = tenantContacts.filter(
        (c) => c.type === 'CUSTOMER' || c.type === 'BOTH',
      );
      const supplierContacts = tenantContacts.filter(
        (c) => c.type === 'SUPPLIER' || c.type === 'BOTH',
      );

      // ── 2a. GeneralLedgerAccounts (M 1..1) ──
      const generalLedgerAccounts = masterFiles.ele('GeneralLedgerAccounts');
      generalLedgerAccounts.ele('NameOfStandardAccount').txt('Standardkontoplanen');
      generalLedgerAccounts.ele('VersionOfStandardAccount').txt(STANDARDKONTOPLAN_VERSION);

      const userAccounts = await db.account.findMany({
        where: { ...filter },
        orderBy: { number: 'asc' },
      });

      const accounts =
        userAccounts.length > 0
          ? userAccounts.map((acc) => ({
              id: acc.number,
              name: acc.name,
              type: ACCOUNT_TYPE_MAP[acc.type] || 'Other',
            }))
          : [
              { id: '3000', name: 'Salgsindtægter', type: 'Sale' },
              { id: '5500', name: 'Moms af salg', type: 'Liability' },
              { id: '5600', name: 'Moms af køb', type: 'Asset' },
              { id: '6000', name: 'Lønomkostninger', type: 'Expense' },
              { id: '7000', name: 'Øvrige driftsomkostninger', type: 'Expense' },
            ];

      // XSD: Account requires a choice of OpeningDebitBalance OR
      // OpeningCreditBalance (simple SAFmonetaryType — direct text, not AmountStructure)
      // AND a choice of ClosingDebitBalance OR ClosingCreditBalance.
      // We emit 0.00 for both since AlphaFlow doesn't track opening/closing balances yet.
      accounts.forEach((acc) => {
        const accountNode = generalLedgerAccounts.ele('Account');
        accountNode.ele('AccountID').txt(acc.id);
        accountNode.ele('AccountDescription').txt(acc.name);
        accountNode.ele('AccountType').txt(acc.type);
        accountNode.ele('OpeningDebitBalance').txt('0.00');
        accountNode.ele('ClosingDebitBalance').txt('0.00');
      });

      // ── 2b. Customers (O, MIFU) — BEFORE TaxTable per XSD order ──
      const customers = masterFiles.ele('Customers');

      if (customerContacts.length > 0) {
        customerContacts.forEach(contact => {
          const customerNode = customers.ele('Customer');
          customerNode.ele('CustomerID').txt(contact.id);
          // XSD CompanyStructureContent: CVR|RegistrationNumber, then EntityType,
          // then SE-nr, then Name, then Address. RegistrationNumber BEFORE Name.
          if (contact.cvrNumber) {
            customerNode.ele('RegistrationNumber').txt(contact.cvrNumber);
          }
          customerNode.ele('Name').txt(contact.name);
          // XSD: Address requires StreetName, City, PostalCode, Country
          const addressNode = customerNode.ele('Address');
          addressNode.ele('StreetName').txt(contact.address || 'Unknown');
          addressNode.ele('City').txt(contact.city || 'Unknown');
          addressNode.ele('PostalCode').txt(contact.postalCode || '0000');
          addressNode.ele('Country').txt(contact.country || 'DK');
        });
      } else {
        // MIFU = Mandatory If Filing Used — provide a placeholder so the
        // element is non-empty (some validators reject empty <Customers/>)
        const customerNode = customers.ele('Customer');
        customerNode.ele('CustomerID').txt('GEN-001');
        customerNode.ele('Name').txt('General Customers');
        const addrNode = customerNode.ele('Address');
        addrNode.ele('StreetName').txt('Unknown');
        addrNode.ele('City').txt('Unknown');
        addrNode.ele('PostalCode').txt('0000');
        addrNode.ele('Country').txt('DK');
      }

      // ── 2c. Suppliers (O, MIFU) — BEFORE TaxTable per XSD order ──
      if (supplierContacts.length > 0) {
        const suppliers = masterFiles.ele('Suppliers');
        supplierContacts.forEach(contact => {
          const supplierNode = suppliers.ele('Supplier');
          supplierNode.ele('SupplierID').txt(contact.id);
          // XSD CompanyStructureContent: RegistrationNumber BEFORE Name
          if (contact.cvrNumber) {
            supplierNode.ele('RegistrationNumber').txt(contact.cvrNumber);
          }
          supplierNode.ele('Name').txt(contact.name);
          const addressNode = supplierNode.ele('Address');
          addressNode.ele('StreetName').txt(contact.address || 'Unknown');
          addressNode.ele('City').txt(contact.city || 'Unknown');
          addressNode.ele('PostalCode').txt(contact.postalCode || '0000');
          addressNode.ele('Country').txt(contact.country || 'DK');
        });
      }

      // ── 2d. TaxTable (M 1..1) — XSD requires TaxTableEntry wrapper ──
      // Structure: <TaxTable><TaxTableEntry><TaxType>VAT</TaxType>
      //   <Description>VAT</Description><TaxCodeDetails>...</TaxCodeDetails>
      //   </TaxTableEntry></TaxTable>
      const taxTable = masterFiles.ele('TaxTable');
      const taxTableEntry = taxTable.ele('TaxTableEntry');
      taxTableEntry.ele('TaxType').txt('VAT');
      taxTableEntry.ele('Description').txt('VAT');

      const mappedVatCodes = getMappedSaftVatCodes();
      mappedVatCodes.forEach((vc) => {
        const taxCodeDetails = taxTableEntry.ele('TaxCodeDetails');
        // XSD order: TaxCode, StandardTaxCode, EffectiveDate, Description,
        // then choice of TaxPercentage or FlatTaxRate, then Country
        taxCodeDetails.ele('TaxCode').txt(vc.alphaFlowCode!);
        taxCodeDetails.ele('StandardTaxCode').txt(vc.standardCode);
        taxCodeDetails.ele('EffectiveDate').txt(formatDate(periodStart));
        taxCodeDetails.ele('Description').txt(vc.heading);
        taxCodeDetails.ele('TaxPercentage').txt(vc.rate.toString());
        taxCodeDetails.ele('Country').txt('DK');
      });

      // ═══════════════════════════════════════════════════════════════
      // 3. GeneralLedgerEntries (M 1..1)
      //    Contains NumberOfEntries, TotalDebit, TotalCredit DIRECTLY
      //    (NOT in a separate <Totals> element — that doesn't exist in XSD)
      // ═══════════════════════════════════════════════════════════════
      const generalLedgerEntries = root.ele('GeneralLedgerEntries');
      generalLedgerEntries.ele('NumberOfEntries').txt(transactionCount.toString());
      generalLedgerEntries.ele('TotalDebit').txt(formatNumber(totalDebit));
      generalLedgerEntries.ele('TotalCredit').txt(formatNumber(totalCredit));

      const journal = generalLedgerEntries.ele('Journal');
      journal.ele('JournalID').txt('GL');
      journal.ele('Description').txt('General Ledger (from double-entry journal)');
      journal.ele('Type').txt('GL');

      journalEntries.forEach((entry) => {
        if (!entry.lines || entry.lines.length === 0) return;

        const entryDate = new Date(entry.date);
        const entryMonth = entryDate.getMonth() + 1; // 1-12
        const entryYear = entryDate.getFullYear();
        const entryDateStr = formatDate(entryDate);

        const transaction = journal.ele('Transaction');
        transaction.ele('TransactionID').txt(entry.id);
        // XSD Transaction order: TransactionID, Period, PeriodYear, TransactionDate,
        // SourceID, TransactionType, Description, BatchID, SystemEntryDate,
        // GLPostingDate, CustomerID, SupplierID, SystemID, Line.
        // NOTE: Transaction has NO SourceDocumentID — that's an Invoice element.
        // In Transaction, use SourceID (optional) for the person/app that entered.
        transaction.ele('Period').txt(entryMonth.toString());
        transaction.ele('PeriodYear').txt(entryYear.toString());
        transaction.ele('TransactionDate').txt(entryDateStr);
        transaction.ele('Description').txt(entry.description || entry.reference || 'Journal entry');
        const systemDate = entry.createdAt ? formatDate(new Date(entry.createdAt)) : entryDateStr;
        transaction.ele('SystemEntryDate').txt(systemDate);
        transaction.ele('GLPostingDate').txt(entryDateStr);
        // XSD: SystemID is mandatory (maxOccurs unbounded → at least 1)
        transaction.ele('SystemID').txt('AlphaFlow');

        // XSD: <Line> elements are DIRECT children of <Transaction> —
        // there is NO <Lines> wrapper in the SAF-T XSD.
        // Each Line has a CHOICE of DebitAmount OR CreditAmount (not both),
        // and they use AmountStructure (requires <Amount> child + CurrencyCode +
        // CurrencyAmount + ExchangeRate).
        const emitAmount = (parent: any, amount: number) => {
          parent.ele('Amount').txt(formatNumber(amount));
          parent.ele('CurrencyCode').txt('DKK');
          parent.ele('CurrencyAmount').txt(formatNumber(amount));
          parent.ele('ExchangeRate').txt('1.0000');
        };

        entry.lines.forEach((line, lineIndex) => {
          const lineNode = transaction.ele('Line');
          lineNode.ele('RecordID').txt(`${entry.id}-${lineIndex + 1}`);
          lineNode.ele('AccountID').txt(line.account?.number || line.accountId);
          lineNode.ele('Description').txt(
            line.description || entry.description || '',
          );
          // XSD: choice — DebitAmount XOR CreditAmount. Emit the non-zero one.
          const debit = Number(line.debit) || 0;
          const credit = Number(line.credit) || 0;
          if (debit > 0) {
            const da = lineNode.ele('DebitAmount');
            emitAmount(da, debit);
          } else {
            const ca = lineNode.ele('CreditAmount');
            emitAmount(ca, credit);
          }

          if (line.vatCode && line.vatCode !== 'NONE') {
            lineNode.ele('TaxPointDate').txt(entryDateStr);
          }
        });
      });

      // ═══════════════════════════════════════════════════════════════
      // 4. SourceDocuments (O 0..1) — SalesInvoices
      // ═══════════════════════════════════════════════════════════════
      const salesRelatedEntries = journalEntries.filter((entry) =>
        entry.lines.some(
          (line) =>
            line.account?.type === 'REVENUE' ||
            line.account?.group === 'SALES_REVENUE' ||
            line.account?.group === 'OUTPUT_VAT',
        ),
      );

      // Build a lookup map: lowercase contact name → CustomerID, so we can
      // match journal entry descriptions against customer names.
      // SAF-T requires that <CustomerID> in <Invoice> references a <CustomerID>
      // defined in <MasterFiles><Customers>. Without this, the XSD's xs:keyref
      // constraint fails (DANGLING_CUSTOMER_REF validation error).
      const customerNameToId = new Map<string, string>();
      for (const c of customerContacts) {
        customerNameToId.set(c.name.toLowerCase(), c.id);
      }
      // Fallback CustomerID: the placeholder "GEN-001" is always defined in
      // MasterFiles/Customers (either as a real customer or the placeholder).
      const FALLBACK_CUSTOMER_ID = customerContacts.length > 0
        ? customerContacts[0].id
        : 'GEN-001';

      if (salesRelatedEntries.length > 0) {
        const sourceDocuments = root.ele('SourceDocuments');
        const salesInvoices = sourceDocuments.ele('SalesInvoices');

        // XSD requires NumberOfEntries, TotalDebit, TotalCredit BEFORE
        // the <Invoice> elements. TotalDebit is 0 for sales invoices
        // (all amounts are credits); TotalCredit = sum of sales + VAT.
        let salesTotalCredit = 0;
        let salesInvoiceCount = 0;

        // First pass: compute totals
        for (const entry of salesRelatedEntries) {
          const salesLines = entry.lines.filter(
            (line) =>
              line.account?.type === 'REVENUE' ||
              line.account?.group === 'SALES_REVENUE' ||
              line.account?.group === 'OUTPUT_VAT',
          );
          if (salesLines.length === 0) continue;
          salesInvoiceCount++;
          for (const line of salesLines) {
            salesTotalCredit += Number(line.credit) || 0;
          }
        }

        salesInvoices.ele('NumberOfEntries').txt(salesInvoiceCount.toString());
        salesInvoices.ele('TotalDebit').txt(formatNumber(0));
        salesInvoices.ele('TotalCredit').txt(formatNumber(r(salesTotalCredit)));

        // Second pass: emit each invoice
        let invoiceIndex = 0;
        salesRelatedEntries.forEach((entry) => {
          const salesLines = entry.lines.filter(
            (line) =>
              line.account?.type === 'REVENUE' ||
              line.account?.group === 'SALES_REVENUE' ||
              line.account?.group === 'OUTPUT_VAT',
          );

          if (salesLines.length === 0) return;

          // Resolve CustomerID: try to match the entry description/reference
          // against a known customer name. If no match, fall back to the
          // placeholder customer so the xs:keyref constraint still passes.
          const descLower = (entry.description || '').toLowerCase();
          const refLower = (entry.reference || '').toLowerCase();
          let resolvedCustomerId = FALLBACK_CUSTOMER_ID;
          for (const [name, id] of customerNameToId) {
            if (descLower.includes(name) || refLower.includes(name)) {
              resolvedCustomerId = id;
              break;
            }
          }

          const invoice = salesInvoices.ele('Invoice');
          invoiceIndex++;
          invoice.ele('InvoiceNo').txt(entry.reference || `JE-${invoiceIndex.toString().padStart(6, '0')}`);
          // XSD InvoiceStructure: InvoiceNo, then CustomerInfo (choice, contains
          // CustomerID/Name + BillingAddress), then AccountID, Period, PeriodYear,
          // InvoiceDate, InvoiceType.
          // CustomerID must be wrapped in <CustomerInfo>, not a direct child.
          const customerInfo = invoice.ele('CustomerInfo');
          customerInfo.ele('CustomerID').txt(resolvedCustomerId);
          // BillingAddress is mandatory inside CustomerInfo
          const billingAddr = customerInfo.ele('BillingAddress');
          billingAddr.ele('StreetName').txt('Unknown');
          billingAddr.ele('City').txt('Unknown');
          billingAddr.ele('PostalCode').txt('0000');
          billingAddr.ele('Country').txt('DK');
          invoice.ele('InvoiceDate').txt(formatDate(new Date(entry.date)));
          invoice.ele('InvoiceType').txt('Invoice');

          // XSD InvoiceStructure requires GLPostingDate (M) and TransactionID (M)
          // before <Line> elements. Line is a DIRECT child of Invoice (no <Lines> wrapper).
          invoice.ele('GLPostingDate').txt(formatDate(new Date(entry.date)));
          invoice.ele('TransactionID').txt(entry.id);

          // XSD: <Line> elements are DIRECT children of <Invoice> — no <Lines> wrapper.
          // XSD Invoice Line order: LineNumber, AccountID, [Analysis, OrderReferences,
          // ShipTo, ShipFrom], GoodsServicesID (M!), [ProductCode, ProductDescription,
          // Delivery], Quantity, InvoiceUOM, ..., UnitPrice (M), [InvoiceDate, References],
          // Description (M), InvoiceLineAmount (M), DebitCreditIndicator (M, 'D'|'C'),
          // [ShippingCostsAmount], TaxInformation.
          // NOTE: Settlement is a child of INVOICE (after all Lines), not of Line.
          salesLines.forEach((line, lineIdx) => {
            if (line.account?.group === 'OUTPUT_VAT') return;

            const invLine = invoice.ele('Line');
            invLine.ele('LineNumber').txt((lineIdx + 1).toString());
            invLine.ele('AccountID').txt(line.account?.number || line.accountId);
            // XSD: GoodsServicesID is mandatory
            invLine.ele('GoodsServicesID').txt(`GS-${lineIdx + 1}`);
            invLine.ele('Quantity').txt('1');
            invLine.ele('UnitPrice').txt(formatNumber(Number(line.credit) || Number(line.debit) || 0));
            invLine.ele('Description').txt(line.description || entry.description || '');

            // InvoiceLineAmount (AmountStructure)
            const lineAmount = invLine.ele('InvoiceLineAmount');
            emitAmount(lineAmount, Number(line.credit) || Number(line.debit) || 0);

            // DebitCreditIndicator — XSD enum: 'D' (Debit) or 'C' (Credit)
            invLine.ele('DebitCreditIndicator').txt('C');

            const vatCode = line.vatCode || 'NONE';
            if (vatCode !== 'NONE') {
              const invTax = invLine.ele('TaxInformation');
              invTax.ele('TaxType').txt('VAT');
              invTax.ele('TaxCode').txt(vatCode);

              const vatLine = entry.lines.find(
                (l) => l.account?.group === 'OUTPUT_VAT' && Number(l.credit) > 0,
              );
              const taxAmount = invTax.ele('TaxAmount');
              emitAmount(taxAmount, Number(vatLine?.credit) || 0);
            }
          });

          // XSD: Settlement is a child of INVOICE (after all Line elements).
          // SettlementDiscount (M) comes before SettlementAmount.
          const invoiceTotal = salesLines.reduce((sum, line) => {
            if (line.account?.group === 'OUTPUT_VAT') return sum;
            const vatLine = entry.lines.find(
              (l) => l.account?.group === 'OUTPUT_VAT' && Number(l.credit) > 0,
            );
            return sum + (Number(line.credit) || Number(line.debit) || 0) + (Number(vatLine?.credit) || 0);
          }, 0);
          const settlement = invoice.ele('Settlement');
          settlement.ele('SettlementDiscount').txt('0');
          const settlementAmount = settlement.ele('SettlementAmount');
          emitAmount(settlementAmount, invoiceTotal);

          // XSD: DocumentTotals is mandatory — TaxInformationTotals, NetTotal, GrossTotal
          const docTotals = invoice.ele('DocumentTotals');
          const salesNetTotal = salesLines.reduce((sum, line) => {
            if (line.account?.group === 'OUTPUT_VAT') return sum;
            return sum + (Number(line.credit) || Number(line.debit) || 0);
          }, 0);
          const vatTotal = entry.lines
            .filter((l) => l.account?.group === 'OUTPUT_VAT' && Number(l.credit) > 0)
            .reduce((sum, l) => sum + Number(l.credit) || 0, 0);

          // TaxInformationTotals (mandatory) — TaxBase is xs:decimal (simple), TaxAmount is AmountStructure
          const taxInfoTotals = docTotals.ele('TaxInformationTotals');
          if (salesLines.some(l => l.vatCode && l.vatCode !== 'NONE')) {
            taxInfoTotals.ele('TaxType').txt('VAT');
            taxInfoTotals.ele('TaxCode').txt(salesLines.find(l => l.vatCode && l.vatCode !== 'NONE')?.vatCode || 'S25');
            // XSD: TaxBase is xs:decimal (simple text, NOT AmountStructure)
            taxInfoTotals.ele('TaxBase').txt(formatNumber(salesNetTotal));
            const taxAmountTotals = taxInfoTotals.ele('TaxAmount');
            emitAmount(taxAmountTotals, vatTotal);
          }
          docTotals.ele('NetTotal').txt(formatNumber(salesNetTotal));
          docTotals.ele('GrossTotal').txt(formatNumber(salesNetTotal + vatTotal));
        });
      }

      // NOTE: <Totals> element removed — it does NOT exist in the SAF-T XSD.
      // NumberOfEntries, TotalDebit, TotalCredit are now direct children of
      // <GeneralLedgerEntries> (see section 3 above).

      const xmlString = doc.end({ prettyPrint: true });

      // ───── Schema Validation ─────
      logger.info('[SAF-T Export] Validating generated XML (v2.1)...');

      const schemaValidation = validateSAFT(xmlString);
      logValidationResults(schemaValidation, 'SAF-T v2.1 Validation');

      const responseHeaders: Record<string, string> = {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="SAF-T-${month || 'export'}-${Date.now()}.xml"`,
        'X-Validation-Valid': schemaValidation.isValid ? 'true' : 'false',
        'X-Validation-Errors': schemaValidation.errors.length.toString(),
        'X-Validation-Warnings': schemaValidation.warnings.length.toString(),
        'X-Validation-Checks': schemaValidation.summary.totalChecks.toString(),
        'X-Validation-Passed': schemaValidation.summary.passed.toString(),
        'X-SAFT-Version': SAFT_VERSION,
      };

      logger.info(
        `[SAF-T Export] Export complete (v${SAFT_VERSION}). Journal entries: ${journalEntries.length}, ` +
          `Total Debit: ${formatNumber(totalDebit)}, Total Credit: ${formatNumber(totalCredit)}, ` +
          `Output VAT: ${formatNumber(totalOutputVAT)}, Input VAT: ${formatNumber(totalInputVAT)}, ` +
          `Net VAT: ${formatNumber(totalOutputVAT - totalInputVAT)}. ` +
          `Valid: ${schemaValidation.isValid}, Errors: ${schemaValidation.errors.length}, Warnings: ${schemaValidation.warnings.length}`,
      );

      return new NextResponse(xmlString, {
        status: 200,
        headers: responseHeaders,
      });
    } catch (error) {
      logger.error('[SAF-T Export] Critical error:', error);
      return NextResponse.json(
        {
          error: 'Failed to generate SAF-T file',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 },
      );
    }
  }
);

// ─── VAT Code Description Helper ────────────────────────────────────

function getVatCodeDescription(code: string): string {
  // Use the official SAF-T VAT code description if available
  const saftVatCode = getSaftVatCode(code);
  if (saftVatCode) {
    return saftVatCode.heading;
  }

  // Fallback for codes without an official mapping
  const descriptions: Record<string, string> = {
    NONE: 'No VAT',
  };
  return descriptions[code] || code;
}
