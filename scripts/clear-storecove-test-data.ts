/**
 * Clear all Storecove test data — deletes legal entities + peppol identifiers
 * from the Storecove sandbox so you can start fresh.
 *
 * Usage:
 *   bun scripts/clear-storecove-test-data.ts          # dry run (preview)
 *   bun scripts/clear-storecove-test-data.ts --confirm # actually delete
 *
 * Bun auto-loads .env.
 *
 * What it does:
 *   1. Lists all legal entities via GET /legal_entities (with their peppol identifiers)
 *   2. For each legal entity:
 *      a. Deletes all peppol identifiers
 *      b. Deletes the legal entity itself
 *   3. Also clears the Storecove connection flags on the Company rows in
 *      AlphaFlow's DB so the UI shows "not connected" again.
 *
 * NOTE: Storecove may have a grace period before identifiers can be re-used.
 * If you get "identifier already exists" when re-creating, wait a few minutes
 * or contact support@storecove.com to release them.
 */

import { db } from '../src/lib/db';

async function main() {
  const confirm = process.argv.includes('--confirm');

  console.log('═'.repeat(60));
  console.log('  Clear Storecove Test Data');
  console.log(`  Mode: ${confirm ? 'CONFIRM — will delete' : 'DRY RUN — preview only'}`);
  console.log('═'.repeat(60));

  const apiUrl = process.env.STORECOVE_API_URL;
  const apiKey = process.env.STORECOVE_API_KEY;

  if (!apiUrl || !apiKey) {
    console.error('\n✗ STORECOVE_API_URL or STORECOVE_API_KEY not set in .env');
    process.exit(1);
  }

  // 1. List all legal entities
  // Storecove has no GET /legal_entities list endpoint, but we can
  // get them from AlphaFlow's DB (Company.storecoveLegalEntityId).
  console.log('\n=== Finding connected companies in DB ===');
  const companies = await db.company.findMany({
    where: {
      storecoveConnected: true,
      storecoveLegalEntityId: { not: null },
    },
    select: {
      id: true,
      name: true,
      cvrNumber: true,
      storecoveLegalEntityId: true,
      storecoveConnectedAt: true,
    },
  });

  if (companies.length === 0) {
    console.log('\n✓ No companies with Storecove connection found. Nothing to clear.');
    process.exit(0);
  }

  console.log(`\nFound ${companies.length} connected company(s):\n`);
  for (const c of companies) {
    console.log(`  ID: ${c.id}`);
    console.log(`  Name: ${c.name}`);
    console.log(`  CVR: ${c.cvrNumber}`);
    console.log(`  Legal Entity ID: ${c.storecoveLegalEntityId}`);
    console.log('');
  }

  if (!confirm) {
    console.log('─'.repeat(60));
    console.log('DRY RUN — nothing was deleted.');
    console.log('To actually delete, run: bun scripts/clear-storecove-test-data.ts --confirm');
    process.exit(0);
  }

  // 2. Delete each legal entity's peppol identifiers + the entity itself
  console.log('─'.repeat(60));
  console.log('Deleting...\n');

  let deletedCount = 0;
  let errorCount = 0;

  for (const company of companies) {
    const leId = company.storecoveLegalEntityId!;
    console.log(`Processing Legal Entity ${leId} (${company.name})...`);

    try {
      // 2a. Fetch the legal entity to get its peppol identifiers
      const leResponse = await fetch(`${apiUrl}/legal_entities/${leId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!leResponse.ok) {
        if (leResponse.status === 404) {
          console.log(`  ⚠ Legal entity ${leId} not found in Storecove (already deleted?). Skipping.`);
        } else {
          console.log(`  ✗ Failed to fetch LE ${leId}: ${leResponse.status} ${leResponse.statusText}`);
        }
      } else {
        const leData = await leResponse.json() as {
          peppol_identifiers?: Array<{
            superscheme: string;
            scheme: string;
            identifier: string;
          }>;
        };

        // 2b. Delete each peppol identifier
        const peppolIds = leData.peppol_identifiers || [];
        for (const pi of peppolIds) {
          console.log(`  Deleting peppol identifier: ${pi.scheme}:${pi.identifier}`);
          const delPiResponse = await fetch(
            `${apiUrl}/legal_entities/${leId}/peppol_identifiers/${pi.superscheme}/${pi.scheme}/${pi.identifier}`,
            {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${apiKey}` },
            }
          );
          if (delPiResponse.ok) {
            console.log(`    ✓ Deleted`);
          } else if (delPiResponse.status === 404) {
            console.log(`    ⚠ Not found (already deleted?)`);
          } else {
            const errBody = await delPiResponse.text();
            console.log(`    ✗ Failed: ${delPiResponse.status} — ${errBody}`);
          }
        }

        // 2c. Delete the legal entity itself
        console.log(`  Deleting legal entity ${leId}...`);
        const delLeResponse = await fetch(`${apiUrl}/legal_entities/${leId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (delLeResponse.ok) {
          console.log(`    ✓ Legal entity deleted`);
        } else if (delLeResponse.status === 404) {
          console.log(`    ⚠ Not found (already deleted?)`);
        } else {
          const errBody = await delLeResponse.text();
          console.log(`    ✗ Failed: ${delLeResponse.status} — ${errBody}`);
        }
      }

      // 2d. Clear the Storecove connection flags in AlphaFlow's DB
      console.log(`  Clearing DB connection flags for company ${company.id}...`);
      await db.company.update({
        where: { id: company.id },
        data: {
          storecoveConnected: false,
          storecoveLegalEntityId: null,
          storecoveConnectedAt: null,
          storecoveLastTestedAt: null,
          storecoveApiKeyId: null,
          // Reset e-invoice fields that were auto-set during LE creation
          einvoiceEndpointId: null,
          einvoicePeppolAs4Id: null,
        },
      });
      console.log(`    ✓ DB flags cleared`);

      deletedCount++;
    } catch (err) {
      console.log(`  ✗ Error: ${err instanceof Error ? err.message : String(err)}`);
      errorCount++;
    }
    console.log('');
  }

  console.log('═'.repeat(60));
  console.log(`  Done. Deleted: ${deletedCount}, Errors: ${errorCount}`);
  console.log('═'.repeat(60));
  console.log('\nNext steps:');
  console.log('  1. Verify in Storecove dashboard that legal entities are gone');
  console.log('  2. Re-create legal entity from AlphaFlow UI: Settings → eLevering');
  console.log('  3. If you get "identifier already exists", wait a few minutes');
  console.log('     (Storecove grace period) or contact support@storecove.com');

  await db.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n✗ Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
