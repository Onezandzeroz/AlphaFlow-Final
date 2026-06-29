// ============================================================
// skills-loader.ts — Fetch active skill prompts from Next.js API
// ============================================================
// Hermes Agent fetches skill system prompt fragments from the
// Next.js API (which queries the Prisma DB). This keeps the
// skill catalog in one place (the main app's DB) and avoids
// duplicating DB access in the mini-service.
//
// Skills are injected into the system prompt as additional
// instructions, appended after the core knowledge base.
// A "skills awareness" section is also added so that tenants
// can ask Hermes which skills it has and get an accurate answer.
// ============================================================

interface SkillPrompt {
  name: string
  prompt: string
  descriptionEn: string
  descriptionDa: string | null
}

// In-memory cache with TTL — avoids hitting the API on every chat message
let cachedPrompts: SkillPrompt[] = []
let cachedCompanyId: string = ''
let cachedLang: string = ''
let cacheExpiry: number = 0
const CACHE_TTL_MS = 60_000 // 1 minute

/**
 * Fetches the active skill prompt fragments for a tenant.
 * Results are cached for 1 minute to avoid excessive API calls.
 *
 * @param companyId — The tenant's company ID
 * @param lang      — "da" or "en"
 * @returns Array of { name, prompt, descriptionEn, descriptionDa } for each enabled skill
 */
export async function fetchSkillPrompts(companyId: string, lang: string): Promise<SkillPrompt[]> {
  const now = Date.now()

  // Return cache if valid
  if (cachedCompanyId === companyId && cachedLang === lang && now < cacheExpiry) {
    return cachedPrompts
  }

  const adminKey = process.env.HERMES_ADMIN_KEY || process.env.OPENROUTER_API_KEY || ''
  if (!adminKey || !companyId) {
    return []
  }

  try {
    const baseUrl = process.env.NEXTJS_API_URL || 'http://localhost:3000'
    const url = `${baseUrl}/api/hermes/skills/prompts?companyId=${encodeURIComponent(companyId)}&lang=${lang}&key=${encodeURIComponent(adminKey)}`

    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })

    if (!response.ok) {
      console.warn(`[SkillsLoader] Failed to fetch skill prompts: ${response.status}`)
      return cachedPrompts // Return stale cache on failure
    }

    const data = await response.json() as { prompts: SkillPrompt[] }
    cachedPrompts = data.prompts || []
    cachedCompanyId = companyId
    cachedLang = lang
    cacheExpiry = now + CACHE_TTL_MS

    return cachedPrompts
  } catch (err: any) {
    console.warn(`[SkillsLoader] Error fetching skill prompts: ${err.message}`)
    return cachedPrompts // Return stale cache on error
  }
}

/**
 * Builds a "skills awareness" section for the system prompt.
 * This allows Hermes to answer tenant questions about which skills it has.
 *
 * @param skills — The active skill prompts
 * @param lang   — "da" or "en"
 */
export function buildSkillsAwareness(skills: SkillPrompt[], lang: string): string {
  if (skills.length === 0) {
    return lang === 'da'
      ? '\n\n# Færdigheder\n\nDu har i øjeblikket ingen aktive færdigheder udover din kerneviden om dansk regnskab.'
      : '\n\n# Skills\n\nYou currently have no active skills beyond your core Danish accounting knowledge.'
  }

  const isDa = lang === 'da'

  const skillList = skills.map(s => {
    const desc = (isDa && s.descriptionDa) ? s.descriptionDa : s.descriptionEn
    return `- **${s.name}**: ${desc}`
  }).join('\n')

  if (isDa) {
    return `\n\n# Færdigheder\n\nDu har følgende aktive færdigheder udover din kerneviden om dansk regnskab:\n\n${skillList}\n\nHvis en bruger spørger hvilke færdigheder du har, skal du nævne disse færdigheder og kort beskrive hvad de gør. Færdigheder styres af App Owner'en og er de samme for alle tenantvirksomheder.`
  }

  return `\n\n# Skills\n\nYou have the following active skills beyond your core Danish accounting knowledge:\n\n${skillList}\n\nIf a user asks which skills you have, mention these skills and briefly describe what they do. Skills are managed by the App Owner and are the same for all tenant companies.`
}

/**
 * Invalidates the skill prompt cache (e.g. when a skill is toggled).
 */
export function invalidateSkillCache(): void {
  cacheExpiry = 0
}
