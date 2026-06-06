import { NextResponse } from 'next/server';
import { VAT_CODE_TO_PUBLIC_MAPPING } from '@/lib/standard-chart-of-accounts';
import { withGuard } from '@/lib/route-guard';

// GET - Return the full VAT code mapping table (read-only reference data, no auth required)
export const GET = withGuard(
  { auth: false },
  async () => {
    return NextResponse.json({ mappings: VAT_CODE_TO_PUBLIC_MAPPING });
  }
);
