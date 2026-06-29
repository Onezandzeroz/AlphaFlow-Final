import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/hermes/skills/prompts?companyId=...
 * Returns the concatenated system prompt fragments for all ENABLED skills
 * for a given tenant. Used by hermes-agent to inject skill instructions
 * into the system prompt.
 *
 * Query params:
 *   companyId (required) — the tenant's company ID
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

    // Find the agent for this tenant
    const agent = await db.hermesAgent.findUnique({
      where: { companyId },
      include: {
        skills: {
          where: { enabled: true },
          include: { skill: true },
        },
      },
    })

    if (!agent) {
      return NextResponse.json({ prompts: [] })
    }

    // Build prompt fragments — use language-specific version if available
    const prompts = agent.skills.map(as => {
      const skill = as.skill
      const prompt = (lang === 'da' && skill.promptDa) ? skill.promptDa : skill.promptEn
      return {
        name: skill.name,
        prompt,
      }
    })

    // Also include skills that are enabledByDefault but don't have an explicit
    // agent-skill record yet (new skills added to catalog after agent was created)
    const explicitSkillIds = new Set(agent.skills.map(as => as.skillId))
    const defaultSkills = await db.hermesSkill.findMany({
      where: {
        enabledByDefault: true,
        id: { notIn: [...explicitSkillIds] },
      },
    })

    for (const skill of defaultSkills) {
      const prompt = (lang === 'da' && skill.promptDa) ? skill.promptDa : skill.promptEn
      prompts.push({ name: skill.name, prompt })
    }

    return NextResponse.json({ prompts })
  } catch (error) {
    console.error('[HERMES SKILLS PROMPTS] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
