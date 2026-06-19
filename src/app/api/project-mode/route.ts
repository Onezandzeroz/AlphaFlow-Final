import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { SESSION_COOKIE_NAME } from '@/lib/session';
import { logger } from '@/lib/logger';
import { cookies } from 'next/headers';
import { auditLog, requestMetadata } from '@/lib/audit';
import { withGuard } from '@/lib/route-guard';

// ─── GET: Check project mode status ──────────────────────────────

export const GET = withGuard({ auth: true }, async (request, ctx) => {
  try {
    return NextResponse.json({
      projectModeEnabled: ctx.projectModeEnabled,
      activeProjectId: ctx.activeProjectId,
      activeProjectName: ctx.activeProjectName,
      activeProjectColor: ctx.activeProjectColor,
      activeProjectStatus: ctx.activeProjectStatus,
      isProjectMode: ctx.isProjectMode,
    });
  } catch (error) {
    logger.error('[Project Mode GET] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

// ─── POST: Enter / Exit project mode ─────────────────────────────

export const POST = withGuard(
  { auth: true, requireCompany: true, blockOversight: true },
  async (request, ctx) => {
    try {
      const body = await request.json();
      const { action, projectId } = body as {
        action: 'enter' | 'exit';
        projectId?: string;
      };

      if (action !== 'enter' && action !== 'exit') {
        return NextResponse.json(
          { error: 'Invalid action. Must be "enter" or "exit".' },
          { status: 400 }
        );
      }

      // ── SuperDev gate: project mode must be enabled for this tenant ──
      // SuperDev (AppOwner) bypasses this so they can enter/exit project mode
      // in any tenant to test + inspect — including their own AlphaAi tenant
      // where projectModeEnabled defaults to false.
      if (!ctx.projectModeEnabled && !ctx.isSuperDev) {
        return NextResponse.json(
          {
            error: 'Projekt-tilstand er ikke aktiveret for denne virksomhed',
            code: 'PROJECT_MODE_DISABLED',
          },
          { status: 403 }
        );
      }

      const cookieStore = await cookies();
      const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

      if (action === 'enter') {
        if (!projectId) {
          return NextResponse.json(
            { error: 'projectId is required to enter project mode' },
            { status: 400 }
          );
        }

        // Verify the project exists, belongs to the active company, and is ACTIVE.
        // `ctx.activeCompanyId` is guaranteed non-null by the route guard's
        // `requireCompany: true` config — the `!` asserts that to TypeScript.
        const project = await db.project.findFirst({
          where: {
            id: projectId,
            companyId: ctx.activeCompanyId!,
            status: 'ACTIVE',
          },
          select: {
            id: true,
            name: true,
            color: true,
            status: true,
            companyId: true,
            startDate: true,
            endDate: true,
          },
        });

        if (!project) {
          return NextResponse.json(
            {
              error: 'Projektet blev ikke fundet, tilhører ikke virksomheden, eller er ikke aktivt',
              code: 'PROJECT_NOT_FOUND',
            },
            { status: 404 }
          );
        }

        // Persist activeProjectId on the session row
        if (token) {
          await db.session.update({
            where: { token },
            data: { activeProjectId: project.id },
          });
        }

        await auditLog({
          action: 'UPDATE',
          entityType: 'Project',
          entityId: project.id,
          userId: ctx.id,
          companyId: ctx.activeCompanyId,
          changes: { projectMode: { old: null, new: 'enter' } },
          metadata: requestMetadata(request),
        });

        logger.info(`[Project Mode] User ${ctx.id} entered project ${project.id}`);

        return NextResponse.json({
          message: 'Project mode entered',
          isProjectMode: true,
          activeProjectId: project.id,
          activeProjectName: project.name,
          activeProjectColor: project.color,
          activeProjectStatus: project.status,
          activeProjectStartDate: project.startDate ? project.startDate.toISOString() : null,
          activeProjectEndDate: project.endDate ? project.endDate.toISOString() : null,
        });
      }

      // ── Exit project mode ──────────────────────────────────────
      const previousProjectId = ctx.activeProjectId;

      if (token) {
        await db.session.update({
          where: { token },
          data: { activeProjectId: null },
        });
      }

      if (previousProjectId) {
        await auditLog({
          action: 'UPDATE',
          entityType: 'Project',
          entityId: previousProjectId,
          userId: ctx.id,
          companyId: ctx.activeCompanyId,
          changes: { projectMode: { old: 'enter', new: 'exit' } },
          metadata: requestMetadata(request),
        });
      }

      logger.info(`[Project Mode] User ${ctx.id} exited project mode`);

      return NextResponse.json({
        message: 'Project mode exited',
        isProjectMode: false,
        activeProjectId: null,
        activeProjectName: null,
        activeProjectColor: null,
        activeProjectStatus: null,
      });
    } catch (error) {
      logger.error('[Project Mode POST] Error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
