import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { logger } from '@/lib/logger';

/**
 * GET /api/hermes/skills
 * Returns all available skills + the tenant's enabled/disabled state for each.
 * SuperDev only — tenants cannot see or manage skills directly.
 * If tenants want to know which skills Hermes has, they can ask Hermes.
 */
export const GET = withGuard(routeConfig['/api/hermes/skills'].GET!, async (request, ctx) => {
  try {
    // Get all skills from the catalog
    const allSkills = await db.hermesSkill.findMany({
      orderBy: [{ isBuiltIn: 'desc' }, { name: 'asc' }],
    });

    // For SuperDev, we show global skills state (enabledByDefault).
    // The SuperDev toggles are global — when they toggle a skill, it affects
    // ALL tenants (enabledByDefault flag on the skill itself).
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
      // For the admin UI, "enabled" means enabledByDefault (global toggle)
      enabled: skill.enabledByDefault,
    }))

    return NextResponse.json({ skills })
  } catch (error) {
    logger.error('[HERMES SKILLS] Failed to fetch skills:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})

/**
 * POST /api/hermes/skills
 * Toggle a skill globally on/off (SuperDev only).
 * When SuperDev disables a skill, it stops being injected for ALL tenants.
 * Body: { skillId: string, enabled: boolean }
 */
export const POST = withGuard(routeConfig['/api/hermes/skills'].POST!, async (request, ctx) => {
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

    // Update the global enabledByDefault flag — this controls whether the skill
    // is active for ALL tenants (the skills/prompts API reads this flag)
    await db.hermesSkill.update({
      where: { id: skillId },
      data: { enabledByDefault: enabled },
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
export const PUT = withGuard(routeConfig['/api/hermes/skills'].PUT!, async (request, ctx) => {
  try {
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
export const DELETE = withGuard(routeConfig['/api/hermes/skills'].DELETE!, async (request, ctx) => {
  try {
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
