// ============================================================
// index.ts — Hermes Agent Socket.IO Server
// ============================================================
// Clean entry point that wires together config, knowledge base,
// tenant provider, and utility modules into a running server.
// ============================================================

// MUST be the first import — loads root .env before other modules
// cache env vars at evaluation time. PM2 does NOT auto-load .env.
import './load-env'

import { createServer } from 'http'
import { Server } from 'socket.io'

import { defaultConfig, type HermesConfig } from './config'
import { buildSystemPrompt } from './knowledge-base'
import { MockTenantProvider, type TenantProvider, type TenantData } from './tenant-provider'
import { DatabaseTenantProvider } from './database-tenant-provider'
import { splitIntoChunks, buildTenantContext } from './utils'
import { getRateLimiter } from './rate-limiter'

// ─── Load parent .env if DATABASE_URL or OPENROUTER_API_KEY is not set ──
// (Now handled by load-env.ts above — kept as documentation.)
// PM2 does NOT auto-load the root .env file. When running
// under PM2 with cwd=mini-services/hermes-agent/, Bun
// only loads .env from that directory — not the project root.
// The load-env.ts module reads the parent .env and sets missing vars.

// ============================================================
// OpenRouter LLM Client
// ============================================================
// Hermes calls OpenRouter's OpenAI-compatible Chat Completions API
// so we can swap models (including free-tier) via a single env var.
// This replaces the sandbox-only z-ai-web-dev-sdk, which does NOT
// work outside this development sandbox.
//
// Docs: https://openrouter.ai/docs
// Free models: https://openrouter.ai/models?q=free
// ============================================================

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free'
const OPENROUTER_APP_NAME = process.env.OPENROUTER_APP_NAME || 'AlphaFlow'
const OPENROUTER_APP_URL = process.env.APP_URL || process.env.OPENROUTER_APP_URL || 'https://alphaflow.dk'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// ============================================================
// Typed LLM Errors
// ============================================================
// We throw a HermesLLMError (with a stable `kind`) from callOpenRouter
// so the chat handler can map each failure to a specific, actionable,
// user-facing message — instead of a generic "Prøv igen senere".
// The full technical detail is ALWAYS logged server-side for PM2 logs.
// ============================================================

export type LLMErrorKind =
  | 'missing_key'      // OPENROUTER_API_KEY not set (most common in fresh PM2 deploys)
  | 'unauthorized'     // 401 — key invalid/expired
  | 'rate_limited'     // 429 — quota exceeded or too many requests
  | 'model_not_found'  // 404 — model slug retired/renamed by OpenRouter
  | 'server_error'     // 5xx — OpenRouter upstream issue
  | 'network'          // fetch failed / DNS / timeout
  | 'unknown'

