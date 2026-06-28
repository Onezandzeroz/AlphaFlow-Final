// ============================================================
// embedder.ts — Embedding client (OpenAI-compatible)
// ============================================================
// Calls the embeddings API to convert text → 1536-dim vector.
// Works with both OpenAI and OpenRouter (OpenAI-compatible endpoint).
//
// OpenAI: POST https://api.openai.com/v1/embeddings  (key: OPENAI_API_KEY)
// OpenRouter: POST https://openrouter.ai/api/v1/embeddings (key: OPENROUTER_API_KEY)
//
// We batch up to 100 texts per call for efficiency.
// ============================================================

import { defaultConfig } from './config'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || ''

// Provider selection: prefer OpenAI (cheaper embeddings), fall back to OpenRouter
function getProvider(): { baseUrl: string; apiKey: string; model: string } {
  if (OPENAI_API_KEY) {
    return {
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      apiKey: OPENAI_API_KEY,
      model: defaultConfig.embeddingModel,
    }
  }
  if (OPENROUTER_API_KEY) {
    return {
      baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      apiKey: OPENROUTER_API_KEY,
      model: defaultConfig.embeddingModel,
    }
  }
  throw new Error('Neither OPENAI_API_KEY nor OPENROUTER_API_KEY is set — embeddings cannot be generated.')
}

/**
 * Embeds an array of texts and returns a parallel array of vectors.
 * Uses the OpenAI-compatible /embeddings endpoint.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  const provider = getProvider()
  const res = await fetch(`${provider.baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: provider.model,
      input: texts,
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`Embedding API ${res.status}: ${errText}`)
  }

  const data = await res.json()
  // OpenAI returns { data: [{ embedding: [...] }, ...] } sorted by index
  const embeddings: number[][] = (data.data || [])
    .sort((a: any, b: any) => a.index - b.index)
    .map((item: any) => item.embedding)

  if (embeddings.length !== texts.length) {
    throw new Error(`Embedding count mismatch: expected ${texts.length}, got ${embeddings.length}`)
  }

  return embeddings
}

/**
 * Embeds a single text and returns its vector.
 */
export async function embedText(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text])
  return vec
}

/**
 * Approximate token count (rough: 1 token ≈ 4 chars for English/Danish).
 * Used for chunking and context budgeting. For exact counts, use tiktoken.
 */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Whether embeddings are available (API key configured).
 */
export function embeddingsAvailable(): boolean {
  return !!(OPENAI_API_KEY || OPENROUTER_API_KEY)
}
