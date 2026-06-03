// ============================================================
// tenant-provider.ts — Tenant data interface + provider pattern
// ============================================================

// --------------- Data Types ---------------

export interface TenantMember {
  id: string
  name: string
  role: string
  email: string
}

export interface AccountingData {
  currentBalance: number
  recentIncome: number[]
  recentExpenses: number[]
  vatStatus: 'monthly' | 'quarterly' | 'annual'
  vatRate: number
  lastVatPeriod: string
  nextVatDeadline: string
  yearlyReportDeadline: string
  fiscalYearStart: string
  monthsOfData: number
}

export interface AgentNotification {
  id: string
  type: 'reminder'
  title: string
  description: string
  dueDate: string
  dismissed: boolean
}

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface TenantData {
  tenantId: string
  name: string
  cvr: string
  industry: string
  members: TenantMember[]
  accounting: AccountingData
  agentEnabled: boolean
  dataAccessEnabled: boolean
  notifications: AgentNotification[]
  conversationHistory: ConversationMessage[]
}

// --------------- Provider Interface ---------------

export interface TenantProvider {
  getTenant(tenantId: string): Promise<TenantData | null>
  isAgentEnabled(tenantId: string): boolean
  setAgentEnabled(tenantId: string, enabled: boolean): void
  getReminders(tenantId: string): AgentNotification[]
  dismissReminder(tenantId: string, reminderId: string): void
  getConversationHistory(tenantId: string): ConversationMessage[]
  addMessage(tenantId: string, message: ConversationMessage): void
}

// --------------- Helpers ---------------

/** Returns an ISO date string `days` from now (YYYY-MM-DD). */
export function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

// --------------- Mock Tenant Provider ---------------

/**
 * In-memory mock provider with 3 pre-configured Danish tenants.
 * Useful for development and testing without a database.
 */
export class MockTenantProvider implements TenantProvider {
  private tenants = new Map<string, TenantData>()

  constructor() {
    this.tenants = this.createMockTenants()
    console.log(`[MockTenantProvider] Initialized with ${this.tenants.size} tenants: ${Array.from(this.tenants.keys()).join(', ')}`)
  }

  async getTenant(tenantId: string): Promise<TenantData | null> {
    return this.tenants.get(tenantId) ?? null
  }

  isAgentEnabled(tenantId: string): boolean {
    return this.tenants.get(tenantId)?.agentEnabled ?? true
  }

  setAgentEnabled(tenantId: string, enabled: boolean): void {
    const tenant = this.tenants.get(tenantId)
    if (tenant) tenant.agentEnabled = enabled
  }

  getReminders(tenantId: string): AgentNotification[] {
    return this.tenants.get(tenantId)?.notifications ?? []
  }

  dismissReminder(tenantId: string, reminderId: string): void {
    const tenant = this.tenants.get(tenantId)
    if (!tenant) return
    const notif = tenant.notifications.find(n => n.id === reminderId)
    if (notif) notif.dismissed = true
  }

  getConversationHistory(tenantId: string): ConversationMessage[] {
    return this.tenants.get(tenantId)?.conversationHistory ?? []
  }

  addMessage(tenantId: string, message: ConversationMessage): void {
    const tenant = this.tenants.get(tenantId)
    if (tenant) tenant.conversationHistory.push(message)
  }

  // --------------- Private: Mock Data ---------------

