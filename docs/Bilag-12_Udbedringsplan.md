# AlphaFlow — Udbedringsplan før indsendelse

**AlphaAi Consult ApS** (CVR 46312058)
**Dokumentversion:** 3.11
**Dato:** Oktober 2026
**Bilag 12 i anmeldelsespakken
**Ansvarlig:** Jess Martin Christoffersen, Direktør

**Lovgrundlag:** Lov om bogføring (LOV nr. 700 af 24. maj 2022); BEK nr. 97 af 26. januar 2023 (Kravbekendtgørelsen); BEK nr. 98 af 26. januar 2023 (Anmeldelsesbekendtgørelsen); GDPR.

---

## 1. Formål

Dette dokument beskriver AlphaAi Consult ApS' plan for videreudvikling af AlphaFlow-platformen. Planen bygger på åbenhedslisten i Bilag 1 (Bilag-01_Anmeldelsespakke.md) afsnit 8 og risikovurderingen i Bilag 8 (Bilag-08_Risikovurdering-DPIA.md).

Tiltagene er inddelt i tre kategorier:
- **A — Indsendelseskrav** (afhænger af eksterne parter)
- **B — Planlagte forbedringer** (udiættet tiltag; udbedres efter tidsplan)
- **C — Accepteret** (produktvalg eller Lav restrisiko; oplyses i åbenhed)

---

## 2. Oversigt over planlagte tiltag

| ID | Tiltag | Kategori | Lovmæssig relevans |
|---|---|---|---|
| U-2 | DPA + SCC + TIA for USA-dataoverførsel via OpenRouter | A | GDPR kapitel V; BEK 97 §8 stk. 4 (D3) |
| U-8 | SKAT Moms-API credentials konfigureres | A | BEK 97 Bilag 4 pkt 7, b |
| U-9 | NemHandel Access Point-aftale (Sproom) — aftale indgået; staging live | A (gennemført — rest: produktionsaktivering) | BEK 97 Bilag 4 pkt 1, 8, 9 |
| U-10 | Caddy rate_limit plugin opsættes | B | BEK 97 §8 stk. 4 (D1) |
| U-11 | Central Next.js middleware opsættes | B | BEK 97 §8 stk. 4 (D2) |
| U-12 | Account-lockout ved gentagne fejlede login-forsøg | B | BEK 97 §8 stk. 4 (D2) |
| U-13 | Password min. længde opjusteres | B | BEK 97 §8 stk. 4 (D2) |
| U-16 | Udvidet kryptering af persondata i DB | B | GDPR Art. 32; BEK 97 §8 stk. 4 (D7) |
| U-17 | Backup-scheduler adskilles fra applikationsproces | B | BEK 97 §7 |
| U-18 | Bank-API stubs (Nordea/Danske/Jyske) — kun Tink + Demo reelle | C | BEK 97 Bilag 4 pkt 3.b — delvist |
| U-20 | Ingen MitID/SSO/SAML — email+password+TOTP anvendes | C | Ikke lovpåkrævet |
| U-21 | Ingen CSRF-token — SameSite=Lax + Bearer kompenserer | C | Lav restrisiko |
| U-22 | SQLite i mini-services ukrypteret — VPS disk-encryption dækker | C | Lav restrisiko |
| U-23 | Uploads ukrypteret på VPS-disk — VPS disk-encryption dækker | C | Lav restrisiko |
| U-24 | Udfas legacy `PUBLIC_STANDARD_CHART` så kun `OFFICIAL_STANDARD_CHART` (2026) forbliver | ✅ Gennemført (Oktober 2026) | BEK 97 Bilag 4 pkt 1 — "kun den nyeste reviderede standardkontoplan" |

---

## 3. Kategori A — Indsendelseskrav

### U-2 — DPA + SCC + TIA for USA-dataoverførsel
AI-ydelser (Hermes chat-LLM, knowledge-service RAG-embeddings, scanner-service VLM) transmitterer persondata til USA via OpenRouter som AlphaFlows eneste AI-databehandler.

