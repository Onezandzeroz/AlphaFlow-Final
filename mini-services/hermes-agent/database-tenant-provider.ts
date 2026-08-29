// ============================================================
// database-tenant-provider.ts — Prisma-backed TenantProvider
// ============================================================
//
// Replaces the in-memory MockTenantProvider with a real
// implementation backed by the AlphaFlow PostgreSQL database
// via Prisma ORM.
//
// Usage:
//   import { DatabaseTenantProvider } from './database-tenant-provider'
//   const provider = new DatabaseTenantProvider()
//
// Requires:
//   - DATABASE_URL environment variable pointing to PostgreSQL
//   - @prisma/client installed (prisma generate must have been run)
//   - The schema must include Company, HermesAgent, AgentReminder,
//     AgentMessage, UserCompany, User, and Transaction models.
//
// ============================================================

import { PrismaClient } from '@prisma/client'
import type {
  TenantProvider,
  TenantData,
  TenantMember,
  AccountingData,
  AgentNotification,
  ConversationMessage,
  ResponseMode,
} from './tenant-provider'

// ================================================================
// Prisma Singleton
// ================================================================

let prisma: PrismaClient | null = null

/**
 * Returns a singleton PrismaClient instance.
 * Uses DATABASE_URL from the environment if available,
 * otherwise falls back to the datasource URL in schema.prisma.
 *
 * Exported so other modules (e.g. rate-limiter.ts) can reuse the
 * same connection pool instead of creating duplicate clients.
 */
export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    const databaseUrl = process.env.DATABASE_URL
    prisma = new PrismaClient({
      ...(databaseUrl ? { datasourceUrl: databaseUrl } : {}),
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    })
  }
  return prisma
}

// ================================================================
// In-Memory Cache for isAgentEnabled (30-second TTL)
// ================================================================

interface EnabledCacheEntry {
  value: boolean
  timestamp: number
}

const ENABLED_CACHE_TTL_MS = 30_000 // 30 seconds

const enabledCache = new Map<string, EnabledCacheEntry>()

/**
 * Returns the cached value for a tenant, or null if
 * the entry is missing or stale.
 */
function getCachedEnabled(tenantId: string): boolean | null {
  const entry = enabledCache.get(tenantId)
  if (!entry) return null
  if (Date.now() - entry.timestamp > ENABLED_CACHE_TTL_MS) {
    enabledCache.delete(tenantId)
    return null
  }
  return entry.value
}

/**
 * Writes a value into the enabled cache.
 */
function setCachedEnabled(tenantId: string, value: boolean): void {
  enabledCache.set(tenantId, { value, timestamp: Date.now() })
}

// ── Response-mode cache (no TTL — only invalidated on explicit set/toggle) ──
// Mode changes rarely and must be instantly consistent, so we don't expire it.
const responseModeCache = new Map<string, ResponseMode>()

function getCachedResponseMode(tenantId: string): ResponseMode {
  return responseModeCache.get(tenantId) ?? 'complex'
}

function setCachedResponseMode(tenantId: string, mode: ResponseMode): void {
  responseModeCache.set(tenantId, mode)
}

/** Coerce any DB value (string | null | undefined) into a valid ResponseMode. */
function normalizeResponseMode(raw: string | null | undefined): ResponseMode {
  return raw === 'simplified' ? 'simplified' : 'complex'
}

/**
 * Build the in-memory cache key for a tenant + chat session pair.
 * `null`/`undefined` sessionId maps to the 'default' (legacy, session-less)
 * bucket so callers that don't pass a sessionId still get a usable view.
 */
function messagesCacheKey(tenantId: string, sessionId: string | null): string {
  return `${tenantId}:${sessionId ?? 'default'}`
}

// ================================================================
// Accounting Helpers
// ================================================================

/** Transaction types that count as income. */
const INCOME_TYPES: ReadonlySet<string> = new Set(['SALE', 'Z_REPORT'])

/** Transaction types that count as expenses. */
const EXPENSE_TYPES: ReadonlySet<string> = new Set(['PURCHASE', 'SALARY', 'PRIVATE'])

/** Number of months of transaction history to aggregate. */
const ACCOUNTING_MONTHS = 6

interface ParsedTransaction {
  date: Date
  type: string
  amount: number
}

/**
 * Computes monthly income/expense arrays and derived accounting
 * metrics from a list of transactions for the last N months.
 */
