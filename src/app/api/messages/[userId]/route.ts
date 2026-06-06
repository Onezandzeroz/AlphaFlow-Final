import { NextResponse } from 'next/server';
import { tokenpay } from '@/lib/tokenpay';
import { withGuard } from '@/lib/route-guard';

// GET /api/messages/[userId]
export const GET = withGuard({ auth: true }, async (request, ctx, context) => {
  try {
    const { userId } = await context.params as { userId: string };
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

    const result = await tokenpay.getMessages(userId);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Messages API] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch messages';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
