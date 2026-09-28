# Deployment Guide — AlphaFlow + Mini-Services

Complete setup instructions for local development and production deployment on Ubuntu cloud VPS.

The app runs **six services** managed together via PM2 and routed through a single Caddy reverse proxy:

| Service | Port | Stack | Database | Purpose |
|---|---|---|---|---|
| **AlphaFlow** (host app) | 3000 | Next.js 16 + Prisma | **Neon PostgreSQL** (+ pgvector) | Accounting app, marketing site, integration clients, background schedulers |
| **notification-ws** | 3001 | Bun + Socket.IO | — (in-memory) | Real-time notification read-state + data-changed broadcasts |
| **hermes-agent** | 3004 | Bun + Socket.IO | Neon PostgreSQL (shared, read) | Hermes AI chat agent (OpenRouter LLM + RAG retrieval + per-tenant rate limits) |
| **scanner-service** | 3005 | Python 3.11 + FastAPI | **SQLite** (own file) | OCR + VLM document scanning (dan+eng) |
| **knowledge-service** | 3006 | Bun + HTTP | Neon PostgreSQL (shared, pgvector) | RAG document management + semantic search (internal only — not routed via Caddy) |
| **tokenpay-access** | 3100 | Hono + Bun | **SQLite** (own file) | Token-gated proof-based access control |

> A seventh helper — **pg-service** — runs an embedded PostgreSQL 17 + pgvector locally. It exists **only for sandbox/local development** and is **not** part of production deployment.

> **Important — three different data stores:**
> - The **host app**, **hermes-agent** and **knowledge-service** all share the **same Neon PostgreSQL** database via `DATABASE_URL` (Prisma ORM, `prisma/schema.prisma`). Run `bun run db:push` to sync the schema. The knowledge-service additionally requires the **pgvector extension** (see §1.3).
> - The **tokenpay-access** mini-service uses its own **local SQLite** file (`data/access.db`) managed by `bun:sqlite` directly — no Prisma, no `db:push`. Self-initializing on first startup.
> - The **scanner-service** uses its own **local SQLite** file (`data/scanner.db`) managed by Python `sqlite3` — also self-initializing.

---

## Prerequisites

### Bun v1.3+ (host app + 4 Bun mini-services)

**macOS / Linux:**
```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

Verify installation:
```bash
bun --version
```

### Python 3.11+ (scanner-service)

```bash
# Ubuntu / Debian
sudo apt-get install -y python3.11 python3.11-venv python3-pip

# Verify
python3.11 --version
```

---

## 1. Local Development

### 1.1. System Dependencies (Required)

The host app uses **node-canvas** for server-side PDF-to-PNG conversion. The scanner-service uses **Tesseract OCR** and **OpenCV**:

```bash
# Ubuntu / Debian — everything in one shot
sudo apt-get install -y \
  build-essential libcairo2-dev libjpeg-dev libpango1.0-dev \
  tesseract-ocr tesseract-ocr-dan tesseract-ocr-eng \
  libgl1 libglib2.0-0

# macOS (Homebrew)
brew install cairo pango libjpeg tesseract opencv

# Verify
pkg-config --libs cairo    # should list linker flags without error
tesseract --version        # Tesseract + language check
```

> **If you skip the Tesseract step**, OCR scanning of image receipts will fail (text PDFs still work — they are extracted with PyMuPDF, which ships as a pure wheel).

### 1.2. Clone and Install

```bash
# Clone the repository
git clone <your-repo-url>
cd AlphaFlow

# Install host app dependencies (generates Prisma Client automatically via postinstall)
bun install
```

### 1.3. Host App — Neon PostgreSQL Database

The host app requires a **Neon PostgreSQL** connection. You must set `DATABASE_URL` in your `.env` file.

```bash
# Create your .env from the template
cp .env.example .env
```

Edit `.env` and set your Neon connection string:

```env
# Database — REQUIRED — Get this from your Neon dashboard
# For Neon pooled connections (recommended):
#   postgresql://neondb_owner:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
DATABASE_URL=postgresql://neondb_owner:YOUR_PASSWORD@ep-xxxxx-pooler.region.aws.neon.tech/neondb?sslmode=require
```

> **Where to find this:** Log into your [Neon Console](https://console.neon.tech), select your project, click **Connection Details**, and copy the connection string. Use the **pooled** connection string (with `-pooler` in the hostname) for best performance.

**Enable pgvector** (required for the Hermes RAG knowledge base — `KnowledgeChunk.embedding vector(1536)`):

```bash
# Option A: run the setup script against your database
psql "$DATABASE_URL" -f scripts/setup-pgvector.sql

# Option B: copy scripts/setup-pgvector.sql into the Neon SQL editor and run it
# (idempotent — safe to run multiple times)
```

Then push the Prisma schema to your Neon database:

```bash
# Sync the Prisma schema to Neon (creates/updates all tables)
bun run db:push
```

Apply the AuditLog database-level immutability triggers (required for Bogføringsloven §10-12 compliance):

```bash
bun run audit-immutable
```

### 1.4. Mini-Service Setup

Install each mini-service (one command per service):

```bash
# 1. TokenPay Access (port 3100) — proof-based access control
cd mini-services/tokenpay-access-service
bun install
# CRITICAL: remove stale SQLite files from a previous clone (WAL locks crash startup)
rm -f data/access.db data/access.db-shm data/access.db-wal
cd ../..