  private createMockTenants(): Map<string, TenantData> {
    const tenants = new Map<string, TenantData>()
    const now = new Date()
    const currentYear = now.getFullYear()

    // --- Tenant 1: AlphaFlow ApS ---
    tenants.set('alphaflow-aps', {
      tenantId: 'alphaflow-aps',
      name: 'AlphaFlow ApS',
      cvr: '12345678',
      industry: 'IT-konsulentvirksomhed',
      members: [
        { id: 'u1', name: 'Mikkel Andersen', role: 'Direktør', email: 'mikkel@alphaflow.dk' },
        { id: 'u2', name: 'Sofie Larsen', role: 'Bogholder', email: 'sofie@alphaflow.dk' },
        { id: 'u3', name: 'Jakob Nielsen', role: 'Udvikler', email: 'jakob@alphaflow.dk' },
      ],
      accounting: {
        currentBalance: 1_245_000,
        recentIncome: [320_000, 285_000, 410_000, 375_000, 395_000, 430_000],
        recentExpenses: [210_000, 195_000, 240_000, 220_000, 230_000, 250_000],
        vatStatus: 'monthly',
        vatRate: 0.25,
        lastVatPeriod: `${currentYear}-08`,
        nextVatDeadline: daysFromNow(5),
        yearlyReportDeadline: `${currentYear + 1}-06-30`,
        fiscalYearStart: `${currentYear - 1}-01-01`,
        monthsOfData: 6,
      },
      agentEnabled: true,
      dataAccessEnabled: true,
      notifications: [
        {
          id: 'n1',
          type: 'reminder',
          title: 'Moms indberetning for september',
          description: 'Momsangivelse for perioden 1/9 - 30/9 skal indberettes til SKAT inden for 5 dage.',
          dueDate: daysFromNow(5),
          dismissed: false,
        },
        {
          id: 'n2',
          type: 'reminder',
          title: 'Kvartalsafslutning Q3',
          description: 'Tredje kvartal afsluttes ved månedsskiftet. Husk at afstemme bankkonti og debitorkonto.',
          dueDate: daysFromNow(15),
          dismissed: false,
        },
        {
          id: 'n3',
          type: 'reminder',
          title: 'Lønsedler oktober',
          description: 'October lønkørsel skal være klar senest den 28. i måneden.',
          dueDate: daysFromNow(23),
          dismissed: false,
        },
      ],
      conversationHistory: [],
    })

    // --- Tenant 2: Nordisk Smørrebrød A/S ---
    tenants.set('nordisk-smorrebrod', {
      tenantId: 'nordisk-smorrebrod',
      name: 'Nordisk Smørrebrød A/S',
      cvr: '87654321',
      industry: 'Restaurant og catering',
      members: [
        { id: 'u4', name: 'Karen Jensen', role: 'Adm. direktør', email: 'karen@nordisksmorrebrod.dk' },
        { id: 'u5', name: 'Peter Madsen', role: 'Økonomichef', email: 'peter@nordisksmorrebrod.dk' },
        { id: 'u6', name: 'Anne Sørensen', role: 'Køkkenchef', email: 'anne@nordisksmorrebrod.dk' },
        { id: 'u7', name: 'Lars Petersen', role: 'Tjener', email: 'lars@nordisksmorrebrod.dk' },
      ],
      accounting: {
        currentBalance: 485_000,
        recentIncome: [620_000, 580_000, 710_000, 650_000, 690_000, 725_000],
        recentExpenses: [510_000, 490_000, 560_000, 530_000, 545_000, 570_000],
        vatStatus: 'quarterly',
        vatRate: 0.25,
        lastVatPeriod: `${currentYear}-Q2`,
        nextVatDeadline: daysFromNow(45),
        yearlyReportDeadline: `${currentYear + 1}-06-30`,
        fiscalYearStart: `${currentYear - 1}-01-01`,
        monthsOfData: 6,
      },
      agentEnabled: true,
      dataAccessEnabled: true,
      notifications: [
        {
          id: 'n4',
          type: 'reminder',
          title: 'Kvartalsmoms Q3 indberetning',
          description: 'Kvartalsmoms for Q3 2025 skal indberettes inden 45 dage.',
          dueDate: daysFromNow(45),
          dismissed: false,
        },
        {
          id: 'n5',
          type: 'reminder',
          title: 'Fødevaregodkendelse fornyelse',
          description: 'Fødevarestyrelsens godkendelse skal fornyes inden årets udgang.',
          dueDate: daysFromNow(90),
          dismissed: false,
        },
      ],
      conversationHistory: [],
    })

    // --- Tenant 3: København Legal Partners ---
    tenants.set('koebenhavn-legal', {
      tenantId: 'koebenhavn-legal',
      name: 'København Legal Partners',
      cvr: '11223344',
      industry: 'Advokatvirksomhed',
      members: [
        { id: 'u8', name: 'Henrik Mortensen', role: 'Partner', email: 'henrik@klp.dk' },
        { id: 'u9', name: 'Maria Christensen', role: 'Advokat', email: 'maria@klp.dk' },
        { id: 'u10', name: 'Thomas Berg', role: 'Advokatfuldmægtig', email: 'thomas@klp.dk' },
      ],
      accounting: {
        currentBalance: 3_820_000,
        recentIncome: [890_000, 920_000, 1_050_000, 980_000, 1_100_000, 1_020_000],
        recentExpenses: [620_000, 640_000, 710_000, 680_000, 730_000, 690_000],
        vatStatus: 'annual',
        vatRate: 0.25,
        lastVatPeriod: `${currentYear - 1}`,
        nextVatDeadline: `${currentYear}-09-01`,
        yearlyReportDeadline: `${currentYear}-06-30`,
        fiscalYearStart: `${currentYear - 1}-07-01`,
        monthsOfData: 6,
      },
      agentEnabled: true,
      dataAccessEnabled: true,
      notifications: [
        {
          id: 'n6',
          type: 'reminder',
          title: 'Årsrapport deadline approaching',
          description: 'Årsrapporten for sidste regnskabsår skal indsendes til Erhvervsstyrelsen inden d. 30. juni.',
          dueDate: `${currentYear}-06-30`,
          dismissed: false,
        },
        {
          id: 'n7',
          type: 'reminder',
          title: 'Årlig momsopgørelse',
          description: 'Den årlige momsopgørelse skal indberettes til SKAT inden 1. september.',
          dueDate: `${currentYear}-09-01`,
          dismissed: false,
        },
        {
          id: 'n8',
          type: 'reminder',
          title: 'F-skattenummer fornyelse',
          description: 'F-skattenummer skal fornyes. Kontakt SKAT for at bekræfte gyldighed.',
          dueDate: daysFromNow(30),
          dismissed: false,
        },
      ],
      conversationHistory: [],
    })

    return tenants
  }
}

