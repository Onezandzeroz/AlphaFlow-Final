/**
 * scripts/remove-screenshot-tenant.ts
 *
 * Fjerner helt en "AlphaFlow Screenshot Demo" tenant og ALLE relaterede data.
 *
 * Brug:
 *   bun run scripts/remove-screenshot-tenant.ts
 *
 * Med dry-run (viser hvad der vil blive slettet uden at røre databasen):
 *   DRY_RUN=1 bun run scripts/remove-screenshot-tenant.ts
 *
 * Scriptet bruger `immutability_bypass = 'true'` i transaktionen — det er
 * nødvendigt for at kunne slette sealed/hash-chained journal entries.
 * Sikkerheden ligger i at scriptet KUN sletter tenants med det præcise navn
 * "AlphaFlow Screenshot Demo" (hardcodet TENANT_NAME) — normale tenants
 * berøres IKKE.
 *
 * Scriptet sletter i leaf-first rækkefølge for at respektere FK-restriktioner.
 * Hvis en tabel ikke eksisterer (ældre migrationer), ignoreres fejlen stille.
 */

import { db } from '@/lib/db';

// ─── Konfiguration ─────────────────────────────────────────────────────────

const TENANT_NAME = 'AlphaFlow Screenshot Demo';

// ─── Hovedfunktion ─────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.env.DRY_RUN === '1';

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Remove: AlphaFlow Screenshot Demo tenant');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`Mode: ${dryRun ? 'DRY RUN (ingen ændringer)' : 'LIVE (sletter data)'}`);
  console.log('');

  // ─── Find tenant ────────────────────────────────────────────────────────
  const tenants = await db.company.findMany({
    where: { name: TENANT_NAME },
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
          contacts: true,
          journalEntries: true,
          accounts: true,
          vatSubmissions: true,
          auditLogs: true,
          standardAccountMappings: true,
        },
      },
    },
  });

  if (tenants.length === 0) {
    console.log(`✓ Ingen tenant fundet med navn "${TENANT_NAME}".`);
    console.log('  Intet at slette.');
    return;
  }

  if (tenants.length > 1) {
    console.log(`⚠️  Fandt ${tenants.length} tenants med samme navn — sletter alle.`);
  }

  console.log(`Fandt ${tenants.length} tenant(s):`);
  for (const t of tenants) {
    console.log(`  - ID: ${t.id}`);
    console.log(`    Navn: ${t.name}`);
    console.log(`    CVR: ${t.cvrNumber}`);
    console.log(`    isDemo: ${t.isDemo}, isActive: ${t.isActive}`);
    console.log(`    Oprettet: ${t.createdAt.toISOString()}`);
    console.log(`    Relaterede data:`);
    console.log(`      transactions: ${t._count.transactions}`);
    console.log(`      invoices: ${t._count.invoices}`);
    console.log(`      contacts: ${t._count.contacts}`);
    console.log(`      journalEntries: ${t._count.journalEntries}`);
    console.log(`      accounts: ${t._count.accounts}`);
    console.log(`      vatSubmissions: ${t._count.vatSubmissions}`);
    console.log(`      standardAccountMappings: ${t._count.standardAccountMappings}`);
    console.log(`      auditLogs: ${t._count.auditLogs} (slettes — demo undtaget fra Bogføringsloven)`);
  }

  if (dryRun) {
    console.log('\n[DRY RUN] Ingen ændringer foretaget. Kør uden DRY_RUN=1 for at slette.');
    return;
  }

  // ─── Sikkerhedscheck: kun screenshot-tenanten må slettes ────────────────
  // Vi tjekker på NAVN (ikke isDemo) fordi screenshot-tenanten er sat til
  // isDemo=false for at kunne vises i company picker. Sikkerheden ligger i
  // at TENANT_NAME er hardcodet ("AlphaFlow Screenshot Demo") og aldrig
  // matcher en rigtig produktions-tenant.
  for (const t of tenants) {
    if (t.name !== TENANT_NAME) {
      console.error(
        `\n❌ SIKKERHEDSSTOP: Tenant "${t.name}" (ID: ${t.id}) matcher ikke forventet navn "${TENANT_NAME}".\n` +
          `Scriptet nægter at slette — beskytter mod utilsigtet sletning af rigtige tenants.\n` +
          `Hvis du har brug for at slette en anden tenant manuelt, skal du selv skrive SQL med immutability_bypass.`,
      );
      process.exit(1);
    }
  }

  // ─── Slet hver tenant i leaf-first rækkefølge ──────────────────────────
  console.log('\nSletter (leaf-first rækkefølge, bevarer Bogføringsloven for normale tenants)…');

  for (const t of tenants) {
    console.log(`\n  Behandler tenant: ${t.name} (ID: ${t.id})`);
    try {
      await db.$transaction(async (tx) => {
        // Aktivér immutability_bypass for demo-data (undtaget fra Bogføringsloven)
        await tx.$executeRawUnsafe(`SET LOCAL app.immutability_bypass = 'true'`);

        // ── Leaf-tabeller (ingenCascade, slettes først) ─────────────────
        // Brug .catch(() => {}) på tabeller der måske ikke eksisterer i alle
        // migrationer — vi vil ikke have hele scriptet til at fejle pga. en
        // manglende tabel.

        // Bank-data
        await tx.bankStatementLine.deleteMany({ where: { companyId: t.id } }).catch(() => {});
        await tx.bankStatement.deleteMany({ where: { companyId: t.id } }).catch(() => {});
        await tx.bankConnectionSync.deleteMany({ where: { bankConnection: { companyId: t.id } } }).catch(() => {});
        await tx.bankConnection.deleteMany({ where: { companyId: t.id } }).catch(() => {});

        // Recurring + Budgets
        await tx.recurringEntry.deleteMany({ where: { companyId: t.id } }).catch(() => {});
        await tx.budgetEntry.deleteMany({ where: { budget: { companyId: t.id } } }).catch(() => {});
        await tx.projectBudgetEntry.deleteMany({ where: { project: { companyId: t.id } } }).catch(() => {});
        await tx.budget.deleteMany({ where: { companyId: t.id } }).catch(() => {});

        // StandardAccountMapping (referencer Account — slet før Account)
        await tx.standardAccountMapping.deleteMany({ where: { companyId: t.id } }).catch(() => {});

        // JournalEntryLines (referencer Account med Restrict — slet før Account)
        await tx.journalEntryLine.deleteMany({ where: { companyId: t.id } }).catch(() => {});
        // JournalEntry
        await tx.journalEntry.deleteMany({ where: { companyId: t.id } });

        // Transactions (referencer Account med Restrict — slet efter linjer)
        await tx.transaction.deleteMany({ where: { companyId: t.id } });

        // E-fakturering + modtagne fakturaer
        // EInvoiceSendEvent har relationen 'sending' (ikke 'eInvoiceSending')
        await tx.eInvoiceSendEvent.deleteMany({ where: { sending: { companyId: t.id } } }).catch(() => {});
        await tx.eInvoiceSending.deleteMany({ where: { companyId: t.id } }).catch(() => {});
        await tx.receivedInvoice.deleteMany({ where: { companyId: t.id } }).catch(() => {});

        // VATSubmissions
        await tx.vATSubmission.deleteMany({ where: { companyId: t.id } }).catch(() => {});

        // Invoices + Payments
        // Payment har companyId direkte (det er abonnementsbetaling, ikke faktura-betaling)
        // InvoiceCounter er en singleton-tabel uden companyId — springes over
        await tx.payment.deleteMany({ where: { companyId: t.id } }).catch(() => {});
        await tx.invoice.deleteMany({ where: { companyId: t.id } }).catch(() => {});

        // Documents
        await tx.document.deleteMany({ where: { companyId: t.id } }).catch(() => {});

        // Projects
        await tx.project.deleteMany({ where: { companyId: t.id } }).catch(() => {});

        // Contacts
        // ContactMessage er en selvstændig kontaktformular uden companyId-relation — springes over
        await tx.contact.deleteMany({ where: { companyId: t.id } }).catch(() => {});

        // Hermes / AI
        // HermesAgentSkill har relationen 'agent' (ikke 'hermesAgent')
        await tx.hermesAgentSkill.deleteMany({ where: { agent: { companyId: t.id } } }).catch(() => {});
        // HermesSkill er global (ingen companyId) — springes over
        // AgentMessage har relationen 'agent' (ikke 'agentReminder')
        await tx.agentMessage.deleteMany({ where: { agent: { companyId: t.id } } }).catch(() => {});
        // AgentReminder har relationen 'agent' (ikke companyId direkte)
        await tx.agentReminder.deleteMany({ where: { agent: { companyId: t.id } } }).catch(() => {});
        // HermesUsageRecord HAR companyId direkte
        await tx.hermesUsageRecord.deleteMany({ where: { companyId: t.id } }).catch(() => {});
        await tx.hermesAgent.deleteMany({ where: { companyId: t.id } }).catch(() => {});
        // KnowledgeChunk har relationen 'document' (ikke 'knowledgeDocument')
        await tx.knowledgeChunk.deleteMany({ where: { document: { tenantId: t.id } } }).catch(() => {});
        // KnowledgeDocument bruger 'tenantId' (ikke 'companyId')
        await tx.knowledgeDocument.deleteMany({ where: { tenantId: t.id } }).catch(() => {});

        // CustomVatCodes
        await tx.customVatCode.deleteMany({ where: { companyId: t.id } }).catch(() => {});

        // FiscalPeriods
        await tx.fiscalPeriod.deleteMany({ where: { companyId: t.id } }).catch(() => {});

        // Notifications + webhooks + email logs
        // NotificationRead: User har relationen 'companies' (ikke 'userCompanies')
        await tx.notificationRead.deleteMany({ where: { user: { companies: { some: { companyId: t.id } } } } }).catch(() => {});
        await tx.webhookEvent.deleteMany({ where: { companyId: t.id } }).catch(() => {});
        await tx.emailLog.deleteMany({ where: { companyId: t.id } }).catch(() => {});
        await tx.consentLog.deleteMany({ where: { companyId: t.id } }).catch(() => {});

        // AuditLog (refererer Company med Restrict — slet for demo)
        await tx.auditLog.deleteMany({ where: { companyId: t.id } }).catch(() => {});

        // Backups + CronExecutions
        await tx.backup.deleteMany({ where: { companyId: t.id } }).catch(() => {});
        await tx.cronExecution.deleteMany({ where: { companyId: t.id } }).catch(() => {});

        // ── Nu kan Account slettes (alle referencer er væk) ─────────────
        await tx.account.deleteMany({ where: { companyId: t.id } });

        // ── UserCompany (join-tabel) ────────────────────────────────────
        await tx.userCompany.deleteMany({ where: { companyId: t.id } });

        // ── Endelig: Company selv ───────────────────────────────────────
        await tx.company.delete({ where: { id: t.id } });
      });

      console.log(`    ✅ Slettet: "${t.name}" + alle relaterede data`);
    } catch (err) {
      console.error(
        `    ❌ Kunne ikke slette tenant ${t.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      console.error('       Schema cascade-adfærd er uændret — normale tenants berøres ikke.');
      console.error('       Hvis dette fortsætter, tjek for nye tabeller der refererer Company uden Cascade.');
      throw err;
    }
  }

  // ─── Bekræft at tenant er væk ───────────────────────────────────────────
  const verify = await db.company.findMany({
    where: { name: TENANT_NAME },
    select: { id: true, name: true },
  });
  if (verify.length === 0) {
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('  ✅ TENANT FJERNET — ingen spor tilbage');
    console.log('═══════════════════════════════════════════════════════════════════');
  } else {
    console.error(`\n⚠️  Tenant findes stadig — ${verify.length} række(r) tilbage.`);
    process.exit(1);
  }
}

// ─── Kør ───────────────────────────────────────────────────────────────────

main()
  .catch((err) => {
    console.error('\n💥 Script fejlede:', err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