# 2. Notification WebSocket (port 3001) — real-time notifications
cd mini-services/notification-ws-service && bun install && cd ../..

# 3. Hermes Agent (port 3004) — AI assistant (postinstall runs prisma generate)
cd mini-services/hermes-agent && bun install && cd ../..

# 4. Knowledge Service (port 3006) — RAG semantic search
cd mini-services/knowledge-service && bun install && cd ../..

# 5. Scanner Service (port 3005) — Python OCR/VLM
cd mini-services/scanner-service
bash install.sh        # creates .venv, installs deps, verifies Tesseract
cd ../..
```

> **How the SQLite mini-services work (no migrations needed):**
> 1. On first startup, the tokenpay service's `initDataLayer()` (in `src/data-layer.ts`) creates the `data/` directory, opens `data/access.db` with WAL mode, and runs `CREATE TABLE IF NOT EXISTS` for all tables (`users`, `proofs`, `access_log`, `messages`).
> 2. The scanner service does the same for `data/scanner.db` from Python (`src/data_layer.py`).
> 3. **There is no Prisma, no migration tool, and no `db:push` for either service.** Existing data is preserved across restarts.

### 1.5. Seed Data (optional but recommended)

```bash
# Hermes skill catalog (idempotent upserts)
bun scripts/seed-hermes-skills.ts

# RAG knowledge base (requires: pgvector enabled + db:push + knowledge-service running)
bun scripts/seed-knowledge.ts
```

### 1.6. Start Development Servers

```bash
# Terminal 1 — Next.js dev server (port 3000)
bun run dev

# Terminal 2 — Notification WebSocket service (port 3001)
cd mini-services/notification-ws-service && bun run dev

# Terminal 3 — Hermes agent (port 3004)
cd mini-services/hermes-agent && bun run dev

# Terminal 4 — Scanner service (port 3005)
cd mini-services/scanner-service && .venv/bin/python3 main.py

# Terminal 5 — Knowledge service (port 3006)
cd mini-services/knowledge-service && bun run dev

# Terminal 6 — TokenPay Access service (port 3100)
cd mini-services/tokenpay-access-service && bun run dev
```

Open **http://localhost:3000** in your browser.

The dev servers automatically:
- **AlphaFlow**: hot-reloads on file changes, Webpack mode (required for Prisma + Next.js 16), starts all background schedulers (backup, recurring, billing, log monitor, Sproom inbox/outbox)
- **Bun mini-services**: hot-reload via `bun --hot`
- **Scanner service**: uvicorn with auto-reload in development mode

> **Note:** In development, all integrations degrade gracefully to simulation/mock mode when their credentials are unset (Sproom, Tink, Skat, Frisbii, CVR) — the app is fully usable out of the box.

### Stopping the dev servers

Press `Ctrl + C` in each terminal, or kill all background processes:

```bash
pkill -f "next dev"
pkill -f "bun.*mini-services"
pkill -f "scanner-service"
```

### If a port is stuck

```bash
# Host app (3000) and mini-services (3001, 3004, 3005, 3006, 3100)
for port in 3000 3001 3004 3005 3006 3100; do
  lsof -ti :$port | xargs kill -9 2>/dev/null
done
```

### Email in Development

Without SMTP configuration, the email system runs in **dev mode**: emails are rendered and logged to the console but not sent. This is the default — no additional setup is required.

To test real emails during development, configure SMTP in `.env` (see [SMTP Configuration](#3-smtp-configuration)).

---

## 2. Production Deployment (Ubuntu Cloud VPS)

### 2.1. Server Setup

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install essential tools + all native dependencies in one shot
sudo apt install -y git curl ufw \
  build-essential libcairo2-dev libjpeg-dev libpango1.0-dev \
  python3.11 python3.11-venv python3-pip \
  tesseract-ocr tesseract-ocr-dan tesseract-ocr-eng \
  libgl1 libglib2.0-0 clamav clamav-daemon

# Install Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Verify
bun --version
python3.11 --version
tesseract --version

# Start ClamAV daemon (upload malware scanning)
sudo systemctl enable --now clamav-daemon
```

### 2.2. Clone and Install

```bash
# Clone the repository
git clone <your-repo-url>
cd AlphaFlow

# Install host app dependencies
bun install

# Install all mini-services
cd mini-services/tokenpay-access-service && bun install && cd ../..
cd mini-services/notification-ws-service && bun install && cd ../..
cd mini-services/hermes-agent && bun install && cd ../..
cd mini-services/knowledge-service && bun install && cd ../..
cd mini-services/scanner-service && bash install.sh && cd ../..
```

### 2.3. Configure the Host App

Create a `.env` file in the project root:

```bash
cp .env.example .env
nano .env
```

Set the following values (see [.env.example](./.env.example) for the fully annotated version):

