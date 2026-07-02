# LEVERANDØRSTYRING — AlphaFlow

**AlphaAi ApS**
**CVR: 46312058**
**Dokumentversion:** 3.0
**Dato:** 08.06.2026
**Klassifikation:** Fortroligt — Compliance-dokumentation
**Ansvarlig:** AlphaAi ApS Compliance Officer

---

## Indholdsfortegnelse

1. [Indledning](#1-indledning)
2. [Klassifikation af leverandører](#2-klassifikation-af-leverandører)
3. [Komplet leverandørregister](#3-komplet-leverandørregister)
4. [Due diligence-proces](#4-due-diligence-proces)
5. [USA-overførsler — særlig vurdering (TIA)](#5-usa-overførsler--særlig-vurdering-tia)
6. [Løbende overvågning](#6-løbende-overvågning)
7. [Berørte leverandører ved incident](#7-berørte-leverandører-ved-incident)
8. [Udskiftning af leverandører](#8-udskiftning-af-leverandører)
9. [Konklusion](#9-konklusion)

---

## 1. Indledning

### 1.1 Formål

Dette dokument beskriver AlphaAi ApS' proces for styring af tekniske leverandører og underbehandlere i AlphaFlow-platformen, i overensstemmelse med:

- **Hovedkrav nr. 2 (It-sikkerhed)** — krav D3 (Leverandørstyring) fra Erhvervsstyrelsens tjekliste for anmeldelse af standard bogføringssystemer.
- **Bogføringsloven § 10** — krav om at data behandles sikkert og fortroligt.
- **GDPR artikel 28** — krav til databehandleraftaler og underbehandlere.
- **GDPR artikel 44-49 (Kapitel V)** — krav til tredjelandsoverførsler.
- **Bekendtgørelse nr. 98 af 15. februar 2023 (BEK 98)** — tekniske krav til elektronisk bogføringssystem.

### 1.2 Anvendelsesområde

Dette dokument gælder for alle eksterne leverandører, der leverer it-tjenester, infrastruktur, softwarekomponenter eller datahåndtering til AlphaFlow-systemet. Dokumentet dækker både:

- **Direkte underbehandlere** (databehandlere jf. GDPR art. 28) — Neon, IONOS, Storecove, Frisbii, OpenAI, OpenRouter, Anthropic, Simply/Brevo.
- **Myndighedsmodtagere** — SKAT, Erhvervsstyrelsen (ikke underbehandlere, men modtagere af data i henhold til lovpligtige forpligtelser).
- **Interne sub-systemer** — tokenpay-access, scanner-service, notification-ws, knowledge-service, hermes-agent (kører på AlphaAi's egen infrastruktur, ikke selvstændige underbehandlere).
- **Implementerede men IKKE aktive integrationer** — bank-API'er (stub-only), z-ai-web-dev-sdk (sandbox-only).

### 1.3 Ansvarlig

| Rolle | Hos AlphaAi ApS |
|-------|-----------------|
| **Dataansvarlig (for AlphaAi's interne drift)** | AlphaAi ApS, Direktør: Jess Christoffersen |
| **Databehandler (for kunders data i AlphaFlow)** | AlphaAi ApS |
| **Compliance Officer** | [Indsættes] |
| **System Administrator** | Jess Christoffersen (61 73 60 76) |
| **DPO / privacy-kontakt** | alphaaiconsult@gmail.com |

### 1.4 Definitioner

| Begreb | Definition |
|--------|-----------|
| **Leverandør** | Ekstern part, der leverer en it-tjeneste eller infrastruktur til AlphaFlow. |
| **Underbehandler (data processor)** | Part, der behandler personoplysninger på vegne af AlphaAi ApS (som databehandler) — jf. GDPR art. 28(2) og (4). |
| **Myndighedsmodtager** | Offentlig myndighed, der modtager data i henhold til lovpligtige forpligtelser (ikke underbehandler). |
| **Internt sub-system** | Komponent, der kører på AlphaAi's egen infrastruktur og er en integreret del af AlphaFlow-platformen. |
| **Tredjeland** | Land uden for EU/EØS — jf. GDPR kapitel V. |
| **SCC** | Standard Contractual Clauses — Kommissionens gennemførelsesafgørelse (EU) 2021/914. |
| **TIA** | Transfer Impact Assessment — vurdering af tredjeland-risiko. |

### 1.5 Retningslinjer for udvælgelse og styring

AlphaAi ApS' overordnede principper for leverandørstyring:

1. **EU-first:** Foretrækkes EU/EØS-baserede udbydere. USA-overførsel undgås hvor muligt.
2. **Minimization:** Send kun de data, der er strengt nødvendige for ydelsen (jf. `HermesAgent.dataAccessEnabled` opt-in default false).
3. **Transparens:** Kunde underrettes om alle underbehandlere og ændringer.
4. **Sikkerhedscertificering:** Foretrækkes SOC 2 Type II, ISO 27001, C5 eller tilsvarende.
5. **Loven foran GDPR:** Bogføringslovens 5-års opbevaringspligt har forrang over GDPR's sletningsret.

---

## 2. Klassifikation af leverandører

### 2.1 Kategorisering

AlphaFlows leverandører klassificeres i tre niveauer baseret på risiko for kunders persondata og bogføringsdata:

| Kategori | Definition | Eksempler |
|----------|------------|-----------|
| **Kritisk — Infrastruktur** | Underbehandlere der lagrer eller behandler alle tenant-data, og hvis svigt eller kompromittering vil kunne medføre tab af alle kunders data. | Neon (DB), IONOS (VPS+backup) |
| **Kritisk — AI med persondata** | Underbehandlere der modtager persondata og er placeret i tredjeland (USA). Kræver SCC + TIA. | OpenAI, OpenRouter, Anthropic |
| **Ikke-kritisk — EU-baseret tjeneste** | Underbehandlere der modtager begrænsede data og er placeret i EU. | Storecove, Frisbii, Simply/Brevo |
| **Myndighed** | Offentlige myndigheder — ikke underbehandlere, men modtagere. | SKAT, Erhvervsstyrelsen |
| **Internt sub-system** | Kører på AlphaAi's egen infrastruktur. Ikke selvstændig leverandør. | tokenpay-access, scanner-service, notification-ws, knowledge-service, hermes-agent |
| **Inaktiv** | Implementeret i kode, men ikke aktiv i produktion. | Bank-API'er (stub), z-ai-web-dev-sdk (sandbox) |

### 2.2 Kritikalitetsvurdering

| Leverandør | Kategori | Begrundelse |
|-----------|----------|-------------|
| Neon PostgreSQL | Kritisk — Infrastruktur | Primær database for alle kunders data. Tab = total datatab. |
| IONOS VPS | Kritisk — Infrastruktur | Applikationsserver + backup-lagring. Tab = nedetid + backup-tab. |
| OpenAI | Kritisk — AI USA | Persondata sendes til USA. Kræver SCC + TIA. |
| OpenRouter | Kritisk — AI USA | Persondata sendes til USA. Kræver SCC + TIA. |
| Anthropic | Kritisk — AI USA | Billeder (potentielt persondata) sendes til USA. Kræver SCC + TIA. |
| Storecove | Ikke-kritisk — EU | B2B e-fakturering, EU-baseret. |
| Frisbii / Flatpay | Ikke-kritisk — EU | Abonnementsbetaling, EU-baseret, begrænsede data. |
| Simply / Brevo | Ikke-kritisk — EU | SMTP, EU-baseret. |
| SKAT | Myndighed | Modtager af momsangivelse. |
| Erhvervsstyrelsen (VIRK/CVR) | Myndighed | Modtager af CVR-opslag. |
| tokenpay-access-service | Intern | Kører på IONOS VPS. |
| scanner-service | Intern | Kører på IONOS VPS. Anthropic kaldes kun ved VLM-fallback. |
| notification-ws-service | Intern | Kører på IONOS VPS. In-memory only. |
| knowledge-service | Intern | Kører på IONOS VPS. OpenAI kaldes kun for embeddings. |
| hermes-agent | Intern | Kører på IONOS VPS. OpenRouter kaldes kun for chat. |

### 2.3 Behandlingsfordeling

```
┌─────────────────────────────────────────────────────────────┐
│  KUNDE (dataansvarlig)                                       │
│   ↓ indtaster data                                          │
├─────────────────────────────────────────────────────────────┤
│  AlphaAi ApS (databehandler)                                │
│   ├── AlphaFlow Next.js app (port 3000)                     │
│   ├── hermes-agent (port 3004) [intern]                     │
│   ├── knowledge-service (port 3006) [intern]                │
│   ├── scanner-service (port 3005) [intern]                  │
│   ├── tokenpay-access (port 3100) [intern]                  │
│   ├── notification-ws (port 3001) [intern]                  │
│   ↓ kalder eksternt                                          │
├─────────────────────────────────────────────────────────────┤
│  UNDERBEHANDLERE (EU)                                        │
│   ├── Neon (Frankfurt + Amsterdam) — DB                     │
│   ├── IONOS (Tyskland) — VPS + backup                       │
│   ├── Storecove (Holland) — e-fakturering                   │
│   ├── Frisbii (Tyskland) — abonnementsbetaling              │
│   └── Simply/Brevo (DK/FR) — SMTP                           │
├─────────────────────────────────────────────────────────────┤
│  UNDERBEHANDLERE (USA — SCC + TIA påkrævet)                  │
│   ├── OpenAI — embeddings (RAG)                              │
│   ├── OpenRouter — LLM chat (Hermes)                         │
│   └── Anthropic — VLM (scanner-service fallback)             │
├─────────────────────────────────────────────────────────────┤
│  MYNDIGHEDSMODTAGERE (ikke underbehandlere)                  │
│   ├── SKAT — momsangivelse                                  │
│   └── Erhvervsstyrelsen/VIRK — CVR-opslag                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Komplet leverandørregister

Dette afsnit indeholder den komplette, verificerede liste over alle 15 integrationer i AlphaFlows kodebase (jf. P1-INT-analysen).

### 3.1 Neon PostgreSQL — Database

| Felt | Værdi |
|------|-------|
| **#** | 1 |
| **Navn** | Neon PostgreSQL |
| **Juridisk enhed** | Neon, Inc. |
| **Lokation (HQ)** | USA (San Francisco, CA) |
| **Lokation (datacenter)** | EU — Frankfurt (AWS eu-central-1) + Amsterdam (AWS eu-west-1) ifølge `docs/NEON & IONOS_IT_SIKKERHED.md` |
| **Formål i AlphaFlow** | Primært datalager — PostgreSQL serverless med pgvector-udvidelse til Hermes Knowledge RAG. Lagrer alle bogføringsdata, brugere, virksomheder, fakturaer, kontoplan, momsangivelser, journalposter, audit-log, bank-forbindelser (med AES-256-GCM-krypterede tokens), Hermes-konversationer, knowledge-base. |
| **Teknisk reference** | `prisma/schema.prisma` (datasource `provider = "postgresql"`, URL via `env("DATABASE_URL")`); `src/lib/db.ts` (PrismaClient med `decimalSerializer` + `neonConnectionRetry` extension for P1001/P1002/P1008/P1017) |
| **Data sendt** | **Alt:** virksomhedsoplysninger (CVR, adresse, firmanavn), bruger-emails, bcrypt-password-hashes, TOTP-secrets (AES-256-GCM-krypteret), bank-access-tokens (AES-256-GCM-krypteret), alle posteringer, fakturaer, momsangivelser, audit-log, Hermes-konversationer, knowledge-base. |
| **Rolle** | Databehandler (data processor) |
| **Tredjeland (USA)?** | Nej — data i EU. Admin-adgang fra Neon-personale (USA) udgør en teoretisk overførsel → SCC påkrævet for admin. |
| **Autentificering** | Connection string med brugernavn/password, `sslmode=require` (TLS) |
| **Certificeringer** | SOC 2 Type II (verificeret via Neon's hjemmeside) |
| **DPA-status** | Indgået (Neon tilbyder DPA via https://neon.tech/legal) |
| **SCC-status** | Påkrævet for admin-adgang (USA→EU). Neon tilbyder SCC. |
| **Webhook** | Ingen — Neon leverer PITR (Point-in-time recovery, 7 dages retention) og egne backups. |
| **Due-dokumentation** | https://neon.tech/legal, https://neon.tech/privacy, https://neon.tech/legal/subprocessors, SOC 2 Type II rapport (på anmodning) |
| **Note** | Neon-specifik retry-extension i `src/lib/db.ts` håndterer serverless idle-suspend med retry på P1001/P1002/P1008/P1017. pgvector-udvidelse kræves kun for Hermes Knowledge RAG (`KnowledgeChunk.embedding vector(1536)` kolonne). |

### 3.2 IONOS VPS — Applikationsserver + backup-lagring

| Felt | Værdi |
|------|-------|
| **#** | 2 |
| **Navn** | IONOS VPS |
| **Juridisk enhed** | IONOS SE |
| **Lokation (HQ)** | Tyskland (Montabaur) |
| **Lokation (datacenter)** | EU — Tyskland + 25 europæiske datacentre |
| **Formål i AlphaFlow** | (a) Applikationsserver: Next.js (port 3000), Caddy reverse proxy (TLS 1.2/1.3), PM2 fork-mode (6 processer). (b) Lokal backup-lagring: AES-256-GCM-krypterede ZIP-backups pr. tenant i `Tenant-Backup/{companyName}/`. |
| **Teknisk reference** | `ecosystem.config.example.js` (6 PM2 apps), `Caddyfile` (domæne alphaflow.dk), `src/lib/backup-engine.ts` (BACKUP_BASE_DIR = `path.join(process.cwd(), 'Tenant-Backup')`) |
| **Data sendt** | AES-256-GCM-krypterede backup-ZIP-filer pr. tenant (manifest.json v2 + strukturerede JSON-filer), runtime-data i arbejdshukommelse, audit-log via PM2 log-filer, SHA-256-checksums. |
| **Rolle** | Databehandler (data processor) |
| **Tredjeland (USA)?** | Nej |
| **Autentificering** | SSH-adgang til server (offentlig/privat nøglepar) |
| **Certificeringer** | **C5 (BSI Cloud Computing Compliance)** + **IT-Grundschutz** — første europæiske udbyder med begge. ISO 27001 for 25 datacentre. (Verificeret via IONOS hjemmeside.) |
| **DPA-status** | Indgået (IONOS tilbyder DPA via https://www.ionos.de/terms-gtc/privacy) |
| **SCC-status** | N/A — ingen USA-overførsel |
| **Webhook** | Ingen |
| **Due-dokumentation** | https://www.ionos.de/hilfe, C5-certifikat, IT-Grundschutz-certifikat, ISO 27001-certifikater |

### 3.3 Storecove — Peppol Access Point (e-fakturering)

| Felt | Værdi |
|------|-------|
| **#** | 3 |
| **Navn** | Storecove |
| **Juridisk enhed** | Storecove B.V. |
| **Lokation (HQ)** | Holland (EU) |
| **Lokation (datacenter)** | EU |
| **Formål i AlphaFlow** | Peppol Access Point — afsendelse/modtagelse af e-fakturaer (OIOUBL + Peppol BIS Billing 3.0) til danske og europæiske modtagere via Peppol-netværket. NemHandel eDelivery-videreførelse via AS4 med MitID Erhverv-certifikat (håndteres af Storecove på AlphaFlows vegne). |
| **Teknisk reference** | `src/lib/storecove-client.ts`, `src/lib/nemhandel-client.ts` (simulation helper), `src/app/api/storecove/webhook/route.ts` |
| **Data sendt** | OIOUBL/Peppol XML indeholdende faktura: afsender-CVR, modtager-CVR/EAN, fakturanummer, dato, linjer (beskrivelse, antal, pris, momssats), total, betalingsbetingelser, IBAN. **B2B — typisk kun firmanavne, CVR, beløb. Ingen persondata iparente, ingen CPR.** |
| **Rolle** | Databehandler (data processor) |
| **Tredjeland (USA)?** | Nej |
| **Autentificering** | JWT Bearer token (`STORECOVE_API_KEY`); webhook-signatur via HMAC-SHA256 (`STORECOVE_WEBHOOK_SECRET`) |
| **Certificeringer** | Ikke verificeret (Storecove er en etableret Peppol AP; verificer via https://storecove.com) |
| **DPA-status** | Påkræret — skal indgås før produktion |
| **SCC-status** | N/A — EU-baseret |
| **Webhook-modtager** | `POST /api/storecove/webhook` (offentlig, verifikation via `X-Storecove-Signature` HMAC-SHA256). Lytter efter `invoice_submission.status_changed`. |
| **Simulation mode** | Når `STORECOVE_API_KEY` ikke er sat, kører klienten i simulation mode med realistiske mock-responses. |
| **Due-dokumentation** | https://storecove.com/legal, Peppol AP-certifikat (verificerbart via OpenPeppol) |

### 3.4 Frisbii / Flatpay — Abonnementsbetaling

| Felt | Værdi |
|------|-------|
| **#** | 4 |
| **Navn** | Frisbii / Flatpay |
| **Juridisk enhed** | Billwerk+ Reepay Group / Frisbii GmbH |
| **Lokation (HQ)** | Tyskland (EU) |
| **Lokation (datacenter)** | EU |
| **Formål i AlphaFlow** | Hosted checkout-side til køb af AlphaFlow-abonnementer (Månedlig/Pro/Business/Business Extended). **Bemærk:** ikke betalings-processor for kundernes fakturaer — kun for AlphaFlows egne abonnementsbetalinger. |
| **Teknisk reference** | `src/lib/flatpay-client.ts`, `src/app/api/subscription/payment-webhook/route.ts` |
| **Data sendt** | `order.handle` (AlphaFlow Payment.id), `amount` (DKK øre), `currency`, `customer.handle` (`user-<userId>`), `customer.email` (bruger-email), `customer.first_name` (virksomhedsnavn), `customer.last_name` (virksomhedsnavn), `accept_url`, `cancel_url`. Ingen bogføringsdata, ingen CPR. |
| **Rolle** | Databehandler (data processor) |
| **Tredjeland (USA)?** | Nej |
| **Autentificering** | HTTP Basic Auth (privat API-nøgle som username, tom password) |
| **Certificeringer** | PCI DSS Level 1 (typisk for betalingsudbydere — verificer via https://www.frisbii.com) |
| **DPA-status** | Påkræret — skal indgås før produktion |
| **SCC-status** | N/A — EU-baseret |
| **Webhook-modtager** | `POST /api/subscription/payment-webhook` (offentlig, verifikation via `Reepay-Signature` / `frisbii-signature` HMAC-SHA256 base64). Lytter efter `invoice_authorized`, `invoice_settled`, `invoice_failed`, `invoice_cancelled`. |
| **Simulation mode** | Uden `FLATPAY_API_KEY`: MOCK MODE (auto-success, ingen reelle kald). |
| **Due-dokumentation** | https://www.frisbii.com/legal, https://www.frisbii.com/dpa, PCI DSS-certifikat |

### 3.5 CVR-opslag (Erhvervsstyrelsen / VIRK) — Myndighed

| Felt | Værdi |
|------|-------|
| **#** | 5 |
| **Navn** | CVR-opslag (VIRK) |
| **Juridisk enhed** | Erhvervsstyrelsen |
| **Lokation (HQ)** | Danmark (EU) |
| **Lokation (datacenter)** | DK |
| **Formål i AlphaFlow** | Verificere at et indtastet CVR-nummer reelt eksisterer, og auto-udfylde firmanavn, adresse, postnummer, by, land, virksomhedsform (ApS/A/S/ENK etc.). |
| **Teknisk reference** | `src/lib/cvr-client.ts`, `src/app/api/cvr/lookup/route.ts` |
| **Data sendt** | CVR-nummer (8 cifre) som Elasticsearch term-query. **Ingen persondata.** |
| **Rolle** | Myndighedsregister (ikke databehandler) |
| **Tredjeland (USA)?** | Nej |
| **Autentificering** | HTTP Basic Auth (`CVR_API_USERNAME` + `CVR_API_PASSWORD`). **VIGTIGT:** API'et er kun tilgængeligt over **HTTP** (ikke HTTPS) på `http://distribution.virk.dk` — transmitterer credentials i clear text. Dette er Erhvervsstyrelsens officielle design. |
| **Certificeringer** | N/A (offentlig myndighed) |
| **DPA-status** | N/A — myndighed |
| **SCC-status** | N/A |
| **Webhook** | Ingen |
| **Caching** | In-memory cache pr. CVR-nummer, 5-minutters TTL |
| **Simulation mode** | Produktion kræver `CVR_API_USERNAME` + `CVR_API_PASSWORD` + `CVR_SIMULATION_MODE=false`. Uden dette: SIMULATION MODE. |
| **Due-dokumentation** | https://datacvr.virk.dk, https://virk.dk |

### 3.6 SKAT Moms-API — Myndighed

| Felt | Værdi |
|------|-------|
| **#** | 6 |
| **Navn** | SKAT Moms-API |
| **Juridisk enhed** | Skattestyrelsen |
| **Lokation (HQ)** | Danmark (EU) |
| **Lokation (datacenter)** | DK |
| **Formål i AlphaFlow** | Indsendelse af momsangivelse (kvartalsvis/årlig) til Skattestyrelsen via REST API. **KUN momsangivelse — ingen årsopgørelse eller e-indkomst integration findes i koden.** |
| **Teknisk reference** | `src/lib/vat-submit.ts` |
| **Data sendt** | JSON payload: `cvrNumber`, `period` (year, periodType, from, to), `vatData` (totalOutputVAT, totalInputVAT, netVATPayable, outputVATBreakdown[], inputVATBreakdown[]). **Ingen personnavne eller CPR.** |
| **Rolle** | Modtager af regulatoriske indberetninger (myndighed — ikke databehandler) |
| **Tredjeland (USA)?** | Nej |
| **Autentificering** | OAuth2 `client_credentials` grant. Token cache'et i hukommelsen med 5-minutters safety-margin. Scope: `moms:indberet`. Endpoint: `${SKAT_API_BASE}/oauth/token` (default `https://api.skat.dk/moms`). |
| **Certificeringer** | N/A (offentlig myndighed) |
| **DPA-status** | N/A — myndighed |
| **SCC-status** | N/A |
| **Webhook** | Ingen — SKAT returnerer `referenceId` synkront. |
| **Audit** | Hvert kald logges i AuditLog (action=`UPDATE`, entityType=`VATSubmission`). |
| **Simulation mode** | Produktion kræver `SKAT_CLIENT_ID` + `SKAT_CLIENT_SECRET`. Uden: SIMULATION MODE (mock reference-ID, intet reelt kald). |
| **Due-dokumentation** | https://skat.dk, https://developer.skat.dk |

### 3.7 OpenAI — Embeddings (USA)

| Felt | Værdi |
|------|-------|
| **#** | 7 |
| **Navn** | OpenAI |
| **Juridisk enhed** | OpenAI, Inc. / OpenAI LLC |
| **Lokation (HQ)** | USA (San Francisco, CA) |
| **Lokation (datacenter)** | USA |
| **Formål i AlphaFlow** | Embeddings via `text-embedding-3-small` (1536 dims, $0.02/M tokens) til knowledge-service RAG. Embedder dokumenter i chunks (~500 tokens) og udfører semantisk søgning i en videnbase (danske regnskabsregler, branchekoder, kontoplan-beskrivelser). Resultater injiceres i Hermes' system-prompt som kontekst. |
| **Teknisk reference** | `mini-services/knowledge-service/embedder.ts`, `mini-services/knowledge-service/db.ts` (pgvector cosine distance `<=>`) |
| **Data sendt** | Dokument-tekst chunks (~500 tokens). Default knowledge-base indeholder generelle danske regnskabsregler (BRUGSVEJLEDNING.md) — ikke tenant-specifikke finansielle data. Tenant-admin kan uploade egne dokumenter til knowledge-base, som så embeddes. **Ingen adgangskoder, ingen CPR, ingen individuelle posteringer.** |
| **Rolle** | Databehandler (data processor) — sub-underbehandler af OpenAI for Anthropic-via-OpenRouter (separat). |
| **Tredjeland (USA)?** | **JA** |
| **Autentificering** | Bearer token (`OPENAI_API_KEY`) |
| **Certificeringer** | SOC 2 Type II (verificeret via https://openai.com/security) |
| **DPA-status** | Påkræret — skal indgås før produktion. OpenAI tilbyder DPA via https://openai.com/enterprise-privacy |
| **SCC-status** | **Påkræret** — Standard Contractual Clauses 2021/914, Modul 2 (Controller-to-Processor) |
| **TIA** | **Påkræret** — se afsnit 5.1 |
| **Webhook** | Ingen |
| **Note** | API terms for enterprise garanterer zero-retention for input/output (verificerbart i OpenAI enterprise-aftale). Skal årligt re-verificeres. |
| **Due-dokumentation** | https://openai.com/enterprise-privacy, https://openai.com/security, https://openai.com/policies/row-privacy-policy, SOC 2 Type II rapport (på anmodning), sub-processor liste: https://openai.com/policies/subprocessor-list |

### 3.8 OpenRouter — LLM Chat (Hermes) (USA)

| Felt | Værdi |
|------|-------|
| **#** | 8 |
| **Navn** | OpenRouter |
| **Juridisk enhed** | OpenRouter, Inc. |
| **Lokation (HQ)** | USA |
| **Lokation (datacenter)** | USA (videresender til Anthropic/Meta/etc.) |
| **Formål i AlphaFlow** | LLM chat-completions for Hermes AI-assistent (port 3004). AI-drevet dansk regnskabskonsulent — besvarer brugerspørgsmål om bogføring, moms, løn, frister, virksomhedsklasser. |
| **Teknisk reference** | `mini-services/hermes-agent/index.ts`, `mini-services/hermes-agent/database-tenant-provider.ts`, `mini-services/hermes-agent/knowledge-base.ts` |
| **Data sendt** | (a) System-prompt: statisk dansk regnskabsviden (454 LOC `knowledge-base.ts`) — lovtekst, moms-satser, frister, virksomhedsklasser. (b) Brugerens spørgsmål. (c) Samtalehistorik (sidste 20 beskeder). (d) Tenant-kontekst **KUN hvis `HermesAgent.dataAccessEnabled = true`**: virksomhedsnavn, CVR, branche, medlemsliste (navn, rolle, email), regnskabsoplysninger (balance, momsstatus, seneste 6 måneders indtægter/udgifter, nettoresultat), afventende påmindelser. (e) Skill-prompts. (f) RAG-kontekst (top-5 dokument-uddrag fra knowledge-service). **Ingen individuelle posteringer, ingen CPR.** |
| **Rolle** | Databehandler (data processor) |
| **Tredjeland (USA)?** | **JA** |
| **Autentificering** | Bearer token (`OPENROUTER_API_KEY`); ekstra headers: `HTTP-Referer` (APP_URL) og `X-Title` (APP_NAME) |
| **Endpoints** | `POST https://openrouter.ai/api/v1/chat/completions` |
| **Model-konfiguration** | Default: `anthropic/claude-sonnet-4.5` (videresendes til Anthropic USA). Free-tier fallback: `meta-llama/llama-3.3-70b-instruct:free` (videresendes til Meta USA). |
| **Certificeringer** | Ikke verificeret (OpenRouter er en relativt ny udbyder; verificer via https://openrouter.ai/legal) |
| **DPA-status** | Påkræret — skal indgås før produktion. OpenRouter tilbyder DPA via https://openrouter.ai/legal |
| **SCC-status** | **Påkræret** — Standard Contractual Clauses 2021/914, Modul 2 (Controller-to-Processor) |
| **TIA** | **Påkræret** — se afsnit 5.2 |
| **Webhook** | Ingen |
| **Rate-limiting** | Per-tenant rate-limiter med konfigurerbare windows (minut/time/dag/måned). Admin via `/admin/stats` (Bearer `HERMES_ADMIN_KEY`). |
| **Note** | OpenRouter videresender anmodninger til upstream-udbydere. Sub-underbehandlere: Anthropic (USA), Meta (USA). Disse er også omfattet af SCC + TIA. |
| **Due-dokumentation** | https://openrouter.ai/legal, https://openrouter.ai/privacy, https://openrouter.ai/terms |

### 3.9 Anthropic — VLM Scanner (USA)

| Felt | Værdi |
|------|-------|
| **#** | 9 |
| **Navn** | Anthropic |
| **Juridisk enhed** | Anthropic PBC |
| **Lokation (HQ)** | USA (San Francisco, CA) |
| **Lokation (datacenter)** | USA |
| **Formål i AlphaFlow** | VLM-ekstraktion af kvitteringer/fakturaer via scanner-service (Python, port 3005). Anthropic Claude Sonnet 4 (`claude-sonnet-4-20250514`) kaldes som fallback når Tesseract OCR-confidence < 60, eller for PDF'er uden tekstlag. Returnerer struktureret faktura/kvitteringsdata + FSR-konto-forslag. Anthropic er også upstream-model for OpenRouter når `anthropic/claude-sonnet-4.5` vælges. |
| **Teknisk reference** | `mini-services/scanner-service/src/vlm_client.py`, `mini-services/scanner-service/src/config.py` |
| **Data sendt** | Base64-encoded PNG-billeder af dokumentets sider + prompt ("Analyze this purchase invoice/receipt document. Extract the following information..."). Billederne kan indeholde leverandørnavn, CVR, beløb, momssats, dato, linjebeskrivelser, kunde-oplysninger. **Anthropic gemmer ikke billederne (per API terms — enterprise zero-retention), men data transiterer USA.** |
| **Rolle** | Databehandler (data processor) — også sub-underbehandler for OpenRouter (når claude-sonnet vælges) |
| **Tredjeland (USA)?** | **JA** |
| **Autentificering** | Bearer token (`ANTHROPIC_API_KEY`) |
| **Endpoints** | `POST https://api.anthropic.com/v1/messages` |
| **Model** | `claude-sonnet-4-20250514` (default), max 4096 tokens |
| **Certificeringer** | SOC 2 Type II (verificeret via https://www.anthropic.com/security) |
| **DPA-status** | Påkræret — skal indgås før produktion. Anthropic tilbyder DPA via https://www.anthropic.com/legal/business-terms |
| **SCC-status** | **Påkræret** — Standard Contractual Clauses 2021/914, Modul 3 (Processor-to-Processor) for kald via OpenRouter; Modul 2 (Controller-to-Processor) for direkte scanner-kald. |
| **TIA** | **Påkræret** — se afsnit 5.3 |
| **Webhook** | Ingen — scanner-service har udgående webhook til `HOST_CALLBACK_URL` med `X-Scanner-Signature` HMAC-SHA256, men Anthropic har ikke webhook mod AlphaFlow. |
| **Note** | Anthropic har uofficielt erklæret at de ikke træner på kundedata via API (zero-retention for enterprise). Skal verificeres og dokumenteres årligt. |
| **Due-dokumentation** | https://www.anthropic.com/legal/business-terms, https://www.anthropic.com/security, https://www.anthropic.com/legal/privacy, SOC 2 Type II rapport (på anmodning) |

### 3.10 SMTP / Simply / Brevo — Email (EU)

| Felt | Værdi |
|------|-------|
| **#** | 10 |
| **Navn** | Simply / Brevo (SMTP) |
| **Juridisk enhed** | Simply A/S (DK) eller Brevo SAS (FR) — afhængig af konfiguration |
| **Lokation (HQ)** | DK / FR (EU) |
| **Lokation (datacenter)** | EU |
| **Formål i AlphaFlow** | Transaktions-emails: (a) email-verifikation ved registrering, (b) password-reset, (c) team-invitations (inkl. midlertidigt password for nye brugere), (d) owner-notifikationer, (e) faktura-emails med PDF-vedhæftning. |
| **Teknisk reference** | `src/lib/email-service.ts` (nodemailer), `src/lib/email-templates.ts` |
| **Data sendt** | Modtager-email, brugernavn/firmanavn, verification/reset-tokens, invitation-rolle, faktura-PDF (indeholder typisk beløb, CVR, modtager-oplysninger). |
| **Rolle** | Databehandler (data processor) |
| **Tredjeland (USA)?** | Nej |
| **Autentificering** | SMTP auth (user/pass), pool-mode med max 5 connections, rate-limit 10/sec. STARTTLS på port 587, implicit SSL på port 465. |
| **Konfigurerede udbydere** | (a) Simply / alphaflow.dk — den konfigurerede produktionsserver. (b) Brevo — frakommenteret alternativ i `.env.example`. Begge EU-baserede. |
| **Certificeringer** | Brevo: ISO 27001 (verificeret via https://www.brevo.com/security). Simply: ikke verificeret. |
| **DPA-status** | Påkræret — skal indgås før produktion. Brevo tilbyder DPA via https://www.brevo.com/legal/dpa. Simply: kontakt direkte. |
| **SCC-status** | N/A — EU-baseret |
| **Email-logning** | Hver sendte email logges i `EmailLog`-tabellen (Neon DB) med status (`sent` / `dev-logged` / `failed`), template, modtager, emne, og `X-Email-Log-Id` header. |
| **Webhook** | Ingen |
| **Dev-mode** | Uden `SMTP_HOST/USER/PASS`: DEV MODE (jsonTransport — logger til konsol, sender ikke). |
| **Due-dokumentation** | https://www.brevo.com/legal/dpa (Brevo), https://www.brevo.com/security; Simply: direkte kontakt |

### 3.11 TokenPay-access-service — Intern sub-system

| Felt | Værdi |
|------|-------|
| **#** | 11 |
| **Navn** | tokenpay-access-service |
| **Juridisk enhed** | AlphaAi ApS (intern) |
| **Lokation** | IONOS VPS (EU — Tyskland) |
| **Formål i AlphaFlow** | Token-baseret adgangskontrol. Styrer `read_only` / `read_write` adgangsniveau baseret på gyldige krypterede `.tbkey` proof-filer (bearer instruments købt eksternt i TokenBay-ZIPProof). Håndterer: trial-adgang (60 dage), free tier (omsætning <50.000 kr.), owner-bypass, subscription-plan perioder (Frisbii-betalinger aktiverer plan-periode i TokenPay). |
| **Teknisk reference** | `mini-services/tokenpay-access-service/index.ts` (Bun + Hono + SQLite), `src/lib/tokenpay.ts` |
| **Port** | 3100 |
| **Data sendt** | Bruger-ID (CUID), email, navn, proof-filens manifest (tier, escrowId, issuer, expiry), access-log (gamle/nye access-niveauer, reason codes), in-app beskeder (subject, body, prioritet). |
| **Rolle** | Integreret sub-system (data processor — AlphaAi selv) |
| **Tredjeland (USA)?** | Nej |
| **Autentificering internt** | `X-Access-Service-Key` header med delt hemmelighed (`TOKENPAY_API_KEY` i host app = `API_SHARED_KEY` i mini-service) |
| **Database** | Lokal SQLite (`data/access.db`, WAL mode) — separat fra Neon PostgreSQL. Ingen Prisma. Schema auto-oprettes. |
| **Kryptering** | `.tbkey` proof-filer dekrypteres med AES-256-GCM via `PROOF_ENCRYPTION_KEY` (delt med TokenBay-ZIPProof). |
| **Webhook-modtager** | `POST /api/tokenpay/callback` (offentlig, verifikation via `X-TokenPay-Signature` HMAC-SHA256). Lytter efter `access.granted`, `access.revoked`, `access.expiring`. Logger til AuditLog. |
| **Cron** | `setInterval(runCronCycle, 5 minutter)` — re-verificerer proofs, nedgraderer udløbne brugere, sender advarsler. |
| **Due-dokumentation** | Intern — dækkes af AlphaAis egen sikkerhedsstyring |

### 3.12 Scanner-service — Intern sub-system (med Anthropic kald)

| Felt | Værdi |
|------|-------|
| **#** | 12 |
| **Navn** | scanner-service |
| **Juridisk enhed** | AlphaAi ApS (intern; Anthropic som ekstern underbehandler — se 3.9) |
| **Lokation** | IONOS VPS (EU — Tyskland) |
| **Formål i AlphaFlow** | Scanner dokumenter (PDF, JPEG, PNG, WebP) og returnerer struktureret data: beløb, dato, momssats, valuta, beskrivelse, linjer, dokument-type, leverandørnavn, CVR, fakturanummer, forfaldsdato, subtotal, momsbeløb, konto-forslag (FSR 4-cifret). |
| **Teknisk reference** | `mini-services/scanner-service/main.py`, `mini-services/scanner-service/src/vlm_client.py`, `mini-services/scanner-service/src/webhook.py` |
| **Port** | 3005 |
| **Pipeline** | (1) SHA-256 cache-opslag, (2) PDF med tekstlag → PyMuPDF, (3) PDF uden tekst → 300 DPI PNG → Anthropic VLM, (4) Billede → cv2 enhancement → Tesseract OCR, (5) OCR-confidence < 60 → VLM fallback, (6) Dansk parsing (CVR Mod-11, EAN-13, IBAN MOD-97), (7) Dokument-klassifikation + konto-forslag. |
| **Data sendt (til Anthropic)** | Base64-PNG-billeder af dokumentets sider + ekstraktions-prompt. Se 3.9 for detaljer. |
| **Rolle** | Integreret sub-system; Anthropic er ekstern databehandler |
| **Tredjeland (USA)?** | Nej for sub-systemet selv; Anthropic-kald er JA (se 3.9) |
| **Autentificering internt** | `X-Access-Service-Key` header (`SCANNER_API_KEY` i host = `API_SHARED_KEY` i mini-service). Desuden `X-Company-Id` (påkrævet) og `X-User-Id` (valgfrit) fra host-session. |
| **Database** | Lokal SQLite (`data/scanner.db`, WAL mode). Tabeller `scan_jobs` + `ocr_results`. |
| **Webhook (scanner → host)** | HMAC-SHA256-signeret POST med `X-Scanner-Signature` + `X-Scanner-Event` (events: `scan.completed`, `scan.failed`) til `HOST_CALLBACK_URL`. Fire-and-forget via httpx. |
| **Due-dokumentation** | Intern — dækkes af AlphaAis egen sikkerhedsstyring |

### 3.13 Notification-ws-service — Intern sub-system

| Felt | Værdi |
|------|-------|
| **#** | 13 |
| **Navn** | notification-ws-service |
| **Juridisk enhed** | AlphaAi ApS (intern) |
| **Lokation** | IONOS VPS (EU — Tyskland) |
| **Formål i AlphaFlow** | Real-time broadcast-tjeneste — sender notifikation-læst-tilstand pr. bruger og `DATA_CHANGED`-invalidering pr. company-rum via Socket.IO. |
| **Teknisk reference** | `mini-services/notification-ws-service/index.ts` (Bun + Socket.IO) |
| **Port** | 3001 |
| **Data sendt** | In-memory: `userId` → `Set<socketId>`, `companyId` → `Set<socketId>`. Data-typer: `READ_STATE_CHANGED` (`userId`, `readIds`), `DATA_CHANGED` (`companyId`, `scope`, `action`, `entity?`). Ingen database, ingen persistent data. |
| **Rolle** | Integreret sub-system |
| **Tredjeland (USA)?** | Nej |
| **Autentificering** | Socket.IO `handshake.auth.userId` (påkrævet — ellers disconnect) + valgfrit `handshake.auth.companyId`. `/broadcast` har ingen auth (kun localhost). |
| **Database** | Ingen — in-memory `Map<userId, Set<socketId>>`. |
| **Webhook** | Ingen |
| **Due-dokumentation** | Intern |

### 3.14 Knowledge-service — Intern sub-system (med OpenAI kald)

| Felt | Værdi |
|------|-------|
| **#** | 14 |
| **Navn** | knowledge-service |
| **Juridisk enhed** | AlphaAi ApS (intern; OpenAI som ekstern underbehandler — se 3.7) |
| **Lokation** | IONOS VPS (EU — Tyskland) |
| **Formål i AlphaFlow** | RAG-knowledge base for Hermes — semantisk søgning via pgvector. CRUD for `KnowledgeDocument` + `KnowledgeChunk`, chunking + embeddings. |
| **Teknisk reference** | `mini-services/knowledge-service/index.ts`, `mini-services/knowledge-service/embedder.ts`, `mini-services/knowledge-service/db.ts` |
| **Port** | 3006 (env `KNOWLEDGE_SERVICE_PORT`) |
| **Data sendt (til OpenAI)** | Dokument-tekst chunks (~500 tokens) for embedding. Se 3.7 for detaljer. |
| **Rolle** | Integreret sub-system; OpenAI er ekstern databehandler |
| **Tredjeland (USA)?** | Nej for sub-systemet; OpenAI-kald er JA (se 3.7) |
| **Autentificering** | Bearer `HERMES_ADMIN_KEY` (fallback til `OPENROUTER_API_KEY`) på alle endpoints undtagen `/health`. |
| **Database** | JA — Prisma forbinder til `DATABASE_URL` (samme Neon Postgres som hovedappen — `KnowledgeDocument`, `KnowledgeChunk` med pgvector-kolonne). Kalder `ensurePgvectorExtension()` ved startup. |
| **Webhook** | Ingen |
| **Due-dokumentation** | Intern |

### 3.15 Hermes-agent — Intern sub-system (med OpenRouter kald)

| Felt | Værdi |
|------|-------|
| **#** | 15 |
| **Navn** | hermes-agent |
| **Juridisk enhed** | AlphaAi ApS (intern; OpenRouter + Anthropic/Meta som eksterne underbehandlere — se 3.8, 3.9) |
| **Lokation** | IONOS VPS (EU — Tyskland) |
| **Formål i AlphaFlow** | Socket.IO-baseret AI-regnskabskonsulent ("Hermes") — overlay-agent der streamer chat-svar fra OpenRouter LLM til logged-in brugere per tenant, med reminders og skills-injektion. |
| **Teknisk reference** | `mini-services/hermes-agent/index.ts`, `mini-services/hermes-agent/database-tenant-provider.ts`, `mini-services/hermes-agent/knowledge-base.ts` |
| **Port** | 3004 (config.ts default) |
| **Data sendt (til OpenRouter)** | Se 3.8 for fuld liste. |
| **Rolle** | Integreret sub-system; OpenRouter er ekstern databehandler |
| **Tredjeland (USA)?** | Nej for sub-systemet; OpenRouter-kald er JA (se 3.8) |
| **Autentificering** | Socket.IO `join`-event bærer `tenantId/userId/userName`. HTTP `/admin/*` kræver `Authorization: Bearer HERMES_ADMIN_KEY`. |
| **Database** | JA — Prisma forbinder til `DATABASE_URL` (samme Neon Postgres som hovedappen: Company, HermesAgent, AgentReminder, AgentMessage, UserCompany, User, Transaction). Fallback til in-memory `MockTenantProvider` hvis `DATABASE_URL` mangler. |
| **Cron** | `setInterval(checkReminders, 60s)` — proaktive påmindelser. Reminder-vindue: 7 dage. |
| **Webhook** | Ingen |
| **Due-dokumentation** | Intern |

### 3.16 Bank-API'er (Tink, Nordea, Danske Bank, Jyske Bank) — Inaktive

| Felt | Værdi |
|------|-------|
| **#** | — |
| **Navn** | Bank-API'er (Tink, Nordea, Danske Bank, Jyske Bank) |
| **Status** | **Stub-only — ikke aktive i produktion.** Implementeret i `src/lib/bank-providers.ts` via `createRealBankProvider()` factory. Consent-flow stubbes; `fetchTransactions` kaster "requires production configuration". Kun Demo-provider returnerer data uden credentials. |
| **Data sendt** | Ingen reelle data overføres. Bank-access-tokens krypteres dog alligevel med AES-256-GCM før lagring i DB (fremtidssikring). |
| **Rolle** | Potentiel databehandler ved fremtidig aktivering. |
| **Note** | Hvis disse aktiveres i fremtiden, vil de blive tilføjet til leverandørregisteret med korrekt DPA + SCC-vurdering (afhængig af bankens datacenter-lokation). |

### 3.17 z-ai-web-dev-sdk (AI-bankafstemning) — Inaktiv

| Felt | Værdi |
|------|-------|
| **#** | — |
| **Navn** | z-ai-web-dev-sdk |
| **Status** | **Sandbox-only — virker ikke i produktion.** Fejler gracefully og returnerer ingen matches. Ifølge `.env.example` er SDK'et sandbox-only. |
| **Data sendt** | Ingen (i produktion). I sandbox: banktransaktioner og finansposteringer sendes til sandbox-API. |
| **Rolle** | N/A — ikke aktiv. |
| **Note** | Hvis z-ai-web-dev-sdk aktiveres i produktion, vil det blive tilføjet til leverandørregisteret med korrekt DPA + SCC-vurdering. |

### 3.18 Samlet leverandørregister — kompakt oversigt

| # | Leverandør | Lokation | Rolle | Tredjeland (USA)? | DPA | SCC |
|---|-----------|----------|-------|--------------------|-----|------|
| 1 | Neon PostgreSQL | EU DC (DE+NL) | Databehandler | Nej (admin: ja) | Indgået | Ja (admin) |
| 2 | IONOS VPS | Tyskland | Databehandler | Nej | Indgået | N/A |
| 3 | Storecove | Holland | Databehandler | Nej | Påkræret | N/A |
| 4 | Frisbii / Flatpay | Tyskland | Databehandler | Nej | Påkræret | N/A |
| 5 | CVR-opslag (VIRK) | DK | Myndighed | Nej | N/A | N/A |
| 6 | SKAT Moms-API | DK | Myndighed | Nej | N/A | N/A |
| 7 | OpenAI | USA | Databehandler | **Ja** | Påkræret | **Påkræret** |
| 8 | OpenRouter | USA | Databehandler | **Ja** | Påkræret | **Påkræret** |
| 9 | Anthropic | USA | Databehandler | **Ja** | Påkræret | **Påkræret** |
| 10 | Simply / Brevo (SMTP) | DK / FR | Databehandler | Nej | Påkræret | N/A |
| 11 | tokenpay-access-service | EU VPS | Intern sub-system | Nej | N/A (intern) | N/A |
| 12 | scanner-service | EU VPS | Intern sub-system | Nej (Anthropic: ja) | N/A (intern) | N/A (Anthropic: ja) |
| 13 | notification-ws-service | EU VPS | Intern sub-system | Nej | N/A (intern) | N/A |
| 14 | knowledge-service | EU VPS | Intern sub-system | Nej (OpenAI: ja) | N/A (intern) | N/A (OpenAI: ja) |
| 15 | hermes-agent | EU VPS | Intern sub-system | Nej (OpenRouter: ja) | N/A (intern) | N/A (OpenRouter: ja) |
| — | Bank-API'er | Afhænger af bank | Inaktiv (stub) | — | — | — |
| — | z-ai-web-dev-sdk | — | Inaktiv (sandbox) | — | — | — |

---

## 4. Due diligence-proces

### 4.1 Kriterier for udvælgelse

Ved valg af tekniske leverandører anvendes følgende minimumskriterier, som dokumenteres og evalueres før indgåelse af aftale:

| Kriterie | Minimumskrav | Vægtning | Verifikation |
|----------|-------------|----------|---------------|
| **Sikkerhedscertificering** | SOC 2 Type II, ISO 27001, C5 eller tilsvarende | Kritisk | Certifikat på leverandørens hjemmeside eller på anmodning |
| **DPA-tilgængelighed** | Offentlig tilgængelig DPA eller på anmodning | Kritisk | Leverandørens legal-side |
| **SCC for USA** | Standard Contractual Clauses 2021/914, Modul 2 eller 3 | Kritisk (for USA) | Leverandørens DPA-vedhæftning |
| **Sub-processor-liste** | Offentlig tilgængelig sub-processor-liste med notifikationsforpligtelse | Høj | Leverandørens legal-side |
| **Breach-notification-policy** | Underretning ≤ 24 timer efter opdagelse | Kritisk | DPA § breach-notification |
| **Data-retention** | Dokumenteret retention-politik og sletningsprocedure | Høj | Leverandørens privacy-policy |
| **EU/EØS-hosting** | Data hostes i EU/EØS (foretrukket) | Kritisk | Leverandørens infrastructure-side |
| **Penetrationstest** | Årlig uafhængig pentest | Høj | Rapport på anmodning |
| **Kryptering** | AES-256 i hvile + TLS 1.2+ i transit | Kritisk | Leverandørens security-side |
| **Adgangsstyring** | MFA for administrative adgange | Høj | Leverandørens security-side |
| **Oppetid (SLA)** | Minimum 99,9 % | Høj | SLA-dokument |
| **Økonomisk stabilitet** | Etablert virksomhed | Høj | Årsregnskab / offentlig register |
| **AI-specifikke krav** (for AI-underbehandlere) | Zero-retention for enterprise-aftaler | Kritisk (for AI) | Enterprise-aftale |

### 4.2 Evaluationsproces

Nye leverandører evalueres gennem følgende proces:

```
1. Behovsidentifikation
   ├── Teknisk behov i AlphaFlow
   ├── Alternativer i EU
   └── USA-alternativets nødvendighed (kun hvis ingen EU-alternativ)

2. Markedsafklaring
   ├── Identifikation af kandidater
   ├── Sammenligning af kriterier
   └── Referencer og case studies

3. Sikkerhedsvurdering
   ├── Certificeringer verificeres
   ├── DPA og SCC tilgængelighed tjekkes
   ├── Sub-processor-liste gennemgås
   └── Penetrationstest-rapport (hvis tilgængelig)

4. TIA (ved USA-overførsel)
   ├── Nødvendighed vurderes
   ├── Alternativer overvejes (EU-modeller som Mistral, SiloGen)
   ├── Supplerende foranstaltninger defineres
   └── Dokumenteres i afsnit 5

5. DPA-indgåelse
   ├── DPA underskrives
   ├── SCC vedhæftes (ved USA)
   └── Sub-processor-notifikationsforpligtelse aftales

6. Compliance-godkendelse
   ├── Compliance Officer godkender
   ├── Risikovurdering opdateres (docs/RISIKOVURDERING.md)
   └── LEVERANDØRSTYRING.md opdateres

7. Teknisk test
   ├── Integrationstest
   ├── Sikkerhedstest (auth, kryptering, rate-limiting)
   └── Performance-test

8. Produktionsudrulning
   ├── Miljøvariabler konfigureres
   ├── Overvågning aktiveres
   └── Backup-beredskab verificeres

9. Løbende overvågning (jf. afsnit 6)
```

### 4.3 Godkendelsesniveauer

| Ændringstype | Godkendes af | Varsel til kunder |
|--------------|-------------|-------------------|
| **Ny kritisk leverandør (infrastruktur eller USA-AI)** | Direktør + Compliance Officer | 30 dage (jf. DPA § 14) |
| **Ny ikke-kritisk EU-leverandør** | Compliance Officer | 30 dage |
| **Udskiftning af eksisterende leverandør** | Direktør + Compliance Officer | 60 dage |
| **Tilføjelse af sub-underbehandler hos eksisterende** | Compliance Officer | 30 dage (jf. DPA § 14) |

---

## 5. USA-overførsler — særlig vurdering (TIA)

Følgende Transfer Impact Assessment (TIA) dækker de tre USA-baserede AI-underbehandlere. TIA'en er udarbejdet i overensstemmelse med Kommissionens gennemførelsesafgørelse (EU) 2021/914 og EDPB's Recommendations 01/2020.

### 5.1 OpenAI — Embeddings (RAG)

#### 5.1.1 Data der overføres

- **Indhold:** Dokument-tekst chunks (~500 tokens) fra danske regnskabsregler, branchekoder, kontoplan-beskrivelser.
- **Default knowledge-base:** Indeholder kun generelle danske regnskabsregler (BRUGSVEJLEDNING.md) — ikke tenant-specifikke finansielle data.
- **Tenant-specifikke dokumenter:** Kun hvis tenant-administrator aktivt uploader egne dokumenter til knowledge-base (via `/api/hermes/knowledge`).
- **Persondata:** Potentielt personnavne, e-mailadresser, CVR (hvis nævnt i dokumenter). **Ingen CPR, ingen adgangskoder, ingen individuelle posteringer.**

#### 5.1.2 Nødvendighed

- RAG (Retrieval-Augmented Generation) kræver semantiske embeddings for at Hermes-assistenten kan svare på spørgsmål om danske regnskabsregler.
- OpenAI's `text-embedding-3-small` er branchestandarden med 1536 dimensioner og lav pris ($0.02/M tokens).
- Embedding-modeller gemmer ikke selve teksten — kun den matematiske representation.

#### 5.1.3 Alternativer

| Alternativ | Fordele | Ulemper | Status |
|------------|---------|---------|--------|
| **Mistral Embed** (FR, EU) | EU-baseret, ingen USA-overførsel | Mindre udbredt, færre sprog understøttet, kræver gen-embedding | Undersøges |
| **SiloGen** (EU, svensk) | EU-baseret, dansk sprog-understøttelse | Begrænset model-udbud, nyere udbyder | Undersøges |
| **JINA AI Embeddings v3** | Open-source, self-hosting muligt | Kræver egen GPU-infrastruktur | Undersøges |
| **Cohere Embed v3** | Høj kvalitet | Canada-baseret (også tredjeland) | Ikke relevant |
| **Lokal self-hosted model** | Ingen overførsel | Høj infrastruktur-omkostning, lavere kvalitet | Langsigtet plan |

#### 5.1.4 Supplerende foranstaltninger

- **DPA + SCC (Modul 2)** med OpenAI.
- **Enterprise-aftale** med zero-retention for input/output data.
- **Tenant-minimization:** Default knowledge-base indeholder kun generelle regler — ikke tenant-specifikke finansielle data.
- **Årlig re-verifikation** af OpenAI's zero-retention-aftale.

#### 5.1.5 Konklusion

USA-overførsel til OpenAI er **nødvendig** for at levere Hermes RAG-funktionalitet på branchestandard-kvalitet. Med DPA + SCC + enterprise zero-retention vurderes risikoen som **acceptabel**. EU-alternativer (Mistral, SiloGen) undersøges som langsigtet strategi.

### 5.2 OpenRouter — LLM Chat (Hermes)

#### 5.2.1 Data der overføres

- **Standard (uden `dataAccessEnabled`):** Brugerens spørgsmål (naturligt sprog) + statisk dansk regnskabs-system-prompt + samtalehistorik (sidste 20 beskeder) + valgfrie Hermes-skill-prompts + RAG-kontekst.
- **Med `dataAccessEnabled = true` (per-tenant opt-in, default false):** Ovenstående + virksomhedsnavn, CVR, branche, medlemsliste (navn, rolle, email), regnskabsoplysninger (balance, momsstatus, seneste 6 måneders indtægter/udgifter, nettoresultat), afventende påmindelser.
- **Ingen:** Individuelle posteringer, faktura-linjer, CPR, adgangskoder.

#### 5.2.2 Nødvendighed

- OpenRouter giver adgang til top-modeller (Anthropic Claude Sonnet 4.5, Meta Llama 3.3 70B) via én API-aftale.
- Direkte aftaler med hver model-udbyder ville kræve flere DPA'er og øget kompleksitet.
- OpenRouter tilbyder free-tier fallback (Llama 3.3 70B) til små kunder.

#### 5.2.3 Alternativer

| Alternativ | Fordele | Ulemper | Status |
|------------|---------|---------|--------|
| **Direkte Anthropic-aftale** | Fjerner ét lag (OpenRouter) | Anthropic er stadig USA-baseret; ingen free-tier | Muligt |
| **Mistral Large** (FR, EU) | EU-baseret | Mindre kvalitet end Claude; dansk sprog svagere | Undersøges |
| **SiloGen** (EU) | EU-baseret, dansk sprog | Begrænset model-udbud | Undersøges |
| **Aleph Alpha** (DE, EU) | EU-baseret, tysk sprog | Dansk sprog svagere | Undersøges |
| **Lokal self-hosted Llama 3.3 70B** | Ingen overførsel | Kræver 2x A100 GPU ($5-10K/mån) | Langsigtet |

#### 5.2.4 Supplerende foranstaltninger

- **`HermesAgent.dataAccessEnabled` opt-in (default false)** — primær minimization. Uden opt-in sendes kun brugerens spørgsmål og statisk system-prompt.
- **DPA + SCC (Modul 2)** med OpenRouter.
- **Sub-processor-vurdering:** OpenRouter videresender til Anthropic (USA) og Meta (USA) — begge omfattet af samme SCC.
- **Samtalehistorik rulning:** Kun sidste 20 beskeder sendes (minimization).
- **Rate-limiting:** Per-tenant rate-limiter (minut/time/dag/måned) forhindrer bulk-udtræk.
- **Årlig re-verifikation** af OpenRouter's log-retention-politik (bør være kort).

#### 5.2.5 Konklusion

USA-overførsel til OpenRouter er **nødvendig** for at levere Hermes chat-funktionalitet på branchestandard-kvalitet uden at indgå multiple direkte API-aftaler. Med DPA + SCC + `dataAccessEnabled` opt-in + rate-limiting vurderes risikoen som **acceptabel**. EU-alternativer (Mistral Large, SiloGen) undersøges som langsigtet strategi.

### 5.3 Anthropic — VLM Scanner

#### 5.3.1 Data der overføres

- **Indhold:** Base64-PNG-billeder af dokumentets sider (kvitteringer, fakturaer).
- **Prompt:** "Analyze this purchase invoice/receipt document. Extract the following information...".
- **Persondata i billeder:** Potentielt leverandørnavn, CVR, beløb, momssats, dato, linjebeskrivelser, kunde-oplysninger. **Ingen CPR** (kvitteringer indeholder sjældent CPR).
- **Frekvens:** Anthropic kaldes kun ved VLM-fallback (lav OCR-confidence eller PDF uden tekstlag). Ikke for hvert dokument.

#### 5.3.2 Nødvendighed

- Tesseract OCR alene er utilstrækkeligt for dårlige fotos, håndskrevne kvitteringer, og PDF'er uden tekstlag.
- Anthropic Claude Sonnet 4 har overlegen dansk sprogforståelse og dokumentforståelse sammenlignet med open-source alternativer.
- Anthropic har officiel API-aftale med zero-retention for enterprise-kunder.

#### 5.3.3 Alternativer

| Alternativ | Fordele | Ulemper | Status |
|------------|---------|---------|--------|
| **Tesseract-only (ingen VLM)** | Ingen USA-overførsel | Lavere kvalitet på dårlige billeder; manuelt efterarbejde | Fallback-tilstand aktiveret |
| **Google Document AI** | Høj kvalitet | USA-baseret (samme tredjeland-risiko) | Ikke relevant |
| **Azure Document Intelligence** | Høj kvalitet, EU-datacenter muligt | Kræver Azure-aftale, højere pris | Undersøges |
| **Mistral Pixtral** (FR, EU) | EU-baseret VLM | Ny model, mindre testet på dansk | Undersøges |
| **Lokal self-hosted Llama Vision** | Ingen overførsel | Kræver GPU-infrastruktur; lavere kvalitet | Langsigtet |

#### 5.3.4 Supplerende foranstaltninger

- **DPA + SCC (Modul 2 for direkte kald, Modul 3 for kald via OpenRouter)** med Anthropic.
- **Enterprise-aftale** med zero-retention for input/output (verificer årligt).
- **Tekst-først pipeline:** PDF'er med tekstlag håndteres udelukkende lokalt (PyMuPDF + Tesseract) — ingen Anthropic-kald.
- **Confidence-baseret fallback:** Anthropic kaldes kun ved OCR-confidence < 60 eller PDF uden tekst.
- **Billed-caching:** SHA-256 cache-opslag forhindrer gentagne Anthropic-kald for samme dokument.

#### 5.3.5 Konklusion

USA-overførsel til Anthropic er **nødvendig** for at levere pålidelig OCR-fallback på dårlige billeder. Med DPA + SCC + enterprise zero-retention + tekst-først pipeline + confidence-baseret fallback vurderes risikoen som **acceptabel**. EU-alternativer (Azure Document Intelligence, Mistral Pixtral) undersøges som langsigtet strategi.

### 5.4 Samlet TIA-konklusion

| Underbehandler | Nødvendighed | Minimization implementeret | Supplerende foranstaltninger | Risikoniveau |
|----------------|--------------|----------------------------|--------------------------------|--------------|
| OpenAI | Ja (RAG-embeddings) | Default knowledge-base er generelle regler | DPA + SCC + enterprise zero-retention | Acceptabel |
| OpenRouter | Ja (chat LLM) | `dataAccessEnabled` opt-in (default false), 20-besked-rulning | DPA + SCC + rate-limiting | Acceptabel |
| Anthropic | Ja (OCR-fallback) | Tekst-først pipeline, confidence-baseret fallback, billed-cache | DPA + SCC + enterprise zero-retention | Acceptabel |

**Samlet vurdering:** USA-overførslerne er nødvendige for at levere AI-funktionalitet på branchestandard-kvalitet. Med implementerede minimization-foranstaltninger, DPA + SCC og enterprise zero-retention-aftaler vurderes den samlede risiko som **acceptabel**. AlphaAi ApS forpligter sig til årligt at re-evaluere EU-alternativer og migrere, når kvaliteten er tilstrækkelig.

**Hoved-minimization:** `HermesAgent.dataAccessEnabled` per-tenant opt-in (default false) er den primære foranstaltning, der begrænser mængden af tenant-specifikke finansielle data sendt til OpenRouter. Uden opt-in sendes udelukkende brugerens spørgsmål og statisk system-prompt.

---

## 6. Løbende overvågning

### 6.1 Overvågningsproces

AlphaAi ApS overvåger løbende sine leverandører for at sikre, at sikkerheds- og compliance-krav opretholdes:

| Aktivitet | Frekvens | Ansvarlig |
|-----------|---------|-----------|
| Tjek for sikkerhedsadvisories fra leverandører | Ugentligt | System Administrator |
| Gennemgang af leverandørers sikkerhedsblog | Månedligt | Technical Lead |
| Opdatering af sub-processor-lister | Kvartalsvis | Compliance Officer |
| Gennemgang af SOC 2 / ISO 27001 / C5 certifikater | Årligt | Compliance Officer |
| Re-verifikation af OpenAI/OpenRouter/Anthropic zero-retention-aftaler | Årligt | Compliance Officer |
| Re-verifikation af SCC-aftaler (USA) | Årligt | Compliance Officer |
| Vurdering af nye lovkrav (GDPR, Bogføringsloven) | Årligt | Compliance Officer |
| Penetrationstest af AlphaFlow-integrationer | Årligt | Ekstern revisor |
| Opdatering af TIA for USA-underbehandlere | Årligt | Compliance Officer |
| Undersøgelse af EU-alternativer til USA-AI | Årligt | Technical Lead + Compliance Officer |

### 6.2 Sikkerhedsadvisories

Ved modtagelse af sikkerhedsadvisories fra en leverandør:

1. **Vurdering:** System Administrator vurderer alvorlighedsgraden og påvirkningen af AlphaFlow.
2. **Korrektion:** Relevant opdatering eller patch anvendes inden for:
   - **Kritisk:** 24 timer
   - **Høj:** 7 dage
   - **Middel/Lav:** Næste planlagte vedligeholdelsesvindue
3. **Dokumentation:** Alle sikkerhedsopdateringer dokumenteres i audit trail.
4. **Notifikation:** Compliance Officer informeres om hændelser af høj eller kritisk alvorlighed.

### 6.3 Sub-processor-overvågning

For leverandører med sub-underbehandlere (særligt Neon, IONOS, Storecove, OpenAI, OpenRouter, Anthropic, Brevo):

- Sub-processor-liste overvåges kvartalsvis for ændringer.
- Nye sub-underbehandlere accepteres kun, hvis de opfylder EU/EØS-kravet eller har indgået SCC.
- Ved ændringer i sub-processor-kæden vurderes konsekvensen for GDPR-compliance.
- Documenteres i løbende opdatering af dette dokument.

### 6.4 Breach-notifikation-SLA

| Leverandør | SLA for breach-notifikation til AlphaAi | Verificeret via |
|-----------|-----------------------------------------|------------------|
| Neon | 24 timer | DPA |
| IONOS | 24 timer | DPA |
| Storecove | 24 timer (påkræret) | DPA (skal verificeres) |
| Frisbii / Flatpay | 24 timer (påkræret) | DPA (skal verificeres) |
| OpenAI | 24 timer | DPA + enterprise-aftale |
| OpenRouter | 24 timer (påkræret) | DPA (skal verificeres) |
| Anthropic | 24 timer | DPA + enterprise-aftale |
| Simply / Brevo | 24 timer (påkræret) | DPA (skal verificeres) |

AlphaAi ApS underretter kunden straks efter at have modtaget underretning fra underbehandler, så kunden kan opfylde sin underretningspligt over for Datatilsynet (72 timer) og evt. registrerede (uden unødig forsinkelse).

---

## 7. Berørte leverandører ved incident

Ved en sikkerhedshændelse skal relevante leverandører kontaktes. Den fulde kontaktliste findes i `docs/BEREDSKABSPLAN.md` afsnit 7. Nedenfor er den leverandør-specifikke kontakttabel:

### 7.1 Leverandør-kontaktmatrix ved incident

| Incident-type | Berørte leverandører | Kontakt-kanal | Frist |
|---------------|---------------------|---------------|-------|
| **Database-brud / tab** | Neon (DB) | https://neon.tech/support, 24/7 chat | Straks |
| **Server-ned / VPS-fejl** | IONOS (VPS) | https://www.ionos.de/hilfe, 24/7 telefon + chat | Straks |
| **E-faktura-fejl** | Storecove | support@storecove.com | 2 timer |
| **Abonnementsbetaling-fejl** | Frisbii / Flatpay | https://www.frisbii.com/support | 4 timer |
| **AI-chat-fejl (Hermes)** | OpenRouter | https://openrouter.ai/contact | 4 timer |
| **Embedding-fejl (RAG)** | OpenAI | https://help.openai.com | 4 timer |
| **VLM-fejl (scanner)** | Anthropic | https://support.anthropic.com | 4 timer |
| **Email-fejl** | Simply / Brevo | (kontaktes via leverandør-specifik support) | 4 timer |
| **Momsangivelse-fejl** | SKAT | https://skat.dk kontakt | Næste arbejdsdag |
| **CVR-opslag-fejl** | Erhvervsstyrelsen | https://virk.dk kontakt | Næste arbejdsdag |
| **Persondata-brud (generel)** | Alle berørte + Datatilsynet | Datatilsynet: https://www.datatilsynet.dk | 72 timer (Datatilsynet) |

### 7.2 Eskalationsniveau

| Alvorlighed | Eskalerer til | Handling |
|-------------|---------------|----------|
| **Kritisk** (data-tab, brud med persondata) | Direktør + Compliance Officer + Berørte kunder | Aktivér beredskabsplan § 3.5 (Data breach) |
| **Høj** (langvarig nedetid, delvis data-tab) | Direktør + System Administrator | Aktivér relevant beredskabsplan-sektion |
| **Middel** (kortvarig nedetid, begrænset påvirkning) | System Administrator | Statusside opdateres |
| **Lav** (mindre fejl uden bruger-påvirkning) | System Administrator | Dokumenteres i audit-log |

### 7.3 Kommunikation med kunder

Ved incidents der påvirker kunder (jf. `docs/BEREDSKABSPLAN.md` afsnit 7.3):

| Tidsramme | Kanal | Indhold |
|-----------|-------|---------|
| < 15 min | Statusside | "Vi undersøger en teknisk hændelse" |
| < 1 time | Statusside + e-mail | Beskrivelse af problem og forventet løsningstid |
| Ved gendannelse | Statusside + e-mail | Bekræftelse af gendannelse + eventuelle påvirkninger |
| < 48 timer (ved data breach) | E-mail | Detaljeret hændelsesrapport |

---

## 8. Udskiftning af leverandører

### 8.1 Kriterier for skift

En leverandør skiftes ved en eller flere af følgende situationer:

| Kriterie | Beskrivelse |
|----------|-------------|
| **Compliance-fejl** | Leverandør kan ikke eller vil ikke underskrive DPA/SCC, eller overtræder eksisterende aftale |
| **Sikkerhedsbrud** | Alvorligt sikkerhedsbrud, der ikke er afhjulpet tilfredsstillende |
| **Sub-processor-ændring** | Leverandør tilføjer sub-underbehandler i USA uden forudgående godkendelse |
| **Prissætning** | Urimelige prismærskninger eller vilkårlige prisaftaler |
| **Tjeneste-kvalitet** | Oppetid under SLA-garanti i 3 sammenhængende måneder |
| **Lovgivningsmæssige ændringer** | Nye EU/Danske love forbyder eller begrænser brug af leverandøren |
| **Strategisk beslutning** | Migration til EU-alternativ (særligt for USA-AI-underbehandlere) |
| **Leverandør-lukning** | Leverandøren går konkurs eller indstiller tjenesten |
| **Manglende re-certificering** | Sikkerhedscertificering (SOC 2, ISO 27001, C5) ikke fornyet |

### 8.2 Migreringsplan-skabelon

Ved skift af teknisk leverandør følges denne skabelon:

```
1. Identifikation af behov
   ├── Dokumenteret årsag (compliance-fejl / breach / pris / etc.)
   ├── Risikovurdering af fortsat brug
   └── Tidslinje for skift

2. Evaluering af ny leverandør
   ├── Gennemgang af kriterier (afsnit 4.1)
   ├── Teknisk proof-of-concept
   ├── Sikkerhedsvurdering (inkl. TIA ved USA)
   └── DPA + SCC-indgåelse

3. Migreringsplanlægning
   ├── Data-eksport fra eksisterende leverandør
   │   ├── Format (JSON / SQL dump / API)
   │   ├── SHA-256 checksum
   │   └── Verifikation af fuldstændighed
   ├── Datamigrering til ny leverandør
   │   ├── Mapping (felt-for-felt)
   │   ├── Transformation (hvis nødvendigt)
   │   └── Validering (antal records, checksum)
   ├── Downtime-plan (minimeres)
   │   ├── Maintenance window
   │   ├── Forhåndsmeddelelse til kunder (30 dage)
   │   └── Statusside
   └── Validering af migreret data

4. Udførelse
   ├── Planlagt maintenance window (typisk weekend)
   ├── Backup før migrering (pre-restore safety backup)
   ├── Migrering med SHA-256 verificering
   ├── Integrationstest
   └── Produktionsswitch

5. Efterfølgende
   ├── Verificering af dataintegritet (48 timers observation)
   ├── Opsigelse af eksisterende leverandør
   │   ├── Skriftlig opsigelse
   │   ├── Bekræftelse af data-sletning hos gammel leverandør (jf. GDPR art. 17)
   │   └── Dokumentation af sletning
   └── Opdatering af dette dokument + DPA Bilag A
```

### 8.3 Specifikke migreringsplaner

#### 8.3.1 Database-migrering (Neon → alternativ)

1. **Eksport:** Full dump via `pg_dump` med alle tabeller + pgvector-extension.
2. **Verifikation:** SHA-256 checksum af eksportfilen.
3. **Import:** Import til ny database.
4. **Validering:** Tæl alle records pr. tabel og sammenlign med kilde.
5. **Test:** Kør integrationstest mod ny database (inkl. pgvector-cosine-distance-queries for knowledge-service).
6. **DNS/Connection string:** Opdater `DATABASE_URL` miljøvariabel.
7. **Overvågning:** Tæt overvågning i 48 timer efter migrering.
8. **Neon-op sigelse:** Skriftlig opsigelse + sletningsbekræftelse.

#### 8.3.2 VPS-migrering (IONOS → alternativ)

1. **Ny VPS-opsætning:** Klon af konfiguration (Caddy, PM2, Next.js).
2. **DNS TTL-minimering:** Sænk DNS TTL til 5 minutter 24 timer før skift.
3. **Data-synkronisering:** `rsync` af `Tenant-Backup/` og app-data til ny VPS.
4. **Switch:** Opdater DNS A-record til ny VPS IP.
5. **Verificering:** TLS-cert (Let's Encrypt), HSTS, sikkerhedshoveder.
6. **Gammel VPS:** Forbliver kørende i 7 dage som rollback, derefter deprovisionering.

#### 8.3.3 AI-underbehandler-migrering (OpenAI/OpenRouter/Anthropic → EU-alternativ)

1. **Model-benchmarking:** Sammenlign kvalitet mellem nuværende og EU-alternativ på dansk regnskabs-tekst.
2. **API-integration:** Implementer ny API-klient (`mini-services/knowledge-service/embedder.ts` eller `mini-services/hermes-agent/index.ts` eller `mini-services/scanner-service/src/vlm_client.py`).
3. **Re-embedding (for OpenAI):** Gen-embed alle dokumenter i knowledge-base med ny model. Kræver sletning + re-embedding af `KnowledgeChunk`-tabellen.
4. **A/B-test:** Kør begge modeller parallelt i 2 uger, sammenlign svar-kvalitet.
5. **Switch:** Opdater miljøvariabel (`OPENAI_API_KEY` / `OPENROUTER_API_KEY` / `ANTHROPIC_API_KEY`).
6. **Op sigelse:** Opsig gammel DPA, anmod om data-sletning.
7. **Opdatering:** Opdater LEVERANDØRSTYRING.md + DPA Bilag A.

### 8.4 Compliance under overgang

Under leverandørskift skal følgende opretholdes:

| Krav | Handling |
|------|----------|
| **Bogføringsloven §§ 10-12** | Audit trail (`src/lib/audit.ts` + `prisma/audit-immutability.sql`) forbliver uforanderlig under og efter migrering |
| **Bogføringsloven § 15** | 5-års opbevaringspligt opretholdes — ingen data slettes før 5 år er udløbet |
| **GDPR artikel 17** | Sletningsanmodning til eksisterende leverandør med dokumenteret bekræftelse |
| **GDPR artikel 28** | Ny DPA indgået med ny leverandør før dataoverførsel |
| **GDPR kapitel V** | Hvis ny leverandør er i tredjeland: SCC + TIA påkræret før dataoverførsel |
| **BEK 98 krav 2** | Backup-system (`src/lib/backup-engine.ts`) opretholder fuld backup-dækning under overgang |

### 8.5 Kommunikationsplan ved skift

| Tidspunkt | Handling | Målgruppe |
|-----------|----------|-----------|
| 60 dage før | Intern godkendelse (Direktør + Compliance Officer) | Internt |
| 30 dage før | Underretning til kunder (jf. DPA § 14) | Alle kunder |
| 14 dage før | Statusside opdateres med migreringsplan | Alle kunder |
| Dag for skift | Maintenance window meddeles | Berørte kunder |
| Efter skift | Bekræftelse på successfuld migrering | Alle kunder |
| 7 dage efter | Evalueringsrapport | Internt |

---

## 9. Konklusion

### 9.1 Samlet vurdering

AlphaAi ApS' valg af tekniske leverandører er baseret på objektive kriterier med vægtning af sikkerhed, GDPR-compliance og EU/EØS-hosting.

| Leverandør | Kategori | Kritiske krav opfyldt | Samlet risiko |
|-----------|----------|----------------------|---------------|
| Neon PostgreSQL | Kritisk — Infrastruktur | 5/5 (EU DC, SOC 2, DPA, SCC for admin) | Lav |
| IONOS VPS | Kritisk — Infrastruktur | 5/5 (EU, C5, IT-Grundschutz, DPA) | Lav |
| Storecove | Ikke-kritisk — EU | 4/5 (DPA påkræret) | Lav |
| Frisbii / Flatpay | Ikke-kritisk — EU | 4/5 (DPA påkræret) | Lav |
| OpenAI | Kritisk — AI USA | 4/5 (SCC + TIA påkræret) | Middel (accepteret med minimization) |
| OpenRouter | Kritisk — AI USA | 4/5 (SCC + TIA påkræret) | Middel (accepteret med `dataAccessEnabled` opt-in) |
| Anthropic | Kritisk — AI USA | 4/5 (SCC + TIA påkræret) | Middel (accepteret med tekst-først pipeline) |
| Simply / Brevo | Ikke-kritisk — EU | 4/5 (DPA påkræret) | Lav |
| SKAT | Myndighed | N/A | N/A |
| Erhvervsstyrelsen (VIRK/CVR) | Myndighed | N/A | N/A |
| Interne sub-systemer (5 stk.) | Intern | 5/5 (egen infra) | Lav |

### 9.2 Åbne handlinger

Følgende handlinger er åbne og skal afsluttes før eller umiddelbart efter produktionsskov:

| Handling | Ansvarlig | Frist |
|----------|-----------|-------|
| Indgå DPA med Storecove | Compliance Officer | Før produktion |
| Indgå DPA med Frisbii/Flatpay | Compliance Officer | Før produktion |
| Indgå DPA + SCC med OpenAI (enterprise) | Compliance Officer | Før produktion |
| Indgå DPA + SCC med OpenRouter | Compliance Officer | Før produktion |
| Indgå DPA + SCC med Anthropic (enterprise) | Compliance Officer | Før produktion |
| Indgå DPA med Simply/Brevo | Compliance Officer | Før produktion |
| Verificere Anthropic zero-retention-aftale | Compliance Officer | Før produktion |
| Verificere OpenRouter sub-processor-liste | Compliance Officer | Før produktion |
| Verificere Neon sub-processor-liste (AWS) | Compliance Officer | Før produktion |
| Udføre årlig TIA for USA-underbehandlere | Compliance Officer | Årligt |
| Undersøge EU-alternativer (Mistral, SiloGen, Mistral Pixtral) | Technical Lead | Årligt |

### 9.3 Dokumentrevision

| Version | Dato | Ændringer | Forfatter |
|---------|------|----------|-----------|
| 1.0 | 2025 | Første udgave | AlphaAi ApS |
| 2.0 | 2025 | Opdateret med konkrete kode-referencer | AlphaAi ApS |
| 2.1 | 2025 | Tilføjet IONOS VPS | AlphaAi ApS |
| **3.0** | **08.06.2026** | **Komplet omskrivning (D4-DPA-LEV):** Tilføjet alle 15 integrationer fra P1-INT-analysen (Neon, IONOS, Storecove, Frisbii, OpenAI, OpenRouter, Anthropic, Simply/Brevo, SKAT, Erhvervsstyrelsen, + 5 interne sub-systemer + 2 inaktive); tilføjet detaljeret TIA for de 3 USA-AI-underbehandlere med data-minimization, nødvendighed, alternativer og supplerende foranstaltninger; tilføjet åbne handlinger-liste; rettet klassifikation (kritisk infrastruktur / kritisk AI USA / ikke-kritisk EU / myndighed / intern); tilføjet bank-API-stubs og z-ai-web-dev-sdk som inaktive integrationer for transparens; præcise datakategorier for hver leverandør fra P1-INT | AlphaAi ApS Compliance |

### 9.4 Godkendelse

| Rolle | Navn | Dato | Underskrift |
|------|------|------|-------------|
| Direktør | Jess Christoffersen | 08.06.2026 | _________________________________ |
| Compliance Officer | [Indsættes] | | _________________________________ |
| System Administrator | Jess Christoffersen | 08.06.2026 | _________________________________ |
| Technical Lead | [Indsættes] | | _________________________________ |

---

*Dette dokument er udarbejdet af AlphaAi ApS som del af compliance-dokumentationen til Erhvervsstyrelsens anmeldelse af AlphaFlow som standard bogføringssystem (BEK 98).*

*Dokumentet opdateres årligt eller ved væsentlige ændringer i leverandørsammensætningen. Alle tekniske referencer er verificeret i kodebasen (P1-INT-analysen). Ingen opdigtede underbehandlere.*
