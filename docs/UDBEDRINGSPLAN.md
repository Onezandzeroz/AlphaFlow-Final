# AlphaFlow — Udbedringsplan før indsendelse

**AlphaAi Consult ApS** (CVR 46312058)
**Dokumentversion:** 3.2
**Dato:** 2026
**Bilag 10 i anmeldelsespakken
**Ansvarlig:** Jess Martin Christoffersen, Direktør

**Lovgrundlag:** Lov om bogføring (LOV nr. 700 af 24. maj 2022); BEK nr. 97 af 26. januar 2023 (Kravbekendtgørelsen); BEK nr. 98 af 26. januar 2023 (Anmeldelsesbekendtgørelsen); GDPR.

---

## 1. Formål

Dette dokument er AlphaAi Consult ApS' konkrete plan for afhjælpning af kendte mangler i AlphaFlow **før indsendelse til Erhvervsstyrelsen**. Planen bygger på åbenhedslisten i Bilag 1 (ANMELDELSESPAKKE.md) afsnit 8 og risikovurderingen i Bilag 6 (RISIKOVURDERING.md).

Manglerne er inddelt i tre kategorier:
- **A — Skal udbedres før indsendelse** (blokerer eller væsentligt forsinkende for registrering)
- **B — Indsendes med åbenhed** (udiættet mangel oplyst; udbedres efter tidsplan)
- **C — Accepteret** (produktvalg eller Lav restrisiko; oplyses i åbenhed)

---

## 2. Oversigt over mangler

| ID | Mangel | Kategori | Lovmæssig relevans |
|---|---|---|---|
| U-1 | Key rotation / versioning af krypteringsnøgler mangler | A | GDPR Art. 32; BEK 97 §8 stk. 4 (D7) |
| U-2 | DPA + SCC + TIA for USA-dataoverførsel via OpenRouter | A | GDPR kapitel V; BEK 97 §8 stk. 4 (D3) |
| U-3 | Content-Security-Policy (CSP) header mangler | A | BEK 97 §8 stk. 4 (D1, D7) |
| U-4 | Antivirus-scanning af uploads mangler | A | BEK 97 §8 stk. 4 (D7); GDPR Art. 32 |
| U-5 | Socket.IO handshake-auth mangler (Hermes + notifikationer) | A | BEK 97 §8 stk. 4 (D2) |
| U-6 | Webhook HMAC dev-fallback "accept all" | A | BEK 97 §8 stk. 4 (D5, D7) |
| U-7 | voucherNumber aktiveres på produktions-VPS | A | BEK 97 Bilag 1 pkt 1, 2, b |
| U-8 | SKAT Moms-API credentials konfigureres | A | BEK 97 Bilag 2 pkt 7, b |
| U-9 | NemHandel Access Point-aftale (Storecove) | A | BEK 97 Bilag 2 pkt 1, 8, 9 |
| U-10 | Caddy rate_limit plugin installeres | B | BEK 97 §8 stk. 4 (D1) |
| U-11 | Next.js middleware.ts implementeres | B | BEK 97 §8 stk. 4 (D2) |
| U-12 | Account-lockout efter N fejlede forsøg | B | BEK 97 §8 stk. 4 (D2) |
| U-13 | Password min. længde hæves til 8 tegn (NIST) | B | BEK 97 §8 stk. 4 (D2) |
| U-14 | TokenPay `crypto.timingSafeEqual` i stedet for string XOR | B | BEK 97 §8 stk. 4 (D5) |
| U-15 | Hash-chain på posteringer (afklaring med Erhvervsstyrelsen) | B | BEK 97 Bilag 1 / Lov om bogføring §13 |
| U-16 | Field-level kryptering af udvalgte persondata i DB | B | GDPR Art. 32; BEK 97 §8 stk. 4 (D7) |
| U-17 | Backup-scheduler gøres uafhængig af app-proces | B | BEK 97 §7 |
| U-18 | Bank-API stubs (Nordea/Danske/Jyske) — kun Tink + Demo reelle | C | BEK 97 Bilag 2 pkt 3.b — delvist |
| U-19 | AI-bankafstemning sandbox-only — manuel afstemning anvendes | C | BEK 97 Bilag 2 pkt 3 |
| U-20 | Ingen MitID/SSO/SAML — email+password+TOTP anvendes | C | Ikke lovpåkrævet |
| U-21 | Ingen CSRF-token — SameSite=Lax + Bearer kompenserer | C | Lav restrisiko |
| U-22 | SQLite i mini-services ukrypteret — VPS disk-encryption dækker | C | Lav restrisiko |
| U-23 | Uploads ukrypteret på VPS-disk — VPS disk-encryption dækker | C | Lav restrisiko |

---

## 3. Kategori A — Skal udbedres før indsendelse

