import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { sproomClient } from '@/lib/sproom-client';
import { tenantFilter, Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { applyStateHistory } from '@/lib/einvoice-status-tracker';

// POST /api/einvoice-sends/[id]/debug-state — Debug & force re-sync af Sproom state
//
// Dette endpoint er et diagnostics-værktøj der hjælper med at forstå hvorfor en
// sending ikke opdaterer status. Det gør tre ting:
//
//   1. Henter den fulde state-history fra Sproom (getDocumentState)
//   2. Viser hvad Sproom rapporterer som current state vs. hvad vi har persisteret
//   3. Hvis ?force=true (eller body { force: true }): re-applier hele state-history
//      via tracker (dedup-check sikrer at kun manglende events oprettes)
//
// Brug når:
//   - Sendingen "sticker" ved DELIVERED selvom du forventer ACCEPTED
//   - Du vil se præcis hvilke states Sproom har registreret for dokumentet
//   - Du vil teste om webhook-eller-poller har misset et event
//
// Response:
//   {
//     sending: { id, status, sproomRawStatus, storecoveSubmissionId, ... },
//     sproomStates: SproomDocumentStateEntry[],   // rå data fra Sproom
//     ourEvents: EInvoiceSendEvent[],              // hvad vi har persisteret
//     discrepancy: { missingEvents: number, ... }, // forskel mellem Sproom og os
//     resynced: { applied: number, changed: number, finalStatus: string } | null
//   }

export const POST = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  async (request, ctx, context) => {
    try {
      const { id } = await context.params as { id: string };

      // Parse body (optional force flag)
      let body: { force?: boolean } = {};
      try {
        body = await request.json();
      } catch {
        // Empty body is fine — default force=false
      }
      const force = body.force === true;

      // ── 1. Fetch the sending (tenant-scoped) ──
      const sending = await db.eInvoiceSending.findFirst({
        where: { id, ...tenantFilter(ctx) },
        select: {
          id: true,
          status: true,
          sproomRawStatus: true,
          storecoveSubmissionId: true,
          messageId: true,
          sentAt: true,
          deliveredAt: true,
          acceptedAt: true,
          rejectedAt: true,
          paidAt: true,
          invoiceId: true,
          recipientName: true,
          companyId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!sending) {
        return NextResponse.json(
          { error: 'E-faktura afsendelse ikke fundet' },
          { status: 404 },
        );
      }

      if (!sending.storecoveSubmissionId) {
        return NextResponse.json({
          sending,
          sproomStates: [],
          ourEvents: [],
          discrepancy: { reason: 'No Sproom document ID — sending was never transmitted to Sproom (simulation mode or pre-send state).' },
          resynced: null,
        });
      }

      // ── 2. Fetch full state-history from Sproom ──
      const company = await db.company.findUnique({
        where: { id: sending.companyId },
        select: { sproomChildCompanyId: true, name: true, cvrNumber: true },
      });

      if (!company?.sproomChildCompanyId) {
        return NextResponse.json({
          sending,
          sproomStates: [],
          ourEvents: [],
          discrepancy: { reason: 'Tenant has no sproomChildCompanyId configured — Sproom integration not set up for this company.' },
          resynced: null,
        });
      }

      let sproomStates: Awaited<ReturnType<typeof sproomClient.getDocumentState>> = [];
      let sproomError: string | null = null;

      if (sproomClient?.isConfigured) {
        try {
          sproomStates = await sproomClient.getDocumentState(
            sending.storecoveSubmissionId,
            { childCompanyId: company.sproomChildCompanyId },
          );
        } catch (err) {
          sproomError = err instanceof Error ? err.message : String(err);
          logger.warn('[DEBUG-STATE] getDocumentState failed', {
            sendingId: sending.id,
            documentId: sending.storecoveSubmissionId,
            error: sproomError,
          });
        }
      } else {
        sproomError = 'Sproom client not configured (simulation mode — no SPROOM_API_TOKEN set)';
      }

      // ── 3. Fetch our persisted events ──
      const ourEvents = await db.eInvoiceSendEvent.findMany({
        where: { sendingId: sending.id },
        orderBy: { eventTimestamp: 'asc' },
        select: {
          id: true,
          status: true,
          sproomRawState: true,
          sproomStatusCode: true,
          deliveryType: true,
          message: true,
          source: true,
          eventTimestamp: true,
          createdAt: true,
        },
      });

      // ── 4. Compute discrepancy ──
      // For each Sproom state-entry, check if we have a matching event
      // (matched by sproomRawState + sproomStatusCode + eventTimestamp).
      const missingStates: typeof sproomStates = [];
      for (const sproomState of sproomStates) {
        const matched = ourEvents.some(
          (evt) =>
            evt.sproomRawState === sproomState.state &&
            (evt.sproomStatusCode ?? null) === (sproomState.statusCode ?? null) &&
            evt.eventTimestamp.getTime() ===
              (sproomState.dateTime ? new Date(sproomState.dateTime).getTime() : 0),
        );
        if (!matched) {
          missingStates.push(sproomState);
        }
      }

      // ── 5. Optional: force re-sync via tracker ──
      let resynced: { applied: number; changed: number; finalStatus: string | null } | null = null;
      if (force && sproomStates.length > 0) {
        try {
          const result = await applyStateHistory(
            sending.id,
            sproomStates,
            'sproom_poller', // use poller source so it's distinguishable from webhook
          );
          resynced = {
            applied: result.applied,
            changed: result.changed,
            finalStatus: result.finalStatus,
          };
          logger.info('[DEBUG-STATE] Force re-sync completed', {
            sendingId: sending.id,
            applied: result.applied,
            changed: result.changed,
            finalStatus: result.finalStatus,
          });
        } catch (err) {
          logger.error('[DEBUG-STATE] Force re-sync failed', {
            sendingId: sending.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // ── 6. Build diagnostic summary ──
      const sproomLatestState = sproomStates.length > 0 ? sproomStates[sproomStates.length - 1] : null;
      const ourLatestEvent = ourEvents.length > 0 ? ourEvents[ourEvents.length - 1] : null;

      return NextResponse.json({
        sending: {
          id: sending.id,
          status: sending.status,
          sproomRawStatus: sending.sproomRawStatus,
          storecoveSubmissionId: sending.storecoveSubmissionId,
          messageId: sending.messageId,
          timestamps: {
            sentAt: sending.sentAt,
            deliveredAt: sending.deliveredAt,
            acceptedAt: sending.acceptedAt,
            rejectedAt: sending.rejectedAt,
            paidAt: sending.paidAt,
          },
          updatedAt: sending.updatedAt,
        },
        tenant: {
          companyId: sending.companyId,
          companyName: company.name,
          cvr: company.cvrNumber,
          sproomChildCompanyId: company.sproomChildCompanyId,
        },
        sproom: {
          configured: sproomClient?.isConfigured ?? false,
          documentId: sending.storecoveSubmissionId,
          stateCount: sproomStates.length,
          latestState: sproomLatestState
            ? {
                state: sproomLatestState.state,
                statusCode: sproomLatestState.statusCode,
                deliveryType: sproomLatestState.deliveryType,
                dateTime: sproomLatestState.dateTime,
                message: sproomLatestState.message,
                hasFailedProperties: !!sproomLatestState.failedProperties?.length,
              }
            : null,
          allStates: sproomStates.map((s) => ({
            state: s.state,
            statusCode: s.statusCode,
            deliveryType: s.deliveryType,
            dateTime: s.dateTime,
            message: s.message,
          })),
          error: sproomError,
        },
        ourEvents: ourEvents.map((e) => ({
          status: e.status,
          sproomRawState: e.sproomRawState,
          sproomStatusCode: e.sproomStatusCode,
          source: e.source,
          eventTimestamp: e.eventTimestamp,
          message: e.message,
        })),
        discrepancy: {
          missingStateCount: missingStates.length,
          missingStates: missingStates.map((s) => ({
            state: s.state,
            statusCode: s.statusCode,
            dateTime: s.dateTime,
          })),
          sproomLatestVsOurs: {
            sproomLatest: sproomLatestState?.state ?? null,
            ourLatest: ourLatestEvent?.sproomRawState ?? null,
            ourLatestMapped: ourLatestEvent?.status ?? null,
          },
        },
        resynced,
        // ── User-facing explanation ──
        explanation: buildExplanation({
          sproomLatestState: sproomLatestState?.state ?? null,
          ourStatus: sending.status,
          sproomConfigured: sproomClient?.isConfigured ?? false,
          hasAccepted: !!sending.acceptedAt,
          hasPaid: !!sending.paidAt,
          missingStates: missingStates.length,
        }),
      });
    } catch (error) {
      logger.error('[DEBUG-STATE] Failed:', error);
      return NextResponse.json(
        { error: 'Kunne ikke hente debug-state' },
        { status: 500 },
      );
    }
  },
);

// ─── Helper: build human-readable explanation ──────────────────────

function buildExplanation(input: {
  sproomLatestState: string | null;
  ourStatus: string;
  sproomConfigured: boolean;
  hasAccepted: boolean;
  hasPaid: boolean;
  missingStates: number;
}): string {
  const { sproomLatestState, ourStatus, sproomConfigured, hasAccepted, hasPaid, missingStates } = input;

  if (!sproomConfigured) {
    return 'Sproom er ikke konfigureret (SPROOM_API_TOKEN mangler). Systemet kører i simulation mode — ingen rigtige statusser fra Sproom.';
  }

  if (!sproomLatestState) {
    return 'Sproom har ingen state-history for dette dokument. Dette kan ske hvis dokumentet blev sendt før state-tracking blev aktiveret, eller hvis Sproom har slettet historikken.';
  }

  // Map Sproom status to AlphaFlow status for comparison
  const sproomToAlphaFlow: Record<string, string> = {
    Created: 'SENT',
    TransmissionStarted: 'IN_TRANSIT',
    Sent: 'DELIVERED',
    Received: 'DELIVERED',
    TransmissionCompleted: 'DELIVERED',
    PendingApproval: 'PENDING_APPROVAL',
    Approved: 'ACCEPTED',
    Rejected: 'REJECTED',
  };
  const expectedAlphaFlow = sproomToAlphaFlow[sproomLatestState] ?? 'UNKNOWN';

  if (expectedAlphaFlow === ourStatus) {
    if (ourStatus === 'DELIVERED') {
      return `Status er synkroniseret med Sproom (DELIVERED). Dokumentet er leveret til modtagerens Access Point. ACCEPTED kommer først når MODTAGEREN aktivt godkender fakturaen i deres økonomisystem og sender en ApplicationResponse tilbage. I staging/sandbox mode sker dette sjældent automatisk — demo-modtagere godkender ikke aktivt.`;
    }
    if (ourStatus === 'ACCEPTED') {
      return `Status er ACCEPTED — modtageren har godkendt fakturaen. PAID kommer først når DU (afsenderen) markerer fakturaen som betalt i AlphaFlow (via faktura-siden → "Markér som betalt"). Sproom kender ikke til betalinger.`;
    }
    return `Status er synkroniseret med Sproom (${ourStatus}).`;
  }

  if (missingStates > 0) {
    return `Sproom rapporterer "${sproomLatestState}" men vi har ${ourStatus}. Der mangler ${missingStates} event(s) i vores database — kør med { force: true } for at re-synce.`;
  }

  return `Sproom's seneste state er "${sproomLatestState}" (forventet AlphaFlow status: ${expectedAlphaFlow}). Vores status er "${ourStatus}". Forskellen kan skyldes at webhooks/poller ikke har fanget den seneste ændring endnu — prøv at re-synce med { force: true }.`;
}
