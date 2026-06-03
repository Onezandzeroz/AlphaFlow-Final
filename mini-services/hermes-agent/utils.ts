// ============================================================
// utils.ts — Shared helpers
// ============================================================

import type { TenantData } from './tenant-provider'

// --------------- Text Chunking ---------------

/**
 * Splits text into word-boundary-aligned chunks for simulated streaming.
 *
 * @param text    - The full text to split
 * @param maxLen  - Maximum characters per chunk (default 20)
 */
export function splitIntoChunks(text: string, maxLen: number = 20): string[] {
  if (!text) return []
  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining)
      break
    }

    // Try to split at a word boundary within maxLen
    let splitIdx = maxLen
    for (let i = maxLen; i >= Math.max(0, maxLen - 10); i--) {
      if (remaining[i] === ' ' || remaining[i] === '\n') {
        splitIdx = i + 1
        break
      }
    }

    chunks.push(remaining.slice(0, splitIdx))
    remaining = remaining.slice(splitIdx)
  }

  return chunks
}

// --------------- Tenant Context Builder ---------------

/**
 * Builds a human-readable context block from tenant data that gets
 * injected into the LLM prompt so the agent can answer tenant-specific
 * questions.
 *
 * @param tenant - The full tenant data object
 */
export function buildTenantContext(tenant: TenantData): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec']
  const now = new Date()
  const recentMonths: string[] = []
  for (let i = tenant.accounting.monthsOfData - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    recentMonths.push(months[d.getMonth()])
  }

  const incomeLines = tenant.accounting.recentIncome.map((v, i) => `  ${recentMonths[i]}: ${v.toLocaleString('da-DK')} DKK`).join('\n')
  const expenseLines = tenant.accounting.recentExpenses.map((v, i) => `  ${recentMonths[i]}: ${v.toLocaleString('da-DK')} DKK`).join('\n')

  const totalIncome = tenant.accounting.recentIncome.reduce((a, b) => a + b, 0)
  const totalExpenses = tenant.accounting.recentExpenses.reduce((a, b) => a + b, 0)
  const netProfit = totalIncome - totalExpenses

  const memberList = tenant.members.map(m => `  - ${m.name} (${m.role}) - ${m.email}`).join('\n')
  const pendingNotifs = tenant.notifications
    .filter(n => !n.dismissed)
    .map(n => `  - [${n.dueDate}] ${n.title}: ${n.description}`)
    .join('\n')

  return `
---
CURRENT TENANT INFORMATION:
- Virksomhed: ${tenant.name}
- CVR-nummer: ${tenant.cvr}
- Branche: ${tenant.industry}

ANSVARLIGE PERSONER:
${memberList}

REGNSKABSOPLYSNINGER:
- Nuværende balance: ${tenant.accounting.currentBalance.toLocaleString('da-DK')} DKK
- Momsstatus: ${tenant.accounting.vatStatus === 'monthly' ? 'Månedlig' : tenant.accounting.vatStatus === 'quarterly' ? 'Kvartalsvis' : 'Årlig'} (${(tenant.accounting.vatRate * 100).toFixed(0)}%)
- Sidste momsperiode: ${tenant.accounting.lastVatPeriod}
- Næste momsddeadline: ${tenant.accounting.nextVatDeadline}
- Årsrapport deadline: ${tenant.accounting.yearlyReportDeadline}
- Regnskabsår starter: ${tenant.accounting.fiscalYearStart}

INDTÆGTER (seneste ${tenant.accounting.monthsOfData} måneder):
${incomeLines}
  Total: ${totalIncome.toLocaleString('da-DK')} DKK

UDGIFTER (seneste ${tenant.accounting.monthsOfData} måneder):
${expenseLines}
  Total: ${totalExpenses.toLocaleString('da-DK')} DKK

NETTORESULTAT: ${netProfit.toLocaleString('da-DK')} DKK

AFVENTENDE PÅMINDELSER:
${pendingNotifs || '  Ingen afventende påmindelser.'}
---`
}
