import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/session';
import { requirePermission, blockOversightMutation, requireNotDemoCompany, Permission } from '@/lib/rbac';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { retryEInvoiceSend } from '@/lib/einvoice-sender';
import { logger } from '@/lib/logger';

// POST /api/invoices/[id]/einvoice-sends/[sendingId]/retry — Retry a failed e-invoice send
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sendingId: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    const forbidden = requirePermission(ctx, Permission.DATA_EDIT);
    if (forbidden) return forbidden;

    if (!ctx.activeCompanyId) {
      return NextResponse.json({ error: 'No active company' }, { status: 400 });
    }

    // Rate limit: 3 retries per minute per IP
    const clientIp = getClientIp(request);
    const rl = rateLimit(`einvoice-retry:${clientIp}`, {
      maxRequests: 3,
      windowMs: 60 * 1000,
      message: 'For mange e-faktura genforsøg. Prøv igen om et minut.',
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'For mange e-faktura genforsøg. Prøv igen om et minut.', retryAfter: rl.resetAt },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
      );
    }

    const { id, sendingId } = await params;

    const result = await retryEInvoiceSend(sendingId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    logger.info(`[EINVOICE_RETRY_API] Retried e-invoice send`, {
      sendingId,
      invoiceId: id,
      userId: ctx.id,
      companyId: ctx.activeCompanyId,
    });

    return NextResponse.json({ success: true, sendingId });
  } catch (error) {
    logger.error('[EINVOICE_RETRY_API] Failed to retry e-invoice send:', error);
    return NextResponse.json(
      { error: 'Kunne ikke gentage e-faktura afsendelse' },
      { status: 500 }
    );
  }
}
