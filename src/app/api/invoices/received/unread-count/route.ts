import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

// GET /api/invoices/received/unread-count — Count of unread received e-invoices (readAt = null)
export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  async (_request, ctx) => {
    const count = await db.receivedInvoice.count({
      where: {
        companyId: ctx.activeCompanyId!,
        readAt: null,
      },
    });
    return NextResponse.json({ count });
  }
);
