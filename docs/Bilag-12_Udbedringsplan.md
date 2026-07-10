# AlphaFlow — Udbedringsplan før indsendelse

**AlphaAi Consult ApS** (CVR 46312058)
**Dokumentversion:** 3.6
**Dato:** 2026
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
| U-9 | NemHandel Access Point-aftale (Storecove) | A | BEK 97 Bilag 4 pkt 1, 8, 9 |
| U-10 | Caddy rate_limit plugin opsættes | B | BEK 97 §8 stk. 4 (D1) |
| U-11 | Central Next.js middleware opsættes | B | BEK 97 §8 stk. 4 (D2) |
| U-12 | Account-lockout ved gentagne fejlede login-forsøg | B | BEK 97 §8 stk. 4 (D2) |
| U-13 | Password min. længde opjusteres | B | BEK 97 §8 stk. 4 (D2) |
| U-15 | Eventuel hash-chain på posteringer — afhænger af Erhvervsstyrelsens fortolkning | B | BEK 97 Bilag 1 / Lov om bogføring §13 |
| U-16 | Udvidet kryptering af persondata i DB | B | GDPR Art. 32; BEK 97 §8 stk. 4 (D7) |
| U-17 | Backup-scheduler adskilles fra applikationsproces | B | BEK 97 §7 |
| U-18 | Bank-API stubs (Nordea/Danske/Jyske) — kun Tink + Demo reelle | C | BEK 97 Bilag 4 pkt 3.b — delvist |
| U-20 | Ingen MitID/SSO/SAML — email+password+TOTP anvendes | C | Ikke lovpåkrævet |
| U-21 | Ingen CSRF-token — SameSite=Lax + Bearer kompenserer | C | Lav restrisiko |
| U-22 | SQLite i mini-services ukrypteret — VPS disk-encryption dækker | C | Lav restrisiko |
| U-23 | Uploads ukrypteret på VPS-disk — VPS disk-encryption dækker | C | Lav restrisiko |

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
`vat-submit.ts` simulerer hvis credentials mangler.
**Handling:**
- Opret/verificér NemVirksomhed-konto hos Skattestyrelsen for AlphaAi Consult ApS (CVR 46312058).
- Ansøg om adgang til Moms-API (scope `moms:indberet`).
- Sæt `SKAT_CLIENT_ID` + `SKAT_CLIENT_SECRET` i produktions-`.env`.
- Test mod Skattestyrelsens test-miljø.
- Opdater Bilag 6 (Bilag-06_Brugsvejledning.md) afsnit 9.3.
**Ansvarlig:** Jess Martin Christoffersen (Skattestyrelsen) + teknisk (konfiguration) · **Tidsramme:** 1 dag kode + Skattestyrelsen ventetid
**Acceptkriterier:** `hasSkatCredentials()` returnerer true; test-momsangivelse successfuld.

### U-9 — NemHandel Access Point-aftale (Storecove)
`nemhandel-client.ts` simulerer uden reel AP-aftale.
**Handling:**
- Indgå Access Point-aftale med Storecove B.V. (Bilag 14) — fungerer som både Peppol og NemHandel AP.
- Sæt `NEMHANDEL_SIMULATION_MODE=false` + `STORECOVE_API_KEY` i produktion.
- Test e-faktura-afsendelse (OIOUBL type 380) til test-modtager.
- Tilmeld AlphaFlow hos NemHandelsregisteret via Storecove.
- Opdater Bilag 6 afsnit 6.4 + 16.3.
**Ansvarlig:** Jess Martin Christoffersen (Storecove) + teknisk (konfiguration) · **Tidsramme:** 1-3 dage + Storecove ventetid
**Acceptkriterier:** Storecove-aftale underskrevet; test-e-faktura leveret; NemHandel-tilmelding bekræftet.

---

## 4. Kategori B — Planlagte forbedringer

AlphaAi Consult ApS indsender med åbenheds-erklæring (Bilag 1 afsnit 8) og forpligter sig til udbedring efter offentliggjort tidsplan.

