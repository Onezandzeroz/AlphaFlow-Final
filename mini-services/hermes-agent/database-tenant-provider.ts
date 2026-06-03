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
} from './tenant-provider'

// ================================================================
// Prisma Singleton
// ================================================================

let prisma: PrismaClient | null = null

/**
 * Returns a singleton PrismaClient instance.
 * Uses DATABASE_URL from the environment if available,
 * otherwise falls back to the datasource URL in schema.prisma.
 */
function getPrismaClient(): PrismaClient {
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
  // In-memory caches populated by getTenant() for synchronous reads
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
      console.log('[DatabaseTenantProvider] Disconnected from database')
    }
  }

  // ----------------------------------------------------------------
  // TenantProvider — getTenant
  // ----------------------------------------------------------------

  async getTenant(tenantId: string): Promise<TenantData | null> {
    const db = getPrismaClient()

    try {
      // Compute the date range for transactions (last N months)
      const now = new Date()
      const transactionCutoff = new Date(now.getFullYear(), now.getMonth() - (ACCOUNTING_MONTHS - 1), 1)

      const company = await db.company.findUnique({
        where: { id: tenantId },
        include: {
          hermesAgent: {
            include: {
              reminders: true,
              messages: {
                orderBy: { createdAt: 'asc' },
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

      // --- Conversation history (last 20 messages, oldest first) ---
      const conversationHistory: ConversationMessage[] = (agent?.messages ?? []).map(
        (m) => ({
          role: (m.role === 'user' ? 'user' : 'assistant') as ConversationMessage['role'],
          content: m.content,
        }),
      )

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
      this.remindersCache.set(tenantId, notifications)
      this.messagesCache.set(tenantId, conversationHistory)

      // Update enabled cache from the agent record
      setCachedEnabled(tenantId, agent?.enabled ?? false)

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

    // 2. Cache miss or expired — fire async refresh, return false
    //    The cache will be updated for the next call within 30s.
    this.refreshEnabledCache(tenantId).catch(() => {
      // Silently handle — the cache will remain empty
    })

    return false
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

  getConversationHistory(tenantId: string): ConversationMessage[] {
    return this.messagesCache.get(tenantId) ?? []
  }

  // ----------------------------------------------------------------
  // TenantProvider — addMessage (sync cache update, async persist)
  // ----------------------------------------------------------------

  addMessage(tenantId: string, message: ConversationMessage): void {
    // Append to in-memory cache immediately so getConversationHistory()
    // returns the new message on subsequent calls
    const messages = this.messagesCache.get(tenantId) ?? []
    messages.push(message)
    this.messagesCache.set(tenantId, messages)

    // Persist to database (fire-and-forget)
    this.persistMessage(tenantId, message).catch((err) => {
      console.error(
        `[DatabaseTenantProvider] Failed to persist message for ${tenantId}:`,
        err,
      )
    })
  }

  /**
   * Persists a conversation message to the database.
   * Ensures a HermesAgent record exists for the tenant before
   * inserting the message.
   */
  private async persistMessage(tenantId: string, message: ConversationMessage): Promise<void> {
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
      },
    })
  }

  // ----------------------------------------------------------------
  // Cache Management (public utilities)
  // ----------------------------------------------------------------

  /**
   * Invalidates all in-memory caches for a specific tenant,
   * forcing fresh data on the next getTenant() call.
   */
  invalidateTenantCache(tenantId: string): void {
    this.remindersCache.delete(tenantId)
    this.messagesCache.delete(tenantId)
    enabledCache.delete(tenantId)
  }

  /**
   * Invalidates all caches for all tenants.
   */
  invalidateAllCaches(): void {
    this.remindersCache.clear()
    this.messagesCache.clear()
    enabledCache.clear()
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
