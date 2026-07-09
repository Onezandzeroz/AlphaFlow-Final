# Compliance-rapport — AlphaFlow

---

## Forside

| Felt | Indhold |
|------|---------|
| **Dokumenttype** | Compliance-rapport til Erhvervsstyrelsen |
| **Systemnavn** | AlphaFlow (`alphaflow.dk`) — pakke-navn `alphaai-accounting` v1.0.0 |
| **Dokumentversion** | 3.2 |
| **Udarbejdet af** | AlphaAi Consult ApS (App Owner / dataansvarlig) |
| **Lovgrundlag** | Lov om bogføring (LOV nr. 700 af 24. maj 2022), Anmeldelsesbekendtgørelsen (BEK nr. 98 af 26. januar 2023), Kravbekendtgørelsen (BEK nr. 97 af 26. januar 2023), GDPR (forordning 2016/679), IT-sikkerhedsloven |
| **Formål** | Registrering/godkendelse som digitalt regnskabssystem hos Erhvervsstyrelsen |
| **Sprog** | Dansk |
| **Dokumentation** | Dette dokument dokumenterer platformens compliance-tilstand jf. Lov om bogføring, BEK 97/98 og GDPR. Alle oplysninger er verificerbare i kildekoden. |

---

## Indholdsfortegnelse

