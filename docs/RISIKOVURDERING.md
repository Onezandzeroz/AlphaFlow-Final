# Risikovurdering (DPIA) — AlphaFlow

| **Felt** | **Oplysning** |
|---|---|
| **Dokumenttype** | Konsekvensanalyse / Data Protection Impact Assessment (DPIA) jf. GDPR Art. 35 + IT-risikovurdering jf. ISO/IEC 27005:2022 |
| **Version** | 3.0 |
| **Dato** | 2026 |
| **Dataansvarlig** | AlphaAi Consult ApS (CVR 46312058) |
| **System** | AlphaFlow (`alphaai-accounting` v1.0.0) — alphaflow.dk |
| **Klassifikation** | Fortroligt — Compliance-dokumentation |
| **Gyldighedsperiode** | 12 måneder (næste årlige revision; desuden ved væsentlige arkitektur- eller infrastrukturændringer) |
| **Relaterede dokumenter** | `BEREDSKABSPLAN.md`, `UDBEDRINGSPLAN.md`, `ENCRYPTION.md`, `LEVERANDØERSTYRING.md`, `DATABEHANDLERAFTALE.md`, `NEON & IONOS_IT_SIKKERHED.md`, `COMPLIANCE_RAPPORT.md` |
| **Lovgrundlag** | GDPR (EU 2016/679), Lov om bogføring (LOV nr. 700 af 24. maj 2022), Kravbekendtgørelsen (BEK nr. 97 af 26. januar 2023), Anmeldelsesbekendtgørelsen (BEK nr. 98 af 26. januar 2023), ISO/IEC 27001/27005:2022, NIST SP 800-63B |

---

## 1. Indledning

### 1.1 Formål

Denne risikovurdering er udarbejdet som en **Konsekvensanalyse (DPIA) jf. GDPR Art. 35** og som IT-risikovurdering jf. **ISO/IEC 27005:2022**. Dokumentet understøtter AlphaFlows anmeldelse til Erhvervsstyrelsen som standardiseret bogføringssystem jf. Anmeldelsesbekendtgørelsen (BEK nr. 98 af 26. januar 2023).

Formålet er at:

1. Identificere, vurdere og håndtere IT-sikkerheds- og persondatarisici i AlphaFlow-platformen.
2. Dokumentere eksisterende tekniske og organisatoriske afhjælpninger (verificeret i kodebasen).
3. Være ærlig om identificerede mangler — se risici R-01..R-20 — og referere til `UDBEDRINGSPLAN.md` for planlagt afhjælpning.
4. Opfylde Erhvervsstyrelsens hovedkrav per Kravbekendtgørelsen (BEK nr. 97 af 26. januar 2023) §8 stk. 4: **N2** (risikovurdering af tab af tilgængelighed), **N3** (tredjeparter), **N4** (trusselsændringer), **N5** (konsekvens- og sandsynlighedsvurdering), **D1** (it-sikkerhed på tilstrækkeligt niveau), **D15** (hændelig tilintetgørelse).

### 1.2 Scope

Vurderingen dækker hele AlphaFlow-platformen — en multi-tenant SaaS bogføringsplatform:

- **Host-app:** Next.js 16 (App Router, TypeScript 5) på IONOS VPS (EU/Tyskland), port 3000, PM2 fork-mode.
- **Mini-services (6 PM2-apps):** `alphaflow:3000`, `hermes-agent:3004`, `knowledge-service:3006`, `tokenpay-access:3100`, `notification-ws:3001`, `scanner-service:3005` (Python/FastAPI).
- **Database:** PostgreSQL på Neon (EU: Frankfurt + Amsterdam), Prisma ORM, pgvector-udvidelse.
- **Reverse proxy/TLS:** Caddy (self-hosted på IONOS VPS), Let's Encrypt, TLS 1.2/1.3.
- **Backup-lagring:** IONOS VPS (`Tenant-Backup/{companyName}/`), AES-256-GCM-krypterede ZIPs.
- **13 integrationer:** 12 EU-baserede + 1 USA-baseret (OpenRouter, som videresender til model-udbydere per GDPR Art. 28(4)).

Vurderingen dækker de tre sikkerhedsdimensioner i **BEK 97 §8 stk. 2 (CIA-triaden)**: sikring mod (i) hændelig tilintetgørelse, (ii) uautoriseret adgang og (iii) uautoriseret ændring af bogføringsdata — jf. Kravbekendtgørelsen (BEK nr. 97 af 26. januar 2023) §8 stk. 2. Dette er det overordnede krav som risikovurderingen i nedenstående afsnit dækker.

### 1.3 Metodologi

Risikovurderingen er udført i overensstemmelse med ISO/IEC 27005:2022 og omfatter:

1. **Kontekstetablering** — se afsnit 2–4.
2. **Trusselsidentifikation** — se afsnit 3.
3. **Aktiv- og sårbarhedsidentifikation** — se afsnit 4.
4. **Risikovurdering** — systematisk tabel med 20 risici (R-01..R-20), se afsnit 5.
5. **Risikomatrix** — se afsnit 6.
6. **Risikohåndtering** — eksisterende afhjælpninger dokumenteret pr. risiko; planlagte afhjælpninger i `UDBEDRINGSPLAN.md`.
7. **Restrisiko og accept** — se afsnit 7.
8. **Konklusion** — se afsnit 8.

Risikoniveau = Sandsynlighed × Konsekvens.

#### Sandsynlighedsskala

| Niveau | Beskrivelse | Frekvens |
|---|---|---|
| **Lav (L)** | Usandsynligt men muligt | < 1 gang pr. 5 år |
| **Mellem (M)** | Muligt og forventeligt | 1 gang pr. 1–5 år |
| **Høj (H)** | Sandsynligt at indtræffe | Månedligt/årligt |

#### Konsekvensskala

| Niveau | Beskrivelse | Eksempel |
|---|---|---|
| **Lav (L)** | Ubetydelig indvirkning | Midlertidig forsinkelse; ingen persondata berørt |
| **Mellem (M)** | Mærkbar indvirkning på forretning | Enkel bruger mister adgang; data korrupt; GDPR-relevant |
| **Høj (H)** | Betydelig forretningsmæssig skade | Omfattende datatab; system nede i timer; anmeldelsespligt |
| **Kritisk (K)** | Eksistens truet; lovkrav overtrådt | Komplet datatab; GDPR-breach; bogføringslovbrud |

#### Risikoniveau ( før afhjælpning )

Se matrix i afsnit 6.

### 1.4 Ansvarlig

| Rolle | Navn / Enhed |
|---|---|
| Dataansvarlig | AlphaAi Consult ApS (CVR 46312058) |
| DPO / Compliance-ansvarlig | _[Udfyldes]_ |
| Teknisk ansvarlig | _[Udfyldes]_ |
| Årlig review-ansvarlig | _[Udfyldes]_ |

---

## 2. Kontekst & arkitektur

AlphaFlow er en cloud-baseret dansk bogføringsplatform (SaaS) for små og mellemstore virksomheder. Platformen tilbyder dobbelt bogføring, fakturering, momsangivelse, e-fakturering (NemHandel/Peppol via Storecove), AI-assistent (Hermes), dokument-OCR (Tesseract + VLM via OpenRouter) og bank-integration (scaffolding).

### 2.1 Teknisk arkitektur (verificeret)

| Komponent | Teknologi | Lokation |
|---|---|---|
| Host-app | Next.js 16, TypeScript 5, Node runtime | IONOS VPS (EU/Tyskland) |
| Mini-services | Bun (4 services) + Python/FastAPI (scanner) | Samme VPS |
| Proces-manager | PM2 fork-mode (6 apps) | Samme VPS |
| Reverse proxy | Caddy + Let's Encrypt, TLS 1.2/1.3 | Samme VPS |
| Database | PostgreSQL på Neon (serverless) + Prisma ORM + pgvector | EU (Frankfurt + Amsterdam) |
| 2 SQLite mini-DBs | `scanner.db`, `access.db` (WAL mode) | VPS-disk |
| Backup-lagring | `Tenant-Backup/{companyName}/` AES-256-GCM ZIPs | VPS-disk (EU) |
| Upload-lagring | `uploads/receipts/`, `uploads/documents/` | VPS-disk (EU) |

### 2.2 Multi-tenant isolation

`Company` = tenant-grænse. `companyId` på 24 Prisma-modeller. `tenantFilter(ctx)` i `src/lib/route-guard.ts` gennemtvinger per-row isolation på alle DB-queries. RBAC: 5 roller (OWNER>ADMIN>ACCOUNTANT>VIEWER>AUDITOR), 18 permissions, SuperDev oversight-mode (read-only cross-tenant for AlphaAi-ansatte), demo-firma read-only.

### 2.3 Persondata

AlphaFlow behandler **ikke CPR-numre** — kun CVR. Persondatakategorier (jf. GDPR Art. 4(1)):

