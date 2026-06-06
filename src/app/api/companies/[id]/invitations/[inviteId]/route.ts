import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { logger } from '@/lib/logger';
import { auditCancel, requestMetadata } from '@/lib/audit';

// DELETE /api/companies/[id]/invitations/[inviteId] - Revoke invitation
export const DELETE = withGuard(routeConfig['/api/companies/[id]/invitations/[inviteId]'].DELETE!, async (request, ctx, segmentData) => {
  try {
    const companyId = segmentData?.id as string;
    const inviteId = segmentData?.inviteId as string;

    const invitation = await db.invitation.findFirst({
      where: { id: inviteId, companyId },
    });

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    // Audit: log invitation revocation before updating
    await auditCancel(ctx.id, 'Invitation', inviteId, 'Revoked by ' + ctx.id, requestMetadata(request), ctx.activeCompanyId);

    await db.invitation.update({
      where: { id: inviteId },
      data: { status: 'REVOKED' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Revoke invitation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