function computeAccountingData(transactions: ParsedTransaction[]): AccountingData {
  const now = new Date()

  // Initialize monthly buckets (oldest → newest)
  const months: Array<{ year: number; month: number; income: number; expenses: number }> = []
  for (let i = ACCOUNTING_MONTHS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ year: d.getFullYear(), month: d.getMonth(), income: 0, expenses: 0 })
  }

  let totalIncome = 0
  let totalExpenses = 0

  for (const tx of transactions) {
    const txDate = new Date(tx.date)

    // Find which monthly bucket this transaction falls into
    const bucketIdx = months.findIndex(
      (m) => m.year === txDate.getFullYear() && m.month === txDate.getMonth(),
    )
    if (bucketIdx === -1) continue // Outside our window

    if (INCOME_TYPES.has(tx.type)) {
      months[bucketIdx].income += tx.amount
      totalIncome += tx.amount
    } else if (EXPENSE_TYPES.has(tx.type)) {
      months[bucketIdx].expenses += tx.amount
      totalExpenses += tx.amount
    }
    // BANK, ADJUSTMENT types are neutral — not counted as income or expense
  }

  const currentBalance = totalIncome - totalExpenses
  const recentIncome = months.map((m) => Math.round(m.income))
  const recentExpenses = months.map((m) => Math.round(m.expenses))

  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()

  // --- VAT period derivation (default: quarterly) ---
  const lastQuarter = Math.floor(currentMonth / 3) // 0,1,2,3
  const lastVatPeriod =
    lastQuarter === 0
      ? `${currentYear - 1}-Q4`
      : `${currentYear}-Q${lastQuarter}`

  // Next VAT deadline: ~30 days after current quarter ends
  const nextQuarterEnd = new Date(currentYear, (Math.floor(currentMonth / 3) + 1) * 3, 0)
  nextQuarterEnd.setDate(nextQuarterEnd.getDate() + 30)
  const nextVatDeadline = nextQuarterEnd.toISOString().split('T')[0]

  // Danish standard yearly report deadline
  const yearlyReportDeadline = `${currentYear + 1}-06-30`

  // Fiscal year start (Danish calendar year default)
  const fiscalYearStart = `${currentYear - 1}-01-01`

  return {
    currentBalance: Math.round(currentBalance),
    recentIncome,
    recentExpenses,
    vatStatus: 'quarterly',
    vatRate: 0.25,
    lastVatPeriod,
    nextVatDeadline,
    yearlyReportDeadline,
    fiscalYearStart,
    monthsOfData: ACCOUNTING_MONTHS,
  }
}

/**
 * Returns a zeroed-out AccountingData used when dataAccessEnabled is false.
 */
function emptyAccountingData(): AccountingData {
  return {
    currentBalance: 0,
    recentIncome: [],
    recentExpenses: [],
    vatStatus: 'quarterly',
    vatRate: 0.25,
    lastVatPeriod: '',
    nextVatDeadline: '',
    yearlyReportDeadline: '',
    fiscalYearStart: '',
    monthsOfData: 0,
  }
}

// ================================================================
// DatabaseTenantProvider
// ================================================================

/**
 * A production-ready TenantProvider backed by PostgreSQL via Prisma.
 *
 * Architecture:
 * - `getTenant()` queries the database and populates in-memory caches
 *   for reminders and conversation history so that the synchronous
 *   `getReminders()` and `getConversationHistory()` methods work
 *   without blocking on I/O.
 * - `isAgentEnabled()` uses a 30-second TTL cache to avoid hitting
 *   the database on every socket event.
 * - Write methods (`setAgentEnabled`, `dismissReminder`, `addMessage`)
 *   update their in-memory caches immediately for consistency, then
 *   persist to the database as fire-and-forget async operations.
 */
export class DatabaseTenantProvider implements TenantProvider {
  // In-memory caches populated by getTenant() for synchronous reads.
  // Keyed by `${tenantId}:${sessionId ?? 'default'}` so each chat session
  // has an isolated history view.
  private remindersCache = new Map<string, AgentNotification[]>()
  private messagesCache = new Map<string, ConversationMessage[]>()

  private connected = false

  constructor() {
    this.connect().catch((err) => {
      console.error('[DatabaseTenantProvider] Failed to connect:', err)
    })
  }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------

  private async connect(): Promise<void> {
    if (this.connected) return
    try {
      const client = getPrismaClient()
      await client.$connect()
      this.connected = true
      console.log('[DatabaseTenantProvider] Connected to database via Prisma')
    } catch (err: any) {
      console.error('[DatabaseTenantProvider] Connection error:', err.message || err)
    }
  }