### U-1 — Key rotation / versioning
**Problem:** Krypteringsnøgler er statiske env-variabler uden rotationsmekanisme.
**Handling:**
- Implementér `keyVersion`-kolonne + keyring-struktur på berørte tabeller.
- Skriv migration-script til re-encryption ved nøglerotation.
- Dokumenter rotationsprocedure i Bilag 7 (BEREDSKABSPLAN.md) afsnit 5.5 + Bilag 3 (ENCRYPTION.md) afsnit 2.4.
**Ansvarlig:** Teknisk ansvarlig · **Tidsramme:** 5-10 dage
**Acceptkriterier:** Rotation kan udføres uden datatab; rollback-procedure testet; dokumentation opdateret.

### U-2 — DPA + SCC + TIA for USA-dataoverførsel
**Problem:** AI-ydelser (Hermes chat-LLM, knowledge-service RAG-embeddings, scanner-service VLM) transmitterer persondata til USA via OpenRouter som AlphaFlows eneste AI-databehandler.

> **Note om model-udbydere:** OpenRouter er AlphaFlows databehandler og connector. Via OpenRouter kan AlphaFlow benytte alle tilgængelige modeller (OpenAI, Anthropic, Meta, Mistral m.fl.). Disse model-udbydere er OpenRouter's underbehandlere per GDPR Art. 28(4) — AlphaAi Consult ApS indgår kun DPA med OpenRouter og forlader sig på OpenRouter's DPA'er med deres underbehandlere. Dette gælder samlet for chat-LLM, RAG-embeddings og scanner-VLM — der indgås IKKE separate DPA'er med Anthropic eller OpenAI.

**Handling:**
- Indgå DPA + EU-SCC (Modul 2) med OpenRouter, Inc. (Bilag 17 — konsolideret AI-DPA der dækker chat LLM + embeddings + VLM).
- Udfør Transfer Impact Assessment (TIA) — vurdering af USA-retsmiljø (FISA 702, EO 12333, CLOUD Act) + suppl. foranstaltninger. Ramme i Bilag 8 (LEVERANDØERSTYRING.md) afsnit 5.1.
- Verificer OpenRouter's underbehandler-liste (inkl. upstream-model-udbydere Anthropic/Meta/OpenAI per GDPR Art. 28(4)) og zero-retention-tilvalg hvor muligt.
- Vedhæft underskrevne DPA + SCC + TIA som separate PDF'er ved indsendelsen.
**Ansvarlig:** Jess Martin Christoffersen (juridisk) · **Tidsramme:** 2-5 dage (primært ventetid)
**Acceptkriterier:** Underskrevet OpenRouter DPA (Bilag 17) + EU-SCC (Modul 2) + TIA vedhæftet; Bilag 12 status opdateret.

### U-3 — Content-Security-Policy (CSP) header
**Problem:** Ingen CSP-header udsendes (XSS-risiko).
**Handling:**
- Føj CSP-header i `next.config.ts`.
- Start med `Report-Only` i ~1 uge for at identificere legitime kilder.
- Skift til enforce-mode: `default-src 'self'`, `script-src 'self' 'nonce-...'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'self'`.
- Dokumenter i Bilag 9 afsnit 5.2 + Bilag 3 afsnit 8.5.
**Ansvarlig:** Teknisk ansvarlig · **Tidsramme:** 1-2 dage
**Acceptkriterier:** CSP aktiv i enforce-mode uden violationer ved normal brug.

### U-4 — Antivirus-scanning af uploads
**Problem:** Uploads scannes ikke for malware (kun MIME-whitelist).
**Handling:**
- Installer ClamAV-daemon på IONOS VPS.
- Integrer asynkron scan i upload-ruter (`/api/transactions/upload`, `/api/documents`, `/api/backups/upload-restore`).
- Bloker ved positiv detection; log i AuditLog.
- Dokumenter i Bilag 2 (COMPLIANCE_RAPPORT.md) afsnit 9.
**Ansvarlig:** Teknisk ansvarlig · **Tidsramme:** 2-3 dage
**Acceptkriterier:** EICAR-test-fil blokeres; AuditLog-post pr. upload.

### U-5 — Socket.IO handshake-auth
**Problem:** Hermes + notification-ws Socket.IO join-event mangler handshake-auth; userId/tenantId sendes via klient-body.
**Handling:**
- Konfigurer `io.use()` middleware der kræver `handshake.auth.token` = gyldig session.
- Udled userId/tenantId fra session, ikke klient-body.
- Implementeres for både Hermes-agent og notification-ws-service.
- Opdater Bilag 6 R-20 + R-19.
**Ansvarlig:** Teknisk ansvarlig · **Tidsramme:** 1-2 dage
**Acceptkriterier:** Forbindelser uden gyldig session afvises; eksisterende flow fungerer.

