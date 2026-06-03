// ============================================================
// index.ts — Hermes Agent Socket.IO Server
// ============================================================
// Clean entry point that wires together config, knowledge base,
// tenant provider, and utility modules into a running server.
// ============================================================

import { createServer } from 'http'
import { Server } from 'socket.io'
import ZAI from 'z-ai-web-dev-sdk'

import { defaultConfig, type HermesConfig } from './config'
import { buildSystemPrompt } from './knowledge-base'
import { MockTenantProvider, type TenantProvider, type TenantData } from './tenant-provider'
import { DatabaseTenantProvider } from './database-tenant-provider'
import { splitIntoChunks, buildTenantContext } from './utils'

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

// --------------- In-Memory Socket State ---------------

interface SocketMeta {
  socketId: string
  tenantId: string
  userId: string
  userName: string
}

const connectedSockets = new Map<string, SocketMeta>()   // socketId -> meta
const tenantSockets = new Map<string, string[]>()         // tenantId -> [socketId, ...]

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

    // Get or create tenant
    let tenant = await tenantProvider.getTenant(tenantId)
    if (!tenant) {
      console.log(`[Hermes] Unknown tenant "${tenantId}", using defaults`)
      tenant = createDefaultTenant(tenantId)
    }

    // Acknowledge join
    socket.emit('join-ack', {
      status: 'joined',
      agentEnabled: tenantProvider.isAgentEnabled(tenantId),
      tenantName: tenant.name,
    })

    // If agent is enabled, send welcome
    if (tenantProvider.isAgentEnabled(tenantId)) {
      socket.emit('agent-welcome', {
        message: `Hej ${userName}! 👋 Jeg er ${config.agentName}, din AI-regnskabskonsulent for ${tenant.name}. Hvordan kan jeg hjælpe dig i dag?`,
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
      socket.emit('chat-error', { error: 'Socket not associated with this tenant' })
      return
    }

    const tenant = await tenantProvider.getTenant(tenantId)
    if (!tenant) {
      socket.emit('chat-error', { error: `Unknown tenant: ${tenantId}` })
      return
    }

    console.log(`[Hermes] Chat from "${meta.userName}" in "${tenant.name}": ${message.slice(0, 80)}...`)

    // Store user message
    tenantProvider.addMessage(tenantId, { role: 'user', content: message })

    // Emit typing indicator
    socket.emit('chat-typing', { typing: true })

    try {
      // Build conversation history for context
      const history = tenantProvider.getConversationHistory(tenantId).slice(-config.maxConversationHistory)
      const historyText = history
        .map(msg => `${msg.role === 'user' ? 'Bruger' : config.agentName}: ${msg.content}`)
        .join('\n')

      // Build full prompt
      const systemPrompt = buildSystemPrompt(config.agentName, config.defaultLanguage)
      const tenantContext = buildTenantContext(tenant)
      const fullPrompt = `${systemPrompt}\n\n${tenantContext}\n\nSAMTALESHISTORIK:\n${historyText}\n\nBruger: ${message}\n\n${config.agentName}:`

      // Call LLM
      const zai = await ZAI.create()
      const completion = await zai.chat.completions.create({
        messages: [{ role: 'assistant', content: fullPrompt }],
        thinking: { type: 'disabled' },
      })

      const fullResponse = completion.choices?.[0]?.message?.content || 'Beklager, jeg kunne ikke generere et svar.'

      // Store assistant response
      tenantProvider.addMessage(tenantId, { role: 'assistant', content: fullResponse })

      // Simulate streaming
      const chunks = splitIntoChunks(fullResponse, config.streamingChunkSize)
      for (const chunk of chunks) {
        socket.emit('chat-response', { chunk, done: false })
        await new Promise(resolve => setTimeout(resolve, config.streamingChunkDelay))
      }

      socket.emit('chat-complete', { fullResponse, done: true })
      console.log(`[Hermes] Response sent to "${meta.userName}" (${fullResponse.length} chars)`)
    } catch (error: any) {
      console.error(`[Hermes] LLM Error:`, error.message || error)
      socket.emit('chat-error', { error: 'Kunne ikke få svar fra Hermes. Prøv igen senere.' })
    }
  })

  // ----- toggle-agent -----
  socket.on('toggle-agent', (data: { tenantId: string; enabled: boolean }) => {
    const { tenantId, enabled } = data
    const meta = connectedSockets.get(socket.id)

    if (!meta || meta.tenantId !== tenantId) {
      socket.emit('chat-error', { error: 'Socket not associated with this tenant' })
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
    name: tenantId,
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
// Start Server
// ============================================================

httpServer.listen(config.port, () => {
  console.log(`[Hermes] 🏛️  ${config.agentName} Agent service running on port ${config.port}`)
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
