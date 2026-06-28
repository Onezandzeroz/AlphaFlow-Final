// ============================================================
// config.ts — Knowledge service configuration
// ============================================================

export interface KnowledgeConfig {
  port: number
  // Embedding provider
  embeddingProvider: 'openai' | 'openrouter'
  embeddingModel: string
  embeddingDims: number
  // Retrieval
  topK: number              // Number of chunks to retrieve per query
  maxContextTokens: number  // Max total tokens of retrieved context sent to LLM
  similarityThreshold: number // Max cosine distance (lower = more similar). 0.5 = lenient, 0.3 = strict
  // Chunking
  chunkSize: number         // Target tokens per chunk
  chunkOverlap: number      // Overlap tokens between adjacent chunks
}

export const defaultConfig: KnowledgeConfig = {
  port: 3006,
  embeddingProvider: 'openrouter',
  // OpenRouter free embedding model (1536 dims, matches OpenAI text-embedding-3-small)
  // Docs: https://openrouter.ai/models?q=embedding
  embeddingModel: 'text-embedding-3-small',
  embeddingDims: 1536,
  topK: 5,
  maxContextTokens: 2000,
  similarityThreshold: 0.5,
  chunkSize: 500,     // ~500 tokens ≈ ~2000 chars — good balance of context + granularity
  chunkOverlap: 50,   // 10% overlap preserves cross-chunk context
}