  /**
   * Gracefully disconnect from the database.
   * Call this on shutdown to release the connection pool.
   */
  async disconnect(): Promise<void> {
    if (prisma) {
      await prisma.$disconnect()
      prisma = null
      this.connected = false
      this.remindersCache.clear()
      this.messagesCache.clear()
      enabledCache.clear()
      responseModeCache.clear()
      console.log('[DatabaseTenantProvider] Disconnected from database')
    }
  }

  // ----------------------------------------------------------------
  // TenantProvider — getTenant
  // ----------------------------------------------------------------

  async getTenant(tenantId: string): Promise<TenantData | null> {
    try {
      const db = getPrismaClient()
      // Compute the date range for transactions (last N months)
      const now = new Date()
      const transactionCutoff = new Date(now.getFullYear(), now.getMonth() - (ACCOUNTING_MONTHS - 1), 1)

      const company = await db.company.findUnique({
        where: { id: tenantId },
        include: {
          hermesAgent: {
            include: {
              reminders: true,
              // Load the 20 MOST RECENT messages (newest-first, then we reverse
              // below). The previous `orderBy: asc, take: 20` loaded the OLDEST
              // 20 — a bug that surfaced once a tenant exceeded 20 lifetime
              // messages.
              messages: {
                orderBy: { createdAt: 'desc' },
                take: 20,
              },
            },
          },
          members: {
            include: {
              user: true,
            },
          },
          transactions: {
            where: {
              date: { gte: transactionCutoff },
              cancelled: false,
            },
            orderBy: { date: 'asc' },
          },
        },
      })

      if (!company) {
        console.log(`[DatabaseTenantProvider] Company not found: ${tenantId}`)
        return null
      }

      // --- HermesAgent ---
      const agent = company.hermesAgent
      const dataAccessEnabled = agent?.dataAccessEnabled ?? false

      // --- Members ---
      const members: TenantMember[] = company.members.map((uc) => ({
        id: uc.userId,
        name: uc.user.businessName || uc.user.email.split('@')[0] || 'Ukendt',
        role: uc.role,
        email: uc.user.email,
      }))

      // --- Notifications (pending reminders only) ---
      const notifications: AgentNotification[] = (agent?.reminders ?? [])
        .filter((r) => r.status === 'pending')
        .map((r) => ({
          id: r.id,
          type: 'reminder' as const,
          title: r.title,
          description: r.description || '',
          dueDate: r.dueDate ? r.dueDate.toISOString().split('T')[0] : '',
          dismissed: false,
        }))

      // --- Conversation history (last 20 messages, oldest-first) ---
      // `messages` was fetched newest-first above; reverse to chronological
      // (oldest-first) order for replay into the LLM.
      const conversationHistory: ConversationMessage[] = (agent?.messages ?? [])
        .slice()
        .reverse()
        .map((m) => ({
          role: (m.role === 'user' ? 'user' : 'assistant') as ConversationMessage['role'],
          content: m.content,
        }))

      // --- Accounting data ---
      const parsedTransactions: ParsedTransaction[] = company.transactions.map((tx) => ({
        date: tx.date,
        type: tx.type,
        amount: tx.amount.toNumber(),
      }))

      const accounting: AccountingData = dataAccessEnabled
        ? computeAccountingData(parsedTransactions)
        : emptyAccountingData()

      // --- Populate caches for synchronous access ---
      // Key by the 'default' (legacy, session-less) view so getTenant()'s
      // data is available to callers that don't yet pass a sessionId.
      this.remindersCache.set(tenantId, notifications)
      this.messagesCache.set(messagesCacheKey(tenantId, null), conversationHistory)

      // Update enabled cache from the agent record
      setCachedEnabled(tenantId, agent?.enabled ?? false)
      // Update response-mode cache from the agent record
      setCachedResponseMode(tenantId, normalizeResponseMode(agent?.responseMode))

      // --- Build and return TenantData ---
      const tenantData: TenantData = {
        tenantId: company.id,
        name: company.name,
        cvr: company.cvrNumber,
        industry: company.companyType || 'Ukendt',
        members,
        accounting,
        agentEnabled: agent?.enabled ?? false,
        dataAccessEnabled,
        notifications,
        conversationHistory,
      }

      return tenantData
    } catch (error: any) {
      console.error(
        `[DatabaseTenantProvider] Error fetching tenant ${tenantId}:`,
        error.message || error,
      )
      return null
    }
  }