### U-6 — Webhook HMAC dev-fallback fjernes
**Problem:** Webhook-ruter accepterer alle signaturer hvis `WEBHOOK_SECRET` er tom (kritisk i produktion).
**Handling:**
- Fjern "accept all"-fallback — kast hvis env mangler (fail-closed).
- Verificér at alle webhook-secrets er sat i produktions-`.env`.
- Udskift samtidig TokenPay string-XOR med `crypto.timingSafeEqual` (U-14).
- Opdater Bilag 3 afsnit 3.8 + Bilag 6 R-11.
**Ansvarlig:** Teknisk ansvarlig · **Tidsramme:** 0,5 dag
**Acceptkriterier:** Webhook med ugyldig signatur afvises; produktions-secrets verificeret.

### U-7 — voucherNumber aktiveres på produktions-VPS
**Problem:** Koden er implementeret men `bun run db:push` ikke kørt — funktionen inaktiv i produktion.
**Handling:**
- Tag pre-migration backup af Neon-DB.
- Kør `bun run db:push` på produktions-VPS.
- Backfill `voucherNumber` for eksisterende journalposter.
- Verificér at nye poster får format `BIL-ÅÅÅÅ-NNNN`.
**Ansvarlig:** Teknisk ansvarlig · **Tidsramme:** 0,5 dag
**Acceptkriterier:** Schema matcher produktion; eksisterende poster har voucherNumber; nye poster sekventielle.

### U-8 — SKAT Moms-API credentials
**Problem:** `vat-submit.ts` simulerer hvis credentials mangler.
**Handling:**
- Opret/verificér NemVirksomhed-konto hos Skattestyrelsen for AlphaAi Consult ApS (CVR 46312058).
- Ansøg om adgang til Moms-API (scope `moms:indberet`).
- Sæt `SKAT_CLIENT_ID` + `SKAT_CLIENT_SECRET` i produktions-`.env`.
- Test mod Skattestyrelsens test-miljø.
- Opdater Bilag 4 (BRUGSVEJLEDNING.md) afsnit 9.3.
**Ansvarlig:** Jess Martin Christoffersen (Skattestyrelsen) + teknisk (konfiguration) · **Tidsramme:** 1 dag kode + Skattestyrelsen ventetid
**Acceptkriterier:** `hasSkatCredentials()` returnerer true; test-momsangivelse successfuld.

### U-9 — NemHandel Access Point-aftale (Storecove)
**Problem:** `nemhandel-client.ts` simulerer uden reel AP-aftale.
**Handling:**
- Indgå Access Point-aftale med Storecove B.V. (Bilag 15) — fungerer som både Peppol og NemHandel AP.
- Sæt `NEMHANDEL_SIMULATION_MODE=false` + `STORECOVE_API_KEY` i produktion.
- Test e-faktura-afsendelse (OIOUBL type 380) til test-modtager.
- Tilmeld AlphaFlow hos NemHandelsregisteret via Storecove.
- Opdater Bilag 4 afsnit 6.4 + 16.3.
**Ansvarlig:** Jess Martin Christoffersen (Storecove) + teknisk (konfiguration) · **Tidsramme:** 1-3 dage + Storecove ventetid
**Acceptkriterier:** Storecove-aftale underskrevet; test-e-faktura leveret; NemHandel-tilmelding bekræftet.

---

## 4. Kategori B — Indsendes med åbenhed

Disse mangler blokerer ikke registrering. AlphaAi Consult ApS indsender med åbenheds-erklæring (Bilag 1 afsnit 8) og forpligter sig til udbedring efter offentliggjort tidsplan.

| ID | Mangel | Handling (kort) | Mål |
|---|---|---|---|
| U-10 | Caddy rate_limit plugin | Installer plugin + aktivér udkommenteret blok | 3 måneder |
| U-11 | Next.js middleware.ts | Central auth + tenant-isolation som tillæg til `withGuard()` | 6 måneder |
| U-12 | Account-lockout | Lås efter 10 fejlede forsøg pr. 24t + email-notifikation | 3 måneder |
| U-13 | Password min. 8 tegn | Hæv fra 6 til 8 (NIST 800-63B) + strength-meter | 3 måneder |
| U-14 | TokenPay timingSafeEqual | Udskift string XOR med `crypto.timingSafeEqual` | Sammen med U-6 |
| U-15 | Hash-chain på posteringer | Afklar med Erhvervsstyrelsen om BEK 97 Bilag 1 kræver hash-chain udover AuditLog 3-niveau; implementér hvis krævet | Efter afklaring |
| U-16 | Persondata-kryptering i DB (hvile) | Field-level AES-256-GCM på udvalgte felter; kræver U-1 først | 6 måneder |
| U-17 | Backup-scheduler uafhængig | Flyt fra process-intern node-cron til separat PM2-app/systemd/crontab | 6 måneder |

---

## 5. Kategori C — Accepterede mangler

