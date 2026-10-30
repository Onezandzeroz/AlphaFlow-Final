/**
 * scripts/seed-screenshot-tenant.ts
 *
 * Opretter en "Screenshot Demo" tenant perfekt seedet med mock data
 * til Erhvervsstyrelsen-screenshots (Bilag 19a, 20a, 20b, 20e).
 *
 * Tenant-data:
 *   - Virksomhed: "AlphaFlow Screenshot Demo" (CVR 00000000, ApS, isDemo=false)
 *   - einvoiceEnabled = false  (så NemHandel-banneret vises — Bilag 20e)
 *   - ~45 FSR-konti + StandardAccountMapping til 2026-kontoplan (Bilag 19a)
 *   - 8 POSTED journal entries med fortløbende voucherNumber 1-8 (Bilag 20a),
 *     heraf 2 faktura-accruals (INV-{år}-0001 + INV-{år}-0002)
 *   - 2 fakturaer (INV-…) — den ene annulleres med automatisk kreditnota
 *     (KRE-{år}-0001) + modpostering (REVERSAL-INV-{år}-0001)
 *   - 1 transaktion (entry 5 — TX-LEJE-JAN) annulleres med modpostering
 *     (REVERSAL-TX-LEJE-JAN) — viser transaktionsannullering i Bilag 20b
 *   - 8 POSTED journal entries for 2024 (2 pr. kvartal, med moms) — muliggør
 *     momsindberetning for alle 4 kvartaler i 2024 via SKAT testnet
 *   - Alle entries har SHA-256 hash-chain + er sealed (Bilag 20b kode-bevis)
 *
 * Brug:
 *   bun run scripts/seed-screenshot-tenant.ts <user-id>
 *
 * Eksempel:
 *   bun run scripts/seed-screenshot-tenant.ts cmABC123...
 *
 * For find dit user-id:
 *   bun run scripts/find-admin-users.ts
 *
 * Genkørsel: Hvis tenant allerede eksisterer, stopper scriptet. Brug
 *   scripts/remove-screenshot-tenant.ts først for at rydde op.
 */

import { db } from '@/lib/db';
import { seedChartOfAccounts } from '@/lib/seed-chart-of-accounts';
import { assignVoucherNumberIfPosted } from '@/lib/voucher-number';
import { sealJournalEntry, sealTransaction } from '@/lib/journal-hash-chain';
import { FSR_TO_OFFICIAL_MAPPING } from '@/lib/fsr-official-mapping';
import { OFFICIAL_STANDARD_CHART } from '@/lib/official-standard-chart';
import { VATCode, JournalEntryStatus, TransactionType } from '@prisma/client';

/** Prisma transaction client type (samme som voucher-number.ts bruger). */
type PrismaTransaction = Parameters<Parameters<typeof db.$transaction>[0]>[0];

// ─── Konfiguration ─────────────────────────────────────────────────────────

const TENANT_NAME = 'AlphaFlow Screenshot Demo';
const TENANT_CVR = '00000000'; // tydeligt fiktivt CVR

const CURRENT_YEAR = new Date().getFullYear();

// 2024 er det år SKAT har åbent i deres testnet til at ret/slet indberetninger.
// Vi seeder moms-relevante posteringer for alle 4 kvartaler i 2024 således at
// momsindberetning er mulig for 2024.
const SKAT_TEST_YEAR = 2024;

// ─── Hjælpefunktioner ──────────────────────────────────────────────────────