  // ----------------------------------------------------------------
  // TenantProvider — isAgentEnabled (sync with 30s cache)
  // ----------------------------------------------------------------

  isAgentEnabled(tenantId: string): boolean {
    // 1. Check cache first — if fresh, return immediately
    const cached = getCachedEnabled(tenantId)
    if (cached !== null) return cached

    // 2. Cache miss or expired — fire async refresh.
    //    Rather than returning false (which breaks join-ack when
    //    the agent IS enabled but the cache simply expired), we
    //    optimistically return true. The async refresh will correct
    //    the cache within milliseconds if the agent is actually
    //    disabled, and the next isAgentEnabled() call (within 30s)
    //    will reflect the true state.
    this.refreshEnabledCache(tenantId).catch(() => {
      // Silently handle — the cache will remain empty
    })

    return true
  }

  /**
   * Asynchronously queries the database to refresh the enabled cache
   * for a specific tenant.
   */
  private async refreshEnabledCache(tenantId: string): Promise<void> {
    try {
      const db = getPrismaClient()
      const agent = await db.hermesAgent.findUnique({
        where: { companyId: tenantId },
        select: { enabled: true },
      })
      setCachedEnabled(tenantId, agent?.enabled ?? false)
    } catch (error: any) {
      console.error(
        `[DatabaseTenantProvider] Error refreshing enabled cache for ${tenantId}:`,
        error.message || error,
      )
      setCachedEnabled(tenantId, false)
    }
  }

  // ----------------------------------------------------------------
  // TenantProvider — setAgentEnabled (sync, fire-and-forget persist)
  // ----------------------------------------------------------------

  setAgentEnabled(tenantId: string, enabled: boolean): void {
    // Update cache immediately so subsequent isAgentEnabled() calls
    // return the correct value without waiting for DB round-trip
    setCachedEnabled(tenantId, enabled)

    // Persist to database (fire-and-forget)
    this.persistAgentEnabled(tenantId, enabled).catch((err) => {
      console.error(
        `[DatabaseTenantProvider] Failed to persist agent enabled for ${tenantId}:`,
        err,
      )
    })
  }

  /**
   * Upserts the HermesAgent record to set the enabled flag.
   */
  private async persistAgentEnabled(tenantId: string, enabled: boolean): Promise<void> {
    const db = getPrismaClient()
    await db.hermesAgent.upsert({
      where: { companyId: tenantId },
      create: { companyId: tenantId, enabled },
      update: { enabled },
    })
  }

  // ----------------------------------------------------------------
  // TenantProvider — getResponseMode (sync from cache)
  // ----------------------------------------------------------------

  getResponseMode(tenantId: string): ResponseMode {
    return getCachedResponseMode(tenantId)
  }

  // ----------------------------------------------------------------
  // TenantProvider — setResponseMode (sync cache update, async persist)
  // ----------------------------------------------------------------

  setResponseMode(tenantId: string, mode: ResponseMode): void {
    // Update cache immediately so the very next chat request uses the new mode
    setCachedResponseMode(tenantId, mode)
    // Persist to database (fire-and-forget)
    this.persistResponseMode(tenantId, mode).catch((err) => {
      console.error(
        `[DatabaseTenantProvider] Failed to persist responseMode for ${tenantId}:`,
        err,
      )
    })
  }

  private async persistResponseMode(tenantId: string, mode: ResponseMode): Promise<void> {
    const db = getPrismaClient()
    await db.hermesAgent.upsert({
      where: { companyId: tenantId },
      create: { companyId: tenantId, responseMode: mode },
      update: { responseMode: mode },
    })
  }

  // ----------------------------------------------------------------
  // TenantProvider — getReminders (sync from cache)
  // ----------------------------------------------------------------

  getReminders(tenantId: string): AgentNotification[] {
    return this.remindersCache.get(tenantId) ?? []
  }

  // ----------------------------------------------------------------
  // TenantProvider — dismissReminder (sync cache update, async persist)
  // ----------------------------------------------------------------

  dismissReminder(tenantId: string, reminderId: string): void {
    // Update in-memory cache immediately
    const reminders = this.remindersCache.get(tenantId)
    if (reminders) {
      const reminder = reminders.find((r) => r.id === reminderId)
      if (reminder) {
        reminder.dismissed = true
      }
    }

    // Persist to database (fire-and-forget)
    this.persistDismissReminder(reminderId).catch((err) => {
      console.error(
        `[DatabaseTenantProvider] Failed to persist dismiss for ${reminderId}:`,
        err,
      )
    })
  }

