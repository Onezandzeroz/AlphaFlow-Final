import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/session';
import { auditAuth, requestMetadata } from '@/lib/audit';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';
import { withGuard } from '@/lib/route-guard';

export const POST = withGuard({ auth: true }, async (request, ctx) => {
  try {
    const cookieStore = await cookies();

    // Destroy session from cookie
    await destroySession();

    // Clear the session cookie
    cookieStore.delete('session');

    // Also clear old userId cookie if it exists (migration)
    cookieStore.delete('userId');

    // Audit logout
    if (ctx) {
      await auditAuth(ctx.id, 'LOGOUT', requestMetadata(request), ctx.activeCompanyId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
