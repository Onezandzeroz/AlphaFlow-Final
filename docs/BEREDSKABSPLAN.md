# Beredskabsplan — AlphaFlow

**AlphaAi Consult ApS** (CVR 46312058)
**Dokumentversion:** 3.1
**Dato:** 2026
**Klassifikation:** Fortroligt — Compliance-dokumentation
**System:** AlphaFlow (`alphaai-accounting` v1.0.0) — alphaflow.dk

---

## Indholdsfortegnelse

1. [Indledning](#1-indledning)
2. [Infrastruktur-overblik](#2-infrastruktur-overblik)
3. [RTO & RPO-mål](#3-rto--rpo-mål)
4. [Backup-strategi](#4-backup-strategi)
5. [Genopretningsprocedurer](#5-genopretningsprocedurer)
6. [Incident response-procedure](#6-incident-response-procedure)
7. [Kontaktliste](#7-kontaktliste)
8. [Kommunikationsplan](#8-kommunikationsplan)
9. [Test & vedligeholdelse](#9-test--vedligeholdelse)
10. [Bilag](#10-bilag)

---

## 1. Indledning

### 1.1 Formål

Denne beredskabsplan beskriver AlphaFlows procedurer for forebyggelse, registrering, indkapsling og gendannelse ved kritiske hændelser (incidents) — herunder systemfejl, datatab, data breach, ransomware og infrastruktur-fejl.

Planen sikrer at:

- **Bogføringsdata altid kan gendannes** i overensstemmelse med BEK 97 Bilag 1 (uforanderlighed) — Lov om bogføring §13 — og BEK 97 §3 (5-års opbevaring) + §7 (backup), udstedt i medfør af Lov om bogføring §15.
- **Persondata ikke gå tabt eller kompromitteres** uden at Datatilsynet og berørte registrerede underrettes (GDPR Art. 33-34).
- **Systemets tilgængelighed genetableres** inden for definerede RTO-mål (Recovery Time Objective).
- **Alle hændelser dokumenteres** i uforanderlig audit-trail (`src/lib/audit.ts`), beskyttet mod ændring/sletning på databaseniveau af PostgreSQL-triggere (`prisma/audit-immutability.sql`).

### 1.2 Scope

Denne plan dækker hele AlphaFlow-platformen:

- AlphaFlow-applikationen (Next.js 16) på IONOS VPS.
- 5 mini-services (hermes-agent, knowledge-service, tokenpay-access, notification-ws, scanner-service).
- Neon PostgreSQL-database (primær DB).
- 2 SQLite mini-DBs (`scanner.db`, `access.db`).
- Backup-system og backup-lagring (`Tenant-Backup/`, AES-256-GCM-krypterede ZIPs).
- Upload-lagring (`uploads/`).
- Caddy reverse proxy / TLS.
- PM2 proces-manager (6 processer).
- 13 eksterne integrationer (se `LEVERANDØERSTYRING.md`).

### 1.3 Ansvarlig

| Rolle | Navn / Enhed |
|---|---|
| Dataansvarlig | AlphaAi Consult ApS (CVR 46312058) |
| Teknisk ansvarlig (App Owner) | _[Udfyldes — telefon, e-mail]_ |
| System administrator | _[Udfyldes — telefon, e-mail]_ |
| Compliance Officer / DPO | _[Udfyldes — telefon, e-mail]_ |
| Backup-ansvarlig | _[Udfyldes — telefon, e-mail]_ |

### 1.4 Lovgrundlag

| Lovkrav | Reference | Krav |
|---|---|---|
| BEK 97 §8 stk. 2 (CIA-triaden) | Sikring mod hændelig tilintetgørelse af bogføringsdata | Beredskab, backup, restore |
| BEK 97 §3 (5-års opbevaring) | Bogføringsdata skal opbevares i 5 år | Backup retention: monthly 5 år |
| BEK 97 §7 (backup) | Backup af elektronisk bogføring | AES-256-GCM backup-kryptering |
| BEK 97 §8 stk. 4 (hovedkrav 6 / krav D4) | It-sikkerhed: Beredskab og reetablering | Denne plan |
| GDPR Art. 32 | Sikkerhed i behandling af personoplysninger | Tekniske og organisatoriske foranstaltninger |
| GDPR Art. 33 | Underretning af Datatilsynet inden for 72 timer ved data breach | Afsnit 6.5 |
| GDPR Art. 34 | Underretning af berørte registrerede ved høj risiko | Afsnit 6.5 + 8 |

> Samtlige krav i BEK 97 (Kravbekendtgørelsen, BEK nr. 97 af 26. januar 2023) er udstedt i medfør af Lov om bogføring (LOV nr. 700 af 24. maj 2022) — herunder §13 og §15.

### 1.5 Relaterede dokumenter

- `RISIKOVURDERING.md` — DPIA / IT-risikovurdering (20 risici R-01..R-20).
- `UDBEDRINGSPLAN.md` — planlagte afhjælpninger for identificerede mangler.
- `ENCRYPTION.md` — krypteringsnøgler, algoritmer, key management.
- `LEVERANDØERSTYRING.md` — underbehandler-oversigt + DPA-status.
- `DATABEHANDLERAFTALE.md` — DPA-skabeloner pr. underbehandler.
- `NEON & IONOS_IT_SIKKERHED.md` — hosting-udbydere sikkerhedscertificeringer.
- `COMPLIANCE_RAPPORT.md` — samlet compliance-status.

---

## 2. Infrastruktur-overblik

Følgende komponenter skal kunne genoprettes ved en hændelse:

### 2.1 PM2-apps (6 processer)

| App-navn | Port | Teknologi | Funktion | max_memory |
|---|---|---|---|---|
| `alphaflow` | 3000 | Next.js 16 (Node) | Host-app — alle API-routes, UI, backup-scheduler (node-cron) | 1500M |
| `hermes-agent` | 3004 | Bun + Socket.IO + Prisma | AI-chat-assistent (OpenRouter LLM) | 512M |
| `knowledge-service` | 3006 | Bun + rå HTTP + Prisma + pgvector | RAG knowledge base (embeddings via OpenRouter) | 256M |
| `tokenpay-access` | 3100 | Bun + Hono + SQLite (bun:sqlite) | TokenPay adgangskontrol (.tbkey proofs) | 256M |
| `notification-ws` | 3001 | Bun + Socket.IO | Real-time notifikationer (broadcast) | 128M |
| `scanner-service` | 3005 | Python + FastAPI + SQLite (aiosqlite) | OCR + VLM (Tesseract + VLM via OpenRouter) | 512M |

Konfiguration: `ecosystem.config.example.js` (fork-mode, `autorestart:true`, `max_restarts:10`, `restart_delay:5000`, separate log-filer i `./logs/`).

### 2.2 Database-lag

| Komponent | Udbyder | Lokation | Backup-metode | RPO |
|---|---|---|---|---|
| **Neon PostgreSQL** (primær) | Neon, Inc. | EU (Frankfurt + Amsterdam) | Managed PITR (7 dage) + AlphaFlow ZIP-backups | ~0 (PITR) / ≤1t (ZIP) |
| `scanner.db` (SQLite) | IONOS VPS-disk | EU (Tyskland) | Ikke separat backup — VPS-disk-snapshot | Afhængig af VPS-snapshot |
| `access.db` (SQLite) | IONOS VPS-disk | EU (Tyskland) | Ikke separat backup — VPS-disk-snapshot | Afhængig af VPS-snapshot |

### 2.3 Fil-lagring

| Komponent | Lokation | Indhold | Backup-metode |
|---|---|---|---|
| `uploads/receipts/{companyId}/` | VPS-disk | Bilag, kvitteringer (JPEG/PNG/PDF etc.) | Kopieres til `Tenant-Backup/{companyName}/Receipts/{YYYY}/{MM}/{DD}/` ved upload + via ZIP-backup |
| `uploads/documents/{userId}/` | VPS-disk | Dokumenter (Office, PDF, CSV, XML) | Via ZIP-backup |
| `Tenant-Backup/{companyName}/{Hourly\|Daily\|Weekly\|Monthly\|Manual}/` | VPS-disk | AES-256-GCM-krypterede ZIP-backups pr. tenant | Defens-i-depth: også gendannes fra VPS-snapshot |
| `mini-services/tokenpay-access-service/data/proofs/` | VPS-disk | `.tbkey` proof-filer | Via VPS-snapshot (allerede AES-256-GCM-krypteret) |
| `logs/` | VPS-disk | PM2-log-filer pr. app | Via VPS-snapshot (best-effort) |

### 2.4 Eksterne afhængigheder

| Komponent | Udbyder | Failover-strategi |
|---|---|---|
| Reverse proxy | Caddy (self-hosted) | Genstart via PM2 / manuel `caddy run --config Caddyfile` |
| TLS-certifikater | Let's Encrypt (automatisk via Caddy) | Caddy fornyer automatisk 30 dage før udløb |
| DNS | IONOS / ekstern DNS-udbyder | _[Udfyldes]_ |
| Neon DB | Neon, Inc. | Neon har indbygget HA (multi-AZ i region); PITR 7 dage |
| OpenRouter (AI — chat, embeddings, VLM) | USA | Graceful degradation: Hermes-knowledge-base fallback, scanner OCR-only mode |

---

## 3. RTO & RPO-mål

### 3.1 Recovery Time Objective (RTO)

RTO = maksimal acceptabel tid fra hændelse til systemet er genoprettet.

| Scenarie | RTO-mål | Kommentar |
|---|---|---|
| **Kritisk funktionalitet** (login, bogføring, fakturering) | 1 time | Neon PITR eller nyeste AlphaFlow-backup-ZIP + PM2-genstart |
| **Fuld platform** (inkl. Hermes, scanner, bank) | 4 timer | Gendannelse af VPS + alle mini-services + uploads |
| **Komplet katastrofe** (VPS-tab + DB-tab) | 24 timer | Ny VPS-opsætning + DB-gendannelse fra Neon PITR + restore af `Tenant-Backup/` fra disk-snapshot |

### 3.2 Recovery Point Objective (RPO)

RPO = maksimal acceptabel datatab.

| Data-type | RPO-mål | Backup-metode | Bekræftelse |
|---|---|---|---|
| **Neon PostgreSQL-transaktioner** | ~0 (7 dage) | Neon managed PITR (Point-in-Time Recovery) | Neon dashboard + `docs/NEON & IONOS_IT_SIKKERHED.md` |
| **Tenant-data (posteringer, fakturaer, journalposter)** | ≤1 time | AlphaFlow hourly backup (`5 * * * *`) | `CronExecution`-log + `/api/backups/scheduler-status` |
| **Uploads (bilag, kvitteringer)** | ≤1 time | Kopi til `Tenant-Backup/{companyName}/Receipts/` ved upload + hourly ZIP | Fil-system-tjek |
| **SQLite mini-DBs (scanner.db, access.db)** | Afhængig af VPS-snapshot | Ingen separat backup | Accepteret — scanner.db er cache (genoprettes ved re-scan); access.db backup-frekvens vurderes separat |
| **AuditLog** | ~0 (via Neon PITR) | PostgreSQL BEFORE UPDATE/DELETE triggere | `prisma/audit-immutability.sql` |

### 3.3 RTO/RPO-justering

RTO/RPO-målene kan justeres ved:

- **Højere frekvens af hourly backups** (f.eks. hvert 15. minutt) — kræver ændring i `src/lib/backup-scheduler.ts` SCHEDULES-konstant.
- **Off-site backup-replikering** — kopiér `Tenant-Backup/` til sekundær IONOS VPS eller S3-kompatibel lagring.
- **Cross-region Neon-replika** — Neon supporterer read-replica i anden EU-region.

---

## 4. Backup-strategi

### 4.1 Backup-lag (defense-in-depth)

| Lag | Metode | Hyppighed | Retention | Ansvarlig |
|---|---|---|---|---|
| **Lag 1** | Neon managed PITR (Point-In-Time Recovery) | Kontinuerlig (WAL) | 7 dage | Neon, Inc. (managed) |
| **Lag 2** | AlphaFlow ZIP-backups (`Tenant-Backup/`) | Hourly/Daily/Weekly/Monthly | 25t–5 år | AlphaAi Consult ApS (process-intern `node-cron`) |
| **Lag 3** | VPS-disk-snapshot (IONOS) | Manuel / planlagt | Efter IONOS-policy | IONOS / AlphaAi Consult ApS |
| **Lag 4** | Manuelle backups via `/api/backups` UI | On-demand | 90 dage (Manual retention) | Bruger (OWNER/ADMIN) |

### 4.2 AlphaFlow ZIP-backup-format (Lag 2 — verificeret)

**Moduler:**
- `src/lib/backup-engine.ts` (1482 LOC): Oprettelse, gendannelse, kryptering, checksum.
- `src/lib/backup-scheduler.ts` (907 LOC): Cron-baseret automation, retry, health monitoring.
- `src/app/api/backups/` (REST API): list, create, download, restore, delete, upload-restore, scheduler-status.
- `src/components/backup/backup-page.tsx`: Bruger-grænseflade.

**Format:**
- ZIP-arkiv pr. tenant (company) med strukturerede JSON-filer (`manifest.json`, `company.json`, `accounts.json`, `transactions.json`, `invoices.json`, `journal-entries.json`, `contacts.json`, `bank-connections.json`, m.fl.).
- **Manifest v2** med versionsnummer, tenant-info, tidsstempel.
- **SHA-256-checksum** (streaming-beregnet over hele ZIP-filen).
- **AES-256-GCM-filkryptering** (`[12B IV][16B authTag][N bytes ciphertext]`-format, `.zip.enc`-suffix) med `ENCRYPTION_KEY`.
- Sikker sletning af ukrypteret original ZIP efter kryptering.
- Tenant-isolering: hver backup indeholder KUN én virksomheds data.

**Lagringslokation:** `Tenant-Backup/{companyName}/{Hourly|Daily|Weekly|Monthly|Manual}/` relativt til `process.cwd()` på IONOS VPS.

### 4.3 Cron-skema (Europe/Copenhagen)

| Cron-udtryk | Type | Tidspunkt | Retention (antal) | Retention (periode) |
|---|---|---|---|---|
| `5 * * * *` | Hourly | Hver time, minut 5 | 24 | 25 timer |
| `15 2 * * *` | Daily | Daglig kl. 02:15 | 30 | 31 dage |
| `30 3 * * 1` | Weekly | Mandag kl. 03:30 | 52 | 53 dage |
| `0 4 1 * *` | Monthly | 1. i måneden kl. 04:00 | 60 | **5 år** (BEK 97 §3 — 5-års opbevaring, udstedt i medfør af Lov om bogføring §15) |
| `0 3 * * *` | Cleanup | Daglig kl. 03:00 — sletter udløbne backups | — | — |
| On-demand | Manual | Via UI `/api/backups` eller `/api/backups/upload-restore` | 999 | 90 dage |

Timezone: `process.env.BACKUP_TIMEZONE || 'Europe/Copenhagen'`.

### 4.4 Robusthed (verificeret i `src/lib/backup-scheduler.ts`)

- **DB-baseret `CronExecution`-log:** hver cyklus persisteres, overlever restarts.
- **Startup catch-up:** oversete cron-vinduer genkendes og køres ved app-start.
- **Retry med exponential backoff:** 3 forsøg (5s, 10s, 20s).
- **Overlap guard:** `runningJobs`-Set forhindrer concurrent runs af samme job-type.
- **Per-tenant in-memory dedup:** `LAST_AUTO_BACKUP` Map forhindrer duplikerede backups.
- **`ensureInitialBackup()`:** første-data-triggeret baseline-backup når tenant først indsætter data (opretter alle 4 typer).
- **Pre-restore safety backup:** automatisk oprettes før enhver gendannelse (forhindrer tab ved fejl-restore).
- **Atomisk gendannelse:** database-transaktion med rollback ved fejl.
- **Per-tenant health monitoring:** grøn/rød indikator på `/api/backups/scheduler-status`.
- **`DISABLE_BACKUP_SCHEDULER=true`** env var — kan slås fra ved vedligeholdelse.

### 4.5 Manuelle backups (UI)

- **Opret:** `POST /api/backups` (OWNER/ADMIN, `Permission.BACKUP_CREATE`) — opretter Manual-backup med det samme.
- **Download:** `GET /api/backups/{id}/download` — returnerer AES-256-GCM-krypteret ZIP.
- **Restore:** `POST /api/backups/{id}/restore` — atomisk gendannelse via database-transaktion (foranstaltes automatisk pre-restore safety backup).
- **Upload-restore:** `POST /api/backups/upload-restore` — upload `.zip` (max 2 GB), JSZip-validering af `manifest.json`, atomisk gendannelse.
- **Delete:** `DELETE /api/backups/{id}` (OWNER, `Permission.BACKUP_DELETE`).
- **Scheduler-status:** `GET /api/backups/scheduler-status` — per-tenant cron-health.

### 4.6 Neon PITR (Lag 1 — managed)

Neon leverer indbygget Point-In-Time Recovery med op til **7 dages retention**. Aktiveres via Neon-konsol (`https://console.neon.tech`). Genopretter hele databasen til et specifikt tidspunkt (precission: sekund). Bruges ved:

- Logisk datatab (f.eks. `DELETE WHERE` med forkert betingelse).
- DB-skades-korruption.
- Mistænkt data breach (snapshot før angreb).

Bemærk: Neon PITR genopretter hele databasen, ikke enkelt-tenant. For single-tenant gendannelse bruges AlphaFlow ZIP-backup (Lag 2).

### 4.7 Backup-kryptering

- **Algoritme:** AES-256-GCM (12-byte IV, 16-byte auth-tag, 32-byte nøgle).
- **Nøgle:** `ENCRYPTION_KEY` (64-hex env var, genereres med `openssl rand -hex 32`).
- **Adskilt fra PROOF_ENCRYPTION_KEY** (som kun bruges til `.tbkey` proof-filer).
- **Ingen key rotation** (se `RISIKOVURDERING.md` R-03 + `UDBEDRINGSPLAN.md`).
- **Bemærkning:** Hvis `ENCRYPTION_KEY` kompromitteres, kan alle backup-ZIPs dekrypteres. Se genopretningsprocedure afsnit 5.5.

---

## 5. Genopretningsprocedurer

### 5.1 Database-tab (Neon PostgreSQL)

**Scenarie:** Logisk datatab (forkert `DELETE`/`UPDATE`), DB-korruption, mistænkt DB-kompromittering.

**Procedure:**

1. **Triage** — identificer hvilke tenants/data der er berørt.
2. **Foretrukken metode: Neon PITR (hvis ≤7 dage gammel tab):**
   a. Log ind på `https://console.neon.tech`.
   b. Vælg projekt → "Restore" → "Point in time".
   c. Vælg tidspunkt _før_ hændelsen (precission: sekund).
   d. Neon opretter en ny branch med gendannede data — verificér data.
   e. Skift `DATABASE_URL` i `ecosystem.config.js` til den nye branch.
   f. `pm2 restart alphaflow hermes-agent knowledge-service` — alle 3 PM2-apps der bruger Neon.
   g. Verificér applikationen fungerer (login, bogføring).
   h. Markér den gamle branch for deprecation efter 7 dage.
3. **Alternativ metode: AlphaFlow ZIP-restore (hvis nyere end 7 dage kræves):**
   a. Identificér den relevante backup-ZIP i `Tenant-Backup/{companyName}/`.
   b. Via UI: `POST /api/backups/{id}/restore` (kræver OWNER + `Permission.BACKUP_CREATE`).
      - Systemet opretter automatisk en **pre-restore safety backup** før gendannelse.
      - Gendannelse er atomisk via database-transaktion (rollback ved fejl).
   c. Eller via upload: `POST /api/backups/upload-restore` med `.zip` fil (max 2 GB).
4. **Verificér:** Sammenlign posteringer, fakturaer, audit-log med forventet tilstand.
5. **Dokumentér:** Skab `AuditLog`-post med `action: BACKUP_RESTORE` (sker automatisk via API'et).

### 5.2 VPS-fejl (IONOS)

**Scenarie:** VPS-komplet fejl (hardware, OS-korruption, hacker-kompromittering). Kræver genskabelse af hele serveren.

**Procedure:**

1. **Genskab VPS fra IONOS-snapshot** (hvis tilgængeligt):
   a. Log ind på IONOS-kontrolpanel.
   b. Vælg VPS → "Snapshots" → genskab fra nyeste rene snapshot.
   c. Verificér SSH-adgang efter genskabelse.
2. **Hvis intet snapshot:** Opsæt ny VPS:
   a. Bestil ny IONOS VPS (samme spec — CPU/RAM/disk).
   b. Vælg Ubuntu/Debian-image.
   c. Konfigurer SSH-nøgler + firewall (kun port 22, 80, 443).
3. **Klon repo:**
   ```bash
   git clone <repo-url> /opt/alphaflow
   cd /opt/alphaflow
   ```
4. **Installer dependencies:**
   ```bash
   curl -fsSL https://bun.sh/install | bash
   npm install -g pm2
   bun install
   ```
5. **Kør setup-services.sh** (engangs-setup for mini-services):
   ```bash
   bash setup-services.sh
   ```
6. **Udfyld `.env` og `ecosystem.config.js`:**
   - Kopiér fra sikker backup (`.env.backup`, `ecosystem.config.backup.js`) eller genskab manuelt.
   - **KRITISK:** Sæt `ENCRYPTION_KEY`, `PROOF_ENCRYPTION_KEY`, `DATABASE_URL`, `OPENROUTER_API_KEY` (AI-integrationer — chat, embeddings, VLM — samlet via OpenRouter), inter-service API-nøgler.
   - Erstat dev-defaults (`tokenpay-dev-key-2026`, `scanner-dev-key-2026`) med `openssl rand -hex 32`.
7. **Start PM2:**
   ```bash
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup  # konfigurer auto-start ved boot
   ```
8. **Gendan `Tenant-Backup/` og `uploads/` fra disk-backup:**
   - Hvis VPS-snapshot eksisterer — kopiér mapper til ny VPS via `rsync` eller `scp`.
   - Hvis ingen backup — gendan fra ekstern backup-lokation (_[off-site lokation udfyldes]_).
9. **Konfigurer Caddy:**
   ```bash
   cp Caddyfile /etc/caddy/Caddyfile
   systemctl restart caddy  # eller kør via PM2 / start.sh
   ```
10. **Verificér** — tjek at alle 6 PM2-apps kører:
    ```bash
    pm2 status
    curl -s http://localhost:3000/api/health
    curl -s http://localhost:3001/health
    curl -s http://localhost:3004/health   # hermes har ikke /health — brug /admin/stats med Bearer
    curl -s http://localhost:3005/health
    curl -s http://localhost:3006/health
    curl -s http://localhost:3100/health
    ```
11. **Dokumentér** — skab `AuditLog`-post + post-incident review (se afsnit 6.6).

### 5.3 App-crash (Next.js / alphaflow PM2-app)

**Scenarie:** Next.js-app crasher (OOM, unhandled exception, build-fejl).

**Procedure:**

1. **PM2 autorestart:** PM2 genstarter automatisk (`autorestart:true`, `max_restarts:10`, `restart_delay:5000`). Verificér med `pm2 status`.
2. **Hvis PM2 ikke genstarter:** Manuel genstart:
   ```bash
   pm2 restart alphaflow
   ```
3. **Tjek logs:**
   ```bash
   pm2 logs alphaflow --lines 100
   # eller specifik log-fil:
   tail -100 logs/alphaflow-out.log
   tail -100 logs/alphaflow-error.log
   ```
4. **Hvis OOM:** Forøg `max_memory_restart` i `ecosystem.config.js` (aktuelt 1500M) og investigér memory-leak.
5. **Hvis build-fejl:** Re-build:
   ```bash
   bun run build
   pm2 restart alphaflow
   ```
6. **Verificér:** `curl -s http://localhost:3000/` — forventet HTTP 200.
7. **Hvis backup-scheduler var stoppet** (kører i alphaflow-processen): Verificér at `startBackupScheduler()` kørte ved startup (`instrumentation.node.ts`). Tjek `/api/backups/scheduler-status`. Startup catch-up vil køre oversete cron-vinduer.

### 5.4 Mini-service crash

**Scenarie:** En af de 5 mini-services crasher.

**Procedure:**

1. **PM2 autorestart** — samme konfiguration som alphaflow.
2. **Identificér hvilken service:**
   ```bash
   pm2 status
   # Kig efter "errored" eller "stopped" status
   ```
3. **Manuel genstart:**
   ```bash
   pm2 restart hermes-agent     # port 3004
   pm2 restart knowledge-service  # port 3006
   pm2 restart tokenpay-access    # port 3100
   pm2 restart notification-ws    # port 3001
   pm2 restart scanner-service    # port 3005
   ```
4. **Tjek specifik log:**
   ```bash
   pm2 logs hermes-agent --lines 100
   tail -100 logs/hermes-agent-out.log
   ```
5. **Verificér health-endpoint** (hvor implementeret):
   ```bash
   curl -s http://localhost:3001/health   # notification-ws
   curl -s http://localhost:3005/health   # scanner-service
   curl -s http://localhost:3006/health   # knowledge-service
   curl -s http://localhost:3100/health   # tokenpay-access
   # Hermes har ikke /health — brug:
   curl -H "Authorization: Bearer $HERMES_ADMIN_KEY" http://localhost:3004/admin/stats
   ```
6. **Hvis Python scanner-service:** Tjek `.venv` og Python-version:
   ```bash
   cd mini-services/scanner-service
   source .venv/bin/activate
   python --version  # forventet 3.11+
   pip install -r requirements.txt
   pm2 restart scanner-service
   ```

### 5.5 ENCRYPTION_KEY kompromitteret (KRITISK)

**Scenarie:** `ENCRYPTION_KEY` (eller `PROOF_ENCRYPTION_KEY`) er kompromitteret — f.eks. via `.env`-lækage, tidligere medarbejder, log-fejl, GitHub-push.

> ⚠️ **Bemærk:** Key rotation er **ikke implementeret** i nuværende version — jf. Bilag 6 (RISIKOVURDERING.md) R-03 (restrisiko Høj) og Bilag 10 (UDBEDRINGSPLAN.md). Følgende procedure er manuel og kræver betydelig nedetid.

**Procedure (KRITISK — eskalér til Niveau 3 straks):**

1. **Isolér systemet** — sæt AlphaFlow i maintenance mode (Caddy-konfiguration eller `pm2 stop alphaflow`).
2. **Generér nye nøgler:**
   ```bash
   openssl rand -hex 32  # ny ENCRYPTION_KEY
   openssl rand -hex 32  # ny PROOF_ENCRYPTION_KEY
   ```
3. **Re-krypter alle data med nye nøgler** (MANUELE TRIN — script ikke implementeret endnu):
   - Bank-tokens (`BankConnection.accessToken/refreshToken`) — dekryptér med gammel nøgle, re-kryptér med ny.
   - TOTP-secrets (`User.twoFactorSecret`).
   - 2FA backup-koder (`User.twoFactorBackupCodes`).
   - Backup-ZIP-filer i `Tenant-Backup/` — dekryptér og re-kryptér.
   - `.tbkey` proof-filer i `mini-services/tokenpay-access-service/data/proofs/` — med `PROOF_ENCRYPTION_KEY`.
4. **Opdater `.env` + `ecosystem.config.js`** med nye nøgler.
5. **Genstart alle PM2-apps:**
   ```bash
   pm2 restart all
   ```
6. **Verificér** — test login + 2FA + bank-forbindelse + backup-restore på én tenant før fuld godkendelse.
7. **Roter alle andre secrets** (inter-service API-nøgler, eksterne API-keys).
8. **Foretag sikkerhedsgennemgang** — AuditLog-gennemgang for mistænkelig aktivitet i perioden mellem kompromittering og rotation.
9. **Underret berørte registrerede** (GDPR Art. 34 hvis høj risiko) — se afsnit 6.5 + 8.
10. **Dokumentér hændelsen** — post-incident review (se afsnit 6.6) + tilføj til `UDBEDRINGSPLAN.md` som læring.

### 5.6 Ransomware / malware på VPS

**Scenarie:** Ransomware har krypteret VPS-filer, eller malware er opdaget på VPS.

**Procedure (KRITISK — eskalér til Niveau 3 straks):**

1. **Isolér VPS:**
   - Afbryd VPS fra internettet (IONOS-kontrolpanel: "Power off" eller netværks-isolering).
   - Bevar VPS kørende til forensisk analyse (ikke slet).
2. **Eskalér til Compliance Officer + Direktør** (Niveau 3).
3. **Vurdér omfang:**
   - Er `Tenant-Backup/` krypteret? (Hvis nej: gendan fra VPS-disk).
   - Er Neon DB berørt? (Neon er cloud-baseret — sandsynligvis ikke, men verificér).
   - Er `.env`-filen lækket? (Så er `ENCRYPTION_KEY` kompromitteret — se afsnit 5.5).
4. **Gendan fra rene backups:**
   - **Database:** Neon PITR til tidspunkt _før_ hændelsen (se afsnit 5.1).
   - **Tenant-data:** Nyeste AlphaFlow-backup-ZIP (`Tenant-Backup/{companyName}/Monthly/` eller `Weekly/`).
   - **Uploads:** Kopiér fra nyeste ZIP-backup (`Tenant-Backup/{companyName}/Receipts/`).
5. **Opsæt ny VPS** (se afsnit 5.2) — opsæt IKKE på den kompromitterede VPS.
6. **Roter alle secrets** — alle env-variabler antages kompromitterede.
7. **Auditér AuditLog** — gennemgå `LOGIN_FAILED`, `DELETE_ATTEMPT`, `OVERSIGHT`, `BACKUP_RESTORE` poster i perioden før hændelsen for at identificere angrebsvektor.
8. **Underret myndigheder:**
   - **Datatilsynet** inden 72 timer (GDPR Art. 33) — se afsnit 6.5.
   - **Erhvervsstyrelsen** — ved bogføringsdata-tab eller kompromittering (BEK 97 Bilag 1 (uforanderlighed) — Lov om bogføring §13).
   - **Politi (Rigspolitiet, Center for Cyberkriminalitet)** — `www.politi.dk/NC3` eller telefon _[Udfyldes]_.
9. **Kundekommunikation** — se afsnit 8.
10. **Post-incident review** (se afsnit 6.6).

### 5.7 Mini-service DB-tab (SQLite)

**Scenarie:** `scanner.db` eller `access.db` korrumperet eller slettet.

**Procedure:**

1. **`scanner.db` (genoprettelig):**
   - Tab er _ikke kritisk_ — scanner.db er cache (SHA-256 cache-opslag, scan-job-historik).
   - Slet filen: `rm mini-services/scanner-service/data/scanner.db`
   - Genstart scanner-service: `pm2 restart scanner-service`
   - Schema auto-oprettes ved startup (`CREATE TABLE IF NOT EXISTS`).
   - Re-scan bilag hvor resultat kræves (via UI).
2. **`access.db` (kræver gendannelse):**
   - Indeholder brugere, proofs, access-log, messages — kritisk for TokenPay adgangskontrol.
   - **Backup-metode:** VPS-disk-snapshot (Lag 3).
   - Gendan fra nyeste VPS-snapshot eller genopret fra `/api/tokenpay/users`-sync fra host-app.
   - Hvis ingen backup: genopret brugere fra Neon PostgreSQL `User`-tabel; gen-aktiver `.tbkey` proofs fra `mini-services/tokenpay-access-service/data/proofs/` (filer er AES-256-GCM-krypteret uafhængigt af access.db).

### 5.8 Caddy / TLS-fejl

**Scenarie:** Caddy crasher, TLS-certifikat udløber, reverse proxy virker ikke.

**Procedure:**

1. **Caddy crash:**
   ```bash
   pm2 restart caddy  # hvis Caddy kører via PM2
   # eller:
   systemctl restart caddy
   # eller:
   cd /opt/alphaflow && ./start.sh  # genstarter Caddy via start.sh
   ```
2. **TLS-certifikat udløber:**
   - Caddy fornyer automatisk Let's Encrypt-certifikater 30 dage før udløb.
   - Hvis fornyelse fejler: Tjek DNS-records for `alphaflow.dk` + `www.alphaflow.dk` peger på VPS-IP.
   - Tjek port 80 tilgængelig (Let's Encrypt HTTP-01 challenge).
   - Se Caddy-log: `tail -100 /var/log/caddy/alphaflow-access.log`.
3. **DNS-fejl:** Kontakt DNS-udbyder (_[Udfyldes]_).

---

## 6. Incident response-procedure

### 6.1 Trin 1 — Opdagelse & triage

**Overvågningskilder:**

| Kilde | Endpoint / kommando | Frekvens |
|---|---|---|
| PM2 status | `pm2 status` | Kontinuerlig (PM2 monitoren) |
| PM2 logs | `pm2 logs <app> --lines 100` eller `logs/<app>-error.log` | Ved alarm |
| Backup-scheduler health | `GET /api/backups/scheduler-status` (per-tenant grøn/rød) | Daglig |
| CronExecution-log | DB-tabel — tjek seneste cyklus | Daglig |
| AuditLog-anomalier | `GET /api/audit-logs?action=LOGIN_FAILED&...` | Daglig |
| Neon dashboard | `https://console.neon.tech` — DB-health, queries, connections | Ved mistanke |
| IONOS VPS-monitor | IONOS-kontrolpanel — CPU/RAM/disk/netværk | Daglig |
| Bruger-rapporter | Support-email / in-app kontakt | Kontinuerlig |

**Triage-spørgsmål:**

1. Er persondata berørt? (GDPR-relevant → Niveau 3).
2. Er bogføringsdata berørt? (BEK 97 / Lov om bogføring-relevant → Niveau 3).
3. Er systemet utilgængeligt? (RTO-tæller starter).
4. Er kompromitteret kilde identificeret?
5. Er hændelsen begrænset til én tenant eller platform-bred?

### 6.2 Trin 2 — Inddæmning

1. **Isolér berørte systemer** — `pm2 stop <app>` eller IONOS-netværks-isolering.
2. **Revoke sessions** — hvis auth-system kompromitteret, gennemtving password-reset for berørte brugere (invaliderer alle sessioner).
3. **Bloker angriber-IP** — IONOS-firewall eller Caddy-konfiguration.
4. **Deaktiver berørte integrationer** — f.eks. `STORECOVE_API_KEY` hvis webhook misbruges.
5. **Bevar bevismateriale** — screenshot af PM2-status, log-uddrag, AuditLog-export (`/api/audit-logs`).
6. **Aktivér maintenance mode** — Caddy returnerer 503 for alle requests undtagen `/api/health`.

### 6.3 Trin 3 — Eradication

1. **Identificér root cause** — log-analyse, AuditLog-gennemgang, kode-review.
2. **Patch sårbarheden** — hotfix-deploy via `git pull` + `bun run build` + `pm2 restart alphaflow`.
3. **Fjern angriberens adgang** — slet ondsindede brugere/sessions, rotate kompromitterede secrets.
4. **Opdater security-kontroller** — se `RISIKOVURDERING.md` + `UDBEDRINGSPLAN.md`.

### 6.4 Trin 4 — Genopretning

Se afsnit 5 (Genopretningsprocedurer) for specifikke scenarier.

**Verifikation efter genopretning:**

- `pm2 status` — alle 6 apps online.
- `curl -s http://localhost:3000/api/health` — HTTP 200.
- Test login + 2FA for test-bruger.
- Test bogføring (opret test-postering).
- Test fakturering (opret DRAFT-faktura).
- Verificér backup-scheduler kører: `/api/backups/scheduler-status`.
- Verificér AuditLog registrerer handlinger.

### 6.5 Trin 5 — Notifikation

| Modtager | Frist | Betingelse | Kanal |
|---|---|---|---|
| **Datatilsynet** (GDPR Art. 33) | ≤ 72 timer fra opdagelse | Ved "persondatakompromittering" der udgør en risiko for borgernes rettigheder og friheder | `www.datatilsynet.dk/indbrud` — elektronisk indberetningsformular |
| **Berørte registrerede** (GDPR Art. 34) | Uden unødig forsinkelse | Ved "høj risiko" for borgernes rettigheder og friheder (f.eks. krypterede persondata, finansielle data, identitetstyveri-risiko) | E-mail via `/api/notifications/owner` eller manuel udsendelse |
| **Erhvervsstyrelsen** | Straks | Ved bogføringsdata-tab, mistænkt manipulation, eller kompromittering af bogføringssystem | _[Udfyldes — telefon / e-mail]_ |
| **Politi (NC3)** | Efter behov | Ved cyberangreb, ransomware, data breach | `www.politi.dk/NC3` eller _[Udfyldes — telefon]_ |
| **Underbehandlere** | Straks | Hvis underbehandler-komponent berørt (OpenRouter/Storecove/Frisbii/Neon/IONOS) | Se kontaktliste afsnit 7 |
| **Kunder (tenants)** | Uden unødig forsinkelse | Ved data breach der berører deres tenant-data | E-mail + in-app notifikation |
| **Offentlighed / medier** | Ved behov | Ved store hændelser med offentlig interesse | Se kommunikationsplan afsnit 8 |

**Datatilsynet-indberetning skal indeholde:**

1. Beskrivelse af hændelsens karakter.
2. Omfang (antal berørte registrerede, antal poster).
3. Sandsynlig konsekvens.
4. Foranstaltninger truffet eller planlagt (inkl. afhjælpning).
5. Kontaktperson hos AlphaAi Consult ApS (DPO).
6. Hvis ikke alle oplysninger kendes — foreløbig indberetning med løfte om opfølgning.

### 6.6 Trin 6 — Post-incident review

1. **Root cause analysis (RCA)** — identificer primær og bidragende årsager.
2. **Timeline** — rekonstruér hændelsesforløb (fra første indikator til genopretning).
3. **Konsekvens-vurdering** — hvilke data berørt, antal brugere, nedetid.
4. **Erfarer-læringer** — hvad fungerede, hvad fejlede.
5. **Opdatering af dokumenter** — `RISIKOVURDERING.md`, `BEREDSKABSPLAN.md`, `UDBEDRINGSPLAN.md`.
6. **Implementering af forbedringer** — f.eks. tilføj nye kontroller, ændr overvågning, opdater procedurer.
7. **Dokumentér i AuditLog** — `action: BACKUP_RESTORE` eller ny `AuditAction`-type (f.eks. `INCIDENT_RESOLVED`).
8. **Gennemgå med team** — inden 2 uger efter hændelsen.

---

## 7. Kontaktliste

> **VIGTIGT:** Felter markeret med _[Udfyldes]_ skal udfyldes før dokumentet tages i brug. Opbevar kontaktlisten også i offline-format (udprintet) i tilfælde af system-nedetid.

### 7.1 AlphaAi Consult ApS — interne kontakter

| Rolle | Navn | Telefon (24/7) | E-mail | Backup-kontakt |
|---|---|---|---|---|
| Teknisk ansvarlig (App Owner) | _[Udfyldes]_ | _[Udfyldes]_ | _[Udfyldes]_ | _[Udfyldes]_ |
| System administrator | _[Udfyldes]_ | _[Udfyldes]_ | _[Udfyldes]_ | _[Udfyldes]_ |
| Compliance Officer / DPO | _[Udfyldes]_ | _[Udfyldes]_ | _[Udfyldes]_ | _[Udfyldes]_ |
| Backup-ansvarlig | _[Udfyldes]_ | _[Udfyldes]_ | _[Udfyldes]_ | _[Udfyldes]_ |
| Direktør (Niveau 3 eskalering) | _[Udfyldes]_ | _[Udfyldes]_ | _[Udfyldes]_ | _[Udfyldes]_ |

### 7.2 Hosting-udbydere

| Udbyder | Formål | Support-telefon | Support-e-mail | Kontrakt-nr. | SLA |
|---|---|---|---|---|---|
| **IONOS SE** | VPS-hosting + backup-lagring | _[Udfyldes — IONOS Cloud support]_ | _[Udfyldes]_ | _[Udfyldes]_ | _[Udfyldes]_ |
| **Neon, Inc.** | PostgreSQL managed DB | _[Udfyldes — Neon support]_ | support@neon.tech | _[Udfyldes]_ | _[Udfyldes]_ — Neon PITR 7d |

### 7.3 Myndigheder

| Myndighed | Formål | Telefon | E-mail / URL | Frist |
|---|---|---|---|---|
| **Datatilsynet** | GDPR Art. 33 underretning ved data breach | +45 33 17 33 33 | `www.datatilsynet.dk/indbrud` | ≤ 72 timer |
| **Erhvervsstyrelsen** | BEK 97 Bilag 1 (uforanderlighed) — Lov om bogføring §13 — underretning | +45 35 29 10 00 | _[Udfyldes — Erhvervsstyrelsen kontakt]_ | Straks |
| **Politi (NC3)** | Cyberkriminalitet | +45 45 86 14 48 | `www.politi.dk/NC3` | Efter behov |

### 7.4 Underbehandlere (med data ud af EU)

| Underbehandler | Formål | Lokation | Support-e-mail | DPA-status |
|---|---|---|---|---|
| **OpenRouter, Inc.** | AI-tjenester — Hermes chat LLM, embeddings (RAG), scanner VLM. OpenRouter videresender til relevante model-udbydere (OpenAI, Anthropic, Meta m.fl.) per GDPR Art. 28(4). | USA | `support@openrouter.ai` | _[SCC+TIA påkrævet — se Bilag 17 (DPA — OpenRouter) og Bilag 12 (BILAG_OVERSIGT.md) afsnit 3]_ |

### 7.5 Underbehandlere (EU-baserede)

| Underbehandler | Formål | Lokation | Support-e-mail | DPA-status |
|---|---|---|---|---|
| **Storecove B.V.** | Peppol Access Point (e-fakturering) | Holland | `support@storecove.com` | _[Udfyldes — DPA på plads?]_ |
| **Frisbii / Billwerk+ Reepay** | Abonnementsbetalinger | Tyskland | `support@frisbii.com` | _[Udfyldes — DPA på plads?]_ |
| **Skattestyrelsen (SKAT)** | Momsangivelse | DK | `kontakt@skat.dk` | Myndighed — ingen DPA krævet |
| **Erhvervsstyrelsen (VIRK/CVR)** | CVR-opslag | DK | `kontakt@erst.dk` | Myndighed — ingen DPA krævet |
| **Simply / Brevo** | SMTP-email | DK / FR | `support@simply.dk` / `contact@brevo.com` | _[Udfyldes — DPA på plads?]_ |

---

## 8. Kommunikationsplan

### 8.1 Interne meddelelser (team)

**Kanal:** Slack / e-mail / telefon (Niveau 1-3 eskalering).

**Skabelon — intern hændelsesmeddelelse:**

```
TIL: AlphaAi tekniske team
FRA: [Teknisk ansvarlig]
DATO: [YYYY-MM-DD HH:MM]
EMNE: [INCIDENT] [P1/P2/P3] — [kort beskrivelse]

Hvad: [beskriv hændelsen kort]
Hvornår opdaget: [YYYY-MM-DD HH:MM]
Hvad berøres: [systemer/tenants/data]
Nuværende status: [under efterforskning / indkapslet / genoprettet]
RTO-tæller: [startet / stoppet]
Eskaleringsniveau: [1 / 2 / 3]
Ansvarlig: [navn]

Næste opdatering: [HH:MM]
```

### 8.2 Eksterne meddelelser — kunder (tenants)

**Kanal:** E-mail via `/api/notifications/owner` (bulk-udsendelse) eller manuel udsendelse via SMTP.

**Skabelon — kundemeddelelse (data breach):**

```
TIL: [tenant owner e-mail]
FRA: AlphaAi Consult ApS <[support-email]>
EMNE: Sikkerhedshændelse vedrørende din AlphaFlow-konto

Kære [Brugernavn],

Vi kontakter dig for at informere om en sikkerhedshændelse der kan berøre dine data i
AlphaFlow.

Hvad er sket:
[Beskriv hændelsen kort og præcist — f.eks. "en uautoriseret tredjepart fik adgang
til din virksomheds posteringer i perioden XX til YY"]

Hvilke data er berørt:
[Specifik liste — f.eks. "virksomhedsnavn, CVR, posteringer, fakturaer. Adgangskoder
var krypteret (bcrypt) og ikke eksponeret. Bank-tokens var AES-256-GCM-krypteret."]

Hvad har vi gjort:
- [Indkapslet hændelsen]
- [Gendannet data fra backup pr. YYYY-MM-DD]
- [Roteret adgangskoder og session-tokens]
- [Underrettet Datatilsynet pr. YYYY-MM-DD]
- [Implementeret følgende forbedringer: ...]

Hvad skal du gøre:
- [Skift dit AlphaFlow-password]
- [Verificér dine posteringer og fakturaer]
- [Kontakt os ved uventet aktivitet]

Vi beklager ulejligheden og arbejder på at forhindre gentagelse.

Med venlig hilsen,
[Navn], [Titel]
AlphaAi Consult ApS
[support-email] | [telefon]
```

### 8.3 Eksterne meddelelser — Datatilsynet (GDPR Art. 33)

**Kanal:** Elektronisk indberetningsformular på `www.datatilsynet.dk/indbrud`.

**Skabelon — Datatilsynet-indberetning:**

```
1. Dataansvarlig: AlphaAi Consult ApS, CVR 46312058
2. Kontaktperson: Jess Martin Christoffersen, 61 73 60 76, alphaaiconsult@gmail.com
3. Dato for hændelse: [YYYY-MM-DD HH:MM]
4. Dato for opdagelse: [YYYY-MM-DD HH:MM]
5. Beskrivelse af hændelsen:
   [Detaljeret beskrivelse — hvad, hvornår, hvordan]
6. Kategorier af berørte persondata:
   [f.eks. identitetsdata, finansielle data, adgangskoder]
7. Kategorier af berørte registrerede:
   [f.eks. AlphaFlow-brugere, kunder hos vores tenants]
8. Antal berørte registrerede: [antal]
9. Sandsynlig konsekvens:
   [f.eks. identitetstyveri-risiko, finansielt svindel-risiko]
10. Foranstaltninger truffet:
    [f.eks. indkapsling, gendannelse fra backup, password-reset, nøglerotation]
11. Foranstaltninger planlagt:
    [f.eks. implementering af CSP-header, antivirus-scanning]
12. Har underbehandlere underrettet: [JA/NEJ — hvem]
13. Er berørte registrerede underrettet (Art. 34): [JA/NEJ — begrundelse]
```

### 8.4 Eksterne meddelelser — Erhvervsstyrelsen (BEK 97 / Lov om bogføring)

**Kanal:** Telefon + e-mail (se kontaktliste afsnit 7.3).

**Indhold:** Samme struktur som Datatilsynet, men med fokus på bogføringsdata:

- Hvilke bogføringsdata berørt (posteringer, journalposter, fakturaer, momsangivelser).
- Backup-status og gendannelsesplan.
- Immutability-status (AuditLog-integritet).
- Plan for at sikre BEK 97 Bilag 1 (uforanderlighed) — Lov om bogføring §13 — overholdelse fremadrettet.

### 8.5 Eksterne meddelelser — offentlighed / medier

**Kanal:** Pressemeddelelse via AlphaAi Consult ApS hjemmeside + evt. presse-kontakt.

**Principper:**

- Vær transparent — men undgå at afsløre tekniske detaljer der kan udnyttes af angribere.
- Fokuser på hvad AlphaAi gør for at håndtere hændelsen.
- Henvis til Datatilsynet-indberetning for formelle detaljer.
- Designér én talsperson ( Direktør / DPO).

---

## 9. Test & vedligeholdelse

### 9.1 Årlig DR-test (Disaster Recovery)

**Frekvens:** Årligt (senest 12 måneder efter forrige test).

**Test-scenarier:**

1. **Database-gendannelse (Neon PITR):** Gendan til et test-tidspunkt i en staging-branch; verificér data-integritet.
2. **Backup-restore (AlphaFlow ZIP):** Upload-restore af en `.zip` fil via `/api/backups/upload-restore` til staging-miljø; verificér at alle tenant-data genskabes korrekt.
3. **VPS-genopretning:** (Hvis budget tillader) genskab VPS fra IONOS-snapshot til test-VPS; verificér at alle 6 PM2-apps starter korrekt.
4. **ENCRYPTION_KEY rotation-test:** I staging — udfør manuel re-encryption-procedure (se afsnit 5.5) og verificér at alle data forbliver tilgængelige.
5. **Mini-service crash-test:** Stop hver mini-service individuelt; verificér at PM2 autorestart virker; verificér downstream-effekter.

**Dokumentation:** Hver test dokumenteres med:
- Dato og deltager-liste.
- Scenarie og forventet resultat.
- Faktisk resultat (inkl. afvigelser).
- RTO-måling (faktisk tid til genopretning).
- Læringer og opdateringer til denne plan.

### 9.2 Kvartalsvis review

**Frekvens:** Kvartalsvis (4 gange årligt).

**Review-aktiviteter:**

1. **Kontaktliste opdatering** — verificér at alle telefonnumre/e-mails stadig er gyldige.
2. **PM2-app status** — gennemgå logs for tilbagevendende fejl.
3. **Backup-scheduler health** — tjek `/api/backups/scheduler-status` for grøn/rod-status pr. tenant.
4. **AuditLog-anomalier** — gennemgå `LOGIN_FAILED`, `DELETE_ATTEMPT`, `OVERSIGHT` poster.
5. **Neon dashboard** — DB-health, forbindelses-antal, langsomme queries.
6. **IONOS VPS-ressourceforbrug** — CPU/RAM/disk.
7. **Certifikat-status** — verificér at TLS-certifikat ikke udløber inden for 30 dage.
8. **Opdatering af `UDBEDRINGSPLAN.md`** — status på planlagte afhjælpninger fra `RISIKOVURDERING.md`.

### 9.3 Ved infrastruktur-ændringer

**Beredskabsplanen opdateres straks ved:**

- Tilføjelse/fjernelse af mini-service.
- Tilføjelse/fjernelse af underbehandler.
- Migration til ny DB-udbyder / VPS-udbyder.
- Implementering af ny auth-mekanisme (f.eks. MitID, SSO).
- Implementering af ny krypteringsnøgle / key rotation.
- Ændringer i RTO/RPO-mål.
- Ændringer i backup-retention-politik.
- Efter enhver større hændelse (post-incident review → opdatering).

### 9.4 Ansvar for vedligeholdelse

| Aktivitet | Ansvarlig | Frekvens |
|---|---|---|
| Årlig DR-test | Teknisk ansvarlig | Årlig |
| Kvartalsvis review | System administrator | Kvartalvis |
| Kontaktliste-opdatering | Compliance Officer | Kvartalvis |
| Plan-revision efter infra-ændring | Teknisk ansvarlig | Ved behov |
| Plan-revision efter incident | Compliance Officer | Efter hver hændelse |

---

## 10. Bilag

### Bilag A — PM2-kommandoer (genveje)

```bash
# Status over alle 6 apps
pm2 status

# Logs
pm2 logs                                       # alle apps
pm2 logs alphaflow --lines 100                 # specifik app
pm2 logs alphaflow --err --lines 100           # kun errors
tail -f logs/alphaflow-out.log                 # direkte fra fil

# Genstart
pm2 restart alphaflow                          # en app
pm2 restart all                                # alle apps
pm2 reload alphaflow                           # zero-downtime reload (hvis cluster-mode)

# Stop / start
pm2 stop alphaflow
pm2 start alphaflow
pm2 start ecosystem.config.js                  # start alle apps fra config

# Konfiguration
pm2 save                                       # gem nuværende proces-liste
pm2 startup                                    # konfigurer auto-start ved boot
pm2 delete alphaflow                           # fjern fra PM2-liste

# Resource-overvågning
pm2 monit                                      # interaktiv monitor
pm2 list                                       # tabelleret status
```

### Bilag B — Neon-konsol URL

- **Login:** `https://console.neon.tech`
- **Projekt:** _[Udfyldes — Neon project ID]_
- **PITR-restore:** Vælg projekt → "Restore" → "Point in time" → vælg tidspunkt → opret ny branch.
- **Support:** `support@neon.tech` / `https://neon.tech/docs/introduction/support`

### Bilag C — Backup-API-endpoints

| Endpoint | Metode | Auth | Formål |
|---|---|---|---|
| `/api/backups` | GET | OWNER/ADMIN, `Permission.BACKUP_READ` | List backups for aktiv tenant |
| `/api/backups` | POST | OWNER/ADMIN, `Permission.BACKUP_CREATE` | Opret Manual backup |
| `/api/backups/{id}` | GET | OWNER, `Permission.BACKUP_READ` | Hent backup-metadata |
| `/api/backups/{id}/download` | GET | OWNER, `Permission.BACKUP_READ` | Download AES-256-GCM-krypteret ZIP |
| `/api/backups/{id}/restore` | POST | OWNER, `Permission.BACKUP_CREATE` | Atomisk gendannelse (med pre-restore safety backup) |
| `/api/backups/{id}` | DELETE | OWNER, `Permission.BACKUP_DELETE` | Slet backup |
| `/api/backups/upload-restore` | POST | OWNER, `Permission.BACKUP_CREATE` | Upload `.zip` (max 2 GB) og gendan atomisk |
| `/api/backups/scheduler-status` | GET | OWNER, `Permission.BACKUP_READ` | Per-tenant cron-health (grøn/rød) |

### Bilag D — Log-fil-stier

| Log-fil | App | Indhold |
|---|---|---|
| `logs/alphaflow-out.log` | alphaflow (Next.js) | stdout — API-logs, audit-logs, backup-scheduler-logs |
| `logs/alphaflow-error.log` | alphaflow | stderr — fejl, stack-traces |
| `logs/hermes-agent-out.log` | hermes-agent | Socket.IO events, OpenRouter-kald, reminders |
| `logs/knowledge-service-out.log` | knowledge-service | Embeddings, RAG-queries |
| `logs/tokenpay-access-out.log` | tokenpay-access | Proof-activation, access-log, cron-cyklus |
| `logs/notification-ws-out.log` | notification-ws | Broadcast-events, socket-connections |
| `logs/scanner-service-out.log` | scanner-service | OCR-jobs, VLM-kald |
| `/var/log/caddy/alphaflow-access.log` | Caddy | HTTP-access-logs (roll_size 50mb, roll_keep 5) |
| IONOS VPS syslog | OS | `/var/log/syslog`, `/var/log/auth.log` |

### Bilag E — Dashboard / overvågning URLs

| URL | Formål |
|---|---|
| `https://alphaflow.dk/api/health` | Host-app health-check |
| `https://alphaflow.dk/api/backups/scheduler-status` | Backup-scheduler health (per-tenant) |
| `https://console.neon.tech` | Neon DB dashboard |
| IONOS-kontrolpanel | VPS-status, snapshots, netværk |
| PM2 monit (`pm2 monit` i SSH) | Real-time proces-overvågning |

### Bilag F — Dokumenthistorik

| Version | Dato | Ændring | Ansvarlig |
|---|---|---|---|
| 1.0 | 2025 | Første version (generisk beredskabsplan). | AlphaAi Consult ApS |
| 2.0 | 2025-06 | Tilføjede PM2-kommandoer, RTO/RPO-mål. | AlphaAi Consult ApS |
| 2.4 | 2026-06 | Mindre opdateringer. | AlphaAi Consult ApS |
| **3.0** | **2026** | **Fuld omskrivning baseret på faktisk infrastruktur (P1-INT/P1-SVC-b/P1-SVC-a). Tilføjede: 6 PM2-apps detaljeret, backup-strategi med Lag 1-4, 8 genopretningsprocedurer (DB-tab/VPS-fejl/App-crash/Mini-service-crash/ENCRYPTION_KEY-kompromitteret/Ransomware/SQLite-tab/Caddy-fejl), 6-trins incident response-procedure, kontaktliste med underbehandlere, kommunikationsplan med skabeloner, årlig DR-test + kvartalsvis review.** | **AlphaAi Consult ApS — Doc-updater D5** |
| **3.1** | **2026** | **AI-konsolidering (Task C3): Verificeret at OpenRouter er AlphaFlows eneste AI-underbehandler (OpenAI/Anthropic fjernet som selvstændige underbehandlere per GDPR Art. 28(4)). Antal eksterne integrationer opdateret fra 15 til 13. Bilag 17 (konsolideret AI-DPA — dækker chat LLM + embeddings + VLM) reference verificeret i §7.4.** | **AlphaAi Consult ApS — Task C3** |
