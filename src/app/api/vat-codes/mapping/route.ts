import { NextResponse } from 'next/server';
import { VAT_CODE_TO_PUBLIC_MAPPING } from '@/lib/standard-chart-of-accounts';

// GET - Return the full VAT code mapping table (read-only reference data, no auth required)
export async function GET() {
  return NextResponse.json({ mappings: VAT_CODE_TO_PUBLIC_MAPPING });
}
