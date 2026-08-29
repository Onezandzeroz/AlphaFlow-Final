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
import { buildSystemPrompt, type ResponseMode } from './knowledge-base'
import { fetchSkillPrompts, buildSkillsAwareness } from './skills-loader'
import { MockTenantProvider, type TenantProvider, type TenantData } from './tenant-provider'
import { DatabaseTenantProvider } from './database-tenant-provider'
import { splitIntoChunks, buildTenantContext } from './utils'
import { getRateLimiter } from './rate-limiter'
import { verifySession } from './session-verifier'
import {
  SOURCE_TOOL_DEFINITIONS,
  executeSourceTool,
  buildCodeAtlas,
  MAX_TOOL_ITERATIONS,
  type ToolCall,
} from './source-tools'

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
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string
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

async function callOpenRouter(messages: ChatMessage[], options?: { tools?: typeof SOURCE_TOOL_DEFINITIONS, maxTokens?: number }): Promise<{ content: string | null; toolCalls: ToolCall[] | null }> {
  const { tools, maxTokens = 1024 } = options || {}
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
            max_tokens: maxTokens,
            ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
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
      const choice = data.choices?.[0]?.message
      const finishReason = data.choices?.[0]?.finish_reason
      // When tool calls are present, the model returns tool_calls instead of content
      if (choice?.tool_calls?.length > 0) {
        return { content: choice.content ?? null, toolCalls: choice.tool_calls }
      }
      // Log when model returns null/empty content so we can diagnose issues
      if (!choice?.content) {
        console.warn(`[Hermes] LLM returned null/empty content (finish_reason: ${finishReason}). Model: ${OPENROUTER_MODEL}`)
      }
      return { content: choice?.content ?? null, toolCalls: null }

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

// ============================================================
// Streaming LLM Call (real SSE — emits tokens as they arrive)
// ============================================================
// This is the streaming variant of callOpenRouter, used for the plain chat
// path (no tool-calling). Instead of waiting for the full response and then
// dripping it in fake chunks, it reads the OpenRouter SSE stream and calls
// `onChunk` for each delta as the model generates it. This cuts perceived
// "thinking" latency from full-generation-time to time-to-first-token (~1-2s).
//
// Retry policy: same as callOpenRouter for pre-connection errors (429, 5xx,
// network). BUT once any chunks have been emitted, retries are suppressed —
// returning partial content is better than duplicating the start of a response.
// ============================================================

async function callOpenRouterStream(
  messages: ChatMessage[],
  onChunk: (delta: string) => void,
  options?: { maxTokens?: number },
): Promise<string> {
  const { maxTokens = 2048 } = options || {}
  if (!OPENROUTER_API_KEY) {
    throw new HermesLLMError(
      'missing_key',
      'OPENROUTER_API_KEY er ikke sat — Hermes kan ikke tilkalde en LLM. Sæt den i .env / PM2 env (ecosystem.config.js -> hermes-agent -> env).'
    )
  }

  let lastError: HermesLLMError | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const isLastAttempt = attempt === MAX_RETRIES
    let emittedAny = false
    let accumulated = ''

    try {
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
            'HTTP-Referer': OPENROUTER_APP_URL,
            'X-Title': OPENROUTER_APP_NAME,
          },
          body: JSON.stringify({
            model: OPENROUTER_MODEL,
            messages,
            temperature: 0.4,
            max_tokens: maxTokens,
            stream: true,
          }),
        })
      } catch (fetchErr: any) {
        throw classifyLLMError(fetchErr)
      }

      if (!res.ok) {
        clearTimeout(timeout)
        const errText = await res.text().catch(() => res.statusText)
        const typed = classifyLLMError(new Error(`OpenRouter ${res.status}: ${errText}`))
        if (typed.kind === 'rate_limited') {
          typed.retryAfterSeconds = parseRetryAfter(res, errText)
        }
        throw typed
      }

      if (!res.body) {
        clearTimeout(timeout)
        throw new HermesLLMError('server_error', 'No response body from OpenRouter stream')
      }

      // ── Parse the SSE stream ────────────────────────────────────────
      // OpenRouter sends `data: {json}\n\n` lines, terminated by `data: [DONE]`.
      // Each JSON object has choices[0].delta.content with the next token(s).
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // SSE events are separated by \n\n. Split on newlines and process
          // complete `data:` lines; keep the trailing partial line in buffer.
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith('data:')) continue

            const data = trimmed.slice(5).trim()
            if (data === '[DONE]') {
              clearTimeout(timeout)
              return accumulated
            }

            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta?.content
              if (delta) {
                emittedAny = true
                accumulated += delta
                onChunk(delta)
              }
            } catch {
              // Malformed/partial JSON — skip; the next read will complete it
            }
          }
        }
        // Stream ended without [DONE] marker — return what we accumulated
        clearTimeout(timeout)
        return accumulated
      } finally {
        clearTimeout(timeout)
      }

    } catch (err) {
      const typed = err instanceof HermesLLMError ? err : classifyLLMError(err)
      lastError = typed

      // Once we've emitted chunks to the client, do NOT retry — a retry would
      // duplicate the beginning of the response. Return the partial content.
      if (emittedAny) {
        console.warn(
          `[Hermes] Stream error after partial output (${typed.kind}) — ` +
          `returning ${accumulated.length} chars of partial content`
        )
        return accumulated
      }

      const retriable: LLMErrorKind[] = ['rate_limited', 'server_error', 'network']
      const shouldRetry = !isLastAttempt && retriable.includes(typed.kind)
      if (!shouldRetry) {
        throw typed
      }

      let waitMs: number
      if (typed.kind === 'rate_limited' && typed.retryAfterSeconds != null) {
        waitMs = typed.retryAfterSeconds * 1000
      } else {
        waitMs = Math.pow(2, attempt) * 1000
      }
      waitMs = Math.min(waitMs, MAX_BACKOFF_MS)

      console.log(
        `[Hermes] [${typed.kind}]${typed.status ? ` (HTTP ${typed.status})` : ''} on stream attempt ${attempt + 1}/${MAX_RETRIES + 1}` +
        (typed.retryAfterSeconds ? ` (retry_after=${typed.retryAfterSeconds}s)` : '') +
        ` — retrying in ${(waitMs / 1000).toFixed(1)}s...`
      )

      await sleep(waitMs)
    }
  }

  throw lastError ?? new HermesLLMError('unknown', 'Unknown streaming error after retries')
}

