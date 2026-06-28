// ============================================================
// chunker.ts — Text chunking for RAG
// ============================================================
// Splits a document into overlapping chunks that fit the embedding
// model's context window and preserve semantic boundaries.
//
// Strategy:
// 1. Split on double-newlines (paragraph boundaries) first
// 2. Greedily merge paragraphs until ~chunkSize tokens
// 3. If a paragraph exceeds chunkSize, hard-split it at sentence boundaries
// 4. Overlap: prepend the last `chunkOverlap` tokens of the previous chunk
// ============================================================

import { approxTokens } from './embedder'
import { defaultConfig } from './config'

export interface Chunk {
  content: string
  chunkIndex: number
  tokenCount: number
}

/**
 * Splits text into overlapping chunks for embedding.
 */
export function chunkText(text: string): Chunk[] {
  const { chunkSize, chunkOverlap } = defaultConfig
  const chunks: Chunk[] = []

  // Normalize: collapse 3+ newlines to 2, trim trailing whitespace
  const normalized = text.replace(/\n{3,}/g, '\n\n').trim()
  if (!normalized) return chunks

  // Split into paragraphs (double newline boundaries)
  const paragraphs = normalized.split(/\n\n+/).filter(p => p.trim().length > 0)

  let current = ''
  let currentTokens = 0
  let chunkIndex = 0

  for (const para of paragraphs) {
    const paraTokens = approxTokens(para)

    // If paragraph alone exceeds chunkSize, hard-split it
    if (paraTokens > chunkSize) {
      // Flush current buffer first
      if (current) {
        chunks.push(makeChunk(current, chunkIndex++))
        current = ''
        currentTokens = 0
      }
      // Split the large paragraph by sentences
      const sentences = para.match(/[^.!?]+[.!?]+|\S+/g) || [para]
      let sentenceBuf = ''
      let sentenceTokens = 0
      for (const sent of sentences) {
        const sTokens = approxTokens(sent)
        if (sentenceTokens + sTokens > chunkSize && sentenceBuf) {
          chunks.push(makeChunk(sentenceBuf, chunkIndex++))
          sentenceBuf = sent
          sentenceTokens = sTokens
        } else {
          sentenceBuf += (sentenceBuf ? ' ' : '') + sent
          sentenceTokens += sTokens
        }
      }
      if (sentenceBuf) {
        chunks.push(makeChunk(sentenceBuf, chunkIndex++))
      }
      continue
    }

    // Normal case: merge paragraph into current buffer if it fits
    if (currentTokens + paraTokens > chunkSize && current) {
      // Flush current chunk
      chunks.push(makeChunk(current, chunkIndex++))
      // Start new chunk with overlap from previous
      const overlapText = takeLastTokens(current, chunkOverlap)
      current = overlapText ? overlapText + '\n\n' + para : para
      currentTokens = approxTokens(current)
    } else {
      current = current ? current + '\n\n' + para : para
      currentTokens += paraTokens
    }
  }

  // Flush remaining buffer
  if (current) {
    chunks.push(makeChunk(current, chunkIndex++))
  }

  return chunks
}

function makeChunk(content: string, chunkIndex: number): Chunk {
  return {
    content: content.trim(),
    chunkIndex,
    tokenCount: approxTokens(content),
  }
}

/**
 * Returns the last ~N tokens of a text (approximate, by char count).
 * Used for chunk overlap.
 */
function takeLastTokens(text: string, tokenCount: number): string {
  const charCount = tokenCount * 4
  if (text.length <= charCount) return text
  const slice = text.slice(-charCount)
  // Align to word boundary
  const spaceIdx = slice.indexOf(' ')
  return spaceIdx > 0 ? slice.slice(spaceIdx + 1) : slice
}
