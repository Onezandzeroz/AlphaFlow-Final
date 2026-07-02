# AlphaFlow — IT-sikkerhedsdokumentation for Neon & IONOS

> **Tredjeparts IT-sikkerhedsdokumentation for AlphaFlows to primære infrastruktur-udbydere**
>
> **Lovgrundlag:** Bogføringsloven §15; BEK nr. 98 af 13. februar 2024 — krav D5 (tredjeparts IT-sikkerhed), D6 (aftale med 3. part opbevaring), N23 (formel aftalegrundlag); GDPR Art. 28 og 32.
>
> **Dokument-version:** 2.0 — revideret 2026
>
> **Ansvarlig:** AlphaAi ApS

---

## 1. Indledning

### 1.1 Formål

Dette dokument beskriver **IT-sikkerheden for AlphaFlows infrastruktur-komponenter** hos de to primære infrastruktur-udbydere:

1. **Neon, Inc.** — leverandør af serverless PostgreSQL (primært datalager for alle tenant-data).
2. **IONOS SE** — leverandør af VPS-hosting (applikationsserver + lokal backup-lagring).

Dokumentet adresserer Erhvervsstyrelsens krav om dokumentation af tredjeparts IT-sikkerhed (D5), aftale med 3. part opbevaring (D6) og formel aftalegrundlag (N23) jf. BEK 98, samt GDPR Art. 28 (databehandleraftale) og Art. 32 (sikkerhedsforanstaltninger).

### 1.2 Ansvarlig

AlphaAi ApS er dataansvarlig (App Owner) for AlphaFlow-platformen. AlphaAi ApS bærer det overordnede ansvar for, at databehandlere og underbehandlere opretholder et tilstrækkeligt sikkerhedsniveau.

### 1.3 Anvendelsesområde

Dokumentet omfatter:

- **Neon PostgreSQL** — primært datalager for alle bogføringsdata, brugere, fakturaer, audit-log, bank-tokens (AES-256-GCM-krypteret), TOTP-secrets (AES-256-GCM-krypteret), Hermes-konversationer, knowledge-base.
- **IONOS VPS** — applikationsserver (Next.js + 5 mini-services + Caddy + PM2) + lokal backup-lagring (`Tenant-Backup/`) + fil-uploads (`uploads/`).

> Dokumentet dækker **ikke** de AI-underbehandlere (OpenAI, OpenRouter, Anthropic) — disse er dokumenteret i `docs/DATABEHANDLERAFTALE.md` og `docs/LEVERANDØERSTYRING.md`. Se afsnit 7 for en kort note om fysisk sikkerhed, der gælder på tværs.

---

## 2. Infrastruktur-overblik

| Komponent | Udbyder | Lokation | Rolle |
|---|---|---|---|
| **Neon PostgreSQL** (serverless) | Neon, Inc. (US-virksomhed, EU-hosting) | EU/EEA — Frankfurt (Tyskland) + Amsterdam (Holland) per Neon-dokumentation | Primært datalager — alle tenant-data, audit-log, bank-tokens, TOTP-secrets, Hermes-konversationer, knowledge-base. |
| **IONOS VPS** (applikationsserver) | IONOS SE | EU (Tyskland) | Hosting af Next.js + 5 mini-services + Caddy (reverse proxy/TLS) + PM2 (proces-manager). |
| **IONOS VPS** (backup-lagring) | IONOS SE | EU (Tyskland) — samme VPS-instans | Lokal lagring af `Tenant-Backup/{companyName}/*.zip.enc` (AES-256-GCM-krypterede tenant-backups). |
| **IONOS VPS** (uploads) | IONOS SE | EU (Tyskland) — samme VPS-instans | Lokal lagring af `uploads/receipts/{companyId}/` + `uploads/documents/{userId}/`. Ukrypteret på disk (afhænger af disk-encryption + adgangskontrol — se afsnit 4 og 9). |
| **Caddy** (reverse proxy / TLS) | Self-hosted på IONOS VPS | EU (Tyskland) | Eneste eksterne entry-point (port 443/80). TLS 1.2/1.3, Let's Encrypt, security headers, routing til mini-services. |
| **PM2** (proces-manager) | Open-source — self-hosted | EU (Tyskland) | Proces-manager med autorestart (max 10, 5s delay), separate log-filer. |

> **Data lokation:** Alle data, der behandles i ovenstående komponenter, forbliver inden for EU/EEA. De eneste dataflow ud af EU/EEA er til AI-underbehandlere (OpenAI, OpenRouter, Anthropic) — dokumenteret i `DATABEHANDLERAFTALE.md`.

---

## 3. Neon PostgreSQL — IT-sikkerhed

### 3.1 Rolle

Neon PostgreSQL er AlphaFlows **primære datalager** for alle tenant-data: bogføring (posteringer, journalposter, kontoplan, momsangivelser), brugere, virksomheder, fakturaer, audit-log, bank-forbindelser (med AES-256-GCM-krypterede tokens), TOTP-secrets (AES-256-GCM-krypteret), Hermes-konversationer, knowledge-base (med pgvector-embeddings).

### 3.2 Lokation

Neon drifter primære datacentre i **EU/EEA** — Frankfurt am Main (Tyskland) + Amsterdam (Holland) — per Neons officielle dokumentation. AlphaFlows produktions-databaseinstans er konfigureret til udelukkende at anvende EU/EEA-regionen.

