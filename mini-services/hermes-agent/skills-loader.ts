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
// ============================================================

interface SkillPrompt {
  name: string
  prompt: string
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
 * @returns Array of { name, prompt } for each enabled skill
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
 * Invalidates the skill prompt cache (e.g. when a skill is toggled).
 */
export function invalidateSkillCache(): void {
  cacheExpiry = 0
}