Følgende er bevidste produktvalg eller mangler med Lav restrisiko med kompenserende foranstaltninger. Oplyses i åbenhed (Bilag 1 afsnit 8) uden separat udbedringsplan.

| ID | Mangel | Begrundelse |
|---|---|---|
| U-18 | Bank-API stubs (Nordea/Danske/Jyske) | Tink er reel integration; Demo + CSV-import dækker øvrige. Andre banker aktiveres ved behov. |
| U-19 | AI-bankafstemning sandbox-only | Manuel afstemning implementeret og opfylder kravet. AI er value-add. |
| U-20 | Ingen MitID/SSO/SAML | Ikke lovpåkrævet for bogføringssystemer. Email+password+TOTP opfylder BEK 97 §8 stk. 4 (D2). |
| U-21 | Ingen CSRF-token | Kompenseret via SameSite=Lax cookie + Bearer-token. Lav restrisiko. |
| U-22 | SQLite i mini-services ukrypteret | `scanner.db` kun scan-historik; `access.db` beskyttes af VPS disk-encryption + adgangskontrol. Lav restrisiko. |
| U-23 | Uploads ukrypteret på VPS-disk | VPS disk-encryption + RBAC; backup-filer er AES-256-GCM-krypterede. Lav restrisiko. |

---

## 6. Tidsplan før indsendelse

| Uge | Handlinger |
|---|---|
| **Uge 1** | U-3 (CSP), U-6 + U-14 (webhook + timingSafeEqual), U-7 (voucherNumber), U-5 (Socket.IO auth) |
| **Uge 1-2** | U-4 (ClamAV), U-2 (DPA/SCC/TIA — parallel jur. proces) |
| **Uge 2-3** | U-1 (key rotation — største tekniske indsats) |
| **Uge 2-4** | U-8 (SKAT — afhænger af Skattestyrelsen), U-9 (Storecove — afhænger af Storecove) |
| **Uge 4** | Verifikation af alle Kategori A acceptkriterier |
| **Uge 5** | Indsendelse via virk.dk |

**Samlet tidsramme:** 4-6 uger (parallelle spor; afhængigheder primært eksterne).

---

## 7. Sign-off før indsendelse

Før indsendelse bekræftes at:

- [ ] Alle Kategori A-mangler er udbedret og acceptkriterier opfyldt.
- [ ] Bilag 1 afsnit 8 (åbenhedsliste) opdateret — Kategori A-mangler fjernet, Kategori B/C forbliver.
- [ ] Bilag 6 (RISIKOVURDERING.md) §6 restrisiko-fordeling opdateret for udbedrede risici.
- [ ] Bilag 12 (BILAG_OVERSIGT.md) afsnit 3 — DPA-status opdateret til "Underskrevet" for berørte bilag.
- [ ] Berørte dokumenter (Bilag 2, 3, 4, 7, 9) opdateret hvor Kategori A-udbedringer ændrer beskrivelsen.

| Rolle | Navn | Dato | Underskrift |
|---|---|---|---|
| Teknisk ansvarlig | Jess Martin Christoffersen | _[dato]_ | _[underskrift]_ |
| Direktør (AlphaAi Consult ApS) | Jess Martin Christoffersen | _[dato]_ | _[underskrift]_ |

---

## 8. Vedligeholdelse

- **Ved hver Kategori B-udbedring:** opdater dette dok + Bilag 6 R-XX + underret Erhvervsstyrelsen ved væsentlige ændringer (BEK 98 §6).
- **Årlig review (Q1):** gennemgå Kategori C — vurder om nogle skal løftes til B.
- **Ved ny regulering:** vurder om planen skal udvides.

### Versionshistorik

| Version | Dato | Ændring |
|---|---|---|
| 1.0 | 2025 | Første version — 5 compliance-mangler. |
| 2.0 | Juli 2025 | Implementeringslog for 5 mangler. |
| 3.0 | 2026 | Udvidet med R-01..R-20 fra Bilag 6; Kategori A/B/C-struktur. |
| 3.1 | 2026 | Simplificeret — fokuseret på konkret handlingsplan; OpenRouter som hoved-databehandler for AI (underbehandlere håndteres af OpenRouter per GDPR Art. 28(4)). |
| 3.2 | 2026 | AI-konsolidering: kun OpenRouter som AI-udbyder (OpenAI/Anthropic fjernet som selvstændige underbehandlere per GDPR Art. 28(4)). U-2 opdateret — scanner-VLM går nu via OpenRouter (ikke separat Anthropic DPA). Bilag-reference opdateret: Bilag 17 = OpenRouter (konsolideret AI-DPA), Bilag 18 = Simply/Brevo, Bilag 19 = xlsx-tjekliste. |

---

*Bilag 10 i AlphaFlows anmeldelsespakke til Erhvervsstyrelsen.*
