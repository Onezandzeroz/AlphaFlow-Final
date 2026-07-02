# AlphaFlow — Anmeldelsespakke

> **Anmeldelsespakke til Erhvervsstyrelsen — Registering/godkendelse af elektronisk bogføringssystem**
>
> **Bekendtgørelse:** Bekendtgørelse om elektroniske bogføringssystemer (BEK nr. 98 af 13. februar 2024)
>
> **Lovgrundlag:** Bogføringsloven (LBK nr. 1457 af 13. december 2019)
>
> **Pakke-version:** 1.0 — revideret 2026
>
> **Ansvarlig:** AlphaAi ApS

---

## 1. Indledning

Denne anmeldelsespakke er AlphaAi ApS' samlede dokumentation i forbindelse med ansøgning til Erhvervsstyrelsen om **registering/godkendelse af AlphaFlow som elektronisk bogføringssystem** jf. Bogføringsloven og Erhvervsstyrelsens bekendtgørelse om elektroniske bogføringssystemer.

Anmeldelsespakken fungerer som **forside og indeks** for den samlede dokumentation i projektets `docs/`-mappe og henviser til de specifikke dokumenter, der uddyber de enkelte kravområder. Pakken er udarbejdet med udgangspunkt i den faktiske, implementerede kodebase — ingen planlagte, hypotetiske eller "på vej"-funktioner er beskrevet som eksisterende.

> **Princip om åbenhed:** Hvor AlphaFlow endnu ikke fuldt ud dækker et krav (f.eks. kreditnota-flow, lønmodul, MitID), er dette angivet eksplicit i afsnit 4 og 8 med henvisning til `UDBEDRINGSPLAN.md`. Erhvervsstyrelsens anmeldelsespraksis tilskynder åbenhed om kendte mangler.

---

## 2. Ansøger-oplysninger

| Feltpost | Værdi |
|---|---|
| **Selskab** | AlphaAi ApS |
| **CVR-nummer** | _[skabelon: indtast CVR — anvendes ved indsendelse via virk.dk]_ |
| **Kontaktperson** | _[skabelon: navn, e-mail, telefon]_ |
| **Produkt-navn** | AlphaFlow |
| **Produkt-version** | 1.0.0 (pakke-navn: `alphaai-accounting`) |
| **Domæne** | `alphaflow.dk` (`www.alphaflow.dk`) |
| **Produkt-type** | Cloud-baseret SaaS — multi-tenant dansk bogføringsplatform |
| **Lanceringsdato** | _[skabelon: indtast produktions-lanceringsdato]_ |
| **Dataansvarlig** | AlphaAi ApS (App Owner) |
| **Hosting-udbydere** | Neon, Inc. (database) + IONOS SE (VPS-hosting + backup-lagring) — begge EU-baserede |
| **Anmeldelsesansvarlig** | _[skabelon: navn, titel]_ |