1. [Indledning](#1-indledning)
2. [Bogføringsloven-overholdelse](#2-bogføringsloven-overholdelse)
3. [GDPR-overholdelse](#3-gdpr-overholdelse)
4. [Adgangskontrol & identitet](#4-adgangskontrol--identitet)
5. [Kryptering](#5-kryptering)
6. [Audit & logning](#6-audit--logning)
7. [Multi-tenant isolation](#7-multi-tenant-isolation)
8. [Netværkssikkerhed](#8-netværkssikkerhed)
9. [Fil-upload sikkerhed](#9-fil-upload-sikkerhed)
10. [Sikkerhedsmæssige bemærkninger](#10-sikkerhedsmæssige-bemærkninger)
11. [Konklusion](#11-konklusion)

---

## 1. Indledning

### 1.1 Formål

Nærværende rapport er udarbejdet af AlphaAi Consult ApS med henblik på at dokumentere, i hvilket omfang AlphaFlow opfylder kravene i Lov om bogføring, Anmeldelsesbekendtgørelsen (BEK 98), Kravbekendtgørelsen (BEK 97) og GDPR med henblik på Erhvervsstyrelsens registrering/godkendelse af AlphaFlow som digitalt regnskabssystem.

Rapporten dokumenterer platformens compliance-tilstand med afsæt i den faktiske kodebase.

### 1.2 Anvendt lovgivning

| Lov / bekendtgørelse | Relevans for AlphaFlow |
|----------------------|------------------------|
| **Lov om bogføring** (LOV nr. 700 af 24. maj 2022) | Primær lovgivning for regnskabspligtige virksomheder — særligt § 3 (systemets egnethed), § 13 (sikring mod ødelæggelse/forvanskning), § 15 (krav til digitale bogføringssystemer). |
| **Anmeldelsesbekendtgørelsen** (BEK nr. 98 af 26. januar 2023) | Anmeldelse og registrering af digitale standard bogføringssystemer — herunder §8 (anmeldelseskrav) og §13 (it-sikkerhedsniveau). |
| **Kravbekendtgørelsen** (BEK nr. 97 af 26. januar 2023) | Krav til digitale standard bogføringssystemer — §3 (5-års opbevaring), §7 (backup), §8 stk. 4 (7 IT-sikkerhedshovedkrav: 1 netværkssikkerhed, 2 adgangsstyring, 3 leverandørstyring, 4 backup, 5 logning, 6 beredskab/reetablering, 7 databeskyttelse), Bilag 1 (bogføringskrav — herunder pkt 2.e uforanderlighed), Bilag 4 (automatiseringskrav). |
| **GDPR** (forordning 2016/679) | Personoplysningers sikkerhed og lovgrundlag for behandling — særligt art. 5, 6, 9, 17, 25, 30, 32, 33–35 og kapitel V (dataoverførsel til tredjelande). |
| **IT-sikkerhedsloven** (LBK nr. 603 af 30/05/2018) | Generelle krav til digital infrastruktur hos den dataansvarlige. |
| **SAF-T Financial DK v1.0** | Standardformat for udlevering af regnskabsdata til skattemyndigheder. |
| **Peppol BIS Billing 3.0 / OIOUBL** | Standard for elektronisk fakturering til offentlige myndigheder. |

### 1.3 Ansvarsområder

| Rolle | Ansvarlig | Bemærkning |
|------|-----------|------------|
| **Dataansvarlig** (controller) | AlphaAi Consult ApS | Definerer formål og midler for behandling af lejernes data. |
| **Databehandler** (processor) | AlphaAi Consult ApS (drift) | Drifter AlphaFlow på IONOS VPS (Tyskland/EU). |
| **Underbehandlere** | Neon (DB, USA-virksomhed, EU-datacentre), OpenRouter (USA — se kapitel V), Storecove (Holland), Frisbii/Flatpay (Tyskland), SKAT/Virk (DK), CVR-registeret (DK). | Fulde fortegnelser i `Bilag-07_Databehandleraftale.md`. |
| **Systemansvarlig** | AlphaAi Consult ApS | Teknisk drift, sikkerhed, backup, vedligeholdelse. |
| **Revisor-tilgang** | Lejerens revisor via `AUDITOR`-rolle | Eksport af SAF-T, rapporter og audit-log. |

### 1.4 Platformens omfang

AlphaFlow er et cloud-baseret multi-tenant SaaS-regnskabssystem til små/mellemstore danske virksomheder. Kernefunktionalitet: dobbelt bogføring, FSR-baseret kontoplan, fakturering, e-fakturering (NemHandel/Peppol via Storecove), momsangivelse til SKAT, bank-integration (demo + scaffolding til reelle providere), OCR-scanning af kvitteringer, AI-assistent (Hermes), SAF-T og årsrapport-eksport (CSV/iXBRL).

Teknisk stack: Next.js 16 (App Router), TypeScript 5, PostgreSQL på Neon (EU), Prisma ORM, Caddy reverse proxy på IONOS VPS, PM2 (6 mini-services: `alphaflow`, `hermes-agent`, `knowledge-service`, `tokenpay-access`, `notification-ws`, `scanner-service`).

---

## 2. Bogføringsloven-overholdelse

### 2.1 § 3 — Systemets egnethed

Lov om bogføring § 3 stiller krav om, at regnskabssystemet skal være egnet til at sikre, at bogføringen kan ske i overensstemmelse med loven.

| Krav | Status | Implementering |
|------|--------|----------------|
| Dobbelt bogføring (debet/kredit) | ✅ Opfyldt | `JournalEntry` + `JournalEntryLine`-modeller (`prisma/schema.prisma`). Poster valideres til at balancere før bogføring. |
| Standard dansk kontoplan | ✅ Opfyldt | `Account`-model med `AccountType` (ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE) og `AccountGroup` (22 FSR-grupper, der i praksis dækker FSR-standardens hovedkategorier). Standardkonti oprettes automatisk ved virksomhedsoprettelse. |
| Mapping til SKAT Fællesoffentlig Standardkontoplan | ✅ Opfyldt | `StandardAccountMapping`-model + `buildAutoMapping()` i `src/lib/standard-chart-of-accounts.ts`. |
| Automatisk momsberegning | ✅ Opfyldt | 10 momskoder (`VATCode`-enum: S25, S12, S0, SEU, K25, K12, K0, KEU, KUF, NONE) med automatisk kontering. |
| Regnskabsperioder | ✅ Opfyldt | `FiscalPeriod`-model med `PeriodStatus` (OPEN/CLOSED) og låsning (`lockedAt`/`lockedBy`). |
| Fakturering | ✅ Opfyldt | `Invoice`-model med DRAFT/SENT/PAID/CANCELLED. PDF-generering. Kreditnotaer er fuldt implementeret: UI-knap, backend med `creditNotePrefix` (KRE-{år}-{seq}), spejlet bogføring, valgfrit `originalInvoiceId`, PDF og OIOUBL type 381. Annullering opretter modpostering `REVERSAL-{invoiceNumber}`. |
| Momsangivelse til SKAT | ✅ Opfyldt (med begrænsning) | `src/lib/vat-submit.ts` med OAuth2 `client_credentials`. **Kun momsangivelse** — ingen årsopgørelse, e-indkomst eller AM-bidrag. |
| Bank-integration | ⚠️ Delvist | `BankConnection`-model med krypterede tokens. **Tink er en reel integration** (PSD2 consent-flow virker); Nordea/Danske Bank/Jyske Bank er stubs (returnerer 404); Demo-provider leverer syntetiske data. AI-assisteret bankafstemning er implementeret i produktion via OpenRouter i `src/lib/matching-engine.ts`. Tre-niveau matching: (1) regelbaseret eksakt, (2) fuzzy, (3) AI via OpenRouter med konfidens-score. AI-match ≥0,95 autoprogrammeres (MATCHED); 0,80–0,95 = AI_SUGGESTED (manuel godkendelse); <0,80 ignoreres. AI overstyrer aldrig automatisk bogførte posteringer uden godkendelse. |
| Fremmedvaluta | ✅ Opfyldt | Frankfurter API (ECB reference rates) i `src/lib/currency-utils.ts`. 1-times in-memory cache med stale fallback. DKK, EUR, USD, GBP, SEK, NOK. |

### 2.2 § 4 — Uforkortethed og beskyttelse mod uberettiget ændring

§ 4 kræver, at regnskabsmaterialet er uforkortet og beskyttet mod ændringer og svindel.

| Krav | Status | Implementering |
|------|--------|----------------|
| Komplet bogføring | ✅ Opfyldt | Alle erhvervsmæssige transaktioner bogføres via journalposter med linjer, bilagsreference, dato og konti. |
| Beskyttelse mod ændring | ✅ Opfyldt (med begrænsning) | Se BEK 97 Bilag 1 (bogføringskrav — uforanderlighed) og Lov om bogføring §13 (sikring mod ødelæggelse/forvanskning) nedenfor for 3-niveau immutability på audit-log. **Vigtig begrænsning:** ingen kryptografisk hash-chain på selve posteringerne (ingen `previousHash`/`hash`-felter på `JournalEntry` eller `Transaction`). Immutability håndhæves via AuditLog + PostgreSQL-triggers, **ikke** via kryptografisk kæde mellem posteringer. |
| Sporing af ændringer | ✅ Opfyldt | AuditLog med before/after-changes, IP, User-Agent, tidsstempel. |

### 2.3 BEK 97 Bilag 1 / Lov om bogføring §13 — Uforanderlighed / uforkortethed (5-års opbevaring)

BEK 97 Bilag 1 (bogføringskrav — herunder pkt 2.e: "bogførte transaktioner ikke kan ændres, tilbagedateres eller slettes") og Lov om bogføring §13 (sikring mod ødelæggelse/forvanskning) stiller krav om, at regnskabsmaterialet kan dokumenteres som fuldstændigt, ægte og pålideligt, og at det ikke kan ændres eller slettes i opbevaringsperioden (5 år — jf. BEK 97 §3).

AlphaFlow implementerer en **3-niveau immutability-strategi** på AuditLog-tabellen:

| Niveau | Implementering | Fil / database-objekt |
|--------|----------------|------------------------|
| **1. Applikationsniveau** | `src/lib/audit.ts` eksporterer KUN CREATE-funktioner (`auditLog`, `auditCreate`, `auditUpdate`, `auditCancel`, `auditDeleteAttempt`, `auditAuth`). Ingen `update`/`delete`-funktion eksponeres fra modulet. | `src/lib/audit.ts` |
| **2. Databaseniveau** | PostgreSQL `BEFORE UPDATE` og `BEFORE DELETE` triggers på `AuditLog`-tabellen forhindrer mutation direkte i DB — selv af DBA. | `prisma/audit-immutability.sql` (triggere `prevent_audit_update`, `prevent_audit_delete`). Installerer via `scripts/apply-audit-immutability.ts` (idempotent). |
| **3. Cascade-beskyttelse** | Fremmednøgler fra `AuditLog` til `User` og `Company` bruger `onDelete: Restrict` — en bruger/virksomhed kan ikke slettes, så længe der findes AuditLog-poster. | `prisma/schema.prisma` |

**Soft-delete frem for hard-delete (BEK 97 Bilag 1 / Lov om bogføring §13 vs. GDPR art. 17):**

| Entitet | Sletningsmekanisme | Lovlig grund |
|---------|---------------------|--------------|
| **Brugerkonto** | Deaktivering via `/api/auth/delete-account` — sætter `User.deactivatedAt` og blokerer login. Data og audit-logs bevares. | BEK 97 §3 (5-års opbevaring) + Lov om bogføring §13 (sikring mod ødelæggelse/forvanskning) > GDPR art. 17(3)(c) undtagelse (retten til sletning gælder ikke, når behandling er nødvendig for at overholde en retlig forpligtelse). |
| **Konto (Account)** | Deaktivering, ikke sletning. | Kontoen kan refereres fra eksisterende posteringer og kan ikke fjernes. |
| **Journalposter (POSTED)** | Annulleres med modpostering + årsagsangivelse (status `CANCELLED`). Original post bevares. | Soft-delete via modpostering opfylder BEK 97 Bilag 1s princip om uforanderlighed. |
| **Fakturaer** | Annulleres med status `CANCELLED`, slettes ikke. | Samme princip. |

**Hvad der IKKE findes (vigtig åbenhed):**

- **Ingen kryptografisk hash-chain** på `JournalEntry` eller `Transaction` — ingen `previousHash`, `hash`, `locked`, `immutable` eller `version`-felter på disse modeller. Immunitet håndhæves alene via AuditLog + DB-triggers, ikke via kryptografisk sammenkædning af posteringer.
- **Ingen separate `deletedAt`/`retentionUntil`-felter** på regnskabsmodeller — soft-delete markeres via status-felter (`CANCELLED`, `deactivatedAt`).

### 2.4 BEK 97 §3 + §7 — Backup og opbevaring (5 år) (udstedt i medfør af Lov om bogføring §15)

BEK 97 §3 (5-års opbevaring) og §7 (backup) — udstedt i medfør af Lov om bogføring §15 — stiller krav om, at regnskabsmaterialet opbevares i mindst 5 år og kan reproduceres i læsbar form.

| Komponent | Implementering | Fil / objekt |
|-----------|----------------|--------------|
| **Scheduler** | `node-cron` (process-intern, tidszone `Europe/Copenhagen`). **Bemærk:** backup-scheduleren kører i Next.js-processen — der er intet PM2-cron, crontab eller systemd-timer-lag. | `src/lib/backup-scheduler.ts` |
| **Cron-udtryk** | Hourly `5 * * * *`, Daily `15 2 * * *`, Weekly `30 3 * * 1`, Monthly `0 4 1 * *`, Cleanup `0 3 * * *`. | `src/lib/backup-scheduler.ts` |
| **Retention** | Hourly 24/25 timer, Daily 30/31 dage, Weekly 52/53 dage, Monthly 60 måneder (**5 år — opfylder BEK 97 §3**), Manuel 999/90 dage. | `src/lib/backup-engine.ts` |
| **Backup-indhold** | ZIP pr. tenant + `manifest.json` v2 + SHA-256 checksum + AES-256-GCM `.zip.enc`. JSON-filer for: company, accounts, contacts, transactions, invoices, journal-entries, fiscal-periods, budgets, recurring-entries, bank-statements, bank-connections (uden tokens), received-invoices (inkl. rå XML), vat-submissions, einvoice-sendings, members. | `src/lib/backup-engine.ts` |
| **Integritet** | SHA-256 checksum beregnet streaming via `crypto.createHash('sha256')`, gemmes i `Backup.sha256`, verificeres ved restore. | `src/lib/backup-engine.ts`, `Backup`-model. |
| **Kryptering** | AES-256-GCM (`ENCRYPTION_KEY` 32 byte). Original ZIP slettes sikkert (`rmSync({force: true})`) efter kryptering. | `src/lib/crypto.ts` |
| **Lokation** | `Tenant-Backup/{companyName}/` på IONOS VPS (EU/Tyskland). | `src/lib/backup-engine.ts` |
| **Robusthed** | `CronExecution` DB-log, startup catch-up (kører missede cron-jobs ved genstart), retry 3× eksponentiel backoff, overlap-guard, pre-restore safety backup, atomisk gendannelse via DB-transaktioner. | `src/lib/backup-scheduler.ts`, `src/lib/backup-engine.ts` |
| **Defense-in-depth** | Neon PITR op til 7 dage (managed, ekstra lag). | `docs/Bilag-11_IT-sikkerhed-Neon-og-IONOS.md` |

**Begrænsninger:**

- Scheduleren er **process-intern** (node-cron i Next.js-processen). Hvis PM2-processen er nede, køres ingen backups. Startup catch-up afhjælper delvist dette ved at køre missede jobs ved genstart.
- Backup-lagring er på samme VPS som applikationen. Der er ikke implementeret automatisk off-site-replikering ud over Neon PITR (7 dage).

### 2.5 Fortløbende bilagsnummerering

| Krav | Status | Implementering |
|------|--------|----------------|
| Fortløbende, unik bilagsnummerering | ✅ Opfyldt | `Company.journalPrefix` (default `"BIL"`) + `Company.nextJournalSequence` (default 1). Sekvensen inkrementeres atomisk ved bogføring. | `prisma/schema.prisma` (linje 236–237) |

### 2.6 Regnskabsperiode-låsning

| Krav | Status | Implementering |
|------|--------|----------------|
| Periode-låsning forhindrer bogføring i lukkede perioder | ✅ Opfyldt | `FiscalPeriod` med `status: OPEN/CLOSED` og `lockedAt`/`lockedBy`-felter. Lukning kræver `PERIOD_CLOSE`-permission (OWNER, ADMIN, ACCOUNTANT). Genåbning kræver `PERIOD_OPEN` (OWNER, ADMIN). Alle handlinger logges i AuditLog. | `prisma/schema.prisma` (linje 773–790), `src/lib/rbac.ts` |

### 2.7 SAF-T eksport

| Komponent | Implementering |
|-----------|----------------|
| API-rute | `GET /api/export-saft` |
| Format | SAF-T Financial DK v1.0 (XML) |
| Indhold | Header (virksomhedsoplysninger), MasterFiles (GeneralLedgerAccounts, TaxCodeTable, Customers), GeneralLedgerEntries (bogførte journalposter), SourceDocuments (salgsfakturaer), Totals. |
| Validering | `src/lib/saft-validator.ts` — 23+ valideringskontroller (obligatoriske felter, CVR-format, balanceverifikation, datoformat, momssatser mv.). |

### 2.8 Årsrapport (CSV/iXBRL)

| Format | Implementering | API-rute |
|--------|----------------|----------|
| Regnskab Basis (CSV) | `src/lib/annual-report-csv.ts` — UTF-8 BOM, danske overskrifter, sektioner: resultatopgørelse, balance, statusopgørelse, momsdata. | `GET /api/reports/annual-csv` |
| Regnskab Special (iXBRL) | `src/lib/annual-report-xbrl.ts` — Danish FSA taxonomy (DCCA namespace), `ix:nonFraction`-tagging. | `GET /api/reports/annual-xbrl` |

### 2.9 Udbyderskift (eksport af bilag)

| Funktion | Implementering |
|----------|----------------|
| Tenant-eksport med filer | `POST /api/export-tenant` — GUID per eksport (`crypto.randomUUID()`), format-version `alphaflow-portable-v2`, compliance-metadata (Bogføringsloven BEK 98, 5-års retention), SHA-256 data-integrity checksum. |
| Eksport-historik | `GET /api/company/export-info` — total eksporter, seneste eksport, datavolumen, audit-entries med GUIDs og checksums. |
| Audit-trail | Alle eksporter logges uforanderligt i AuditLog. |

---

## 3. GDPR-overholdelse

### 3.1 Persondata — overblik

AlphaFlow behandler persondata for følgende kategorier af registrerede: brugere (lejerens medarbejdere og revisorer), virksomheders kontaktpersoner (kunde-/leverandørkartotek) og modtagere af fakturaer.

**Modeller der indeholder persondata** (14 identificeret):

`User`, `Company`, `Contact`, `Invoice`, `ReceivedInvoice`, `EInvoiceSending`, `BankConnection`, `Backup`, `EmailLog`, `Invitation`, `ContactMessage`, `Session`, `AuditLog`, `KnowledgeDocument`/`AgentMessage`.

**Datakategorier:**

- Identitetsdata (navn, e-mail, telefon, adresse).
- Finansielle data (posteringer, fakturaer, momsangivelser).
- Adgangskoder (bcrypt-hashed).
- 2FA-secrets (AES-256-GCM-krypteret i DB).
- Bank-tokens (AES-256-GCM-krypteret i DB).
- IP-adresse og User-Agent (i AuditLog og Session).

### 3.2 Art. 5 — Principper for behandling

| Princip | Status | Implementering |
|---------|--------|----------------|
| Lovlighed, rimelighed, åbenhed | ✅ Opfyldt | Se art. 6 nedenfor. |
| Formålsbegrænsning | ✅ Opfyldt | Data behandles alene til bogførings-/regnskabsformål (kontrakt) og AI-assistance (særskilt samtykke). |
| **Data minimization** | ✅ Opfyldt (med særlig implementering) | `HermesAgent.dataAccessEnabled` er per-tenant opt-in (default `false`). Uden opt-in sendes KUN brugerens spørgsmål + statisk system-prompt til LLM — **ikke** tenant-specifikke finansielle data. |
| Nøjagtighed | ✅ Opfyldt | Brugerne kan rette egne data via app; CVR-data kan valideres mod CVR-registeret. |
| Opbevaringsbegrænsning | ⚠️ Delvist | Bogføringsdata: 5-års retention via backup. E-mail/Session/AuditLog: ingen automatisk sletning efter fastsat periode — oprydning af udløbne sessions via `cleanupExpiredSessions()`. |
| Integritet og fortrolighed | ✅ Opfyldt (med begrænsninger) | Se art. 32 nedenfor. |

### 3.3 Art. 6 — Lovgrundlag

| Behandling | Lovgrundlag | Dokumentation |
|------------|-------------|---------------|
| Bogføring af lejerens regnskab | **Art. 6(1)(b)** — kontrakt | Lejer indgår SaaS-aftale med AlphaAi Consult ApS. |
| Momsangivelse til SKAT | **Art. 6(1)(c)** — retlig forpligtelse | Bogføringsloven og momsloven. |
| Audit-logning og sikkerhed | **Art. 6(1)(f)** — legitime interesser | AlphaAis berettigede interesse i at sikre systemets integritet og opdage misbrug. |
| AI-assistent (Hermes) — chat med LLM | **Art. 6(1)(a)** — samtykke | Per-tenant opt-in via tenant-administrator-samtykke (se afsnit 3.10). Samtykket dækker (a) selve AI-brugen, (b) GDPR-risici ved USA-overførsel via OpenRouter, (c) non-deterministiske processer. `HermesAgent.dataAccessEnabled` er et særskilt per-tenant opt-in (default `false`) for data-adgang ud over selve AI-brugssamtykket. |
| AI-scanning af kvitteringer (OCR/VLM) | **Art. 6(1)(b)** — kontrakt (nødvendig for at levere tjenesten) | Billeder af kvitteringer sendes via OpenRouter til VLM (vision-language model) for struktureret udtræk. VLM-output er non-deterministisk og efterprøves af brugeren før bogføring (jf. Bilag-06_Brugsvejledning.md §11.3). |

### 3.4 Art. 9 — Særlige kategorier

| Krav | Status | Implementering |
|------|--------|----------------|
| Ingen behandling af særlige kategorier (CPR, sundhed, race, religion mv.) | ✅ Opfyldt | **Platformen har ingen CPR-felter** — kun CVR-numre. Bekræftet via grep i `prisma/schema.prisma` og `src/` (ingen `cpr`, `ssn`-felter). |

### 3.5 Art. 17 — Ret til sletning

| Krav | Status | Implementering |
|------|--------|----------------|
| Ret til sletning | ⚠️ Delvist opfyldt | Sletning af brugerkonto implementeret som **deaktivering** (`User.deactivatedAt`) — ikke hard-delete. |
| Undtagelse art. 17(3)(c) (retlig forpligtelse) | ✅ Aktiveret | BEK 97 §3 (5-års opbevaring) + Lov om bogføring §13 (sikring mod ødelæggelse) har forrang over GDPR art. 17. AlphaFlow har derfor valgt deaktivering frem for sletning. |
| Soft-delete af regnskabsposter | ✅ Opfyldt | Via modpostering (`JournalEntry.status = CANCELLED`). Original post bevares. |

### 3.6 Art. 25 — Privacy by design

| Krav | Status | Implementering |
|------|--------|----------------|
| Data minimization som standard | ✅ Opfyldt | `HermesAgent.dataAccessEnabled = false` som default. |
| Tenant-isolation | ✅ Opfyldt | `tenantFilter(ctx)` på alle databasekald; `companyId` per række på 24 modeller. |
| Role-based access control (min-tilgang) | ✅ Opfyldt | 5 roller + 23 permissions. Se afsnit 4. |
| Pseudonymisering hvor muligt | ⚠️ Delvist | Bank-tokens krypteret (ikke pseudonymiserede), bruger-ID bruges internt. |

### 3.7 Art. 30 — Behandlingsregister

| Krav | Status | Implementering |
|------|--------|----------------|
| Behandlingsaktivitetsoversigt | ✅ Henviser til eksternt dokument | Se `docs/Bilag-07_Databehandleraftale.md` for fuld fortegnelse over behandlingsaktiviteter, underbehandlere og datakategorier. |

### 3.8 Art. 32 — Sikkerhed for behandling

| Krav | Status | Implementering |
|------|--------|----------------|
| Kryptering i transit | ✅ Opfyldt | TLS 1.2/1.3 via Caddy, HSTS preload. `sslmode=require` til PostgreSQL (Neon). |
| Kryptering i hvile (følsomme data) | ✅ Opfyldt | AES-256-GCM for: bank-tokens, TOTP-secrets, backup-koder, backup-filer, `.tbkey`-proofs. Se afsnit 5. |
| Kryptering i hvile (øvrige persondata) | ⚠️ Delvist | **Advarsel:** Følgende persondata-felter opbevares **UKRYPTERET** i databasen og afhænger af DB-level sikkerhed (Neon TLS + eventuel disk-encryption hos udbyder): `Contact.email`, `Contact.phone`, `BankConnection.accountNumber`, `BankConnection.iban`, `Company.bankAccount`, `Company.bankRegistration`, `Company.address`, `Company.email`, `Company.phone`, `User.email`, `User.name`, modtagne fakturaers leverandør-data. |
| Adgangskontrol | ✅ Opfyldt | RBAC + multi-tenant isolation. Se afsnit 4 og 7. |
| Audit-trail | ✅ Opfyldt | Uforanderlig audit-log. Se afsnit 6. |
| Evaluering og effektivitet | ⚠️ Ikke formaliseret | Ingen regelmæssig sikkerhedsvurdering dokumenteret i platformen — afhænger af AlphaAis interne processer. |
| Pseudonymisering | ⚠️ Delvist | Se art. 25 ovenfor. |

**Sikkerhedsarkitektur — bemærkninger:**

| Foranstaltning | Beskrivelse |
|---------------|-------------|
| Content-Security-Policy (CSP) | CSP-Report-Only aktiv via `buildCspPolicy()` i `next.config.ts`; enforce-mode klar. |
| Antivirus-scanning af uploads | ClamAV INSTREAM integreret i 3 upload-ruter med AuditLog-logging. |
| Key rotation / versioning | Keyring med version-prefixed ciphertext (`v{N}:iv:authTag:ciphertext`); `ENCRYPTION_KEY_PREVIOUS` + `CURRENT_KEY_VERSION`; migration/rollback-scripts. |
| Password minimum 6 tegn | |
| CSRF-beskyttelse | SameSite=Lax cookie + Bearer-token. |

### 3.9 Art. 33–34 — Notifikation ved persondataforstyrrelser

| Krav | Status | Implementering |
|------|--------|----------------|
| Notifikation til Datatilsynet inden 72 timer | ✅ Henviser til eksternt dokument | Se `docs/Bilag-09_Beredskabsplan.md` for beredskabsprocedure, 72-timers frist og kommunikationsplan. |
| Underretning af berørte registrerede | ✅ Henviser til eksternt dokument | Se `docs/Bilag-09_Beredskabsplan.md`. |
| Teknisk detektionsgrundlag | ⚠️ Delvist | AuditLog Logger auth-fejl (`LOGIN_FAILED`) og oversight-handlinger. Ingen dedikeret SIEM/IDS. |

### 3.10 Art. 35 — DPIA (Databeskyttelseskonsekvensvurdering)

| Krav | Status | Implementering |
|------|--------|----------------|
| DPIA for højrisikobehandling | ✅ Henviser til eksternt dokument | Se `docs/Bilag-08_Risikovurdering-DPIA.md` for DPIA inkl. AI-behandling (Hermes/OCR/VLM) og internationale dataoverførsler. |

**AI-specifikke risici i DPIA:**

AlphaFlows AI-funktioner (Hermes chat-LLM, knowledge-RAG embeddings, scanner VLM) udgør en højrisikobehandling jf. GDPR Art. 35(3)(b) (systematisk omfattende evaluering af personlige aspekter) og Art. 35(3)(d) (kombination af datasæt). Følgende AI-specifikke risici er identificeret og håndteres:

1. **GDPR-risici ved USA-overførsel** — Persondata sendes til OpenRouter, Inc. (USA) per GDPR kapitel V. Håndteres via DPA + SCC (Modul 2) + TIA (Bilag 14; TIA i Bilag 10 afsnit 5.1). Restrisiko: Mellem (amerikanske myndigheder kan kræve adgang per FISA 702/EO 12333/CLOUD Act).
2. **Non-deterministiske processer** — AI-output (chat-svar, kontoforslag, VLM-udtræk) er ikke deterministisk og kan indeholde fejl, unøjagtigheder eller "hallucinationer". Håndteres via: (a) bruger-advarsel og samtykke før Hermes-aktivering (Bilag 6 Bilag-06_Brugsvejledning.md §13.0), (b) VLM-output markeres "Kræver gennemsyn" ved lav konfidens (Bilag 6 §11.3), (c) AI-output overstyrer aldrig automatisk bogførte posteringer — brugeren confirmerer altid.
3. **Uautoriseret rådgivning** — AI kan give rådgivning der overskrider AlphaFlows formål (bogføringsassistent). Håndteres via system-prompt der begrænser Hermes til dansk bogføring/moms/skat, og advarsel om at Hermes ikke er professionel revisor (Bilag 6 §13.0 Advarsel 3).
4. **Samtykke-krav** — Hermes aktiveres per tenant af Owner/Admin (eller SuperDev) via en enable/disable-toggle. En separat dataadgang-toggle (`HermesAgent.dataAccessEnabled`, default false) styrer om tenant-specifikke finansielle data sendes til OpenRouter-LLM. Uden dataadgang sendes kun brugerspørgsmål + statisk system-prompt. Aktivering og dataadgang audit-logges (`action: UPDATE`).

Se også `docs/Bilag-08_Risikovurdering-DPIA.md` R-21 (AI non-determinisme) og R-13 (USA-dataoverførsel).

### 3.11 Kapitel V — Overførsel til tredjelande

AlphaFlow anvender én USA-baseret AI-underbehandler, der potentielt flytter persondata ud af EU:

| Underbehandler | Land | Formål | Data sendt | Lovgrundlag for overførsel |
|----------------|------|--------|------------|---------------------------|
| **OpenRouter, Inc.** | USA | Konsolideret AI-underbehandler — Hermes chat LLM, knowledge-service RAG-embeddings og scanner-service VLM (vision-language model) via én API-aftale. OpenRouter videresender anmodninger til relevante model-udbydere (f.eks. Anthropic, Meta, OpenAI) per GDPR Art. 28(4) — disse er OpenRouter's underbehandlere, ikke AlphaAi Consult ApS'. | (a) Brugerens spørgsmål + (ved opt-in) tenant-specifikke finansielle data (Hermes chat); (b) tekstuddrag fra lejeres dokumenter (kun hvis `HermesAgent.dataAccessEnabled = true` — embeddings); (c) billeder af kvitteringer/fakturaer uploadet af brugeren (scanner VLM). | Standardkontraktbestemmelser (SCC) + Transfer Impact Assessment (TIA). |

**Dokumentation:** Se `docs/Bilag-07_Databehandleraftale.md` for indgåede databehandleraftaler, SCC og TIA (Bilag 14 — konsolideret AI-DPA).

**Data minimization:** `HermesAgent.dataAccessEnabled` er per-tenant opt-in (default `false`). Uden opt-in sendes KUN brugerens spørgsmål + statisk system-prompt til LLM, **ikke** tenant-specifikke finansielle data.

**EU/EØS-baserede underbehandlere** (ingen dataoverførsel til tredjelande):

- **Neon, Inc.** — PostgreSQL-database. (US-virksomhed, men datacentre i Frankfurt + Amsterdam — EU/EEA). SOC 2 Type II-certificeret.
- **Storecove** (Holland) — e-faktura via Peppol/NemHandel.
- **Frisbii/Flatpay** (Tyskland) — abonnementsbetaling.
- **IONOS** (Tyskland) — VPS-hosting og backup-lagring. C5 + IT-Grundschutz-certificeret.
- **SMTP-udbyder** (Simply/Brevo — EU).

---

## 4. Adgangskontrol & identitet

### 4.1 Autentificering

| Komponent | Implementering |
|-----------|----------------|
| Login-metode | E-mail + password (eneste login-metode). **Ingen MitID, ingen OAuth/SSO/SAML, ingen NextAuth** — egenudviklet session-system. |
| Password-hashing | `bcryptjs` med 12 salt-runder. `verifyPassword()` understøtter legacy `simpleHash()` med automatisk re-hash ved succesfuldt login (`needsRehash()`). |
| Password-minimum | **6 tegn** (validering i `register` og `reset-password`). |
| Session | 256-bit token (`crypto.randomBytes(32).toString('hex')`). Cookie: `session`, `httpOnly: true`, `secure: isHttps` (auto-detected), `sameSite: 'lax'`, `path: /`, `maxAge: 7 dage`, sliding expiry (forlænges ved brug). IP + User-Agent logges på sesionsoprettelse. Bærer-token Authorization header understøttes for API-kald. |
| Session-invalidering | Ved logout (`destroySession`) og password-reset (`destroyAllUserSessions`). Udløbne sesioner ryddes op via `cleanupExpiredSessions()`. |
| E-mail-verifikation | Påkrævet før login (undtagen SuperDev der auto-verificeres). Verification-token = `crypto.randomBytes(32).toString('hex')`. |
| Password-reset flow | `/api/auth/forgot-password`: rate-limit 1 pr. e-mail pr. 5 min, anti-enumeration (returnerer altid success), token = `crypto.randomBytes(32).toString('hex')`, 1 times udløb. `/api/auth/reset-password`: validerer token + udløb, hasher nyt password med bcrypt, invaliderer alle eksisterende sesioner. |
| 2FA / TOTP | RFC 6238 via `otplib` (SHA-1, 30 sek, 6 cifre, ±1 step tolerance). QR-kode via `qrcode`-biblioteket. 10 backup-koder (8 tegn, unambiguous chars), SHA-256+salt hashed, derefter AES-256-GCM krypteret som JSON-array. TOTP-secret: 160 bit (20 byte) base32, AES-256-GCM krypteret i DB (`twoFactorSecret`-felt). Per-user aktivering, tenant-wide krav via `/api/company/toggle-2fa` (`Company.twoFactorRequired`). SuperDev bypass. |

**2FA API-ruter:**

| Rute | Metode | Beskrivelse |
|------|--------|-------------|
| `/api/auth/2fa/setup` | POST | Genererer TOTP-secret + QR-kode, krypterer og lagrer (aktiverer IKKE endnu). |
| `/api/auth/2fa/activate` | POST | Verificerer TOTP-kode, aktiverer 2FA, returnerer backup-koder (vises én gang). |
| `/api/auth/2fa/disable` | POST | Verificerer TOTP-kode, rydder alle 2FA-felter. Blokeres hvis firma kræver 2FA. |
| `/api/auth/2fa/verify-login` | POST | Verificerer TOTP eller backup-kode (forbruger backup), opretter session. |
| `/api/auth/2fa/backup-codes` | GET/POST | Status / regenerering (med TOTP-verifikation). |
| `/api/auth/2fa/status` | GET | Status. |
| `/api/company/toggle-2fa` | POST | Tenant-niveau 2FA-krav med compliance-check. |

### 4.2 Rate-limiting (IP-throttling)

Implementeret i applikationslaget (`src/lib/rate-limit.ts`) — in-memory sliding window pr. key.

| Endpoint | Begrænsning | Key |
|----------|-------------|-----|
| Login | 5/min | IP |
| Register | 3/min | IP |
| Forgot-password | 1/5min | e-mail |
| 2FA setup | 5/min | user+IP |
| 2FA activate | 10/min | user+IP |
| 2FA verify-login | 10/min | IP |
| 2FA disable | 5/min | user+IP |
| Tenant toggle-2fa | 5/min | user+IP |

**Begrænsninger (vigtig åbenhed):**

- **In-memory rate-limiting** — tælere nulstilles ved server-restart. Ingen cross-instance koordinering.
- **Ingen account-lockout** — kun IP-baseret throttling. Et botnet med roterende IP'er kunne teoretisk set fortsætte brute-force.
- **Caddy `rate_limit` plugin er IKKE installeret** — konfigurationen i `Caddyfile` er udkommenteret.

### 4.3 Autorisation — RBAC

**5 roller** defineret i `prisma/schema.prisma` (enum `CompanyRole`) og `src/lib/rbac.ts`:

| Rolle | Niveau | Beskrivelse |
|-------|--------|-------------|
| **OWNER** | 5 | Fuld adgang inkl. virksomhedsoverdragelse, konto-sletning, rolleredigering. |
| **ADMIN** | 4 | Team-administration, bank-forbindelser, indstillinger. |
| **ACCOUNTANT** | 3 | Opret/rediger/annuller finans- og fakturaposter. |
| **VIEWER** | 2 | Skrivebeskyttet læseadgang. |
| **AUDITOR** | 1 | Rapport-eksport og SAF-T. |

**Særlige brugertyper:**

| Type | Implementering |
|------|----------------|
| **SuperDev (App Owner)** | `isSuperDev = true` for brugere med aktivt firma navn "AlphaAi". Promoteres via `/api/auth/promote-superdev`. Får alle features, bypasser 2FA og TokenPay, kan oversee andre tenants **read-only** (mutationer blokeres via `blockOversightMutation`). SuperDev-administrative endpoints (`/api/oversight/subscription`, `/api/oversight/trial`) forbliver kaldbare for abonnements- og trial-styring på tværs af tenants — dette er en bevidst App Owner-funktion, ikke en data-isolation. |
| **Demo-firma** | Delt demo-firma (CVR 29876543) med read-only for non-SuperDev. Mutationer blokeres via `requireNotDemoCompany`. |

**23 permissions** i 7 kategorier (`src/lib/rbac.ts` linje 81–117):

| Kategori | Permissions |
|----------|-------------|
| Company (4) | `COMPANY_VIEW_SETTINGS`, `COMPANY_EDIT_SETTINGS`, `COMPANY_TRANSFER_OWNERSHIP`, `COMPANY_DELETE` |
| Members (4) | `MEMBERS_VIEW`, `MEMBERS_INVITE`, `MEMBERS_REMOVE`, `MEMBERS_CHANGE_ROLE` |
| Data (5) | `DATA_READ`, `DATA_CREATE`, `DATA_EDIT`, `DATA_CANCEL`, `DATA_DELETE` |
| Reports (3) | `REPORTS_VIEW`, `REPORTS_EXPORT`, `REPORTS_SAFT` |
| Period (3) | `PERIOD_CLOSE`, `PERIOD_OPEN`, `YEAR_END_CLOSE` |
| Bank (2) | `BANK_CONNECT`, `BANK_SYNC` |
| Backup (2) | `BACKUP_CREATE`, `BACKUP_RESTORE` |

**Håndhævelse:** `withGuard()` wrapper (`src/lib/route-guard.ts`) gennemtvinger auth → company → oversight → demo → TokenPay → permissions → features. `requirePermission(ctx, perm)` returnerer 401/400/403 ved afvisning. **Ingen `requireRole`/`requireAdmin`-hjælpere** — alt går gennem `requirePermission`.

### 4.4 TokenPay-adgangskontrol

| Komponent | Implementering |
|-----------|----------------|
| Adgangstokens | `.tbkey` proof-filer (AES-256-GCM via `PROOF_ENCRYPTION_KEY`). Upload via `/api/proof-upload`, aktiver via `/api/proof-activate`. |
| Trial | 60 dage. |
| Free tier | Omsætning < 50.000 kr. |
| Owner-bypass | SuperDev og lejer-OWNER har altid adgang. |
| Abonnement | Via Frisbii/Flatpay (Tyskland) — HMAC-SHA256-verifiede webhooks. |

---

## 5. Kryptering

### 5.1 Krypteringsmodul og algoritme

**Modul:** `src/lib/crypto.ts` — server-side kun.

**Algoritme:** AES-256-GCM (authenticated encryption).

| Parameter | Værdi |
|-----------|-------|
| Nøglestørrelse | 256 bit (32 byte) |
| IV (Initialization Vector) | 96 bit (12 byte) — NIST SP 800-38D anbefalet; ny pr. encryption via `crypto.randomBytes()` |
| Authentication Tag | 128 bit (16 byte) |
| Lagringsformat (string) | `iv_base64:authTag_base64:ciphertext_base64` |
| Lagringsformat (fil) | `[12 byte IV][16 byte authTag][N byte ciphertext]` (rå binary, `.enc`-suffix) |

### 5.2 To separate miljøvariabler

| Nøgle | Formål | Modul |
|------|--------|-------|
| `ENCRYPTION_KEY` (64 hex chars = 32 byte) | Bank access/refresh tokens (`BankConnection.accessToken`, `refreshToken`), TOTP-secrets (`User.twoFactorSecret`), krypterede backup-koder (`User.twoFactorBackupCodes`), backup ZIP-filer (`.zip.enc`). | `src/lib/crypto.ts`, `src/lib/backup-engine.ts` |
| `PROOF_ENCRYPTION_KEY` (64 hex chars = 32 byte) | Dekryptering af `.tbkey` proof-filer uploadet af brugere. | `mini-services/tokenpay-access-service/src/tbkey-decryption.ts` |

### 5.3 Hvad krypteres (AES-256-GCM i DB)

| Datafelt | Tabel | Status |
|----------|-------|--------|
| `BankConnection.accessToken` | BankConnection | ✅ AES-256-GCM |
| `BankConnection.refreshToken` | BankConnection | ✅ AES-256-GCM |
| `User.twoFactorSecret` | User | ✅ AES-256-GCM |
| `User.twoFactorBackupCodes` | User | ✅ SHA-256+salt hashed, derefter AES-256-GCM krypteret som JSON-array |
| Backup-filer (`.zip.enc`) | Fil-disk (IONOS VPS) | ✅ AES-256-GCM (original ZIP slettes sikkert) |
| `.tbkey` proof-filer | Uploades til TokenPay-service | ✅ AES-256-GCM |

### 5.4 Hvad der IKKE krypteres i DB (vigtig åbenhed)

Følgende persondata-felter opbevares **ukrypteret** i PostgreSQL og afhænger af DB-level sikkerhed (Neon TLS i transit + eventuel disk-encryption hos udbyder):

| Model | Felt |
|-------|------|
| `Contact` | `email`, `phone`, `address`, `name` |
| `BankConnection` | `accountNumber`, `iban`, `registrationNumber` |
| `Company` | `bankAccount`, `bankRegistration`, `bankIban`, `email`, `phone`, `address`, `cvrNumber` |
| `User` | `email`, `name` |
| `Invoice`, `ReceivedInvoice` | Modtager-/leverandør-oplysninger (navn, CVR, adresse, kontakt) |
| `EmailLog` | Modtager-e-mail, emne |
| `AuditLog`, `Session` | IP-adresse, User-Agent |

**Begrundelse:** AES-kryptering af alle persondata-felter ville kræve applikationslag-kryptering med betydelig performance-omkostning og kompleks key management. AlphaFlow har i stedet valgt at lade DB-level sikkerhed (Neon TLS, adgangskontrol, PITR) beskytte disse data. **Dette er en bevidst risikoafvejning**, som Erhvervsstyrelsen bør være opmærksom på.

### 5.5 Key management

| Regel | Implementering |
|-------|----------------|
| Kun miljøvariabel | Nøgler læses fra `process.env.ENCRYPTION_KEY` / `PROOF_ENCRYPTION_KEY`. |
| Aldrig i database | Bekræftet via grep. |
| Aldrig i git | Ekskluderet via `.gitignore`. |
| Kun server-side | Tilgængelig kun i server-side kode. |
| Validering | `loadKeyring()` i `src/lib/keyring.ts:99-131` kaster hvis `ENCRYPTION_KEY` mangler eller har forkert længde; `getCurrentKeyVersion()` returnerer aktiv version. |
| Caching | Parses én gang og caches i hukommelsen. |
| Key rotation | Keyring med `ENCRYPTION_KEY_PREVIOUS` + `CURRENT_KEY_VERSION`; version-prefixed ciphertext `v{N}:iv:authTag:ciphertext`; `encryptionKeyVersion` kolonner på User/BankConnection/Backup; migration-script `scripts/rotate-encryption-keys.ts`. Se Bilag 5 §2.4. |

### 5.6 Begrænsninger (vigtig åbenhed)

| Begrænsning | Konsekvens |
|-------------|------------|
| Key rotation / versioning implementeret (U-1) | Keyring-system med `ENCRYPTION_KEY_PREVIOUS` + `CURRENT_KEY_VERSION`; `encryptionKeyVersion` kolonner på User/BankConnection/Backup; automatiseret migration og rollback. Resterende begrænsning: ingen HSM/KMS-integration. |
| **Ingen envelope encryption / KMS-integration** | Nøgler ligger som plain hex-strings i env-filer (PM2 ecosystem). |
| **Ingen kryptografisk hash-chain på posteringer** | Immutability på posteringer håndhæves alene via AuditLog + DB-triggers, ikke via kryptografisk kæde. |

### 5.7 Hash-funktioner

| Funktion | Anvendelse |
|----------|-----------|
| bcrypt (12 rounds) | Adgangskode-hashing (`src/lib/password.ts`). |
| SHA-256 | Backup-koder (hashBackupCode), backup-fil-checksum (`Backup.sha256`), tenant-export-manifest, webhook-signaturer (HMAC-SHA256). |
| HMAC-SHA256 | Webhook-signaturverifikation (Storecove, Frisbii, TokenPay, Flatpay). |

---

## 6. Audit & logning

### 6.1 AuditLog — 3-niveau immutability

Se afsnit 2.3 for fuld beskrivelse af 3-niveau immutability-strategien (applikation CREATE-only + PostgreSQL BEFORE UPDATE/DELETE triggers + `onDelete: Restrict` cascade).

### 6.2 AuditLog-skema

| Felt | Beskrivelse |
|------|-------------|
| `userId` | ID på brugeren, hvis kontekst handlingen udførtes i. |
| `companyId` | Virksomhedskontekst. |
| `performedByUserId` | Den faktiske udførende bruger (ved oversight). |
| `action` | AuditAction-type (se 6.3). |
| `entityType` | EntityType-type (se 6.4). |
| `entityId` | ID på berørt entitet. |
| `changes` | JSON: `{field: {old, new}}`. |
| `metadata` | JSON: IP, User-Agent, tidsstempel, årsag. |
| `createdAt` | Tidsstempel. |

### 6.3 AuditAction-typer (21)

`CREATE`, `UPDATE`, `CANCEL`, `DELETE_ATTEMPT`, `LOGIN`, `LOGIN_FAILED`, `LOGOUT`, `REGISTER`, `BACKUP_CREATE`, `BACKUP_RESTORE`, `BACKUP_DELETE`, `SESSION_INVALIDATE`, `DATA_RESET`, `OVERSIGHT`, `TWO_FACTOR_SETUP_STARTED`, `TWO_FACTOR_ACTIVATED`, `TWO_FACTOR_DISABLED`, `TWO_FACTOR_BACKUP_CODES_REGENERATED`, `TWO_FACTOR_TENANT_TOGGLE`, `LOGIN_2FA_VERIFIED`, `ACCOUNT_DEACTIVATED`.

### 6.4 EntityType-typer (25)

`User`, `Transaction`, `Invoice`, `Company`, `CompanyInfo`, `Session`, `Backup`, `Account`, `JournalEntry`, `Contact`, `FiscalPeriod`, `BankStatement`, `BankConnection`, `Document`, `RecurringEntry`, `Budget`, `YearEndClosing`, `Invitation`, `UserCompany`, `System`, `EInvoiceSending`, `ReceivedInvoice`, `VATSubmission`, `Project`, `Payment`.

### 6.5 Dækning

| Funktion | Status |
|----------|--------|
| Antal API-ruter der kalder audit-funktioner | 72 ruter (bekræftet via grep på `auditCreate`/`auditLog`/`auditUpdate`/`auditCancel`/`auditAuth`/`auditDeleteAttempt` i `src/app/api`). |
| Auth-events | `LOGIN`, `LOGIN_FAILED`, `LOGOUT`, `REGISTER`, `SESSION_INVALIDATE`, `LOGIN_2FA_VERIFIED` — alle med IP + User-Agent. |
| Mutationer | Alle POST/PUT/PATCH/DELETE-handlinger logges med before/after-changes. |
| Oversight | Alle oversight-handlinger logges som `OVERSIGHT`-action. |
| 2FA-events | `TWO_FACTOR_SETUP_STARTED`, `TWO_FACTOR_ACTIVATED`, `TWO_FACTOR_DISABLED`, `TWO_FACTOR_BACKUP_CODES_REGENERATED`, `TWO_FACTOR_TENANT_TOGGLE`. |
| Backup-operationer | `BACKUP_CREATE`, `BACKUP_RESTORE`, `BACKUP_DELETE`. |
| Konto-deaktivering | `ACCOUNT_DEACTIVATED`. |

### 6.6 Audit-log API

| Rute | Metode | Bemærkning |
|------|--------|------------|
| `/api/audit-logs` | GET (kun) | Ingen POST/PUT/DELETE. Pagination + filtrering på `action` og `entityType`. Company-scoped via `companyScope(ctx)`. Kræver `Permission.DATA_READ`. |

### 6.7 Øvrige logningstabeller

| Tabel | Formål |
|-------|--------|
| `EmailLog` | Udsendte e-mails (modtager, emne, body-hash, status). |
| `CronExecution` | Backup-cron udførelser (start, slut, status, fejlmeddelelse). |
| `BankConnectionSync` | Bank-synkroniseringshistorik pr. BankConnection. |

---

## 7. Multi-tenant isolation

### 7.1 Implementeringsprincip

AlphaFlow anvender virksomhedsbaseret tenant-isolering: `Company`-entiteten er tenant-grænsen. `companyId` er foreign key på 24 modeller, og alle databaseforespørgsler filtreres via `tenantFilter(ctx)` / `companyScope(ctx)`.

| Funktion | Implementering |
|----------|----------------|
| Tenant-grænse | `Company`-model. `companyId` på 24 datamodeller. |
| Prisma-where-filter | `tenantFilter(ctx)` / `companyScope(ctx)` returnerer `{ companyId: <user's active company> }`. |
| Oversight-mode | Scope sættes til `oversightCompanyId` — read-only, mutationer blokeres via `blockOversightMutation()`. |
| Ingen aktivt firma | `{ companyId: '__none__' }` (brugeren ser intet). |
| Fil-serving isolation | `/api/receipts/[...path]` og `/api/documents/serve/[...path]` tjekker eksplicit medlemskab via `userCompany.findUnique({userId_companyId})` og `isPathWithin()` path-traversal guard. |
| Demo-firma | `Company.isDemo = true` → read-only for non-SuperDev via `requireNotDemoCompany()`. |

### 7.2 Bekræftet isolation

Bruger A kan **ikke** se firma B's data uden medlemskab i `UserCompany`-tabellen. Bekræftet i routes for receipts, documents, members, audit-logs, transactions, journal-entries, invoices m.fl.

---

## 8. Netværkssikkerhed

### 8.1 TLS / HSTS

| Komponent | Konfiguration |
|-----------|---------------|
| Reverse proxy | Caddy v2 med automatiske Let's Encrypt-certifikater. |
| TLS-version | 1.2 / 1.3 (1.3 standard). |
| HTTP→HTTPS | Automatisk omdirigering. |
| HSTS | `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` (Caddyfile). |

### 8.2 Sikkerhedshoveder

Konfigureret både i `next.config.ts` (`headers()`) og i `Caddyfile`:

| Header | Værdi | Formål |
|--------|-------|--------|
| `X-Frame-Options` | `SAMEORIGIN` (globalt), `DENY` (API) | Clickjacking-beskyttelse. |
| `X-Content-Type-Options` | `nosniff` | MIME-sniffing-beskyttelse. |
| `X-XSS-Protection` | `1; mode=block` | Browser-XSS-filter. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Begrænser referrer-information. |
| `Permissions-Policy` | `camera=(self), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()` | Begrænser browser-API-adgang. |
| `Cache-Control` | `no-store, no-cache, must-revalidate, proxy-revalidate` (HTML + API) | Forhindrer caching af følsomt indhold. |

**Sikkerhedshoveder (inkl. CSP):**

| Header | Status |
|--------|--------|
| Content-Security-Policy | ✅ Implementeret (U-3) — CSP-Report-Only aktiv; enforce-mode klar. |

### 8.3 CORS

Ingen konfigureret CORS-policy i `next.config.ts` eller `Caddyfile`. API-routes har ingen CORS-headers → same-origin only. Undtagelse: `Access-Control-Allow-Origin: *` på statiske `.json`-filer til SEO structured data.

### 8.4 Databaseforbindelse

| Parameter | Værdi |
|-----------|-------|
| Database | PostgreSQL (Neon managed). |
| Forbindelsessikkerhed | `sslmode=require` (TLS). |
| DB-klient | Singleton `PrismaClient` med to query-udvidelser: `decimalSerializer` (Decimal→number) og `neonConnectionRetry` (op til 3 retry ved P1001/P1002/P1008/P1017, ECONNRESET/EPIPE/ETIMEDOUT). |

### 8.5 Webhooks

| Underbehandler | Header | Algoritme |
|----------------|--------|-----------|
| Storecove | `X-Storecove-Signature` | HMAC-SHA256 + `timingSafeEqual` (Buffer). |
| Frisbii / Flatpay | `Reepay-Signature` / `frisbii-signature` | HMAC-SHA256 + `timingSafeEqual` (Buffer). |
| TokenPay | `x-tokenpay-signature` | HMAC-SHA256 + `crypto.timingSafeEqual`. ✅ Udbedret (U-14). |

**✅ Opdateret (U-6/U-14):** Dev-fallback "accept all" er fjernet fra alle 3 webhook-ruter — de afviser nu når `WEBHOOK_SECRET` mangler (fail-closed). TokenPay string-XOR er erstattet med `crypto.timingSafeEqual` i 3 filer. Se `Bilag-12_Udbedringsplan.md` U-6 + U-14.

---

## 9. Fil-upload sikkerhed

### 9.1 Receipt uploads (`/api/transactions/upload`)

| Kontrol | Implementering |
|---------|----------------|
| MIME-whitelist | `ALLOWED_RECEIPT_TYPES`: JPEG, PNG, WebP, GIF, BMP, TIFF, PDF. |
| MIME ↔ extension cross-check | `.jpg` matcher `image/jpeg`. |
| Max størrelse | 25 MB (`MAX_RECEIPT_SIZE`). |
| Filnavn | Unikt med timestamp + `crypto.randomBytes(3)`-suffix. |
| Lokationer | `uploads/receipts/{companyId}/` (API-serving) + `Tenant-Backup/{companyName}/Receipts/{YYYY}/{MM}/{DD}/` (per-tenant backup). |
| Path-injection | `sanitizeCompanyName()` forhindrer path-injection i tenant-mappe-navn. |
| Path-traversal | `isPathWithin(resolvedPath, baseDir)` i `src/lib/file-service.ts`. |
| Adgangskontrol | Full guard: auth + company + `blockOversight` + `blockDemo` + `requireTokenPay` + `Permission.DATA_CREATE`. |

### 9.2 Document uploads (`/api/documents`)

| Kontrol | Implementering |
|---------|----------------|
| Whitelist | Billeder, PDF, Office-formater (.doc/.docx/.xls/.xlsx), CSV, text, ZIP, XML. |
| Max størrelse | 25 MB. |
| Lokation | `uploads/documents/{userId}/`. |
| Tilknytning | Specifik `journalEntryId` med ownership-tjek. |

### 9.3 Proof upload (`/api/proof-upload`)

| Kontrol | Implementering |
|---------|----------------|
| Filendelse | `.tbkey` kun. |
| Videre-stilning | Til TokenPay mini-service til AES-256-GCM-dekryptering. |

### 9.4 Backup upload-restore (`/api/backups/upload-restore`)

| Kontrol | Implementering |
|---------|----------------|
| Filendelse | `.zip` kun. |
| Max størrelse | 2 GB. |
| Validering | JSZip-validering af `manifest.json`. |

### 9.5 Antivirus-scanning (✅ implementeret — U-4)

| Kontrol | Implementering |
|---------|----------------|
| Motor | ClamAV (`clamd` daemon) via INSTREAM TCP-protokol |
| Integration | `src/lib/clamav.ts` — chunked scanning (16 KB) med backpressure |
| Konfiguration | `CLAMAV_ENABLED`, `CLAMAV_HOST`, `CLAMAV_PORT`, `CLAMAV_TIMEOUT` |
| Berørte ruter | `/api/transactions/upload`, `/api/documents`, `/api/backups/upload-restore` |
| Blokering | 403 Forbidden ved positiv detection |
| Logging | AuditLog-post med virus-navn, filnavn, bruger, virksomhed |
| Fejlhåndtering | ClamAV-fejl logges men blokerer IKKE upload (MIME-whitelist gælder stadig) |
| Nye afhængigheder | Ingen (bruger Node.js indbyggede `net`-modul) |

**VPS setup:** `sudo apt install clamav-daemon && sudo systemctl enable --now clamav-daemon`
**Test:** Upload EICAR-testfil — skal blokeres med 403.

---

## 10. Sikkerhedsmæssige bemærkninger

| # | Beskrivelse | Alvor |
|---|-------------|-------|
| 1 | Auth og rate-limiting håndteres pr. route via `withGuard`-wrapper. | Lav |
| 2 | CSRF-beskyttelse via `SameSite=Lax` cookie + Bearer-token. | Lav |
| 3 | Immutability håndhæves via AuditLog 3-niveau + PostgreSQL-triggers. | Middel |
| 4 | Rate-limiting på auth-endpoints (IP-baseret, in-memory). | Middel |
| 5 | Caddy `rate_limit`-modul ikke installeret; rate-limiting er in-memory. | Middel |
| 6 | Autentificering via email + password + TOTP 2FA. | Lav |
| 7 | Password minimum 6 tegn. | Middel |

### 10.1 Fordeling

| Alvor | Antal |
|-------|-------|
| Middel | 4 (#3, #4, #5, #7) |
| Lav | 3 (#1, #2, #6) |

---

## 11. Konklusion

### 11.1 Samlet vurdering

AlphaFlow opfylder Bogføringslovens krav til et digitalt regnskabssystem: dobbelt bogføring, FSR-baseret kontoplan, fortløbende bilagsnummerering, periode-låsning, SAF-T-eksport, årsrapport-eksport (CSV/iXBRL), 5-års backup-retention med AES-256-GCM-kryptering, og en 3-niveau immutability-strategi på audit-loggen (applikation CREATE-only + PostgreSQL-triggers + cascade-Restrict).

Platformen opfylder GDPR's sikkerhedskrav (art. 32): kryptering i transit (TLS 1.2/1.3), kryptering i hvile for følsomme data (bank-tokens, TOTP-secrets, backup-filer via AES-256-GCM), adgangskontrol (RBAC + multi-tenant isolation), TOTP 2FA, og uforanderlig audit-trail.

### 11.2 Valgte arkitektoniske beslutninger

| Område | Beskrivelse |
|--------|-------------|
| **Immutability (BEK 97 Bilag 1 / Lov om bogføring §13)** | Immutability håndhæves via AuditLog 3-niveau (applikation CREATE-only + PostgreSQL-triggers + cascade-Restrict). |
| **Persondata-kryptering i hvile (GDPR art. 32)** | Følsomme data (bank-tokens, 2FA-secrets) er AES-256-GCM-krypteret. Øvrige persondata (email, telefon, adresser) opbevares ukrypteret og beskyttes af Neon TLS + DB-adgangskontrol + RBAC. |
| **Bank-integration** | Tink er en reel integration (PSD2 consent-flow); Nordea/Danske Bank/Jyske Bank er stubs; Demo-provider leverer syntetiske data. AI-assisteret bankafstemning er implementeret i produktion via OpenRouter (`src/lib/matching-engine.ts`): tre-niveau matching (regelbaseret/fuzzy/AI) med konfidens-tærskler ≥0,95 autoprogrammeres, 0,80–0,95 kræver manuel godkendelse. |
| **Kreditnota-oprettelse** | Kreditnotaer er fuldt implementeret: UI-knap, backend med `creditNotePrefix` (KRE-{år}-{seq}), spejlet bogføring, valgfrit `originalInvoiceId`, PDF og OIOUBL type 381. Annullering opretter modpostering `REVERSAL-{invoiceNumber}`. |
| **Moms-API** | Momsangivelse til SKAT via OAuth2 `client_credentials`. |

### 11.3 Supplerende sikkerhedsforanstaltninger (planlagt)

| Område | Beskrivelse |
|--------|-------------|
| **Password min. 6 tegn** | Aktuel politik. |
| **Ingen account-lockout** | Rate-limiting anvendes i stedet. |

### 11.4 Afhjælpning

Planlagte sikkerhedsforbedringer er beskrevet i `docs/Bilag-12_Udbedringsplan.md`.

### 11.5 Erklæring

AlphaAi Consult ApS erklærer herved, at nærværende rapport dokumenterer platformens faktiske compliance-tilstand, som den kan verificeres i kildekoden pr. versionsdato. Ved tvivl om en bestemt foranstaltning henvises til kildekoden.

AlphaAi Consult ApS forpligter sig til løbende at vedligeholde og udvikle platformens sikkerhedsniveau.

---

## Bilag A — Referencer til kildekode

| Komponent | Sti |
|-----------|-----|
| Krypteringsmodul | `src/lib/crypto.ts` |
| Adgangskodemodul | `src/lib/password.ts` |
| Sessionsmodul | `src/lib/session.ts` |
| RBAC-modul | `src/lib/rbac.ts` |
| Route-guard | `src/lib/route-guard.ts` |
| Audit-modul | `src/lib/audit.ts` |
| Audit-immutability SQL | `prisma/audit-immutability.sql` |
| Audit-trigger installation | `scripts/apply-audit-immutability.ts` |
| Bank-token migration | `scripts/migrate-bank-tokens.ts` |
| 2FA-modul | `src/lib/two-factor.ts` |
| Rate-limit | `src/lib/rate-limit.ts` |
| File-service | `src/lib/file-service.ts` |
| TokenPay adgang | `src/lib/tokenpay.ts` |
| Access-guard | `src/lib/access-guard.ts` |
| Backup-engine | `src/lib/backup-engine.ts` |
| Backup-scheduler | `src/lib/backup-scheduler.ts` |
| Prisma-skema | `prisma/schema.prisma` |
| Next.js-konfiguration | `next.config.ts` |
| Caddy-konfiguration | `Caddyfile` |
| Standardkontoplan + mapping | `src/lib/standard-chart-of-accounts.ts` |
| SAF-T-validator | `src/lib/saft-validator.ts` |
| SAF-T-eksport | `src/app/api/export-saft/route.ts` |
| Årsrapport CSV | `src/lib/annual-report-csv.ts` |
| Årsrapport iXBRL | `src/lib/annual-report-xbrl.ts` |
| Moms-API | `src/lib/vat-submit.ts` |
| CVR-klient | `src/lib/cvr-client.ts` |
| Storecove-klient + webhook | `src/lib/storecove-client.ts`, `src/app/api/storecove/webhook/route.ts` |
| Flatpay-klient + webhook | `src/lib/flatpay-client.ts`, `src/app/api/subscription/payment-webhook/route.ts` |
| TokenPay callback | `src/app/api/tokenpay/callback/route.ts` |
| Hermes-agent | `mini-services/hermes-agent/` |
| Knowledge-service | `mini-services/knowledge-service/` |
| Scanner-service | `mini-services/scanner-service/` |
| TokenPay-access-service | `mini-services/tokenpay-access-service/` |
| Notification-ws | `mini-services/notification-ws/` |
| Tenant-eksport | `src/app/api/export-tenant/route.ts` |
| Eksport-info | `src/app/api/company/export-info/route.ts` |
| Bank-providers | `src/lib/bank-providers.ts` |
| Matching-engine | `src/lib/matching-engine.ts` |
| Currency-utils | `src/lib/currency-utils.ts` |
| E-faktura parser | `src/lib/einvoice-parser.ts` |
| E-faktura response | `src/lib/einvoice-response.ts` |
| E-faktura sender | `src/lib/einvoice-sender.ts` |
| NemHandel-klient | `src/lib/nemhandel-client.ts` |

## Bilag B — Referencer til relaterede dokumenter

| Dokument | Formål |
|----------|--------|
| `docs/Bilag-07_Databehandleraftale.md` | Underbehandlere, SCC, TIA, behandlingsregister (GDPR art. 28, 30, 46). |
| `docs/Bilag-09_Beredskabsplan.md` | Beredskab ved persondataforstyrrelser (GDPR art. 33–34). |
| `docs/Bilag-08_Risikovurdering-DPIA.md` | DPIA og risikovurdering (GDPR art. 35). |
| `docs/Bilag-12_Udbedringsplan.md` | Planlagte sikkerhedsforbedringer. |
| `docs/Bilag-05_Krypteringsrapport.md` | Detaljeret teknisk dokumentation af krypteringsimplementering. |
| `docs/Bilag-11_IT-sikkerhed-Neon-og-IONOS.md` | Hosting-udbydernes sikkerhedscertificeringer. |

---

*Version 3.2 — udarbejdet af AlphaAi Consult ApS.*
