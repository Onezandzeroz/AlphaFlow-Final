import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

// GET /api/invoices/received/unread-count — Count of unread received e-invoices
// that are still actionable in the inbox (readAt = null AND not yet posted/settled).
// Used by the sidebar notification badge.
export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  async (_request, ctx) => {
    const count = await db.receivedInvoice.count({
      where: {
        companyId: ctx.activeCompanyId!,
        readAt: null,
        // Only count items that are still in the inbox (not yet posted/settled).
        // POSTED/SETTLED items have "left" the inbox and shouldn't inflate the badge.
        status: { notIn: ['POSTED', 'SETTLED'] },
      },
    });
    return NextResponse.json({ count });
  }
);
