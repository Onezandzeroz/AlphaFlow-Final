# AlphaFlow — TokenPay Access & Miljøvariabler-guide

**Dokumenttype:** Operationsguide for TokenPay-adgangssystemet + komplet miljøvariabel-reference
**Version:** 2.1
**Dato:** 2026
**Gyldighedsområde:** AlphaFlow produktionsmiljø (`alphaflow.dk`)
**Målgruppe:** DevOps / systemadministrator (AlphaAi Consult ApS)

---

## Indholdsfortegnelse

1. [TokenPay-adgangssystemet](#1-tokenpay-adgangssystemet)
2. [Miljøvariabler-oversigt](#2-miljøvariabler-oversigt)
3. [Produktions-opsætning](#3-produktions-opsætning)
4. [Porte & services](#4-porte--services)
5. [Sikkerhedscheckliste](#5-sikkerhedscheckliste)

---

## 1. TokenPay-adgangssystemet

TokenPay er AlphaFlows adgangsstyringsmodul, der kontrollerer hvilke brugere der har **read_only** eller **read_write** adgang til platformens funktioner. Adgangskontrollen er token-baseret via krypterede `.tbkey` proof-filer.

### 1.1 Hvad det er

| Komponent | Beskrivelse |
|---|---|
| **`.tbkey` proof-fil** | Binær fil (version 0x01 + 12-byte IV + 16-byte authTag + ciphertext). Produceres eksternt af TokenBay-ZIPProof og uploades af brugeren via `/api/proof-upload`. |
| **Kryptering** | AES-256-GCM med `PROOF_ENCRYPTION_KEY` (64-char hex, delt med TokenBay-ZIPProof). |
| **Modul** | `mini-services/tokenpay-access-service/` (Bun + Hono, port 3100). Dekrypterer `.tbkey` for at læse et ZIP-manifest med proof-metadata. |
| **Dekrypteringslogik** | `mini-services/tokenpay-access-service/src/tbkey-decryption.ts:decryptTbkey()`. |

### 1.2 Access-niveauer

| Niveau | Betydning |
|---|---|
| `read_only` | Bruger kan se data men ikke oprette/redigere. Håndhæves af `requireTokenPayAccess()` i `src/lib/route-guard.ts`. |
| `read_write` | Bruger kan oprette/redigere data (mutationer tilladt). |

> **Note:** AlphaAi App Owner (SuperDev) tildeles syntetisk `read_write`-adgang via owner-bypass (`src/lib/access-guard.ts`), markeret med `isOwnerBypass: true` — ikke et tredje adgangsniveau.

### 1.3 Adgangs-tilstande

| Tilstand | Beskrivelse |
|---|---|
| **Trial** | Op til 60 dages fuld `read_write`-adgang, tildelt af App Owner (SuperDev) via `/api/oversight/trial` (30 eller 60 dage). `User.trialClaimedAt` markerer tidspunktet for brugerens valg af plan (ikke trial-udløb). |
| **Free tier** | Omsætning < 50.000 kr. pr. år — gratis read_write-adgang for små virksomheder. |
| **Betalt abonnement** | Via Frisbii/Flatpay — `PlanTier`: `monthly`, `annual`, `twoyear`, `threeyear`. |
| **Expired / Revoked** | `User.subscriptionRevokedAt` sat af App Owner — adgang blokeret. |

### 1.4 Proof-status

Når en `.tbkey` uploades, oprettes en Proof-record i TokenPay-servicens SQLite-database (`data/access.db`) med en af følgende statuser:

- `pending` — uploadet, afventer aktivering.
- `active` — aktiveret via `/api/proof-activate`, knyttet til userId.
- `expired` — udløbet (baseret på `expiresAt` i manifest).
- `revoked` — tilbagetrukket af App Owner.
- `failed` — dekryptering eller validering fejlede.

Manifestet (JSON i .tbkey) indeholder: `proofId`, `escrowId`, `tier`, `issuedAt`, `expiresAt`.

### 1.5 Webhook-kommunikation

TokenPay-servicen sender events til host-applikationen via `HOST_CALLBACK_URL`:
- `access.granted` — proof aktiveret.
- `access.revoked` — proof tilbagetrukket.
- `access.expiring` — proof udløber snart.

Endpoint: `POST /api/tokenpay/callback` (host-app). Signatur: HMAC-SHA256 via `x-tokenpay-signature`-header, verificeret med `TOKENPAY_API_KEY` som delt secret.

---

## 2. Miljøvariabler-oversigt

Komplet tabel over alle environment variables fra `.env.example`, kategoriseret.

### 2.1 Krypteringsnøgler

| Variabel | Formål | Påkrævet | Dev-default | Sikkerhedsnote |
|---|---|---|---|---|
| `ENCRYPTION_KEY` | AES-256-GCM 64-char hex (32 byte). Bruges til bank-tokens, TOTP-secrets, 2FA-backup-koder, backup-ZIP-filer. | **JA (kritisk)** | (tom) | Service fejler ved opstart hvis manglende. Hvis tabt: permanent datatab. Generer med `openssl rand -hex 32`. |
| `PROOF_ENCRYPTION_KEY` | AES-256-GCM 64-char hex (32 byte). Bruges til `.tbkey` proof-filer. Skal matche TokenBay-ZIPProof. | **JA** | (tom) | TokenPay-service starter ikke uden. Generer med `openssl rand -hex 32`. |

### 2.2 Database

| Variabel | Formål | Påkrævet | Dev-default | Sikkerhedsnote |
|---|---|---|---|---|
| `DATABASE_URL` | PostgreSQL Neon connection string med `?sslmode=require`. | **JA** | (tom) | SSL påkrævet — afviser ikke-SSL-forbindelser. Neon EU-region (Frankfurt/Amsterdam). |

### 2.3 AI-integrationer

> **Konsolideret AI-integration:** Alle AI-funktioner (Hermes chat-LLM, knowledge-service RAG-embeddings, scanner-service VLM) går via OpenRouter som AlphaFlows eneste AI-databehandler. OpenRouter videresender til model-udbydere (Anthropic, Meta, OpenAI m.fl.) per GDPR Art. 28(4) — disse er OpenRouter's underbehandlere, ikke AlphaAi Consult ApS'. Der indgås IKKE separate DPA'er med OpenAI eller Anthropic. Se Bilag 14 (konsolideret AI-DPA).

| Variabel | Formål | Påkrævet | Dev-default | Sikkerhedsnote |
|---|---|---|---|---|
| `OPENROUTER_API_KEY` | OpenRouter API-nøgle — konsolideret AI-integration (Hermes chat-LLM + knowledge-RAG embeddings + scanner VLM). Sættes i både `hermes-agent`, `knowledge-service` og `scanner-service` PM2-env. | **JA for AI-funktioner** | (tom) | Data ud af EU (USA). Kræver SCC + TIA — se Bilag 14. |
| `OPENROUTER_BASE_URL` | API base URL. | Nej | `https://openrouter.ai/api/v1` | — |
| `OPENROUTER_MODEL` | LLM-model (chat). | Nej | `anthropic/claude-sonnet-4.5` | Konfigurerbar model via OpenRouter. |
| `OPENROUTER_APP_NAME` | `X-Title` header (identifikation af app over for OpenRouter). | Nej | `AlphaFlow` | — |
| `OPENROUTER_APP_URL` | `HTTP-Referer` header (henvisende URL). | Nej | `https://alphaflow.dk` | — |
| `OPENAI_API_KEY` | Valgfri alternativ embedding-udbyder i knowledge-service (`embedder.ts` foretrækker OpenAI hvis sat, falder tilbage til OpenRouter). | Nej | (tom) | **IKKE sat i produktion** — hvis sat, går embeddings direkte til OpenAI (USA) og kræver separat OpenAI DPA+SCC (tillægsbilag). Den dokumenterede produktion bruger KUN OPENROUTER_API_KEY. |

> **Note:** `OPENAI_API_KEY` er en valgfri alternativ embedding-udbyder i knowledge-service (`mini-services/knowledge-service/embedder.ts`); i den dokumenterede produktionskonfiguration er KUN `OPENROUTER_API_KEY` sat, så al AI-data går via OpenRouter (Bilag 14, konsolideret AI-DPA per GDPR Art. 28(4)). Hvis `OPENAI_API_KEY` sættes, vil knowledge-service-embeds gå direkte til OpenAI (USA), hvilket kræver en separat OpenAI DPA + SCC som tillægsbilag. Tidligere separate `ANTHROPIC_API_KEY` er fjernet; Anthropic kaldes via OpenRouter per GDPR Art. 28(4).

### 2.4 Inter-service API-nøgler

| Variabel | Formål | Påkrævet | Dev-default | Sikkerhedsnote |
|---|---|---|---|---|
| `TOKENPAY_API_KEY` | Host app ↔ TokenPay-service. Header `X-Access-Service-Key`. | **JA** | `tokenpay-dev-key-2026` (dev-fallback i kode) | **Skal erstattes med `openssl rand -hex 32` i prod.** Dobbelt-brug som HMAC-key for TokenPay callback webhooks. |
| `SCANNER_API_KEY` | Host app ↔ scanner-service. Header `X-Api-Shared-Key`. | **JA** | `scanner-dev-key-2026` (dev-fallback i kode) | **Skal erstattes med `openssl rand -hex 32` i prod.** |
| `HERMES_ADMIN_KEY` | Host app ↔ hermes-agent (Bearer). Fallback til `OPENROUTER_API_KEY` hvis tom. | Nej (anbefalet) | (tom) | Sættes i både `alphaflow`, `hermes-agent` og `knowledge-service` PM2-env. |
| `API_SHARED_KEY` (mini-service env) | Svarer til `TOKENPAY_API_KEY` / `SCANNER_API_KEY` — sat i mini-servicens egen env. | **JA** | (tom) | **SKAL matche tilsvarende host-app variabel eksakt.** |

### 2.5 Integrationer (eksterne)

| Variabel | Formål | Påkrævet | Dev-default | Sikkerhedsnote |
|---|---|---|---|---|
| `STORECOVE_API_KEY` | Storecove Peppol/NemHandel e-faktura. | Nej (sim-mode hvis tom) | (tom) | EU (Holland). |
| `STORECOVE_WEBHOOK_SECRET` | HMAC-SHA256 webhook-verifikation (header `X-Storecove-Signature`). | **JA i prod** | (tom) | Påkrævet i produktion. Webhooks afvises (fail-closed) hvis secret mangler eller signaturen er ugyldig — U-6 implementeret. |
| `STORECOVE_API_URL` | API endpoint. | Nej | `https://api.storecove.com/v2` | — |
| `FLATPAY_API_KEY` | Frisbii/Flatpay abonnementsbetaling. | Nej (mock-mode hvis tom) | (tom) | EU (Tyskland). Frisbii private key starter med `priv_`. |
| `FLATPAY_WEBHOOK_SECRET` | HMAC-SHA256 webhook (header `Reepay-Signature`/`frisbii-signature`). | **JA i prod** | (tom) | Påkrævet i produktion. Webhooks afvises (fail-closed) hvis secret mangler eller signaturen er ugyldig — U-6 implementeret. Fallback til `FLATPAY_API_KEY` som HMAC-secret hvis sat (kræver stadig valid signatur). |
| `FLATPAY_API_BASE_URL` | Frisbii Checkout API URL. | Nej | `https://checkout-api.frisbii.com/v1` | — |
| `SKAT_CLIENT_ID` | SKAT Moms-API OAuth2 client_id. | Nej (sim-mode) | (tom) | DK-myndighed. |
| `SKAT_CLIENT_SECRET` | SKAT OAuth2 client_secret. | Nej (sim-mode) | (tom) | DK-myndighed. KUN moms — ingen årsopgørelse/e-indkomst. |
| `SKAT_API_BASE` | SKAT API URL. | Nej | `https://api.skat.dk/moms` | — |
| `NEMHANDEL_API_KEY` | NemHandel e-faktura (Nets Access Point). | Nej (sim-mode) | (tom) | DK. |
| `NEMHANDEL_API_URL` | NemHandel API URL. | Nej | `https://nemhandel.nets.dk/api/v2` | — |
| `NEMHANDEL_SIMULATION_MODE` | `true` = sim-mode, `false` = produktion. | Nej | `true` | **Sæt til `false` i prod med rigtige credentials.** |
| `PEPPOL_AP_URL` | Peppol Access Point URL. | Nej | `https://peppol.accesspoint.dk` | — |
| `CVR_API_USERNAME` | Erhvervsstyrelsen CVR-register (HTTP Basic Auth). | Nej (sim-mode) | (tom) | DK-myndighed. |
| `CVR_API_PASSWORD` | CVR-register password. | Nej (sim-mode) | (tom) | DK-myndighed. |
| `CVR_API_BASE_URL` | CVR API URL. | Nej | `http://distribution.virk.dk` | — |
| `CVR_SIMULATION_MODE` | `true` = mock-data, `false` = rigtige opslag. | Nej | `false` | Sæt `false` i prod med credentials. |

### 2.6 Email / SMTP

| Variabel | Formål | Påkrævet | Dev-default | Sikkerhedsnote |
|---|---|---|---|---|
| `SMTP_HOST` | SMTP-server hostname (Simply/Brevo). | Nej (dev jsonTransport hvis tom) | (tom) | EU. |
| `SMTP_PORT` | SMTP-port. 587 = STARTTLS, 465 = implicit SSL. | Nej | `587` | Auto-vælger `secure: true` ved 465, `secure: false` ved 587. |
| `SMTP_USER` | SMTP-brugernavn. | Nej | `noreply@alphaflow.dk` | — |
| `SMTP_PASS` | SMTP-password. | Nej | (tom) | — |
| `EMAIL_FROM` | Afsender-email vist i "From"-header. | Nej | `noreply@alphaflow.dk` | — |
| `APP_URL` | Public base URL for email-links (verificering, reset, invites). | Nej | `https://alphaflow.dk` | **VIGTIGT:** Skal matche public domæne i prod. |

### 2.7 Applikation & scheduler

| Variabel | Formål | Påkrævet | Dev-default | Sikkerhedsnote |
|---|---|---|---|---|
| `BACKUP_TIMEZONE` | Tidszone for backup-cron (Bogføringsloven §15 kræver faste DK-tidspunkter). | Nej | `Europe/Copenhagen` | VPS-tidszone behøver ikke matche. |
| `DISABLE_BACKUP_SCHEDULER` | `true` deaktiverer backup-scheduler (f.eks. staging). | Nej | (unset = enabled) | Lad være unset i prod. |
| `HERMES_SERVICE_PORT` | Hermes-agent port. | Nej | `3004` | Skal matche `ecosystem.config.js`. |
| `KNOWLEDGE_SERVICE_PORT` | Knowledge-service port. | Nej | `3006` | Skal matche `ecosystem.config.js`. |
| `SCANNER_PORT` | Scanner-service port. | Nej | `3005` | Skal matche `ecosystem.config.js`. |
| `NEXT_PUBLIC_TOKENPAY_PORT` | TokenPay-service port (client-side). | Nej | `3100` | Skal matche `ecosystem.config.js` + Caddyfile. |
| `PORT` (mini-service env) | Port-bind for mini-service. | Nej | (per service) | Sættes i PM2-env, ikke i root `.env`. |

### 2.8 Mini-service-specifikke env vars

Disse sættes i `ecosystem.config.js` under hver mini-services `env:`-blok, **ikke** i root `.env`:

| Variabel | Mini-service | Formål |
|---|---|---|
| `API_SHARED_KEY` | tokenpay-access, scanner-service | Skal matche `TOKENPAY_API_KEY` / `SCANNER_API_KEY` i root. |
| `HOST_CALLBACK_URL` | tokenpay-access, scanner-service | Webhook-URL til host-app (f.eks. `https://alphaflow.dk/api/tokenpay/callback`). |
| `DATABASE_PATH` | tokenpay-access (`./data/access.db`), scanner-service (`./data/scanner.db`) | SQLite-fil-placering. |
| `PROOF_ENCRYPTION_KEY` | tokenpay-access | Skal matche root `PROOF_ENCRYPTION_KEY`. |
| `ANTHROPIC_MODEL` | scanner-service | Default: `claude-sonnet-4-20250514`. Model-identifier for VLM — kaldes via OpenRouter (ikke direkte Anthropic-API). |
| `VLM_MAX_TOKENS` | scanner-service | Default: `4096`. |
| `MAX_FILE_SIZE_MB` | scanner-service | Default: `10`. |
| `MAX_PAGES` | scanner-service | Default: `10`. |
| `TESSERACT_LANG` | scanner-service | Default: `dan+eng`. |
| `LOG_LEVEL` | scanner-service | Default: `info`. |

### 2.9 Tink bank-integration (ikke aktiveret i produktion)

Tink er en reel bank-integration (OAuth2 PSD2 consent-flow, kontosync). Aktiv når `TINK_CLIENT_ID`/`TINK_CLIENT_SECRET` er sat. DPA med Tink indgås før produktivaktivering (ikke i Bilag 14 endnu). Nordea/Danske Bank/Jyske Bank er stubs; Demo-provider leverer syntetiske data.

| Variabel | Formål | Påkrævet | Dev-default | Sikkerhedsnote |
|---|---|---|---|---|
| `TINK_CLIENT_ID` | Tink OAuth2 client_id. | Nej (Tink inaktiv uden) | (tom) | DK-marked. |
| `TINK_CLIENT_SECRET` | Tink OAuth2 client_secret. | Nej (Tink inaktiv uden) | (tom) | DK-marked. Hemmelig — behandles som API-nøgle. |
| `TINK_REDIRECT_URI` | OAuth2 redirect URI. | Nej | `https://alphaflow.dk/api/bank-connections/tink-callback` | Skal matche Tink-app-konfiguration. |
| `TINK_API_BASE_URL` | Tink API endpoint. | Nej | `https://api.tink.com` | — |
| `TINK_MARKET` | Tink market region. | Nej | `DK` | Sættes normalt til `DK` for danske tenants. |

> **Note:** Tink er IKKE aktiveret i den dokumenterede produktion. Aktivérings-flow: (1) indgå DPA med Tink; (2) sæt `TINK_CLIENT_ID`/`TINK_CLIENT_SECRET`; (3) tilføj Tink til leverandørregisteret (LEVERANDØERSTYRING §3.14) og Bilag 14.

---

## 3. Produktions-opsætning

### 3.1 Vigtige advarsler

> ⚠️ **PM2 læser IKKE automatisk `.env`-filer.** Hver mini-service (`tokenpay-access`, `hermes-agent`, `knowledge-service`, `scanner-service`, `notification-ws`) har sin egen `env:`-blok i `ecosystem.config.js`. Her SKAL alle påkrævede env vars udfyldes eksplikt — ellers arver servicen intet fra root `.env`.

> ⚠️ **Dev-defaults SKAL erstattes.** Følgende dev-defaults er hardcoded i koden og er **IKKE sikre i produktion**:
> - `tokenpay-dev-key-2026` (TOKENPAY_API_KEY / API_SHARED_KEY)
> - `scanner-dev-key-2026` (SCANNER_API_KEY / API_SHARED_KEY)
>
> Erstat med: `openssl rand -hex 32`

> ⚠️ **Webhook-secrets SKAL sættes i produktion.** Ved manglende secret afvises webhooks (fail-closed, U-6) — tjenesten fungerer, men modtager ingen webhooks før secret konfigureres.

### 3.2 Trin-for-trin produktionssætning

**Trin 1 — Generer krypteringsnøgler og API-nøgler:**

```bash
# To AES-256-GCM nøgler
openssl rand -hex 32  # → ENCRYPTION_KEY
openssl rand -hex 32  # → PROOF_ENCRYPTION_KEY

# Fire inter-service API-nøgler
openssl rand -hex 32  # → TOKENPAY_API_KEY (også HMAC for TokenPay callback)
openssl rand -hex 32  # → SCANNER_API_KEY
openssl rand -hex 32  # → HERMES_ADMIN_KEY (eller genbrug OPENROUTER_API_KEY)
openssl rand -hex 32  # → STORECOVE_WEBHOOK_SECRET
openssl rand -hex 32  # → FLATPAY_WEBHOOK_SECRET
```

**Trin 2 — Udfyld root `.env`** (kun det Next.js-appen skal bruge):

```env
# Krypto
ENCRYPTION_KEY=<generated-64-hex>
PROOF_ENCRYPTION_KEY=<generated-64-hex>

# DB
DATABASE_URL=postgresql://...?sslmode=require

# AI (konsolideret via OpenRouter)
OPENROUTER_API_KEY=<key>

# Inter-service
TOKENPAY_API_KEY=<generated-64-hex>
SCANNER_API_KEY=<generated-64-hex>
HERMES_ADMIN_KEY=<generated-64-hex>

# Email
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
EMAIL_FROM=noreply@alphaflow.dk
APP_URL=https://alphaflow.dk

# Scheduler
BACKUP_TIMEZONE=Europe/Copenhagen

# Integrationer
STORECOVE_API_KEY=<key>
STORECOVE_WEBHOOK_SECRET=<generated-64-hex>
FLATPAY_API_KEY=<key>
FLATPAY_WEBHOOK_SECRET=<generated-64-hex>
SKAT_CLIENT_ID=<id>
SKAT_CLIENT_SECRET=<secret>
NEMHANDEL_SIMULATION_MODE=false
CVR_API_USERNAME=<user>
CVR_API_PASSWORD=<pass>
CVR_SIMULATION_MODE=false
```

**Trin 3 — Udfyld `ecosystem.config.js`** for hver mini-service:

```js
// alphaflow (Next.js)
env: {
  NODE_ENV: 'production',
  HERMES_ADMIN_KEY: '<generated-64-hex>',
  HERMES_SERVICE_PORT: '3004',
  // DATABASE_URL, ENCRYPTION_KEY osv. hentes fra .env.local
}

// hermes-agent
env: {
  NODE_ENV: 'production',
  OPENROUTER_API_KEY: '<key>',
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
  OPENROUTER_MODEL: 'anthropic/claude-sonnet-4.5',
  HERMES_ADMIN_KEY: '<generated-64-hex>',
  KNOWLEDGE_SERVICE_PORT: '3006',
  APP_URL: 'https://alphaflow.dk',
}

// knowledge-service
env: {
  NODE_ENV: 'production',
  PORT: '3006',
  DATABASE_URL: '<neon-url-with-sslmode=require>',
  OPENROUTER_API_KEY: '<key>',
  HERMES_ADMIN_KEY: '<generated-64-hex>',
}

// tokenpay-access
env: {
  NODE_ENV: 'production',
  PORT: '3100',
  API_SHARED_KEY: '<samme-som-TOKENPAY_API_KEY>',
  HOST_CALLBACK_URL: 'https://alphaflow.dk/api/tokenpay/callback',
  DATABASE_PATH: './data/access.db',
  PROOF_ENCRYPTION_KEY: '<samme-som-root-PROOF_ENCRYPTION_KEY>',
}

// notification-ws
env: {
  NODE_ENV: 'production',
  PORT: '3001',
}

// scanner-service
env: {
  NODE_ENV: 'production',
  PORT: '3005',
  API_SHARED_KEY: '<samme-som-SCANNER_API_KEY>',
  OPENROUTER_API_KEY: '<key>',  // VLM via OpenRouter (konsolideret AI-DPA — Bilag 14)
  ANTHROPIC_MODEL: 'claude-sonnet-4-20250514',  // model-identifier videresendt via OpenRouter
  VLM_MAX_TOKENS: '4096',
  DATABASE_PATH: './data/scanner.db',
  HOST_CALLBACK_URL: '',
  MAX_FILE_SIZE_MB: '10',
  MAX_PAGES: '10',
  TESSERACT_LANG: 'dan+eng',
  LOG_LEVEL: 'info',
}
```

**Trin 4 — Verificer at nøgler matcher:**

| Host app variabel | Mini-service variabel | Skal være identisk |
|---|---|---|
| `TOKENPAY_API_KEY` | `API_SHARED_KEY` (tokenpay-access) | ✅ |
| `SCANNER_API_KEY` | `API_SHARED_KEY` (scanner-service) | ✅ |
| `PROOF_ENCRYPTION_KEY` | `PROOF_ENCRYPTION_KEY` (tokenpay-access) | ✅ |
| `HERMES_ADMIN_KEY` (alphaflow) | `HERMES_ADMIN_KEY` (hermes-agent + knowledge-service) | ✅ |

**Trin 5 — Genstart PM2:**

```bash
pm2 delete all && pm2 start ecosystem.config.js
pm2 save
pm2 startup  # enable auto-restart on boot
```

**Trin 6 — Verificer sundhed:**

```bash
# TokenPay-service
curl http://localhost:3100/health
# Forventet: { "status": "ok", "service": "TokenPay Access Service", "version": "2.0.0", ... }

# Scanner-service
curl http://localhost:3005/health

# Hermes-agent
curl -H "Authorization: Bearer $HERMES_ADMIN_KEY" http://localhost:3004/admin/stats

# Notification-ws
curl http://localhost:3001/health
```

---

## 4. Porte & services

AlphaFlow kører 6 PM2-apps på IONOS VPS. Caddy router trafik via `?XTransformPort=<port>`-query-parameter for mini-services, og falder tilbage på Next.js (port 3000) for alt andet.

### 4.1 PM2-apps

| # | App-navn | Port | Runtime | Formål | Caddy route |
|---|---|---|---|---|---|
| 1 | `alphaflow` | 3000 | Node (Next.js 16) | Hovedapplikation — UI + API | Default fallback |
| 2 | `notification-ws` | 3001 | Bun (Socket.IO) | Real-time notifikationer | `?XTransformPort=3001` |
| 3 | `hermes-agent` | 3004 | Bun (Socket.IO) | Hermes AI-chat-assistent | `?XTransformPort=3004` |
| 4 | `scanner-service` | 3005 | Python (FastAPI) | OCR + VLM-ekstraktion fra kvitteringer/fakturaer | `?XTransformPort=3005` |
| 5 | `knowledge-service` | 3006 | Bun (HTTP + pgvector) | RAG-videnbase med embeddings via OpenRouter | Intern (ikke direkte Caddy-routet) |
| 6 | `tokenpay-access` | 3100 | Bun (Hono) | TokenPay adgangsstyring + `.tbkey` dekryptering | `?XTransformPort=3100` |

### 4.2 Caddy reverse proxy

Caddy konfigureret til `alphaflow.dk` og `www.alphaflow.dk` med:

- TLS 1.2 / 1.3 (Let's Encrypt auto-cert).
- HSTS preload (`max-age=31536000; includeSubDomains; preload`).
- Security headers: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- Per-service routing via `?XTransformPort=<port>`-matcher:
  - `@notification-ws` → `localhost:3001`
  - `@hermes-agent` → `localhost:3004`
  - `@scanner` → `localhost:3005`
  - `@tokenpay` → `localhost:3100`
- Default `handle` → `localhost:3000` (Next.js).
- `rate_limit`-plugin er **ikke installeret** — rate-limiting håndteres i applikationslaget (`src/lib/rate-limit.ts`).

### 4.3 PM2 exec_mode

Alle 6 apps kører i `fork`-mode (ikke cluster). Begrundelser:
- Bun understøtter ikke Node.js cluster-modul.
- SQLite (tokenpay-access, scanner-service) kan ikke deles på tværs af workers (WAL-locking).
- Socket.IO state er in-memory (notification-ws, hermes-agent) — kræver single-instance.

---

## 5. Sikkerhedscheckliste

Brug denne checklist ved produktionssætning og periodisk audit.

### 5.1 Krypteringsnøgler

- [ ] `ENCRYPTION_KEY` er sat og er 64-char hex (verificer med: `echo -n "$ENCRYPTION_KEY" | wc -c` → 64).
- [ ] `PROOF_ENCRYPTION_KEY` er sat og er 64-char hex.
- [ ] Begge nøgler er genereret med `openssl rand -hex 32` (ikke hardcodede).
- [ ] Nøgler er backet op sikkert (f.eks. password manager, offline storage) — tabt nøgle = permanent datatab.
- [ ] `PROOF_ENCRYPTION_KEY` i `tokenpay-access` mini-service matcher root-værdien eksakt.
- [ ] Nøgler opbevares KUN i environment variables — aldrig i kode, DB, eller logfiler.
- [ ] `.env`-filer er i `.gitignore` (verificer med `git status --ignored`).

### 5.2 Inter-service API-nøgler

- [ ] `TOKENPAY_API_KEY` (root) = `API_SHARED_KEY` (tokenpay-access) — eksakt match.
- [ ] `SCANNER_API_KEY` (root) = `API_SHARED_KEY` (scanner-service) — eksakt match.
- [ ] `HERMES_ADMIN_KEY` er sat identisk i `alphaflow`, `hermes-agent` og `knowledge-service` PM2-env.
- [ ] Dev-defaults (`tokenpay-dev-key-2026`, `scanner-dev-key-2026`) er **ikke** til stede i produktion (verificer med `grep -r "dev-key-2026" ecosystem.config.js` → ingen matches).

### 5.3 Webhook-secrets

- [ ] `STORECOVE_WEBHOOK_SECRET` er sat og ikke-tom (webhooks afvises fail-closed uden gyldig signatur).
- [ ] `FLATPAY_WEBHOOK_SECRET` er sat og ikke-tom (webhooks afvises fail-closed uden gyldig signatur).
- [ ] Webhook-endpoints er nårbare fra internettet:
  - `https://alphaflow.dk/api/storecove/webhook`
  - `https://alphaflow.dk/api/subscription/payment-webhook`
  - `https://alphaflow.dk/api/tokenpay/callback`

### 5.4 Database & email

- [ ] `DATABASE_URL` indeholder `?sslmode=require`.
- [ ] SMTP-credentials (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`) er sat — ellers sendes ingen rigtige mails.
- [ ] `APP_URL` matcher public domæne (`https://alphaflow.dk`).
- [ ] `BACKUP_TIMEZONE` er sat (default `Europe/Copenhagen`).

### 5.5 Eksterne integrationer

- [ ] `OPENROUTER_API_KEY` er sat i `hermes-agent`, `knowledge-service` og `scanner-service` PM2-env (konsolideret AI-integration — ellers fejler chat-LLM, RAG-embeddings og VLM-ekstraktion).
- [ ] `NEMHANDEL_SIMULATION_MODE=false` hvis rigtige e-fakturaer skal sendes.
- [ ] `CVR_SIMULATION_MODE=false` hvis rigtige CVR-opslag skal foretages.
- [ ] `SKAT_CLIENT_ID` + `SKAT_CLIENT_SECRET` sat hvis rigtige momsangivelser skal indsendes.

### 5.6 Adgangskontrol

- [ ] SSH-nøgle-login til VPS er aktiveret; password-login deaktiveret.
- [ ] Root-login begrænset ( kun via sudo).
- [ ] PM2-logfiler (`logs/*.log`) roteres og beskyttes mod uautoriseret læsning.
- [ ] `Tenant-Backup/` og `uploads/` mapper har restriktive filesystem-rettigheder (f.eks. `chmod 750`).

### 5.7 Overvågning

- [ ] PM2 auto-restart er aktiveret (`pm2 startup` + `pm2 save`).
- [ ] CronExecution-log i DB overvåges for fejlede backups.
- [ ] AuditLog overvåges for `LOGIN_FAILED`-events (muligt brute-force).
- [ ] HSTS-preload er registreret hos [hstspreload.org](https://hstspreload.org) (valgfrit, men anbefalet).

### 5.8 Verifikation efter deploy

Kør disse kommandoer efter produktionsdeploy for at verificere opsætning:

```bash
# 1. Alle PM2-apps kører
pm2 status
# Forventet: 6 apps, alle "online"

# 2. TokenPay health
curl http://localhost:3100/health

# 3. TokenPay-service har PROOF_ENCRYPTION_KEY (uden at lekke værdien)
pm2 env tokenpay-access | grep -c PROOF_ENCRYPTION_KEY
# Forventet: 1

# 4. Webhook-secret sat (uden at lekke værdien)
test -n "$STORECOVE_WEBHOOK_SECRET" && echo "OK" || echo "MISSING"
test -n "$FLATPAY_WEBHOOK_SECRET" && echo "OK" || echo "MISSING"

# 5. HTTPS virker og HSTS er aktiv
curl -sI https://alphaflow.dk | grep -i strict-transport-security
# Forventet: strict-transport-security: max-age=31536000; includeSubDomains; preload

# 6. TLS-version
openssl s_client -connect alphaflow.dk:443 -tls1_2 < /dev/null 2>&1 | grep -i "protocol"
openssl s_client -connect alphaflow.dk:443 -tls1_3 < /dev/null 2>&1 | grep -i "protocol"
```

---

## Appendiks A — Fejlfinding

### "Unauthorized" fra host app's proxy-routes

**Årsag:** `TOKENPAY_API_KEY` (root `.env`) og `API_SHARED_KEY` (tokenpay-access `env`) matcher ikke.

**Løsning:** Generér én nøgle med `openssl rand -hex 32` og sæt den i begge env-blokke. Genstart PM2.

### TokenPay-service starter ikke

**Årsag:** `PROOF_ENCRYPTION_KEY` mangler eller er forkert længde (skal være præcis 64 hex-tegn).

**Løsning:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Sæt output som PROOF_ENCRYPTION_KEY i både root .env og tokenpay-access PM2-env.
pm2 restart tokenpay-access
```

### Bank-tokens kan ikke dekrypteres

**Årsag:** `ENCRYPTION_KEY` er blevet ændret siden tokens blev krypteret.

**Løsning:** Gendan den oprindelige `ENCRYPTION_KEY`. Hvis den er tabt, er tokens permanent ubrugelige (ingen recovery).

### Webhooks accepteres ikke

**Årsag:** Webhook-secret matcher ikke mellem AlphaFlow og integrationens dashboard.

**Løsning:** Verificer at `STORECOVE_WEBHOOK_SECRET` / `FLATPAY_WEBHOOK_SECRET` i `.env` matcher den secret der er konfigureret i Storecove/Frisbii dashboard. Genstart PM2.

### AI-chats fejler

**Årsag:** `OPENROUTER_API_KEY` mangler i `hermes-agent` PM2-env. PM2 læser ikke `.env` automatisk.

**Løsning:** Sæt `OPENROUTER_API_KEY` eksplicit i `hermes-agent` env-blok i `ecosystem.config.js`. Genstart.

> **Konsolideret AI-integration:** Den samme `OPENROUTER_API_KEY` bruges nu til alle AI-tjenester (chat-LLM, RAG-embeddings, VLM). `ANTHROPIC_API_KEY` er fjernet — alt chat/VLM-trafik går via OpenRouter per GDPR Art. 28(4) (se Bilag 14). `OPENAI_API_KEY` er en valgfri alternativ embedding-udbyder i knowledge-service (`embedder.ts`); i produktion er KUN `OPENROUTER_API_KEY` sat (se §2.3).

---

*Dette dokument er udarbejdet som operationsdokumentation for AlphaAi Consult ApS. For tekniske krypteringsdetaljer henvises til `Bilag-05_Krypteringsrapport.md`. For sikkerhedsvurdering og udbedringsplaner henvises til `Bilag-08_Risikovurdering-DPIA.md` og `Bilag-12_Udbedringsplan.md`.*