```env
# ─── Database (REQUIRED) ───────────────────────────────────────────
DATABASE_URL=postgresql://neondb_owner:YOUR_PASSWORD@ep-xxxxx-pooler.region.aws.neon.tech/neondb?sslmode=require

# ─── Encryption keys (REQUIRED in production) ──────────────────────
# AES-256-GCM at-rest encryption — bank tokens, backups, 2FA secrets
ENCRYPTION_KEY=<node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
# .tbkey proof decryption — the tokenpay-access service will NOT start without it
PROOF_ENCRYPTION_KEY=<same-format-64-char-hex>

# ─── AI (REQUIRED for Hermes chat + scanner VLM) ───────────────────
OPENROUTER_API_KEY=<your-openrouter-key>           # https://openrouter.ai → Keys
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5       # default chat model
# Optional shared secret for hermes stats + knowledge service auth
HERMES_ADMIN_KEY=<openssl rand -hex 32>

# ─── Email / SMTP (REQUIRED for production email) ──────────────────
SMTP_HOST=smtp.simply.com
SMTP_PORT=587
SMTP_USER=noreply@alphaflow.dk
SMTP_PASS=<your-password>
EMAIL_FROM=noreply@alphaflow.dk
APP_URL=https://alphaflow.dk

# ─── Security alert emails (recommended) ───────────────────────────
ALERT_EMAIL_RECIPIENT=owner@alphaflow.dk

# ─── Sproom e-invoicing (Peppol + NemHandel) ───────────────────────
SPROOM_API_URL=https://sproom.net                # PRODUCTION (staging: https://staging.sproom.net)
SPROOM_API_TOKEN=<sproom-dashboard-API-token>
SPROOM_WEBHOOK_REQUIRE_SIGNATURE=true             # fail-closed in production

# ─── Tink Open Banking ─────────────────────────────────────────────
TINK_CLIENT_ID=<tink-console-client-id>
TINK_CLIENT_SECRET=<tink-console-client-secret>

# ─── Skattestyrelsen Moms-API (digital VAT submission) ─────────────
SKAT_CLIENT_ID=<skat-client-id>
SKAT_CLIENT_SECRET=<skat-client-secret>

# ─── Frisbii / Flatpay (subscription payments) ─────────────────────
FLATPAY_API_KEY=<private-key-from-frisbii>
FLATPAY_WEBHOOK_SECRET=<webhook-secret>

# ─── CVR register lookup (VIRK) ────────────────────────────────────
CVR_API_USERNAME=<virk-user>
CVR_API_PASSWORD=<virk-pass>
CVR_SIMULATION_MODE=false

# ─── TokenPay Access ───────────────────────────────────────────────
TOKENPAY_API_KEY=<openssl rand -hex 32>           # must match API_SHARED_KEY in ecosystem.config.js
NEXT_PUBLIC_TOKENPAY_PORT=3100

# ─── Scanner service ───────────────────────────────────────────────
SCANNER_API_KEY=<openssl rand -hex 32>            # must match API_SHARED_KEY in ecosystem.config.js
```

> **Important:** `APP_URL` must match your public URL. It is used for email verification links, password reset links, team invitation links, and OAuth2 redirect URIs (Tink). If this is wrong, those links will point to the wrong address.

Then initialize the database:

```bash
# 1. Enable pgvector on Neon (once)
psql "$DATABASE_URL" -f scripts/setup-pgvector.sql

# 2. Push the Prisma schema
bun run db:push

# 3. Apply AuditLog immutability triggers (Bogføringsloven §10-12)
bun run audit-immutable

# 4. Seed Hermes skills + knowledge base
bun scripts/seed-hermes-skills.ts
bun scripts/seed-knowledge.ts
```

### 2.4. Configure PM2 (all six services)

The repository ships `ecosystem.config.example.js`. Copy it and fill in the shared secrets:

```bash
cp ecosystem.config.example.js ecosystem.config.js
nano ecosystem.config.js
```

Fill in these values in each app's `env` block:

| App | Variables to set |
|---|---|
| `alphaflow` | `HERMES_ADMIN_KEY` (match root `.env`) |
| `notification-ws` | nothing required (PORT=3001 is preset) |
| `hermes-agent` | `OPENROUTER_API_KEY`, `HERMES_ADMIN_KEY`, optionally `DATABASE_URL` |
| `knowledge-service` | `DATABASE_URL` (Neon), `OPENROUTER_API_KEY` or `OPENAI_API_KEY`, `HERMES_ADMIN_KEY` |
| `tokenpay-access` | `API_SHARED_KEY` (= `TOKENPAY_API_KEY`), `PROOF_ENCRYPTION_KEY` (= root `.env`), `HOST_CALLBACK_URL` |
| `scanner-service` | `API_SHARED_KEY` (= `SCANNER_API_KEY`), `OPENROUTER_API_KEY` |

> **Critical — PM2 does NOT auto-load the root `.env`.** Every credential a mini-service needs (OpenRouter key, DATABASE_URL, shared keys) must be set explicitly in its `ecosystem.config.js` env block. (The hermes-agent and knowledge-service additionally try to read the parent `.env` at boot via their `load-env.ts` module, but do not rely on this under PM2.)

> **Critical — key pairs must match:**
> - `TOKENPAY_API_KEY` (root `.env`) = `API_SHARED_KEY` (tokenpay-access env block)
> - `SCANNER_API_KEY` (root `.env`) = `API_SHARED_KEY` (scanner-service env block)
> - `PROOF_ENCRYPTION_KEY` (root `.env`) = `PROOF_ENCRYPTION_KEY` (tokenpay-access env block)
> - `HERMES_ADMIN_KEY` (root `.env`) = hermes-agent + knowledge-service + alphaflow env blocks

