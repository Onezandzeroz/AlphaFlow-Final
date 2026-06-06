import { NextResponse } from 'next/server';
import { getInvoiceSendHistory } from '@/lib/einvoice-sender';
import { logger } from '@/lib/logger';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

// GET /api/invoices/[id]/einvoice-sends — Get send history for an invoice
export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  async (request, ctx, context) => {
    try {
      const { id } = await context.params as { id: string };
      const history = await getInvoiceSendHistory(id, ctx.activeCompanyId!);

      return NextResponse.json({ einvoiceSends: history });
    } catch (error) {
      logger.error('[EINVOICE_SENDS_API] Failed to fetch e-invoice send history:', error);
      return NextResponse.json(
        { error: 'Kunne ikke hente e-faktura afsendelseshistorik' },
        { status: 500 }
      );
    }
  }
);
