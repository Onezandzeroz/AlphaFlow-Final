/**
 * Shared OpenRouter LLM client for the Next.js app.
 *
 * Hermes (the AI assistant overlay) lives in a separate mini-service and has
 * its own copy of this logic. This module lets Next.js API routes call
 * OpenRouter directly — without going through the Hermes mini-service — for
 * features like bank-statement AI matching.
 *
 * Replaces the sandbox-only `z-ai-web-dev-sdk` that the matching engine used
 * previously (the SDK does NOT work outside this development sandbox).
 *
 * Docs: https://openrouter.ai/docs
 * Free models: https://openrouter.ai/models?q=free
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';
const OPENROUTER_APP_NAME = process.env.OPENROUTER_APP_NAME || 'AlphaFlow';
const OPENROUTER_APP_URL = process.env.APP_URL || process.env.OPENROUTER_APP_URL || 'https://alphaflow.dk';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ─── Typed LLM Errors ──────────────────────────────────────────────
// A stable `kind` lets callers map each failure to a specific, actionable,
// user-facing message instead of a generic "Prøv igen senere".

export type LLMErrorKind =
  | 'missing_key'      // OPENROUTER_API_KEY not set (most common in fresh PM2 deploys)
  | 'unauthorized'     // 401 — key invalid/expired
  | 'rate_limited'     // 429 — quota exceeded or too many requests
  | 'model_not_found'  // 404 — model slug retired/renamed by OpenRouter
  | 'server_error'     // 5xx — OpenRouter upstream issue
  | 'network'          // fetch failed / DNS / timeout
  | 'unknown';

export class LLMError extends Error {
  kind: LLMErrorKind;
  status?: number;
  retryAfterSeconds?: number;
  constructor(kind: LLMErrorKind, message: string, status?: number, retryAfterSeconds?: number) {
    super(message);
    this.name = 'LLMError';
    this.kind = kind;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function classifyLLMError(error: unknown): LLMError {
  if (error instanceof LLMError) return error;

  const raw: any = error;
  const msg: string = (raw?.message || String(raw)).toString();

  // Network / connectivity (fetch throws TypeError "fetch failed", ENOTFOUND, ECONNRESET, timeout)
  if (
    raw?.code === 'ENOTFOUND' || raw?.code === 'ECONNRESET' || raw?.code === 'ECONNREFUSED' ||
    raw?.name === 'TypeError' || /fetch failed|network|econn|etimedout|aborted/i.test(msg)
  ) {
    return new LLMError('network', msg);
  }

  // HTTP status-coded errors we threw as "OpenRouter <status>: <body>"
  const m = msg.match(/OpenRouter\s+(\d{3}):/i);
  if (m) {
    const status = Number(m[1]);
    if (status === 401 || status === 403) return new LLMError('unauthorized', msg, status);
    if (status === 429) return new LLMError('rate_limited', msg, status);
    if (status === 404) return new LLMError('model_not_found', msg, status);
    if (status >= 500) return new LLMError('server_error', msg, status);
    return new LLMError('unknown', msg, status);
  }

  return new LLMError('unknown', msg);
}

// ─── Retry Policy ──────────────────────────────────────────────────
// OpenRouter's free-tier models frequently return 429 "temporarily rate-
// limited upstream". These are TRANSIENT — the response even includes
// `retry_after_seconds`. So we retry automatically:
//   - 429 rate_limited : honor retry_after_seconds (fallback: exponential)
//   - 5xx server_error : exponential backoff (1s, 2s, 4s)
//   - network/timeout  : exponential backoff (1s, 2s, 4s)
// Auth/key/model errors are NOT retried (they won't fix themselves).

const MAX_RETRIES = 3;             // Total attempts = 1 + MAX_RETRIES (so up to 4 requests)
const REQUEST_TIMEOUT_MS = 30_000; // Abort a single fetch after 30s
const MAX_BACKOFF_MS = 10_000;     // Never wait longer than 10s between retries

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Parse retry-after hint from either the HTTP `Retry-After` header (delta-
// seconds form) or the OpenRouter JSON body field `error.metadata.retry_after_seconds`.
function parseRetryAfter(res: Response, bodyText: string): number | undefined {
  const headerVal = res.headers.get('retry-after');
  if (headerVal) {
    const secs = parseInt(headerVal, 10);
    if (!isNaN(secs) && secs >= 0) return secs;
  }
  try {
    const body = JSON.parse(bodyText);
    const secs = body?.error?.metadata?.retry_after_seconds;
    if (typeof secs === 'number' && secs >= 0) return Math.ceil(secs);
  } catch {
    // body wasn't JSON or had an unexpected shape — ignore
  }
  return undefined;
}

export interface CallOpenRouterOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

/**
 * Call the OpenRouter Chat Completions API and return the assistant's text
 * response. Throws a typed {@link LLMError} on failure.
 *
 * @example
 * const reply = await callOpenRouter(
 *   [{ role: 'user', content: 'Hej' }],
 *   { temperature: 0.1, maxTokens: 512 }
 * );
 */
