// ============================================================
// config.ts — Single source of truth for all configuration
// ============================================================

export interface HermesConfig {
  // Server
  port: number

  // Agent
  agentName: string               // "Hermes"
  defaultLanguage: string        // "da"
  maxConversationHistory: number // 20
  streamingChunkSize: number     // 20
  streamingChunkDelay: number    // 30 (ms)

  // Reminders
  reminderCheckInterval: number  // 60000 (ms)
  reminderWindowDays: number      // 7

  // CORS (for development)
  corsOrigin: string             // "*" or specific origin
}

export const defaultConfig: HermesConfig = {
  port: 3004,
  agentName: 'Hermes',
  defaultLanguage: 'da',
  maxConversationHistory: 20,
  streamingChunkSize: 20,
  streamingChunkDelay: 30,
  reminderCheckInterval: 60_000,
  reminderWindowDays: 7,
  corsOrigin: '*',
}
