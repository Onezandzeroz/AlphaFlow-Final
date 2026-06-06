import { NextResponse } from 'next/server';
import { withGuard } from '@/lib/route-guard';

export const GET = withGuard({ auth: false }, async () => {
  return NextResponse.json({ message: 'Hello, world!' });
});