export class HermesLLMError extends Error {
  kind: LLMErrorKind
  status?: number
  // For 429s: seconds OpenRouter asked us to wait before retrying
  // (parsed from HTTP `Retry-After` header or JSON `error.metadata.retry_after_seconds`).
  retryAfterSeconds?: number
  constructor(kind: LLMErrorKind, message: string, status?: number, retryAfterSeconds?: number) {
    super(message)
    this.name = 'HermesLLMError'
    this.kind = kind
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

// Maps a thrown error (from fetch / our own checks) to a HermesLLMError.
function classifyLLMError(error: unknown): HermesLLMError {
  if (error instanceof HermesLLMError) return error

  const raw: any = error
  const msg: string = (raw?.message || String(raw)).toString()

  // Network / connectivity (fetch throws TypeError "fetch failed", ENOTFOUND, ECONNRESET, timeout)
  if (
    raw?.code === 'ENOTFOUND' || raw?.code === 'ECONNRESET' || raw?.code === 'ECONNREFUSED' ||
    raw?.name === 'TypeError' || /fetch failed|network|econn|etimedout|aborted/i.test(msg)
  ) {
    return new HermesLLMError('network', msg)
  }

  // HTTP status-coded errors we threw as "OpenRouter <status>: <body>"
  const m = msg.match(/OpenRouter\s+(\d{3}):/i)
  if (m) {
    const status = Number(m[1])
    if (status === 401 || status === 403) return new HermesLLMError('unauthorized', msg, status)
    if (status === 429) return new HermesLLMError('rate_limited', msg, status)
    if (status === 404) return new HermesLLMError('model_not_found', msg, status)
    if (status >= 500) return new HermesLLMError('server_error', msg, status)
    return new HermesLLMError('unknown', msg, status)
  }

  return new HermesLLMError('unknown', msg)
}

// User-facing (Danish) message per error kind. Kept actionable & non-technical.
function userMessageFor(kind: LLMErrorKind): string {
  switch (kind) {
    case 'missing_key':
      return 'AI-tjenesten er ikke konfigureret på serveren (manglende API-nøgle). Kontakt administratoren.'
    case 'unauthorized':
      return 'AI-nøglen er afvist af OpenRouter (401). Tjek at OPENROUTER_API_KEY er gyldig og aktiv.'
    case 'rate_limited':
      return 'AI-modellen er midlertidigt overbelastet (429). Automatisk genforsøg mislykkedes — vent et minut og prøv igen, eller skift OPENROUTER_MODEL til en anden model.'
    case 'model_not_found':
      return `AI-modellen findes ikke længere hos OpenRouter (404). Skift OPENROUTER_MODEL til en aktuel model fra openrouter.ai/models.`
    case 'server_error':
      return 'OpenRouter har midlertidige problemer (5xx). Prøv igen om et øjeblik.'
    case 'network':
      return 'Kan ikke kontakte OpenRouter. Tjek serverens internetforbindelse og firewall.'
    default:
      return 'Kunne ikke få svar fra Hermes. Prøv igen senere.'
  }
}

// ============================================================
// Retry Policy
// ============================================================
// OpenRouter's free-tier models (e.g. meta-llama/llama-3.3-70b-instruct:free)
// are served via upstream providers (Venice, etc.) and frequently return 429
// "temporarily rate-limited upstream". These are TRANSIENT — the response even
// includes `retry_after_seconds`. So we retry automatically:
//   - 429 rate_limited : honor retry_after_seconds (fallback: exponential)
//   - 5xx server_error : exponential backoff (1s, 2s, 4s)
//   - network/timeout  : exponential backoff (1s, 2s, 4s)
// Auth/key/model errors are NOT retried (they won't fix themselves).
// ============================================================

const MAX_RETRIES = 3              // Total attempts = 1 + MAX_RETRIES (so up to 4 requests)
const REQUEST_TIMEOUT_MS = 30_000  // Abort a single fetch after 30s
const MAX_BACKOFF_MS = 10_000      // Never wait longer than 10s between retries

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Parse retry-after hint from either the HTTP `Retry-After` header (delta-seconds
// form) or the OpenRouter JSON body field `error.metadata.retry_after_seconds`.
function parseRetryAfter(res: Response, bodyText: string): number | undefined {
  // 1. HTTP Retry-After header (delta-seconds form)
  const headerVal = res.headers.get('retry-after')
  if (headerVal) {
    const secs = parseInt(headerVal, 10)
    if (!isNaN(secs) && secs >= 0) return secs
  }
  // 2. OpenRouter JSON body: error.metadata.retry_after_seconds
  try {
    const body = JSON.parse(bodyText)
    const secs = body?.error?.metadata?.retry_after_seconds
    if (typeof secs === 'number' && secs >= 0) return Math.ceil(secs)
  } catch {
    // body wasn't JSON or had an unexpected shape — ignore
  }
  return undefined
}

async function callOpenRouter(messages: ChatMessage[]): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    throw new HermesLLMError(
      'missing_key',
      'OPENROUTER_API_KEY er ikke sat — Hermes kan ikke tilkalde en LLM. Sæt den i .env / PM2 env (ecosystem.config.js -> hermes-agent -> env).'
    )
  }

  let lastError: HermesLLMError | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const isLastAttempt = attempt === MAX_RETRIES

    try {
      // ---- Single request attempt (with timeout) ----
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

      let res: Response
      try {
        res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            // OpenRouter uses these for ranking/dashboard attribution
            'HTTP-Referer': OPENROUTER_APP_URL,
            'X-Title': OPENROUTER_APP_NAME,
          },
          body: JSON.stringify({
            model: OPENROUTER_MODEL,
            messages,
            temperature: 0.4,
            max_tokens: 1024,
          }),
        })
      } catch (fetchErr: any) {
        // fetch() throws on network/DNS/timeout/abort — normalize into HermesLLMError
        throw classifyLLMError(fetchErr)
      } finally {
        clearTimeout(timeout)
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText)
        // Build a typed error; enrich 429s with the retry-after hint so the
        // retry loop below can honor it.
        const typed = classifyLLMError(new Error(`OpenRouter ${res.status}: ${errText}`))
        if (typed.kind === 'rate_limited') {
          typed.retryAfterSeconds = parseRetryAfter(res, errText)
        }
        throw typed
      }

      const data = await res.json()
      return data.choices?.[0]?.message?.content || 'Beklager, jeg kunne ikke generere et svar.'

    } catch (err) {
      const typed = err instanceof HermesLLMError ? err : classifyLLMError(err)
      lastError = typed

      // Only transient errors are retried — auth/key/model/config errors
      // won't resolve by repeating the same request.
      const retriable: LLMErrorKind[] = ['rate_limited', 'server_error', 'network']
      const shouldRetry = !isLastAttempt && retriable.includes(typed.kind)

      if (!shouldRetry) {
        throw typed
      }

      // Calculate backoff:
      //  - 429: honor OpenRouter's retry_after_seconds (fallback to exponential)
      //  - 5xx / network: exponential backoff 1s, 2s, 4s
      let waitMs: number
      if (typed.kind === 'rate_limited' && typed.retryAfterSeconds != null) {
        waitMs = typed.retryAfterSeconds * 1000
      } else {
        waitMs = Math.pow(2, attempt) * 1000
      }
      waitMs = Math.min(waitMs, MAX_BACKOFF_MS)

      console.log(
        `[Hermes] [${typed.kind}]${typed.status ? ` (HTTP ${typed.status})` : ''} on attempt ${attempt + 1}/${MAX_RETRIES + 1}` +
        (typed.retryAfterSeconds ? ` (retry_after=${typed.retryAfterSeconds}s)` : '') +
        ` — retrying in ${(waitMs / 1000).toFixed(1)}s...`
      )

      await sleep(waitMs)
    }
  }

  // Unreachable (loop throws on the last attempt), but keeps TS happy.
  throw lastError ?? new HermesLLMError('unknown', 'Unknown LLM error after retries')
}