Generate strong keys:
```bash
openssl rand -hex 32
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2.5. Clean Stale SQLite Files

The repository may contain leftover SQLite WAL/SHM files from a previous environment. These are machine-specific and **must be deleted** on a fresh deployment — both services recreate clean databases on first startup:

```bash
rm -f mini-services/tokenpay-access-service/data/access.db*
rm -f mini-services/scanner-service/data/scanner.db*
```

### 2.6. Build and Start with PM2

```bash
# Create the production build
bun run build

# Create logs directory (required by PM2)
mkdir -p logs

# Start all six services
pm2 start ecosystem.config.js

# Verify ALL are running (not "errored" or "stopped")
pm2 status
# Expected: alphaflow, notification-ws, hermes-agent, knowledge-service,
#           tokenpay-access, scanner-service — all online

# If a service shows "errored", check logs immediately:
pm2 logs <service-name> --lines 30 --err

# Save the PM2 configuration so it survives reboots
pm2 save
pm2 startup
```

### 2.7. Configure Reverse Proxy (Caddy)

Caddy automatically handles HTTPS certificates via Let's Encrypt and routes all services through a single domain.

```bash
# Install Caddy
sudo apt install -y caddy

# Copy the project's Caddyfile (or edit /etc/caddy/Caddyfile)
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile   # replace alphaflow.dk with your domain
```

The project's `Caddyfile` routes:

| Query param | Service | Port |
|---|---|---|
| `?XTransformPort=3001` | notification-ws (Socket.IO) | 3001 |
| `?XTransformPort=3004` | hermes-agent (Socket.IO) | 3004 |
| `?XTransformPort=3005` | scanner-service (FastAPI) | 3005 |
| `?XTransformPort=3100` | tokenpay-access (Hono) | 3100 |
| *(default)* | AlphaFlow (Next.js) | 3000 |

> **Note:** The knowledge-service (port 3006) is **not** routed through Caddy — it is called server-to-server only (by hermes-agent and the Next.js `/api/hermes/knowledge` proxy route via `localhost:3006`).

```bash
# Validate and reload Caddy
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl restart caddy
sudo systemctl enable caddy
```

Your app is now accessible at **https://yourdomain.com** with automatic HTTPS.

> **How routing works:** Browser-facing requests to mini-services use relative URLs with the `XTransformPort` query parameter (e.g. Socket.IO connects to `/?XTransformPort=3001`). Caddy intercepts this parameter and forwards the request to the correct internal port. Server-to-server calls (knowledge-service, Sproom/Tink/Skat/Frisbii APIs) go out directly.

### 2.8. Configure External Webhooks

Point each provider's webhook at your public domain:

| Provider | Webhook URL (configure in their dashboard) |
|---|---|
| **Sproom** | `https://yourdomain.com/api/sproom/webhook` — events: `DocumentStatusChanged`, `DocumentReceived` |
| **Frisbii (Flatpay)** | `https://yourdomain.com/api/subscription/payment-webhook` — events: `invoice_authorized`, `invoice_settled`, `invoice_failed` |
| **TokenPay** | set `HOST_CALLBACK_URL=https://yourdomain.com/api/tokenpay/callback` in the tokenpay env block |
| **Scanner** (optional) | set `HOST_CALLBACK_URL=https://yourdomain.com/api/scanner/callback` for async scan completion |
| **Tink** | redirect URI: `https://yourdomain.com/api/bank-connections/tink-callback` (registered in Tink Console) |

> **Sproom staging vs production:** with `SPROOM_WEBHOOK_REQUIRE_SIGNATURE=true` (production), webhooks with invalid RSA signatures are rejected (fail-closed). The RSA public key is auto-fetched from Sproom, or set explicitly via `SPROOM_WEBHOOK_PUBLIC_KEY`.

### 2.9. Verify All Services

```bash
# Host app
curl -s http://localhost:3000 | head -5

# Notification WebSocket (Socket.IO polling handshake)
curl -s "http://localhost:3001/socket.io/?EIO=4&transport=polling"

# Hermes agent (Socket.IO polling handshake)
curl -s "http://localhost:3004/socket.io/?EIO=4&transport=polling"

# Scanner service (no auth required)
curl -s http://localhost:3005/health
# Expected: {"status":"ok","vlm_enabled":true,...}

# Knowledge service (auth required)
curl -s -H "Authorization: Bearer $HERMES_ADMIN_KEY" http://localhost:3006/stats

# TokenPay Access (no auth required)
curl -s http://localhost:3100/health
# Expected: {"status":"ok","service":"TokenPay Access Service",...}

# TokenPay stats (API key required)
curl -s -H "X-Access-Service-Key: $TOKENPAY_API_KEY" http://localhost:3100/api/v1/stats
```

### 2.10. Firewall

