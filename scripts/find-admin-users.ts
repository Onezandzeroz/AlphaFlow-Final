// scripts/find-admin-users.ts
//
// Lister alle admin-brugere i databasen — bruges til at finde user-id
// når man ikke har psql installeret.
//
// Brug:
//   bun run scripts/find-admin-users.ts
//
// Output viser: id, email, navn, isAdmin, oprettet-dato + antal virksomheder.

import { db } from '@/lib/db';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Admin-brugere i databasen');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const users = await db.user.findMany({
    where: { isAdmin: true },
    select: {
      id: true,
      email: true,
      name: true,
      isAdmin: true,
      isActive: true,
      createdAt: true,
      _count: {
        select: {
          userCompanies: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (users.length === 0) {
    console.log('❌ Ingen admin-brugere fundet.');
    console.log('');
    console.log('Mulige årsager:');
    console.log('  1. Du har ikke oprettet en admin-bruger endnu');
    console.log('  2. DATABASE_URL peger på en tom database');
    console.log('  3. Prisma Client er ikke genereret (kør: bun run db:generate)');
    return;
  }

  console.log(`Fandt ${users.length} admin-bruger(e):\n`);

  for (const u of users) {
    console.log(`ID:        ${u.id}`);
    console.log(`  Email:   ${u.email}`);
    console.log(`  Navn:    ${u.name || '(ikke angivet)'}`);
    console.log(`  Aktiv:   ${u.isActive}`);
    console.log(`  Virksomheder: ${u._count.userCompanies}`);
    console.log(`  Oprettet: ${u.createdAt.toISOString()}`);
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Kopiér ID'et ovenfor og brug det i seed-scriptet:');
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