- **Identitetsdata:** navn, email, telefon, adresse (på brugere og kontakter).
- **Finansielle data:** posteringer, fakturaer, momsangivelser, bank-transaktioner.
- **Adgangskoder:** bcrypt 12 rounds.
- **2FA-secrets:** AES-256-GCM-krypteret TOTP RFC6238 + 10 SHA-256+salt backup-koder.
- **Bank-tokens:** AES-256-GCM-krypteret.
- **IP/User-Agent:** audit-log og session-log.

Felter der opbevares **ukrypteret i DB** (verificeret i P1-DB / P1-SEC): `Contact.email`, `Contact.phone`, `BankConnection.accountNumber`, `BankConnection.iban`, `Company.bankAccount`, `Company.bankRegistration`, de fleste personnavne/adresser. Disse er afhængige af Neons disk-encryption (managed) — se risiko R-12.

### 2.4 Integrationer (13, verificeret)

1 integration transmitterer data til USA — se risiko R-13:

| # | Integration | Lokation | Data ud af EU? |
|---|---|---|---|
| 1 | Neon PostgreSQL | EU | Nej |
| 2 | SKAT Moms-API | DK | Nej |
| 3 | Storecove (Peppol) | Holland | Nej |
| 4 | Frisbii/Flatpay | Tyskland | Nej |
| 5 | CVR-opslag (VIRK) | DK | Nej |
| 6 | **OpenRouter** (Hermes chat + embeddings + scanner VLM) | **USA** | **JA** (videresender til model-udbydere per GDPR Art. 28(4)) |
| 7 | TokenPay (intern) | Samme VPS | Nej |
| 8 | SMTP (Simply/Brevo) | EU | Nej |
| 9 | IONOS VPS | Tyskland | Nej |
| 10 | notification-ws (intern) | Samme VPS | Nej |
| 11 | Backup-system | VPS (EU) | Nej |
| 12 | Bank-API'er | Stub-only | — |
| 13 | z-ai-web-dev-sdk | Sandbox-only | — |

---

## 3. Trusselsmodel

### 3.1 Trusselaktører

| Trusselaktør | Motivation | Kapacitet |
|---|---|---|
| **Ekstern angriber** | Økonomisk gevinst, data-udnyttelse, ransomware | Høj — automatiserede værktøjer, botnets, public-facing overflade |
| **Ondsindet insider (bruger)** | Konkurrencefordel, hævn, fejlbehæftet handling | Begrænset til egen tenant — men SuperDev oversight-mode har cross-tenant read-adgang |
| **Forvirret insider (bruger)** | Uheldig fejl, manglende træning | Lav — begrænset af RBAC og audit-log |
| **Underbehandler-kompromittering** | OpenRouter/Neon/IONOS | Lav–mellem — afhængig af underbehandlers sikkerhedskontrol |
| **Myndighedskrav** | Lovgivningsmæssig adgang, retskendelse | Lav i DK — retsbeskyttelse via grundloven |
| **Teknisk fejl** | Software-bug, infrastruktur-fejl, konfiguration | Mellem — kompleks multi-service arkitektur |
| **Naturkatastrofe / fysisk hændelse** | Brand, strømsvigt, hardware-fejl | Lav — Neon cloud + IONOS VPS i Tyskland |

### 3.2 Trusselsvektorer

- **Netværksbaseret:** XSS, CSRF, SQL-injection, DDoS, MITM (afvist af TLS 1.2/1.3).
- **Applikationsbaseret:** Insecure direct object reference (IDOR), fil-upload misbrug, path-traversal, deserialisation, klasse-omgivelser.
- **Identity-based:** Password brute-force, credential stuffing, session-hijack, 2FA-bypass.
- **Infrastruktur-baseret:** VPS-kompromittering, DB-kompromittering, backup-tyveri, key-lækage.
- **Leverandør-baseret:** Underbehandler data breach, USA-dataoverførsel (Schrems II).
- **Intern:** Misconfiguration, ufuldstændig route-guard, udtørret hukommelse (in-memory state nulstilles ved restart).

---

## 4. Aktiver & sårbarheder

### 4.1 Aktiver

| Aktiv ID | Aktiv | Klassifikation | Beskrivelse |
|---|---|---|---|
| **A1** | Persondata i Neon DB | Fortroligt | Identitetsdata, finansielle data, adgangskoder, 2FA-secrets, bank-tokens |
| **A2** | Finansielle data (bogføringsdata) | Fortroligt + Regulatorisk | Posteringer, journalposter, fakturaer, momsangivelser — BEK 97 Bilag 1 (uforanderlighed) samt BEK 97 §3 (5-års opbevaring) og §7 (backup), udstedt i medfør af Lov om bogføring §13 og §15 |
| **A3** | `ENCRYPTION_KEY` (64-hex) | Kritisk | AES-256-GCM-nøgle for bank-tokens, TOTP-secrets, backup-koder, backup-filer |
| **A4** | `PROOF_ENCRYPTION_KEY` (64-hex) | Kritisk | AES-256-GCM-nøgle for `.tbkey` proof-filer (TokenPay adgang) |
| **A5** | Backup-filer (`Tenant-Backup/`) | Fortroligt + Regulatorisk | AES-256-GCM-krypterede ZIPs pr. tenant + manifest v2 + SHA-256 checksum |
| **A6** | Upload-lagring (`uploads/`) | Fortroligt | Bilag, kvitteringer, dokumenter pr. tenant |
| **A7** | Session-tokens | Fortroligt | 256-bit httpOnly+secure+sameSite=lax cookies, 7d sliding expiry |
| **A8** | Inter-service API-nøgler | Kritisk | `TOKENPAY_API_KEY`, `SCANNER_API_KEY`, `HERMES_ADMIN_KEY`, `FLATPAY_API_KEY+WEBHOOK_SECRET`, `STORECOVE_API_KEY+WEBHOOK_SECRET` |
| **A9** | Eksterne API-secrets | Kritisk | `OPENROUTER_API_KEY`, `SKAT_CLIENT_SECRET`, `CVR_API_PASSWORD`, `SMTP_PASS` |
| **A10** | AI-data (Hermes / embeddings / scanner-billeder) | Fortroligt | Sendes til USA — se R-13 |
| **A11** | SQLite mini-DBs (`scanner.db`, `access.db`) | Fortroligt | Scan-job-historik + access-log + proof-fil-references — ukrypteret på disk, se R-18 |
| **A12** | AuditLog | Regulatorisk | 3-niveau immutable audit-trail — BEK 97 Bilag 1 (uforanderlighed) compliance-bevis, jf. Lov om bogføring §13 |

### 4.2 Sårbarheder (verificeret i P1-SEC / P1-DB / P1-INT / P1-SVC-b)

Nedenstående sårbarheder er **bekræftet i kodebasen** og danner grundlag for risici i afsnit 5:

1. Ingen Content-Security-Policy (CSP) header.
2. Ingen antivirus-scanning af uploads.
3. Ingen key rotation / versioning — `ENCRYPTION_KEY` og `PROOF_ENCRYPTION_KEY` er statiske.
4. Ingen kryptografisk hash-chain på posteringer — immutability via AuditLog + DB-triggere kun.
5. Ingen account-lockout — kun IP-baseret rate-limiting.
6. Password min. længde 6 tegn (under NIST 800-63B anbefaling på 8).
7. Caddy `rate_limit` plugin ikke installeret — konfiguration udkommenteret i Caddyfile.
8. Ingen `middleware.ts` i Next.js — ingen central request-filter.
9. Ingen CSRF-token — kun SameSite=Lax cookie.
10. Ingen OAuth/SSO/SAML.
11. Webhook HMAC dev-fallback accept-all hvis `WEBHOOK_SECRET` tom (`flatpay-client.ts`, `storecove-client.ts`).
12. Persondata opbevares ukrypteret i DB (`Contact.email/phone`, `BankConnection.accountNumber/iban`, `Company.bankAccount`).
13. USA-dataoverførsel: OpenRouter (som videresender til model-udbydere per GDPR Art. 28(4)).
14. TokenPay callback `timingSafeEqual` er manuelt implementeret (string XOR, ikke `crypto.timingSafeEqual`).
15. Bank-API'er (Tink/Nordea/Danske/Jyske) er stubs — ingen reelle kald.
16. `z-ai-web-dev-sdk` (AI-bankafstemning) er sandbox-only — virker ikke i produktion.
17. Backup-scheduler er process-intern (`node-cron` i alphaflow PM2-app) — stopper hvis appen crasher.
18. SQLite-filer (`scanner.db`, `access.db`) ukrypteret på VPS-disk.
19. `notification-ws /broadcast` har ingen auth (forventes kun localhost).
20. Hermes Socket.IO `join`-event har ingen handshake-auth (tenantId/userId/userName sendes ukontrolleret).

