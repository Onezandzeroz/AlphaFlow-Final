/**
 * Clear all Storecove test data — deletes legal entities + peppol identifiers
 * from the Storecove sandbox so you can start fresh.
 *
 * Usage:
 *   bun scripts/clear-storecove-test-data.ts                          # dry run
 *   bun scripts/clear-storecove-test-data.ts --confirm                # delete (auto-detect from DB)
 *   bun scripts/clear-storecove-test-data.ts --le 1040564             # dry run, specific LE ID
 *   bun scripts/clear-storecove-test-data.ts --le 1040564 --confirm   # delete specific LE ID
 *   bun scripts/clear-storecove-test-data.ts --le 1040564,1040565     # multiple LE IDs
 *
 * What this script deletes via API:
 *   ✓ Legal entities (+ their peppol identifiers)
 *   ✓ Webhook instances from the pull-mode queue (GET /webhook_instances/)
 *   ✓ Storecove connection flags in AlphaFlow's DB
 *
 * What CANNOT be deleted via API (Storecove doesn't expose DELETE endpoints):
 *   ✗ "Invoices Sent" history (document_submissions) — dashboard only
 *   ✗ "Webhook History" (push-mode delivery log) — dashboard only
 *   These are read-only audit records in Storecove's system. They don't
 *   affect re-creating legal entities or sending new test invoices.
 *   To clear them, log into https://app.storecove.com and delete manually
 *   if the dashboard provides a delete button (some entries may be
 *   non-deletable by design).
 *
 * If --le is not provided, the script looks for connected companies in
 * AlphaFlow's DB. If none are found, it lists all companies for debugging.
 *
 * Bun auto-loads .env.
 */

import { db } from '../src/lib/db';

