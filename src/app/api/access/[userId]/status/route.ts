import { NextResponse } from 'next/server';
import { tokenpay } from '@/lib/tokenpay';
import { checkOwnerStatus } from '@/lib/access-guard';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';

// GET /api/access/[userId]/status
export const GET = withGuard({ auth: true }, async (request, ctx, context) => {
  try {
    const { userId } = await context.params as { userId: string };
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

    // ─── Owner bypass: AlphaAi owner always has read_write ───
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, businessName: true },
    });

    const ownerStatus = await checkOwnerStatus(
      userId,
      user?.email,
      user?.businessName || undefined
    );
    if (ownerStatus) {
      return NextResponse.json(ownerStatus);
    }

    // ─── Normal flow: check TokenPay service ────────────────────
    const status = await tokenpay.getUserStatus(userId);
    return NextResponse.json(status);
  } catch (error) {
    console.error('[Access Status API] Error:', error);
    const message = error instanceof Error ? error.message : 'Status check failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