### 3.3 Selskab

**Neon, Inc.** er en amerikansk virksomhed (US-selskab), men leverer EU-hosting for AlphaFlows produktionsdata via ovenstående EU-datacentre. Neon er **SOC 2 Type II-certificeret** (per Neons offentlige compliance-dokumentation).

### 3.4 Forbindelsessikkerhed

| Parameter | Konfiguration | Kilde |
|---|---|---|
| **Protokol** | PostgreSQL over TLS | — |
| **TLS-mode** | `sslmode=require` i connection-string | `DATABASE_URL` miljøvariabel — `.env.example` |
| **Forbindelses-string-format** | `postgresql://[user]:[pass]@ep-xxx-pooler.region.aws.neon.tech/[db]?sslmode=require` | `.env.example` |
| **Credentials i kode** | Nej — connection-string opbevares udelukkende i `DATABASE_URL`-miljøvariabel, injiceres via PM2 ecosystem-config | `ecosystem.config.example.js` |
| **Connection pooling** | Via Neons pooler-endpoint (`-pooler.region.aws.neon.tech`) | `.env.example` |
| **App-level retry** | `neonConnectionRetry`-extension i PrismaClient — 3 retry ved transiente fejl P1001/P1002/P1008/P1017 (Neon serverless idle-suspend) | `src/lib/db.ts` |

> `sslmode=require` sikrer, at forbindelsen afvises, hvis TLS ikke kan etableres — al data i transit er krypteret.

### 3.5 Adgangskontrol

