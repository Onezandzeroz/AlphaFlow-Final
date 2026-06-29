import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/hermes/skills/prompts?companyId=...&lang=...
 * Returns the system prompt fragments for all globally enabled skills.
 * Used by hermes-agent to inject skill instructions into the system prompt.
 *
 * Skills are managed globally by the App Owner (SuperDev).
 * The enabledByDefault flag on HermesSkill determines whether the skill
 * is active for ALL tenants. There is no per-tenant skill toggle.
 *
 * Query params:
 *   companyId (required) — the tenant's company ID (for context, not filtering)
 *   lang     (optional)  — "da" or "en", default "en"
 *   key      (required)  — HERMES_ADMIN_KEY for auth
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    const lang = searchParams.get('lang') || 'en'
    const key = searchParams.get('key')

    // Auth check — same shared secret as knowledge-service
    const adminKey = process.env.HERMES_ADMIN_KEY || process.env.OPENROUTER_API_KEY || ''
    if (!key || key !== adminKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
    }

    // Fetch all globally enabled skills (enabledByDefault = true)
    const enabledSkills = await db.hermesSkill.findMany({
      where: { enabledByDefault: true },
      orderBy: [{ isBuiltIn: 'desc' }, { name: 'asc' }],
    })

    // Build prompt fragments — use language-specific version if available
    const prompts = enabledSkills.map(skill => {
      const prompt = (lang === 'da' && skill.promptDa) ? skill.promptDa : skill.promptEn
      return {
        name: skill.name,
        prompt,
        descriptionEn: skill.descriptionEn,
        descriptionDa: skill.descriptionDa,
      }
    })

    return NextResponse.json({ prompts })
  } catch (error) {
    console.error('[HERMES SKILLS PROMPTS] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