// ============================================================
// SKELETON: YourDatabaseTenantProvider
// ============================================================
//
// Uncomment and implement this to connect to a real database.
// This example shows the shape using Prisma-style queries.
//
// export class YourDatabaseTenantProvider implements TenantProvider {
//   constructor(private db: PrismaClient) {}
//
//   async getTenant(tenantId: string): Promise<TenantData | null> {
//     const tenant = await this.db.tenant.findUnique({
//       where: { id: tenantId },
//       include: { members: true, agent: true, reminders: true },
//     })
//     if (!tenant) return null
//     return mapToTenantData(tenant)
//   }
//
//   isAgentEnabled(tenantId: string): boolean {
//     // Query agent config or cache
//     return true // implement
//   }
//
//   setAgentEnabled(tenantId: string, enabled: boolean): void {
//     // this.db.hermesAgent.upsert(...)
//   }
//
//   getReminders(tenantId: string): AgentNotification[] {
//     // this.db.agentReminder.findMany({ where: { tenantId, dismissed: false } })
//     return [] // implement
//   }
//
//   dismissReminder(tenantId: string, reminderId: string): void {
//     // this.db.agentReminder.update({ where: { id: reminderId }, data: { dismissed: true } })
//   }
//
//   getConversationHistory(tenantId: string): ConversationMessage[] {
//     // this.db.agentMessage.findMany(...)
//     return [] // implement
//   }
//
//   addMessage(tenantId: string, message: ConversationMessage): void {
//     // this.db.agentMessage.create({ data: { tenantId, ...message } })
//   }
// }
