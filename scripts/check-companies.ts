// Temporary diagnostic script — shows all companies in the database
// This file is gitignored and will be deleted after diagnosis.
import { db } from '@/lib/db';

async function main() {
  console.log('=== Alle virksomheder i databasen ===\n');

  const companies = await db.company.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      cvrNumber: true,
      isDemo: true,
      isActive: true,
      createdAt: true,
      _count: {
        select: {
          transactions: true,
          invoices: true,
          accounts: true,
          users: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  for (const c of companies) {
    console.log(`ID: ${c.id}`);
    console.log(`  Navn: ${c.name}`);
    console.log(`  CVR: ${c.cvrNumber}`);
    console.log(`  isDemo: ${c.isDemo}`);
    console.log(`  Oprettet: ${c.createdAt}`);
    console.log(`  Brugere: ${c._count.users}, Transaktioner: ${c._count.transactions}, Fakturaer: ${c._count.invoices}, Konti: ${c._count.accounts}`);
    console.log('');
  }

  console.log(`\nTotal: ${companies.length} aktive virksomheder`);

  // Tjek specifikt for CVR 41250313
  const skatTestCompanies = companies.filter(c => c.cvrNumber === '41250313');
  console.log(`\nVirksomheder med CVR 41250313: ${skatTestCompanies.length}`);
  for (const c of skatTestCompanies) {
    console.log(`  - ${c.name} (isDemo: ${c.isDemo}) — ${c._count.transactions} transaktioner`);
  }

  // Tjek inaktive virksomheder også (måske er demo-virksomheden deaktiveret)
  const inactive = await db.company.findMany({
    where: { isActive: false },
    select: { id: true, name: true, cvrNumber: true, isDemo: true },
  });
  if (inactive.length > 0) {
    console.log(`\nInaktive virksomheder: ${inactive.length}`);
    for (const c of inactive) {
      console.log(`  - ${c.name} (CVR: ${c.cvrNumber}, isDemo: ${c.isDemo})`);
    }
  }
}

main().catch(console.error).finally(() => db.$disconnect());