async function main() {
  const confirm = process.argv.includes('--confirm');
  const leArg = process.argv.find((a) => a.startsWith('--le='));
  const leFlag = process.argv.indexOf('--le');
  const leIdsArg =
    leArg ? leArg.replace('--le=', '') :
    leFlag !== -1 ? process.argv[leFlag + 1] : '';

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

  // 1. Determine which legal entity IDs to process
  let legalEntityIds: number[] = [];

  if (leIdsArg) {
    // Explicit IDs from command line
    legalEntityIds = leIdsArg
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);
    console.log(`\nUsing legal entity IDs from --le arg: ${legalEntityIds.join(', ')}`);
  } else {
    // Auto-detect from AlphaFlow DB
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
      },
    });

    if (companies.length > 0) {
      legalEntityIds = companies.map((c) => c.storecoveLegalEntityId!).filter((id): id is number => id !== null);
      console.log(`Found ${companies.length} connected company(s):`);
      for (const c of companies) {
        console.log(`  LE ${c.storecoveLegalEntityId}: ${c.name} (CVR: ${c.cvrNumber})`);
      }
    } else {
      // No connected companies — show ALL companies for debugging
      console.log('No companies with storecoveConnected=true found.');
      console.log('\nAll companies in DB:');
      const allCompanies = await db.company.findMany({
        select: {
          id: true,
          name: true,
          cvrNumber: true,
          storecoveConnected: true,
          storecoveLegalEntityId: true,
        },
        take: 20,
      });
      for (const c of allCompanies) {
        console.log(`  ${c.id}: ${c.name} (CVR: ${c.cvrNumber}, connected: ${c.storecoveConnected}, LE: ${c.storecoveLegalEntityId ?? 'null'})`);
      }
      console.log('\n──────────────────────────────────────────────────────');
      console.log('No connected companies found in DB.');
      console.log('If you have legal entities in Storecove that aren\'t');
      console.log('linked in the DB, pass them explicitly:');
      console.log('');
      console.log('  bun scripts/clear-storecove-test-data.ts --le 1040564');
      console.log('');
      console.log('Or check your Storecove dashboard for the legal');
      console.log('entity ID(s) and pass them with --le.');
      process.exit(0);
    }
  }

  if (legalEntityIds.length === 0) {
    console.log('\n✗ No legal entity IDs to process.');
    process.exit(0);
  }

  // 2. Preview: fetch each legal entity from Storecove
  console.log(`\n=== Legal entities to process (${legalEntityIds.length}) ===\n`);

  type LeInfo = {
    id: number;
    partyName?: string;
    peppolIdentifiers: Array<{ superscheme: string; scheme: string; identifier: string }>;
    companyId?: string; // AlphaFlow company ID if matched in DB
  };

  const leInfos: LeInfo[] = [];

  for (const leId of legalEntityIds) {
    const response = await fetch(`${apiUrl}/legal_entities/${leId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`  LE ${leId}: Not found in Storecove (already deleted?)`);
      } else {
        console.log(`  LE ${leId}: Failed to fetch (${response.status})`);
      }
      leInfos.push({ id: leId, peppolIdentifiers: [] });
      continue;
    }

    const data = await response.json() as {
      id: number;
      party_name?: string;
      peppol_identifiers?: Array<{ superscheme: string; scheme: string; identifier: string }>;
    };

    // Try to find the matching AlphaFlow company
    const company = await db.company.findFirst({
      where: { storecoveLegalEntityId: leId },
      select: { id: true, name: true, cvrNumber: true },
    });

    console.log(`  LE ${leId}: ${data.party_name || '(no name)'}`);
    console.log(`    AlphaFlow company: ${company ? `${company.name} (${company.id})` : 'NOT FOUND in DB'}`);
    console.log(`    Peppol identifiers:`);
    for (const pi of data.peppol_identifiers || []) {
      console.log(`      ${pi.scheme}:${pi.identifier} (${pi.superscheme})`);
    }
    console.log('');

    leInfos.push({
      id: leId,
      partyName: data.party_name,
      peppolIdentifiers: data.peppol_identifiers || [],
      companyId: company?.id,
    });
  }

  if (!confirm) {
    console.log('─'.repeat(60));
    console.log('DRY RUN — nothing was deleted.');
    console.log('To actually delete, run with --confirm');
    process.exit(0);
  }

  // 3. Delete each legal entity
  console.log('─'.repeat(60));
  console.log('Deleting...\n');

  let deletedCount = 0;
  let errorCount = 0;

  for (const le of leInfos) {
    console.log(`Processing LE ${le.id} (${le.partyName || 'no name'})...`);

    // 3a. Delete peppol identifiers
    for (const pi of le.peppolIdentifiers) {
      console.log(`  Deleting peppol identifier: ${pi.scheme}:${pi.identifier}`);
      const url = `${apiUrl}/legal_entities/${le.id}/peppol_identifiers/${pi.superscheme}/${pi.scheme}/${pi.identifier}`;
      const delPi = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (delPi.ok) console.log(`    ✓ Deleted`);
      else if (delPi.status === 404) console.log(`    ⚠ Not found (already deleted?)`);
      else console.log(`    ✗ Failed: ${delPi.status} — ${await delPi.text()}`);
    }

    // 3b. Delete the legal entity
    console.log(`  Deleting legal entity ${le.id}...`);
    const delLe = await fetch(`${apiUrl}/legal_entities/${le.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (delLe.ok) console.log(`    ✓ Legal entity deleted`);
    else if (delLe.status === 404) console.log(`    ⚠ Not found (already deleted?)`);
    else console.log(`    ✗ Failed: ${delLe.status} — ${await delLe.text()}`);

    // 3c. Clear DB flags if we found a matching company
    if (le.companyId) {
      console.log(`  Clearing DB flags for company ${le.companyId}...`);
      await db.company.update({
        where: { id: le.companyId },
        data: {
          storecoveConnected: false,
          storecoveLegalEntityId: null,
          storecoveConnectedAt: null,
          storecoveLastTestedAt: null,
          storecoveApiKeyId: null,
          einvoiceEndpointId: null,
          einvoicePeppolAs4Id: null,
        },
      });
      console.log(`    ✓ DB flags cleared`);
    }

    deletedCount++;
    console.log('');
  }

  // 4. Clear webhook instances from the pull-mode queue
  console.log('─'.repeat(60));
  console.log('Clearing webhook instances (pull-mode queue)...\n');

  let webhookCount = 0;
  // GET /webhook_instances/ returns one instance at a time from the FIFO
  // queue. Delete each one until we get a 204 (queue empty).
  // Safety cap at 500 to avoid infinite loop.
  for (let i = 0; i < 500; i++) {
    const getResponse = await fetch(`${apiUrl}/webhook_instances/`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (getResponse.status === 204) {
      console.log('  Queue empty.');
      break;
    }

    if (!getResponse.ok) {
      console.log(`  ✗ Failed to GET webhook instance: ${getResponse.status}`);
      break;
    }

    const instance = await getResponse.json() as { guid?: string };
    if (!instance.guid) {
      console.log('  ⚠ No guid in response, stopping.');
      break;
    }

    console.log(`  Deleting webhook instance ${instance.guid}...`);
    const delResponse = await fetch(`${apiUrl}/webhook_instances/${instance.guid}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (delResponse.ok) {
      webhookCount++;
    } else {
      console.log(`    ✗ Failed to delete: ${delResponse.status}`);
    }
  }
  console.log(`  ✓ Cleared ${webhookCount} webhook instance(s) from queue`);

  console.log('═'.repeat(60));
  console.log(`  Done. Legal entities: ${deletedCount}, Webhook instances: ${webhookCount}`);
  console.log('═'.repeat(60));
  console.log('\n⚠ Cannot delete via API (Storecove dashboard only):');
  console.log('   • "Invoices Sent" history (document_submissions)');
  console.log('   • "Webhook History" (push-mode delivery log)');
  console.log('   These are read-only audit records. To clear them:');
  console.log('   1. Log into https://app.storecove.com');
  console.log('   2. Navigate to the relevant section');
  console.log('   3. Delete manually if the dashboard provides a button');
  console.log('   (Some entries may be non-deletable by design)');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Verify in Storecove dashboard that legal entities are gone');
  console.log('  2. Re-create from AlphaFlow UI: Settings → eLevering');
  console.log('  3. If "identifier already exists" — wait a few minutes');
  console.log('     (Storecove grace period) or contact support@storecove.com');

  await db.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n✗ Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