| Lag | Implementering | Status |
|---|---|---|
| **Databaseniveau** | Username + password (i connection-string) | Aktiv |
| **App-niveau** | Ingen direkte admin-adgang fra applikationen — al DB-adgang går via Prisma ORM med RBAC-begrænsede queries | Aktiv |
| **Neon-konsol** | AlphaAi-admin-konto med MFA (påkrævet per Neon-konto-konfiguration) | _[skabelon: verificer at MFA er aktiveret på AlphaAi's Neon-konto]_ |
| **IP-whitelist** | Neon tillader IP-whitelist på projektniveau — anbefalet konfigureret i produktion | _[skabelon: verificer at IP-whitelist er konfigureret i produktions-Neon-projekt]_ |

### 3.6 Kryptering in-transit

TLS via `sslmode=require` (se afsnit 3.4). Al kommunikation mellem Next.js-applikationen og Neon-databasen er krypteret.

### 3.7 Kryptering at-rest

Neon leverer managed disk-encryption per Neons officielle dokumentation. AlphaAi ApS har ikke uafhængigt verificeret krypteringsstatus for den specifikke produktionsinstans.

> _[skabelon: verificér at disk-encryption er aktiveret for produktions-Neon-projektet — dokumentér verifikationsmetode og dato]_

### 3.8 Backup / Point-in-Time Recovery (PITR)

Neon leverer managed **Point-in-Time Recovery** med op til **7 dages retention** (per Neons dokumentation).

| Backup-lag | Ansvarlig | Formål | Retention |
|---|---|---|---|
| **Lag 1** — Neon PITR (managed) | Neon, Inc. | Defense-in-depth — gendannelse af databasen til ethvert tidspunkt inden for PITR-vinduet | 7 dage |
| **Lag 2** — AlphaFlow tenant-backups | AlphaAi ApS | Per-tenant ZIP-backups (AES-256-GCM + SHA-256), lagret på IONOS VPS i `Tenant-Backup/` | 25 timer (hourly) / 31 dage (daily) / 53 dage (weekly) / **5 år** (monthly) |

> AlphaFlow kalder ikke Neons backup-API — lag 1 er udelukkende en managed service fra Neon, der fungerer som supplement til AlphaFlows egne tenant-backups. Den fulde backup-strategi er dokumenteret i `docs/BEREDSKABSPLAN.md` og `docs/COMPLIANCE_RAPPORT.md`.

### 3.9 High availability

Neons serverless-arkitektur tilbyder auto-suspend ved inaktivitet (scale-to-zero). For at håndtere transiente forbindelsesfejl, der kan opstå ved genoptagelse af en suspenderet compute-node, implementerer AlphaFlow:

- **`neonConnectionRetry`-extension** i PrismaClient (`src/lib/db.ts`) — automatisk retry (3 forsøg) ved Neon-specifikke fejlkoder P1001, P1002, P1008 og P1017.

> Neon tilbyder desuden auto-scaling og storage-autoscaling per Neons dokumentation — disse er managed features, der ikke konfigureres af AlphaAi ApS.

### 3.10 Network isolation

Neon tillader **IP-whitelist** på projektniveau (kun specificerede IP-adresser kan etablere forbindelse til databasen). Dette er en anbefalet konfiguration i produktion — se afsnit 3.5 for verifikationsstatus.

### 3.11 Compliance

| Certificering / standard | Status | Kilde |
|---|---|---|
| **SOC 2 Type II** | Opnået per Neons dokumentation | Neon, Inc. — offentlig compliance-side |
| **DPA (Data Processing Agreement)** | Tilgængelig — opfylder GDPR Art. 28 | Neon, Inc. — https://neon.com/DPA (sidst tjekket: 2026) |
| **EU/EEA-hosting** | Bekræftet — Frankfurt + Amsterdam datacentre | Neon, Inc. — officiel dokumentation |

### 3.12 Sub-processors

Neon offentliggør en liste over underbehandlere på https://neon.com/subprocessors. AlphaAi ApS overvåger listen ved årlig review (se afsnit 10).

### 3.13 Ansvarsfordeling — Neon

| Ansvar | Part |
|---|---|
| DB-infrastruktur (compute, storage, network) | Neon |
| Disk-encryption (managed) | Neon |
| PITR-backup-infrastruktur | Neon |
| Netværksisolering af datacenter | Neon |
| DPA + sub-processor-liste | Neon |
| Applikationskode (queries, RBAC) | AlphaAi ApS |
| Kryptering af specifikke felter (bank-tokens, TOTP-secrets) | AlphaAi ApS (AES-256-GCM via `src/lib/crypto.ts`) |
| Tenant-backups (lag 2) | AlphaAi ApS (`src/lib/backup-engine.ts`) |
| Audit-log immutability (PostgreSQL-triggere) | AlphaAi ApS (`prisma/audit-immutability.sql`) |

---

## 4. IONOS VPS — IT-sikkerhed

### 4.1 Rolle

IONOS VPS fungerer som AlphaFlows **applikationsserver** og **lokal backup-lagring**:

- **Applikationsserver:** Next.js (port 3000) + 5 mini-services (hermes-agent 3004, knowledge-service 3006, notification-ws 3001, scanner-service 3005, tokenpay-access 3100) + Caddy (reverse proxy/TLS) + PM2 (proces-manager).
- **Lokal backup-lagring:** `Tenant-Backup/{companyName}/` — AES-256-GCM-krypterede `.zip.enc`-filer pr. tenant.
- **Fil-uploads:** `uploads/receipts/{companyId}/` + `uploads/documents/{userId}/` — ukrypteret på disk (afhænger af disk-encryption + adgangskontrol — se afsnit 9).

### 4.2 Lokation

IONOS VPS-instansen er provisioneret i **EU (Tyskland)** — IONOS SE. Alle IONOS-datacentre er beliggende i Europa, hvilket sikrer GDPR-compliance uden dataoverførsel til tredjelande.

### 4.3 Certificeringer

IONOS SE har opnået følgende certificeringer (verificerbare på IONOS' hjemmeside):

| Certificering | Udsteder | Dækning |
|---|---|---|
| **C5 (Cloud Computing Compliance Criteria Catalog)** | BSI (Bundesamt für Sicherheit in der Informationstechnik, Tyskland) | Cloud-sikkerhed |
| **ISO/IEC 27001** | International standard | Information Security Management System (ISMS) |
| **IT-Grundschutz** | BSI (Tyskland) | IT-baseline-beskyttelse |

> _[skabelon: verificér at den specifikke VPS-instans er leveret under et IONOS-certificeret produkt — referér til IONOS' compliance-attest og opbevar kopi i AlphaAi's dokumentation]_

### 4.4 Adgangskontrol

| Lag | Implementering | Status |
|---|---|---|
| **SSH-login** | Nøgle-baseret (anbefalet) — password-login deaktiveret | _[skabelon: verificer at kun SSH-nøgle-login er aktiveret på produktions-VPS]_ |
| **Root-login** | Deaktiveret (anbefalet) — login via `sudo` fra almindelig brugerkonto | _[skabelon: verificer at `PermitRootLogin no` er sat i `/etc/ssh/sshd_config`]_ |
| **Firewall** | Anbefalet konfigureret — kun port 22 (SSH, begrænset til admin-IP), 80 (HTTP) og 443 (HTTPS) åbne | _[skabelon: verificer UFW/iptables-regler på produktions-VPS]_ |
| **PM2-env** | Alle credentials (DATABASE_URL, ENCRYPTION_KEY, PROOF_ENCRYPTION_KEY, API-nøgler) opbevares i PM2 ecosystem.config.js, ikke i `.env`-filer læst af applikationen | Aktiv — `ecosystem.config.example.js` |

### 4.5 OS-sikkerhed

- **OS:** Ubuntu LTS (Long Term Support).
- **Security-updates:** Regelmæssige via `apt` / `unattended-upgrades` (anbefalet aktiveret).
- **Patch-cadence:** _[skabelon: verificer at `unattended-upgrades` er aktiveret og at security-updates installeres automatisk]_

### 4.6 Disk-encryption

IONOS tilbyder disk-encryption på VPS-niveau. AlphaAi ApS har ikke uafhængigt verificeret, om disk-encryption er aktiveret på den specifikke produktions-VPS-instans.

> _[skabelon: verificér om disk-encryption er aktiveret på produktions-VPS — hvis ikke, vurder om det skal aktiveres før lancering. Vigtigt i relation til ukrypterede `uploads/`-filer — se afsnit 9.]_

### 4.7 Network

Caddy er **den eneste eksterne entry-point** på VPS:

| Port | Tjeneste | Tilgængelig eksternt? |
|---|---|---|
| 443 (HTTPS) | Caddy → Next.js (3000) eller mini-services (via `?XTransformPort`) | Ja — eneste offentlig port |
| 80 (HTTP) | Caddy (redirect til 443) | Ja — redirect-only |
| 22 (SSH) | SSH | Ja, men begrænset til admin-IP (anbefalet) |
| 3000 | Next.js | Nej — kun localhost |
| 3001 (notification-ws) | Caddy → mini-service via `?XTransformPort=3001` | Ja (gennem Caddy) |
| 3004 (hermes-agent) | Caddy → mini-service via `?XTransformPort=3004` | Ja (gennem Caddy) |
| 3005 (scanner-service) | Caddy → mini-service via `?XTransformPort=3005` | Ja (gennem Caddy) |
| 3006 (knowledge-service) | Intern — kun kaldt fra hermes-agent på localhost | Nej — kun localhost |
| 3100 (tokenpay-access) | Caddy → mini-service via `?XTransformPort=3100` | Ja (gennem Caddy) |

**Routing-princip:** Caddy matcher query-param `?XTransformPort=<port>` og vælger mini-service-backend (matcher `@<service>`-matchere i Caddyfile); default `handle`-blok ruter til Next.js på port 3000. Alle `reverse_proxy`-blokke sætter `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Real-IP` headers.

### 4.8 Backup-lagring på VPS

| Type | Lokation | Kryptering | Beskyttelse |
|---|---|---|---|
| **Tenant-backups** (`.zip.enc`) | `Tenant-Backup/{companyName}/` | AES-256-GCM (12-byte IV + 16-byte auth tag + ciphertext) via `src/lib/crypto.ts` | Adgangskontrol + disk-encryption (hvis aktiveret) |
| **Receipt-uploads** | `uploads/receipts/{companyId}/` | Ukrypteret | Adgangskontrol + disk-encryption (hvis aktiveret) |
| **Document-uploads** | `uploads/documents/{userId}/` | Ukrypteret | Adgangskontrol + disk-encryption (hvis aktiveret) |
| **SQLite (scanner)** | `mini-services/scanner-service/data/scanner.db` | Ukrypteret | Adgangskontrol + disk-encryption (hvis aktiveret) |
| **SQLite (tokenpay)** | `mini-services/tokenpay-access-service/data/access.db` | Ukrypteret | Adgangskontrol + disk-encryption (hvis aktiveret) |
| **Proof-filer (.tbkey)** | `mini-services/tokenpay-access-service/data/proofs/` | AES-256-GCM (`PROOF_ENCRYPTION_KEY`) | Adgangskontrol + disk-encryption (hvis aktiveret) |

> **Bemærkning om ukrypterede uploads:** Bilag, dokumenter og SQLite-filer er ukrypteret på VPS-disken. Sikkerheden afhænger af (a) adgangskontrol (SSH-nøgle + firewall + RBAC i applikationen) og (b) disk-encryption på VPS-niveau (se afsnit 4.6 — skal verificeres). Backup-filer er derimod altid AES-256-GCM-krypterede.

### 4.9 PM2 — proces-manager

PM2 (fork-mode) administrerer 6 processer (1 Next.js + 5 mini-services) med følgende konfiguration:

| Parameter | Værdi | Kilde |
|---|---|---|
| `exec_mode` | `fork` (ikke cluster — Bun + Socket.IO + SQLite state) | `ecosystem.config.example.js` |
| `instances` | 1 pr. app | — |
| `autorestart` | `true` | — |
| `max_restarts` | 10 | — |
| `restart_delay` | 5000 ms (5 sekunder) | — |
| `merge_logs` | `true` | — |
| `log_date_format` | `YYYY-MM-DD HH:mm:ss` | — |
| **Log-filer** | Separate pr. app i `./logs/` | — |

**Applikationer (6 processer):**

| # | name | script | port | max_memory |
|---|---|---|---|---|
| 1 | `alphaflow` | `next start -p 3000` | 3000 | 1500M |
| 2 | `hermes-agent` | `index.ts` (interpreter: bun) | 3004 | 512M |
| 3 | `knowledge-service` | `index.ts` (bun) | 3006 | 256M |
| 4 | `tokenpay-access` | `index.ts` (bun) | 3100 | 256M |
| 5 | `notification-ws` | `index.ts` (bun) | 3001 | 128M |
| 6 | `scanner-service` | `main.py` (interpreter: .venv/bin/python3) | 3005 | 512M |

> **Bemærkning:** PM2 læser IKKE automatisk `.env`/`.env.local`-filer — alle env-værdier skal udfyldes eksplicit i `ecosystem.config.js`. Dette er en sikkerhedsfordel (credentials ikke i filsystemet), men kræver manuel vedligeholdelse ved rotation af secrets.

### 4.10 Monitoring

| Metode | Implementering | Status |
|---|---|---|
| **PM2 monit** | `pm2 monit` — interaktiv visning af CPU/hukommelse/log per proces | Aktiv |
| **PM2 logs** | `pm2 logs` — aggregeret log-visning fra `./logs/` | Aktiv |
| **CronExecution DB-log** | Backup-scheduler-log skrives til `CronExecution`-tabel i Neon DB; vises i UI via `/api/backups/scheduler-status` | Aktiv |
| **Ekstern monitoring** | Anbefalet (f.eks. UptimeRobot, Pingdom, eller Better Stack) — konfigureres separat | _[skabelon: verificer at ekstern uptime-monitoring er konfigureret for alphaflow.dk]_ |
| **Log-aggregering** | Anbefalet (f.eks. Loki + Grafana, eller ELK) — konfigureres separat | _[skabelon: vurder om centraliseret log-aggregering skal opsættes]_ |

---

## 5. Caddy (reverse proxy / TLS)

Caddy er **self-hosted** på IONOS VPS og er AlphaFlows eneste eksterne entry-point.

### 5.1 Konfiguration

| Parameter | Værdi | Kilde |
|---|---|---|
| **Site-blok** | `alphaflow.dk, www.alphaflow.dk` | `Caddyfile` |
| **TLS-protokoller** | `tls1.2 tls1.3` (min TLS 1.2, preferred TLS 1.3) | `Caddyfile` linje 103–105 |
| **Certifikater** | Let's Encrypt (automatisk via Caddy ACME) | — |
| **HTTP→HTTPS redirect** | Automatisk af Caddy | — |

### 5.2 Security headers

Caddy sætter følgende HTTP-security headers på alle responses:

| Header | Værdi |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` (HSTS, 1 år, preload) |
| `X-Frame-Options` | `SAMEORIGIN` (clickjacking-beskyttelse) |
| `X-Content-Type-Options` | `nosniff` (MIME-sniffing-beskyttelse) |
| `X-XSS-Protection` | `1; mode=block` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |

> **Mangler:** Ingen `Content-Security-Policy` (CSP) header er konfigureret — hverken i Caddy eller `next.config.ts`. Se afsnit 9.

### 5.3 Routing

| Query-param | Backend | Beskrivelse |
|---|---|---|
| `?XTransformPort=3001` | `localhost:3001` | notification-ws (Socket.IO) |
| `?XTransformPort=3004` | `localhost:3004` | hermes-agent (Socket.IO) |
| `?XTransformPort=3005` | `localhost:3005` | scanner-service (FastAPI) |
| `?XTransformPort=3100` | `localhost:3100` | tokenpay-access (Hono) |
| Default `handle` | `localhost:3000` | Next.js (App Router) |

Alle `reverse_proxy`-blokke sætter `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Real-IP` headers.

### 5.4 Kompression

`encode gzip zstd` — både gzip og zstd understøttes.

### 5.5 Logging

| Parameter | Værdi |
|---|---|
| Log-fil | `/var/log/caddy/alphaflow-access.log` |
| Roll-størrelse | 50 MB (`roll_size 50mb`) |
| Roll-keep | 5 filer (`roll_keep 5`) |

### 5.6 Rate-limiting — UDKOMMENTERET

**Caddy's `rate_limit`-plugin er IKKE installeret.** Konfigurationen i `Caddyfile` (linje 86–97) er udkommenteret med følgende note:

> "Rate limiting — handled at application level (`src/lib/rate-limit.ts`). Caddy's `rate_limit` plugin is not installed; if needed, install caddy-rate-limit and uncomment the block below."

To zoner er defineret og klar til aktivering:

- `static_zone`: 100 req/min pr. IP
- `api_zone`: 30 req/min pr. IP

**Aktiv rate-limiting:** Udelukkende in-memory app-level (`src/lib/rate-limit.ts`) — sliding window pr. key (typisk `endpoint:userId:IP` eller `endpoint:IP`). Konfigurationer: login 5/min, register 3/min, 2FA 5–10/min, forgot-password 1/5min. Nulstilles ved server-restart.

> Se afsnit 9 for åbenhed om denne begrænsning og `UDBEDRINGSPLAN.md` for afhjælpning.

---

## 6. Netværksarkitektur-diagram (tekst-beskrivelse)

Nedenstående tekst-diagram beskriver trafik-flowet i AlphaFlows produktionsmiljø:

```
                         ┌─────────────────────────────────────┐
                         │            INTERNET                 │
                         └────────────┬────────────────────────┘
                                      │
                                      │  HTTPS (port 443)
                                      │  TLS 1.2/1.3 (Let's Encrypt)
                                      ▼
        ┌─────────────────────────────────────────────────────────────┐
        │                  IONOS VPS (EU/Tyskland)                    │
        │                                                             │
        │   ┌─────────────────────────────────────────────────────┐   │
        │   │  Caddy (reverse proxy / TLS)                        │   │
        │   │  • Security headers (HSTS, X-Frame-Options, ...)    │   │
        │   │  • encode gzip zstd                                  │   │
        │   │  • Log: /var/log/caddy/alphaflow-access.log         │   │
        │   │  • rate_limit: UDKOMMENTERET (app-level i stedet)   │   │
        │   └───────────────────┬─────────────────────────────────┘   │
        │                       │                                     │
        │   ┌───────────────────┴───────────────────────────────┐    │
        │   │  Routing via ?XTransformPort=<port>                │    │
        │   └─┬─────────────┬─────────────┬──────────┬──────────┬─┘   │
        │     │             │             │          │          │     │
        │     │ default     │ =3001       │ =3004    │ =3005    │ =3100
        │     ▼             ▼             ▼          ▼          ▼     │
        │   ┌─────┐      ┌─────────┐  ┌─────────┐ ┌─────────┐ ┌────┐ │
        │   │Next │      │notif-ws │  │hermes   │ │scanner  │ │tokenpay│
        │   │js   │      │:3001    │  │agent    │ │service  │ │access │
        │   │:3000│      │(Bun+SIO)│  │:3004    │ │:3005    │ │:3100  │
        │   └──┬──┘      └─────────┘  │(Bun+SIO)│ │(Py+Fast)│ │(Bun+Hono)│
        │      │                      └────┬────┘ └────┬────┘ └───┬──┘ │
        │      │                           │           │          │    │
        │      │ ┌─────────────────────────┘           │          │    │
        │      │ │ localhost:3006 (kun intern)         │          │    │
        │      │ ▼                                     │          │    │
        │      │ ┌──────────────┐                      │          │    │
        │      │ │knowledge-svc │ ◄── hermes-agent     │          │    │
        │      │ │:3006         │     (localhost)      │          │    │
        │      │ └──────────────┘                      │          │    │
        │      │                                       │          │    │
        │      │ PM2 (fork-mode, 6 processer, autorestart)        │    │
        │      │ logs/ (separate log-filer pr. app)               │    │
        │      │                                                │    │
        │      │ uploads/receipts/  uploads/documents/           │    │
        │      │ Tenant-Backup/{companyName}/*.zip.enc           │    │
        │      │ (AES-256-GCM)                                   │    │
        │      └────────────────────────────────────────────────┘    │
        └──────────────────────────┬──────────────────────────────────┘
                                   │
                                   │  PostgreSQL over TLS (sslmode=require)
                                   │  neonConnectionRetry-extension (3 retry)
                                   ▼
        ┌──────────────────────────────────────────────────────────┐
        │         Neon PostgreSQL (EU: Frankfurt + Amsterdam)      │
        │         • SOC 2 Type II                                  │
        │         • Managed disk-encryption (per Neon docs)        │
        │         • PITR (7 dage, defense-in-depth lag 1)          │
        │         • IP-whitelist (anbefalet konfigureret)          │
        └──────────────────────────────────────────────────────────┘

  Eksterne AI-kald (HTTPS) fra IONOS VPS:
    • Next.js → OpenAI (embeddings, USA) — knowledge-RAG
    • hermes-agent → OpenRouter (chat-LLM, USA)
    • scanner-service → Anthropic (VLM, USA)

  Indgående webhooks (HTTPS) → Caddy → Next.js API:
    • Storecove (Peppol/NemHandel e-faktura status) — HMAC-SHA256
    • Frisbii/Flatpay (abonnementsbetaling status) — HMAC-SHA256
    • TokenPay (adgangs-status) — HMAC-SHA256
```

### Trafik-typer

| Trafik-type | Source → Destination | Kryptering | Beskrivelse |
|---|---|---|---|
| Browser → Caddy | Internet → IONOS VPS:443 | TLS 1.2/1.3 | Bruger-requests |
| Caddy → Next.js | localhost:3000 | ingen (intern) | Default backend |
| Caddy → mini-service | localhost:{3001,3004,3005,3100} | ingen (intern) | Via `?XTransformPort` |
| Next.js → Neon DB | IONOS VPS → Neon EU | TLS (`sslmode=require`) | Database-queries |
| hermes-agent → Neon DB | IONOS VPS → Neon EU | TLS | Knowledge-base queries |
| knowledge-service → Neon DB | IONOS VPS → Neon EU | TLS | pgvector queries |
| hermes-agent → knowledge-service | localhost:3006 | ingen (intern) | RAG-søgning |
| Next.js → hermes-agent | localhost:3004 | ingen (intern) | Socket.IO |
| Next.js → notification-ws | localhost:3001 | ingen (intern) | Socket.IO broadcast |
| Next.js → scanner-service | localhost:3005 | ingen (intern) | OCR/VLM-scanning |
| Next.js → tokenpay-access | localhost:3100 | ingen (intern) | Adgangsstjek |
| hermes-agent → OpenRouter | IONOS VPS → openrouter.ai | HTTPS | Chat-LLM (USA) |
| knowledge-service → OpenAI | IONOS VPS → api.openai.com | HTTPS | Embeddings (USA) |
| scanner-service → Anthropic | IONOS VPS → api.anthropic.com | HTTPS | VLM (USA) |
| Storecove → Caddy | Internet → IONOS VPS:443 | TLS | Webhook-indgående |
| Frisbii → Caddy | Internet → IONOS VPS:443 | TLS | Webhook-indgående |
| TokenPay → Caddy | Internet → IONOS VPS:443 | TLS | Webhook-indgående |

---

## 7. Fysisk sikkerhed

Fysisk sikkerhed af datacentre håndteres af udbyderne (Neon og IONOS) og er dækket af deres respektive compliance-certificeringer:

| Udbyder | Certificering | Fysisk sikkerhed dækket? |
|---|---|---|
| **Neon, Inc.** | SOC 2 Type II | Ja — SOC 2 omfatter fysisk adgangskontrol til datacentre |
| **IONOS SE** | C5 (BSI) + ISO 27001 + IT-Grundschutz | Ja — alle tre certificeringer omfatter fysisk sikkerhed |

> AlphaAi ApS verificerer ved årlig review (se afsnit 10), at udbydernes compliance-attester er gyldige og dækker de datacentre, der reelt anvendes til AlphaFlow-produktion.

---

## 8. Ansvarsfordeling (shared responsibility)

| Ansvarsområde | Neon | IONOS | AlphaAi ApS |
|---|---|---|---|
| **DB-infrastruktur** (compute, storage, network) | ✅ | — | — |
| **Disk-encryption på DB-niveau** (managed) | ✅ | — | — |
| **PITR-backup-infrastruktur** | ✅ | — | — |
| **DB-netværksisolering (IP-whitelist)** | ✅ (feature) | — | Konfiguration |
| **VPS-hardware** | — | ✅ | — |
| **Hypervisor** | — | ✅ | — |
| **Datacenter-fysisk sikkerhed** | ✅ | ✅ | — |
| **OS (Ubuntu LTS)** | — | Image | Patch-cadence (skal verificeres) |
| **Disk-encryption på VPS** | — | Feature | Aktivering (skal verificeres) |
| **Caddy (reverse proxy/TLS)** | — | — | ✅ Konfiguration + vedligeholdelse |
| **PM2 (proces-manager)** | — | — | ✅ Konfiguration + drift |
| **Applikationskode (Next.js + mini-services)** | — | — | ✅ |
| **Adgangskontrol i applikation** (RBAC, 2FA, session) | — | — | ✅ |
| **Kryptering af specifikke felter** (bank-tokens, TOTP, backup-filer, .tbkey proofs) | — | — | ✅ AES-256-GCM |
| **Backup-scheduler** (node-cron, lag 2) | — | — | ✅ |
| **Audit-log** (immute via DB-triggere) | PostgreSQL host | — | ✅ Trigger-installation (`scripts/apply-audit-immutability.ts`) |
| **Security headers** (HSTS, X-Frame-Options, m.fl.) | — | — | ✅ (Caddyfile + next.config.ts) |
| **TLS-konfiguration** (cipher-suites, protokol-version) | — | — | ✅ (Caddyfile) |
| **DPA + sub-processor-overvågning** | Tilbyder DPA | Tilbyder DPA | ✅ Overvåger + ajourfører |
| **Compliance-attester** (SOC 2 / C5 / ISO 27001) | ✅ Leverer | ✅ Leverer | Verificerer ved årlig review |

---

## 9. Åbenhed om mangler

AlphaAi ApS har identificeret følgende kendte mangler i IT-sikkerheden for Neon- og IONOS-infrastrukturen. Manglerne er uddybet i `docs/RISIKOVURDERING.md` med restrisici, og afhjælpningsplan findes i `docs/UDBEDRINGSPLAN.md`.

| # | Mangel | Konsekvens | Afhjælpning |
|---|---|---|---|
| 1 | **Caddy `rate_limit` plugin ikke installeret** — rate-limiting er udelukkende in-memory app-level og nulstilles ved server-restart | Højere sårbarhed over for voluminøse angreb (DDoS, brute-force på API) | Installer `caddy-rate-limit` og aktiver udkommenteret blok i Caddyfile (klar til aktivering) — se `UDBEDRINGSPLAN.md` |
| 2 | **Uploads ukrypteret på VPS-disk** — `uploads/receipts/`, `uploads/documents/`, scanner-SQLite, tokenpay-SQLite er ukrypteret | Kompromitteret disk-adgang → eksponering af bilag/dokumenter | Aktiver IONOS disk-encryption (afsnit 4.6) ELLER implementér applikationsniveau-filkryptering — se `UDBEDRINGSPLAN.md` |
| 3 | **Disk-encryption-verifikation mangler** — hverken for Neon (managed) eller IONOS VPS | Kan ikke dokumentere at disk-encryption reelt er aktiveret | Verificér via udbyderes konsol og dokumentér i dette felt — skabelon i afsnit 3.7 og 4.6 |
| 4 | **Ingen CSP-header** (Content-Security-Policy) — hverken i Caddy eller next.config.ts | Øget XSS-konsekvens | Tilføj CSP-header i Caddy (anbefalet) — se `UDBEDRINGSPLAN.md` |
| 5 | **IP-whitelist-verifikation mangler** for Neon-produktionsprojekt | Større angrebsflade mod databasen | Konfigurér IP-whitelist i Neon-konsol til kun at tillade produktions-VPS IP — se afsnit 3.5 |
| 6 | **MFA-verifikation mangler** for AlphaAi's Neon-admin-konto | Kompromitteret admin-konto → fuld DB-adgang | Verificér at MFA er aktiveret — se afsnit 3.5 |
| 7 | **Ingen ekstern uptime-monitoring** (skabelon-felt i afsnit 4.10) | Længere nedetid før opdagelse | Konfigurér ekstern monitoring (UptimeRobot/Pingdom/Better Stack) — se `UDBEDRINGSPLAN.md` |
| 8 | **Ingen centraliseret log-aggregering** | Hændelses-undersøgelse kræver manuel `pm2 logs` adgang | Vurdér om centraliseret log-aggregering (Loki+Grafana, ELK) skal opsættes — se `UDBEDRINGSPLAN.md` |

> Punkterne 1–4 er sikkerheds-mangler, der kan afhjælpes uden at ændre applikationskode. Punkterne 5–7 er verifikations-eller-opsætningsopgaver, der skal udføres før eller kort efter lanceringsdato.

---

## 10. Vedligeholdelse

### 10.1 Årlig review

AlphaAi ApS udfører en årlig review af IT-sikkerhedsdokumentationen for Neon og IONOS med følgende checkliste:

| Review-punkt | Frekvens | Ansvarlig |
|---|---|---|
| Verificer at Neons SOC 2 Type II-attest er gyldig og opdateret | Årlig | AlphaAi ApS — DPO |
| Verificer at IONOS' C5 + ISO 27001 + IT-Grundschutz-attester er gyldige | Årlig | AlphaAi ApS — DPO |
| Verificer at Neons DPA + sub-processor-liste er ajourførte | Årlig | AlphaAi ApS — DPO |
| Verificer at IONOS' DPA er ajourført | Årlig | AlphaAi ApS — DPO |
| Gennemgå Neons sub-processor-liste for nye underbehandlere | Årlig + ved underretning | AlphaAi ApS — DPO |
| Verificer MFA-status på Neon-admin-konto | Årlig | AlphaAi ApS — teknisk ansvarlig |
| Verificer IP-whitelist-konfiguration i Neon-produktionsprojekt | Årlig | AlphaAi ApS — teknisk ansvarlig |
| Verificer disk-encryption-status på IONOS VPS | Årlig | AlphaAi ApS — teknisk ansvarlig |
| Verificer SSH-nøgle-login + root-login deaktiveret på VPS | Årlig | AlphaAi ApS — teknisk ansvarlig |
| Gennemgå Caddy-log for usædvanlige adgangsmønstre | Årlig (eller hyppigere) | AlphaAi ApS — teknisk ansvarlig |

### 10.2 Patch-cadence

| Komponent | Patch-kilde | Cadence |
|---|---|---|
| **IONOS VPS OS** (Ubuntu LTS) | `apt` / `unattended-upgrades` | Automatisk for security-updates (hvis aktiveret — se afsnit 4.5) |
| **Caddy** | Caddy-officielt APT-repo | Ved behov (CVE-afhængig) |
| **PM2** | npm | Ved behov |
| **Next.js + afhængigheder** | npm / `bun install` | Ved hver deploy |
| **Mini-services** (Bun + Python) | `bun install` / `pip` | Ved hver deploy |
| **Neon PostgreSQL** | Neon-managed | Automatisk (Neon håndterer DB-engine patching) |

### 10.3 Backup-test

Backup-integritet testes jf. `docs/BEREDSKABSPLAN.md`:

- **Månedlig** — restore-test af én tenant fra AES-256-GCM-krypteret `.zip.enc`-backup.
- **Kvartalsvis** — fuld DR-øvelse (gendannelse af hele platformen til staging-miljø).
- **Årlig** — gendannelse fra Neon PITR som defense-in-depth-test.

> Se `docs/BEREDSKABSPLAN.md` for RTO/RPO-mål, gendannelsesprocedurer og kontaktliste.

---

## 11. Konklusion

Neon PostgreSQL og IONOS VPS udgør tilsammen AlphaFlows primære produktionsinfrastruktur og opfylder, med de i afsnit 9 anførte kendte mangler, de krav der stilles til tredjeparts IT-sikkerhed jf. BEK 98 (D5, D6, N23) og GDPR Art. 28 og 32.

| Krav | Status | Begrundelse |
|---|---|---|
| **D5 — Tredjeparts IT-sikkerhed** | ✅ Opfyldt (med kendte mangler — se afsnit 9) | SOC 2 Type II (Neon) + C5/ISO 27001/IT-Grundschutz (IONOS); TLS, RBAC, kryptering, audit-log |
| **D6 — Aftale med 3. part opbevaring** | ✅ Opfyldt | DPA tilgængelig fra både Neon og IONOS; AlphaAi ApS accepterer DPA'erne som del af abonnementet |
| **N23 — Formel aftale** | ✅ Opfyldt | DPA'erne er formelle juridiske dokumenter, der opfylder GDPR Art. 28-kravene |
| **GDPR Art. 32 — Sikkerhed** | ✅ Opfyldt (med kendte mangler) | AES-256-GCM, TLS, RBAC, 2FA, audit-log, backup med 5-års retention |
| **Bogføringsloven §15 — Datalagring** | ✅ Opfyldt | 5-års retention via monthly tenant-backups; Neon PITR som defense-in-depth |
| **EU/EEA-hosting** | ✅ Opfyldt | Både Neon (Frankfurt + Amsterdam) og IONOS (Tyskland) i EU/EEA — ingen infrastruktur-data ud af EU |

> Kendte mangler (afsnit 9) er ikke blokerende for anmeldelsen, men afhjælpes jf. `docs/UDBEDRINGSPLAN.md`. AlphaAi ApS forpligter sig til at afhjælpe punkterne 3, 5, 6 og 7 (verifikationer) før produktionslancering og punkterne 1, 2, 4 og 8 inden for 6 måneder efter lancering.

---

## 12. Dokumentgodkendelse

| Rolle | Navn | Dato | Underskrift |
|---|---|---|---|
| Teknisk ansvarlig | _[skabelon]_ | _[dato]_ | _[underskrift]_ |
| DPO / dataansvarlig | _[skabelon]_ | _[dato]_ | _[underskrift]_ |
| Ledelse (AlphaAi ApS) | _[skabelon]_ | _[dato]_ | _[underskrift]_ |

---

*Dette dokument opdateres årligt eller ved væsentlige ændringer i AlphaFlows infrastruktur eller udbydernes servicevilkår. Seneste revision: 2026.*