// --------------- Configuration ---------------

const config: HermesConfig = { ...defaultConfig }

// --------------- Tenant Provider ---------------

// Use DatabaseTenantProvider for production (connects to real PostgreSQL)
// Falls back to MockTenantProvider if DATABASE_URL is not set
const USE_DATABASE = !!process.env.DATABASE_URL
const tenantProvider: TenantProvider = USE_DATABASE
  ? new DatabaseTenantProvider()
  : new MockTenantProvider()
console.log(`[Hermes] Using ${USE_DATABASE ? 'Database' : 'Mock'} tenant provider`)

// --------------- Fallback Tenant Cache ---------------
// When getTenant() returns null (unknown CUID, DB miss, or Mock mode with
// a real tenant ID), we create a friendly default tenant and CACHE it so
// that the join and chat handlers stay consistent within a session.
//
// Previously the join handler created a local default that was never
// persisted back to the provider, so the chat handler's getTenant()
// returned null again and emitted "Unknown tenant: <CUID>" — a confusing,
// non-human-readable error that blocked all chat.
const defaultTenantCache = new Map<string, TenantData>()

async function getOrCreateTenant(tenantId: string): Promise<{ tenant: TenantData; isFallback: boolean }> {
  const real = await tenantProvider.getTenant(tenantId)
  if (real) return { tenant: real, isFallback: false }

  let fallback = defaultTenantCache.get(tenantId)
  if (!fallback) {
    fallback = createDefaultTenant(tenantId)
    defaultTenantCache.set(tenantId, fallback)
    console.log(`[Hermes] Tenant ikke fundet i provider — bruger venlige standardværdier (CUID: ${tenantId})`)
  }
  return { tenant: fallback, isFallback: true }
}