> **Note om model-udbydere:** OpenRouter er AlphaFlows databehandler og connector. Via OpenRouter kan AlphaFlow benytte alle tilgængelige modeller (OpenAI, Anthropic, Meta, Mistral m.fl.). Disse model-udbydere er OpenRouter's underbehandlere per GDPR Art. 28(4) — AlphaAi Consult ApS indgår kun DPA med OpenRouter og forlader sig på OpenRouter's DPA'er med deres underbehandlere. Dette gælder samlet for chat-LLM, RAG-embeddings og scanner-VLM — der indgås IKKE separate DPA'er med Anthropic eller OpenAI.

**Handling:**
- Indgå DPA + EU-SCC (Modul 2) med OpenRouter, Inc. (Bilag 14 — konsolideret AI-DPA der dækker chat LLM + embeddings + VLM).
- Udfør Transfer Impact Assessment (TIA) — vurdering af USA-retsmiljø (FISA 702, EO 12333, CLOUD Act) + suppl. foranstaltninger. Ramme i Bilag 10 (LEVERANDØRSTYRING.md) afsnit 5.1.
- Verificer OpenRouter's underbehandler-liste (inkl. upstream-model-udbydere Anthropic/Meta/OpenAI per GDPR Art. 28(4)) og zero-retention-tilvalg hvor muligt.
- Vedhæft underskrevne DPA + SCC + TIA som separate PDF'er ved indsendelsen.
**Ansvarlig:** Jess Martin Christoffersen (juridisk) · **Tidsramme:** 2-5 dage (primært ventetid)
**Acceptkriterier:** Underskrevet OpenRouter DPA (Bilag 14) + EU-SCC (Modul 2) + TIA vedhæftet; Bilag 2 status opdateret.

### U-8 — SKAT Moms-API credentials
`vat-submit.ts` simulerer hvis credentials mangler (simuleringstilstand ved manglende VOCES3-certifikat).

**Status:** AlphaAi Consult ApS har modtaget **instruktioner og Integrationstest S1-test-certifikat** fra Skattestyrelsen (`momsapi@sktst.dk`) og har implementeret integrationen i TypeScript (3 SOAP-services + mTLS + WS-Security XML-DSig) i `src/lib/skat-soap-client.ts`, `src/lib/skat-ws-security.ts` og `src/lib/skat-keystore.ts`. Den **formelle aftale med Skattestyrelsen** er under indgåelse og fremsendes som separat bilag så snart den er underskrevet.

**Handling:**
- Opret/verificér NemVirksomhed-konto hos Skattestyrelsen for AlphaAi Consult ApS (CVR 46312058) — **gennemført: instruktioner + test-certifikat modtaget**.
- Bestil **produktions-VOCES3 System (S1)-certifikat** fra MitID Erhverv (test-certifikat allerede installeret i `certs/skat/`).
- Sæt `SKAT_ENV=production` + `SKAT_KEYSTORE_PATH=certs/skat/client.p12` + `SKAT_KEYSTORE_PASSWORD` + `SKAT_KEY_PASSWORD` + `SKAT_TRUSTSTORE_PATH=certs/skat/skat-ca.pem` SOAP-endpoints (`SKAT_ENDPOINT_VIRKSOMHEDKALENDERHENT`, `SKAT_ENDPOINT_MODTAGMOMSANGIVELSEFORELOEBIG`, `SKAT_ENDPOINT_MOMSANGIVELSEKVITTERINGHENT`) i produktions-`.env` — se `docs/SKAT-setup.md` §4.
- Test mod Skattestyrelsens test-miljø (SE 41250313).
- Opdater Bilag 6 (Bilag-06_Brugsvejledning.md) afsnit 9.3 — **gennemført (oktober 2026):** afsnit 9.3 nu opdateret til at afspejle SOAP/mTLS/WS-Security-arkitektur.
**Ansvarlig:** Jess Martin Christoffersen (Skattestyrelsen aftale) + teknisk (certifikat-konfiguration) · **Tidsramme:** 1 dag konfiguration + Skattestyrelsen ventetid på formel aftale
**Acceptkriterier:** `hasSkatCredentials` returnerer true; produktions-VOCES3-certifikat installeret; test-momsangivelse successfuld i Skattestyrelsens test-miljø; formel aftale med Skattestyrelsen underskrevet og vedhæftet.

