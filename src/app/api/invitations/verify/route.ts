import { NextRequest, NextResponse } from 'next/server';
import { withGuard } from '@/lib/route-guard';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// GET /api/invitations/verify?token=xxx - Verify invitation token
export const GET = withGuard({ auth: true }, async (request: NextRequest, ctx) => {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const invitation = await db.invitation.findUnique({
      where: { token },
      include: {
        company: {
          select: { id: true, name: true },
        },
      },
    });

    if (!invitation) {
      return NextResponse.json({ valid: false, error: 'Invitation not found' }, { status: 404 });
    }

    if (invitation.status !== 'PENDING') {
      return NextResponse.json({ valid: false, error: `Invitation already ${invitation.status.toLowerCase()}` });
    }

    if (invitation.expiresAt < new Date()) {
      await db.invitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      return NextResponse.json({ valid: false, error: 'Invitation has expired' });
    }

    return NextResponse.json({
      valid: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        companyName: invitation.company.name,
        companyId: invitation.company.id,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error) {
    logger.error('Verify invitation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
