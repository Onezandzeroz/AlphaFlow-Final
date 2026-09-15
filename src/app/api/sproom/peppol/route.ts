import { NextResponse } from 'next/server';
import { sproomClient, type SproomSigningMethod, type SproomPeppolVerification } from '@/lib/sproom-client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

/**
 * POST /api/sproom/peppol
 *
 * Peppol participant verification + registration for the active company's
 * child company. Peppol registration requires a PRIOR participant
 * verification (a signed declaration — MitID in prod, AcceptButton in staging).
 *
 * Body: { action?: 'initiate' | 'complete' }  (default 'initiate')
 *
 * action='initiate':
 *   - If a Pending verification exists, returns it (no duplicate).
 *   - Else initiates a new verification (signerEmail=company.email,
 *     signerName=company.name, signingMethod based on staging/prod, cvr).
 *   - Sproom emails the signer a signing link. The
 *     PeppolParticipantVerificationChanged webhook auto-completes registration
 *     when stateType='Signed'.
 *
 * action='complete' (manual fallback if the webhook didn't fire):
 *   - Finds the latest verification, re-fetches its state.
 *   - If 'Signed' → registerPeppol + update DB (sproomPeppolRegistered=true).
 */
export const POST = withGuard(
  {
    auth: true,
    requireCompany: true,
    blockOversight: true,
    blockDemo: true,
    requireTokenPay: true,
    permissions: [Permission.DATA_EDIT],
  },
  async (request, ctx) => {
    try {
      const body = await request.json().catch(() => ({})) as { action?: string };
      const action = body.action === 'complete' ? 'complete' : 'initiate';

      const company = await db.company.findUnique({
        where: { id: ctx.activeCompanyId! },
        select: {
          id: true,
          name: true,
          cvrNumber: true,
          email: true,
          sproomChildCompanyId: true,
          sproomPeppolRegistered: true,
        },
      });

      if (!company) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 });
      }
      if (!company.sproomChildCompanyId) {
        return NextResponse.json(
          { error: 'Ingen Sproom child company — opret en først.', code: 'NOT_CONNECTED' },
          { status: 400 }
        );
      }
      if (!sproomClient.isConfigured) {
        return NextResponse.json(
          {
            error: 'Sproom er ikke konfigureret. Sæt SPROOM_API_TOKEN i .env.',
            code: 'PLATFORM_NOT_CONFIGURED',
          },
          { status: 503 }
        );
      }

      const childCompanyId = company.sproomChildCompanyId;

      // ── List existing verifications (used by both actions) ──
      let verifications: SproomPeppolVerification[] = [];
      try {
        verifications = await sproomClient.listPeppolParticipantVerifications({ childCompanyId });
      } catch (err) {
        logger.warn('[SPROOM_PEPPOL] listPeppolParticipantVerifications failed', {
          childCompanyId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // ── INITIATE ──
      if (action === 'initiate') {
        // If a Pending verification exists, return it (don't duplicate).
        const pending = verifications.find((v) => v.stateType === 'Pending');
        if (pending) {
          return NextResponse.json({
            action: 'initiate',
            verificationId: pending.id,
            signerEmail: pending.signerEmail ?? company.email ?? null,
            signingMethod: pending.signingMethod ?? null,
            state: pending.stateType ?? 'Pending',
            message:
              'En Peppol-verifikering er allerede i gang (Pending). Fuldfør underskriften, derefter gennemføres registreringen automatisk (eller klik "Gennemfør Peppol").',
          });
        }

        if (!company.email) {
          return NextResponse.json(
            {
              error:
                'Virksomhedens email mangler — sæt den i Virksomhedsindstillinger før Peppol-verifikering.',
              code: 'NO_SIGNER_EMAIL',
            },
            { status: 400 }
          );
        }

        const sproomApiUrl = process.env.SPROOM_API_URL || '';
        const signingMethod: SproomSigningMethod = sproomApiUrl.includes('staging')
          ? 'AcceptButton'
          : 'NemId';

        try {
          const result = await sproomClient.initiatePeppolParticipantVerification(
            {
              signerEmail: company.email,
              signerName: company.name,
              signingMethod,
              cvr: company.cvrNumber || undefined,
            },
            { childCompanyId }
          );
          await auditCreate(
            ctx.id,
            'Company',
            ctx.activeCompanyId!,
            {
              action: 'sproom_peppol_verification_initiated',
              childCompanyId,
              verificationId: result.id,
              signerEmail: company.email,
              signingMethod,
            },
            requestMetadata(request),
            ctx.activeCompanyId
          );
          logger.info('[SPROOM_PEPPOL] Initiated participant verification', {
            childCompanyId,
            verificationId: result.id,
            signingMethod,
          });
          return NextResponse.json({
            action: 'initiate',
            verificationId: result.id,
            signerEmail: company.email,
            signingMethod,
            state: 'Pending',
            message:
              signingMethod === 'AcceptButton'
                ? `Peppol-verifikering påbegyndt (test-mode: AcceptButton). Sproom sender et underskriftslink til ${company.email}. Fuldfør underskriften, derefter gennemføres Peppol-registreringen automatisk.`
                : `Peppol-verifikering påbegyndt. Sproom sender et MitID-underskriftslink til ${company.email}. Fuldfør underskriften, derefter gennemføres Peppol-registreringen automatisk.`,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error('[SPROOM_PEPPOL] Initiation failed', { childCompanyId, error: msg });
          return NextResponse.json(
            { error: `Kunne ikke påbegynde Peppol-verifikering: ${msg}`, code: 'PEPPOL_INITIATE_FAILED' },
            { status: 502 }
          );
        }
      }

      // ── COMPLETE (manual fallback) ──
      // Find the latest verification (list is ordered by initiation; last = latest).
      const latest = verifications[verifications.length - 1] ?? null;
      if (!latest) {
        return NextResponse.json({
          action: 'complete',
          registered: false,
          state: null,
          message: 'Ingen Peppol-verifikering fundet. Klik "Tilmeld Peppol" først.',
        });
      }
      // Re-fetch the latest verification's state (the list may be stale).
      let stateType: string | undefined = latest.stateType;
      try {
        const fresh = await sproomClient.getPeppolParticipantVerification(latest.id, { childCompanyId });
        stateType = fresh.stateType;
      } catch (err) {
        logger.warn('[SPROOM_PEPPOL] getPeppolParticipantVerification failed, using list state', {
          childCompanyId,
          verificationId: latest.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      if (stateType !== 'Signed') {
        return NextResponse.json({
          action: 'complete',
          registered: false,
          state: stateType ?? 'Pending',
          message:
            stateType === 'Pending'
              ? 'Peppol-verifikeringen er ikke fuldført endnu. Fuldfør underskriften (MitID/AcceptButton) via linket sendt til din email.'
              : `Peppol-verifikeringens tilstand er "${stateType}".`,
        });
      }

      // Signed → registerPeppol.
      const cvr = company.cvrNumber || '';
      try {
        await sproomClient.registerPeppol(
          { schemeId: 'DK:CVR', value: cvr },
          ['PeppolBis3Billing'],
          { childCompanyId }
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Already-registered is fine; other errors surface.
        if (!/already|409|exist/i.test(msg)) {
          logger.error('[SPROOM_PEPPOL] registerPeppol failed after Signed verification', {
            childCompanyId,
            error: msg,
          });
          return NextResponse.json(
            {
              error: `Peppol-verifikering er fuldført, men registreringen fejlede: ${msg}`,
              code: 'PEPPOL_REGISTER_FAILED',
            },
            { status: 502 }
          );
        }
      }

      await db.company.update({
        where: { id: ctx.activeCompanyId! },
        data: { sproomPeppolRegistered: true },
      });
      await auditCreate(
        ctx.id,
        'Company',
        ctx.activeCompanyId!,
        { action: 'sproom_peppol_registered', childCompanyId, verificationId: latest.id },
        requestMetadata(request),
        ctx.activeCompanyId
      );
      logger.info('[SPROOM_PEPPOL] Registered in Peppol (verification Signed)', { childCompanyId });
      return NextResponse.json({
        action: 'complete',
        registered: true,
        state: 'Signed',
        message: 'Peppol-registrering gennemført.',
      });
    } catch (error) {
      logger.error('[SPROOM_PEPPOL] Failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to set up Peppol';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
);