### U-9 — NemHandel Access Point-aftale (Sproom)
**Status:** ✅ Aftalen er indgået. Sproom (dansk selskab — Sproom A/S, https://sproom.net) er AlphaFlows eneste e-invoicing Access Point og dækker begge netværk: Peppol (BIS Billing 3.0/UBL 2.1) og NemHandel (OIOUBL 2.1). Integrationen er færdig og live mod Sproom staging (https://staging.sproom.net) via `src/lib/sproom-client.ts` og `/api/sproom/*`-ruterne (create-child-company, register-nemhandel, peppol, register-webhook, webhook, webhook-status, participants, status, disconnect). NemHandel-tilmelding, MitID Erhverv-certifikat, AS4-transport, SMP/NHR-opslag, schema/schematron-validering og MLR/AR håndteres af Sproom som Access Point. Som dansk selskab behandler Sproom data i Danmark/EU — ingen SCC påkrævet. (Den tidligere planlagte Storecove B.V.-aftale er supersederet; tidligere Storecove-kode — `src/lib/storecove-client.ts` ruter under `/api/storecove/*` (webhook, participants, status, connect, create-legal-entity) — er **fuldt fjernet** fra kodebasen. Tidligere Storecove-specifikke DB-felter er fjernet fra Prisma-schemaet — Sproom har egne ækvivalenter. E-faktura dokument-ID-felt er omdøbt til `sproomDocumentId`; e-faktura-kanal-enum er omdøbt til `SPROOM_AUTO` (Sproom Auto-kanal der vælger OIOUBL for DK og Peppol BIS for international). Sproom er eneste Access Point. DB-migration kræves i produktion (`bun run db:deploy` + data-migration `UPDATE "EInvoiceSending" SET channel = 'SPROOM_AUTO' WHERE channel = 'STORECOVE';`).

**Resterende handling (produktionsaktivering — env-switch):**
- Sæt `SPROOM_API_URL=https://sproom.net` + `SPROOM_API_TOKEN` i produktions-`.env` (default er staging: `https://staging.sproom.net`).
- Sæt `SPROOM_WEBHOOK_REQUIRE_SIGNATURE=true` (fail-closed RSA-signaturverifikation — Sproom signerer webhooks med SHA256withRSA i `X-Signature`-headeren; offentlig nøgle hentes automatisk fra GET /api/webhooks/key og cachelagres).
- Verificér produktions-flowet: child company pr. tenant (pr. CVR) + registrering i begge netværk (POST /api/registrations/nemhandel + POST /api/registrations/peppol med participant verification), test-afsendelse (OIOUBL type 380 + kreditnota type 381) og leveringsbevis via GET /api/documents/{id}/state.
- Opdater Bilag 6 afsnit 6.4.3.
**Ansvarlig:** Jess Martin Christoffersen (Sproom-aftale, indgået) + teknisk (env-switch) · **Tidsramme:** <1 dag (env-switch + verifikation — aftalen er indgået; ingen ekstern ventetid)
**Acceptkriterier:** Sproom-aftale indgået (✅); produktions-e-faktura afsendt via https://sproom.net (HTTP 201 Created + dokument-ID i `X-Sproom-DocumentId`); leveringsbevis hentet; NemHandel- + Peppol-registrering bekræftet i produktion.

---

## 4. Kategori B — Planlagte forbedringer

AlphaAi Consult ApS indsender med åbenheds-erklæring (Bilag 1 afsnit 8) og forpligter sig til udbedring efter offentliggjort tidsplan.

| ID | Tiltag | Handling (kort) | Mål |
|---|---|---|---|
| U-10 | Caddy rate_limit plugin | Installer og konfigurer plugin | 3 måneder |
| U-11 | Next.js middleware.ts | Central auth + tenant-isolation som tillæg til `withGuard` | 6 måneder |
| U-12 | Account-lockout | Lås efter 10 fejlede forsøg pr. 24t + email-notifikation | 3 måneder |
| U-13 | Password min. 8 tegn | Hæv fra 6 til 8 (NIST 800-63B) + strength-meter | 3 måneder |
| U-16 | Persondata-kryptering i DB (hvile) | Udvidet AES-256-GCM på udvalgte felter | 6 måneder |
| U-17 | Backup-scheduler uafhængig | Adskil fra applikationsproces til separat PM2-app/systemd/crontab | 6 måneder |
| U-24 | Udfas legacy `PUBLIC_STANDARD_CHART` | ✅ **Gennemført (Oktober 2026)** — legacy `PUBLIC_STANDARD_CHART` (~50 konti) er helt fjernet fra kodebasen; helpers (`getStandardAccount`, `getStandardAccountsByType`, `getVATAccounts`, `suggestStandardMapping`, `buildAutoMapping`) omskrevet til kun at benytte `OFFICIAL_STANDARD_CHART` (603 konti, version 20260101). | ✅ Gennemført |

### U-24 — Udfas legacy `PUBLIC_STANDARD_CHART` — ✅ Gennemført (Oktober 2026)

**Status:** ✅ Gennemført. Legacy `PUBLIC_STANDARD_CHART`-arrayet (~50 konti) i `src/lib/standard-chart-of-accounts.ts` er **helt fjernet** fra kodebasen. Helpers (`getStandardAccount`, `getStandardAccountsByType`, `getVATAccounts`, `suggestStandardMapping`, `buildAutoMapping`) er omskrevet til **kun** at benytte `OFFICIAL_STANDARD_CHART` (603 konti, version 20260101) i `src/lib/official-standard-chart.ts`.

**Baggrund (historisk):** Erhvervsstyrelsen kræver, at der "kun er den nyeste reviderede standardkontoplan" i brug. Kildebasen havde tidligere to versioner side-om-side: `OFFICIAL_STANDARD_CHART` (20260101, 603 konti) OG en legacy `PUBLIC_STANDARD_CHART` (~50 konti). `OFFICIAL_STANDARD_CHART` havde precedence, men `PUBLIC_STANDARD_CHART` blev brugt som fallback i 5 helper-funktioner.

**Gennemførte handlinger (Oktober 2026):**
- Fjernede `PUBLIC_STANDARD_CHART`-arrayet fra merge-stierne i `getStandardAccount`/`getStandardAccountsByType`/`getVATAccounts`/`suggestStandardMapping`/`buildAutoMapping` (så disse nu udelukkende returnerer officielle konti).
- Verificerede at `buildAutoMapping` Phase 1+2 (som allerede filtrerede til OFFICIAL) ikke ændrede adfærd.
- Standardkonto-UI viser nu udelukkende officielle 2026-konti.

**Ansvarlig:** Teknisk (refactor) · **Tidsramme:** Gennemført
**Acceptkriterier:** ✅ `PUBLIC_STANDARD_CHART` indgår ikke længere i kodebasen; `OFFICIAL_STANDARD_CHART` (603 konti) er eneste standardkontoplan; standardkonto-UI viser udelukkende officielle 2026-konti.

---

## 5. Kategori C — Accepterede valg

Følgende er bevidste arkitektoniske og produktmæssige valg med kompenserende foranstaltninger. Oplyses i åbenhed (Bilag 1 afsnit 8) uden separat udbedringsplan.

| ID | Tiltag/Beslutning | Begrundelse |
|---|---|---|
| U-18 | Bank-API stubs (Nordea/Danske/Jyske) | Tink er reel integration; Demo + CSV-import dækker øvrige. Andre banker aktiveres ved behov. |
| U-20 | Ingen MitID/SSO/SAML | Ikke lovpåkrævet for bogføringssystemer. Email+password+TOTP opfylder BEK 97 §8 stk. 4 (D2). |
| U-21 | Ingen CSRF-token | Kompenseret via SameSite=Lax cookie + Bearer-token. Lav restrisiko. |
| U-22 | SQLite i mini-services ukrypteret | `scanner.db` kun scan-historik; `access.db` beskyttes af VPS disk-encryption + adgangskontrol. Lav restrisiko. |
| U-23 | Uploads ukrypteret på VPS-disk | VPS disk-encryption + RBAC; backup-filer er AES-256-GCM-krypterede. Lav restrisiko. |

---

## 6. Tidsplan før indsendelse

Tekniske Kategori A-tiltag (U-1, U-3, U-4, U-5, U-6, U-7, U-14) er gennemført. U-15 (Hash-chain på posteringer) er ligeledes implementeret (SHA-256 chain via `recordHash`/`previousHash` på `JournalEntry` og `Transaction` — se Bilag 04 afsnit 2.10). U-9 (NemHandel Access Point-aftale — Sproom) er ligeledes reelt gennemført: aftalen er indgået, og integrationen er færdig og live mod Sproom staging — resterer kun produktionsaktivering (env-switch + verifikation, jf. §3). Resterende tiltag der afhænger af eksterne parter: U-2 (OpenRouter DPA) og U-8 (SKAT credentials).

| Uge | Handlinger |
|---|---|
| **Uge 1-2** | U-2 (DPA/SCC/TIA — parallel jur. proces) |
| **Uge 2-4** | U-8 (SKAT — afhænger af Skattestyrelsen), U-9 (Sproom — produktionsaktivering via env-switch + verifikation; aftale indgået, staging allerede live) |
| **Uge 4** | Verifikation af resterende Kategori A acceptkriterier |
| **Uge 5** | Indsendelse via virk.dk |

**Samlet tidsramme:** U-9 kræver ingen ekstern ventetid længere (env-switch + verifikation, <1 dag). U-2 og U-8 afhænger af eksterne parter.

---

## 7. Sign-off før indsendelse

Før indsendelse bekræftes at:

- [x] Tekniske Kategori A-tiltag (U-1, U-3, U-4, U-5, U-6, U-7, U-14) er gennemført.
- [x] U-15 (Hash-chain på posteringer): implementeret (SHA-256 chain via `recordHash`/`previousHash` på `JournalEntry` og `Transaction` — se Bilag 04 afsnit 2.10).
- [x] U-9 (NemHandel Access Point-aftale — Sproom): aftale indgået; integrationen er færdig og live mod Sproom staging (Peppol BIS Billing 3.0 + NemHandel OIOUBL 2.1). Produktionsaktivering (env-switch + verifikation) udføres som del af produktionssætningen — jf. §3 U-9.
- [x] Bilag 1 afsnit 8 (åbenhedsliste) opdateret — implementerede punkter beskrevet som features.
- [x] Bilag 8 (Bilag-08_Risikovurdering-DPIA.md) §6 restrisiko-fordeling opdateret for implementerede risici.
- [x] Berørte dokumenter (Bilag 4, 3, 6, 7, 9) opdateret hvor Kategori A-implementeringer ændrer beskrivelsen.

| Rolle | Navn | Dato | Underskrift |
|---|---|---|---|
| Teknisk ansvarlig | Jess Martin Christoffersen | _[dato]_ | _[underskrift]_ |
| Direktør (AlphaAi Consult ApS) | Jess Martin Christoffersen | _[dato]_ | _[underskrift]_ |

---

## 8. Vedligeholdelse

- **Ved hver Kategori B-udbedring:** opdater dette dok + Bilag 8 R-XX + underret Erhvervsstyrelsen ved væsentlige ændringer (BEK 98 §6).
- **Årlig review (Q1):** gennemgå Kategori C — vurder om nogle skal løftes til B.
- **Ved ny regulering:** vurder om planen skal udvides.

### Versionshistorik

> **Seneste ændring (v3.11, Oktober 2026):** U-24 gennemført (legacy PUBLIC_STANDARD_CHART fjernet); U-8 opdateret (SKAT Moms-API SOAP/mTLS/WS-Security); Storecove fuldt fjernet.

---

*Bilag 12 i AlphaFlows anmeldelsespakke til Erhvervsstyrelsen.*