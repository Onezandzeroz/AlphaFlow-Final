// PM2 Ecosystem Configuration for AlphaFlow + Mini Services
// Usage: pm2 start ecosystem.config.js
//
// PREREQUISITES:
//   1. bun run build
//   2. bun run db:push
//   3. cd mini-services/tokenpay-access-service && bun install
//   4. cd mini-services/hermes-agent && bun install   (runs prisma generate via postinstall)
//
// After config changes: pm2 delete all && pm2 start ecosystem.config.js
//
// Services:
//   1. alphaflow          — Next.js app on port 3000
//   2. notification-ws    — Notification WebSocket Service on port 3001
//   3. hermes-agent       — Hermes AI Agent Socket.IO service on port 3004
//   4. knowledge-service  — Knowledge RAG Service on port 3006
//   5. tokenpay-access    — TokenPay Access Service on port 3100

module.exports = {
  apps: [
    // ─── AlphaFlow (Next.js) ───────────────────────────────────────
    {
      name: 'alphaflow',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      // Set cwd to YOUR project root on the server
      // e.g. '/home/ubuntu/alphaflow' or '/var/www/alphaflow'
      cwd: process.cwd(),
      env: {
        NODE_ENV: 'production',
        // DATABASE_URL is loaded from .env.local — make sure it's set!
        // Example: postgresql://neondb_owner:xxx@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
        // ─── Hermes Oversight (per-tenant rate limits) ───
        // Shared secret to read live usage stats from hermes-agent's
        // /admin/stats endpoint. MUST match HERMES_ADMIN_KEY in the
        // hermes-agent env block below. Falls back to OPENROUTER_API_KEY.
        HERMES_ADMIN_KEY: '',
        HERMES_SERVICE_PORT: '3004',
      },
      // CRITICAL: Must use fork mode — cluster mode breaks Bun interpreter
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      // Memory limit — restart if exceeding 1.5GB
      max_memory_restart: '1500M',
      // Logging
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },

    // ─── Hermes Agent Service (Bun + Socket.IO) ─────────────────────
    {
      name: 'hermes-agent',
      script: 'index.ts',
      cwd: `${process.cwd()}/mini-services/hermes-agent`,
      interpreter: 'bun',
      env: {
        NODE_ENV: 'production',
        // DATABASE_URL is inherited from root .env via dotenv in the service code
        // If not auto-loaded, set it here explicitly:
        //DATABASE_URL: '',
        // ─── OpenRouter (REQUIRED for Hermes chat) ───
        // PM2 does NOT auto-load the root .env — set these here explicitly.
        // Get a key at https://openrouter.ai → Dashboard → Keys.
        // Free models: https://openrouter.ai/models?q=free
        OPENROUTER_API_KEY: '',
        OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
        OPENROUTER_MODEL: 'anthropic/claude-sonnet-4.5',
        // Used for OpenRouter dashboard attribution (HTTP-Referer / X-Title headers)
        OPENROUTER_APP_NAME: 'AlphaFlow',
        APP_URL: 'https://alphaflow.dk',
        // ─── Rate Limiting (oversight page) ───
        // Shared secret for the HTTP /admin/stats endpoint. MUST match
        // HERMES_ADMIN_KEY in the alphaflow app block above. If unset,
        // falls back to OPENROUTER_API_KEY (less secure — set explicitly).
        HERMES_ADMIN_KEY: '',
        // ─── RAG Knowledge Base ───
        // Port of the knowledge-service mini-service (for retrieval before LLM call).
        KNOWLEDGE_SERVICE_PORT: '3006',
      },
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      // Memory limit — Socket.IO + LLM streaming, 512MB should be plenty
      max_memory_restart: '512M',
      // Logging
      error_file: './logs/hermes-agent-error.log',
      out_file: './logs/hermes-agent-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },

    // ─── Knowledge Service (Bun + HTTP + pgvector) ──────────────────
    {
      name: 'knowledge-service',
      script: 'index.ts',
      cwd: `${process.cwd()}/mini-services/knowledge-service`,
      interpreter: 'bun',
      env: {
        NODE_ENV: 'production',
        PORT: '3006',
        // DATABASE_URL — REQUIRED. Must point to the same Neon PostgreSQL as the host app.
        // PM2 does NOT auto-load the root .env — set it here explicitly.
        DATABASE_URL: '',
        // Embedding API key — REQUIRED for semantic search (RAG).
        // Use either OpenAI or OpenRouter (same key as Hermes agent works).
        OPENROUTER_API_KEY: '',
        OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
        // Optional: use OpenAI embeddings instead of OpenRouter
        // OPENAI_API_KEY: '',
        // OPENAI_BASE_URL: 'https://api.openai.com/v1',
        // Auth key for the knowledge service API (shared with Hermes agent)
        // Defaults to OPENROUTER_API_KEY if not set.
        HERMES_ADMIN_KEY: '',
      },
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      max_memory_restart: '256M',
      // Logging
      error_file: './logs/knowledge-service-error.log',
      out_file: './logs/knowledge-service-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },

    // ─── TokenPay Access Service (Bun + Hono) ──────────────────────
    {
      name: 'tokenpay-access',
      script: 'index.ts',
      cwd: `${process.cwd()}/mini-services/tokenpay-access-service`,
      interpreter: 'bun',
      env: {
        NODE_ENV: 'production',
        PORT: '3100',
        // API_SHARED_KEY must match TOKENPAY_API_KEY in the host app's .env
        API_SHARED_KEY: '',
        // Webhook callback URL — the host app's endpoint for access change events
        HOST_CALLBACK_URL: 'https://alphaflow.dk/api/tokenpay/callback',
        // SQLite database path for the access service
        DATABASE_PATH: './data/access.db',
        // AES-256-GCM key (64-char hex) shared with TokenBay-ZIPProof for .tbkey decryption.
        // This MUST match the PROOF_ENCRYPTION_KEY in the root .env file and in TokenBay-ZIPProof.
        // Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
        // NOTE: pm2 reads env vars from this file — it does NOT inherit from the root .env.
        PROOF_ENCRYPTION_KEY: '', // <-- SET YOUR KEY HERE (or use pm2 set)
      },
      // CRITICAL: Must use fork mode — cluster mode breaks Bun and SQLite.
      // Bun does not support Node.js cluster module, and multiple workers
      // cannot share a single SQLite database file (WAL locking conflict).
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      // Memory limit — lighter service, 256MB is plenty
      max_memory_restart: '256M',
      // Logging
      error_file: './logs/tokenpay-access-error.log',
      out_file: './logs/tokenpay-access-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },

    // ─── Notification WebSocket Service (Bun + Socket.IO) ──────────
    {
      name: 'notification-ws',
      script: 'index.ts',
      cwd: `${process.cwd()}/mini-services/notification-ws-service`,
      interpreter: 'bun',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
      },
      // Single instance — Socket.IO state is in-memory
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      max_memory_restart: '128M',
      error_file: './logs/notification-ws-error.log',
      out_file: './logs/notification-ws-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  
    // ─── Scanner Service (Python + FastAPI + uvicorn) ──────────────
    {
      name: 'scanner-service',
      script: 'main.py',
      cwd: `${process.cwd()}/mini-services/scanner-service`,
      interpreter: `${process.cwd()}/mini-services/scanner-service/.venv/bin/python3`,
      env: {
        NODE_ENV: 'development',
        PORT: '3005',
        // API_SHARED_KEY must match SCANNER_API_KEY in the host app's .env
        API_SHARED_KEY: '',
        // ─── OpenRouter (REQUIRED for VLM extraction) ───────────────
        // Unified with Hermes — uses the SAME OPENROUTER_API_KEY.
        // This is now the single AI source for the whole app (chat + OCR).
        // Get a key at https://openrouter.ai → Dashboard → Keys.
        // Browse vision models: https://openrouter.ai/models?capabilities=image
        OPENROUTER_API_KEY: '',
        OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
        // Vision-capable model for invoice/receipt extraction. Default is
        // a strong general-purpose model; switch to a cheaper/free one if
        // cost is a concern (e.g. 'google/gemini-2.5-flash-preview').
        OPENROUTER_VLM_MODEL: 'anthropic/claude-sonnet-4.5',
        OPENROUTER_APP_NAME: 'AlphaFlow',
        APP_URL: 'https://alphaflow.dk',
        VLM_MAX_TOKENS: '4096',
        // SQLite database path
        DATABASE_PATH: './data/scanner.db',
        // Optional: webhook URL for async scan completion callbacks
        HOST_CALLBACK_URL: '',
        // Limits
        MAX_FILE_SIZE_MB: '10',
        MAX_PAGES: '10',
        // Tesseract language
        TESSERACT_LANG: 'dan+eng',
        // Logging
        LOG_LEVEL: 'info',
        // ── DEPRECATED (kept for backward compat only) ──
        // ANTHROPIC_API_KEY / ANTHROPIC_MODEL are no longer used.
        // If OPENROUTER_API_KEY is unset, ANTHROPIC_API_KEY is used as a
        // fallback key value — but the call still goes to OpenRouter.
        // Remove these from your .env when migration is complete.
        //ANTHROPIC_API_KEY: '',
        //ANTHROPIC_MODEL: 'claude-sonnet-4-20250514',
      },
      // Single worker — match other mini-services (SQLite WAL locking)
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      // Memory limit — OCR + VLM can be heavy, 512MB is a safe ceiling
      max_memory_restart: '512M',
      // Logging
      error_file: './logs/scanner-service-error.log',
      out_file: './logs/scanner-service-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};