// ============================================================
// Tool-Calling Loop
// ============================================================
// When the LLM returns tool_calls, we execute them and re-prompt
// the model with the tool results. This repeats until the model
// returns a final text response or hits MAX_TOOL_ITERATIONS.
// ============================================================

async function chatWithTools(
  messages: ChatMessage[],
  tools: typeof SOURCE_TOOL_DEFINITIONS,
  isSuperDev: boolean,
): Promise<string> {
  let currentMessages = [...messages]
  let toolsUsedCount = 0

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const isLastIteration = iteration === MAX_TOOL_ITERATIONS - 1
    // Use higher token limit for the last iteration so the model has room
    // to synthesize tool results into a full answer.
    const result = await callOpenRouter(currentMessages, {
      tools,
      maxTokens: isLastIteration ? 4096 : 2048,
    })

    // Model returned a final text response (no tool calls)
    if (!result.toolCalls || result.toolCalls.length === 0) {
      if (result.content) {
        return result.content
      }

      // Model returned null/empty content with no tool calls.
      // This can happen when:
      //   a) Model doesn't support function calling — first iteration, no tools used
      //   b) Model is confused after tool execution — tools were used but response is empty
      console.warn(`[Hermes] Null content, no tool calls on iteration ${iteration + 1} (tools used so far: ${toolsUsedCount})`)

      if (iteration === 0 && toolsUsedCount === 0) {
        // Likely the model doesn't support function calling.
        // Fall back to a plain call WITHOUT tools.
        console.log('[Hermes] Falling back to no-tools call (model may not support function calling)')
        const fallback = await callOpenRouter(currentMessages, { maxTokens: 4096 })
        if (fallback.content) return fallback.content
        // Still null — one more attempt with an explicit system nudge
        currentMessages.push({
          role: 'user',
          content: 'Besvar venligst brugerens spørgsmål så detaljeret som muligt på dansk.',
        })
        const nudge = await callOpenRouter(currentMessages, { maxTokens: 4096 })
        return nudge.content || 'Beklager, jeg kunne ikke generere et svar.'
      }

      if (toolsUsedCount > 0) {
        // Tools were executed but model returned null content.
        // Add a nudge to force the model to produce a text answer.
        console.log('[Hermes] Nudging model to produce text response after tool execution')
        currentMessages.push({
          role: 'user',
          content: 'Du har nu modtaget alle nødvendige oplysninger fra værktøjerne. Besvar brugerens oprindelige spørgsmål detaljeret på dansk baseret på det du har fundet. Husk: Vis ALDRIG kode eller filstier. Skriv i løbende prosa med overskrifter — brug punktopstillinger med måde. Forklar i almindeligt sprog hvordan AlphaFlow opfylder kravet i henhold til dansk bogføringslovgivning.',
        })
        const nudge = await callOpenRouter(currentMessages, { maxTokens: 4096 })
        if (nudge.content) return nudge.content
        return 'Beklager, jeg kunne ikke generere et svar efter at have undersøgt kildekoden.'
      }

      return 'Beklager, jeg kunne ikke generere et svar.'
    }

    // Append the assistant's tool-calling message to the conversation
    currentMessages.push({
      role: 'assistant',
      content: result.content || '',
      tool_calls: result.toolCalls,
    })

    // Execute each tool call and append results
    for (const toolCall of result.toolCalls) {
      toolsUsedCount++
      const toolName = toolCall.function.name
      const toolArgs = toolCall.function.arguments

      console.log(`[Hermes] Tool call [${iteration + 1}/${MAX_TOOL_ITERATIONS}]: ${toolName}(${toolArgs.slice(0, 80)}...)`)

      const toolResult = await executeSourceTool(toolName, toolArgs, isSuperDev)

      console.log(`[Hermes] Tool result: ${toolResult.content.slice(0, 120)}...${toolResult.isError ? ' (ERROR)' : ''}`)

      currentMessages.push({
        role: 'tool',
        content: toolResult.content,
        tool_call_id: toolCall.id,
        name: toolName,
      })
    }
  }

  // Max iterations reached — do one final call WITHOUT tools to force a text response
  console.log(`[Hermes] Max tool iterations (${MAX_TOOL_ITERATIONS}) reached — requesting final text response`)
  const finalResult = await callOpenRouter(currentMessages, { maxTokens: 4096 })
  if (finalResult.content) return finalResult.content
  // Last resort: nudge the model
  currentMessages.push({
    role: 'user',
    content: 'Besvar brugerens spørgsmål detaljeret på dansk baseret på de oplysninger du har indsamlet. Husk: Vis ALDRIG kode eller filstier. Skriv i løbende prosa med overskrifter — brug punktopstillinger med måde. Forklar i almindeligt sprog med fokus på dansk bogføringslovgivning.',
  })
  const nudgeResult = await callOpenRouter(currentMessages, { maxTokens: 4096 })
  return nudgeResult.content || 'Beklager, jeg kunne ikke generere et svar efter at have undersøgt kildekoden.'
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
  isSuperDev: boolean
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
// Dynamic Welcome Generator
// ============================================================
// Instead of a hardcoded static greeting (which piled up on every reconnect),
// this calls the LLM to produce a short, contextual, varied welcome message.
// Context includes: time of day, tenant name/industry, pending reminders,
// and the current response mode (simplified vs complex).

