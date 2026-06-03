import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/session';
import { requirePermission, Permission } from '@/lib/rbac';
import { getInvoiceSendHistory } from '@/lib/einvoice-sender';
import { logger } from '@/lib/logger';

// GET /api/invoices/[id]/einvoice-sends — Get send history for an invoice
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const forbidden = requirePermission(ctx, Permission.DATA_READ);
    if (forbidden) return forbidden;

    if (!ctx.activeCompanyId) {
      return NextResponse.json({ error: 'No active company' }, { status: 400 });
    }

    const { id } = await params;
    const history = await getInvoiceSendHistory(id, ctx.activeCompanyId);

    return NextResponse.json({ einvoiceSends: history });
  } catch (error) {
    logger.error('[EINVOICE_SENDS_API] Failed to fetch e-invoice send history:', error);
    return NextResponse.json(
      { error: 'Kunne ikke hente e-faktura afsendelseshistorik' },
      { status: 500 }
    );
  }
}