### 4.3 Bekræftede sikkerhedsfeatures (verificeret)

Følgende tekniske kontroller er implementeret og udgør den eksisterende afhjælpning:

- ✅ AES-256-GCM kryptering (bank-tokens, TOTP-secrets, backup-koder, backup-filer, `.tbkey` proofs).
- ✅ Bcrypt password-hashing (12 rounds).
- ✅ TOTP 2FA RFC 6238 + 10 backup-koder (SHA-256+salt).
- ✅ Tenant-wide 2FA-tveng (`Company.twoFactorRequired`).
- ✅ Multi-tenant isolation via `tenantFilter` + per-row `companyId`.
- ✅ RBAC: 5 roller, 18 permissions, SuperDev oversight read-only.
- ✅ Path-traversal beskyttelse (`isPathWithin`).
- ✅ MIME-type whitelist på uploads (25 MB max).
- ✅ HTTP security headers: HSTS preload, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy.
- ✅ TLS 1.2/1.3 (Caddy).
- ✅ HttpOnly + Secure + SameSite=Lax session cookies.
- ✅ In-memory rate-limiting på auth-endpoints (login 5/min/IP, register 3/min, 2FA 5-10/min, forgot-password 1/5min/email).
- ✅ Webhook HMAC-SHA256 verifikation (Frisbii, Storecove, TokenPay) — `timingSafeEqual` for Frisbii.
- ✅ Audit-trail immutability 3 niveauer: app CREATE-only + PostgreSQL BEFORE UPDATE/DELETE triggers (`prevent_audit_update`, `prevent_audit_delete`) + `onDelete: Restrict` cascade.
- ✅ Konto-deaktivering i stedet for hard-delete (BEK 97 Bilag 1 (uforanderlighed) — Lov om bogføring §13 > GDPR Art. 17(3)(c)).
- ✅ Sliding session expiry (7 dage) — password-reset invaliderer alle eksisterende sessioner.
- ✅ Audit-logging i 75+ API-routes (auth, mutationer, oversight, 2FA, backup).
- ✅ Demo-firma read-only for non-SuperDev.
- ✅ Neons disk-encryption (managed) + PITR 7 dage.
- ✅ IONOS VPS C5 + IT-Grundschutz cert. (EU-hosting).
- ✅ AES-256-GCM-krypterede backup-ZIPs (`.zip.enc`) + SHA-256 checksum + manifest v2.
- ✅ Backup retention: hourly 25t / daily 31d / weekly 53d / monthly 5 år / manual 90d.
- ✅ CronExecution DB-log + startup catch-up + retry 3x exp. backoff + overlap guard + pre-restore safety backup + atomisk gendannelse.
- ✅ `HermesAgent.dataAccessEnabled` per-tenant opt-in (default `false`) — data minimization over for USA-underbehandlere.

---

## 5. Risici (systematisk tabel)

For hver risiko: ID, beskrivelse, trussel, sårbarhed, aktiv, sandsynlighed (før), konsekvens (før), risikoniveau (før), eksisterende afhjælpning (verificeret), rest risiko, henvisning til `UDBEDRINGSPLAN.md`.

### R-01 — Ingen Content-Security-Policy (CSP) header

| Attribut | Værdi |
|---|---|
| **Beskrivelse** | Next.js app udsender ingen `Content-Security-Policy` header (verificeret i `next.config.ts` og `Caddyfile`). Tillader potentiel XSS-eksekvering hvis input-validering eller React-escape fejler. |
| **Trussel** | Ekstern angriber (XSS-injection via f.eks. faktura-beskrivelse, kontakt-note, Hermes chat). |
| **Sårbarhed** | Manglende CSP-header — bekreftet via P1-SEC afsnit 8. |
| **Aktiv** | A7 (session-tokens), A1 (persondata i browser). |
| **Sandsynlighed** | Mellem |
| **Konsekvens** | Høj |
| **Risikoniveau (før)** | **Høj** |
| **Eksisterende afhjælpning** | React/Next escape output som standard; `X-Frame-Options: SAMEORIGIN`, `X-XSS-Protection: 1; mode=block`; MIME-type whitelist på uploads forhindrer upload-af-XSS via filer; path-traversal guard. |
| **Rest risiko** | Mellem |
| **Afhjælpning** | `UDBEDRINGSPLAN.md` — tilføj CSP-header (report-only først, derefter enforce) med `script-src 'self' 'nonce-...'`, `object-src 'none'`, `base-uri 'self'`. |

### R-02 — Ingen antivirus-scanning af uploads

| Attribut | Værdi |
|---|---|
| **Beskrivelse** | Bilag/PDF/Office-filer (`/api/transactions/upload`, `/api/documents`) scannes ikke for malware. Bekreftet via grep — ingen matches for `virus`, `clamav`, `malware`, `antivirus` i kodebasen. |
| **Trussel** | Ondsindet bruger uploader malware-inficeret dokument med henblik på lateral movement når filen åbnes af revisor/admin i AlphaFlow (eller downloader filen lokalt). |
| **Sårbarhed** | Kun MIME-whitelist + størrelsesgrænse (25 MB) + path-traversal guard — ingen indholdsscan. |
| **Aktiv** | A6 (uploads), A1 (persondata via lateral movement), A12 (VPS-system). |
| **Sandsynlighed** | Mellem |
| **Konsekvens** | Høj |
| **Risikoniveau (før)** | **Høj** |
| **Eksisterende afhjælpning** | MIME-whitelist (`ALLOWED_RECEIPT_TYPES`: JPEG/PNG/WebP/GIF/BMP/TIFF/PDF) + MIME↔extension cross-check + path-traversal guard + tenant-scoped serving. Office-formater tilladt for `/api/documents` (kan indeholde makroer). |
| **Rest risiko** | Mellem |
| **Afhjælpning** | `UDBEDRINGSPLAN.md` — integrer ClamAV-daemon på VPS, scan alle uploads asynkront før persisted-commit; bloker upload ved positiv detection. Alternativt: scan Office-filer kun (mindre overflade end billeder/PDF). |

### R-03 — Ingen key rotation / versioning

| Attribut | Værdi |
|---|---|
| **Beskrivelse** | `ENCRYPTION_KEY` (AES-256-GCM, 64-hex) og `PROOF_ENCRYPTION_KEY` er statiske env-variabler. Ingen mekanisme til rotation, versioning eller fuld re-encryption. |
| **Trussel** | Kompromitteret nøgle (f.eks. via `.env`-lækage, tidligere medarbejder, log-fejl). |
| **Sårbarhed** | Hvis nøglen kompromitteres, forbliver alle krypterede data (bank-tokens, TOTP-secrets, backup-koder, backup-ZIPs, `.tbkey` proofs) kompromitterede indtil manuel fuld re-encryption er udført. |
| **Aktiv** | A3 (`ENCRYPTION_KEY`), A4 (`PROOF_ENCRYPTION_KEY`), A5 (backup-filer), A1 (krypterede persondata). |
| **Sandsynlighed** | Lav |
| **Konsekvens** | Kritisk |
| **Risikoniveau (før)** | **Høj** |
| **Eksisterende afhjælpning** | AES-256-GCM (12-byte IV, 16-byte auth-tag); nøgler i env vars (ikke hardcoded); adskilt `ENCRYPTION_KEY` / `PROOF_ENCRYPTION_KEY`; `.env.example` dokumenterer `openssl rand -hex 32` for generering; PM2 ecosystem.config.js for env-injektion. |
| **Rest risiko** | Høj — manuel rotation + fuld re-encryption er dokumenteret som ikke-implementeret i `UDBEDRINGSPLAN.md`. |
| **Afhjælpning** | `UDBEDRINGSPLAN.md` — implementer `keyVersion` kolonne på BankConnection/User/Backup; migration-script der re-krypterer alle data ved nøglerotation; dokumenteret nøglerotation-procedure i `BEREDSKABSPLAN.md` afsnit 5. |

### R-04 — Ingen hash-chain på posteringer

