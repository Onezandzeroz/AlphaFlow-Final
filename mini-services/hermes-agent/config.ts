// ============================================================
// config.ts — Single source of truth for all configuration
// ============================================================

export interface HermesConfig {
  // Server
  port: number

  // Agent
  agentName: string               // "Hermes"
  defaultLanguage: string        // "da"
  maxConversationHistory: number // 6 — prior messages replayed to the LLM
  // ── Streaming ────────────────────────────────────────────────
  // streamingChunkSize: only used by the tool-calling path (fake-streaming
  // a complete response for UI consistency). The plain-chat path uses real
  // SSE streaming and ignores this.
  // streamingChunkDelay: was 30ms — added visible latency on long answers
  // (4096 tokens × 30ms ≈ 8-12s extra). Set to 0 so chunks are emitted the
  // instant they arrive from OpenRouter. The client renders them just fine
  // without artificial throttling.
  streamingChunkSize: number     // 20
  streamingChunkDelay: number    // 0 (ms) — no artificial throttle

  // ── Chat retention ────────────────────────────────────────────
  // Chat sessions are NOT preserved indefinitely. After each message
  // exchange, the agent's AgentMessage rows are pruned so only the N
  // most recent survive. Normal tenants keep 20; SuperDev tenants keep
  // 40 (they do more exploratory debugging). Older rows are hard-deleted.
  retentionKeepCount: number          // 20 — normal tenants
  retentionKeepCountSuperDev: number  // 40 — SuperDev tenants

  // Reminders
  reminderCheckInterval: number  // 60000 (ms)
  reminderWindowDays: number      // 7

  // Source code tools
  sourceCodeToolsEnabled: boolean // Enable function calling for source code reading
  sourceCodeRootPath: string       // Absolute path to the project root (auto-detected)

  // CORS (for development)
  corsOrigin: string             // "*" or specific origin
}

export const defaultConfig: HermesConfig = {
  port: 3004,
  agentName: 'Hermes',
  defaultLanguage: 'da',
  maxConversationHistory: 6,
  streamingChunkSize: 20,
  streamingChunkDelay: 0,
  retentionKeepCount: 20,
  retentionKeepCountSuperDev: 40,
  reminderCheckInterval: 60_000,
  reminderWindowDays: 7,
  sourceCodeToolsEnabled: true,
  sourceCodeRootPath: '', // Auto-detected from process.env.ALPHAFLOW_ROOT or ../
  corsOrigin: '*',
}
