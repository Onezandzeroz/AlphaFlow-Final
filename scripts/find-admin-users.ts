// scripts/find-admin-users.ts
//
// Lister alle brugere i databasen der kan administrere en virksomhed
// (OWNER/ADMIN på mindst én virksomhed, eller isSuperDev=true).
// Bruges til at finde user-id når man ikke har psql installeret.
//
// Brug:
//   bun run scripts/find-admin-users.ts
//
// Output viser: id, email, businessName, isSuperDev, oprettet-dato,
// + hvilke virksomheder brugeren er OWNER/ADMIN på.

import { db } from '@/lib/db';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Brugere med admin-adgang (OWNER/ADMIN eller isSuperDev)');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Find brugere der er OWNER eller ADMIN på mindst én virksomhed,
  // ELLER har isSuperDev=true (AlphaAi super-admin).
  const users = await db.user.findMany({
    where: {
      OR: [
        { isSuperDev: true },
        {
          companies: {
            some: {
              role: { in: ['OWNER', 'ADMIN'] },
            },
          },
        },
      ],
      deactivatedAt: null, // kun aktive brugere
    },
    select: {
      id: true,
      email: true,
      businessName: true,
      isSuperDev: true,
      createdAt: true,
      companies: {
        select: {
          role: true,
          company: {
            select: { id: true, name: true, cvrNumber: true, isDemo: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (users.length === 0) {
    console.log('❌ Ingen brugere med admin-adgang fundet.');
    console.log('');
    console.log('Mulige årsager:');
    console.log('  1. Du har ikke oprettet nogen bruger endnu');
    console.log('  2. DATABASE_URL peger på en tom database');
    console.log('  3. Prisma Client er ikke genereret (kør: bun run db:generate)');
    console.log('  4. Ingen brugere er OWNER/ADMIN på en virksomhed');
    console.log('');
    console.log('For at se ALLE brugere (uanset rolle), kør:');
    console.log('  bun run scripts/find-admin-users.ts --all');
    return;
  }

  console.log(`Fandt ${users.length} bruger(e) med admin-adgang:\n`);

  for (const u of users) {
    console.log(`ID:          ${u.id}`);
    console.log(`  Email:     ${u.email}`);
    console.log(`  Virksomhed:${u.businessName ? ' ' + u.businessName : ' (ikke angivet)'}`);
    console.log(`  isSuperDev: ${u.isSuperDev}`);
    console.log(`  Oprettet:  ${u.createdAt.toISOString()}`);
    if (u.companies.length > 0) {
      console.log(`  Virksomheder (${u.companies.length}):`);
      for (const uc of u.companies) {
        const demoTag = uc.company.isDemo ? ' [DEMO]' : '';
        console.log(`    • ${uc.company.name} (CVR ${uc.company.cvrNumber}) — rolle: ${uc.role}${demoTag}`);
      }
    } else {
      console.log('  Virksomheder: (ingen — kun isSuperDev)');
    }
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log("  Kopiér ID'et ovenfor og brug det i seed-scriptet:");
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('  bun run scripts/seed-screenshot-tenant.ts <ID>');
  console.log('');
}

main()
  .catch((err) => {
    console.error('\n💥 Script fejlede:', err);
    console.error('\nTjek at:');
    console.error('  1. DATABASE_URL er sat i .env');
    console.error('  2. Prisma Client er genereret: bun run db:generate');
    console.error('  3. Databasen er tilgængelig');
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
