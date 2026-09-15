import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { sproomClient, SproomChildCompanyConflictError, type SproomChildCompany } from '@/lib/sproom-client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

/**
 * POST /api/sproom/create-child-company
 *
 * Creates a Sproom "child company" for the active tenant. This is Sproom's
 * equivalent of Storecove's "legal entity" — the tenant's identity in the
 * Sproom platform that can send and receive e-invoices.
 *
 * After creating the child company, this route also:
 *   1. Registers the child in the NemHandel network (OIOUBL profiles)
 *   2. Registers the child in the Peppol network (BIS Billing 3.0 profile)
 *
 * If createChildCompany returns 409 (the CVR already has a Sproom profile),
 * this route auto-starts the enrollment flow (POST
 * /api/child-companies/enrollments) and returns the enrollmentLink so the
 * tenant can complete acceptance. A subsequent call re-discovers the
 * accepted child via listChildCompanies and finalizes the connection.
 *
 * The child company ID is stored on Company.sproomChildCompanyId.
 *
 * Preconditions:
 *   - Company.cvrNumber must be set and verified (CVR gate)
 *   - Sproom must be configured (SPROOM_API_TOKEN in .env)
 *   - EINVOICE_ACCESS_POINT=sproom in .env
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
      // Rate limit: 3 attempts per minute per IP
      const clientIp = getClientIp(request);
      const rl = rateLimit(`sproom-create-child:${clientIp}`, {
        maxRequests: 3,
        windowMs: 60 * 1000,
        message: 'Too many child company creation attempts. Please try again later.',
      });
      if (!rl.allowed) {
        return NextResponse.json(
          { error: 'Too many attempts. Please try again later.', retryAfter: rl.resetAt },
          { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
        );
      }

      // ── 1. Fetch + validate company ──────────────────────────────
      const company = await db.company.findUnique({
        where: { id: ctx.activeCompanyId! },
        select: {
          id: true,
          name: true,
          cvrNumber: true,
          cvrVerifiedAt: true,
          address: true,
          email: true,
          phone: true,
          sproomChildCompanyId: true,
        },
      });

      if (!company) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 });
      }

      // CVR gate
      if (!company.cvrVerifiedAt) {
        return NextResponse.json(
          {
            error: 'Dit CVR-nummer er ikke blevet verificeret. Bekræft dit CVR-nummer i Virksomhedsindstillinger før du opretter en child company i Sproom.',
            code: 'CVR_NOT_VERIFIED',
          },
          { status: 403 }
        );
      }

      const cvr = company.cvrNumber.trim();
      if (!/^\d{8}$/.test(cvr)) {
        return NextResponse.json(
          {
            error: `Ugyldigt CVR-nummer: "${cvr}". Et dansk CVR-nummer skal være præcis 8 cifre.`,
            code: 'INVALID_CVR',
          },
          { status: 400 }
        );
      }

      // Idempotency: refuse if already connected
      if (company.sproomChildCompanyId) {
        return NextResponse.json(
          {
            error: 'Denne virksomhed har allerede en Sproom child company.',
            code: 'ALREADY_CONNECTED',
            childCompanyId: company.sproomChildCompanyId,
          },
          { status: 409 }
        );
      }

      // Check Sproom is configured
      if (!sproomClient.isConfigured) {
        return NextResponse.json(
          {
            error: 'Sproom er ikke konfigureret på platformen. Sæt SPROOM_API_TOKEN i .env.',
            code: 'PLATFORM_NOT_CONFIGURED',
          },
          { status: 503 }
        );
      }

      // ── 2. Resolve a child company for this CVR ───────────────
      // Three paths:
      //   (a) createChildCompany succeeds → new child → store + register.
      //   (b) 409 conflict (CVR already has a Sproom profile) + the company
      //       is already AlphaFlow's child (e.g. a previous enrollment was
      //       accepted) → re-discover via listChildCompanies → store + register.
      //   (c) 409 conflict + not yet a child → auto-start the enrollment flow
      //       (POST /api/child-companies/enrollments) and return the
      //       enrollmentLink so the user can complete acceptance. After
      //       accepting, the user clicks "Opret child company i Sproom" again
      //       and path (b) completes the connection.
      logger.info('[SPROOM_CREATE_CHILD] Resolving child company', {
        companyId: ctx.activeCompanyId,
        companyName: company.name,
        cvr,
      });

      // Find a child company of THIS parent matching the CVR (for re-discovery).
      const findOwnedChild = async (): Promise<SproomChildCompany | null> => {
        const children = await sproomClient.listChildCompanies();
        return children.find((c) => c.organizationIdentifier?.value === cvr) ?? null;
      };

      let childCompany: SproomChildCompany | null = null;
      let resolveSource: 'created' | 'rediscovered' = 'created';

      try {
        childCompany = await sproomClient.createChildCompany({
          name: company.name,
          cvr,
          schemeId: 'DK:CVR',
        });
        logger.info('[SPROOM_CREATE_CHILD] Child company created', {
          companyId: ctx.activeCompanyId,
          childCompanyId: childCompany.id,
        });
      } catch (err) {
        // Only the typed conflict error is recoverable; re-throw others
        // (network, auth, 5xx) so the outer catch returns 500.
        if (!(err instanceof SproomChildCompanyConflictError)) throw err;

        const conflict = err;
        logger.info('[SPROOM_CREATE_CHILD] CVR already has a Sproom profile — checking ownership', {
          companyId: ctx.activeCompanyId,
          cvr,
          existingChildCompanyId: conflict.childCompanyId,
        });

        // (b) Already a child? (covers the case where a previous enrollment
        // was accepted — re-discover it instead of re-enrolling.)
        const owned = await findOwnedChild();
        if (owned) {
          childCompany = owned;
          resolveSource = 'rediscovered';
          logger.info('[SPROOM_CREATE_CHILD] Re-discovered existing child company (already a child)', {
            companyId: ctx.activeCompanyId,
            childCompanyId: owned.id,
          });
        } else {
          // (c) Not a child yet → auto-start the enrollment flow.
          if (!company.email) {
            return NextResponse.json(
              {
                error:
                  'Virksomheden har allerede en Sproom-profil, men er ikke din child company. Enrollment kræver en email på virksomheden — sæt den i Virksomhedsindstillinger og prøv igen.',
                code: 'ENROLLMENT_NO_EMAIL',
              },
              { status: 400 }
            );
          }

          logger.info('[SPROOM_CREATE_CHILD] Starting enrollment flow', {
            companyId: ctx.activeCompanyId,
            cvr,
            existingChildCompanyId: conflict.childCompanyId,
          });

          let enrollmentLink: string | null = null;
          let alreadyChild = false;
          try {
            const enr = await sproomClient.enrollChildCompany({
              childCompanyName: company.name,
              organizationIdentifier: { schemeId: 'DK:CVR', value: cvr },
              userEmail: company.email,
              parentCompanyName: 'AlphaFlow',
              shouldSendEmail: false,
            });
            enrollmentLink = enr.enrollmentLink;
            alreadyChild = enr.alreadyChild === true;
          } catch (enrollErr) {
            const msg = enrollErr instanceof Error ? enrollErr.message : String(enrollErr);
            logger.error('[SPROOM_CREATE_CHILD] Enrollment failed', { cvr, error: msg });
            return NextResponse.json(
              { error: `Kunne ikke påbegynde Sproom enrollment: ${msg}`, code: 'ENROLLMENT_FAILED' },
              { status: 502 }
            );
          }

          // Race: enroll said "already a child" between our list and enroll.
          if (alreadyChild) {
            const owned2 = await findOwnedChild();
            if (owned2) {
              childCompany = owned2;
              resolveSource = 'rediscovered';
              logger.info('[SPROOM_CREATE_CHILD] Enrollment "already a child" — re-discovered', {
                companyId: ctx.activeCompanyId,
                childCompanyId: owned2.id,
              });
            } else {
              return NextResponse.json(
                {
                  error:
                    'Sproom rapporterer virksomheden som allerede child, men den blev ikke fundet. Prøv igen.',
                  code: 'ENROLLMENT_STATE_INCONSISTENT',
                },
                { status: 409 }
              );
            }
          } else {
            // Enrollment started → return the link (no store yet; the user
            // completes acceptance via the link, then clicks "Opret" again
            // and path (b) re-discovers + completes).
            await auditCreate(
              ctx.id,
              'Company',
              ctx.activeCompanyId!,
              {
                action: 'sproom_enrollment_started',
                cvr,
                existingChildCompanyId: conflict.childCompanyId,
                enrollmentLink,
              },
              requestMetadata(request),
              ctx.activeCompanyId
            );
            return NextResponse.json({
              enrolled: true,
              enrollmentLink,
              childCompanyId: conflict.childCompanyId,
              message:
                'Virksomheden har allerede en Sproom-profil. Fuldfør enrollment via linket, og klik derefter "Opret child company i Sproom" igen for at gennemføre forbindelsen.',
            });
          }
        }
      }

      if (!childCompany?.id) {
        return NextResponse.json(
          { error: 'Sproom returned no child company ID' },
          { status: 500 }
        );
      }

      // ── 3. Register in NemHandel network ─────────────────────────
      // (re-run on the rediscovery path too — non-fatal if already registered)
      let nemhandelRegistered = false;
      try {
        await sproomClient.registerNemHandel(
          { schemeId: 'DK:CVR', value: cvr },
          ['Nes5Customer'], // Standard invoice + credit note profile
          { childCompanyId: childCompany.id } // impersonate the child company
        );
        nemhandelRegistered = true;
        logger.info('[SPROOM_CREATE_CHILD] Registered in NemHandel', { childCompanyId: childCompany.id });
      } catch (err) {
        logger.warn('[SPROOM_CREATE_CHILD] NemHandel registration failed (non-fatal)', {
          childCompanyId: childCompany.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // ── 4. Register in Peppol network ────────────────────────────
      let peppolRegistered = false;
      try {
        await sproomClient.registerPeppol(
          { schemeId: 'DK:CVR', value: cvr },
          ['PeppolBis3Billing'], // Peppol BIS Billing 3.0
          { childCompanyId: childCompany.id } // impersonate the child company
        );
        peppolRegistered = true;
        logger.info('[SPROOM_CREATE_CHILD] Registered in Peppol', { childCompanyId: childCompany.id });
      } catch (err) {
        logger.warn('[SPROOM_CREATE_CHILD] Peppol registration failed (non-fatal)', {
          childCompanyId: childCompany.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // ── 4b. Register webhooks (DocumentReceived + DocumentStatusChanged)
      // so Sproom notifies AlphaFlow when the child company RECEIVES an
      // e-invoice (DocumentReceived → e-invoice inbox) or a sent document's
      // delivery status changes (DocumentStatusChanged → EInvoiceSending
      // status update). Without these, received e-invoices never reach
      // AlphaFlow's inbox even though Sproom's dashboard shows them.
      // Non-fatal: registration failure doesn't block child-company creation
      // (backfill via POST /api/sproom/register-webhook).
      {
        const appUrl = (process.env.APP_URL || 'https://alphaflow.dk').replace(/\/$/, '');
        const webhookUrl = `${appUrl}/api/sproom/webhook`;
        for (const whType of ['DocumentReceived', 'DocumentStatusChanged'] as const) {
          try {
            await sproomClient.createWebhook(whType, webhookUrl, { childCompanyId: childCompany.id });
            logger.info('[SPROOM_CREATE_CHILD] Registered webhook', {
              childCompanyId: childCompany.id,
              type: whType,
              webhookUrl,
            });
          } catch (err) {
            logger.warn('[SPROOM_CREATE_CHILD] Webhook registration failed (non-fatal)', {
              childCompanyId: childCompany.id,
              type: whType,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      // ── 5. Store child company ID + auto-configure e-invoicing ──
      await db.company.update({
        where: { id: ctx.activeCompanyId! },
        data: {
          sproomChildCompanyId: childCompany.id,
          sproomConnectedAt: new Date(),
          sproomLastTestedAt: new Date(),
          sproomNemHandelRegistered: nemhandelRegistered,
          sproomPeppolRegistered: peppolRegistered,
          // Auto-enable e-invoicing
          einvoiceEnabled: true,
          einvoiceEndpointId: `0184:${cvr}`,
          einvoicePeppolAs4Id: `0188:CVR${cvr}`,
          einvoiceDeliveryMode: 'automatic',
        },
      });

      // ── 6. Audit trail ───────────────────────────────────────────
      await auditCreate(
        ctx.id,
        'Company',
        ctx.activeCompanyId!,
        {
          action:
            resolveSource === 'rediscovered'
              ? 'sproom_child_company_rediscovered'
              : 'sproom_child_company_created',
          childCompanyId: childCompany.id,
          nemhandelRegistered,
          peppolRegistered,
          cvr,
        },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      logger.info('[SPROOM_CREATE_CHILD] Complete', {
        companyId: ctx.activeCompanyId,
        childCompanyId: childCompany.id,
        resolveSource,
        nemhandelRegistered,
        peppolRegistered,
      });

      return NextResponse.json({
        connected: true,
        childCompanyId: childCompany.id,
        nemhandelRegistered,
        peppolRegistered,
        endpointId: `0184:${cvr}`,
      });
    } catch (error) {
      logger.error('[SPROOM_CREATE_CHILD] Failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to create child company';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
);