```bash
# Allow SSH, HTTP, and HTTPS only
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

> **Note:** Ports 3000, 3001, 3004, 3005, 3006 and 3100 are NOT exposed to the internet. They are only accessible internally via the Caddy reverse proxy. Never open them in the firewall.

---

## 3. SMTP Configuration

### 3.1. SMTP Provider Examples

| Provider | SMTP Host | Port | Notes |
|---|---|---|---|
| **Simply** | `smtp.simply.com` | 587 | Current AlphaFlow.dk provider |
| **Gmail** | `smtp.gmail.com` | 587 | Requires [App Password](https://support.google.com/accounts/answer/185833) (not account password). Enable 2FA first. |
| **Mailgun** | `smtp.mailgun.org` | 587 | Free tier: 1,000 emails/month. |
| **SendGrid** | `smtp.sendgrid.net` | 587 | Use API key as password. Create a sender identity first. |
| **Mailtrap** | `smtp.mailtrap.io` | 587 | Testing only — emails captured in sandbox UI. |
| **Amazon SES** | `email-smtp.eu-north-1.amazonaws.com` | 587 | SES SMTP credentials from AWS console. Verify sender domain first. |
| **Microsoft 365** | `smtp.office365.com` | 587 | Requires app password or OAuth2. |
| **Migadu** | `smtp.migadu.com` | 465 | Use your Migadu mailbox credentials. |

### 3.2. Gmail Setup (Most Common for Small Businesses)

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification**
3. Go to **App passwords** → Create new → Select "Mail" → Generate
4. Use the 16-character app password as `SMTP_PASS`

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=abcdabcdabcdabcd  # 16-char app password
EMAIL_FROM=your@gmail.com
APP_URL=https://yourdomain.com
```

### 3.3. Testing Email Configuration

After deployment, verify email is working:

1. **Register a new account** — A verification email should be sent
2. **Click "Forgot password"** — A reset email should be sent
3. **Invite a team member** — An invitation email should be sent
4. **Check PM2 logs** for `[EMAIL]` entries:
   ```bash
   pm2 logs alphaflow | grep EMAIL
   ```

If emails fail, check the `EmailLog` table in the database — failed emails will have status `failed` with an error message.

---

## 4. Updating the Deployment

When you pull new changes:

```bash
cd AlphaFlow

# Pull latest code
git pull

# Install any new dependencies (host app + all mini-services)
bun install
cd mini-services/tokenpay-access-service && bun install && cd ../..
cd mini-services/notification-ws-service && bun install && cd ../..
cd mini-services/hermes-agent && bun install && cd ../..
cd mini-services/knowledge-service && bun install && cd ../..
cd mini-services/scanner-service && bash install.sh && cd ../..

# Update the Neon database schema (if Prisma schema changed)
bun run db:push

# Rebuild for production
bun run build

# Restart all services
pm2 restart all

# Verify all are running
pm2 status
```

### Updating only one mini-service

```bash
# Example: only the scanner service changed
cd mini-services/scanner-service && bash install.sh && cd ../..
pm2 restart scanner-service

# Example: only hermes-agent changed
cd mini-services/hermes-agent && bun install && cd ../..
pm2 restart hermes-agent
```