// --------------- In-Memory Socket State ---------------

interface SocketMeta {
  socketId: string
  tenantId: string
  userId: string
  userName: string
}

const connectedSockets = new Map<string, SocketMeta>()   // socketId -> meta
const tenantSockets = new Map<string, string[]>()         // tenantId -> [socketId, ...]

// --------------- Rate Limiter (per-tenant) ---------------

const rateLimiter = getRateLimiter()

// Shared secret for the HTTP /admin/stats endpoint (used by the Next.js
// oversight API). Falls back to OPENROUTER_API_KEY if not set.
const HERMES_ADMIN_KEY = process.env.HERMES_ADMIN_KEY || process.env.OPENROUTER_API_KEY || ''

// --------------- Socket.IO Server ---------------

const httpServer = createServer()
const io = new Server(httpServer, {
  // Use default Socket.IO path '/socket.io/' to match the client.
  // Client connects via: /socket.io/?EIO=4&transport=...&XTransformPort=3004
  // Caddy matches XTransformPort=3004 and proxies to this service.
  cors: {
    origin: config.corsOrigin,
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// ============================================================
// Connection Handler
// ============================================================

io.on('connection', (socket) => {
  console.log(`[Hermes] Socket connected: ${socket.id}`)

  // ----- join -----
  socket.on('join', async (data: { tenantId: string; userId: string; userName: string }) => {
    const { tenantId, userId, userName } = data
    console.log(`[Hermes] User "${userName}" (${userId}) joining tenant "${tenantId}"`)

    // Register socket
    const meta: SocketMeta = { socketId: socket.id, tenantId, userId, userName }
    connectedSockets.set(socket.id, meta)

    // Track per-tenant
    if (!tenantSockets.has(tenantId)) tenantSockets.set(tenantId, [])
    tenantSockets.get(tenantId)!.push(socket.id)

    // Get or create tenant (cached fallback keeps join + chat consistent)
    const { tenant, isFallback } = await getOrCreateTenant(tenantId)

    // Sync the enabled cache so subsequent isAgentEnabled() calls
    // (e.g. from checkReminders) return the correct value.
    tenantProvider.setAgentEnabled(tenantId, tenant.agentEnabled)

    // Acknowledge join — use tenant.agentEnabled directly instead of
    // isAgentEnabled() which can return false on cache miss even when
    // the tenant data was just fetched successfully.
    socket.emit('join-ack', {
      status: 'joined',
      agentEnabled: tenant.agentEnabled,
      tenantName: tenant.name,
    })

    // If agent is enabled, send welcome
    if (tenant.agentEnabled) {
      // Friendly welcome — only mention the company name when we actually
      // know it (a real DB-backed tenant). For fallback tenants we use a
      // generic greeting so the user never sees a raw CUID like
      // "cmqwqfxld0006jxua9q4sqf1r".
      const welcomeMessage = isFallback
        ? `Hej ${userName}! 👋 Jeg er ${config.agentName}, din AI-regnskabskonsulent. Hvad kan jeg hjælpe dig med i dag?`
        : `Hej ${userName}! 👋 Jeg er ${config.agentName}, din AI-regnskabskonsulent for ${tenant.name}. Hvad kan jeg hjælpe dig med i dag?`
      socket.emit('agent-welcome', {
        message: welcomeMessage,
        tenantName: tenant.name,
      })
    }

    // Send pending notifications
    const pendingNotifs = tenantProvider.getReminders(tenantId).filter(n => !n.dismissed)
    if (pendingNotifs.length > 0) {
      socket.emit('notifications', pendingNotifs.map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        description: n.description,
        dueDate: n.dueDate,
      })))
    }
  })

  // ----- chat -----
  socket.on('chat', async (data: { tenantId: string; message: string }) => {
    const { tenantId, message } = data
    const meta = connectedSockets.get(socket.id)

    if (!meta || meta.tenantId !== tenantId) {
      socket.emit('chat-error', { error: 'Din session er udløbet. Genindlæs venligst siden for at bruge Hermes igen.' })
      return
    }

    // Reuse the same cached fallback as join — never error on unknown tenant
    const { tenant } = await getOrCreateTenant(tenantId)

    console.log(`[Hermes] Chat from "${meta.userName}" in "${tenant.name}": ${message.slice(0, 80)}...`)

    // ─── Per-tenant rate limit check ───
    // Enforced BEFORE storing the message or calling the LLM, so denied
    // requests don't consume the tenant's quota or OpenRouter budget.
    const rl = await rateLimiter.check(tenantId)
    if (!rl.allowed) {
      const windowLabel =
        rl.window === 'minute' ? 'per minut' :
        rl.window === 'hour' ? 'i timen' :
        rl.window === 'day' ? 'i dag' : 'denne måned'
      const retryMin = rl.retryAfterSeconds != null
        ? Math.max(1, Math.ceil(rl.retryAfterSeconds / 60))
        : 1
      console.log(
        `[Hermes] Rate limit DENIED for "${meta.userName}" (${tenant.name}) — ` +
        `window=${rl.window} used=${rl.used}/${rl.limit} retry_after=${rl.retryAfterSeconds}s`
      )
      socket.emit('chat-error', {
        error: `Du har nået grænsen for Hermes (${rl.used}/${rl.limit} ${windowLabel}). Prøv igen om ca. ${retryMin} min.`,
        kind: 'rate_limited_tenant',
      })
      return
    }

    // Store user message
    tenantProvider.addMessage(tenantId, { role: 'user', content: message })

    // Emit typing indicator
    socket.emit('chat-typing', { typing: true })

    try {
      // Build conversation history for context
      const history = tenantProvider.getConversationHistory(tenantId).slice(-config.maxConversationHistory)

      // Build OpenRouter/OpenAI-compatible message array with proper roles.
      // System prompt + tenant context go in the system message; history is
      // replayed as real user/assistant turns so the model understands the
      // conversation flow (this works far better than stuffing everything
      // into a single assistant message).
      const systemPrompt = buildSystemPrompt(config.agentName, config.defaultLanguage)
      const tenantContext = buildTenantContext(tenant)
      const systemMessage = `${systemPrompt}\n\n${tenantContext}`

      const messages: ChatMessage[] = [
        { role: 'system', content: systemMessage },
        ...history.map(msg => ({
          role: (msg.role === 'user' ? 'user' : 'assistant') as ChatMessage['role'],
          content: msg.content,
        })),
        { role: 'user', content: message },
      ]

      // Call OpenRouter LLM
      const fullResponse = await callOpenRouter(messages)

      // Store assistant response
      tenantProvider.addMessage(tenantId, { role: 'assistant', content: fullResponse })

      // Simulate streaming
      const chunks = splitIntoChunks(fullResponse, config.streamingChunkSize)
      for (const chunk of chunks) {
        socket.emit('chat-response', { chunk, done: false })
        await new Promise(resolve => setTimeout(resolve, config.streamingChunkDelay))
      }

      socket.emit('chat-complete', { fullResponse, done: true })

      // Count this successful request against the tenant's rate-limit windows.
      // Only successful responses consume quota — failed/429'd requests don't.
      rateLimiter.record(tenantId)

      console.log(`[Hermes] Response sent to "${meta.userName}" (${fullResponse.length} chars)`)
    } catch (error: any) {
      // Classify the failure into a typed kind so the user gets a specific,
      // actionable message instead of a generic "Prøv igen senere".
      // The full technical detail is ALWAYS logged server-side (PM2 logs).
      // (If the error came from callOpenRouter it already went through the
      //  retry loop — up to MAX_RETRIES+1 attempts — before giving up.)
      const llmErr = classifyLLMError(error)
      const userMsg = userMessageFor(llmErr.kind)
      console.error(
        `[Hermes] LLM Error [${llmErr.kind}]` +
        `${llmErr.status ? ` (HTTP ${llmErr.status})` : ''}` +
        `${llmErr.retryAfterSeconds != null ? ` (retry_after=${llmErr.retryAfterSeconds}s)` : ''}` +
        ` — gave up after retries:`,
        error?.message || error
      )
      socket.emit('chat-error', { error: userMsg, kind: llmErr.kind })
    }
  })

  // ----- toggle-agent -----
  socket.on('toggle-agent', (data: { tenantId: string; enabled: boolean }) => {
    const { tenantId, enabled } = data
    const meta = connectedSockets.get(socket.id)

    if (!meta || meta.tenantId !== tenantId) {
      socket.emit('chat-error', { error: 'Din session er udløbet. Genindlæs venligst siden for at bruge Hermes igen.' })
      return
    }

    tenantProvider.setAgentEnabled(tenantId, enabled)
    console.log(`[Hermes] Agent ${enabled ? 'enabled' : 'disabled'} for tenant "${tenantId}" by "${meta.userName}"`)

    // Broadcast to all sockets for this tenant
    const socketIds = tenantSockets.get(tenantId) || []
    for (const sid of socketIds) {
      io.to(sid).emit('agent-status', { agentEnabled: enabled, changedBy: meta.userName })
    }
  })

  // ----- dismiss-notification -----
  socket.on('dismiss-notification', (data: { notificationId: string }) => {
    const { notificationId } = data
    const meta = connectedSockets.get(socket.id)
    if (!meta) return

    tenantProvider.dismissReminder(meta.tenantId, notificationId)
    console.log(`[Hermes] Notification "${notificationId}" dismissed by "${meta.userName}"`)
    socket.emit('notification-dismissed', { notificationId })
  })

  // ----- disconnect -----
  socket.on('disconnect', () => {
    const meta = connectedSockets.get(socket.id)
    if (meta) {
      console.log(`[Hermes] User "${meta.userName}" disconnected from tenant "${meta.tenantId}"`)

      const socketIds = tenantSockets.get(meta.tenantId) || []
      const updated = socketIds.filter(sid => sid !== socket.id)
      if (updated.length > 0) {
        tenantSockets.set(meta.tenantId, updated)
      } else {
        tenantSockets.delete(meta.tenantId)
        defaultTenantCache.delete(meta.tenantId) // clean up fallback cache
      }
      connectedSockets.delete(socket.id)
    } else {
      console.log(`[Hermes] Unknown socket disconnected: ${socket.id}`)
    }
  })

  // ----- error -----
  socket.on('error', (error) => {
    console.error(`[Hermes] Socket error (${socket.id}):`, error)
  })
})