  /**
   * Updates the AgentReminder status to 'dismissed' in the database.
   */
  private async persistDismissReminder(reminderId: string): Promise<void> {
    const db = getPrismaClient()
    await db.agentReminder.update({
      where: { id: reminderId },
      data: { status: 'dismissed' },
    })
  }

  // ----------------------------------------------------------------
  // TenantProvider — getConversationHistory (sync from cache)
  // ----------------------------------------------------------------

  getConversationHistory(tenantId: string, sessionId?: string | null): ConversationMessage[] {
    return this.messagesCache.get(messagesCacheKey(tenantId, sessionId ?? null)) ?? []
  }

  // ----------------------------------------------------------------
  // TenantProvider — loadSessionHistory (DB query, populates cache)
  // ----------------------------------------------------------------

  /**
   * Query the database for a session's messages (filtered by sessionId),
   * populate the in-memory cache, and return them in chronological order.
   * Called on join so the user sees their previous conversation even after
   * a server restart that cleared the cache. Also captures createdAt so the
   * join handler can send timestamps to the frontend.
   */
  async loadSessionHistory(
    tenantId: string,
    sessionId: string,
  ): Promise<Array<ConversationMessage & { createdAt: Date }>> {
    try {
      const db = getPrismaClient()
      const agent = await db.hermesAgent.findUnique({
        where: { companyId: tenantId },
        select: { id: true },
      })
      if (!agent) return []

      // Newest-first, take the retention cap, then reverse to chronological.
      const rows = await db.agentMessage.findMany({
        where: { agentId: agent.id, sessionId },
        orderBy: { createdAt: 'desc' },
        take: 60, // generous upper bound; retention cap prunes anyway
        select: { role: true, content: true, createdAt: true },
      })

      const history = rows.reverse().map((r) => ({
        role: (r.role === 'user' ? 'user' : 'assistant') as ConversationMessage['role'],
        content: r.content,
        createdAt: r.createdAt,
      }))

      // Populate the cache (without createdAt — cache stores ConversationMessage)
      const cacheHistory: ConversationMessage[] = history.map(({ role, content }) => ({ role, content }))
      this.messagesCache.set(messagesCacheKey(tenantId, sessionId), cacheHistory)

      return history
    } catch (err: any) {
      console.error(`[DatabaseTenantProvider] loadSessionHistory failed for ${tenantId}/${sessionId}:`, err.message || err)
      return []
    }
  }

  // ----------------------------------------------------------------
  // TenantProvider — addMessage (sync cache update, async persist)
  // ----------------------------------------------------------------

  addMessage(tenantId: string, message: ConversationMessage, sessionId?: string | null): void {
    // Append to in-memory cache immediately so getConversationHistory()
    // returns the new message on subsequent calls. Cache is per-session.
    const key = messagesCacheKey(tenantId, sessionId ?? null)
    const messages = this.messagesCache.get(key) ?? []
    messages.push(message)
    this.messagesCache.set(key, messages)

    // Persist to database (fire-and-forget)
    this.persistMessage(tenantId, message, sessionId ?? null).catch((err) => {
      console.error(
        `[DatabaseTenantProvider] Failed to persist message for ${tenantId}:`,
        err,
      )
    })
  }

  /**
   * Persists a conversation message to the database.
   * Ensures a HermesAgent record exists for the tenant before
   * inserting the message, tagged with the active sessionId.
   */
  private async persistMessage(
    tenantId: string,
    message: ConversationMessage,
    sessionId: string | null,
  ): Promise<void> {
    const db = getPrismaClient()

    // Find or create the HermesAgent record
    let agentId: string
    const existing = await db.hermesAgent.findUnique({
      where: { companyId: tenantId },
      select: { id: true },
    })

    if (existing) {
      agentId = existing.id
    } else {
      const created = await db.hermesAgent.create({
        data: { companyId: tenantId },
        select: { id: true },
      })
      agentId = created.id
    }

    await db.agentMessage.create({
      data: {
        agentId,
        role: message.role,
        content: message.content,
        ...(sessionId ? { sessionId } : {}),
      },
    })
  }

  // ----------------------------------------------------------------
  // TenantProvider — clearSessionCache
  // ----------------------------------------------------------------

  clearSessionCache(tenantId: string, sessionId?: string | null): void {
    this.messagesCache.delete(messagesCacheKey(tenantId, sessionId ?? null))
  }