/** Afrund til 2 decimaler (undgå floating-point unøjagtighed i Decimal-felter). */
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Pæn fejl der stopper scriptet. */
function fail(msg: string): never {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

/** Find navn på official 2026-konto fra OFFICIAL_STANDARD_CHART. */
function officialAccountName(officialNumber: string): string {
  const found = OFFICIAL_STANDARD_CHART.find((a) => a.number === officialNumber);
  return found?.name || `Standard konto ${officialNumber}`;
}

/** Information vi gemmer om hver oprettet entry (til validering + annullering). */
interface CreatedEntry {
  id: string;
  voucherNumber: string;
  reference: string | null;
  description: string;
  date: Date;
  lines: LineSpec[];
  /** ID på tilhørende Transaction (hvis oprettet). Bruges ved annullering. */
  transactionId?: string;
}

// ─── Entry-definitioner ────────────────────────────────────────────────────
// Hver entry er en bogført postering med tilhørende linjer (debet/kredit).
//
// Entry 5 (TX-LEJE-JAN) annulleres længere nede i scriptet — modpostering
// med reference REVERSAL-TX-LEJE-JAN demonstrerer transaktionsannullering.
//
// Entry 7 + 8 er faktura-accruals der matcher de to Invoice-records. Faktura
// 1 (INV-{år}-0001) annulleres med automatisk kreditnota (KRE-{år}-0001) +
// modpostering (REVERSAL-INV-{år}-0001) — se trin [8/9] længere nede.

interface LineSpec {
  accountNumber: string;
  debit?: number;
  credit?: number;
  vatCode?: VATCode;
  description?: string;
}

interface EntrySpec {
  description: string;
  date: Date;
  reference?: string;
  lines: LineSpec[];
  /** Hvis sat, oprettes en tilhørende Transaction der peger på denne entry. */
  createTransaction?: {
    type: TransactionType;
    amount: number;
    vatPercent: number;
    description: string;
  };
}

const ENTRIES: EntrySpec[] = [
  {
    description: 'Indbetaling af selskabskapital (stiftelse)',
    date: new Date(CURRENT_YEAR, 0, 2), // 2. januar
    reference: 'STIFTELSE-001',
    lines: [
      { accountNumber: '1100', debit: r2(250000), description: 'Indskud på bankkonto' },
      { accountNumber: '3000', credit: r2(250000), description: 'Selskabskapital indbetalt' },
    ],
  },
  {
    description: 'Indkøb af IT-udstyr (server + licenser)',
    date: new Date(CURRENT_YEAR, 0, 5), // 5. januar
    reference: 'TX-INDKOB-IT',
    createTransaction: {
      type: TransactionType.PURCHASE,
      amount: r2(75000),
      vatPercent: 25.0,
      description: 'Indkøb af IT-udstyr (server + licenser)',
    },
    lines: [
      { accountNumber: '1800', debit: r2(60000), description: 'IT-udstyr (anlægsaktiv)' },
      { accountNumber: '5410', debit: r2(15000), vatCode: VATCode.K25, description: 'Indgående moms 25%' },
      { accountNumber: '1100', credit: r2(75000), description: 'Betaling via bank' },
    ],
  },
  {
    description: 'Salg af konsulentydelse — DataDrift ApS',
    date: new Date(CURRENT_YEAR, 0, 10), // 10. januar
    reference: 'SALG-001',
    lines: [
      { accountNumber: '1200', debit: r2(75000), description: 'Tilgodehavende DataDrift ApS' },
      { accountNumber: '4100', credit: r2(60000), description: 'Salg af konsulentydelse' },
      { accountNumber: '4510', credit: r2(15000), vatCode: VATCode.S25, description: 'Udgående moms 25%' },
    ],
  },
  {
    description: 'Kundebetaling modtaget — DataDrift ApS',
    date: new Date(CURRENT_YEAR, 0, 20), // 20. januar
    reference: 'SALG-001-IND',
    lines: [
      { accountNumber: '1100', debit: r2(75000), description: 'Modtaget betaling på bank' },
      { accountNumber: '1200', credit: r2(75000), description: 'Frigørelse af tilgodehavende' },
    ],
  },
  // ─── Entry 5 — Husleje januar. ANNULLERES længere nede (REVERSAL-TX-LEJE-JAN) ───
  {
    description: 'Husleje januar — kontorlokale',
    date: new Date(CURRENT_YEAR, 0, 25), // 25. januar
    reference: 'TX-LEJE-JAN',
    createTransaction: {
      type: TransactionType.PURCHASE,
      amount: r2(10000),
      vatPercent: 25.0,
      description: 'Husleje januar — kontorlokale',
    },
    lines: [
      { accountNumber: '8000', debit: r2(8000), description: 'Husleje januar' },
      { accountNumber: '5410', debit: r2(2000), vatCode: VATCode.K25, description: 'Indgående moms 25%' },
      { accountNumber: '1100', credit: r2(10000), description: 'Betaling via bank' },
    ],
  },
  {
    description: 'Salg af konsulentydelse — Acme A/S',
    date: new Date(CURRENT_YEAR, 0, 28), // 28. januar
    reference: 'SALG-002',
    lines: [
      { accountNumber: '1200', debit: r2(50000), description: 'Tilgodehavende Acme A/S' },
      { accountNumber: '4100', credit: r2(40000), description: 'Salg af konsulentydelse' },
      { accountNumber: '4510', credit: r2(10000), vatCode: VATCode.S25, description: 'Udgående moms 25%' },
    ],
  },
  // ─── Entry 7 — Faktura 1 accrual (INV-{år}-0001).
  // Denne faktura annulleres længere nede med kreditnota KRE-{år}-0001 +
  // modpostering REVERSAL-INV-{år}-0001. ────────────────────────────────────
  {
    description: 'Salg af konsulentydelse — Nordic Tech Solutions ApS',
    date: new Date(CURRENT_YEAR, 1, 15), // 15. februar
    reference: `INV-${CURRENT_YEAR}-0001`,
    lines: [
      { accountNumber: '1200', debit: r2(100000), description: 'Tilgodehavende Nordic Tech Solutions ApS' },
      { accountNumber: '4100', credit: r2(80000), description: 'Salg af konsulentydelse' },
      { accountNumber: '4510', credit: r2(20000), vatCode: VATCode.S25, description: 'Udgående moms 25%' },
    ],
  },
  // ─── Entry 8 — Faktura 2 accrual (INV-{år}-0002). Forbliver aktiv. ─────────
  {
    description: 'Salg af DevOps-rådgivning — DataDrift ApS',
    date: new Date(CURRENT_YEAR, 1, 20), // 20. februar
    reference: `INV-${CURRENT_YEAR}-0002`,
    lines: [
      { accountNumber: '1200', debit: r2(37500), description: 'Tilgodehavende DataDrift ApS' },
      { accountNumber: '4100', credit: r2(30000), description: 'Salg af DevOps-rådgivning' },
      { accountNumber: '4510', credit: r2(7500), vatCode: VATCode.S25, description: 'Udgående moms 25%' },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 2024 KVARTALSDATA — for momsindberetning via SKAT testnet
  // SKAT har kun 2024 åbent i deres testmiljø til at ret/slet indberetninger.
  // Vi seeder moms-relevante posteringer (salg + køb med moms) for hvert
  // kvartal i 2024, således at momsindberetning kan foretages for alle 4
  // kvartaler (Q1: jan-mar, Q2: apr-jun, Q3: jul-sep, Q4: okt-dec).
  // ═══════════════════════════════════════════════════════════════════════

  // ─── 2024 Q1 (januar–marts) ──────────────────────────────────────────────
  {
    description: 'Salg af konsulentydelse — Q1 2024',
    date: new Date(SKAT_TEST_YEAR, 0, 15), // 15. januar 2024
    reference: 'SALG-2024-Q1',
    lines: [
      { accountNumber: '1200', debit: r2(50000), description: 'Tilgodehavende Q1 2024' },
      { accountNumber: '4100', credit: r2(40000), description: 'Salg af konsulentydelse Q1' },
      { accountNumber: '4510', credit: r2(10000), vatCode: VATCode.S25, description: 'Udgående moms 25% Q1' },
    ],
  },
  {
    description: 'Køb af kontorartikler — Q1 2024',
    date: new Date(SKAT_TEST_YEAR, 1, 10), // 10. februar 2024
    reference: 'KOEB-2024-Q1',
    createTransaction: {
      type: TransactionType.PURCHASE,
      amount: r2(5000),
      vatPercent: 25.0,
      description: 'Køb af kontorartikler — Q1 2024',
    },
    lines: [
      { accountNumber: '8700', debit: r2(4000), description: 'Kontorartikler Q1' },
      { accountNumber: '5410', debit: r2(1000), vatCode: VATCode.K25, description: 'Indgående moms 25% Q1' },
      { accountNumber: '1100', credit: r2(5000), description: 'Betaling via bank Q1' },
    ],
  },

  // ─── 2024 Q2 (april–juni) ────────────────────────────────────────────────
  {
    description: 'Salg af konsulentydelse — Q2 2024',
    date: new Date(SKAT_TEST_YEAR, 3, 15), // 15. april 2024
    reference: 'SALG-2024-Q2',
    lines: [
      { accountNumber: '1200', debit: r2(75000), description: 'Tilgodehavende Q2 2024' },
      { accountNumber: '4100', credit: r2(60000), description: 'Salg af konsulentydelse Q2' },
      { accountNumber: '4510', credit: r2(15000), vatCode: VATCode.S25, description: 'Udgående moms 25% Q2' },
    ],
  },
  {
    description: 'Køb af reklame — Q2 2024',
    date: new Date(SKAT_TEST_YEAR, 4, 5), // 5. maj 2024
    reference: 'KOEB-2024-Q2',
    createTransaction: {
      type: TransactionType.PURCHASE,
      amount: r2(12000),
      vatPercent: 25.0,
      description: 'Køb af reklame — Q2 2024',
    },
    lines: [
      { accountNumber: '8800', debit: r2(9600), description: 'Reklame og markedsføring Q2' },
      { accountNumber: '5410', debit: r2(2400), vatCode: VATCode.K25, description: 'Indgående moms 25% Q2' },
      { accountNumber: '1100', credit: r2(12000), description: 'Betaling via bank Q2' },
    ],
  },

  // ─── 2024 Q3 (juli–september) ────────────────────────────────────────────
  {
    description: 'Salg af konsulentydelse — Q3 2024',
    date: new Date(SKAT_TEST_YEAR, 6, 20), // 20. juli 2024
    reference: 'SALG-2024-Q3',
    lines: [
      { accountNumber: '1200', debit: r2(60000), description: 'Tilgodehavende Q3 2024' },
      { accountNumber: '4100', credit: r2(48000), description: 'Salg af konsulentydelse Q3' },
      { accountNumber: '4510', credit: r2(12000), vatCode: VATCode.S25, description: 'Udgående moms 25% Q3' },
    ],
  },
  {
    description: 'Husleje — Q3 2024',
    date: new Date(SKAT_TEST_YEAR, 7, 1), // 1. august 2024
    reference: 'LEJE-2024-Q3',
    createTransaction: {
      type: TransactionType.PURCHASE,
      amount: r2(10000),
      vatPercent: 25.0,
      description: 'Husleje — Q3 2024',
    },
    lines: [
      { accountNumber: '8000', debit: r2(8000), description: 'Husleje Q3' },
      { accountNumber: '5410', debit: r2(2000), vatCode: VATCode.K25, description: 'Indgående moms 25% Q3' },
      { accountNumber: '1100', credit: r2(10000), description: 'Betaling via bank Q3' },
    ],
  },

  // ─── 2024 Q4 (oktober–december) ───────────────────────────────────────────
  {
    description: 'Salg af konsulentydelse — Q4 2024',
    date: new Date(SKAT_TEST_YEAR, 9, 10), // 10. oktober 2024
    reference: 'SALG-2024-Q4',
    lines: [
      { accountNumber: '1200', debit: r2(90000), description: 'Tilgodehavende Q4 2024' },
      { accountNumber: '4100', credit: r2(72000), description: 'Salg af konsulentydelse Q4' },
      { accountNumber: '4510', credit: r2(18000), vatCode: VATCode.S25, description: 'Udgående moms 25% Q4' },
    ],
  },
  {
    description: 'Køb af IT-udstyr — Q4 2024',
    date: new Date(SKAT_TEST_YEAR, 10, 15), // 15. november 2024
    reference: 'KOEB-2024-Q4',
    createTransaction: {
      type: TransactionType.PURCHASE,
      amount: r2(25000),
      vatPercent: 25.0,
      description: 'Køb af IT-udstyr — Q4 2024',
    },
    lines: [
      { accountNumber: '1800', debit: r2(20000), description: 'IT-udstyr Q4' },
      { accountNumber: '5410', debit: r2(5000), vatCode: VATCode.K25, description: 'Indgående moms 25% Q4' },
      { accountNumber: '1100', credit: r2(25000), description: 'Betaling via bank Q4' },
    ],
  },
];

// ─── Hovedfunktion ─────────────────────────────────────────────────────────

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    console.log('Brug: bun run scripts/seed-screenshot-tenant.ts <user-id>');
    console.log('');
    console.log('Find dit user-id med:');
    console.log('  bun run scripts/find-admin-users.ts');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Seed: AlphaFlow Screenshot Demo tenant');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`User ID: ${userId}`);
  console.log(`År:     ${CURRENT_YEAR}`);
  console.log('');

  // ─── 1. Verificer at brugeren eksisterer ──────────────────────────────
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, businessName: true, isSuperDev: true },
  });
  if (!user) {
    fail(`Bruger med ID "${userId}" ikke fundet.`);
  }
  console.log(`✅ Bruger fundet: ${user.email} (${user.businessName || 'uden virksomhedsnavn'}, isSuperDev=${user.isSuperDev})`);

  // ─── 2. Tjek om tenant allerede eksisterer ─────────────────────────────
  const existing = await db.company.findFirst({
    where: { name: TENANT_NAME },
    select: { id: true, name: true, cvrNumber: true, createdAt: true },
  });
  if (existing) {
    fail(
      `Tenant "${TENANT_NAME}" eksisterer allerede (ID: ${existing.id}, oprettet ${existing.createdAt.toISOString()}).\n` +
      `Kør først: bun run scripts/remove-screenshot-tenant.ts\n` +
      `Eller slet manuelt hvis du vil starte forfra.`,
    );
  }

  // ─── 3. Opret Company ──────────────────────────────────────────────────
  console.log('\n[1/9] Opretter Company…');
  const company = await db.company.create({
    data: {
      name: TENANT_NAME,
      cvrNumber: TENANT_CVR,
      companyType: 'ApS',
      address: 'Screenshotvej 1',
      postalCode: '1000',
      city: 'København',
      country: 'DK',
      phone: '+45 00 00 00 00',
      email: 'screenshot-demo@example.invalid',
      isDemo: false, // VIGTIGT: Skal være false — ellers skjules i company picker (se src/components/layout/company-selector.tsx:13)
      isActive: true,
      einvoiceEnabled: false, // KRITISK — får NemHandel-banneret til at vises (Bilag 20e)
      nextJournalSequence: 1,
      currentYear: CURRENT_YEAR,
      journalPrefix: 'BIL',
      // Faktura + kreditnota nummerering (selvom schema har @default-værdier,
      // sætter vi dem eksplicit for at gøre intent tydelig i screenshot-tenanten)
      invoicePrefix: 'INV',
      nextInvoiceSequence: 1,
      creditNotePrefix: 'KRE',
      nextCreditNoteSequence: 1,
    },
  });
  console.log(`   ✅ Company ID: ${company.id}`);
  console.log(`   ✅ Navn: ${company.name}`);
  console.log(`   ✅ CVR: ${company.cvrNumber} (fiktivt)`);
  console.log(`   ✅ einvoiceEnabled: ${company.einvoiceEnabled} (NemHandel-banner vil vises)`);

  // ─── 4. Opret UserCompany-medlemskab ──────────────────────────────────
  console.log('\n[2/9] Tilføjer bruger som OWNER…');
  await db.userCompany.create({
    data: {
      userId: user.id,
      companyId: company.id,
      role: 'OWNER',
    },
  });
  console.log(`   ✅ ${user.email} er nu OWNER af ${company.name}`);

  // ─── 5. Seed FSR-kontoplan (~45 konti) ────────────────────────────────
  console.log('\n[3/9] Seeder FSR-kontoplan (~45 konti)…');
  const accountCount = await seedChartOfAccounts(user.id, company.id);
  console.log(`   ✅ ${accountCount} konti oprettet`);

  // Byg opslag: kontonummer → accountId
  const accounts = await db.account.findMany({
    where: { companyId: company.id },
    select: { id: true, number: true, name: true, type: true, group: true },
  });
  const accountByNumber = new Map(accounts.map((a) => [a.number, a]));

  // Verificer at alle konti fra ENTRIES findes
  const requiredAccounts = new Set<string>();
  for (const entry of ENTRIES) {
    for (const line of entry.lines) requiredAccounts.add(line.accountNumber);
  }
  const missing = Array.from(requiredAccounts).filter((n) => !accountByNumber.has(n));
  if (missing.length > 0) {
    fail(
      `FSR-kontoplan mangler konti der skal bruges i entries: ${missing.join(', ')}\n` +
      `Tilføj dem til src/lib/seed-chart-of-accounts.ts eller brug andre kontonumre.`,
    );
  }

  // ─── 6. Opret StandardAccountMapping (til Bilag 19a CSV) ─────────────
  console.log('\n[4/9] Opretter StandardAccountMapping (FSR → 2026-kontoplan)…');
  const mappingData: Array<{
    companyId: string;
    accountId: string;
    standardAccountNumber: string;
    standardAccountName: string;
    mappingType: string;
  }> = [];
  const accountUpdates: Promise<unknown>[] = [];

  for (const account of accounts) {
    const officialNumber = FSR_TO_OFFICIAL_MAPPING[account.number];
    if (!officialNumber) continue; // ikke alle FSR-konti har en mapping

    mappingData.push({
      companyId: company.id,
      accountId: account.id,
      standardAccountNumber: officialNumber,
      standardAccountName: officialAccountName(officialNumber),
      mappingType: 'auto',
    });

    // Opdater Account.publicStandardNumber (vises i UI og bruges til SAF-T)
    accountUpdates.push(
      db.account.update({
        where: { id: account.id },
        data: { publicStandardNumber: officialNumber },
      }) as Promise<{ id: string }>,
    );
  }

  await db.standardAccountMapping.createMany({ data: mappingData, skipDuplicates: true });
  await Promise.all(accountUpdates);
  console.log(`   ✅ ${mappingData.length} StandardAccountMapping oprettet`);

  // ─── 7. Opret FiscalPeriods for året ──────────────────────────────────
  console.log('\n[5/9] Opretter FiscalPeriods for året…');
  const fiscalPeriods = [];
  for (let month = 1; month <= 12; month++) {
    fiscalPeriods.push({
      companyId: company.id,
      year: CURRENT_YEAR,
      month,
      status: 'OPEN' as const,
    });
  }
  // 2024 FiscalPeriods (for SKAT testnet momsindberetning)
  for (let month = 1; month <= 12; month++) {
    fiscalPeriods.push({
      companyId: company.id,
      year: SKAT_TEST_YEAR,
      month,
      status: 'OPEN' as const,
    });
  }
  await db.fiscalPeriod.createMany({ data: fiscalPeriods, skipDuplicates: true });
  console.log(`   ✅ ${fiscalPeriods.length} FiscalPeriods oprettet (${CURRENT_YEAR} + ${SKAT_TEST_YEAR}, alle OPEN)`);

  // ─── 8. Opret Journal Entries (med voucherNumber + hash-chain) ───────
  console.log(`\n[6/9] Opretter ${ENTRIES.length} POSTED journal entries med fortløbende voucherNumber…`);

  const createdEntries: CreatedEntry[] = [];

  for (let i = 0; i < ENTRIES.length; i++) {
    const spec = ENTRIES[i];
    console.log(`   [${i + 1}/${ENTRIES.length}] ${spec.description.substring(0, 50)}…`);

    await db.$transaction(async (tx: PrismaTransaction) => {
      // Opret selve JournalEntry først (uden linjer — linjer oprettes separat
      // for at kunne bruge createMany med korrekte accountId'er)
      const entry = await tx.journalEntry.create({
        data: {
          date: spec.date,
          description: spec.description,
          reference: spec.reference || null,
          status: JournalEntryStatus.POSTED,
          cancelled: false,
          companyId: company.id,
          userId: user.id,
          currency: 'DKK',
          lines: {
            create: spec.lines.map((line) => ({
              companyId: company.id,
              accountId: accountByNumber.get(line.accountNumber)!.id,
              debit: line.debit ? r2(line.debit) : 0,
              credit: line.credit ? r2(line.credit) : 0,
              vatCode: line.vatCode || null,
              description: line.description || null,
            })),
          },
        },
      });

      // Tildel voucherNumber (atomisk — læser + inkrementerer Company.nextJournalSequence)
      const voucherNumber = await assignVoucherNumberIfPosted(tx, entry.id, company.id, 'POSTED');

      // Seal hash-chain (SHA-256 — bruger voucherNumber i hash-input, så skal ske EFTER tildeling)
      const { recordHash } = await sealJournalEntry(tx, entry.id, company.id);

      console.log(
        `         ✅ bilag ${voucherNumber} | hash: ${recordHash?.substring(0, 16)}…`,
      );

      // Hvis denne entry har en tilhørende Transaction, opret den og seal den
      let transactionId: string | undefined;
      if (spec.createTransaction) {
        const transaction = await tx.transaction.create({
          data: {
            date: spec.date,
            type: spec.createTransaction.type,
            amount: spec.createTransaction.amount,
            currency: 'DKK',
            description: spec.createTransaction.description,
            vatPercent: spec.createTransaction.vatPercent,
            companyId: company.id,
            userId: user.id,
            accountId: spec.lines[0]?.accountNumber
              ? accountByNumber.get(spec.lines[0].accountNumber)!.id
              : null,
          },
        });
        await sealTransaction(tx, transaction.id, company.id);
        transactionId = transaction.id;
      }

      createdEntries.push({
        id: entry.id,
        voucherNumber: voucherNumber || '',
        reference: spec.reference || null,
        description: spec.description,
        date: spec.date,
        lines: spec.lines,
        transactionId,
      });
    });
  }

  // ─── 9. Opret fakturaer ────────────────────────────────────────────────
  //
  // Vi opretter to fakturaer:
  //   • INV-{år}-0001 (Nordic Tech Solutions ApS) — vil blive annulleret med
  //     automatisk kreditnota i næste trin. Viser kreditnota-automatik.
  //   • INV-{år}-0002 (DataDrift ApS) — forbliver aktiv. Viser en normal
  //     faktura i faktura-listen.
  //
  // Begge fakturaer har allerede fået deres accrual JournalEntry oprettet i
  // trin [6/9] ovenfor (entries 7 + 8 med reference INV-{år}-0001 / -0002).
  console.log('\n[7/9] Opretter fakturaer (INV-…)…');

  const invoice1 = await db.invoice.create({
    data: {
      invoiceNumber: `INV-${CURRENT_YEAR}-0001`,
      documentType: 'INVOICE',
      customerName: 'Nordic Tech Solutions ApS',
      customerCvr: '12345678',
      customerAddress: 'Stationsvej 42, 2100 København Ø',
      issueDate: new Date(CURRENT_YEAR, 1, 15), // 15. februar
      dueDate: new Date(CURRENT_YEAR, 2, 1),    // 1. marts
      lineItems: [
        { description: 'Cloud migration konsulentydelse', quantity: 10, unitPrice: 8000, vatPercent: 25 },
      ],
      subtotal: 80000,
      vatTotal: 20000,
      total: 100000,
      currency: 'DKK',
      status: 'SENT',
      userId: user.id,
      companyId: company.id,
    },
  });

  const invoice2 = await db.invoice.create({
    data: {
      invoiceNumber: `INV-${CURRENT_YEAR}-0002`,
      documentType: 'INVOICE',
      customerName: 'DataDrift ApS',
      customerCvr: '87654321',
      issueDate: new Date(CURRENT_YEAR, 1, 20), // 20. februar
      dueDate: new Date(CURRENT_YEAR, 2, 5),    // 5. marts
      lineItems: [
        { description: 'DevOps rådgivning', quantity: 5, unitPrice: 6000, vatPercent: 25 },
      ],
      subtotal: 30000,
      vatTotal: 7500,
      total: 37500,
      currency: 'DKK',
      status: 'SENT',
      userId: user.id,
      companyId: company.id,
    },
  });

  console.log(`   ✅ ${invoice1.invoiceNumber} — Nordic Tech Solutions ApS (vil blive annulleret med kreditnota)`);
  console.log(`   ✅ ${invoice2.invoiceNumber} — DataDrift ApS (forbliver aktiv)`);

  // ─── 10. Annulleringer (modposteringer + kreditnota) ───────────────────
  //
  // To annulleringer der demonstrerer henholdsvis transaktions-annullering
  // (REVERSAL-TX-) og faktura-annullering med automatisk kreditnota
  // (KRE-{år}-{seq} + REVERSAL-INV-). Begge følger samme mønster som
  // src/app/api/transactions/route.ts (linje 853-928) og
  // src/app/api/invoices/route.ts (linje 234-410).
  console.log('\n[8/9] Opretter annulleringer (modposteringer + kreditnota)…');

  // ── 10a. Transaktionsannullering — entry 5 (TX-LEJE-JAN) ──────────────
  //
  // Marker Transaction + original JournalEntry som cancelled=true (begge er
  // sealed → kræver SET LOCAL app.immutability_bypass = 'true' i en
  // $transaction — samme mønster som transactions/route.ts:853-862, 943-954).
  // Opret derefter en ny reversal JournalEntry med:
  //   • date = originalens dato (samme transaktionsdato — lander i rigtig
  //     periode jf. bogføringslovens god praksis, se kommentar i
  //     transactions/route.ts:890-899)
  //   • reference = `REVERSAL-TX-LEJE-JAN`
  //   • description = `Annullering – ${originalDescription}`
  //   • status = POSTED, sealed med hash-chain, voucherNumber tildelt
  //   • Linjer = originalens linjer med byttet debet/kredit
  const entry5 = createdEntries.find((e) => e.reference === 'TX-LEJE-JAN');
  if (!entry5 || !entry5.transactionId) {
    fail('Kunne ikke finde entry 5 (TX-LEJE-JAN) eller dens Transaction — annullering kan ikke fortsætte.');
  }

  // 10a.1 — Marker original Transaction + JE som cancelled via immutability_bypass
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.immutability_bypass = 'true'`);
    await tx.transaction.update({
      where: { id: entry5.transactionId! },
      data: {
        cancelled: true,
        cancelReason: 'SYSTEM:USER_REQUESTED',
      },
    });
    await tx.journalEntry.update({
      where: { id: entry5.id },
      data: {
        cancelled: true,
        cancelReason: 'Transaction cancelled: SYSTEM:USER_REQUESTED',
      },
    });
  });

  // 10a.2 — Opret reversal JournalEntry (POSTED + sealed + voucherNumber)
  await db.$transaction(async (tx: PrismaTransaction) => {
    const reversalJE = await tx.journalEntry.create({
      data: {
        // Korrekt transaktionsdato = originalens dato (lander i rigtig periode)
        date: entry5.date,
        description: `Annullering – ${entry5.description}`,
        reference: 'REVERSAL-TX-LEJE-JAN',
        status: JournalEntryStatus.POSTED,
        cancelled: false,
        companyId: company.id,
        userId: user.id,
        currency: 'DKK',
        lines: {
          create: entry5.lines.map((line) => ({
            companyId: company.id,
            accountId: accountByNumber.get(line.accountNumber)!.id,
            // Swap debit ↔ credit for at reversere posteringen
            debit: line.credit ? r2(line.credit) : 0,
            credit: line.debit ? r2(line.debit) : 0,
            vatCode: line.vatCode || null,
            description: `Annullering – ${line.description || ''}`,
          })),
        },
      },
    });

    const voucherNumber = await assignVoucherNumberIfPosted(tx, reversalJE.id, company.id, 'POSTED');
    const { recordHash } = await sealJournalEntry(tx, reversalJE.id, company.id);
    console.log(`   ✅ REVERSAL-TX-LEJE-JAN — bilag ${voucherNumber} | hash: ${recordHash?.substring(0, 16)}…`);
  });

  // ── 10b. Faktura-annullering — INV-{år}-0001 (med kreditnota) ─────────
  //
  // Samme flow som DELETE /api/invoices?id=xxx (se src/app/api/invoices/
  // route.ts:234-410):
  //   1. Opret kreditnota Invoice (documentType='CREDIT_NOTE',
  //      originalInvoiceId, KRE-{år}-{seq} nummerering, issueDate =
  //      originalens issueDate for korrekt transaktionsdato, lineItems =
  //      spejlede negative beløb)
  //   2. Bump Company.nextCreditNoteSequence atomisk i db.$transaction
  //   3. Marker original faktura cancelled=true + status=CANCELLED +
  //      cancelReason (Invoice er ikke sealed → ingen immutability_bypass
  //      nødvendig)
  //   4. Opret reversal JournalEntry med date = originalens accrual JE dato,
  //      reference REVERSAL-INV-{år}-0001, byttet debet/kredit
  //   5. Seal reversal JE + tildel voucherNumber
  const invoice1Accrual = createdEntries.find((e) => e.reference === `INV-${CURRENT_YEAR}-0001`);
  if (!invoice1Accrual) {
    fail(`Kunne ikke finde accrual JE for INV-${CURRENT_YEAR}-0001 — annullering kan ikke fortsætte.`);
  }

  // 10b.1 — Opret kreditnota + bump sequence atomisk
  const creditNote = await db.$transaction(async (tx) => {
    const cn = await tx.invoice.create({
      data: {
        invoiceNumber: `KRE-${CURRENT_YEAR}-0001`,
        documentType: 'CREDIT_NOTE',
        originalInvoiceId: invoice1.id,
        customerName: invoice1.customerName,
        customerAddress: invoice1.customerAddress,
        customerCvr: invoice1.customerCvr,
        // issueDate = originalens issueDate (samme transaktionsdato — lander i
        // rigtig periode jf. bogføringslovens god praksis)
        issueDate: invoice1.issueDate,
        dueDate: invoice1.issueDate,
        // Spejlede negative beløb (kreditnotaen dokumenterer tilbageføring af salget)
        lineItems: [
          { description: 'Kreditnota – Cloud migration konsulentydelse', quantity: -10, unitPrice: 8000, vatPercent: 25 },
        ],
        subtotal: -80000,
        vatTotal: -20000,
        total: -100000,
        currency: 'DKK',
        status: 'SENT',
        notes: `Automatisk kreditnota ved annullering af INV-${CURRENT_YEAR}-0001. Årsag: Fejl i faktura — kunden skulle ikke have faktureres`,
        userId: user.id,
        companyId: company.id,
      },
    });

    // Bump credit-note sequence (atomisk sammen med kreditnota-oprettelsen)
    await tx.company.update({
      where: { id: company.id },
      data: { nextCreditNoteSequence: 2 },
    });

    return cn;
  });
  console.log(`   ✅ Kreditnota ${creditNote.invoiceNumber} oprettet for annullering af ${invoice1.invoiceNumber}`);

  // 10b.2 — Marker original faktura cancelled (Invoice er IKKE sealed — ingen bypass nødvendig)
  await db.invoice.update({
    where: { id: invoice1.id },
    data: {
      cancelled: true,
      cancelReason: 'Fejl i faktura — kunden skulle ikke have faktureres',
      status: 'CANCELLED',
    },
  });

  // 10b.3 — Opret reversal JournalEntry (POSTED + sealed + voucherNumber)
  await db.$transaction(async (tx: PrismaTransaction) => {
    const reversalJE = await tx.journalEntry.create({
      data: {
        // Korrekt transaktionsdato = originalens accrual JE dato (IKKE new Date())
        date: invoice1Accrual.date,
        description: `Annullering – ${invoice1Accrual.description}`,
        reference: `REVERSAL-INV-${CURRENT_YEAR}-0001`,
        status: JournalEntryStatus.POSTED,
        cancelled: false,
        companyId: company.id,
        userId: user.id,
        currency: 'DKK',
        lines: {
          create: invoice1Accrual.lines.map((line) => ({
            companyId: company.id,
            accountId: accountByNumber.get(line.accountNumber)!.id,
            // Swap debit ↔ credit for at reversere posteringen
            debit: line.credit ? r2(line.credit) : 0,
            credit: line.debit ? r2(line.debit) : 0,
            vatCode: line.vatCode || null,
            description: `Annullering – ${line.description || ''}`,
          })),
        },
      },
    });

    const voucherNumber = await assignVoucherNumberIfPosted(tx, reversalJE.id, company.id, 'POSTED');
    const { recordHash } = await sealJournalEntry(tx, reversalJE.id, company.id);
    console.log(`   ✅ REVERSAL-INV-${CURRENT_YEAR}-0001 — bilag ${voucherNumber} | hash: ${recordHash?.substring(0, 16)}…`);
  });

  // ─── 11. Valider resultat ──────────────────────────────────────────────
  console.log('\n[9/9] Validerer resultat…');
  const finalEntries = await db.journalEntry.findMany({
    where: { companyId: company.id, status: 'POSTED' },
    select: { id: true, voucherNumber: true, reference: true, cancelled: true, recordHash: true },
    orderBy: { voucherNumber: 'asc' },
  });

  console.log(`   ✅ ${finalEntries.length} POSTED entries oprettet:`);
  for (const e of finalEntries) {
    const cancelledTag = e.cancelled ? ' [CANCELLED]' : '';
    const hashTag = e.recordHash ? `hash=${e.recordHash.substring(0, 12)}…` : 'NO HASH';
    console.log(`      • bilag ${e.voucherNumber} — ${e.reference || '(no ref)'}${cancelledTag} — ${hashTag}`);
  }

  const mappings = await db.standardAccountMapping.count({ where: { companyId: company.id } });
  const accounts2 = await db.account.count({ where: { companyId: company.id } });
  const transactions = await db.transaction.count({ where: { companyId: company.id } });
  const transactionsCancelled = await db.transaction.count({ where: { companyId: company.id, cancelled: true } });
  const invoicesTotal = await db.invoice.count({ where: { companyId: company.id } });
  const invoicesActive = await db.invoice.count({ where: { companyId: company.id, cancelled: false, documentType: 'INVOICE' } });
  const invoicesCancelled = await db.invoice.count({ where: { companyId: company.id, cancelled: true, documentType: 'INVOICE' } });
  const creditNotesTotal = await db.invoice.count({ where: { companyId: company.id, documentType: 'CREDIT_NOTE' } });

  // ─── Opsummering ────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  🎉 SCREENSHOT TENANT KLAR');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  Company:         ${company.name}`);
  console.log(`  Company ID:      ${company.id}`);
  console.log(`  CVR:             ${company.cvrNumber} (fiktivt)`);
  console.log(`  User:            ${user.email} (OWNER)`);
  console.log(`  Accounts:        ${accounts2}`);
  console.log(`  Mappings:        ${mappings} (FSR → 2026-kontoplan)`);
  console.log(`  Fakturaer:       ${invoicesTotal} (${invoicesActive} aktive, ${invoicesCancelled} annulleret med kreditnota)`);
  console.log(`  Kreditnotaer:    ${creditNotesTotal} (KRE-${CURRENT_YEAR}-0001 — oprettet ved faktura-annullering)`);
  console.log(`  Transactions:    ${transactions} (${transactionsCancelled} annulleret med modpostering REVERSAL-TX-LEJE-JAN)`);
  console.log(`  Journal entries: ${finalEntries.length} POSTED (inkl. reversal entries)`);
  console.log(`     • 8 oprindelige POSTED entries ${CURRENT_YEAR} (bilag 1-8, incl. faktura-accruals INV-${CURRENT_YEAR}-0001/0002)`);
  console.log(`     • 8 POSTED entries for 2024 (2 pr. kvartal — Q1/Q2/Q3/Q4, med moms til SKAT testnet)`);
  console.log(`     • 1 transaktion annulleret med modpostering (REVERSAL-TX-LEJE-JAN)`);
  console.log(`     • 1 faktura annulleret med kreditnota (KRE-${CURRENT_YEAR}-0001) + modpostering (REVERSAL-INV-${CURRENT_YEAR}-0001)`);
  console.log(`  einvoiceEnabled: ${company.einvoiceEnabled} → NemHandel-banner vil vises`);
  console.log('');
  console.log('── Næste skridt ────────────────────────────────────────────────────');
  console.log('1. Log ind i AlphaFlow som ' + user.email);
  console.log('2. Skift til virksomheden "AlphaFlow Screenshot Demo"');
  console.log('3. Tag screenshots ifølge erhvervsstyrelsen-svar/Guide-Bilag-19a-20a-20b-20e.md');
  console.log('   • Bilag 20b: vis REVERSAL-TX-LEJE-JAN + REVERSAL-INV-' + CURRENT_YEAR + '-0001');
  console.log('                + kreditnota KRE-' + CURRENT_YEAR + '-0001 i finansjournalen');
  console.log('4. Momsindberetning: vælg år 2024 → alle 4 kvartaler har moms-data');
  console.log('');
  console.log('── Oprydning (når du er færdig) ────────────────────────────────────');
  console.log('bun run scripts/remove-screenshot-tenant.ts');
  console.log('');
}

// ─── Kør ───────────────────────────────────────────────────────────────────

main()
  .catch((err) => {
    console.error('\n💥 Script fejlede:', err);
    console.error('\nFor at rydde op efter en delvis seed, kør:');
    console.error('  bun run scripts/remove-screenshot-tenant.ts');
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
