# AlphaFlow — Anmeldelsespakke

> **Anmeldelsespakke til Erhvervsstyrelsen — Registering/godkendelse af elektronisk bogføringssystem**
>
> **Bekendtgørelse:** Anmeldelsesbekendtgørelsen (BEK nr. 98 af 26. januar 2023) — Bekendtgørelse om anmeldelse og registrering af digitale standard bogføringssystemer; suppleret af Kravbekendtgørelsen (BEK nr. 97 af 26. januar 2023) — Bekendtgørelse om krav til digitale standard bogføringssystemer.
>
> **Lovgrundlag:** Lov om bogføring (LOV nr. 700 af 24. maj 2022)
>
> **Pakke-version:** 1.0 — revideret 2026
>
> **Ansvarlig:** AlphaAi Consult ApS

---

## 1. Indledning

Denne anmeldelsespakke er AlphaAi Consult ApS' samlede dokumentation i forbindelse med ansøgning til Erhvervsstyrelsen om **registering/godkendelse af AlphaFlow som elektronisk bogføringssystem** jf. Bogføringsloven og Erhvervsstyrelsens bekendtgørelse om elektroniske bogføringssystemer.

Anmeldelsespakken fungerer som **forside og indeks** for den samlede dokumentation i projektets `docs/`-mappe og henviser til de specifikke dokumenter, der uddyber de enkelte kravområder. Pakken er udarbejdet med udgangspunkt i den faktiske, implementerede kodebase — ingen planlagte, hypotetiske eller "på vej"-funktioner er beskrevet som eksisterende.

---

## 2. Ansøger-oplysninger

| Feltpost | Værdi |
|---|---|
| **Selskab** | AlphaAi Consult ApS |
| **CVR-nummer** | 46312058 |
| **Kontaktperson** | Jess Martin Christoffersen, alphaaiconsult@gmail.com, 61 73 60 76 |
| **Produkt-navn** | AlphaFlow |
| **Produkt-version** | 1.0.0 (pakke-navn: `alphaai-accounting`) |
| **Domæne** | `alphaflow.dk` (`www.alphaflow.dk`) |
| **Produkt-type** | Cloud-baseret SaaS — multi-tenant dansk bogføringsplatform |
| **Lanceringsdato** | _[skabelon: indtast produktions-lanceringsdato]_ |
| **Dataansvarlig** | AlphaAi Consult ApS (App Owner) |
| **Hosting-udbydere** | Neon, Inc. (database) + IONOS SE (VPS-hosting + backup-lagring) — begge EU-baserede |
| **Anmeldelsesansvarlig** | Jess Martin Christoffersen, Direktør |