// ============================================================
// Proactive Reminder System
// ============================================================

function startReminderSystem() {
  const timer = setInterval(checkReminders, config.reminderCheckInterval)
  console.log(`[Hermes] Proactive reminder system started (every ${config.reminderCheckInterval / 1000}s, ${config.reminderWindowDays}-day window)`)
  return timer
}

async function checkReminders() {
  const now = new Date()
  const windowDate = new Date(now)
  windowDate.setDate(windowDate.getDate() + config.reminderWindowDays)
  const todayStr = now.toISOString().split('T')[0]

  // Iterate over all connected tenants
  for (const tenantId of tenantSockets.keys()) {
    const tenant = await tenantProvider.getTenant(tenantId)
    if (!tenant) continue

    const activeNotifs = tenantProvider.getReminders(tenantId).filter(n => !n.dismissed)
    for (const notif of activeNotifs) {
      const dueDate = new Date(notif.dueDate)
      if (dueDate <= windowDate && dueDate >= new Date(todayStr)) {
        const socketIds = tenantSockets.get(tenantId) || []
        for (const sid of socketIds) {
          io.to(sid).emit('notification', {
            type: notif.type,
            title: notif.title,
            description: notif.description,
            dueDate: notif.dueDate,
            id: notif.id,
          })
        }
        if (socketIds.length > 0) {
          console.log(`[Hermes] Proactive reminder sent for "${notif.title}" to ${socketIds.length} socket(s) in "${tenant.name}"`)
        }
      }
    }
  }
}