| Attribut | Værdi |
|---|---|
| **Beskrivelse** | BEK 97 Bilag 1 (uforanderlighed) — Lov om bogføring §13 — håndhæves KUN via AuditLog + PostgreSQL-triggere — ingen kryptografisk hash-chain mellem posteringer (`previousHash`/`hash`/`locked`/`immutable`/`version` felter findes ikke, bekræftet via grep). |
| **Trussel** | Insider med direkte DB-adgang (DBA, ondsindet Neon-ansat) forsøger at ændre historiske posteringer "usynligt". |
| **Sårbarhed** | AuditLog-tabellen er immutable (3-niveau), men selve `JournalEntry`/`Transaction`-rækker kan i princippet muteres direkte i DB uden hash-chain-detektion. |
| **Aktiv** | A2 (finansielle data), A12 (AuditLog). |
| **Sandsynlighed** | Lav |
| **Konsekvens** | Høj |
| **Risikoniveau (før)** | **Mellem** |
| **Eksisterende afhjælpning** | 3-niveau immutability: (1) app CREATE-only audit-funktioner (`src/lib/audit.ts`), (2) PostgreSQL `BEFORE UPDATE/DELETE` triggers `prevent_audit_update`/`prevent_audit_delete` på AuditLog, (3) `onDelete: Restrict` cascade — User/Company kan ikke slettes når AuditLog-entry findes. AuditLog indeholder `changes` JSON (`{field: {old, new}}`) + `metadata` (IP, userAgent, timestamp, reason). 25 AuditAction-typer, 24 EntityType-typer, 75+ routes logger. |
| **Rest risiko** | Lav — mutation af selve posteringerne vil ikke afspejles i AuditLog, men det vil kunne ses ved sammenligning med backup-ZIPs. |
| **Afhjælpning** | `UDBEDRINGSPLAN.md` — vurder om hash-chain (som Bitcoin-blockchain) er påkrævet af Erhvervsstyrelsen; alternativt periodisk verifikation af posteringer mod backup-checksums. Accepteret for nu — se afsnit 7. |

### R-05 — Ingen account-lockout

| Attribut | Værdi |
|---|---|
| **Beskrivelse** | Kun IP-baseret rate-limiting (login 5/min/IP, 2FA verify-login 10/min/IP) — ingen per-account lockout efter N fejlede forsøg. |
| **Trussel** | Botnet med roterende IP'er udfører distributed brute-force på password eller 2FA. |
| **Sårbarhed** | Bekræftet i P1-SEC afsnit 7: "Ingen account-lockout after N failures — kun tidsbaseret throttling pr. IP." |
| **Aktiv** | A1 (brugerkonti, adgangskoder). |
| **Sandsynlighed** | Lav |
| **Konsekvens** | Mellem |
| **Risikoniveau (før)** | **Mellem** |
| **Eksisterende afhjælpning** | In-memory sliding window rate-limit pr. IP (login 5/min, register 3/min, 2FA 5-10/min, forgot-password 1/5min/email anti-enumeration); TOTP 2FA påkrævet for OWNER/ADMIN hvis `Company.twoFactorRequired=true`; bcrypt 12 rounds (gør brute-force dyrt); `AuditLog.LOGIN_FAILED` med reason (`wrong_password` / `invalid_2fa_code`). |
| **Rest risiko** | Lav — 2FA + bcrypt gør brute-force upraktisk for de fleste konti. |
| **Afhjælpning** | `UDBEDRINGSPLAN.md` — tilføj per-account lockout efter 10 fejlede forsøg pr. 24 timer (midlertidig lås 1 time + email-notifikation). |

### R-06 — Password min. længde kun 6 tegn

| Attribut | Værdi |
|---|---|
| **Beskrivelse** | Password-validering kræver kun 6 tegn — under NIST SP 800-63B anbefaling på min. 8 tegn. |
| **Trussel** | Brute-force / dictionary-attack på svage passwords. |
| **Sårbarhed** | Bekræftet i P1-SEC / fakta-ark punkt D.24. |
| **Aktiv** | A1 (brugerkonti). |
| **Sandsynlighed** | Mellem |
| **Konsekvens** | Mellem |
| **Risikoniveau (før)** | **Mellem** |
| **Eksisterende afhjælpning** | bcrypt 12 rounds; optional TOTP 2FA (påkrævet hvis `Company.twoFactorRequired`); rate-limiting; AuditLog; password-reset invaliderer sessioner; legacy `simpleHash` auto-re-hashes til bcrypt ved login. |
| **Rest risiko** | Lav–Mellem |
| **Afhjælpning** | `UDBEDRINGSPLAN.md` — hæv min. længde til 8 tegn (NIST) eller 12 tegn (CISA-anbefaling); tilføj password-strength-meter i UI; implementer HaveIBeenPwned API-check (k-anonymity). |

### R-07 — Caddy rate_limit ikke installeret

| Attribut | Værdi |
|---|---|
| **Beskrivelse** | Caddyfile linje 86-97 definerer to rate-limit-zoner (`static_zone: 100 req/min`, `api_zone: 30 req/min`) — men blokken er **udkommenteret** med note om at `caddy-rate_limit` plugin ikke er installeret. Rate-limiting håndteres udelukkende i applikationslaget (`src/lib/rate-limit.ts`) med in-memory sliding window. |
| **Trussel** | DDoS / volumetrisk angreb mod Next.js-appen (kan oversvømme in-memory rate-limit-cache). |
| **Sårbarhed** | In-memory rate-limit nulstilles ved server-restart; ingen cross-instance koordinering (kun én VPS, så mitigations faktor); PM2 max_memory_restart 1500M for alphaflow-app kan udløses ved hukommelsesudtørring. |
| **Aktiv** | A1 (app-tilgængelighed). |
| **Sandsynlighed** | Mellem |
| **Konsekvens** | Mellem |
| **Risikoniveau (før)** | **Mellem** |
| **Eksisterende afhjælpning** | In-memory sliding window rate-limit pr. IP/endpoint; cleanup hvert 5. min; central cache-registry sweep hvert 10. min; PM2 max_memory_restart; IONOS VPS-netværksfirewall. |
| **Rest risiko** | Mellem |
| **Afhjælpning** | `UDBEDRINGSPLAN.md` — installer `caddy-rate_limit` plugin, aktivér udkommenteret blok, tilføj `429 Too Many Requests` response-handler. Alternativt: Cloudflare/IONOS edge DDoS-beskyttelse. |

### R-08 — Ingen Next.js middleware

| Attribut | Værdi |
|---|---|
| **Beskrivelse** | Der findes ingen `src/middleware.ts` i Next.js-appen — ingen central request-filter. Auth, rate-limiting og tenant-isolation håndteres pr. route via `withGuard()` wrapper i `src/lib/route-guard.ts`. |
| **Trussel** | Misconfiguration — en API-route mangler `withGuard()` og udsættes utilsigtet uden auth. |
| **Sårbarhed** | Ingen central through-going kontrol; afhængig af at 150+ routes hver især husker `withGuard()`. |
| **Aktiv** | A1 (alle API-routes), A7 (session). |
| **Sandsynlighed** | Lav |
| **Konsekvens** | Høj |
| **Risikoniveau (før)** | **Mellem** |
| **Eksisterende afhjælpning** | `withGuard()` gennemtvinger auth/company/oversight/demo/TokenPay/permissions/features på alle protected routes; `tenantFilter(ctx)` på DB-queries; SuperDev oversight read-only; demo-firma read-only;AuditLog på 75+ routes. |
| **Rest risiko** | Lav |
| **Afhjælpning** | `UDBEDRINGSPLAN.md` — implementer `src/middleware.ts` der gennemtvinger auth-redirect på alle ikke-`/login`/`/register` routes, samt default-deny for API-routes der ikke eksplicit tillader public adgang. Kombinér med CSP-header (R-01). |

### R-09 — Ingen CSRF-token

| Attribut | Værdi |
|---|---|
| **Beskrivelse** | Ingen eksplicit CSRF-token i kodebasen (bekræftet via grep — ingen `csrf`, `csrfToken`, `CSRF`). Beskyttelse mod cross-site request forgery afhænger udelukkende af `SameSite=Lax` cookie + custom Bearer-token Authorization headers. |
| **Trussel** | Cross-site request forgery — angriber lokker bruger til at besøge ondsindet side der udløser POST til AlphaFlow. |
| **Sårbarhed** | SameSite=Lax blokerer cross-site POST, men tillader top-level navigation GET. Mindre robust end double-submit CSRF. |
| **Aktiv** | A7 (session-cookie), A2 (mutationer). |
| **Sandsynlighed** | Lav |
| **Konsekvens** | Mellem |
| **Risikoniveau (før)** | **Lav** |
| **Eksisterende afhjælpning** | `SameSite=Lax` + `HttpOnly` + `Secure` cookie; Next.js indbygget CSRF-beskyttelse for POST-routes (sammen med SameSite=Lax); custom Authorization Bearer-token headers krævet på mutationer; same-origin policy for fetch. |
| **Rest risiko** | Lav |
| **Afhjælpning** | `UDBEDRINGSPLAN.md` — vurder om double-submit CSRF-token eller synchronizer-token-pattern er påkrævet. Accepteret for nu — se afsnit 7. |

### R-10 — Ingen OAuth/SSO/SAML

