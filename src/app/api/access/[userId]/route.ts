import { NextResponse } from 'next/server';
import { tokenpay } from '@/lib/tokenpay';
import { checkOwnerAccess } from '@/lib/access-guard';
import { withGuard } from '@/lib/route-guard';

// GET /api/access/[userId]
export const GET = withGuard({ auth: true }, async (request, ctx, segmentData) => {
  try {
    const userId = segmentData?.userId as string;
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // ─── Owner bypass: AlphaAi owner always has read_write ───
    const ownerAccess = await checkOwnerAccess(userId);
    if (ownerAccess) {
      return NextResponse.json(ownerAccess);
    }

    // ─── Normal flow: check TokenPay service ────────────────────
    const access = await tokenpay.checkAccess(userId);
    return NextResponse.json(access);
  } catch (error) {
    console.error('[Access API] Error:', error);
    const message = error instanceof Error ? error.message : 'Access check failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
