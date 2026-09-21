import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { Permission, tenantFilter } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { previewNextVoucherNumber } from '@/lib/voucher-number';

// GET /api/company/next-voucher — Preview the next voucher number
//
// Returns the predicted voucher number for the NEXT journal entry that gets
// posted. Used by the journal entry form to show "Next voucher: BIL-2026-0042"
// so users know what number their entry will get when posted.
//
// IMPORTANT: this is a PREDICTION, not a reservation. Under concurrent load,
// two users may both see "BIL-2026-0042" — only the first to commit will
// actually get it. The second will get 0043. This is acceptable for preview
// purposes (the alternative — reserving the number upfront — would consume
// sequence numbers even for drafts that are never posted, creating gaps).
//
// Response:
//   {
//     voucherNumber: "BIL-2026-0042" | null  // null if company not found
//   }

export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  async (request, ctx) => {
    try {
      const voucherNumber = await previewNextVoucherNumber(ctx.activeCompanyId!);
      return NextResponse.json({ voucherNumber });
    } catch (error) {
      logger.error('[NEXT-VOUCHER] Failed:', error);
      return NextResponse.json(
        { error: 'Kunne ikke hente næste bilagsnummer' },
        { status: 500 },
      );
    }
  },
);