| Attribut | Værdi |
|---|---|
| **Beskrivelse** | Kun email+password+TOTP-auth. Ingen OAuth, SAML, OIDC, MitID eller BankID. Bekræftet i P1-SEC / fakta-ark punkt D.15-D.17. |
| **Trussel** | Ikke en sikkerhedstrussel — kommerciel/riskiko for at enterprise-kunder afviser platformen. |
| **Sårbarhed** | Manglende enterprise-feature; visse enterprise-kunder kræver SSO. |
| **Aktiv** | Kommerciel — enterprise-kunde-base. |
| **Sandsynlighed** | Høj (sandsynligvis vil nogle enterprise-kunder afvise) |
| **Konsekvens** | Lav |
| **Risikoniveau (før)** | **Mellem** |
| **Eksisterende afhjælpning** | Email+password + TOTP 2FA RFC 6238 + 10 backup-koder; invitation-system; email-verifikation; password-reset; SuperDev oversight-mode for AlphaAi-support. |
| **Rest risiko** | Mellem (accepteret — feature-afhængig). |
| **Afhjælpning** | `UDBEDRINGSPLAN.md` — vurdér MitID-erhverv-integration eller SAML 2.0 til enterprise-kunder. Accepteret for nu — se afsnit 7. |

### R-11 — Webhook HMAC dev-fallback accept-all

| Attribut | Værdi |
|---|---|
| **Beskrivelse** | `src/lib/flatpay-client.ts` og `src/lib/storecove-client.ts` tillader ugyldige webhook-signaturer hvis `WEBHOOK_SECRET` env-variablen er tom (dev-mode fallback). TokenPay-callback bruger manuelt implementeret `timingSafeEqual` (string XOR) i stedet for `crypto.timingSafeEqual`. |
| **Trussel** | Forged webhook hvis env-variabler ikke er sat i produktion (f.eks. konfigurationsfejl ved deploy). |
| **Sårbarhed** | Bekræftet i P1-SEC afsnit 6. |
| **Aktiv** | A8 (inter-service API-nøgler), A2 (abonnement-status, e-faktura-status). |
| **Sandsynlighed** | Lav (kun hvis env mangler i prod) |
| **Konsekvens** | Mellem |
| **Risikoniveau (før)** | **Lav–Mellem** |
| **Eksisterende afhjælpning** | HMAC-SHA256 verifikation når secret er sat; `timingSafeEqual` Buffer-sammenligning for Frisbii; idempotency-check på webhook-events; AuditLog på alle webhook-modtagere. |
| **Rest risiko** | Lav (forudsat env sat i prod) — men KRITISK hvis env mangler. |
| **Afhjælpning** | `UDBEDRINGSPLAN.md` — fjern dev-fallback i prod-mode (`NODE_ENV=production`), kræv ikke-tom `WEBHOOK_SECRET` ved startup, erstat manuelt `timingSafeEqual` med `crypto.timingSafeEqual`. |

### R-12 — Persondata ukrypteret i DB

| Attribut | Værdi |
|---|---|
| **Beskrivelse** | Felter som `Contact.email`, `Contact.phone`, `BankConnection.accountNumber`, `BankConnection.iban`, `Company.bankAccount`, `Company.bankRegistration`, personnavne/adresser opbevares ukrypteret i Neon PostgreSQL. Bekræftet i P1-DB / P1-SEC / fakta-ark punkt H. |
| **Trussel** | DB-kompromittering, ondsindet DBA/Neon-ansat, SQL-injection. |
| **Sårbarhed** | Afhængig af Neons disk-encryption (managed) + RBAC. |
| **Aktiv** | A1 (persondata). |
| **Sandsynlighed** | Lav |
| **Konsekvens** | Høj |
| **Risikoniveau (før)** | **Mellem** |
| **Eksisterende afhjælpning** | Neon disk-encryption (managed); `sslmode=require` (TLS in transit); RBAC + `tenantFilter`; AES-256-GCM på følsomme secrets (bank-tokens, TOTP-secrets, backup-koder); ingen CPR-felter. |
| **Rest risiko** | Lav–Mellem |
| **Afhjælpning** | `UDBEDRINGSPLAN.md` — vurder om application-level kryptering af `Contact.email/phone` (som `User.email` er unikt og bruges til lookup, er kryptering komplekst med deterministic-mode). Accepteret for nu — se afsnit 7. |

### R-13 — USA-dataoverførsel (OpenRouter)

