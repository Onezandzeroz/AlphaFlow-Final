import { NextRequest, NextResponse } from 'next/server';
import { tokenpay } from '@/lib/tokenpay';
import { withGuard } from '@/lib/route-guard';

// POST /api/proof-upload
export const POST = withGuard({ auth: true }, async (request) => {
  try {
    const formData = await request.formData();
    const userId = formData.get('userId') as string | null;
    const proofFile = formData.get('proofFile') as File | null;

    if (!proofFile) {
      return NextResponse.json(
        { error: 'Missing proofFile' },
        { status: 400 }
      );
    }

    if (!proofFile.name.toLowerCase().endsWith('.tbkey')) {
      return NextResponse.json(
        { error: 'proofFile must be a .tbkey encrypted proof file (not .zip or other format)' },
        { status: 400 }
      );
    }

    // Re-build FormData for the service
    const serviceFormData = new FormData();
    if (userId) {
      serviceFormData.append('userId', userId);
    }
    serviceFormData.append('proofFile', proofFile);

    const result = await tokenpay.uploadProof(serviceFormData);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Proof Upload API] Error:', error);
    const message = error instanceof Error ? error.message : 'Proof upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