> **Note:** If a SQLite mini-service's schema changed (tables added/modified), `CREATE TABLE IF NOT EXISTS` won't alter existing tables. In that case delete the SQLite file and let it recreate: `rm mini-services/<service>/data/*.db* && pm2 restart <service>` (⚠️ loses that service's local data).

---

## 5. Useful PM2 Commands

All six services are managed together. Replace `<service>` with `alphaflow`, `notification-ws`, `hermes-agent`, `knowledge-service`, `tokenpay-access`, or `scanner-service` — or use `all`.

| Command | Description |
|---|---|
| `pm2 status` | Show all running apps |
| `pm2 logs` | Show live logs (all services) |
| `pm2 logs <service> --lines 100` | Show last 100 log lines |
| `pm2 logs <service> --err` | Show error logs only |
| `pm2 restart <service>` | Restart one service |
| `pm2 restart all` | Restart all services |
| `pm2 stop <service>` / `pm2 delete all` | Stop / remove services |
| `pm2 monit` | Real-time monitoring dashboard |
| `pm2 save` / `pm2 startup` | Persist process list across reboots |

---

## 6. Environment Variables Reference

See [.env.example](./.env.example) for the complete annotated template.

### 6.1. Host App (`.env` in project root)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | — | Neon PostgreSQL connection string |
| `ENCRYPTION_KEY` | **Yes** (prod) | — | AES-256-GCM key (64-char hex): bank tokens, backup files, 2FA secrets. **Losing it makes encrypted data unrecoverable.** |
| `PROOF_ENCRYPTION_KEY` | **Yes** | — | AES-256-GCM key (64-char hex) for `.tbkey` proof decryption. Must match TokenBay-ZIPProof. The tokenpay service will not start without it. |
| `OPENROUTER_API_KEY` | **Yes** (AI) | — | Unified AI key — Hermes chat + scanner VLM. https://openrouter.ai → Keys |
| `OPENROUTER_BASE_URL` | No | `https://openrouter.ai/api/v1` | OpenRouter API base |
| `OPENROUTER_MODEL` | No | `anthropic/claude-sonnet-4.5` | Hermes chat model |
| `OPENROUTER_APP_NAME` / `OPENROUTER_APP_URL` | No | `AlphaFlow` / `https://alphaflow.dk` | OpenRouter dashboard attribution |
| `HERMES_ADMIN_KEY` | No | falls back to OpenRouter key | Shared secret: hermes `/admin/stats` + knowledge-service auth + Next.js oversight proxy |
| `HERMES_SERVICE_PORT` | No | `3004` | Hermes agent port |
| `KNOWLEDGE_SERVICE_PORT` | No | `3006` | Knowledge service port |
| `OPENAI_API_KEY` | No | — | Preferred (cheaper) embeddings provider for RAG; otherwise OpenRouter |
| `SMTP_HOST/PORT/USER/PASS` | No* | — | SMTP credentials (dev console-logging fallback) |
| `EMAIL_FROM` | No | `noreply@alphaflow.dk` | Sender email |
| `APP_URL` | No | `http://localhost:3000` | Public base URL for email links + OAuth redirects |
| `ALERT_EMAIL_RECIPIENT` | No | — | Daily security digest + critical incident alerts |
| `BACKUP_TIMEZONE` | No | `Europe/Copenhagen` | Backup cron timezone (Bogføringsloven §15 fixed Danish times) |
| `DISABLE_BACKUP_SCHEDULER` / `DISABLE_RECURRING_SCHEDULER` / `DISABLE_BILLING_SCHEDULER` / `DISABLE_LOG_MONITOR_SCHEDULER` / `DISABLE_SPROOM_INBOX_SCHEDULER` / `DISABLE_SPROOM_OUTBOX_SCHEDULER` | No | — | Set `true` to disable individual background schedulers |
| `TOKENPAY_API_KEY` | No | dev default | Must match `API_SHARED_KEY` (tokenpay) |
| `NEXT_PUBLIC_TOKENPAY_PORT` | No | `3100` | TokenPay service port |
| `SCANNER_API_KEY` | No | dev default | Must match `API_SHARED_KEY` (scanner) |
| `SCANNER_PORT` | No | `3005` | Scanner service port |
| `SPROOM_API_URL` | No | `https://staging.sproom.net` | Sproom AP base URL (prod: `https://sproom.net`) |
| `SPROOM_API_TOKEN` | No | — | Sproom parent-company API token (unset = simulation mode) |
| `SPROOM_WEBHOOK_PUBLIC_KEY` | No | auto-fetched | RSA public key for webhook signature verification |
| `SPROOM_WEBHOOK_REQUIRE_SIGNATURE` | No | `false` | `true` = fail-closed webhook verification (production) |
| `SPROOM_INBOX_CRON_SCHEDULE` / `SPROOM_OUTBOX_CRON_SCHEDULE` | No | `*/5` / `*/10` min | Safety-net poller intervals |
| `TINK_CLIENT_ID` / `TINK_CLIENT_SECRET` | No | — | Tink Open Banking credentials (sandbox or prod) |
| `TINK_REDIRECT_URI` | No | `{APP_URL}/api/bank-connections/tink-callback` | Must match Tink Console registration |
| `TINK_API_BASE_URL` / `TINK_MARKET` | No | `https://api.tink.com` / `DK` | Tink API base + market |
| `SKAT_API_BASE` / `SKAT_CLIENT_ID` / `SKAT_CLIENT_SECRET` | No | — | Skattestyrelsen Moms-API (unset = simulation mode) |
| `FLATPAY_API_KEY` / `FLATPAY_API_BASE_URL` / `FLATPAY_WEBHOOK_SECRET` | No | — | Frisbii checkout + webhook verification (unset = mock mode) |
| `CVR_API_BASE_URL` / `CVR_API_USERNAME` / `CVR_API_PASSWORD` | No | — | VIRK CVR register credentials |
| `CVR_SIMULATION_MODE` | No | `false` | Set `true` to force mock CVR lookups |

*Not required — if any of `SMTP_HOST`, `SMTP_USER`, or `SMTP_PASS` are missing, the email system runs in dev mode (console logging only).

### 6.2. Mini-Services

Configured in `ecosystem.config.js` env blocks (PM2 does not load the root `.env`):

| Service | Variable | Default | Description |
|---|---|---|---|
| **notification-ws** | `PORT` | `3001` | Listen port |
| **hermes-agent** | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `HERMES_ADMIN_KEY`, `KNOWLEDGE_SERVICE_PORT`, `DATABASE_URL` | — | LLM credentials + shared secrets + DB for tenant data |
| **knowledge-service** | `PORT` (`3006`), `DATABASE_URL`, `OPENROUTER_API_KEY` or `OPENAI_API_KEY`, `HERMES_ADMIN_KEY` | — | pgvector DB + embedding provider + auth |
| **tokenpay-access** | `PORT` (`3100`), `API_SHARED_KEY`, `HOST_CALLBACK_URL`, `DATABASE_PATH`, `PROOF_ENCRYPTION_KEY` | — | Access control secrets + SQLite path |
| **scanner-service** | `PORT` (`3005`), `API_SHARED_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_VLM_MODEL`, `DATABASE_PATH`, `HOST_CALLBACK_URL`, `MAX_FILE_SIZE_MB` (`10`), `MAX_PAGES` (`10`), `TESSERACT_LANG` (`dan+eng`) | — | Scanning limits + VLM credentials |

---

## 7. Database Management

| Database | Engine | Location | Managed By | Purpose |
|---|---|---|---|---|
| **AlphaFlow / Hermes / Knowledge** | Neon PostgreSQL (+ pgvector) | Cloud (Neon) | Prisma ORM | Users, companies, accounting data, Hermes state, RAG embeddings |
| **TokenPay Access** | SQLite | `mini-services/tokenpay-access-service/data/access.db` | `bun:sqlite` | Proof files, access records, messages |
| **Scanner** | SQLite | `mini-services/scanner-service/data/scanner.db` | Python `sqlite3` | Scan results, content cache, audit trail |

### Host App — Neon PostgreSQL

Neon handles backups, replication, and scaling automatically. You can also:

- **View your data:** Use the Neon Console's SQL Editor or connect with any PostgreSQL client (e.g., `psql`, pgAdmin, DBeaver)
- **Branch your database:** Neon supports zero-downtime branching for testing schema changes
- **Reset the schema:** `bun run db:push -- --force-reset` (WARNING: deletes all data)

> **pgvector note:** the `KnowledgeChunk.embedding` column requires the `vector` extension. Run `scripts/setup-pgvector.sql` once before `db:push` (idempotent).

### SQLite Mini-Services

#### Backup

```bash
# TokenPay
cp mini-services/tokenpay-access-service/data/access.db \
   mini-services/tokenpay-access-service/data/access.db.backup-$(date +%Y%m%d)

# Scanner
cp mini-services/scanner-service/data/scanner.db \
   mini-services/scanner-service/data/scanner.db.backup-$(date +%Y%m%d)
```

#### Restore

```bash
pm2 stop tokenpay-access
cp mini-services/tokenpay-access-service/data/access.db.backup \
   mini-services/tokenpay-access-service/data/access.db
pm2 restart tokenpay-access
```

#### Reset (WARNING: deletes all data)

```bash
# The file is recreated from scratch on next startup
rm mini-services/tokenpay-access-service/data/access.db*
rm mini-services/scanner-service/data/scanner.db*
pm2 restart tokenpay-access scanner-service
```

> **Important:** Always stop the service before restoring or deleting the database file. The `-shm` and `-wal` files are SQLite's Write-Ahead Log companions — delete all of them together.

---

## 8. Troubleshooting

### TokenPay Access crashes on PM2 startup (most common issue)

If `pm2 status` shows `tokenpay-access` as **errored** or it keeps restarting:

**Step 1 — Check the error logs:**
```bash
pm2 logs tokenpay-access --lines 30 --err
```

**Step 2 — Most likely causes: stale SQLite files or missing `PROOF_ENCRYPTION_KEY`:**
```bash
# Missing key? The service refuses to start without PROOF_ENCRYPTION_KEY.
# Set it in the ecosystem.config.js env block (must match root .env).

# Stale files? Remove ALL SQLite files (database + WAL + SHM):
pm2 stop tokenpay-access
rm -f mini-services/tokenpay-access-service/data/access.db*
pm2 restart tokenpay-access
pm2 logs tokenpay-access --lines 10
# You should see: [DataLayer] Initialized at ./data/access.db (WAL mode)
```

**Step 3 — If it still fails, check for missing dependencies:**
```bash
cd mini-services/tokenpay-access-service && bun install && cd ../..
pm2 restart tokenpay-access
```

### Hermes agent answers nothing / "AI is unavailable"

1. **Check `OPENROUTER_API_KEY`** is set in the hermes-agent env block (PM2 does not load root `.env`)
2. **Check logs:** `pm2 logs hermes-agent --lines 50`
3. **Check the model name** (`OPENROUTER_MODEL`) exists and your OpenRouter account has credits
4. **Check rate limits** — per-tenant quotas are enforced by the agent; view usage in the oversight UI
5. **Test the handshake:** `curl "http://localhost:3004/socket.io/?EIO=4&transport=polling"`

### Knowledge service / RAG search fails

1. **pgvector not enabled** — run `psql "$DATABASE_URL" -f scripts/setup-pgvector.sql`, then `bun run db:push`
2. **Embedding key missing** — set `OPENAI_API_KEY` (preferred) or `OPENROUTER_API_KEY` in the env block
3. **Check health:** `curl -H "Authorization: Bearer $HERMES_ADMIN_KEY" http://localhost:3006/stats`
4. **Empty index** — run `bun scripts/seed-knowledge.ts` (requires the service running)

### Scanner service errors / OCR fails

```bash
# Health check (no auth)
curl http://localhost:3005/health
# "vlm_enabled": false  → OPENROUTER_API_KEY missing in the env block

# Check logs
pm2 logs scanner-service --lines 50

# Common causes:
# 1. Python venv not built          → cd mini-services/scanner-service && bash install.sh
# 2. Tesseract not installed        → sudo apt-get install -y tesseract-ocr tesseract-ocr-dan tesseract-ocr-eng
# 3. API key mismatch               → ensure SCANNER_API_KEY = API_SHARED_KEY
# 4. OpenRouter key missing         → VLM extraction disabled (text PDFs still work via PyMuPDF)
```

### E-invoices not sending (Sproom)

1. **Check `SPROOM_API_TOKEN`** is set (unset = simulation mode, nothing is really delivered)
2. **Check the API URL** — staging (`https://staging.sproom.net`) vs production (`https://sproom.net`); staging DB is reset twice a year (May 16 + Nov 16)
3. **Check webhooks** — `pm2 logs alphaflow | grep -i sproom`; verify `https://yourdomain.com/api/sproom/webhook` is registered in the Sproom dashboard
4. **Safety-net pollers** — the inbox (5 min) and outbox (10 min) schedulers catch missed webhooks; check `DISABLE_SPROOM_*` flags are not set
5. **Usage quota** — the plan's monthly e-invoice limit may be reached (check oversight or the plan prompt)

### Bank connections fail (Tink)

1. **Check `TINK_CLIENT_ID` / `TINK_CLIENT_SECRET`** (unset = sandbox stub mode)
2. **Check the redirect URI** registered in Tink Console matches `{APP_URL}/api/bank-connections/tink-callback` exactly (https, no trailing slash)
3. **Check consent expiry** — Tink consents expire (typically 90–180 days); users re-authorize via Tink Link

### App won't start — port in use

```bash
# Check what's using a port
sudo lsof -i :3000

# Kill the process
sudo kill <PID>
```

### Host App database errors (Neon PostgreSQL)

```bash
# Check that DATABASE_URL is set in .env
grep DATABASE_URL .env

# Re-sync the Prisma schema to Neon
bun run db:push

# Regenerate Prisma Client
bun run db:generate
```

### Build errors

```bash
# Clean everything and rebuild
rm -rf .next node_modules
bun install
bun run db:generate
bun run build
```

### Emails not sending

1. **Check SMTP credentials** — Verify `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` in `.env`
2. **Check PM2 logs** — `pm2 logs alphaflow | grep EMAIL`
3. **Check EmailLog table** — Query for `status: 'failed'` entries
4. **Verify APP_URL** — Must be your public URL, not `localhost`
5. **Check SMTP port** — Port 587 uses STARTTLS; port 465 uses implicit SSL
6. **Gmail specific** — Ensure you're using an App Password, not your account password

### "Unauthorized" errors from proxy routes

If the host app's proxy routes return `401 Unauthorized`:

1. **Check API key mismatch** — `TOKENPAY_API_KEY` must match `API_SHARED_KEY`; `SCANNER_API_KEY` must match the scanner's `API_SHARED_KEY`; `HERMES_ADMIN_KEY` must match hermes + knowledge services
2. **No trailing spaces** — Ensure no extra whitespace around the `=` in both files
3. **PM2 env takes precedence** — env vars in `ecosystem.config.js` override any `.env` file in the mini-service directory

### PM2 app keeps restarting

```bash
# Check error logs for any service
pm2 logs alphaflow --err --lines 50
pm2 logs hermes-agent --err --lines 50

# Common causes:
# 1. DATABASE_URL not set       → add Neon connection string to .env / env block
# 2. Stale SQLite files         → rm -f mini-services/*/data/*.db*
# 3. PROOF_ENCRYPTION_KEY unset → tokenpay-access refuses to start
# 4. Port conflict              → lsof -i :3000 (or the service's port)
# 5. Missing dependencies       → bun install / bash install.sh in the service dir
# 6. Invalid .env file          → check syntax (no spaces around =)
# 7. API key mismatch           → check the key pairs listed in §2.4
```

### Permission errors on Ubuntu

```bash
# Fix file ownership
sudo chown -R $USER:$USER /path/to/AlphaFlow

# Ensure the data directories are writable
chmod 755 mini-services/tokenpay-access-service/
chmod 755 mini-services/scanner-service/
```

### Caddy HTTPS not working

```bash
# Check Caddy status
sudo systemctl status caddy

# Check Caddy logs
sudo journalctl -u caddy -f

# Validate config
sudo caddy validate --config /etc/caddy/Caddyfile

# Ensure DNS is pointing to your server IP
dig yourdomain.com
```

---

## 9. Security Checklist

Before going live, ensure:

- [ ] `.env` is configured with a valid `DATABASE_URL` pointing to your Neon PostgreSQL database
- [ ] `scripts/setup-pgvector.sql` was run and `bun run db:push` succeeded (45 models)
- [ ] `bun run audit-immutable` succeeded (AuditLog immutability triggers applied)
- [ ] `ENCRYPTION_KEY` is set to a strong random value (bank tokens / backups / 2FA at rest)
- [ ] `PROOF_ENCRYPTION_KEY` is set (tokenpay-access will not start without it)
- [ ] Stale SQLite files were removed (`rm -f mini-services/*/data/*.db*`)
- [ ] `.env` is configured with real SMTP credentials (not using dev mode)
- [ ] `APP_URL` matches your public domain (https) — also used by Tink redirect URI
- [ ] `ALERT_EMAIL_RECIPIENT` is set to receive security digests + critical alerts
- [ ] All shared key pairs match (§2.4): TokenPay, Scanner, Hermes admin, Proof encryption
- [ ] `SPROOM_API_URL` points to production (`https://sproom.net`) and `SPROOM_WEBHOOK_REQUIRE_SIGNATURE=true`
- [ ] Sproom webhook registered: `https://yourdomain.com/api/sproom/webhook`
- [ ] Frisbii webhook registered: `https://yourdomain.com/api/subscription/payment-webhook`
- [ ] Tink redirect URI registered: `https://yourdomain.com/api/bank-connections/tink-callback`
- [ ] Firewall (ufw) allows only ports 22, 80, 443 (3000/3001/3004/3005/3006/3100 are internal only)
- [ ] SSH key authentication is configured (disable password login)
- [ ] Database files are not publicly accessible
- [ ] PM2 startup script is saved (`pm2 save && pm2 startup`)
- [ ] Caddy is enabled (`sudo systemctl enable caddy`) and configured with all `XTransformPort` routing blocks
- [ ] All six services show `online` in `pm2 status`
- [ ] `curl http://localhost:3100/health` returns `{"status":"ok"}`
- [ ] `curl http://localhost:3005/health` returns `{"status":"ok"}`
- [ ] Encrypted backups are running (check PM2 logs for `[BACKUP]` entries)
- [ ] ClamAV daemon is running (`sudo systemctl status clamav-daemon`)
- [ ] First user is promoted to SuperDev for oversight access
