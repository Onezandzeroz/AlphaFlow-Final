# Beredskabsplan — AlphaFlow

**AlphaAi Consult ApS**
**CVR: [46312058]**
**Dokumentversion:** 2.0
**Dato:** 04/06/2026
**Klassifikation:** Fortroligt — Compliance-dokumentation

---

## Indholdsfortegnelse

1. [Formål](#1-formål)
2. [Beredskabsorganisation](#2-beredskabsorganisation)
3. [Incidentscenarier](#3-incidentscenarier)
4. [Gendannelsesprocedurer](#4-gendannelsesprocedurer)
5. [RTO og RPO](#5-rto-og-rpo)
6. [Test af beredskab](#6-test-af-beredskab)
7. [Kontaktliste](#7-kontaktliste)
8. [Dokumentation](#8-dokumentation)

---

## 1. Formål

### 1.1 Dokumentets formål

Denne beredskabsplan beskriver AlphaFlows procedurer for forebyggelse, registrering, begrænsning og gendannelse af AlphaFlow-systemet ved kritiske hændelser (incidents). Planen sikrer, at:

- Bogføringsdata altid kan gendannes i overensstemmelse med **Bogføringslovens § 10-12**
- **5-års opbevaringspligt** opretholdes selv ved kritiske hændelser
- Systemets tilgængelighed genetableres inden for definerede tidsrammer
- Alle hændelser dokumenteres i uforanderlig audit trail (`src/lib/audit.ts`), beskyttet mod ændring/sletning på databaseniveau af PostgreSQL-triggere (`prisma/audit-immutability.sql`)

### 1.2 Lovgrundlag

| Lovkrav | Reference | Krav |
|---------|-----------|------|
| Bogføringsloven § 10 | Elektronisk bogføringssystem skal sikre mod hændelig tilintetgørelse | |
| Bogføringsloven § 12 | Bilag skal opbevares i 5 år | |
| BEK 98 — Hovedkrav nr. 2 | It-sikkerhed: Beredskab og reetablering (krav D4) | |
| GDPR artikel 32 | Sikkerhed i behandling af personoplysninger | |
| GDPR artikel 33 | Underretning af Datatilsynet inden for 72 timer ved data breach | |

### 1.3 Anvendelsesområde

Denne plan dækker:

- AlphaFlow-applikationen (Next.js 16)
- IONOS VPS (applikationsserver og lokal backup-lagring i EU)
- Neon PostgreSQL-database
- Caddy reverse proxy
- Mini-services (TokenPay Access Service, notification WS, Hermes AI)
- Backup-system og backup-lagring (AES-256-GCM krypteret på IONOS VPS)

---

## 2. Beredskabsorganisation

### 2.1 Roller og ansvarsområder

| Rolle | Ansvarsområde | Kontakt | Backup-kontakt |
|-------|--------------|---------|---------------|
| **System Administrator** | Infrastruktur, overvågning, first-response, backup/restore | [Navn, telefon, e-mail] | [Navn, telefon, e-mail] |
| **Technical Lead** | Applikationsfejl, kode-deployment, teknisk gendannelse | [Navn, telefon, e-mail] | [Navn, telefon, e-mail] |
| **Compliance Officer** | GDPR-håndtering, underretning af Datatilsynet, kundekommunikation | [Navn, telefon, e-mail] | [Navn, telefon, e-mail] |

### 2.2 Eskalationsniveau

```
┌─────────────────────────────────────────────────────────┐
│  NIVEAU 1 — System Administrator                        │
│  • Automatiske alarmer og overvågning                   │
│  • Indledende vurdering og first-response               │
│  • Backup/restore ved kendte scenarier                   │
├─────────────────────────────────────────────────────────┤
│  NIVEAU 2 — Technical Lead                              │
│  • Eskaleres ved ukendte fejl eller applikationsnedbrud  │
│  • Fejlfinding og kode-fixes                            │
│  • Deployment af hotfixes                               │
├─────────────────────────────────────────────────────────┤
│  NIVEAU 3 — Compliance Officer + Direktør                │
│  • Eskaleres ved data breach, ransomware eller GDPR     │
│  • Underretning af Datatilsynet                         │
│  • Kundekommunikation                                  │
│  • Ekstern kommunikation (medier, myndigheder)          │
└─────────────────────────────────────────────────────────┘
```

### 2.3 Eskalationsregler

| Situations-type | Eskaleres til | Tidsfrist |
|----------------|--------------|----------|
| Server genstart fejler (PM2 max_restarts nået) | Niveau 2 (Technical Lead) | 15 min |
| Database utilgængelig > 5 min | Niveau 2 (Technical Lead) | 5 min |
| Datakorruption mistænkt | Niveau 2 + 3 | Straks |
| Data breach bekræftet | Niveau 3 (Compliance Officer) | Straks |
| Ransomware mistænkt | Niveau 3 (Compliance Officer + Direktør) | Straks |
| DDoS angreb aktivt | Niveau 2 + Caddy-konfiguration | 5 min |

---

## 3. Incidentscenarier

### 3.1 Server ned / applikationsfejl

**Beskrivelse:** Next.js-applikationen er utilgængelig på grund af uventet fejl, memory leak, eller infrastrukturproblemer.

**Forebyggelse:**
- PM2 process management (`ecosystem.config.js`) med automatisk genstart
- Health check via PM2 (`autorestart: true`, `max_restarts: 10`, `restart_delay: 5000`)
- Memory monitoring (`max_memory_restart: '1500M'`)
- Caddy reverse proxy med retry-logik

**Forløb:**

| Trin | Handling | Ansvarlig | Tidsramme |
|------|---------|-----------|----------|
| 1 | PM2 registrerer crash og forsøger automatisk genstart | System | Automatisk (5 sek) |
| 2 | Verificer at applikation er tilgængelig via health check | System | Automatisk |
| 3 | Hvis PM2 max_restarts nået: undersøg fejllogs (`./logs/error.log`) | SysAdmin | 5 min |
| 4 | Kontakt IONOS support hvis infrastruktur-problem mistænkes | SysAdmin | 10 min |
| 5 | Eskaler til Technical Lead hvis fejlen ikke kan løses | SysAdmin | 15 min |
| 6 | Udbedring / hotfix og redeployment | Tech Lead | < 2 timer |
| 7 | Verificer system tilgængelighed og audit log | SysAdmin | 15 min |

**Konkret PM2-konfiguration** (`ecosystem.config.js`):
```javascript
{
  name: 'alphaflow',
  autorestart: true,
  max_restarts: 10,
  restart_delay: 5000,
  max_memory_restart: '1500M',
}
```

---

### 3.2 Database tab / korruption

**Beskrivelse:** Neon PostgreSQL-database er utilgængelig, eller data er korrumperet.

**Forebyggelse:**
- Neon SOC 2 Type II med redundans og failover
- Automatiske backups via `src/lib/backup-scheduler.ts` (hourly/daily/weekly/monthly)
- SHA-256 checksum-verifikation af alle backup-filer (`src/lib/backup-engine.ts`)
- Atomic database-transaktioner ved restore

**Forløb:**

| Trin | Handling | Ansvarlig | Tidsramme |
|------|---------|-----------|----------|
| 1 | Identificer omfanget: single tenant vs. alle tenants | SysAdmin | 5 min |
| 2 | Kontakt Neon support (PITR restore for database-niveau) | SysAdmin | 10 min |
| 3 | Hvis full restore påkrævet: brug AlphaFlow backup-engine | Tech Lead | < 1 time |
| 4 | Verificer backup-integritet via SHA-256 checksum | SysAdmin | 5 min |
| 5 | Udfør restore med pre-restore safety backup (atomisk transaktion) | Tech Lead | < 1 time |
| 6 | Valider gendannede data: tæl records, verifikér checksums | Tech Lead | 30 min |
| 7 | Hvis restore fejler: rollback til pre-restore safety backup | Tech Lead | 15 min |
| 8 | Audit log af hele hændelsen | SysAdmin | 15 min |

**Konkrete tekniske referencer:**
- Backup restore: `src/lib/backup-engine.ts` → `restoreBackup()`
- Backup scheduler: `src/lib/backup-scheduler.ts` → `runScheduledBackupCycle()`
- SHA-256 verifikation: `src/lib/backup-engine.ts` → `calculateChecksum()`

---

### 3.3 Ransomware / malware

**Beskrivelse:** Systemet er inficeret med ransomware eller malware, der truer med at kryptere eller slette data.

**Forebyggelse:**
- Uforanderlig audit trail (`src/lib/audit.ts` + `prisma/audit-immutability.sql`) — kan aldrig slettes eller ændres, håndhævet på både applikations- og databaseniveau
- AES-256-GCM kryptering af følsomme data (`src/lib/crypto.ts`)
- Krypterede backups (AES-256-GCM krypterede ZIP-arkiver lagret på IONOS VPS i EU)
- IONOS VPS med C5 (BSI) og IT-Grundschutz certificering sikrer backup-lagring i EU
- Server adgang kun via SSH-nøgler (ingen password-login)
- RBAC med 5 roller og 23 permissions (`src/lib/rbac.ts`)
- TOTP-baseret 2FA (`src/lib/two-factor.ts`)

**Forløb:**

| Trin | Handling | Ansvarlig | Tidsramme |
|------|---------|-----------|----------|
| 1 | Isolér det berørte system (afbryd netværksadgang) | SysAdmin | Straks |
| 2 | Eskaler til Niveau 3 (Compliance Officer + Direktør) | SysAdmin | Straks |
| 3 | **LÆS IKKE løsepenge** — policy er at aldrig betale løsepenge | Direktør | — |
| 4 | Assess skadeomfang: hvilke tenants er berørt? | Tech Lead | 15 min |
| 5 | Verificer backup-integritet (SHA-256) på offline/ubeskadiget system | SysAdmin | 30 min |
| 6 | Restore berørte tenants fra seneste verificerede backup | Tech Lead | < 2 timer |
| 7 | Gennemgå audit trail for uautoriseret adgang (`src/lib/audit.ts`) | Tech Lead | 1 time |
| 8 | Roter alle kryptografiske nøgler (ENCRYPTION_KEY, session secrets) | Tech Lead | 30 min |
| 9 | Sæt alle berørte brugerkonti til at kræve ny 2FA-opsætning | Tech Lead | 30 min |
| 10 | Underret Datatilsynet hvis personoplysninger er berørt | Compliance | < 72 timer |
| 11 | Kundekommunikation med transparens om hændelsen | Compliance | < 48 timer |

---

### 3.4 DDoS angreb

**Beskrivelse:** AlphaFlow er under Distributed Denial of Service angreb, der gør systemet utilgængeligt.

**Forebyggelse:**
- Caddy reverse proxy med automatisk rate limiting
- Neon PostgreSQL med indbygget DDoS-beskyttelse (via AWS Shield)
- Cloudflare CDN-beskyttelse (via Neons infrastruktur)
- Efficiente API-routes med minimal computation per request

**Forløb:**

| Trin | Handling | Ansvarlig | Tidsramme |
|------|---------|-----------|----------|
| 1 | Aktivér rate limiting i Caddy (hvis ikke allerede aktiv) | SysAdmin | 5 min |
| 2 | Bloker mistænkelige IP-adresser via Caddy / firewall | SysAdmin | 10 min |
| 3 | Kontakt hosting-udbyder (Neon/AWS) for yderligere DDoS-mitigation | SysAdmin | 15 min |
| 4 | Overvåg systemets tilgængelighed og responstid | SysAdmin | Løbende |
| 5 | Hvis angreb fortsætter: eskaler til hosting-udbyders enterprise support | Tech Lead | 30 min |
| 6 | Efter angreb: gennemgå logs og audit trail for kompromittering | Tech Lead | 1 time |

---

### 3.5 Data breach

**Beskrivelse:** Uautoriseret adgang til eller lækage af personoplysninger eller forretningsdata.

**Forebyggelse:**
- TOTP 2FA for alle brugerkonti (`src/lib/two-factor.ts`)
- RBAC med 23 granulære permissions (`src/lib/rbac.ts`)
- Uforanderlig audit trail med 20+ hændelsestyper (`src/lib/audit.ts`)
- AES-256-GCM kryptering af følsomme data (`src/lib/crypto.ts`)
- TLS 1.3 med HSTS (`Caddyfile`)
- Session-håndtering med invalidering

**Forløb:**

| Trin | Handling | Ansvarlig | Tidsramme |
|------|---------|-----------|----------|
| 1 | Bekræft data breach: gennemgå audit trail (`src/lib/audit.ts`) | Tech Lead | 30 min |
| 2 | Identificer omfang: hvilke data, hvilke tenants, hvilke brugere? | Tech Lead | 1 time |
| 3 | Bloker den kompromitterede adgangskanal | SysAdmin | Straks |
| 4 | Eskaler til Compliance Officer (Niveau 3) | Tech Lead | Straks |
| 5 | Underret Datatilsynet inden for **72 timer** (GDPR artikel 33) | Compliance | < 72 timer |
| 6 | Assess om berørte data-subjects skal underrettes (GDPR artikel 34) | Compliance | < 72 timer |
| 7 | Forbered kundekommunikation og FAQ | Compliance | < 48 timer |
| 8 | Udfør teknisk gendannelse og sikring af sårbarheder | Tech Lead | < 4 timer |
| 9 | Roter alle berørte credentials og kryptografiske nøgler | Tech Lead | < 2 timer |
| 10 | Dokumentér hændelse i audit trail og worklog | Tech Lead | < 4 timer |

---

### 3.6 Tab af krypteringsnøgle

**Beskrivelse:** `ENCRYPTION_KEY` miljøvariablen er mistet eller kompromitteret, hvilket gør krypterede bank-tokens og 2FA-secrets uleselige.

**Forebyggelse:**
- Krypteringsnøgle lagres kun i server-miljøvariabel (ikke i database eller kildekode)
- Nøglen gemmes i sikker offline backup (krypteret USB / password manager)
- Key rotation-procedure dokumenteret nedenfor

**Konsekvenser af tabt nøgle:**
- Krypterede bank access tokens og refresh tokens (`src/lib/crypto.ts`) kan ikke dekrypteres
- Krypterede 2FA-secrets (`src/lib/two-factor.ts`) kan ikke dekrypteres
- Bogføringsdata er **ikke** påvirket (krypteres kun bank-tokens og 2FA-secrets)

**Forløb:**

| Trin | Handling | Ansvarlig | Tidsramme |
|------|---------|-----------|----------|
| 1 | Generer ny `ENCRYPTION_KEY` | SysAdmin | 5 min |
| 2 | Opdater miljøvariabel på serveren | SysAdmin | 5 min |
| 3 | Genstart alle PM2-processer | SysAdmin | 5 min |
| 4 | Alle berørte bank-forbindelser skal re-autoriseres (bank-login) | Brugere | Asynkront |
| 5 | Alle brugere med 2FA skal genopsætte 2FA (QR-kode + ny secret) | Brugere | Asynkront |
| 6 | Audit log af nøgle-tab og rotation | SysAdmin | 15 min |
| 7 | Send notifikation til berørte brugere om re-autorisation | Compliance | 24 timer |

> **Vigtigt:** Bogføringsdata, journalposter, fakturaer og kontoplan er **ikke** krypteret med `ENCRYPTION_KEY`. Kun bank-tokens og 2FA-secrets påvirkes af tab af krypteringsnøglen.

---

## 4. Gendannelsesprocedurer

### 4.1 Backup-restore procedure

Backup-systemet er implementeret i følgende filer:

| Fil | Funktion |
|-----|---------|
| `src/lib/backup-engine.ts` | Kerne-backup/gendannelses-motor |
| `src/lib/backup-scheduler.ts` | Automatisk tidsplan for backups |

#### Restore-flow (teknisk)

```
1. Vælg backup til restore
   └── GET /api/backups → liste over tilgængelige backups

2. Dekrypter backup-fil
   └── AES-256-GCM dekryptering af krypteret backup-ZIP (src/lib/backup-engine.ts)
   └── Backup-filer er krypteret før lagring på IONOS VPS

3. Verificer backup-integritet
   └── calculateChecksum(filePath) → sammenlign med gemt SHA-256

4. Opret pre-restore safety backup
   └── createBackup(userId, 'automatic', 'hourly', companyId, 'tenant')
   └── Hvis safety backup fejler → ABORT restore (data beskyttet)

5. Parse backup ZIP
   └── Valider manifest.json (version 2 kræves)

6. Udfør restore i atomisk database-transaktion
   └── db.$transaction(async (tx) => {
       ├── Slet eksisterende tenant-data (FK-safe rækkefølge)
       └── Importér data fra backup ZIP
     }, { timeout: 10 * 60 * 1000 })

7. Ved succes: audit log med gendannede record counts
8. Ved fiasko: transaktion ruller automatisk tilbage (ROLLBACK)
```

#### SHA-256 checksum-verifikation

Før enhver restore verificeres backup-filens integritet:

```typescript
// src/lib/backup-engine.ts → calculateChecksum()
const currentChecksum = await calculateChecksum(backup.filePath);
if (currentChecksum !== backup.sha256) {
  return { success: false, error: 'Backup checksum mismatch — file may be corrupted' };
}
```

#### Pre-restore safety backup

Før enhver restore oprettes automatisk en sikkerhedskopi af den nuværende tilstand. Hvis restore fejler, kan systemet altid rulle tilbage til pre-restore-tilstanden:

```typescript
// src/lib/backup-engine.ts → restoreTenantSnapshot()
const preRestoreBackup = await createBackup(userId, 'automatic', 'hourly', companyId, 'tenant', {
  reason: 'pre-tenant-restore-snapshot',
});
if (!preRestoreBackup) {
  return { success: false, error: 'Pre-restore safety backup failed — aborting restore to protect data' };
}
```

### 4.2 Backup-tidsplan

Backups udføres automatisk via `src/lib/backup-scheduler.ts` med følgende tidsplan:

| Backup-type | Cron-udtryk | Tidspunkt | Frekvens |
|-------------|------------|-----------|----------|
| Hourly | `5 * * * *` | Hvert fulde minut 5 | Hver time |
| Daily | `15 2 * * *` | Daglig kl. 02:15 | Hver dag |
| Weekly | `30 3 * * 1` | Mandag kl. 03:30 | Hver uge |
| Monthly | `0 4 1 * *` | 1. i måneden kl. 04:00 | Hver måned |
| Manual | — | Når bruger opretter | På anmodning |

### 4.3 Retention-politik

| Backup-type | Antal bevarede | Udløb |
|-------------|---------------|-------|
| Hourly | 24 | 25 timer |
| Daily | 30 | 31 dage |
| Weekly | 52 | 53 dage (~1 år) |
| Monthly | 60 | 365 dage (5-års retention via månedlige) |
| Manual | 999 | 90 dage |

> **5-års opbevaring:** Bogføringslovens krav om 5-års opbevaring opfyldes ved 60 månedlige backups (60 måneder = 5 år). Den første dag i hver måned gemmes en komplet tenant-snapshot, som bevares i 60 måneder.

### 4.4 Backup-format

Alle backups gemmes som AES-256-GCM krypterede ZIP-arkiver med strukturerede JSON-filer:

```
snapshot-tenant-hourly-2025-01-15T10-30-00-000Z.zip.enc
├── [AES-256-GCM krypteret ZIP-arkiv]
│   ├── manifest.json          — Metadata (version, timestamp, record counts)
│   ├── company.json           — Virksomhedsindstillinger
│   ├── accounts.json          — Kontoplan
│   ├── contacts.json          — Kontakter
│   ├── transactions.json      — Transaktioner
│   ├── invoices.json          — Fakturaer
│   ├── journal-entries.json   — Journalposter (med linjer og bilag)
│   ├── fiscal-periods.json    — Regnskabsperioder
│   ├── budgets.json           — Budgetter
│   ├── recurring-entries.json  — Tilbagevendende poster
│   ├── bank-statements.json   — Bankkontoudtog
│   ├── bank-connections.json   — Bankforbindelser
│   └── members.json           — Teammedlemmer
└── Lagret på IONOS VPS (Tenant-Backup/ folder, EU-datacenter)
```

### 4.5 Cleanup procedure

Udløbne backups ryddes automatisk daglig kl. 03:00 via backup-scheduler:

```
Daily cleanup cycle:
  ├── Itererer alle aktive companies
  ├── Sletter backups hvor expiresAt < now()
  └── Logger antal slettede backups
```

---

## 5. RTO og RPO

### 5.1 Definitioner

| Metrik | Definition | AlphaFlow-værdi |
|--------|-----------|-----------------|
| **RPO** (Recovery Point Objective) | Maksimalt tilladt datatab målt i tid | **1 time** |
| **RTO** (Recovery Time Objective) | Maksimal tilladt nedetid før system er gendannet | **4 timer** |

### 5.2 RPO-beregning

| Parameter | Værdi | Begrundelse |
|-----------|-------|-----------|
| Hyppigste backup | Hver time (minut 5) | Hourly backup via `backup-scheduler.ts` |
| Backup retention | 24 hourly backups | Dækker seneste 24 timer |
| Maksimalt datatab | < 1 time | Afhængig af tidspunkt for hændelse |
| First-data backup | Automatisk ved første transaktion | Sikrer backup fra dag 1 |

**RPO = 1 time** — Det værste tilfælde er, at en hændelse indtræffer lige før næste hourly backup. I dette tilfælde kan op til 59 minutters data gå tabt.

### 5.3 RTO-beregning

| Fase | Estimeret tid | Begrundelse |
|------|--------------|-----------|
| Detektion | < 5 min | PM2 auto-restart + overvågning |
| Assessment | < 15 min | System Administrator vurderer |
| Restore forberedelse | < 15 min | SHA-256 verifikation + pre-restore safety backup |
| Database restore | < 1 time | Atomisk transaktion (< 10 min timeout) |
| Applikations-restart | < 15 min | PM2 genstart |
| Validering | < 30 min | Record counts, checksums, smoke test |
| Audit logging | < 15 min | Dokumentation i audit trail |
| **Total RTO** | **< 4 timer** | Sum af alle faser |

### 5.4 RTO for specifikke scenarier

| Scenario | RTO | Begrundelse |
|----------|-----|-----------|
| Server ned (kun applikation) | < 30 min | PM2 auto-restart, ingen data-tab |
| Server ned (inkl. database) | < 4 timer | Full restore fra backup |
| Database korruption | < 4 timer | Restore med pre-restore safety backup |
| Ransomware | < 4 timer | Restore fra offline verificeret backup |
| Data breach | < 4 timer | Gendannelse + nøglerotation + audit |
| Tab af krypteringsnøgle | < 2 timer (system) | Ny nøgle + genstart; bank-reauth er asynkront |

---

## 6. Test af beredskab

### 6.1 Testplan

| Test-type | Frekvens | Omfang | Deltagere | Mål |
|-----------|---------|--------|-----------|-----|
| **Kvartalsvis restore-test** | Hvert kvartal | Restore af én tenant fra seneste backup på test-miljø | SysAdmin, Tech Lead | Verificere at restore-proceduren fungerer |
| **Årlig full DR drill** | Årligt | Simuleret total nedetid med gendannelse af alle tenants | Alle roller | Verificere fuld beredskabsplan |
| **Backup-integritets-tjek** | Daglig | Verificer at backup-scheduler kører (via cron health) | Automatisk | Sikre at alle backup-typer udføres |
| **SHA-256 verifikation** | Månedligt | Spot-check af 5 tilfældige backups' checksums | SysAdmin | Sikre backup-integritet |

### 6.2 Kvartalsvis restore-test

Forløb for kvartalsvis test:

| Trin | Handling | Forventet resultat |
|------|---------|-------------------|
| 1 | Vælg en tilfældig tenant med data | — |
| 2 | Opret backup af nuværende tilstand (pre-test) | Backup gemmes med SHA-256 |
| 3 | Restore fra seneste hourly backup | Restore fuldført succesfuldt |
| 4 | Verificer record counts mod forventede værdier | Accounts, transactions, journal entries matcher |
| 5 | Verificer SHA-256 checksum | Checksum matcher gemt værdi |
| 6 | Kontrol af audit trail | BACKUP_CREATE og BACKUP_RESTORE hændelser logget |
| 7 | Restore pre-test backup (tilbage til starttilstand) | System tilbage til tilstanden før test |
| 8 | Dokumenter resultater | Testrapport med tidsmåling og resultater |

### 6.3 Årlig full DR drill

Forløb for årlig gendannelsesøvelse:

1. **Scenarie-vælg:** Compliance Officer vælger et incidentscenarie fra afsnit 3
2. **Simulation:** SysAdmin simulerer hændelsen (fx stop af applikation, database tab)
3. **Response:** Alle roller udfører deres respektive handlinger
4. **Timing:** Alle tidsforbrug registreres for at verificere RTO
5. **Debriefing:** Evaluering af forløb, forbedringsforslag
6. **Opdatering:** Beredskabsplanen opdateres baseret på erfaringer

### 6.4 Dokumentation af test

Alle beredskabstests dokumenteres med:
- Dato og tidspunkt
- Deltagere
- Test-scenarie
- Forløb og tidsmåling
- Resultater (bestået/ikke bestået)
- Forbedringspunkter
- Opfølgende handlinger

---

## 7. Kontaktliste

### 7.1 Interne eskaleringskontakter

| Rolle | Navn | Telefon | E-mail | Backup-kontakt |
|-------|------|---------|--------|---------------|
| System Administrator | [Jess Christoffersen] | [61736076] | [alphaaiconsult@gmail.com] | [Indsæt navn] |
| Technical Lead | [Indsæt navn] | [Indsæt nr.] | [Indsæt e-mail] | [Indsæt navn] |
| Compliance Officer | [Indsæt navn] | [Indsæt nr.] | [Indsæt e-mail] | [Indsæt navn] |
| Direktør | [Indsæt navn] | [Indsæt nr.] | [Indsæt e-mail] | [Indsæt navn] |

### 7.2 Eksterne kontakter

| Leverandør | Formål | Kontaktkanal | SLA |
|-----------|--------|-------------|-----|
| IONOS VPS | Applikationsserver og backup-lagring | https://www.ionos.de/hilfe | 24/7 telefon + chat |
| Neon PostgreSQL | Database support | https://neon.tech/support | 24/7 chat |
| Let's Encrypt | Certifikat-problemer | Community forum | Best effort |
| Datatilsynet | GDPR-underretning | https://www.datatilsynet.dk | < 72 timer |
| Erhvervsstyrelsen | Bogføringsloven | https://www.erhvervsstyrelsen.dk | Efter behov |

### 7.3 Kommunikation med kunder

Ved incidents der påvirker kunder:

| Tidsramme | Kanal | Indhold |
|-----------|-------|---------|
| < 15 min | Statusside | "Vi undersøger en teknisk hændelse" |
| < 1 time | Statusside + e-mail | Beskrivelse af problem og forventet løsningstid |
| Ved gendannelse | Statusside + e-mail | Bekræftelse af gendannelse + eventuelle påvirkninger |
| < 48 timer | E-mail | Detaljeret hændelsesrapport (for data breaches) |

---

## 8. Dokumentation

### 8.1 Relaterede dokumenter

| Dokument | Sti | Formål |
|----------|-----|--------|
| Leverandørdokumentation | `docs/LEVERANDOERSTYRING.md` | Leverandørstyring og -evaluering |
| Compliance Report | `docs/COMPLIANCE_REPORT.md` | Samlet compliance-dokumentation |
| Krypteringsdokumentation | `docs/ENCRYPTION.md` | AES-256-GCM krypteringsdetaljer |
| Databehandleraftale | `docs/DATABEHANDLERAFTALE.md` | GDPR databehandleraftale |
| Risikovurdering | `docs/RISIKOVURDERING.md` | IT-risikovurdering |
| Worklog | `worklog.md` | Teknisk implementeringshistorik |

### 8.2 Tekniske referencer

| Komponent | Fil | Funktion |
|-----------|-----|---------|
| Backup motor | `src/lib/backup-engine.ts` | Opret/restore backups, SHA-256 verificering |
| Backup scheduler | `src/lib/backup-scheduler.ts` | Automatiske hourly/daily/weekly/monthly backups |
| Audit trail | `src/lib/audit.ts` + `prisma/audit-immutability.sql` | Uforanderlig logging af alle hændelser (applikations- og databaseniveau)
| Kryptering | `src/lib/crypto.ts` | AES-256-GCM kryptering af følsomme data |
| RBAC | `src/lib/rbac.ts` | 5 roller, 23 permissions |
| 2FA | `src/lib/two-factor.ts` | TOTP-baseret to-faktor autentificering |
| Process management | `ecosystem.config.js` | PM2 konfiguration (auto-restart, memory limit) |
| Audit immutability | `prisma/audit-immutability.sql` | PostgreSQL-triggere der forhindrer UPDATE/DELETE på AuditLog |
| Reverse proxy | `Caddyfile` | Caddy TLS-terminering og sikkerhedshoveder |

### 8.3 Dokumentrevision

| Version | Dato | Ændringer | Forfatter |
|---------|------|----------|-----------|
| 1.0 | 2025 | Første udgave | AlphaAi Consult ApS |
| 2.0 | 2025 | Opdateret med konkrete kode-referencer, RTO/RPO-beregninger og 6 incidentscenarier | AlphaAi Consult ApS |
| 2.1 | 2025 | Tilføjet IONOS VPS som applikationsserver/backup-lagring, AES-256-GCM backup-kryptering, dekryptering i restore-flow | AlphaAi Consult ApS |
| 2.2 | 2025 | Tilføjet database-level immutability for AuditLog (PostgreSQL-triggere), ændret FK onDelete fra SetNull til Restrict | AlphaAi Consult ApS |

### 8.4 Godkendelse

| Rolle | Navn | Dato | Underskrift |
|------|------|------|-------------|
| Direktør |Jess Christoffersen |04/06/2026 | |
| Compliance Officer | | | |
| System Administrator | | | |
| Technical Lead | | | |

---

*Dette dokument er udarbejdet af AlphaAi Consult ApS som del af compliance-dokumentationen til Erhvervsstyrelsens anmeldelse af AlphaFlow som standard bogføringssystem.*

*Beredskabsplanen testes kvartalsvis og opdateres årligt eller ved væsentlige ændringer i systemarkitekturen.*
