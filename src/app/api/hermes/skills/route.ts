import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { logger } from '@/lib/logger';

/**
 * GET /api/hermes/skills
 * Returns all available skills + the tenant's enabled/disabled state for each.
 */
export const GET = withGuard(routeConfig['/api/hermes/config'].GET!, async (request, ctx) => {
  try {
    // Get all skills from the catalog
    const allSkills = await db.hermesSkill.findMany({
      orderBy: [{ isBuiltIn: 'desc' }, { name: 'asc' }],
    });

    // Get tenant's agent to find enabled skills
    const agent = await db.hermesAgent.findUnique({
      where: { companyId: ctx.activeCompanyId! },
      include: {
        skills: {
          include: { skill: true },
        },
      },
    });

    // Build a map of skillId → enabled for the tenant
    const tenantSkillMap = new Map<string, boolean>()
    if (agent) {
      for (const as of agent.skills) {
        tenantSkillMap.set(as.skillId, as.enabled)
      }
    }

    // Merge catalog with tenant state
    const skills = allSkills.map(skill => ({
      id: skill.id,
      name: skill.name,
      version: skill.version,
      descriptionEn: skill.descriptionEn,
      descriptionDa: skill.descriptionDa,
      author: skill.author,
      sourceUrl: skill.sourceUrl,
      enabledByDefault: skill.enabledByDefault,
      isBuiltIn: skill.isBuiltIn,
      category: skill.category,
      // If tenant has an explicit record, use it; otherwise use enabledByDefault
      enabled: tenantSkillMap.has(skill.id)
        ? tenantSkillMap.get(skill.id)!
        : skill.enabledByDefault,
    }))

    return NextResponse.json({ skills })
  } catch (error) {
    logger.error('[HERMES SKILLS] Failed to fetch skills:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})

/**
 * POST /api/hermes/skills
 * Toggle a skill on/off for the current tenant.
 * Body: { skillId: string, enabled: boolean }
 */
export const POST = withGuard(routeConfig['/api/hermes/toggle'].POST!, async (request, ctx) => {
  try {
    const body = await request.json()
    const { skillId, enabled } = body

    if (!skillId || typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'skillId and enabled (boolean) are required' }, { status: 400 })
    }

    // Verify skill exists
    const skill = await db.hermesSkill.findUnique({ where: { id: skillId } })
    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
    }

    // Get or create the agent for this tenant
    let agent = await db.hermesAgent.findUnique({
      where: { companyId: ctx.activeCompanyId! },
    })
    if (!agent) {
      agent = await db.hermesAgent.create({
        data: { companyId: ctx.activeCompanyId! },
      })
    }

    // Upsert the agent-skill link
    await db.hermesAgentSkill.upsert({
      where: {
        agentId_skillId: { agentId: agent.id, skillId },
      },
      create: {
        agentId: agent.id,
        skillId,
        enabled,
      },
      update: { enabled },
    })

    return NextResponse.json({
      success: true,
      skillId,
      enabled,
    })
  } catch (error) {
    logger.error('[HERMES SKILLS] Failed to toggle skill:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})

/**
 * PUT /api/hermes/skills
 * Install a new skill to the catalog (SuperDev only).
 * Body: { name, descriptionEn, descriptionDa?, promptEn, promptDa?, ... }
 */
export const PUT = withGuard(routeConfig['/api/hermes/toggle'].POST!, async (request, ctx) => {
  try {
    // Only SuperDev can install skills
    if (!ctx.isSuperDev) {
      return NextResponse.json({ error: 'Only App Owner can install skills' }, { status: 403 })
    }

    const body = await request.json()
    const { name, version, descriptionEn, descriptionDa, author, sourceUrl, promptEn, promptDa, enabledByDefault, isBuiltIn, category } = body

    if (!name || !descriptionEn || !promptEn) {
      return NextResponse.json({ error: 'name, descriptionEn, and promptEn are required' }, { status: 400 })
    }

    const skill = await db.hermesSkill.upsert({
      where: { name },
      create: {
        name,
        version: version || '1.0.0',
        descriptionEn,
        descriptionDa: descriptionDa || null,
        author: author || null,
        sourceUrl: sourceUrl || null,
        promptEn,
        promptDa: promptDa || null,
        enabledByDefault: enabledByDefault ?? false,
        isBuiltIn: isBuiltIn ?? false,
        category: category || 'writing',
      },
      update: {
        version: version || undefined,
        descriptionEn,
        descriptionDa: descriptionDa || null,
        author: author || null,
        sourceUrl: sourceUrl || null,
        promptEn,
        promptDa: promptDa || null,
        enabledByDefault: enabledByDefault ?? undefined,
        isBuiltIn: isBuiltIn ?? undefined,
        category: category || undefined,
      },
    })

    return NextResponse.json({ success: true, skill })
  } catch (error) {
    logger.error('[HERMES SKILLS] Failed to install skill:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})

/**
 * DELETE /api/hermes/skills
 * Remove a skill from the catalog (SuperDev only, built-in skills cannot be deleted).
 * Body: { skillId: string }
 */
export const DELETE = withGuard(routeConfig['/api/hermes/toggle'].POST!, async (request, ctx) => {
  try {
    if (!ctx.isSuperDev) {
      return NextResponse.json({ error: 'Only App Owner can remove skills' }, { status: 403 })
    }

    const body = await request.json()
    const { skillId } = body

    if (!skillId) {
      return NextResponse.json({ error: 'skillId is required' }, { status: 400 })
    }

    const skill = await db.hermesSkill.findUnique({ where: { id: skillId } })
    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
    }
    if (skill.isBuiltIn) {
      return NextResponse.json({ error: 'Built-in skills cannot be removed' }, { status: 403 })
    }

    await db.hermesSkill.delete({ where: { id: skillId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('[HERMES SKILLS] Failed to remove skill:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