  // ----------------------------------------------------------------
  // TenantProvider — pruneMessages (hard-delete old AgentMessage rows)
  // ----------------------------------------------------------------

  /**
   * Hard-delete every AgentMessage older than the `keepCount`-th newest for
   * this tenant. Chat sessions are NOT preserved — only the most recent N
   * messages survive in the database. Returns the number of rows deleted.
   *
   * Implementation: find the createdAt of the (keepCount+1)-th newest message
   * (skip keepCount, take 1), then deleteMany everything older than that
   * cutoff. Two queries total — efficient even for large histories.
   */
  async pruneMessages(tenantId: string, keepCount: number): Promise<number> {
    try {
      const db = getPrismaClient()
      const agent = await db.hermesAgent.findUnique({
        where: { companyId: tenantId },
        select: { id: true },
      })
      if (!agent) return 0

      // Find the cutoff: the createdAt of the first message BEYOND keepCount
      // (newest-first). If there are ≤ keepCount messages, this returns [].
      const cutoff = await db.agentMessage.findMany({
        where: { agentId: agent.id },
        orderBy: { createdAt: 'desc' },
        skip: keepCount,
        take: 1,
        select: { createdAt: true },
      })
      if (cutoff.length === 0) return 0 // nothing to prune

      const result = await db.agentMessage.deleteMany({
        where: { agentId: agent.id, createdAt: { lt: cutoff[0].createdAt } },
      })
      return result.count
    } catch (err: any) {
      console.error(`[DatabaseTenantProvider] pruneMessages failed for ${tenantId}:`, err.message || err)
      return 0
    }
  }

  // ----------------------------------------------------------------
  // TenantProvider — pruneAllTenants (global boot-time sweep)
  // ----------------------------------------------------------------

  /**
   * Iterate every HermesAgent record and prune its messages to the applicable
   * cap: `superDevKeep` if the tenant has any SuperDev member, else
   * `normalKeep`. Runs once on service boot so existing piles are trimmed
   * immediately on (re)deploy — not just going forward.
   */
  async pruneAllTenants(normalKeep: number, superDevKeep: number): Promise<number> {
    let totalDeleted = 0
    try {
      const db = getPrismaClient()
      const agents = await db.hermesAgent.findMany({
        select: {
          id: true,
          companyId: true,
          company: {
            select: {
              members: {
                select: { user: { select: { isSuperDev: true } } },
              },
            },
          },
        },
      })

      for (const agent of agents) {
        const isSuperDev = agent.company.members.some((uc) => uc.user.isSuperDev)
        const keepCount = isSuperDev ? superDevKeep : normalKeep
        const deleted = await this.pruneMessages(agent.companyId, keepCount)
        if (deleted > 0) {
          console.log(`[DatabaseTenantProvider] Boot sweep: pruned ${deleted} messages for tenant ${agent.companyId} (keep=${keepCount}, superDev=${isSuperDev})`)
        }
        totalDeleted += deleted
      }
    } catch (err: any) {
      console.error('[DatabaseTenantProvider] pruneAllTenants failed:', err.message || err)
    }
    return totalDeleted
  }

  // ----------------------------------------------------------------
  // Cache Management (public utilities)
  // ----------------------------------------------------------------

  /**
   * Invalidates all in-memory caches for a specific tenant,
   * forcing fresh data on the next getTenant() call. Clears every session
   * bucket belonging to the tenant (keys prefixed with `${tenantId}:`).
   */
  invalidateTenantCache(tenantId: string): void {
    this.remindersCache.delete(tenantId)
    enabledCache.delete(tenantId)
    responseModeCache.delete(tenantId)
    // Drop every session bucket for this tenant (default + any sessionIds).
    for (const key of this.messagesCache.keys()) {
      if (key.startsWith(`${tenantId}:`)) {
        this.messagesCache.delete(key)
      }
    }
  }

  /**
   * Invalidates all caches for all tenants.
   */
  invalidateAllCaches(): void {
    this.remindersCache.clear()
    this.messagesCache.clear()
    enabledCache.clear()
    responseModeCache.clear()
  }

  /**
   * Returns diagnostic information about the cache state.
   * Useful for monitoring and debugging.
   */
  getCacheStats(): {
    enabledCacheSize: number
    remindersCacheSize: number
    messagesCacheSize: number
    connected: boolean
  } {
    return {
      enabledCacheSize: enabledCache.size,
      remindersCacheSize: this.remindersCache.size,
      messagesCacheSize: this.messagesCache.size,
      connected: this.connected,
    }
  }
}