> Alle felter markeret "_[skabelon: …]_" udfyldes ved den endelige indsendelse via [virk.dk](https://www.virk.dk).

---

## 3. Produktbeskrivelse (kort)

**AlphaFlow** er en cloud-baseret, multi-tenant dansk bogføringsplatform (SaaS) rettet mod **små og mellemstore danske virksomheder**. Platformen tilbyder:

- **Dobbelt bogføring** med FSR-baseret standardkontoplan, finansjournal, hovedbog, tilbagevendende posteringer, regnskabsperioder med lock, årsafslutning.
- **Fakturering** — salgsfakturaer (DRAFT/SENT/PAID/CANCELLED) med PDF-generering, e-mail-afsendelse og e-fakturering via Peppol/NemHandel (Storecove som Access Point).
- **E-fakturering** — OIOUBL (NemHandel) + Peppol BIS Billing 3.0; modtagelse af e-fakturaer i indbakke med godkend/afvis-workflow.
- **Momsangivelse** — indsendelse direkte til Skattestyrelsens Moms-API (OAuth2 `client_credentials`).
- **Bank-integration** (scaffolding) — bank-forbindelser med AES-256-GCM-krypterede tokens; AI-assisteret bankafstemning er implementeret i produktion via OpenRouter (LLM). Tre-niveau matching i `src/lib/matching-engine.ts`: (1) regelbaseret eksakt (beløb ±0,01 DKK, dato ±3 dage, reference), (2) fuzzy (beløb ±5 DKK, dato ±7 dage, beskrivelses-lighed >70%), (3) AI via OpenRouter med konfidens-score. AI-match med konfidens ≥0,95 autoprogrammeres (MATCHED); 0,80–0,95 markeres AI_SUGGESTED og kræver manuel godkendelse; <0,80 ignoreres. AI-output overstyrer aldrig automatisk bogførte posteringer uden brugergodkendelse.
- **AI-assistent Hermes** — Socket.IO chat via OpenRouter (konfigurerbar LLM-model), knowledge-RAG via OpenRouter (embedding-modeller), proaktive påmindelser. Dataadgang er per-tenant opt-in (`dataAccessEnabled`, default false) — uden opt-in sendes kun brugerspørgsmål og en statisk system-prompt. Se Bilag 4 (Bilag-04_Brugsvejledning.md) afsnit 13.
- **Dokument-OCR** — Tesseract + VLM via OpenRouter (vision-language model), returnerer struktureret faktura/kvitteringsdata og FSR-konto-forslag.
- **PWA** — installerbar, offline-understøttelse, kamera-adgang til kvitteringsfotos.
- **Multi-tenant isolation** — `Company` som tenant-grænse, RBAC med 5 roller (OWNER/ADMIN/ACCOUNTANT/VIEWER/AUDITOR) og 23 permissions i 7 kategorier, SuperDev oversight-mode (read-only for tenant-regnskabsdata; SuperDev-administrative endpoints for abonnements-/trial-styring forbliver kaldbare).
- **Auth** — email+password (bcrypt, 12 rounds) + TOTP 2FA (RFC 6238) + 10 backup-koder + email-verifikation.
- **Audit-trail** — 3-niveau immutability (app CREATE-only + PostgreSQL BEFORE UPDATE/DELETE triggere + `onDelete:Restrict` cascade).
- **Backup** — node-cron scheduler (time/dag/uge/måned), AES-256-GCM-krypterede ZIP-filer pr. tenant, SHA-256 checksum, retention op til 5 år (monthly) jf. BEK 97 §3 (5-års opbevaring) og §7 (backup) — udstedt i medfør af Lov om bogføring §15.

### Funktionelle afgrænsninger

Følgende funktionelle afgrænsninger er relevante for anmeldelsesomfanget:

| Område | Status |
|---|---|
| **Reelle bank-API-kald** | Delvist — Tink er en reel integration; Nordea/Danske Bank/Jyske Bank er stubs (returnerer fejl); Demo-provider leverer syntetiske data. PSD2 consent-flow virker for Tink. |
| **MitID / NemID / BankID** | Autentificering via email + password + TOTP 2FA. |

---

## 4. Omfang & funktionel dækning

Nedenstående tabel opsummerer AlphaFlows dækning af Bogføringslovens og BEK 98's hovedkrav. Den detaljerede krav-for-krav kortlægning findes i `docs/Bilag-02_Compliance-rapport.md`.

| Kravområde | Lov-reference | AlphaFlow-implementering | Status |
|---|---|---|---|
| **Systemegnethed** | Bogføringsloven §3 | Dobbelt bogføring (JournalEntry + JournalEntryLine), FSR-baseret standardkontoplan, finansjournal, hovedbog, regnskabsperioder med lock. | ✅ Opfyldt |
| **Uforanderlighed / immutability** | BEK 97 Bilag 1 (bogføringskrav — uforanderlighed) samt Lov om bogføring §13 (sikring mod ødelæggelse/forvanskning) | AuditLog 3-niveau (app CREATE-only + PostgreSQL BEFORE UPDATE/DELETE triggere + `onDelete:Restrict` cascade). Konto-deaktivering i stedet for hard-delete. | ✅ Opfyldt — Immutability håndhæves via AuditLog 3-niveau (applikation CREATE-only + PostgreSQL BEFORE UPDATE/DELETE triggere + onDelete:Restrict cascade). Konto-deaktivering i stedet for hard-delete. |
| **Backup & 5-års retention** | BEK 97 §3 (5-års opbevaring) og §7 (backup) — udstedt i medfør af Lov om bogføring §15 | node-cron scheduler: hourly/daily/weekly/monthly + cleanup; AES-256-GCM-krypterede `.zip.enc`-filer pr. tenant; SHA-256 checksum; monthly retention 60 måneder = 5 år; `Tenant-Backup/` på IONOS VPS. | ✅ Opfyldt |
| **SAF-T Financial DK eksport** | BEK 98 | `/api/export-saft` — maskinlæsbar eksport af hele regnskabet. | ✅ Opfyldt |
| **Årsrapport (XBRL/CSV)** | BEK 98 | `/api/reports/annual-xbrl` + `/api/reports/annual-csv`. | ✅ Opfyldt |
| **E-fakturering (NemHandel/Peppol)** | BEK 98 | Send/modtag via Storecove som Peppol Access Point. OIOUBL + Peppol BIS Billing 3.0. E-faktura-indbakke med godkend/afvis. | ✅ Opfyldt |
| **Momsangivelse til SKAT** | BEK 98 | `/api/vat/submit` — OAuth2 `client_credentials`, moms:indberet-scope. **KUN moms** — ingen årsopgørelse/e-indkomst. | ✅ Opfyldt (kun moms) |
| **Standardkontoplan** | BEK 98 | FSR-baseret kontoplan (Account-model) + `StandardAccountMapping` til SKAT's fællesoffentlige standardkontoplan. | ✅ Opfyldt |
| **Udbyderskift / dataeksport** | Bogføringsloven §13; BEK 98 | `/api/export-tenant` (JSON + filer, SHA-256 manifest), `/api/export-saft`, `/api/company/export-info`. | ✅ Opfyldt |
| **Fortløbende bilagsnummerering** | Bogføringsloven §10 | `Company.journalPrefix` (default "BIL") + `nextJournalSequence`. | ✅ Opfyldt |
| **Valutahåndtering** | Bogføringsloven §14 | Transaction-model med `currency`, `exchangeRate`, `amountDKK`. | ✅ Opfyldt |
| **IT-sikkerhed (RBAC, 2FA, kryptering)** | BEK 97 §8 stk. 4 (Hovedkrav 2 — adgangsstyring) | RBAC 5 roller/23 permissions i 7 kategorier, TOTP 2FA, AES-256-GCM (bank-tokens/TOTP/backup), bcrypt 12 rounds, TLS 1.2/1.3 via Caddy. | ✅ Opfyldt (se §8 sikkerhedsarkitektur) |
| **Risikovurdering** | BEK 98 | `docs/Bilag-06_Risikovurdering-DPIA.md`. | ✅ Opfyldt |
| **Beredskabsplan (DR)** | BEK 98 | `docs/Bilag-07_Beredskabsplan.md`. | ✅ Opfyldt |
| **Databehandleraftaler** | GDPR Art. 28; BEK 98 | `docs/Bilag-05_Databehandleraftale.md` + `docs/Bilag-08_Leverandørstyring.md`. | ✅ Opfyldt |

> Den fulde krav-for-krav tjekliste findes i `docs/Bilag-02_Compliance-rapport.md`.

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
| **Mini-service: knowledge-service** | Bun + rå HTTP + Prisma + pgvector (port 3006) | RAG-knowledge base, embeddings via OpenRouter. Deler Neon DB. |
| **Mini-service: notification-ws** | Bun + Socket.IO (port 3001) | Real-time notifikationer, in-memory. |
| **Mini-service: scanner-service** | Python + FastAPI + SQLite (port 3005) | OCR (Tesseract) + VLM via OpenRouter. |
| **Mini-service: tokenpay-access** | Bun + Hono + SQLite (port 3100) | `.tbkey` proof-verifikation, adgangsstyring. |

**Multi-tenant isolation:** `Company` er tenant-grænse, `companyId` på tværs af 24 Prisma-modeller, RBAC-isolation via `tenantFilter(ctx)`. SuperDev oversight-mode tillader read-only cross-tenant adgang for AlphaAi-admin.

**Backup-lag:** Neons managed PITR (Point-in-Time Recovery, 7 dage) — defense-in-depth lag 1; AlphaFlows egne `Tenant-Backup/` ZIP-filer (AES-256-GCM, SHA-256, 5-års retention) — lag 2.

> Den fulde arkitekturbeskrivelse (komponenter, dataflow, netværk) findes i `docs/Bilag-02_Compliance-rapport.md` og `docs/Bilag-09_IT-sikkerhed-Neon-og-IONOS.md`.

---

## 6. Dokumentindeks

Nedenstående tabel indekserer de **13 dokumenter** i AlphaFlows `docs/`-mappe, der udgør anmeldelsespakken til Erhvervsstyrelsen (med tilknyttede bilagsnumre jf. CANON-SPEC Bilagsliste). 12 dokumenter er revideret i denne anmeldelsesrunde (2026); 1 dokument (`SUBMISSION_CHECKLIST.md`) er supersederet. Dokumenter uden relevans for registreringen er flyttet til `docs/udenfor-scope/` (se note under tabellen).

| # | Dokument (bilag) | Formål | Status |
|---|---|---|---|
| 1 | `Bilag-01_Anmeldelsespakke.md` (Bilag 1) | Dette dokument — forside og indeks for anmeldelsen til Erhvervsstyrelsen. | Revideret 2026 |
| 2 | `Bilag-02_Compliance-rapport.md` (Bilag 2) | Krav-for-krav kortlægning af Lov om bogføring + BEK 97/98 med tekniske implementeringsreferencer. | Revideret 2026 |
| 3 | `Bilag-04_Brugsvejledning.md` (Bilag 4) | Brugermanual for alle funktioner i AlphaFlow (bogføring, fakturering, moms, bank, 2FA, e-faktura, årsregnskab m.m.). | Revideret 2026 |
| 4 | `Bilag-03_Krypteringsrapport.md` (Bilag 3) | Detaljeret kryptografisk dokumentation (AES-256-GCM, bcrypt, SHA-256, TLS, nøglehåndtering). | Revideret 2026 |
| 5 | `Bilag-05_Databehandleraftale.md` (Bilag 5) | Standard databehandleraftale (GDPR Art. 28) mellem AlphaAi Consult ApS og AlphaFlow-brugere, med referencer til underbehandlere. | Revideret 2026 |
| 6 | `Bilag-06_Risikovurdering-DPIA.md` (Bilag 6) | IT-risikovurdering — trusselsidentifikation, risikomatrix, eksisterende kontroller, restrisici. | Revideret 2026 |
| 7 | `Bilag-08_Leverandørstyring.md` (Bilag 8) | Evaluering og styring af tekniske leverandører (Neon, IONOS, Storecove, OpenRouter, SKAT, Flatpay/Frisbii). | Revideret 2026 |
| 8 | `Bilag-07_Beredskabsplan.md` (Bilag 7) | Disaster Recovery-plan — RTO/RPO, gendannelsesprocedurer, backup-strategi, kontaktliste. | Revideret 2026 |
| 9 | `Bilag-09_IT-sikkerhed-Neon-og-IONOS.md` (Bilag 9) | Tredjeparts IT-sikkerhedsdokumentation for de to primære infrastruktur-udbydere (Neon DB + IONOS VPS). | Revideret 2026 |
| 10 | `Bilag-11_TokenPay-TokenBay-guide.md` (Bilag 11) | Miljø- og opsætningsguide for TokenPay/TokenBay-adgangssystemet (`.tbkey` proofs, trial, free tier). | Revideret 2026 |
| 11 | `Bilag-10_Udbedringsplan.md` (Bilag 10) | Tidssvarende plan for afhjælpning af kendte mangler før indsendelse — dækker alle 20 risici (R-01…R-20) fra Bilag 6 + 5 oprindelige 2025-mangler, klassificeret i Kategori A/B/C. | Revideret 2026 (v3.0) |
| 12 | `Bilag-12_Bilagsoversigt.md` (Bilag 12) | Samlet bilagsliste + oversigt over underbehandler-DPA'er. | NY — revideret 2026 |
| 13 | `SUBMISSION_CHECKLIST.md` | Tidligere indsendelsesguide — nu supersederet og omdirigerer til Bilag 1, 12 og 14. | Supersederet — eksisterende version gælder som omdirigering. |

> Dokumenterne 1–10 samt Bilag 12 (`Bilag-12_Bilagsoversigt.md`) udgør den ajourførte anmeldelsespakke for 2026-revisionen. Dokument 10 (UDBEDRINGSPLAN, Bilag 10) refereres fra afsnit 8 nedenfor og opretholdes som separat løbende dokument. **Bilag 13 (underbehandler-DPA'er for Neon, IONOS, Storecove, Flatpay/Frisbii, OpenRouter og Simply/Brevo) vedhæftes anmeldelsen som separate PDF'er samlet under ét bilagspunkt** — se `Bilag-12_Bilagsoversigt.md` (Bilag 12) for fuld oversigt. Bilag 14 udgøres af tjeklisten (`AlphaFlow_Endelig-Tjekliste.xlsx`).
>
> **Dokumenter udenfor scope:** `MULTI_TENANT_PLAN.md` (designnoter for multi-tenant-arkitektur) og `PROJECTS_IMPLEMENTATION.md` (implementeringsnoter for valgfrit projekt-modul) er interne udviklingsdokumenter uden relevans for Erhvervsstyrelsen-registreringen og er flyttet til `docs/udenfor-scope/`. Se `docs/udenfor-scope/README.md` for begrundelse.

---

## 7. Compliance-oversigt

Nedenstående tabel henviser til de specifikke dokumenter, der uddyber hvert compliance-område. Anmeldelsen bygger på tværgående dokumentation — intet krav er alene dækket af dette dokument.

| Compliance-område | Lov-reference | Hoveddokument | Supplerende dokumenter |
|---|---|---|---|
| **Bogføringsloven-overholdelse** | Lov om bogføring (LOV nr. 700 af 24. maj 2022) (§3, §13, §14, §15) | `Bilag-02_Compliance-rapport.md` (Bilag 2) | `Bilag-04_Brugsvejledning.md` (Bilag 4), `Bilag-03_Krypteringsrapport.md` (Bilag 3) |
| **BEK 98 — anmeldelse/registrering** | Anmeldelsesbekendtgørelsen (BEK nr. 98 af 26. januar 2023) | `Bilag-02_Compliance-rapport.md` (Bilag 2) | `Bilag-07_Beredskabsplan.md` (Bilag 7), `Bilag-06_Risikovurdering-DPIA.md` (Bilag 6) |
| **BEK 97 — krav til digitale bogføringssystemer** | Kravbekendtgørelsen (BEK nr. 97 af 26. januar 2023) | `Bilag-02_Compliance-rapport.md` (Bilag 2) | `Bilag-03_Krypteringsrapport.md` (Bilag 3), `Bilag-09_IT-sikkerhed-Neon-og-IONOS.md` (Bilag 9) |
| **GDPR — persondata** | EU 2016/679 (Art. 5, 25, 28, 32, 33, 34) | `Bilag-05_Databehandleraftale.md` (Bilag 5) | `Bilag-02_Compliance-rapport.md` (Bilag 2), `Bilag-08_Leverandørstyring.md` (Bilag 8) |
| **IT-sikkerhed** | BEK 97 §8 stk. 4 (Hovedkrav 2 — adgangsstyring); GDPR Art. 32 | `Bilag-09_IT-sikkerhed-Neon-og-IONOS.md` (Bilag 9) | `Bilag-03_Krypteringsrapport.md` (Bilag 3), `Bilag-06_Risikovurdering-DPIA.md` (Bilag 6) |
| **Risikovurdering** | BEK 97 §8 stk. 4 (Hovedkrav 5 — logning); BEK 98 §13 | `Bilag-06_Risikovurdering-DPIA.md` (Bilag 6) | `Bilag-10_Udbedringsplan.md` (Bilag 10) |
| **Beredskab / Disaster Recovery** | BEK 97 §8 stk. 4 (Hovedkrav 6 — beredskab og reetablering); BEK 98 §13 | `Bilag-07_Beredskabsplan.md` (Bilag 7) | `Bilag-09_IT-sikkerhed-Neon-og-IONOS.md` (Bilag 9) |
| **Leverandørstyring** | GDPR Art. 28; BEK 97 §8 stk. 4 (Hovedkrav 3 — leverandørstyring) | `Bilag-08_Leverandørstyring.md` (Bilag 8) | `Bilag-05_Databehandleraftale.md` (Bilag 5), `Bilag-09_IT-sikkerhed-Neon-og-IONOS.md` (Bilag 9) |
| **Databehandleraftaler** | GDPR Art. 28 | `Bilag-05_Databehandleraftale.md` (Bilag 5) | `Bilag-08_Leverandørstyring.md` (Bilag 8) |
| **Kryptografisk sikkerhed** | GDPR Art. 32; BEK 97 §8 stk. 4 (Hovedkrav 7 — databeskyttelse) | `Bilag-03_Krypteringsrapport.md` (Bilag 3) | `Bilag-09_IT-sikkerhed-Neon-og-IONOS.md` (Bilag 9) |
| **Adgangsstyring (RBAC + 2FA)** | BEK 97 §8 stk. 4 (Hovedkrav 2 — adgangsstyring) | `Bilag-02_Compliance-rapport.md` (Bilag 2) | `Bilag-04_Brugsvejledning.md` (Bilag 4) |
| **Backup & retention (5 år)** | BEK 97 §3 (5-års opbevaring) og §7 (backup) — udstedt i medfør af Lov om bogføring §15 | `Bilag-02_Compliance-rapport.md` (Bilag 2) | `Bilag-07_Beredskabsplan.md` (Bilag 7), `Bilag-09_IT-sikkerhed-Neon-og-IONOS.md` (Bilag 9) |

### Dataflow ud af EU/EEA

Én AI-underbehandler flytter persondata til USA (SCC + TIA påkrævet — se `Bilag-05_Databehandleraftale.md` og `Bilag-08_Leverandørstyring.md`):

1. **OpenRouter, Inc.** (USA) — AlphaFlows eneste AI-databehandler. Dækker alle AI-funktioner: Hermes chat-LLM, knowledge-RAG embeddings og scanner VLM (vision-language model). OpenRouter videresender til relevante model-udbydere (f.eks. Anthropic, Meta, OpenAI) per GDPR Art. 28(4) — disse er OpenRouter's underbehandlere, ikke AlphaAi Consult ApS'.

Data minimization: `HermesAgent.dataAccessEnabled` er per-tenant opt-in (default false) — uden opt-in sendes KUN spørgsmål + statisk system-prompt, ikke tenant-specifikke finansielle data.

---

## 8. Sikkerhedsarkitektur og funktionelle afgrænsninger

Følgende sikkerhedsarkitektoniske detaljer og funktionelle afgrænsninger er relevante for anmeldelsesomfanget. Yderligere beskrivelse findes i `docs/Bilag-06_Risikovurdering-DPIA.md` og `docs/Bilag-10_Udbedringsplan.md`.

### Sikkerhedsarkitektur

1. **CSRF-beskyttelse** via `SameSite=Lax` cookie + Bearer-token Authorization header.
2. **Auth og rate-limiting** håndteres pr. route via `withGuard`-wrapper (ikke via central `middleware.ts`).
3. **Rate-limiting** på auth-endpoints (IP-baseret, in-memory).
4. **Rate-limiting** udelukkende via in-memory app-level mekanismer.
5. **Password min. længde** 6 tegn.

### Funktionelle afgrænsninger (i relation til anmeldelsen)

6. **Immutability** håndhæves via AuditLog 3-niveau + PostgreSQL-triggers.
7. **Bank-integration (delvist)** — Tink er en reel integration; Nordea/Danske Bank/Jyske Bank er stubs (returnerer fejl); Demo-provider leverer syntetiske data. PSD2 consent-flow virker for Tink.
8. **MitID / NemID / BankID** — autentificering via email + password + TOTP 2FA.
9. **Uploads** gemmes på VPS-disk med disk-encryption og adgangskontrol. Backup-filer er AES-256-GCM-krypterede.
10. **AI non-determinisme** — AI-output er ikke deterministisk. Aktivering og dataadgang audit-logges; ved lav VLM-konfidens markeres output 'Kræver gennemsyn'; AI-output overstyrer aldrig automatisk bogførte posteringer. Se Bilag 4 (Bilag-04_Brugsvejledning.md) afsnit 13 og Bilag 6 (Bilag-06_Risikovurdering-DPIA.md) R-21.

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
| **Årlig review** | Hvert år (Q1) | AlphaAi Consult ApS — teknisk ansvarlig |
| **Ved væsentlig produktændring** | Efter behov | AlphaAi Consult ApS — teknisk ansvarlig |
| **Ved udbyder-ændring** (f.eks. ny sub-processor hos Neon) | Ved modtagelse af underretnings-e-mail | AlphaAi Consult ApS — DPO / dataansvarlig |
| **Ved ny regulering** (f.eks. opdatering af BEK 98) | Ved ikrafttrædelse | AlphaAi Consult ApS — compliance-ansvarlig |

### Knyttning til anmeldelsen

- Erhvervsstyrelsen underrettes ved væsentlige ændringer i platformens arkitektur, der påvirker anmeldelsesgrundlaget (jf. BEK 98 § 6).
- Mindre ændringer (f.eks. version-opdateringer af afhængigheder) dokumenteres i git-historikken uden separat underretning.

---

## 10. Underskrift

| Rolle | Navn | Dato | Underskrift |
|---|---|---|---|
| Anmeldelsesansvarlig (teknisk) | Jess Martin Christoffersen | _[dato]_ | _[underskrift]_ |
| DPO / dataansvarlig | _[skabelon]_ | _[dato]_ | _[underskrift]_ |
| Ledelse (AlphaAi Consult ApS) | _[skabelon]_ | _[dato]_ | _[underskrift]_ |

---

*Udarbejdet af AlphaAi Consult ApS — 2026*