| ID | Tiltag | Handling (kort) | Mål |
|---|---|---|---|
| U-10 | Caddy rate_limit plugin | Installer og konfigurer plugin | 3 måneder |
| U-11 | Next.js middleware.ts | Central auth + tenant-isolation som tillæg til `withGuard()` | 6 måneder |
| U-12 | Account-lockout | Lås efter 10 fejlede forsøg pr. 24t + email-notifikation | 3 måneder |
| U-13 | Password min. 8 tegn | Hæv fra 6 til 8 (NIST 800-63B) + strength-meter | 3 måneder |
| U-15 | Hash-chain på posteringer | Afklar med Erhvervsstyrelsen om BEK 97 Bilag 1 kræver hash-chain udover AuditLog 3-niveau; implementér hvis krævet | Efter afklaring |
| U-16 | Persondata-kryptering i DB (hvile) | Udvidet AES-256-GCM på udvalgte felter | 6 måneder |
| U-17 | Backup-scheduler uafhængig | Adskil fra applikationsproces til separat PM2-app/systemd/crontab | 6 måneder |

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

Tekniske Kategori A-tiltag (U-1, U-3, U-4, U-5, U-6, U-7, U-14) er gennemført. Resterende tiltag afhænger af eksterne parter (U-2, U-8, U-9) og planlægges i Kategori B.

| Uge | Handlinger |
|---|---|
| **Uge 1-2** | U-2 (DPA/SCC/TIA — parallel jur. proces) |
| **Uge 2-4** | U-8 (SKAT — afhænger af Skattestyrelsen), U-9 (Storecove — afhænger af Storecove) |
| **Uge 4** | Verifikation af resterende Kategori A acceptkriterier |
| **Uge 5** | Indsendelse via virk.dk |

**Samlet tidsramme:** Resterende Kategori A-tiltag (U-2, U-8, U-9) afhænger af eksterne parter.

---

## 7. Sign-off før indsendelse

Før indsendelse bekræftes at:

- [x] Tekniske Kategori A-tiltag (U-1, U-3, U-4, U-5, U-6, U-7, U-14) er gennemført.
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

| Version | Dato | Ændring |
|---|---|---|
| 1.0 | April 2026 | Første version — 5 compliance-mangler. |
| 2.0 | Maj 2026 | Implementeringslog for 5 mangler. |
| 3.0 | 2026 | Udvidet med R-01..R-20 fra Bilag 8; Kategori A/B/C-struktur. |
| 3.1 | 2026 | Simplificeret — fokuseret på konkret handlingsplan; OpenRouter som hoved-databehandler for AI (underbehandlere håndteres af OpenRouter per GDPR Art. 28(4)). |
| 3.2 | 2026 | AI-konsolidering: kun OpenRouter som AI-udbyder (OpenAI/Anthropic fjernet som selvstændige underbehandlere per GDPR Art. 28(4)). U-2 opdateret — scanner-VLM går nu via OpenRouter (ikke separat Anthropic DPA). |
| 3.3 | 2026 | Kategori A-udbedringer udført: U-1 (key rotation), U-3 (CSP), U-4 (ClamAV), U-5 (Socket.IO auth), U-6 (webhook fail-closed), U-7 (voucherNumber), U-14 (timingSafeEqual). Tilsvarende bilag opdateret. |
| 3.4 | 2026 | Fjernet implementerede tiltag (U-1, U-3, U-4, U-5, U-6, U-7, U-14) fra planen; dokumentet fokuserer nu på resterende tiltag. Reframet sprog. |
| 3.5 | 2026 | Dokumentationsnøjagtighed: rettet permissions 18→23, kreditnota nu implementeret, AI-bankafstemning nu i produktion via OpenRouter, Hermes-consent beskrevet korrekt (toggle-baseret), webhook fail-closed reflekteret, CVR konsolideret til 46312058. |
| 3.6 | 2026 | Bilagsstruktur-konsolidering: underbehandler-DPA’er samlet til Bilag 14; Tjekliste renummereret fra Bilag 19 til Bilag 3. Krydsreferencer opdateret. |

---

*Bilag 12 i AlphaFlows anmeldelsespakke til Erhvervsstyrelsen.*