async function generateWelcome(
  tenant: TenantData,
  userName: string,
  mode: ResponseMode,
): Promise<string> {
  const hour = new Date().getHours()
  const greeting =
    hour < 6 ? 'god nat' : hour < 12 ? 'god morgen' : hour < 18 ? 'god dag' : 'god aften'

  const pendingReminders = tenantProvider.getReminders(tenant.tenantId).filter((n) => !n.dismissed)
  const reminderHint =
    pendingReminders.length > 0
      ? `Der er ${pendingReminders.length} afventende påmindelse(r) — den næste er "${pendingReminders[0].title}" (forfaldsdato: ${pendingReminders[0].dueDate}).`
      : 'Der er ingen afventende påmindelser i øjeblikket.'

  const systemPrompt = buildSystemPrompt(config.agentName, config.defaultLanguage, mode)

  const welcomeRequest = `Generér en kort, personlig velkomstbesked på dansk til ${userName} fra virksomheden "${tenant.name}" (branche: ${tenant.industry}).

Krav:
- Start med "${greeting}, ${userName}!"
- Introducer dig kort som ${config.agentName}, AI-regnskabskonsulent.
- Nævn KORT: ${reminderHint}
- Afslut med at spørge, om der er noget specifikt du kan hjælpe med.
- MAKSIMUM 2-3 korte sætninger. Vær præcis og overskuelig.
- VARIÉR din formulering — lad være med at bruge nøjagtig de samme ord som sidste gang.
- Brug IKKE emojis mere end én gang.`

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: welcomeRequest },
  ]

  try {
    const result = await callOpenRouter(messages, { maxTokens: 250 })
    return (
      result.content ||
      `Hej ${userName}! 👋 Jeg er ${config.agentName}, din AI-regnskabskonsulent for ${tenant.name}. Hvad kan jeg hjælpe dig med i dag?`
    )
  } catch (err: any) {
    console.warn(`[Hermes] Dynamic welcome generation failed: ${err.message || err}`)
    // Fallback to a simple varied greeting (not the exact same string every time)
    const fallbacks = [
      `Hej ${userName}! Jeg er ${config.agentName}, din AI-regnskabskonsulent for ${tenant.name}. Hvad kan jeg hjælpe med?`,
      `Goddag ${userName}! ${config.agentName} her — din regnskabsassistent for ${tenant.name}. Hvad har du brug for hjælp til?`,
      `Velkommen, ${userName}! Jeg er ${config.agentName} for ${tenant.name}. Lad mig vide, hvad jeg kan hjælpe dig med.`,
    ]
    return fallbacks[Math.floor(Math.random() * fallbacks.length)]
  }
}