> Alle felter markeret "_[skabelon: …]_" udfyldes ved den endelige indsendelse via [virk.dk](https://www.virk.dk).

---

## 3. Produktbeskrivelse (kort)

**AlphaFlow** er en cloud-baseret, multi-tenant dansk bogføringsplatform (SaaS) rettet mod **små og mellemstore danske virksomheder**. Platformen tilbyder:

- **Dobbelt bogføring** med FSR-38 standardkontoplan, finansjournal, hovedbog, tilbagevendende posteringer, regnskabsperioder med lock, årsafslutning.
- **Fakturering** — salgsfakturaer (DRAFT/SENT/PAID/CANCELLED) med PDF-generering, e-mail-afsendelse og e-fakturering via Peppol/NemHandel (Storecove som Access Point).
- **E-fakturering** — OIOUBL (NemHandel) + Peppol BIS Billing 3.0; modtagelse af e-fakturaer i indbakke med godkend/afvis-workflow.
- **Momsangivelse** — indsendelse direkte til Skattestyrelsens Moms-API (OAuth2 `client_credentials`).
- **Bank-integration** (scaffolding) — bank-forbindelser med AES-256-GCM-krypterede tokens; manuel afstemning ( ingen AI-bankafstemning i produktion).
- **AI-assistent Hermes** — Socket.IO chat med OpenRouter LLM, per-tenant opt-in (`dataAccessEnabled`), knowledge-RAG via OpenAI-embeddings, proaktive påmindelser.
- **Dokument-OCR** — Tesseract + Anthropic Claude VLM, returnerer struktureret faktura/kvitteringsdata og FSR-konto-forslag.
- **PWA** — installerbar, offline-understøttelse, kamera-adgang til kvitteringsfotos.
- **Multi-tenant isolation** — `Company` som tenant-grænse, RBAC med 5 roller (OWNER/ADMIN/ACCOUNTANT/VIEWER/AUDITOR) og 18 permissions, SuperDev oversight-mode (read-only cross-tenant).
- **Auth** — email+password (bcrypt, 12 rounds) + TOTP 2FA (RFC 6238) + 10 backup-koder + email-verifikation.
- **Audit-trail** — 3-niveau immutability (app CREATE-only + PostgreSQL BEFORE UPDATE/DELETE triggere + `onDelete:Restrict` cascade).
- **Backup** — node-cron scheduler (time/dag/uge/måned), AES-256-GCM-krypterede ZIP-filer pr. tenant, SHA-256 checksum, retention op til 5 år (monthly) jf. Bogføringsloven §15.

### Begrænsninger — hvad AlphaFlow **ikke** omfatter

Følgende funktioner findes **ikke** i platformen og indgår ikke i anmeldelsesomfanget:

| Område | Status |
|---|---|
| **Lønmodul** | Ikke implementeret (kun `TransactionType.SALARY` enum findes). |
| **Kreditnota-flow i UI** | Ikke implementeret (`EInvoiceType.CREDIT_NOTE` enum findes, men ingen oprettelsesflow). |
| **Reelle bank-API-kald** | Ikke implementeret — Tink/Nordea/Danske Bank/Jyske Bank er stubs; kun Demo-provider returnerer data. |
| **MitID / NemID / BankID** | Ikke implementeret — kun email+password+TOTP. |
| **Varekartotek** | Ikke implementeret (invoice line-items er JSON, ingen Item-master). |
| **AM-bidrag / årsopgørelse / e-indkomst til SKAT** | Ikke implementeret — KUN momsangivelse indsendes. |
| **AI-bankafstemning i produktion** | `z-ai-web-dev-sdk` er sandbox-only og fejler graceful — matching er manuel. |
| **Native mobil-app** | Ikke implementeret — kun PWA. |
| **Approval-workflow** | Ikke implementeret (ingen flertrins godkendelse). |
| **Chat med menneskelig revisor** | Hermes er AI-kun. |

> Disse begrænsninger er bevidste produktvalg for AlphaFlows målgruppe (små/mellemstore virksomheder). De fleste påvirker ikke Bogføringslovens krav til selve bogføringsmaterialet, men angives her for fuld gennemsigtighed.

---

## 4. Omfang & funktionel dækning

Nedenstående tabel opsummerer AlphaFlows dækning af Bogføringslovens og BEK 98's hovedkrav. Den detaljerede krav-for-krav kortlægning findes i `docs/COMPLIANCE_RAPPORT.md`.

| Kravområde | Lov-reference | AlphaFlow-implementering | Status |
|---|---|---|---|
| **Systemegnethed** | Bogføringsloven §3 | Dobbelt bogføring (JournalEntry + JournalEntryLine), FSR-38 standardkontoplan, finansjournal, hovedbog, regnskabsperioder med lock. | ✅ Opfyldt |
| **Uforanderlighed / immutability** | Bogføringsloven §10–12 | AuditLog 3-niveau (app CREATE-only + PostgreSQL BEFORE UPDATE/DELETE triggere + `onDelete:Restrict` cascade). Konto-deaktivering i stedet for hard-delete. | ✅ Opfyldt (delvist) — ingen kryptografisk hash-chain mellem posteringer; immutability håndhæves via DB-triggere + audit-log. |
| **Backup & 5-års retention** | Bogføringsloven §15 | node-cron scheduler: hourly/daily/weekly/monthly + cleanup; AES-256-GCM-krypterede `.zip.enc`-filer pr. tenant; SHA-256 checksum; monthly retention 60 måneder = 5 år; `Tenant-Backup/` på IONOS VPS. | ✅ Opfyldt |
| **SAF-T Financial DK eksport** | BEK 98 | `/api/export-saft` — maskinlæsbar eksport af hele regnskabet. | ✅ Opfyldt |
| **Årsrapport (XBRL/CSV)** | BEK 98 | `/api/reports/annual-xbrl` + `/api/reports/annual-csv`. | ✅ Opfyldt |
| **E-fakturering (NemHandel/Peppol)** | BEK 98 | Send/modtag via Storecove som Peppol Access Point. OIOUBL + Peppol BIS Billing 3.0. E-faktura-indbakke med godkend/afvis. | ✅ Opfyldt |
| **Momsangivelse til SKAT** | BEK 98 | `/api/vat/submit` — OAuth2 `client_credentials`, moms:indberet-scope. **KUN moms** — ingen årsopgørelse/e-indkomst. | ✅ Opfyldt (kun moms) |
| **Standardkontoplan** | BEK 98 | FSR-38 kontoplan (Account-model) + `StandardAccountMapping` til SKAT's fællesoffentlige standardkontoplan. | ✅ Opfyldt |
| **Udbyderskift / dataeksport** | Bogføringsloven §13; BEK 98 | `/api/export-tenant` (JSON + filer, SHA-256 manifest), `/api/export-saft`, `/api/company/export-info`. | ✅ Opfyldt |
| **Fortløbende bilagsnummerering** | Bogføringsloven §10 | `Company.journalPrefix` (default "BIL") + `nextJournalSequence`. | ✅ Opfyldt |
| **Valutahåndtering** | Bogføringsloven §14 | Transaction-model med `currency`, `exchangeRate`, `amountDKK`. | ✅ Opfyldt |
| **IT-sikkerhed (RBAC, 2FA, kryptering)** | BEK 98 (Hovedkrav 2) | RBAC 5 roller/18 permissions, TOTP 2FA, AES-256-GCM (bank-tokens/TOTP/backup), bcrypt 12 rounds, TLS 1.2/1.3 via Caddy. | ✅ Opfyldt (se §8 åbenhed om mangler) |
| **Risikovurdering** | BEK 98 | `docs/RISIKOVURDERING.md`. | ✅ Opfyldt |
| **Beredskabsplan (DR)** | BEK 98 | `docs/BEREDSKABSPLAN.md`. | ✅ Opfyldt |
| **Databehandleraftaler** | GDPR Art. 28; BEK 98 | `docs/DATABEHANDLERAFTALE.md` + `docs/LEVERANDØERSTYRING.md`. | ✅ Opfyldt |

> Den fulde krav-for-krav tjekliste findes i `docs/COMPLIANCE_RAPPORT.md`. Krav, hvor AlphaFlow har kendte mangler (f.eks. kreditnota-OIOUBL i UI), er markeret deri og listet i afsnit 8 nedenfor.

---

## 5. Arkitektur-oversigt (kort)

AlphaFlow er bygget som en multi-tenant SaaS-platform med en Next.js-kerne og 5 mini-services, hostet på IONOS VPS med Neon PostgreSQL som databaselag.

| Komponent | Teknologi | Rolle |
|---|---|---|
| **Web-app** | Next.js 16 (App Router) + TypeScript 5 + Tailwind CSS 4 | Brugergrænseflade, API-routes, SSR. Port 3000. |
| **Database** | PostgreSQL på Neon (serverless) + Prisma ORM + pgvector | Primært datalager for alle tenant-data. EU-datacentre (Frankfurt + Amsterdam). |
| **Reverse proxy / TLS** | Caddy (self-hosted på IONOS VPS) | TLS 1.2/1.3 (Let's Encrypt), security headers, routing til mini-services via `?XTransformPort=<port>`. |
| **Proces-manager** | PM2 (fork-mode, 6 processer) | Autorestart (max 10 restarts, 5s delay), separate log-filer i `./logs/`. |
| **Hosting** | IONOS VPS (EU/Tyskland, IONOS SE) | Applikationsserver + lokal backup-lagring (`Tenant-Backup/`) + uploads (`uploads/`). |
| **Mini-service: hermes-agent** | Bun + Socket.IO + Prisma (port 3004) | AI-chat-assistent, OpenRouter LLM, reminders. Deler Neon DB. |
| **Mini-service: knowledge-service** | Bun + rå HTTP + Prisma + pgvector (port 3006) | RAG-knowledge base, OpenAI-embeddings (1536-dim). Deler Neon DB. |
| **Mini-service: notification-ws** | Bun + Socket.IO (port 3001) | Real-time notifikationer, in-memory. |
| **Mini-service: scanner-service** | Python + FastAPI + SQLite (port 3005) | OCR (Tesseract) + Anthropic Claude VLM. |
| **Mini-service: tokenpay-access** | Bun + Hono + SQLite (port 3100) | `.tbkey` proof-verifikation, adgangsstyring. |

**Multi-tenant isolation:** `Company` er tenant-grænse, `companyId` på tværs af 24 Prisma-modeller, RBAC-isolation via `tenantFilter(ctx)`. SuperDev oversight-mode tillader read-only cross-tenant adgang for AlphaAi-admin.

**Backup-lag:** Neons managed PITR (Point-in-Time Recovery, 7 dage) — defense-in-depth lag 1; AlphaFlows egne `Tenant-Backup/` ZIP-filer (AES-256-GCM, SHA-256, 5-års retention) — lag 2.

> Den fulde arkitekturbeskrivelse (komponenter, dataflow, netværk) findes i `docs/COMPLIANCE_RAPPORT.md` og `docs/NEON & IONOS_IT_SIKKERHED.md`.

---

## 6. Dokumentindeks

Nedenstående tabel indekserer **alle 14 dokumenter** i AlphaFlows `docs/`-mappe. 10 dokumenter er revideret i denne anmeldelsesrunde (2026); 4 dokumenter er udenfor scope for denne revision, og den eksisterende version gælder.

| # | Dokument | Formål | Status |
|---|---|---|---|
| 1 | `ANMELDELSESPAKKE.md` | Dette dokument — forside og indeks for anmeldelsen til Erhvervsstyrelsen. | Revideret 2026 |
| 2 | `COMPLIANCE_RAPPORT.md` | Krav-for-krav kortlægning af Bogføringsloven + BEK 98 med tekniske implementeringsreferencer. | Revideret 2026 |
| 3 | `BRUGSVEJLEDNING.md` | Brugermanual for alle funktioner i AlphaFlow (bogføring, fakturering, moms, bank, 2FA, e-faktura, årsregnskab m.m.). | Revideret 2026 |
| 4 | `ENCRYPTION.md` | Detaljeret kryptografisk dokumentation (AES-256-GCM, bcrypt, SHA-256, TLS, nøglehåndtering). | Revideret 2026 |
| 5 | `DATABEHANDLERAFTALE.md` | Standard databehandleraftale (GDPR Art. 28) mellem AlphaAi ApS og AlphaFlow-brugere, med referencer til underbehandlere. | Revideret 2026 |
| 6 | `RISIKOVURDERING.md` | IT-risikovurdering — trusselsidentifikation, risikomatrix, eksisterende kontroller, restrisici. | Revideret 2026 |
| 7 | `LEVERANDØERSTYRING.md` | Evaluering og styring af tekniske leverandører (Neon, IONOS, Storecove, OpenAI/OpenRouter/Anthropic, SKAT, Frisbii). | Revideret 2026 |
| 8 | `BEREDSKABSPLAN.md` | Disaster Recovery-plan — RTO/RPO, gendannelsesprocedurer, backup-strategi, kontaktliste. | Revideret 2026 |
| 9 | `NEON & IONOS_IT_SIKKERHED.md` | Tredjeparts IT-sikkerhedsdokumentation for de to primære infrastruktur-udbydere (Neon DB + IONOS VPS). | Revideret 2026 |
| 10 | `TOKENBAY-ACCESS-ENV-GUIDE.md` | Miljø- og opsætningsguide for TokenPay/TokenBay-adgangssystemet (`.tbkey` proofs, trial, free tier). | Revideret 2026 |
| 11 | `UDBEDRINGSPLAN.md` | Plan for afhjælpning af kendte mangler (fra P1-SEC-analyse). | Udenfor scope for denne revision — eksisterende version gælder. |
| 12 | `SUBMISSION_CHECKLIST.md` | Tjekliste for selve indsendelsen til Erhvervsstyrelsen via virk.dk. | Udenfor scope for denne revision — eksisterende version gælder. |
| 13 | `PROJECTS_IMPLEMENTATION.md` | Implementeringsnoter for valgfrit projekt-modul. | Udenfor scope for denne revision — eksisterende version gælder. |
| 14 | `MULTI_TENANT_PLAN.md` | Designnoter for multi-tenant-arkitektur. | Udenfor scope for denne revision — eksisterende version gælder. |

> Dokumenterne 1–10 udgør den ajourførte anmeldelsespakke for 2026-revisionen. Dokument 11 (UDBEDRINGSPLAN) refereres fra afsnit 8 nedenfor og opretholdes som separat løbende dokument.

---

## 7. Compliance-oversigt

Nedenstående tabel henviser til de specifikke dokumenter, der uddyber hvert compliance-område. Anmeldelsen bygger på tværgående dokumentation — intet krav er alene dækket af dette dokument.

| Compliance-område | Lov-reference | Hoveddokument | Supplerende dokumenter |
|---|---|---|---|
| **Bogføringsloven-overholdelse** | LBK 1457/2019 (§3, §10–12, §13, §14, §15) | `COMPLIANCE_RAPPORT.md` | `BRUGSVEJLEDNING.md`, `ENCRYPTION.md` |
| **BEK 98 — elektroniske bogføringssystemer** | BEK 98 af 13. feb. 2024 | `COMPLIANCE_RAPPORT.md` | `BEREDSKABSPLAN.md`, `RISIKOVURDERING.md` |
| **GDPR — persondata** | EU 2016/679 (Art. 5, 25, 28, 32, 33, 34) | `DATABEHANDLERAFTALE.md` | `COMPLIANCE_RAPPORT.md`, `LEVERANDØERSTYRING.md` |
| **IT-sikkerhed** | BEK 98 (Hovedkrav 2); GDPR Art. 32 | `NEON & IONOS_IT_SIKKERHED.md` | `ENCRYPTION.md`, `RISIKOVURDERING.md` |
| **Risikovurdering** | BEK 98 | `RISIKOVURDERING.md` | `UDBEDRINGSPLAN.md` |
| **Beredskab / Disaster Recovery** | BEK 98 | `BEREDSKABSPLAN.md` | `NEON & IONOS_IT_SIKKERHED.md` |
| **Leverandørstyring** | GDPR Art. 28; BEK 98 | `LEVERANDØERSTYRING.md` | `DATABEHANDLERAFTALE.md`, `NEON & IONOS_IT_SIKKERHED.md` |
| **Databehandleraftaler** | GDPR Art. 28 | `DATABEHANDLERAFTALE.md` | `LEVERANDØERSTYRING.md` |
| **Kryptografisk sikkerhed** | GDPR Art. 32; BEK 98 | `ENCRYPTION.md` | `NEON & IONOS_IT_SIKKERHED.md` |
| **Adgangsstyring (RBAC + 2FA)** | BEK 98 | `COMPLIANCE_RAPPORT.md` | `BRUGSVEJLEDNING.md` |
| **Backup & retention (5 år)** | Bogføringsloven §15 | `COMPLIANCE_RAPPORT.md` | `BEREDSKABSPLAN.md`, `NEON & IONOS_IT_SIKKERHED.md` |

### Dataflow ud af EU/EEA

Tre underbehandlere flytter persondata til USA (SCC + TIA påkrævet — se `DATABEHANDLERAFTALE.md` og `LEVERANDØERSTYRING.md`):

1. **OpenAI, Inc.** (USA) — embeddings til Hermes Knowledge RAG.
2. **OpenRouter, Inc.** (USA) — Hermes chat-LLM (videresender til Anthropic/Meta).
3. **Anthropic PBC** (USA) — scanner VLM (billeder af kvitteringer/fakturaer).

Data minimization: `HermesAgent.dataAccessEnabled` er per-tenant opt-in (default false) — uden opt-in sendes KUN spørgsmål + statisk system-prompt, ikke tenant-specifikke finansielle data.

---

## 8. Åbenhed om mangler

AlphaAi ApS har i forbindelse med denne anmeldelse identificeret følgende kendte mangler i platformen. Manglerne er uddybet i `docs/RISIKOVURDERING.md` med restrisici, og afhjælpningsplan findes i `docs/UDBEDRINGSPLAN.md`. Erhvervsstyrelsens anmeldelsespraksis tilskynder åbenhed om kendte mangler, og nedenstående liste er derfor inkluderet her.

### Sikkerhedsmæssige mangler

1. **Ingen Content-Security-Policy (CSP) header** — hverken i `next.config.ts` eller Caddyfile. Øger potentiel XSS-konsekvens.
2. **Ingen CSRF-token** — afhængig af `SameSite=Lax` cookie + Bearer-token Authorization header.
3. **Ingen Next.js `middleware.ts`** — rate-limiting og auth håndteres pr. route via `withGuard`.
4. **Ingen antivirus-scanning af uploads** — kun MIME-whitelist + størrelsesgrænse (25 MB).
5. **Ingen account-lockout** — kun IP-baseret rate-limiting (in-memory, nulstilles ved server-restart).
6. **Ingen key rotation / versioning** — `ENCRYPTION_KEY` og `PROOF_ENCRYPTION_KEY` er statiske.
7. **Caddy `rate_limit` plugin ikke installeret** — rate-limiting udelukkende in-memory app-level.
8. **Password min. længde kun 6 tegn** — under NIST 800-63B anbefaling på 8.
9. **Webhook HMAC-fallback "accept all" i dev** — hvis `WEBHOOK_SECRET` er tom; skal sikres i produktion.

### Funktionelle mangler (i relation til anmeldelsen)

10. **Ingen kryptografisk hash-chain på posteringer** — Bogføringsloven §10–12 immutability håndhæves KUN via AuditLog 3-niveau + PostgreSQL-triggere, ikke via hash-kæde mellem posteringer.
11. **Ingen kreditnota-flow i UI** — `EInvoiceType.CREDIT_NOTE` enum findes, men ingen oprettelsesflow.
12. **Ingen reelle bank-API-kald** — Tink/Nordea/Danske/Jyske er stubs; kun Demo-provider virker.
13. **Ingen MitID/BankID** — kun email+password+TOTP.
14. **Ingen AI-bankafstemning i produktion** — `z-ai-web-dev-sdk` er sandbox-only.
15. **Uploads ukrypteret på VPS-disk** — `uploads/`-filer er ukrypteret; backup-filer er derimod AES-256-GCM-krypterede. Afhænger af disk-encryption + adgangskontrol på VPS.

> Manglende punkt 10 (hash-chain) er den eneste, der potentielt påvirker Erhvervsstyrelsens fortolkning af §10–12 — herunder om den implementerede AuditLog + DB-triggere opfylder kravet om "uforanderlig dokumentation". AlphaAi ApS anser AuditLog 3-niveau for at opfylde kravet, men anerkender at en kryptografisk hash-chain ville være en yderligere sikkerhed.

Den fulde restrisiko-matrix findes i `docs/RISIKOVURDERING.md`, og afhjælpningsplanen (med prioriteter og tidsrammer) findes i `docs/UDBEDRINGSPLAN.md`.

---

## 9. Vedligeholdelse & ændringsstyring

Anmeldelsespakken holdes ajour gennem følgende proces:

### Versionsstyring

- Alle dokumenter er versioneret i projektets git-repository sammen med kildekoden.
- Hver dokument-revision har en commit-besked på formen `docs(rev-2026): <fil> — <kort beskrivelse>`.
- Ændringer i kode, der påvirker dokumentationen (f.eks. nye API-routes, ændrede krypteringsmetoder, nye underbehandlere), skal medføre en tilsvarende dokumentopdatering i samme PR.

### Review-cadence

| Type | Frekvens | Ansvarlig |
|---|---|---|
| **Årlig review** | Hvert år (Q1) | AlphaAi ApS — teknisk ansvarlig |
| **Ved væsentlig produktændring** | Efter behov | AlphaAi ApS — teknisk ansvarlig |
| **Ved udbyder-ændring** (f.eks. ny sub-processor hos Neon) | Ved modtagelse af underretnings-e-mail | AlphaAi ApS — DPO / dataansvarlig |
| **Ved ny regulering** (f.eks. opdatering af BEK 98) | Ved ikrafttrædelse | AlphaAi ApS — compliance-ansvarlig |

### Knyttning til anmeldelsen

- Erhvervsstyrelsen underrettes ved væsentlige ændringer i platformens arkitektur, der påvirker anmeldelsesgrundlaget (jf. BEK 98 § 6).
- Mindre ændringer (f.eks. version-opdateringer af afhængigheder) dokumenteres i git-historikken uden separat underretning.

---

## 10. Underskrift

| Rolle | Navn | Dato | Underskrift |
|---|---|---|---|
| Anmeldelsesansvarlig (teknisk) | _[skabelon]_ | _[dato]_ | _[underskrift]_ |
| DPO / dataansvarlig | _[skabelon]_ | _[dato]_ | _[underskrift]_ |
| Ledelse (AlphaAi ApS) | _[skabelon]_ | _[dato]_ | _[underskrift]_ |

---

*Bekræftelse: Denne anmeldelsespakke er udarbejdet på baggrund af en fuld kodebase-analyse (Fase 1–7) og afspejler AlphaFlow v1.0.0 som implementeret pr. 2026. Alle tekniske angivelser er verificerbare i kildekoden.*

*Udarbejdet af AlphaAi ApS — 2026*
