import { NextRequest, NextResponse } from 'next/server';
import { tokenpay } from '@/lib/tokenpay';
import { withGuard } from '@/lib/route-guard';

// POST /api/proof-activate
export const POST = withGuard({ auth: true }, async (request) => {
  try {
    const body = await request.json();
    const { userId, proofId } = body;

    if (!userId || !proofId) {
      return NextResponse.json(
        { error: 'Missing userId or proofId' },
        { status: 400 }
      );
    }

    const result = await tokenpay.activateProof(userId, proofId);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Proof Activate API] Error:', error);
    const message = error instanceof Error ? error.message : 'Proof activation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