export async function callOpenRouter(
  messages: ChatMessage[],
  options: CallOpenRouterOptions = {}
): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    throw new LLMError(
      'missing_key',
      'OPENROUTER_API_KEY er ikke sat — AI-funktionen kan ikke tilkalde en LLM. Sæt den i .env / PM2 env.'
    );
  }

  let lastError: LLMError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const isLastAttempt = attempt === MAX_RETRIES;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      let res: Response;
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
            model: options.model || OPENROUTER_MODEL,
            messages,
            temperature: options.temperature ?? 0.4,
            max_tokens: options.maxTokens ?? 1024,
          }),
        });
      } catch (fetchErr: any) {
        throw classifyLLMError(fetchErr);
      } finally {
        clearTimeout(timeout);
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        const typed = classifyLLMError(new Error(`OpenRouter ${res.status}: ${errText}`));
        if (typed.kind === 'rate_limited') {
          typed.retryAfterSeconds = parseRetryAfter(res, errText);
        }
        throw typed;
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (err) {
      const typed = err instanceof LLMError ? err : classifyLLMError(err);
      lastError = typed;

      const retriable: LLMErrorKind[] = ['rate_limited', 'server_error', 'network'];
      const shouldRetry = !isLastAttempt && retriable.includes(typed.kind);

      if (!shouldRetry) {
        throw typed;
      }

      let waitMs: number;
      if (typed.kind === 'rate_limited' && typed.retryAfterSeconds != null) {
        waitMs = typed.retryAfterSeconds * 1000;
      } else {
        waitMs = Math.pow(2, attempt) * 1000;
      }
      waitMs = Math.min(waitMs, MAX_BACKOFF_MS);

      // eslint-disable-next-line no-console
      console.log(
        `[OpenRouter] [${typed.kind}]${typed.status ? ` (HTTP ${typed.status})` : ''} on attempt ${attempt + 1}/${MAX_RETRIES + 1}` +
        (typed.retryAfterSeconds ? ` (retry_after=${typed.retryAfterSeconds}s)` : '') +
        ` — retrying in ${(waitMs / 1000).toFixed(1)}s...`
      );

      await sleep(waitMs);
    }
  }

  // Unreachable (loop throws on the last attempt), but keeps TS happy.
  throw lastError ?? new LLMError('unknown', 'Unknown LLM error after retries');
}

/**
 * Map an LLMError kind to a Danish, user-facing message.
 * Useful for surfacing in toast notifications.
 */
export function llmErrorUserMessage(kind: LLMErrorKind): string {
  switch (kind) {
    case 'missing_key':
      return 'AI-tjenesten er ikke konfigureret på serveren (manglende API-nøgle). Kontakt administratoren.';
    case 'unauthorized':
      return 'AI-nøglen er afvist af OpenRouter (401). Tjek at OPENROUTER_API_KEY er gyldig og aktiv.';
    case 'rate_limited':
      return 'AI-modellen er midlertidigt overbelastet (429). Prøv igen om et øjeblik.';
    case 'model_not_found':
      return 'AI-modellen findes ikke længere hos OpenRouter (404). Skift OPENROUTER_MODEL til en aktuel model.';
    case 'server_error':
      return 'OpenRouter har midlertidige problemer (5xx). Prøv igen om et øjeblik.';
    case 'network':
      return 'Kan ikke kontakte OpenRouter. Tjek serverens internetforbindelse og firewall.';
    default:
      return 'Kunne ikke få svar fra AI-tjenesten. Prøv igen senere.';
  }
}
