# AlphaFlow — Krypteringsrapport

**Dokumenttype:** Teknisk krypteringsrapport (data-at-rest, data-in-transit, key management)
**Version:** 2.2
**Dato:** 2026
**Gyldighedsområde:** AlphaFlow produktionsmiljø (`alphaflow.dk`)
**Compliance-mål:** Erhvervsstyrelsen — Lov om bogføring (LOV nr. 700 af 24. maj 2022), Anmeldelsesbekendtgørelsen (BEK nr. 98 af 26. januar 2023) og Kravbekendtgørelsen (BEK nr. 97 af 26. januar 2023)
**Dataansvarlig:** AlphaAi Consult ApS (App Owner)

---

## Indholdsfortegnelse

1. [Indledning](#1-indledning)
2. [Krypteringsnøgler (key management)](#2-krypteringsnøgler-key-management)
3. [Algoritmer & formater](#3-algoritmer--formater)
4. [Data-in-transit (transport)](#4-data-in-transit-transport)
5. [Data-at-rest — krypteret i databasen](#5-data-at-rest--krypteret-i-databasen)
6. [Data-at-rest — filer på VPS](#6-data-at-rest--filer-på-vps)
7. [Applikationsniveau-kryptering i praksis](#7-applikationsniveau-kryptering-i-praksis)
8. [Sikkerhedsarkitektur — bemærkninger](#8-sikkerhedsarkitektur--bemaerkninger)

---

## 1. Indledning

Dette dokument beskriver AlphaFlows faktiske krypteringsimplementering som den findes i kodebasen pr. 2026. Formålet er at give Erhvervsstyrelsen en præcis oversigt over:

- Hvilke data der er **krypteret** i databasen (AES-256-GCM).
- Hvilke data der er **ukrypteret** i databasen, og hvilke kompenserende foranstaltninger der beskytter dem.
- Hvilke filer der er krypteret på VPS-disk.
- Hvordan data er beskyttet under transit (TLS, SMTP-STARTTLS, sslmode=require).
- Hvordan krypteringsnøgler administreres.

**Ansvarlig:** AlphaAi Consult ApS (CVR-oplysninger for AlphaAi Consult ApS (CVR 46312058, Skelagervej 124C, 8200 Aarhus N) fremgår af Bilag 4 (BRUGSVEJLEDNING.md) afsnit 18.2 og Bilag 1 (ANMELDELSESPAKKE.md) afsnit 2).
**Scope:** AlphaFlow-applikationen (Next.js 16, port 3000) + 5 mini-services (hermes-agent :3004, knowledge-service :3006, tokenpay-access :3100, notification-ws :3001, scanner-service :3005) + Caddy reverse proxy + IONOS VPS-hosting + Neon PostgreSQL.

---

## 2. Krypteringsnøgler (key management)

AlphaFlow opererer med **to separate statiske symmetriske nøgler**, begge AES-256-GCM 32-byte (256-bit), repræsenteret som 64-tegns hex-strenge.

### 2.1 `ENCRYPTION_KEY`

| Egenskab | Værdi |
|---|---|
| Format | 64-char hex (`[0-9a-f]{64}`) |
| Længde | 32 byte / 256 bit |
| Algoritme | AES-256-GCM |
| Bruges til | Bank-tokens, TOTP-secrets, 2FA-backup-koder, backup-ZIP-filer |
| Påkrævet i produktion | **JA — kritisk.** Service kaster ved opstart hvis manglende/ugyldig (`src/lib/crypto.ts:48-71`). |
| Opbevaring | KUN environment variable — aldrig i DB eller kode |

Generering:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# eller:
openssl rand -hex 32
```

### 2.2 `PROOF_ENCRYPTION_KEY`

| Egenskab | Værdi |
|---|---|
| Format | 64-char hex (`[0-9a-fA-F]{64}`) |
| Længde | 32 byte / 256 bit |
| Algoritme | AES-256-GCM |
| Bruges til | Dekryptering af `.tbkey` proof-filer uploadet af brugere (krypteret eksternt af TokenBay-ZIPProof) |
| Påkrævet i produktion | **JA.** TokenPay-service starter ikke uden (`mini-services/tokenpay-access-service/src/tbkey-decryption.ts:31-57`). |
| Opbevaring | KUN environment variable — aldrig i DB eller kode |
| Skal matche | `PROOF_ENCRYPTION_KEY` i TokenBay-ZIPProof (ekstern komponent) |

### 2.3 Opbevaring & adgang

- Nøgler opbevares **KUN** som environment variables:
  - I udvikling: `.env` / `.env.local` (rotet uden for git via `.gitignore`).
  - I produktion: `ecosystem.config.js` `env:`-blokke for hver PM2-app, eller OS-brugerens environment ved manuel start.
- **PM2 læser IKKE automatisk `.env`** — hver mini-service (`tokenpay-access`, `hermes-agent`, `knowledge-service`, `scanner-service`) har sin egen `env:`-blok i `ecosystem.config.js`, hvor nøgler skal udfyldes eksplicit. Se `TOKENBAY-ACCESS-ENV-GUIDE.md` for detaljer.
- Aldrig hårdkodet i kode, aldrig i databasen, aldrig logget.
- Validering ved opstart: `getEncryptionKey()` kaster hvis manglende eller forkert længde.
- Caching: nøglen parses én gang per proces og caches (`cachedKey`).

### 2.4 Key rotation (U-1 — implementeret)

AlphaFlow har nu et fuldt implementeret key rotation/versioning system. Se UDBEDRINGSPLAN U-1 for den fulde beskrivelse.

**Keyring-struktur:**

| Env var | Formål |
|---|---|
| `ENCRYPTION_KEY` | AKTUEL nøgle — bruges til alle nye krypteringer. |
| `ENCRYPTION_KEY_PREVIOUS` | FORRIGE nøgle(r) — komma-separeret. Kræves kun under rotation. |
| `CURRENT_KEY_VERSION` | Versionsnummer (default: 1). Forøges ved hver rotation. |

**Ciphertext-format (DB strings):**
```
v{N}:iv_base64:authTag_base64:ciphertext_base64
```
- `v{N}:` er version-prefix — selvbeskrivende data.
- Uden prefix = version 1 (backward compatible med pre-rotation data).

**Backup filer:**
- Filformat er uændret: `[12B IV][16B authTag][N ciphertext]`
- Version spores via `Backup.encryptionKeyVersion` kolonne i DB.
- `decryptFile()` accepterer `keyVersion` parameter.

**DB kolonner:**
- `User.encryptionKeyVersion Int @default(1)` — for `twoFactorSecret` + `twoFactorBackupCodes`
- `BankConnection.encryptionKeyVersion Int @default(1)` — for `accessToken` + `refreshToken`
- `Backup.encryptionKeyVersion Int @default(1)` — for backup ZIP filer

**Moduler:**
- `src/lib/keyring.ts` — Key management, version lookup, cache, diagnostik
- `src/lib/crypto.ts` — Encrypt/decrypt med auto version-detection

**Scripts:**
- `scripts/rotate-encryption-keys.ts` — Migrerer data fra gammel til ny nøgle (dry-run → execute)
- `scripts/rollback-encryption-keys.ts` — Reverserer en rotation

---

## 3. Algoritmer & formater

### 3.1 AES-256-GCM (authenticated encryption)

**Implementering:** `src/lib/crypto.ts`, Node.js `crypto`-modul (`createCipheriv` / `createDecipheriv`).

| Parameter | Værdi | Bemærkning |
|---|---|---|
| Algoritme | `aes-256-gcm` | Authenticated encryption — både fortrolighed og integritet |
| IV (nonce) | 12 byte / 96 bit | NIST SP 800-38D anbefaling; unik pr. encryption via `crypto.randomBytes(12)` |
| Auth tag | 16 byte / 128 bit | Standard GCM tag-længde |
| Nøgle | 32 byte / 256 bit | Fra `ENCRYPTION_KEY` |
| IV-genbrug | Aldrig | Hver encryption genererer ny IV |

Sikkerhedsegenskaber:
- GCM leverer både **fortrolighed** (ciphertext) og **integritet** (auth tag).
- Manipuleret ciphertext afvises ved dekryptering.
- IV-generering via `crypto.randomBytes()` — kryptografisk sikker PRNG.

### 3.2 Streng-format (DB-felter)

For data lagret i PostgreSQL-string-kolonner (`BankConnection.accessToken`, `User.twoFactorSecret`, `User.twoFactorBackupCodes`):

```
iv_base64 : authTag_base64 : ciphertext_base64
```

Eksempel: `dGhpcyBpcyAxMg==:aWV3OW1WY1R6R0c=:eW91cl9lbmNyeXB0ZWRfZGF0YQ==`

Format-detektion: `isEncrypted(value)` tjekker om værdien har præcis 3 kolon-separerede base64-strenge. Bruges til at skelne AES-256-GCM-værdier fra legacy base64-tokens.

### 3.3 Fil-format (backup-ZIP-filer)

For backup-ZIP-filer på disk (`.zip.enc`):

```
[12 byte IV] [16 byte authTag] [N byte ciphertext]   (rå binary)
```

IV og auth tag er præpended som rå bytes (ikke base64) for effektiv streaming under dekryptering. Original ukrypteret ZIP slettes sikker med `fs.rmSync(inputPath, { force: true })` efter encryption (`src/lib/crypto.ts:268`). Se `src/lib/backup-engine.ts:484`.

### 3.4 `.tbkey` proof-format

For TokenBay-ZIPProof-filer (`.tbkey`):

```
[1 byte version 0x01] [12 byte IV] [16 byte authTag] [N byte ciphertext]
```

Version-byte muliggør fremtidige format-ændringer. Implementeret i `mini-services/tokenpay-access-service/src/tbkey-decryption.ts`.

### 3.5 Password-hashing

| Egenskab | Værdi |
|---|---|
| Algoritme | bcrypt (via `bcryptjs`) |
| Salt rounds | 12 |
| Lagring | `User.password` (hash-streng) |
| Legacy-kompatibilitet | `simpleHash()` (bit-shift hash) genkendes via `needsRehash()` og re-hashes automatisk ved succesfuldt login |

Password min. længde: **6 tegn**.

### 3.6 TOTP (RFC 6238)

| Egenskab | Værdi |
|---|---|
| Algoritme | TOTP RFC 6238 via `otplib` |
| Underliggende hash | SHA-1 (standard for authenticator-apps) |
| Tidssteg | 30 sekunder |
| Kodestørrelse | 6 cifre |
| Tolerance | ±1 step (30s) for clock-drift |
| Secret | 160 bit (20 byte) base32-kodet |
| DB-lagring | `User.twoFactorSecret` — **AES-256-GCM krypteret** |
| QR-kode | `otpauth://`-URI genereret via `qrcode`-biblioteket |

### 3.7 Backup-koder (2FA)

| Egenskab | Værdi |
|---|---|
| Antal | 10 pr. bruger |
| Længde | 8 tegn |
| Tegnsæt | `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (ingen tvetydige tegn som 0/O, I/1/L) |
| Hashing | SHA-256 + fast applikationssalt: `alphaflow-2fa-backup:${code}` |
| DB-lagring | Hashed koder samles i JSON-array og **AES-256-GCM-krypteres** som ét felt (`User.twoFactorBackupCodes`) |

### 3.8 Webhook-signaturer (HMAC-SHA256)

AlphaFlow verificerer HMAC-SHA256-signaturer på indgående webhooks fra fire integrationer:

| Integration | Header | Implementering |
|---|---|---|
| Storecove | `X-Storecove-Signature` | `src/lib/storecove-client.ts:546-560` — `createHmac('sha256')` + `timingSafeEqual` |
| Frisbii (Flatpay) | `Reepay-Signature` | `src/lib/flatpay-client.ts:303-320` — `createHmac('sha256')` + `timingSafeEqual` |
| TokenPay | `x-tokenpay-signature` | HMAC-SHA256 + `crypto.timingSafeEqual`. ✅ Udbedret (U-6/U-14). |
| Flatpay webhook | `frisbii-signature` | `src/lib/flatpay-client.ts` — `createHmac('sha256')` + `timingSafeEqual` (Buffer) |

**Dev-fallback:** ✅ Udbedret (U-6/U-14). Tidligere accepteredes alle webhooks hvis `STORECOVE_WEBHOOK_SECRET` eller `FLATPAY_WEBHOOK_SECRET` manglede. Dette er nu rettet — manglende secrets afvises i produktion. TokenPay bruger nu `crypto.timingSafeEqual` i stedet for string XOR.

### 3.9 Bilag-immutability & checksums

- **SHA-256 checksum på backup-ZIP-filer:** `Backup.sha256`-feltet gemmer SHA-256 af den ukrypterede ZIP. Verificeres ved restore via streaming `crypto.createHash('sha256')` i `src/lib/backup-engine.ts:117, 607-609, 1477-1479`.
- **Bilag-immutability (BEK 97 Bilag 1 / Lov om bogføring §13):** Immutability af posteringer håndhæves via AuditLog 3-niveau:
  1. AuditLog (kun CREATE-funktioner eksponeres i `src/lib/audit.ts`)
  2. PostgreSQL BEFORE UPDATE/DELETE triggere på AuditLog (`prisma/audit-immutability.sql`)
  3. `onDelete: Restrict` cascade på AuditLog FKs
  4. Konto-deaktivering i stedet for sletning (`User.deactivatedAt`)

---

## 4. Data-in-transit (transport)

### 4.1 TLS (HTTPS)

| Komponent | Værdi | Kilde |
|---|---|---|
| Reverse proxy | Caddy (self-hosted på IONOS VPS) | `Caddyfile` |
| TLS-version | **TLS 1.2 / 1.3** (kun disse tilladt) | `Caddyfile:103-105` — `protocols tls1.2 tls1.3` |
| Certifikater | Let's Encrypt (auto-fornyelse af Caddy) | Caddy managed |
| HSTS | `max-age=31536000; includeSubDomains; preload` | `Caddyfile:110` |
| Minimum cipher | Caddy default (modern) | Caddy managed |

### 4.2 Database-forbindelse

- **Connection string:** `DATABASE_URL` (Neon PostgreSQL serverless).
- **SSL-mode:** `?sslmode=require` — påkrævet, afviser ikke-SSL-forbindelser.
- **Host:** Neon (EU: Frankfurt + Amsterdam regions) — ingen data ud af EU.
- **Retry-logik:** `neonConnectionRetry`-query-extension i `src/lib/db.ts` op til 3 forsøg ved transiente fejl (P1001/P1002/P1008/P1017, ECONNRESET/EPIPE/ETIMEDOUT).

### 4.3 SMTP (e-mail)

- **Transport:** `nodemailer` (`src/lib/email-service.ts:76-90`).
- **Port 587** (default): STARTTLS opgradering — `secure: false`.
- **Port 465**: Implicit SSL/TLS — `secure: true`.
- Valg sker automatisk ud fra `SMTP_PORT`-env-var.
- Dev-mode fallback: `jsonTransport` hvis `SMTP_HOST` ikke er sat — ingen rigtige mails sendes.

### 4.4 Inter-service kommunikation

- **Host app ↔ mini-services:** HTTP over `localhost` (samme VPS) — ikke TLS (intern loopback).
  - `/api/ocr/pdf` → scanner-service :3005 (header `X-Api-Shared-Key` = `SCANNER_API_KEY`)
  - `/api/tokenpay/*` → tokenpay-access :3100 (header `X-Access-Service-Key` = `TOKENPAY_API_KEY`)
  - `/api/hermes/*` → hermes-agent :3004 (Bearer `HERMES_ADMIN_KEY`)
  - `/api/knowledge/*` → knowledge-service :3006 (Bearer `HERMES_ADMIN_KEY`)
- **Real-time WebSocket:** Socket.IO via Caddy reverse proxy med `?XTransformPort=<port>`-routing — TLS-termineret af Caddy.
- **Eksterne API-kald:** alle over HTTPS (SKAT, Storecove, Frisbii, CVR, OpenRouter). AI-kald (chat-LLM, embeddings, VLM) er konsolideret via OpenRouter — se Bilag 17 (konsolideret AI-DPA).

### 4.5 Browser-side

- **Cookie-sikkerhed:** `session`-cookie er `httpOnly: true`, `secure: isHttps` (auto-detected via `x-forwarded-proto`), `sameSite: 'lax'`, `path: /`, `maxAge: 7 dage` (sliding).
- **Bearer-token:** alternativ auth via `Authorization: Bearer <token>`-header til API-kald.

---

## 5. Data-at-rest — krypteret i databasen

Nedenfor er en oversigt over hvilke data der er **AES-256-GCM krypteret** og hvilke der er **ukrypteret** i PostgreSQL-databasen (Neon).

### 5.1 AES-256-GCM krypteret i DB

| Model | Felt | Beskyttelse |
|---|---|---|
| `BankConnection` | `accessToken` | AES-256-GCM (`ENCRYPTION_KEY`) — bankens OAuth access-token |
| `BankConnection` | `refreshToken` | AES-256-GCM (`ENCRYPTION_KEY`) — bankens OAuth refresh-token |
| `User` | `twoFactorSecret` | AES-256-GCM (`ENCRYPTION_KEY`) — TOTP-secret (base32) |
| `User` | `twoFactorBackupCodes` | AES-256-GCM (`ENCRYPTION_KEY`) — JSON-array af SHA-256+salt-hashede backup-koder |

### 5.2 Backup-filer & `.tbkey` proofs (krypteret på disk)

| Type | Beskyttelse |
|---|---|
| Backup-ZIP-filer (`.zip.enc`) | AES-256-GCM fil-kryptering (`ENCRYPTION_KEY`) — binært format `[12B IV][16B authTag][ciphertext]` |
| `.tbkey` proof-filer | AES-256-GCM (`PROOF_ENCRYPTION_KEY`) — uploades krypteret, dekrypteres kun for at læse ZIP-manifest |

### 5.3 Data i databasen (ukrypteret)

Følgende data opbevares ukrypteret i PostgreSQL og beskyttes af foranstaltningerne i punkt 5.4.

#### Identitetsdata — navn, e-mail, telefon, adresse

| Model | Felter | Bemærkning |
|---|---|---|
| `User` | `email`, `businessName` | Brugerens email er unik identifikator (login) |
| `Contact` | `name`, `email`, `phone`, `address`, `city`, `postalCode`, `country`, `cvrNumber` | Kunde-/leverandørkartotek — alt i klartekst |
| `Company` | `name`, `email`, `phone`, `address`, `cvrNumber`, `companyType` | Tenant-identitet |
| `Invoice` | `customerName`, `customerAddress`, `customerEmail`, `customerPhone`, `customerCvr` | Fakturamodtager-oplysninger |
| `ReceivedInvoice` | `supplierName`, `supplierCvr`, `supplierEmail`, `supplierPhone`, `supplierAddress`, `supplierCity`, `supplierCountry` | Leverandør-oplysninger fra indgående e-faktura |
| `EInvoiceSending` | `recipientName`, `recipientCvr`, `recipientEAN`, `recipientEndpointId` | Modtager af udgående e-faktura |
| `Invitation` | `email`, `token` | Invitations-system |
| `ContactMessage` | `message` (og evt. email) | Offentligt kontaktformular |
| `EmailLog` | template, recipient, status | Log af afsendte mails |
| `AuditLog` | `metadata` (inkl. IP, userAgent) | Audit-trail — immutabel |
| `Session` | `ipAddress`, `userAgent` | Sessions-log |

#### Finansielle data — bankkonti, IBAN, posteringer

| Model | Felter | Bemærkning |
|---|---|---|
| `Company` | `bankName`, `bankAccount`, `bankRegistration`, `bankIban`, `bankStreet`, `bankCity`, `bankCountry` | Virksomhedens egen bankkonto |
| `BankConnection` | `bankName`, `provider`, `registrationNumber`, `accountNumber`, `iban`, `accountName`, `currentBalance` | **Kun access/refreshToken er krypteret** — kontonummer + IBAN er i klartekst |
| `BankStatement` | `bankAccount`, `openingBalance`, `closingBalance` | Kontoudtog |
| `BankStatementLine` | `amount`, `balance`, `description` | Posteringer fra bank |
| `Transaction` | `amount`, `description`, `vatPercent`, `receiptImage` | Legacy-transaktioner |
| `JournalEntry` / `JournalEntryLine` | `amount`, `debit`, `credit`, `vatCode`, `description` | Bogføringsposteringer |
| `Invoice` | `lineItems` (JSON), `subtotal`, `vatTotal`, `total`, `notes` | Salgsfaktura |
| `ReceivedInvoice` | `lineItems` (JSON), `taxExclusiveAmount`, `taxAmount`, `taxInclusiveAmount`, `payableAmount`, `paymentAccountId` (IBAN) | Indgående faktura |
| `VATSubmission` | `totalOutputVAT`, `totalInputVAT`, `netVATPayable`, `vatDataJson`, `responseXml` | Momsangivelse |

#### Andre ukrypterede data

- `Backup.filePath`, `fileSize`, `sha256`, `companyName`, `userEmail` — metadata om backup-filer (selve filindhold er krypteret, men metadata er i klartekst).
- `AgentMessage.content` — bruger-chat med AI (kan indeholde persondata hvis brugeren indtaster dem).
- `HermesAgent`-konfiguration, `KnowledgeDocument`-titel/indhold (RAG-videnbase).

### 5.4 Kompenserende foranstaltninger for ukrypteret data

De ukrypterede persondata i punkt 5.3 beskyttes af et **forsvar-i-dybden**-lag:

1. **Transport-lag:** Neon TLS-in-transit (`sslmode=require`) — data er krypteret mellem applikation og database. **Ingen plaintext over netværket.**
2. **Disk-encryption:** Neon tilbyder managed disk-encryption på infrastruktur-niveau (dokumenteret i `NEON & IONOS_IT_SIKKERHED.md`). AlphaFlow verificerer ikke krypteringsniveauet runtime, men er afhængig af Neons service-level agreement.
3. **Adgangskontrol (primært forsvar):**
   - RBAC: 5 roller (OWNER > ADMIN > ACCOUNTANT > VIEWER > AUDITOR) med 18 permissions (`src/lib/rbac.ts`).
   - Tenant-isolation: `tenantFilter(ctx)` / `companyScope(ctx)` returnerer Prisma-where `{ companyId: <aktiv tenant> }` på alle queries.
   - Path-traversal-beskyttelse på fil-serving routes.
4. **Audit-trail immutability:** Alle mutationer logges i `AuditLog` (kun CREATE eksponeres i applikationen + PostgreSQL BEFORE UPDATE/DELETE triggere forhindrer manipulation).
5. **Brugerkonto-beskyttelse:** E-mail-verifikation påkrævet før login, password-reset invaliderer alle eksisterende sesioner, rate-limiting på auth-endpoints.
6. **Ingen CPR-felter:** Schemaet indeholder KUN CVR-numre (virksomhedsregistreringsnumre) — ingen personnumre.

### 5.5 Passwords (special-tilfælde)

`User.password` er **ikke** AES-krypteret, men **bcrypt-hashed** (12 salt rounds) — one-way hashing, der ikke kan reverseres. Dette er industry-standard og acceptabelt. Legacy `simpleHash`-format genkendes og re-hashes automatisk ved login.

---

## 6. Data-at-rest — filer på VPS

Filer på IONOS VPS (`/home/<user>/alphaflow/`):

### 6.1 AES-256-GCM krypteret

| Fil-type | Lokation | Beskyttelse |
|---|---|---|
| Backup-ZIP-filer | `Tenant-Backup/{companyName}/<type>/<timestamp>.zip.enc` | AES-256-GCM (`ENCRYPTION_KEY`) — `.zip.enc`-suffix, original ZIP slettes sikker |
| `.tbkey` proof-filer | Midlertidigt under upload, dekrypteres og forvises | AES-256-GCM (`PROOF_ENCRYPTION_KEY`) |

### 6.2 Ukrypteret på disk

| Fil-type | Lokation | Beskyttelse |
|---|---|---|
| Uploadede kvitteringer | `uploads/receipts/{companyId}/` | UKRYPTERET — afhænger af VPS-disk-encryption (IONOS) + adgangskontrol |
| Uploadede dokumenter | `uploads/documents/{userId}/` | UKRYPTERET — afhænger af VPS-disk-encryption + adgangskontrol |
| Receipts-backup-kopier | `Tenant-Backup/{companyName}/Receipts/{YYYY}/{MM}/{DD}/` | UKRYPTERET — samtidig kopi gemmes ved upload (til gendannelse) |
| SQLite DB for TokenPay | `mini-services/tokenpay-access-service/data/access.db` | UKRYPTERET — indeholder proof-status, ikke persondata |
| SQLite DB for scanner | `mini-services/scanner-service/data/scanner.db` | UKRYPTERET — cache af scanninger |

### 6.3 Source-kode og konfiguration

- Source-kode (Next.js, mini-services) ligger i ukrypterede filer på VPS — standard for applikationsservere.
- `.env`-filer (hvis de findes på VPS) indeholder krypteringsnøgler i plaintext — beskyttet af filesystem-adgangskontrol.
- PM2-logfiler (`logs/*.log`) indeholder potentielt persondata (logning af handlinger) — UKRYPTERET, beskyttet af filesystem-adgangskontrol.

### 6.4 Backup-retention & SHA-256 checksum

- **Retention:** Hourly 24/25t, Daily 30/31d, Weekly 52/53d, Monthly 60/**5 år** (BEK 97 §3 — udstedt i medfør af Lov om bogføring §15), Manual 999/90d.
- **Checksum:** SHA-256 af den ukrypterede ZIP gemmes i `Backup.sha256`. Ved restore genberegnes checksum og sammenlignes — afviser hvis mismatch.
- **Format:** `[ZIP-indhold]` → SHA-256 beregnes → AES-256-GCM encrypt → original ZIP slettes.
- **Lokation:** `Tenant-Backup/{companyName}/` på IONOS VPS — ikke automatisk off-site.

---

## 7. Applikationsniveau-kryptering i praksis

Implementeringen i `src/lib/crypto.ts` (316 linjer):

### 7.1 Funktioner

```typescript
// Streng-kryptering (DB-felter)
encrypt(plaintext: string): string           // → "iv:authTag:ciphertext" (base64)
decrypt(encrypted: string): string           // ← "iv:authTag:ciphertext"

// Null-safe wrappers
encryptOrNull(value: string | null): string | null
decryptOrNull(value: string | null): string

// Format-detektion
isEncrypted(value: string | null): boolean   // true hvis format iv:authTag:ciphertext

// Migration
migrateBase64Token(value: string | null): string | null
  // Konverterer legacy base64-tokens → AES-256-GCM

// Fil-kryptering (backup-ZIPs)
encryptFile(inputPath: string): string       // → inputPath + '.enc', original slettes
decryptFile(encPath: string): string         // → midlertidig .zip.tmp-fil

// Nøglegenerering (til initial setup)
generateEncryptionKey(): string              // → 64-char hex
```

### 7.2 Anvendelsessteder

| Funktion | Brugt i |
|---|---|
| `encrypt()` / `decrypt()` | `src/lib/two-factor.ts` (TOTP-secret, backup-koder), `src/app/api/bank-connections/route.ts` (bank-tokens) |
| `encryptOrNull()` / `decryptOrNull()` | BankConnection.accessToken/refreshToken |
| `migrateBase64Token()` | `scripts/migrate-bank-tokens.ts` (engangsmigration), runtime fallback i bank-connections/route.ts |
| `encryptFile()` / `decryptFile()` | `src/lib/backup-engine.ts` (backup-ZIP kryptering/restore) |
| `isEncrypted()` | `src/lib/two-factor.ts:isSecretEncrypted()`, `scripts/migrate-bank-tokens.ts` |

### 7.3 Key-håndtering i praksis

```typescript
function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) throw new Error('CRITICAL: ENCRYPTION_KEY environment variable is not set...');
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) throw new Error(`ENCRYPTION_KEY must be exactly 32 bytes...`);
  cachedKey = key;
  return key;
}
```

- Nøglen parses én gang og caches per proces.
- Hvis nøglen mangler eller har forkert længde, kastes der — applikationen fejler hurtigt ved opstart.

### 7.4 .tbkey dekryptering (TokenPay-service)

`mini-services/tokenpay-access-service/src/tbkey-decryption.ts`:

- Læser `PROOF_ENCRYPTION_KEY` (64-char hex).
- Validerer version-byte (0x01).
- Extract IV (bytes 1-12) + authTag (bytes 13-28) + ciphertext (bytes 29+).
- Dekrypterer med AES-256-GCM via `createDecipheriv('aes-256-gcm', key, iv)` + `setAuthTag(authTag)`.
- Returnerer `Uint8Array` med ZIP-data eller fejlmeddelelse.

### 7.5 Bank-token migration

Engangsmigration `scripts/migrate-bank-tokens.ts`:
- Konverterer legacy base64-encoded bank-tokens → AES-256-GCM.
- `--dry-run` (default) viser hvad der vil blive konverteret.
- `--execute` anvender ændringerne.
- `isEncrypted()` forhindrer dobbelt-kryptering.

### 7.6 Backup-checksum

`src/lib/backup-engine.ts:117`:
```typescript
export async function calculateChecksum(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  // ...streaming gennem filen...
  return hash.digest('hex');
}
```
- SHA-256 beregnes på den ukrypterede ZIP inden encryption.
- Gemmes i `Backup.sha256`.
- Ved restore genberegnes og sammenlignes (`backup-engine.ts:607-609, 1477-1479`).

---

## 8. Sikkerhedsarkitektur — bemærkninger

Nedenstående beskriver udvalgte arkitektoniske valg i AlphaFlows krypteringsimplementering.

### 8.1 Key management

| # | Beskrivelse |
|---|---|
| K-3 | Krypteringsnøgler opbevares som environment-variabler på VPS. VPS-adgangskontrol og disk-encryption udgør forsvaret. |
| K-4 | Data krypteres direkte med ENCRYPTION_KEY (masternøgle). Keyring-systemet understøtter rotation med versionsstyring. |

### 8.2 Databaseniveau

| # | Beskrivelse |
|---|---|
| D-1 | Persondata (navn, email, telefon, adresse, kontonumre) opbevares ukrypteret i DB. Beskyttet af Neon TLS, disk-encryption og adgangskontrol (jf. punkt 5.4). |
| D-3 | Immutability håndhæves via AuditLog 3-niveau (app CREATE-only + PostgreSQL-triggers + cascade-Restrict). |

### 8.3 Filer på VPS

| # | Beskrivelse |
|---|---|
| F-1 | Uploads opbevares ukrypteret på VPS-disk. Beskyttet af VPS disk-encryption og adgangskontrol. |
| F-2 | SQLite mini-service-databaser opbevares på VPS-disk. Beskyttet af filesystem-adgangskontrol. |

### 8.4 Transport

| # | Beskrivelse |
|---|---|
| T-2 | CSRF-beskyttelse via SameSite=Lax cookie + Bearer-token Authorization header. |

### 8.5 Password-politik

| # | Beskrivelse |
|---|---|
| P-1 | Password minimum er 6 tegn. |
| P-2 | Rate-limiting på auth-endpoints (IP-baseret, in-memory). |
| P-3 | Autentificering via email + password + valgfri TOTP 2FA. |

---

## Appendiks A — Berørte filer og komponenter

### Krypto-moduler
- `src/lib/crypto.ts` — AES-256-GCM streng- og fil-kryptering (316 linjer).
- `src/lib/two-factor.ts` — TOTP + backup-koder med AES-256-GCM (244 linjer).
- `src/lib/password.ts` — bcrypt-hashing med legacy-fallback.
- `mini-services/tokenpay-access-service/src/tbkey-decryption.ts` — `.tbkey`-dekryptering (150 linjer).
- `mini-services/tokenpay-access-service/src/encryption.ts` — HMAC-SHA256 webhook-signering.

### Backup-relateret
- `src/lib/backup-engine.ts` — backup-oprettelse, SHA-256 checksum, AES-256-GCM fil-kryptering (1482 linjer).
- `src/lib/backup-scheduler.ts` — node-cron scheduler.
- `scripts/migrate-bank-tokens.ts` — engangsmigration base64 → AES-256-GCM.
- `scripts/apply-audit-immutability.ts` — installerer PostgreSQL-triggere på AuditLog.

### Konfiguration
- `.env.example` — alle env vars dokumenteret.
- `ecosystem.config.example.js` — PM2-opsætning for 6 apps.
- `Caddyfile` — TLS 1.2/1.3, HSTS, security headers.
- `next.config.ts` — application security headers.
- `prisma/audit-immutability.sql` — AuditLog immutability-triggere.

### Prisma-schema
- `prisma/schema.prisma` — 40 modeller, 25 enums. Krypterede felter på `BankConnection`, `User`. Ukrypterede persondata på `Contact`, `Company`, `Invoice`, `ReceivedInvoice`, etc.

---

## Appendiks B — Compliance-matrix (Lov om bogføring + BEK 97)

| Lov-reference | Implementering | Status |
|---|---|---|
| BEK 97 Bilag 1 / Lov om bogføring §13 — uforanderlighed af posteringer | AuditLog 3-niveau (app + DB-triggers + Restrict cascade) | ✅ Opfyldt |
| BEK 97 §3 — 5-års backup-retention | Monthly backup 5-års retention + AES-256-GCM + SHA-256 | ✅ Opfyldt |
| BEK 97 §7 — backup integritet | SHA-256 checksum verificeres ved restore | ✅ Opfyldt |
| BEK 97 §8 stk. 4 (Hovedkrav 2 — adgangsstyring) | bcrypt 12 rounds + TOTP 2FA + RBAC | ✅ Opfyldt |
| Fortløbende bilagsnummerering | `Company.journalPrefix` + `nextJournalSequence` | ✅ Opfyldt |
| Regnskabsperiode-lås | `FiscalPeriod.lockedAt/lockedBy` | ✅ Opfyldt |
| SAF-T eksport | `/api/export-saft` | ✅ Opfyldt |
| Årsrapport-XBRL/CSV | `/api/reports/annual-xbrl` + `/api/reports/annual-csv` | ✅ Opfyldt |

---

*Dette dokument er udarbejdet som teknisk dokumentation til Erhvervsstyrelsens compliance-vurdering af AlphaFlow. Alle oplysninger er verificeret i kodebasen pr. 2026.*
