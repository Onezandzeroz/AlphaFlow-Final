/**
 * scripts/seed-screenshot-tenant.ts
 *
 * Opretter en "Screenshot Demo" tenant perfekt seedet med mock data
 * til Erhvervsstyrelsen-screenshots (Bilag 19a, 20a, 20b, 20e).
 *
 * Tenant-data:
 *   - Virksomhed: "AlphaFlow Screenshot Demo" (CVR 00000000, ApS, isDemo=true)
 *   - einvoiceEnabled = false  (så NemHandel-banneret vises — Bilag 20e)
 *   - ~45 FSR-konti + StandardAccountMapping til 2026-kontoplan (Bilag 19a)
 *   - 6 POSTED journal entries med fortløbende voucherNumber 1-6 (Bilag 20a)
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
  date: Date;
  lines: LineSpec[];
}

// ─── Entry-definitioner ────────────────────────────────────────────────────
// Hver entry er en bogført postering med tilhørende linjer (debet/kredit).
// Entry 5 er en normal POSTED entry — ingen annullering længere (se kommentar i ENTRIES).

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
  /** Hvis true, oprettes en tilhørende Transaction der peger på denne entry. */
  createTransaction?: {
    type: TransactionType;
    amount: number;
    vatPercent: number;
    description: string;
  };
  /** Hvis true, vil denne entry blive markeret cancelled + få en modpostering. */
  willBeCancelled?: boolean; // beholder typen for bagudkompatibilitet, men bruges ikke
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
  // Bemærk: Tidligere version annullerede entry 5 (husleje) med en modpostering.
  // Dette blev fjernet fordi verify-numbering endpointet rapporterer et "gap"
  // når en cancelled entry stadig optager et nummer i serien. Til Bilag 20b
  // (uforingerlighed) demonstreres uforingerlighed i stedet via:
  //   1. curl DELETE på en POSTED entry → 400 fejl "Only DRAFT can be cancelled"
  //   2. psql DELETE direkte → DB-trigger blokerer (Bogføringsloven §10-12)
  //   3. Kode-screenshot af hash-chain + immutability-triggere
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
  console.log('\n[1/8] Opretter Company…');
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
      invoicePrefix: 'INV',
    },
  });
  console.log(`   ✅ Company ID: ${company.id}`);
  console.log(`   ✅ Navn: ${company.name}`);
  console.log(`   ✅ CVR: ${company.cvrNumber} (fiktivt)`);
  console.log(`   ✅ einvoiceEnabled: ${company.einvoiceEnabled} (NemHandel-banner vil vises)`);

  // ─── 4. Opret UserCompany-medlemskab ──────────────────────────────────
  console.log('\n[2/8] Tilføjer bruger som OWNER…');
  await db.userCompany.create({
    data: {
      userId: user.id,
      companyId: company.id,
      role: 'OWNER',
    },
  });
  console.log(`   ✅ ${user.email} er nu OWNER af ${company.name}`);

  // ─── 5. Seed FSR-kontoplan (~45 konti) ────────────────────────────────
  console.log('\n[3/8] Seeder FSR-kontoplan (~45 konti)…');
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
  console.log('\n[4/8] Opretter StandardAccountMapping (FSR → 2026-kontoplan)…');
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
  console.log('\n[5/8] Opretter FiscalPeriods for året…');
  const fiscalPeriods = [];
  for (let month = 1; month <= 12; month++) {
    fiscalPeriods.push({
      companyId: company.id,
      year: CURRENT_YEAR,
      month,
      status: 'OPEN' as const,
    });
  }
  await db.fiscalPeriod.createMany({ data: fiscalPeriods, skipDuplicates: true });
  console.log(`   ✅ 12 FiscalPeriods oprettet (alle OPEN)`);

  // ─── 8. Opret Journal Entries (med voucherNumber + hash-chain) ───────
  console.log('\n[6/8] Opretter 5 POSTED journal entries med fortløbende voucherNumber…');

  const createdEntries: CreatedEntry[] = [];

  for (let i = 0; i < ENTRIES.length; i++) {
    const spec = ENTRIES[i];
    console.log(`   [${i + 1}/5] ${spec.description.substring(0, 50)}…`);

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

      createdEntries.push({
        id: entry.id,
        voucherNumber: voucherNumber || '',
        reference: spec.reference || null,
        date: spec.date,
        lines: spec.lines,
      });

      // Hvis denne entry har en tilhørende Transaction, opret den og seal den
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
      }
    });
  }

  // ─── (Tidligere trin 7/8 — annullering — er fjernet, se kommentar i ENTRIES) ──

  // ─── 10. Valider resultat ──────────────────────────────────────────────
  console.log('\n[8/8] Validerer resultat…');
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

  // ─── Opsummering ────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  🎉 SCREENSHOT TENANT KLAR');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  Company:       ${company.name}`);
  console.log(`  Company ID:    ${company.id}`);
  console.log(`  CVR:           ${company.cvrNumber} (fiktivt)`);
  console.log(`  User:          ${user.email} (OWNER)`);
  console.log(`  Accounts:      ${accounts2}`);
  console.log(`  Mappings:      ${mappings} (FSR → 2026-kontoplan)`);
  console.log(`  Transactions:  ${transactions} (alle aktive)`);
  console.log(`  Journal entries: ${finalEntries.length} POSTED`);
  console.log(`     • 6 aktive POSTED entries (bilag 1-6, ingen annulleringer)`);
  console.log(`  einvoiceEnabled: ${company.einvoiceEnabled} → NemHandel-banner vil vises`);
  console.log('');
  console.log('── Næste skridt ────────────────────────────────────────────────────');
  console.log('1. Log ind i AlphaFlow som ' + user.email);
  console.log('2. Skift til virksomheden "AlphaFlow Screenshot Demo"');
  console.log('3. Tag screenshots ifølge erhvervsstyrelsen-svar/Guide-Bilag-19a-20a-20b-20e.md');
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