| Attribut | Værdi |
|---|---|
| **Beskrivelse** | Én AI-underbehandler er USA-baseret og transmitterer persondata/finansielle data til USA: OpenRouter, Inc. (AlphaFlows eneste AI-underbehandler — håndterer Hermes chat-LLM, knowledge-service RAG-embeddings og scanner-service VLM-ekstraktion via én API-aftale). OpenRouter videresender anmodninger til relevante model-udbydere (f.eks. Anthropic, Meta, OpenAI) per GDPR Art. 28(4) — disse er OpenRouter's underbehandlere, ikke AlphaAi Consult ApS'. |
| **Trussel** | Schrems II-dom (C-311/18) — USA-dataoverførsel uden gyldige SCC+TIA er ulovlig; USA-myndigheders adgang (FISA 702) kan udgøre risiko for EU-borgere. |
| **Sårbarhed** | Bekræftet i P1-INT afsnit 13 + fakta-ark punkt I. |
| **Aktiv** | A1 (persondata), A10 (AI-data). |
| **Sandsynlighed** | Mellem |
| **Konsekvens** | Høj |
| **Risikoniveau (før)** | **Høj** |
| **Eksisterende afhjælpning** | `HermesAgent.dataAccessEnabled` per-tenant opt-in (default `false`) — uden opt-in sendes KUN brugerens spørgsmål + statisk system-prompt, IKKE tenant-specifikke finansielle data; scanner-service tekst-først pipeline (PDF'er med tekstlag håndteres lokalt uden VLM-kald) + confidence-baseret fallback (kun ved OCR-confidence < 60 eller PDF uden tekstlag) + billed-caching (SHA-256 forhindrer gentagne VLM-kald); embedding-modeller gemmer kun matematisk repræsentation, ikke teksten; samtalehistorik rulning (kun sidste 20 beskeder); per-tenant rate-limiter. OpenRouter DPA pålægger upstream-model-udbydere samme beskyttelsesniveau per GDPR Art. 28(4). |
| **Rest risiko** | Mellem — kræver SCC + TIA per GDPR kapitel V (DPA + SCC Modul 2 med OpenRouter). |
| **Afhjælpning** | `UDBEDRINGSPLAN.md` — (1) indgå DPA + Standard Contractual Clauses 2021/914 modul 2 med OpenRouter (konsolideret AI-DPA — dækker chat LLM + embeddings + VLM); (2) udfør Transfer Impact Assessment (se `LEVERANDØERSTYRING.md` §5.1); (3) dokumenter `HermesAgent.dataAccessEnabled` som data-minimization-foranstaltning i `DATABEHANDLERAFTALE.md`; (4) vurder EU-baserede alternativer (Mistral Large/Embed/Pixtral, SiloGen, Aleph Alpha, Azure Document Intelligence) som fallback-modeller. Se `LEVERANDØERSTYRING.md`. |

### R-14 — TokenPay timingSafeEqual manuelt implementeret

| Attribut | Værdi |
|---|---|
| **Beskrivelse** | `src/app/api/tokenpay/callback/route.ts` implementerer konstant-tid string XOR i stedet for Node.js `crypto.timingSafeEqual`. Bekræftet i P1-SEC afsnit 6. |
| **Trussel** | Timing attack på webhook-signatur — angriber kan gætte HMAC byte-for-byte ved at måle responstid. |
| **Sårbarhed** | Manuelt implementeret konstant-tid sammenligning — funktionsmæssigt korrekt, men risiko for subtil side-channel. |
| **Aktiv** | A8 (`TOKENPAY_API_KEY`), A2 (TokenPay access-niveau). |
| **Sandsynlighed** | Lav |
| **Konsekvens** | Lav |
| **Risikoniveau (før)** | **Lav** |
| **Eksisterende afhjælpning** | HMAC-SHA256 verifikation; funktionsmæssigt korrekt string XOR (konstant-tid for samme længde); AuditLog på TokenPay-callbacks; owner-beskyttelse mod revocation. |
| **Rest risiko** | Lav |
| **Afhjælpning** | `UDBEDRINGSPLAN.md` — erstat manuelt string XOR med `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))` (kræver samme længde — pre-check nødvendig). |

### R-15 — Bank-API stubs (ingen reelle kald)

| Attribut | Værdi |
|---|---|
| **Beskrivelse** | `src/lib/bank-providers.ts` definerer `createRealBankProvider()` factory for Tink, Nordea, Danske Bank, Jyske Bank — men alle stubbes (`fetchTransactions` kaster `"requires production configuration"`). Kun Demo-provider returnerer data. Bank-access-tokens krypteres dog alligevel med AES-256-GCM før lagring (fremtidssikring). |
| **Trussel** | Ikke en sikkerhedstrussel — feature-forventning. |
| **Sårbarhed** | Bank-integration reklames som feature men virker kun med Demo-provider i prod. |
| **Aktiv** | A2 (finansielle data — manglende bank-transaktioner). |
| **Sandsynlighed** | Høj (kunder forventer bank-integration) |
| **Konsekvens** | Lav |
| **Risikoniveau (før)** | **Mellem** |
| **Eksisterende afhjælpning** | AES-256-GCM kryptering af tokens (klar når integration aktiveres); manuel bank-afstemning virker; Demo-provider returnerer realistiske test-data. |
| **Rest risiko** | Mellem (accepteret — feature-afhængig). |
| **Afhjælpning** | `UDBEDRINGSPLAN.md` — dokumenter bank-integration som "Demo kun" i `BRUGSVEJLEDNING.md`; fremtid: integrer PSD2-licenserede bank-aggregatorer (Tink, Nordigen). Accepteret for nu — se afsnit 7. |

### R-16 — z-ai-web-dev-sdk sandbox-only (AI-bankafstemning virker ikke i prod)

| Attribut | Værdi |
|---|---|
| **Beskrivelse** | `src/lib/matching-engine.ts` bruger `z-ai-web-dev-sdk` til AI-bankafstemning — men SDK'et er **sandbox-only** og virker ikke i produktion. Funktionen fejler gracefully og returnerer ingen matches. |
| **Trussel** | Ikke en sikkerhedstrussel — feature-forventning/styring. |
| **Sårbarhed** | AI-bankafstemning reklames i kode/UI men virker ikke i prod — kunder kan blive forvirrede. |
| **Aktiv** | A2 (finansielle data — manglende AI-afstemning). |
| **Sandsynlighed** | Høj (kunder forventer det) |
| **Konsekvens** | Lav |
| **Risikoniveau (før)** | **Mellem** |
| **Eksisterende afhjælpning** | Graceful failure (returnerer ingen matches — fallback til manuel matching); manuel matching virker fuldt; Hermes AI-assistent virker (via OpenRouter). |
| **Rest risiko** | Mellem (accepteret — feature-afhængig). |
| **Afhjælpning** | `UDBEDRINGSPLAN.md` — (1) skjul/disable AI-bankafstemning-toggle i prod-UI indtil funktionen er fuldt implementeret; (2) alternativ: integrer OpenRouter direkte til matching-engine. Accepteret for nu — se afsnit 7. |

### R-17 — Backup-scheduler process-intern

| Attribut | Værdi |
|---|---|
| **Beskrivelse** | Backup-scheduler er implementeret som process-intern `node-cron` i alphaflow PM2-appen (`src/lib/backup-scheduler.ts` kaldes fra `src/instrumentation.node.ts`). Hvis appen crasher eller PM2 stopper, stopper alle backups. Bekræftet i P1-SVC-b / P1-INT afsnit 12 + fakta-ark punkt G. |
| **Trussel** | App-crash, hukommelsesudtørring, PM2-fejl, VPS-fejl — backup-scheduler stopper. |
| **Sårbarhed** | Backups kører så længe alphaflow-appen kører; ingen ekstern cron-job / systemd-timer / PM2 cron_jobs / crontab. |
| **Aktiv** | A5 (backup-kontinuitet), A2 (5-års retention). |
| **Sandsynlighed** | Mellem (app kan crash) |
| **Konsekvens** | Mellem |
| **Risikoniveau (før)** | **Mellem** |
| **Eksisterende afhjælpning** | Neon PITR 7 dage (defense-in-depth lag 1, fuld DB-recovery); PM2 `autorestart:true`, `max_restarts:10`, `restart_delay:5000`; `CronExecution` DB-log med startup catch-up (oversete cron-vinduer genkendes og køres); retry 3x exp. backoff (5s/10s/20s); overlap guard via `runningJobs`-Set; per-tenant health monitoring på `/api/backups/scheduler-status`; `ensureInitialBackup()` første-data-triggeret baseline-backup. |
| **Rest risiko** | Lav — Neon PITR dækker 7 dage, AlphaFlow-backup-ZIPs dækker op til 5 år. |
| **Afhjælpning** | `UDBEDRINGSPLAN.md` — vurder om ekstern systemd-timer / PM2 cron_jobs / dedicated backup-cron-script bør tilføjes som backup-of-backup. Accepteret for nu — se afsnit 7. |

### R-18 — SQLite i mini-services ukrypteret på disk

| Attribut | Værdi |
|---|---|
| **Beskrivelse** | `mini-services/scanner-service/data/scanner.db` (scan-job-historik + OCR-resultater) og `mini-services/tokenpay-access-service/data/access.db` (brugere, proofs, access-log, messages) er ukrypteret SQLite-filer på VPS-disk (WAL mode). |
| **Trussel** | VPS-disk-kompromittering — angriber med filsystem-adgang kan læse SQLite direkte. |
| **Sårbarhed** | Bekræftet i P1-SVC-a — mini-services bruger `bun:sqlite` / `aiosqlite` uden application-level kryptering. |
| **Aktiv** | A11 (SQLite mini-DBs). |
| **Sandsynlighed** | Lav |
| **Konsekvens** | Mellem |
| **Risikoniveau (før)** | **Lav–Mellem** |
| **Eksisterende afhjælpning** | IONOS VPS-disk-encryption (managed); WAL mode; mini-services kører bag Caddy reverse proxy; inter-service API-key auth (`X-Access-Service-Key`); `API_SHARED_KEY` påkrævet; `PROOF_ENCRYPTION_KEY` for `.tbkey` proofs (fil-indhold er krypteret selvom database-references ikke er). |
| **Rest risiko** | Lav |
| **Afhjælpning** | `UDBEDRINGSPLAN.md` — vurder om SQLCipher eller application-level kryptering af følsomme kolonner (proof-id, access-log) bør tilføjes. Accepteret for nu — VPS-disk-encryption anses som tilstrækkelig. |

### R-19 — notification-ws /broadcast ingen auth

| Attribut | Værdi |
|---|---|
| **Beskrivelse** | `mini-services/notification-ws-service/index.ts` eksponerer `POST /broadcast` uden auth — forventes kun kaldt fra localhost af Next.js API'er. Socket.IO handshake kræver `handshake.auth.userId` (påkrævet — ellers disconnect). |
| **Trussel** | Misbrug af broadcast-endpoint — angriber sender falske `DATA_CHANGED`-events for at invalidere cacher eller forårsage unødvendige re-renders. |
| **Sårbarhed** | Bekræftet i P1-SVC-a. |
| **Aktiv** | A1 (real-time notifikationer, bruger-cache). |
| **Sandsynlighed** | Lav |
| **Konsekvens** | Lav |
| **Risikoniveau (før)** | **Lav** |
| **Eksisterende afhjælpning** | Caddy reverse proxy — `/?XTransformPort=3001` ruter til `localhost:3001`; forventes kun localhost-kald; Socket.IO handshake-auth på user-socket-forbindelser; `/broadcast` kan ikke bruges til at udløse mutationer (kun cache-invalidering). |
| **Rest risiko** | Lav |
| **Afhjælpning** | `UDBEDRINGSPLAN.md` — tilføj `HERMES_ADMIN_KEY` eller dedikeret `NOTIFICATION_API_KEY` header-validering på `/broadcast`. Accepteret for nu — se afsnit 7. |

### R-20 — Hermes Socket.IO join-event ingen handshake-auth

| Attribut | Værdi |
|---|---|
| **Beskrivelse** | Hermes-agent (`mini-services/hermes-agent/index.ts`, port 3004) — Socket.IO `join`-event bærer `tenantId/userId/userName` i message-body uden handshake-auth verifikation. HTTP `/admin/*`-endpoints kræver `Bearer HERMES_ADMIN_KEY`. |
| **Trussel** | Uautoriseret socket-forbindelse — angriber der kender (eller gætter) et tenantId kan forbinde og sende chat-beskeder som en anden bruger. |
| **Sårbarhed** | Bekræftet i P1-SVC-a. |
| **Aktiv** | A10 (Hermes chat-data), A1 (persondata hvis `dataAccessEnabled=true`). |
| **Sandsynlighed** | Mellem |
| **Konsekvens** | Mellem |
| **Risikoniveau (før)** | **Mellem** |
| **Eksisterende afhjælpning** | Socket.IO forbindelse bag Caddy reverse proxy (`/?XTransformPort=3004`); tenant-data hentes via `DatabaseTenantProvider` fra Neon (kun hvis `HermesAgent.dataAccessEnabled=true`); `/admin/stats` kræver Bearer auth; per-tenant rate-limiter; samtalehistorik in-memory + DB-persistens. |
| **Rest risiko** | Mellem — uden handshake-auth kan angriber potentielt udgive sig for en anden bruger i chat-samtalen. |
| **Afhjælpning** | `UDBEDRINGSPLAN.md` — tilføj Socket.IO `handshake.auth.token` med session-token-validering mod Neon `Session`-tabel; alternativt kort-levende JWT udstedt af Next.js-login. |

### R-21 — AI non-determinisme og hallucinationer (Hermes / VLM)

| Attribut | Værdi |
|---|---|
| **Beskrivelse** | AlphaFlows AI-funktioner (Hermes chat-LLM, knowledge-RAG embeddings, scanner VLM) er baseret på sprogmodeller via OpenRouter. AI-output er **ikke deterministisk** — det samme spørgsmål kan give forskellige svar, og svar kan indeholde fejl, unøjagtigheder eller "hallucinationer" (plausible men forkerte oplysninger, f.eks. forkerte momssatser, opdigtede SKAT-vejledninger, forkerte kontoforslag). |
| **Trussel** | Bruger følger AI-genereret rådgivning (momsberegnings-svar, konteringsforslag, skattespørgsmål) uden uafhængig verificering og begår bogføringsfejl, momsupgørelsesfejl eller skattefejl der medfører økonomisk tab eller SKAT-tilgodehavende. |
| **Sårbarhed** | Brugere kan tillid til AI-svar uden at efterprøve mod gældende lovgivning. Sprogmodeller har iboende tendens til at producere selvsikre men forkerte svar. |
| **Aktiv** | A1 (brugeres bogføringsbeslutninger), A2 (finansielle data korrektethed), A12 (AuditLog hvis AI-output leder til forkerte posteringer). |
| **Sandsynlighed** | Høj |
| **Konsekvens** | Mellem |
| **Risikoniveau (før)** | **Høj** |
| **Eksisterende afhjælpning** | (1) Tre advarsler præsenteret for tenant-administrator før Hermes-aktivering (Bilag 4 BRUGSVEJLEDNING.md §13.0): GDPR-risici, non-determinisme, ikke-menneskelig-rådgivning. (2) Samtykke-logning i AuditLog (`action: AI_CONSENT_ACCEPTED`). (3) Kompakt fodnote på hver Hermes-besked der minder om non-determinisme og USA-overførsel. (4) System-prompt begrænser Hermes til dansk bogføring/moms/skat. (5) VLM-output (scanner) markeres "Kræver gennemsyn" ved lav konfidens; brugeren confirmerer altid før bogføring. (6) AI-output overstyrer aldrig automatisk bogførte posteringer. (7) `HermesAgent.dataAccessEnabled` per-tenant opt-in (default false) for data-adgang. |
| **Rest risiko** | Lav–Mellem — advarsler og samtykke reducerer sandsynlighed for ukritisk brug, men kan ikke eliminere risikoen for at brugere følger forkert AI-rådgivning. |
| **Afhjælpning** | Accepteret med kompenserende foranstaltninger (ovenfor). Fremtidige forbedringer: (a) "confidence-score" på Hermes-svar, (b) automatisk krydstjek af momssatser mod statisk lookup, (c) link til officiel SKAT-vejledning i hvert svar. |

---

## 6. Risikomatrix

Matrix viser risikoniveau = Sandsynlighed × Konsekvens. Risici markeret med deres ID.

```
                 ┌─────────────────────────────┬─────────────────────────────┬─────────────────────────────┐
                 │  Sandsynlighed: LAV          │  Sandsynlighed: MELLEM       │  Sandsynlighed: HØJ          │
                 │  (< 1 gang / 5 år)           │  (1 gang / 1-5 år)           │  (månedlig/årlig)            │
                 ├─────────────────────────────┼─────────────────────────────┼─────────────────────────────┤
 Kritisk (K)     │  MELLEM                     │  HØJ                        │  KRITISK                    │
                 │  R-03                       │                             │                             │
                 ├─────────────────────────────┼─────────────────────────────┼─────────────────────────────┤
 Høj (H)         │  MELLEM                     │  HØJ                        │  HØJ                        │
                 │  R-04, R-08, R-12           │  R-01, R-02, R-13           │                             │
                 ├─────────────────────────────┼─────────────────────────────┼─────────────────────────────┤
 Mellem (M)      │  LAV                        │  MELLEM                     │  HØJ                        │
                 │  R-09, R-14, R-18, R-19     │  R-05, R-06, R-07, R-11,    │                             │
                 │                             │  R-15, R-16, R-17, R-20     │                             │
                 ├─────────────────────────────┼─────────────────────────────┼─────────────────────────────┤
 Lav (L)         │  LAV                        │  LAV                        │  MELLEM                     │
                 │                             │                             │  R-10                       │
                 └─────────────────────────────┴─────────────────────────────┴─────────────────────────────┘
```

### Risikoniveau-fordeling (før afhjælpning)

| Risikoniveau | Antal risici | Risici |
|---|---|---|
| **Kritisk** | 0 | — |
| **Høj** | 5 | R-01, R-02, R-03, R-13, R-21 |
| **Mellem** | 11 | R-04, R-05, R-06, R-07, R-08, R-10, R-11, R-12, R-15, R-16, R-17, R-20 |
| **Lav** | 5 | R-09, R-14, R-18, R-19 |

> Bemærk: R-10 klassificeres som Mellem på grund af høj sandsynlighed for kommerciel afvisning (selvom konsekvensen er lav). R-21 (AI non-determinisme) klassificeres som Høj før afhjælpning pga. høj sandsynlighed; rest risiko reduceres til Lav-Mellem via advarsler + samtykke.

### Restrisiko-fordeling (efter eksisterende afhjælpning)

| Restrisiko | Antal risici | Risici |
|---|---|---|
| **Høj** | 1 | R-03 (key rotation — ingen implementeret afhjælpning) |
| **Mellem** | 11 | R-01, R-02, R-07, R-10, R-12, R-13, R-15, R-16, R-17, R-20, R-21 (Lav-Mellem, optaget her) |
| **Lav** | 9 | R-04, R-05, R-06, R-08, R-09, R-11, R-14, R-18, R-19 |
| **Accepteret** | 9 | R-04, R-09, R-10, R-15, R-16, R-17 (midlertidigt), R-18, R-19, R-21 (med kompenserende foranstaltninger) |

---

## 7. Accepterede risici

Følgende risici er **accepteret** af AlphaAi Consult ApS med begrundelse — eksisterende afhjælpninger vurderes som tilstrækkelige, eller risikoen afhænger af eksterne faktorer uden for AlphaFlows kontrol.

| Risiko ID | Accept-begrundelse |
|---|---|
| **R-04** (Ingen hash-chain) | 3-niveau immutability (app + DB-triggers + cascade-Restrict) vurderes som tilstrækkelig til BEK 97 Bilag 1 (uforanderlighed) — Lov om bogføring §13. Hash-chain er ikke eksplicit påkrævet af Erhvervsstyrelsen. Periodisk verifikation mod backup-ZIPs er en mulig fremtidig forstærkning. |
| **R-09** (Ingen CSRF-token) | SameSite=Lax + HttpOnly + Secure cookies + Next.js indbygget CSRF-beskyttelse for POST vurderes som tilstrækkelig for same-origin SPA-arkitektur. |
| **R-10** (Ingen OAuth/SSO) | Email+password+TOTP er standard for SMB-markedet. SSO kan tilføjes ved enterprise-kunde-efterspørgsel. Accepteret kommercielt. |
| **R-15** (Bank-API stubs) | Bank-integration er dokumenteret som "Demo kun" — kunder informeres. AES-256-GCM-kryptering er allerede implementeret fremtidssikret for når integration aktiveres. |
| **R-16** (z-ai-web-dev-sdk sandbox-only) | AI-bankafstemning deaktiveres/skjules i prod-UI (fremtidig afhjælpning i UDBEDRINGSPLAN). Manuel matching fungerer fuldt. |
| **R-17** (Backup-scheduler process-intern) | Neon PITR 7d + AlphaFlow-backup-ZIPs (5 år retention) + CronExecution startup catch-up + PM2 autorestart vurderes som tilstrækkelig defense-in-depth. Ekstern systemd-timer er fremtidig forstærkning. |
| **R-18** (SQLite ukrypteret) | VPS-disk-encryption (IONOS managed) + inter-service API-key auth vurderes som tilstrækkelig. `.tbkey` proof-fil-indhold er krypteret uafhængigt. |
| **R-19** (notification-ws /broadcast ingen auth) | Caddy reverse proxy begrænser til localhost. `/broadcast` kan kun invalidere cacher — ingen mutationer. |
| **R-21** (AI non-determinisme og hallucinationer) | AI-output er iboende non-deterministisk. Accepteret med kompenserende foranstaltninger: (a) tre advarsler præsenteret for tenant-administrator før Hermes-aktivering (GDPR-risici, non-determinisme, ikke-menneskelig-rådgivning), (b) AuditLog-samtykke, (c) fodnote på hver Hermes-besked, (d) VLM-output markeres "Kræver gennemsyn", (e) AI overstyrer aldrig automatisk bogførte posteringer — brugeren confirmerer altid. Se Bilag 4 (BRUGSVEJLEDNING.md) §13.0 for fulde advarselstekster. |

---

## 8. Konklusion & anbefalinger

### 8.1 Samlet risikoniveau

AlphaFlow-platformens samlede risikoniveau vurderes som **Mellem** efter eksisterende afhjælpninger. Ingen risici er klassificeret som **Kritisk** efter afhjælpning, men én risiko (**R-03 — Ingen key rotation**) forbliver på **Høj**-niveau da ingen teknisk afhjælpning er implementeret (kun manuel procedure).

Den gennemsnitlige restrisiko er acceptabel for en SMB-bogføringsplatform, men følgende fire risici bør prioriteres til afhjælpning inden for de næste 6 måneder:

### 8.2 Prioriteret afhjælpningsplan

| Prioritet | Risiko ID | Estimeret indsats | Henvisning |
|---|---|---|---|
| **P1 — Kritisk** | R-03 (key rotation) | 5-10 dage (schema-migration + re-encryption-script + procedure-dokumentation) | `RISIKOVURDERING.md` §6-7 (restrisiko Høj) |
| **P1 — Kritisk** | R-13 (USA-dataoverførsel) | 2-5 dage (DPA+SCC+TIA for OpenRouter — konsolideret AI-DPA) — juridisk arbejde | `RISIKOVURDERING.md` §6-7 (restrisiko Mellem), `DATABEHANDLERAFTALE.md`, `LEVERANDØERSTYRING.md` |
| **P2 — Høj** | R-01 (CSP-header) | 1-2 dage (report-only først, derefter enforce) | `RISIKOVURDERING.md` §6-7 (restrisiko Mellem) |
| **P2 — Høj** | R-02 (antivirus-scanning) | 2-3 dage (ClamAV-daemon + integration) | `RISIKOVURDERING.md` §6-7 (restrisiko Mellem) |
| **P2 — Høj** | R-20 (Hermes handshake-auth) | 1-2 dage (Socket.IO handshake.auth.token + session-validering) | `RISIKOVURDERING.md` §6-7 (restrisiko Mellem) |
| **P3 — Mellem** | R-05 (account-lockout) | 1 dag | `RISIKOVURDERING.md` §6-7 (restrisiko Lav) |
| **P3 — Mellem** | R-06 (password min. længde) | 0,5 dag (inkl. UI-opdatering) | `RISIKOVURDERING.md` §6-7 (restrisiko Lav) |
| **P3 — Mellem** | R-07 (Caddy rate_limit) | 0,5 dag (plugin-installation + aktivér udkommenteret blok) | `RISIKOVURDERING.md` §6-7 (restrisiko Mellem) |
| **P3 — Mellem** | R-08 (Next.js middleware) | 1-2 dage (inkl. test af alle routes) | `RISIKOVURDERING.md` §6-7 (restrisiko Lav) |
| **P3 — Mellem** | R-11 (webhook dev-fallback) | 0,5 dag | `RISIKOVURDERING.md` §6-7 (restrisiko Lav) |
| **P3 — Mellem** | R-14 (TokenPay timingSafeEqual) | 0,5 dag | `RISIKOVURDERING.md` §6-7 (restrisiko Lav) |
| **P4 — Lav** | R-12 (persondata kryptering) | 3-5 dage (komplekst pga. unikke felter) | `RISIKOVURDERING.md` §6-7 (restrisiko Mellem) |

> **Bemærkning om krydsreferencer:** Bilag 10 (`UDBEDRINGSPLAN.md` v3.0, 2026) er den tidssvarende udbedringsplan der dækker **alle 20 risici** (R-01…R-20) fra denne risikovurdering samt de 5 oprindelige compliance-mangler fra 2025. Hver risiko er klassificeret i Kategori A (skal udbedres før indsendelse), Kategori B (indsendes med åbenhed, udbedres efter tidsplan) eller Kategori C (accepteret). Reststatus for hver risiko fremgår af §6 (restrisiko-fordeling) og §7 (accepterede risici) heri; konkret handlingsplan, ansvarlig, tidsramme og acceptkriterier fremgår af Bilag 10 §3-5.

### 8.3 Overvågning og løbende opgaver

- **Årlig review** af dette dokument (næste: juli 2027 eller ved væsentlig arkitekturændring).
- **Kvartalsvis** gennemgang af nye underbehandlere og integrationer.
- **Løbende** overvågning af `AuditLog`-tabel for anomali-detektion (LOGIN_FAILED, DELETE_ATTEMPT, OVERSIGHT).
- **Løbende** overvågning af backup-scheduler-health via `/api/backups/scheduler-status`.
- **Løbende** overvågning af PM2-status via `pm2 status` + `pm2 logs`.
- **Ved sikkerhedshændelse** — følg `BEREDSKABSPLAN.md` afsnit 6 (Incident response-procedure).

### 8.4 Underskrift

| Rolle | Navn | Dato | Underskrift |
|---|---|---|---|
| Dataansvarlig (AlphaAi Consult ApS) | _[Udfyldes]_ | _[Udfyldes]_ | _[Udfyldes]_ |
| DPO / Compliance-ansvarlig | _[Udfyldes]_ | _[Udfyldes]_ | _[Udfyldes]_ |
| Teknisk ansvarlig | _[Udfyldes]_ | _[Udfyldes]_ | _[Udfyldes]_ |

---

## Bilag A — Referencer

- **Worklog sektioner:** P1-DB (database-modeller), P1-SEC (sikkerhed & krypto, inkl. "Mangler / risici"-liste på 12 punkter + "Bekræftede sikkerhedsfeatures"), P1-INT (integrationer & infrastruktur, inkl. underbehandler-liste), P1-SVC-a (mini-services), P1-SVC-b (scripts, PM2, Caddy, cron/backup), KONSOLIDERET FAKTA-ARK.
- **Lovgrundlag:** GDPR (EU 2016/679) Art. 32, 33, 34, 35; Lov om bogføring (LOV nr. 700 af 24. maj 2022) §4, §13, §15; Kravbekendtgørelsen (BEK nr. 97 af 26. januar 2023) §8 stk. 4 (hovedkrav N2, N3, N4, N5, D1, D15), §3 (5-års opbevaring), §7 (backup) og Bilag 1 (uforanderlighed); Anmeldelsesbekendtgørelsen (BEK nr. 98 af 26. januar 2023).
- **Standarder:** ISO/IEC 27001:2022, ISO/IEC 27005:2022, NIST SP 800-63B (Digital Identity Guidelines).
- **Relaterede dokumenter:** `BEREDSKABSPLAN.md`, `UDBEDRINGSPLAN.md`, `ENCRYPTION.md`, `LEVERANDØERSTYRING.md`, `DATABEHANDLERAFTALE.md`, `NEON & IONOS_IT_SIKKERHED.md`, `COMPLIANCE_RAPPORT.md`.

## Bilag B — Dokumenthistorik

| Version | Dato | Ændring | Ansvarlig |
|---|---|---|---|
| 1.0 | 2025-07-01 | Første version (generisk IT-risikovurdering). | AlphaAi Consult ApS |
| 2.0 | 2025-07-01 | Tilføjede N2-N5/D1/D15 mapping, aktivoversigt. | AlphaAi Consult ApS |
| **3.0** | **2026** | **Fuld omskrivning til DPIA (GDPR Art. 35). 20 risici (R-01..R-20) baseret på P1-SEC mangelliste + P1-INT/P1-SVC-b fakta. Risikomatrix + accept-begrundelser + prioriteret afhjælpningsplan.** | **AlphaAi Consult ApS — Doc-updater D5** |
| **3.1** | **2026** | **AI-konsolidering (C2):** R-13 opdateret — 3 USA-AI-underbehandlere (OpenAI, OpenRouter, Anthropic) konsolideret til 1 (OpenRouter, Inc., som videresender til model-udbydere per GDPR Art. 28(4)). §1.2 scope: 15→13 integrationer. §2 kontekst: "Anthropic VLM" → "VLM via OpenRouter". §2.4 integrationstabel: 3 USA-rækker → 1. §3.1 trusselsaktører: OpenAI/Anthropic fjernet. §4.1 A9: `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` fjernet (de er OpenRouter-konfiguration). §4.2 sårbarhed 13 opdateret. §8.2 P1 R-13 afhjælpningsplan opdateret (DPA+SCC+TIA for OpenRouter, konsolideret). Restrisiko for R-13 bevaret som Mellem (DPA+SCC+TIA stadig påkrævet). Bilag A: ingen OpenAI/Anthropic-specifikke referencer at fjerne. | **AlphaAi Consult ApS — AI-konsolidering C2** |