const reminderTimer = startReminderSystem()

// ============================================================
// Default Tenant Factory
// ============================================================

function createDefaultTenant(tenantId: string): TenantData {
  return {
    tenantId,
    name: 'din virksomhed',
    cvr: '00000000',
    industry: 'Ukendt',
    members: [],
    accounting: {
      currentBalance: 0,
      recentIncome: [],
      recentExpenses: [],
      vatStatus: 'monthly',
      vatRate: 0.25,
      lastVatPeriod: '',
      nextVatDeadline: '',
      yearlyReportDeadline: '',
      fiscalYearStart: '',
      monthsOfData: 0,
    },
    agentEnabled: true,
    dataAccessEnabled: false,
    notifications: [],
    conversationHistory: [],
  }
}

// ============================================================
// HTTP Admin Endpoints (for the App Owner oversight page)
// ============================================================
// Socket.IO only handles /socket.io/ requests. We add a plain HTTP
// request handler for /admin/stats so the Next.js oversight API
// (requireSuperDev) can read live per-tenant usage counters.
//
// Auth: shared secret via Authorization: Bearer <HERMES_ADMIN_KEY>.
// HERMES_ADMIN_KEY falls back to OPENROUTER_API_KEY if unset.
// ============================================================

httpServer.on('request', async (req, res) => {
  // Only handle /admin/* paths; ignore everything else (incl. /socket.io/)
  const url = req.url || ''
  if (!url.startsWith('/admin/')) return

  // ─── Auth ───
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!HERMES_ADMIN_KEY || token !== HERMES_ADMIN_KEY) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Unauthorized — invalid or missing admin key' }))
    return
  }

  // ─── GET /admin/stats — all tenants' usage + config ───
  if (url.startsWith('/admin/stats') && req.method === 'GET') {
    try {
      const usage = await rateLimiter.getAllUsage()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ tenants: usage }))
    } catch (err: any) {
      console.error('[Hermes] /admin/stats error:', err.message || err)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Internal server error' }))
    }
    return
  }

  // ─── GET /admin/stats/:tenantId — single tenant usage ───
  const singleMatch = url.match(/^\/admin\/stats\/([^/?]+)/)
  if (singleMatch && req.method === 'GET') {
    try {
      const usage = await rateLimiter.getUsage(decodeURIComponent(singleMatch[1]))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(usage))
    } catch (err: any) {
      console.error('[Hermes] /admin/stats/:tenantId error:', err.message || err)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Internal server error' }))
    }
    return
  }

  // ─── POST /admin/invalidate — clear config cache for a tenant ───
  // Called by the Next.js API after updating a tenant's limits, so the
  // new config is picked up within seconds instead of waiting 60s.
  if (url.startsWith('/admin/invalidate') && req.method === 'POST') {
    try {
      let body = ''
      for await (const chunk of req) body += chunk
      const { tenantId } = JSON.parse(body || '{}')
      if (typeof tenantId === 'string') {
        rateLimiter.invalidateConfig(tenantId)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true }))
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing tenantId' }))
      }
    } catch (err: any) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid JSON body' }))
    }
    return
  }

  // Unknown /admin/* path
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

