import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { notifyDataChange } from '@/lib/notify-data-change';

// POST /api/invoices/received/mark-read — Mark all unread received e-invoices as read (readAt = now)
export const POST = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  async (_request, ctx) => {
    const result = await db.receivedInvoice.updateMany({
      where: {
        companyId: ctx.activeCompanyId!,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    // Notify the frontend to refresh the unread badge (count → 0)
    notifyDataChange({ scope: 'received-invoices', companyId: ctx.activeCompanyId!, action: 'update' }).catch(() => {});

    logger.info('[RECEIVED_INVOICE] Marked all as read', {
      companyId: ctx.activeCompanyId,
      marked: result.count,
    });

    return NextResponse.json({ marked: result.count });
  }
);