// ============================================================
// Connection Handler
// ============================================================

io.on('connection', async (socket) => {
  console.log(`[Hermes] Socket connected: ${socket.id}`)

  // ─── Server-side session verification (U-5) ───────────────────────
  // The session cookie (HttpOnly, SameSite=Lax) is forwarded by Caddy
  // via socket.handshake.headers.cookie. We verify it against the DB and
  // derive userId + tenantId server-side — a malicious client can no
  // longer impersonate another tenant by spoofing the join payload.
  const session = await verifySession(socket.handshake.headers.cookie)

  if (!session) {
    console.warn(`[Hermes] Socket ${socket.id} rejected — invalid or missing session cookie`)
    socket.emit('chat-error', {
      error: 'Din session er udløbet. Genindlæs venligst siden for at bruge Hermes igen.',
      kind: 'session_expired',
    })
    socket.disconnect(true)
    return
  }

  if (!session.tenantId) {
    console.warn(`[Hermes] Socket ${socket.id} rejected — user ${session.userId} has no active company`)
    socket.emit('chat-error', {
      error: 'Du har ingen aktiv virksomhed. Vælg en virksomhed for at bruge Hermes.',
      kind: 'no_active_company',
    })
    socket.disconnect(true)
    return
  }

  // Register the verified identity as the socket's meta. This is the ONLY
  // source of truth for tenantId/userId — the client's join payload is
  // now ignored (kept only for backwards-compat with older clients).
  const meta: SocketMeta = {
    socketId: socket.id,
    tenantId: session.tenantId,
    userId: session.userId,
    userName: session.userName,
    isSuperDev: session.isSuperDev,
  }
  connectedSockets.set(socket.id, meta)
  if (!tenantSockets.has(session.tenantId)) tenantSockets.set(session.tenantId, [])
  tenantSockets.get(session.tenantId)!.push(socket.id)

  console.log(`[Hermes] User "${session.userName}" (${session.userId}) verified for tenant "${session.tenantId}"`)

  // ----- join -----
  // The client still emits 'join' (for backwards-compat with the frontend),
  // but we IGNORE its payload — tenantId/userId/userName all come from the
  // verified session above. The event now just triggers the welcome flow.
  socket.on('join', async (data: { sessionId?: string } = {}) => {
    const { tenantId, userName } = meta
    const sessionId = data.sessionId ?? null

    try {
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
        responseMode: tenantProvider.getResponseMode(tenantId),
      })

      // ── Session retention + dynamic welcome ──────────────────────────
      // On join we load the session's message history from the DB (not just
      // the in-memory cache, which may be empty after a server restart) and
      // send it to the client so reopening the chat shows the previous
      // conversation. If the session has NO messages yet (first visit or new
      // session), we ask the LLM to generate a fresh, contextual welcome —
      // NOT a hardcoded static string (which used to pile up on every
      // reconnect, as seen in the "6 identical welcomes" bug).
      if (tenant.agentEnabled && sessionId) {
        const history = await tenantProvider.loadSessionHistory(tenantId, sessionId)

        if (history.length > 0) {
          // ── Existing session: replay it ──
          socket.emit('session-history', {
            sessionId,
            messages: history.map((m) => ({
              role: m.role === 'user' ? 'user' : 'hermes',
              content: m.content,
              createdAt: m.createdAt ? m.createdAt.toISOString() : new Date().toISOString(),
            })),
          })
        } else {
          // ── Empty session: generate a dynamic LLM welcome ──
          // This fires "before first session" (brand-new tenant) and when
          // the user just clicked "New chat" (new sessionId, no messages).
          const mode = tenantProvider.getResponseMode(tenantId)
          const welcomeContent = isFallback
            ? `Hej ${userName}! 👋 Jeg er ${config.agentName}, din AI-regnskabskonsulent. Hvad kan jeg hjælpe dig med?`
            : await generateWelcome(tenant, userName, mode)

          // Store the welcome as the first message of the session so it's
          // retained across reopens.
          tenantProvider.addMessage(
            tenantId,
            { role: 'assistant', content: welcomeContent },
            sessionId,
          )

          socket.emit('agent-welcome', {
            message: welcomeContent,
            tenantName: tenant.name,
          })
        }
      } else if (tenant.agentEnabled && !sessionId) {
        // No sessionId provided (legacy client) — fall back to a single
        // dynamic welcome without session-scoped storage.
        const mode = tenantProvider.getResponseMode(tenantId)
        const welcomeContent = isFallback
          ? `Hej ${userName}! 👋 Jeg er ${config.agentName}, din AI-regnskabskonsulent. Hvad kan jeg hjælpe dig med?`
          : await generateWelcome(tenant, userName, mode)
        socket.emit('agent-welcome', {
          message: welcomeContent,
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
    } catch (error) {
      // CRITICAL: The join handler MUST always emit join-ack, even on error.
      console.error(`[Hermes] Join handler error for tenant "${tenantId}":`, error)
      socket.emit('join-ack', {
        status: 'error',
        agentEnabled: true,   // Optimistically enable so user can still chat
        tenantName: 'din virksomhed',
      })
    }
  })

  // ----- chat -----
  socket.on('chat', async (data: { message: string; sessionId?: string }) => {
    const { message, sessionId } = data
    const meta = connectedSockets.get(socket.id)

    // meta was set during the verified connection handshake. If it's missing
    // (e.g. socket reconnected before session re-verification completed),
    // reject — the client must reload to re-establish a verified session.
    if (!meta) {
      socket.emit('chat-error', { error: 'Din session er udløbet. Genindlæs venligst siden for at bruge Hermes igen.', kind: 'session_expired' })
      return
    }

    // tenantId comes ONLY from the verified session meta — the client no
    // longer supplies it (and if an old client does, it's ignored).
    const { tenantId } = meta

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

    // NOTE: The user message is persisted AFTER building the LLM context
    // below. Storing it before would include it in `history`, and then it
    // would ALSO be appended as the final `{ role: 'user' }` turn — sending
    // the same message to the model twice (a pre-existing bug).

    // Emit typing indicator
    socket.emit('chat-typing', { typing: true })

    try {
      // Build conversation history for context — scoped to THIS chat session
      // so the model only sees the current conversation, not every message
      // ever exchanged with the tenant.
      const history = tenantProvider.getConversationHistory(tenantId, sessionId).slice(-config.maxConversationHistory)

      // Build OpenRouter/OpenAI-compatible message array with proper roles.
      // System prompt + tenant context go in the system message; history is
      // replayed as real user/assistant turns so the model understands the
      // conversation flow (this works far better than stuffing everything
      // into a single assistant message).
      const systemPrompt = buildSystemPrompt(config.agentName, config.defaultLanguage, tenantProvider.getResponseMode(tenantId))
      const tenantContext = buildTenantContext(tenant)

      // Fetch enabled skill prompts and inject into system prompt
      let skillFragment = ''
      let skillsAwareness = ''
      let hasSourceCodeSkill = false
      try {
        const skillPrompts = await fetchSkillPrompts(tenantId, config.defaultLanguage)
        if (skillPrompts.length > 0) {
          skillFragment = '\n\n---\n\n# Active Skills\n\n' + skillPrompts.map(s => `## Skill: ${s.name}\n\n${s.prompt}`).join('\n\n---\n\n')
        }
        // Track whether source-code-explorer skill is active — if so,
        // we MUST send tool definitions so they match what the skill
        // prompt tells the model to use. Without this, the model sees
        // tool names in the prompt but can't actually call them, causing
        // it to hallucinate tool calls as plain text.
        hasSourceCodeSkill = skillPrompts.some(s => s.name === 'source-code-explorer')
        // Add skills awareness so tenants can ask "what skills do you have?"
        skillsAwareness = buildSkillsAwareness(skillPrompts, config.defaultLanguage)
      } catch {
        // Skills are optional — continue without them
      }

      // Build code atlas when source-code-explorer skill is active.
      // The atlas is cached (5 min TTL) so the cost is negligible after
      // the first build. We always inject it when the skill is present
      // so the model has a map of where to look BEFORE calling tools.
      let codeAtlasSection = ''
      if (hasSourceCodeSkill) {
        try {
          codeAtlasSection = await buildCodeAtlas(meta.isSuperDev)
        } catch (err: any) {
          console.warn(`[Hermes] Failed to build code atlas: ${err.message}`)
        }
      }

      const systemMessage = `${systemPrompt}\n\n${tenantContext}${skillsAwareness}${skillFragment}${codeAtlasSection ? '\n\n---\n\n' + codeAtlasSection : ''}`

      const messages: ChatMessage[] = [
        { role: 'system', content: systemMessage },
        ...history.map(msg => ({
          role: (msg.role === 'user' ? 'user' : 'assistant') as ChatMessage['role'],
          content: msg.content,
        })),
        { role: 'user', content: message },
      ]

      // Persist the user message now that the LLM context is built (avoids
      // the duplicate-message bug — see note above). Tagged with sessionId.
      tenantProvider.addMessage(tenantId, { role: 'user', content: message }, sessionId)

      // Call OpenRouter LLM — with tools if source-code-explorer skill is active.
      // The model uses tool_choice='auto' so it will ONLY call tools when
      // the question actually requires reading source code. Regular accounting
      // questions get a normal text response with no tool overhead.
      //
      // ── Streaming strategy ─────────────────────────────────────────────
      // Plain chat path uses REAL SSE streaming (callOpenRouterStream) — tokens
      // are emitted to the client as the model generates them, so the user sees
      // the first word within ~1-2s instead of waiting for the full response.
      // The tool-calling path stays non-streaming (callOpenRouter + chatWithTools)
      // because tool_calls require a complete message to parse; it falls back to
      // chunked fake-streaming for UI consistency.
      let fullResponse: string
      if (hasSourceCodeSkill) {
        console.log(`[Hermes] Source code tools available for "${meta.userName}" (SuperDev: ${meta.isSuperDev})`)
        fullResponse = await chatWithTools(messages, SOURCE_TOOL_DEFINITIONS, meta.isSuperDev)

        // Tool path: fake-stream the complete response for UI consistency
        const chunks = splitIntoChunks(fullResponse, config.streamingChunkSize)
        for (const chunk of chunks) {
          socket.emit('chat-response', { chunk, done: false })
          await new Promise(resolve => setTimeout(resolve, config.streamingChunkDelay))
        }
      } else {
        // Plain chat: real SSE streaming — emit tokens as they arrive
        const streamStart = Date.now()
        fullResponse = await callOpenRouterStream(
          messages,
          (delta) => {
            socket.emit('chat-response', { chunk: delta, done: false })
          },
          { maxTokens: 2048 },
        ) || 'Beklager, jeg kunne ikke generere et svar.'
        const elapsed = Date.now() - streamStart
        console.log(`[Hermes] Stream complete: ${fullResponse.length} chars in ${elapsed}ms (${(fullResponse.length / 4).toFixed(0)} approx tokens)`)
      }

      // Store assistant response
      tenantProvider.addMessage(tenantId, { role: 'assistant', content: fullResponse }, sessionId)

      // ── Retention: hard-delete old messages beyond the cap ───────────────
      // Chat sessions are NOT preserved. After each exchange we prune the
      // tenant's AgentMessage rows so only the N most recent survive:
      //   • normal tenants → 20 messages
      //   • SuperDev tenants → 40 messages (more exploratory debugging)
      // Failures are swallowed — the boot sweep + next exchange will retry.
      const keepCount = meta.isSuperDev ? config.retentionKeepCountSuperDev : config.retentionKeepCount
      tenantProvider.pruneMessages(tenantId, keepCount).catch((err) => {
        console.warn(`[Hermes] Retention prune failed for tenant ${tenantId}:`, err)
      })

      // Signal completion (chunks were already emitted during streaming above)
      socket.emit('chat-complete', { fullResponse, done: true })

      // Count this successful request against the tenant's rate-limit windows.
      // Only successful responses consume quota — failed/429'd requests don't.
      rateLimiter.record(tenantId)

      console.log(`[Hermes] Response sent to "${meta.userName}" (${fullResponse.length} chars, skill: ${hasSourceCodeSkill ? 'source-code' : 'none'})`)
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
  socket.on('toggle-agent', (data: { enabled: boolean }) => {
    const { enabled } = data
    const meta = connectedSockets.get(socket.id)

    // tenantId comes from the verified session meta only.
    if (!meta) {
      socket.emit('chat-error', { error: 'Din session er udløbet. Genindlæs venligst siden for at bruge Hermes igen.', kind: 'session_expired' })
      return
    }
    const { tenantId } = meta

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

  // ----- new-session -----
  // Client requests a fresh chat session. We drop the in-memory history cache
  // for the given (previous) sessionId, then generate a fresh dynamic LLM
  // welcome for the new session so the user is greeted personally (not with
  // a static string). The welcome is stored as the first AgentMessage of the
  // new session so it's retained across reopens.
  socket.on('new-session', async (data: { previousSessionId?: string; newSessionId?: string }) => {
    const meta = connectedSockets.get(socket.id)
    if (!meta) return
    const { tenantId, userName } = meta

    tenantProvider.clearSessionCache(tenantId, data?.previousSessionId)
    console.log(`[Hermes] New chat session started by "${userName}" (tenant ${tenantId}, prev=${data?.previousSessionId ?? 'none'})`)

    // Ack immediately so the client can clear its UI
    socket.emit('new-session-ack', { ok: true })

    // Generate a dynamic welcome for the new session
    const newSessionId = data?.newSessionId
    if (newSessionId) {
      try {
        const { tenant, isFallback } = await getOrCreateTenant(tenantId)
        const mode = tenantProvider.getResponseMode(tenantId)
        const welcomeContent = isFallback
          ? `Hej ${userName}! 👋 Jeg er ${config.agentName}. Hvad kan jeg hjælpe dig med?`
          : await generateWelcome(tenant, userName, mode)

        // Store as the first message of the new session
        tenantProvider.addMessage(
          tenantId,
          { role: 'assistant', content: welcomeContent },
          newSessionId,
        )

        socket.emit('agent-welcome', {
          message: welcomeContent,
          tenantName: tenant.name,
        })
      } catch (err: any) {
        console.warn(`[Hermes] New-session welcome generation failed: ${err.message || err}`)
        // Fallback: simple greeting (varied)
        const fallback = `Hej ${userName}! ${config.agentName} her. Hvad kan jeg hjælpe med?`
        if (newSessionId) {
          tenantProvider.addMessage(tenantId, { role: 'assistant', content: fallback }, newSessionId)
        }
        socket.emit('agent-welcome', { message: fallback, tenantName: 'din virksomhed' })
      }
    }
  })

  // ----- set-response-mode -----
  // Client toggles between 'complex' (full detailed answers) and 'simplified'
  // (short, plain-language answers for owners new to accounting). Persisted
  // per-tenant on HermesAgent.responseMode. The new mode takes effect on the
  // NEXT chat message (system prompt is rebuilt every request).
  socket.on('set-response-mode', (data: { mode: ResponseMode }) => {
    const meta = connectedSockets.get(socket.id)
    if (!meta) return
    const mode = data.mode === 'simplified' ? 'simplified' : 'complex'
    tenantProvider.setResponseMode(meta.tenantId, mode)
    console.log(`[Hermes] Response mode set to "${mode}" by "${meta.userName}" (tenant ${meta.tenantId})`)
    // Broadcast to all sockets for this tenant so other open tabs stay in sync
    const socketIds = tenantSockets.get(meta.tenantId) || []
    for (const sid of socketIds) {
      io.to(sid).emit('response-mode-changed', { mode })
    }
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
  console.log(`[Hermes]    Source tools  : ${config.sourceCodeToolsEnabled ? 'enabled' : 'disabled'} (activated when source-code-explorer skill is present)`)
  console.log(`[Hermes]    LLM context   : ${config.maxConversationHistory} prior messages`)
  console.log(`[Hermes]    Retention     : keep last ${config.retentionKeepCount} (SuperDev ${config.retentionKeepCountSuperDev}) — older deleted`)

  // ── Global retention sweep on boot ───────────────────────────────────
  // Trims EVERY tenant's AgentMessage rows to the applicable cap so existing
  // piles are cleaned up immediately on (re)deploy — not just going forward.
  // 10s delay lets the DB connection warm up before the sweep runs.
  setTimeout(() => {
    tenantProvider.pruneAllTenants(config.retentionKeepCount, config.retentionKeepCountSuperDev)
      .then((n) => {
        if (n > 0) console.log(`[Hermes] Boot retention sweep: deleted ${n} stale messages across all tenants`)
        else console.log(`[Hermes] Boot retention sweep: no stale messages found`)
      })
      .catch((err) => console.warn('[Hermes] Boot retention sweep failed:', err))
  }, 10_000)
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