// ============================================================
// Start Server
// ============================================================

httpServer.listen(config.port, () => {
  console.log(`[Hermes] 🏛️  ${config.agentName} Agent service running on port ${config.port}`)
  console.log(`[Hermes]    LLM provider : OpenRouter (${OPENROUTER_BASE_URL})`)
  console.log(`[Hermes]    Model        : ${OPENROUTER_MODEL}`)
  if (OPENROUTER_API_KEY) {
    console.log(`[Hermes]    API key set? : yes`)
  } else {
    console.log(`[Hermes]    API key set? : NO — chat will fail with "missing_key" until OPENROUTER_API_KEY is set.`)
    console.log(`[Hermes]                   PM2 does NOT auto-load root .env — set it explicitly in`)
    console.log(`[Hermes]                   ecosystem.config.js -> apps[hermes-agent] -> env.OPENROUTER_API_KEY`)
    console.log(`[Hermes]                   Get a key at https://openrouter.ai/keys  (then: pm2 delete hermes-agent && pm2 start ecosystem.config.js --only hermes-agent)`)
  }
})

// ============================================================
// Graceful Shutdown
// ============================================================

function shutdown(signal: string) {
  console.log(`[Hermes] Received ${signal}, shutting down...`)
  clearInterval(reminderTimer)
  httpServer.close(() => {
    console.log('[Hermes] Server closed')
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
