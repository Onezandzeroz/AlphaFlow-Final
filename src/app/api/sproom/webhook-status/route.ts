import { NextResponse } from 'next/server';
import { sproomClient } from '@/lib/sproom-client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';

/**
 * GET /api/sproom/webhook-status
 *
 * Diagnostic: checks whether the Sproom webhooks are registered for the
 * active company's child company + whether the RSA public key is fetchable
 * (signature verification would work). Returns a diagnostic report so the
 * user can pinpoint why received e-invoices aren't pushed from Sproom to
 * AlphaFlow's inbox.
 */
export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.DATA_READ] },
  async (_request, ctx) => {
    const appUrl = (process.env.APP_URL || 'https://alphaflow.dk').replace(/\/$/, '');
    const expectedWebhookUrl = `${appUrl}/api/sproom/webhook`;

    const company = await db.company.findUnique({
      where: { id: ctx.activeCompanyId! },
      select: {
        id: true,
        name: true,
        cvrNumber: true,
        sproomChildCompanyId: true,
        sproomNemHandelRegistered: true,
      },
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const report: Record<string, unknown> = {
      companyName: company.name,
      cvrNumber: company.cvrNumber,
      childCompanyId: company.sproomChildCompanyId,
      sproomConfigured: sproomClient.isConfigured,
      appUrl,
      expectedWebhookUrl,
      nemhandelRegistered: company.sproomNemHandelRegistered,
    };

    if (!company.sproomChildCompanyId) {
      return NextResponse.json({
        ...report,
        error: 'No Sproom child company connected',
        webhooks: [],
        publicKeyFetchable: false,
      });
    }

    if (!sproomClient.isConfigured) {
      return NextResponse.json({
        ...report,
        error: 'Sproom not configured (SPROOM_API_TOKEN missing)',
        webhooks: [],
        publicKeyFetchable: false,
      });
    }

    // 1. List registered webhooks
    let webhooks: unknown[] = [];
    let webhookListError: string | undefined;
    try {
      const list = await sproomClient.listWebhooks({ childCompanyId: company.sproomChildCompanyId });
      webhooks = list.map((w) => ({
        id: w.id,
        type: w.type,
        url: w.url,
        publicKey: w.publicKey ? '(present)' : '(missing)',
      }));
    } catch (err) {
      webhookListError = err instanceof Error ? err.message : String(err);
    }
    report.webhooks = webhooks;
    report.webhookCount = webhooks.length;
    report.webhookListError = webhookListError;

    // Check if both required webhook types are registered
    const registeredTypes = new Set(webhooks.map((w) => (w as { type?: string }).type?.toLowerCase()).filter(Boolean) as string[]);
    report.hasDocumentReceived = registeredTypes.has('documentreceived');
    report.hasDocumentStatusChanged = registeredTypes.has('documentstatuschanged');

    // Check if the registered URLs match the expected URL
    const registeredUrls = webhooks.map((w) => (w as { url?: string }).url).filter(Boolean) as string[];
    report.urlMismatch = registeredUrls.length > 0 && !registeredUrls.every((u) => u === expectedWebhookUrl);
    report.registeredUrls = registeredUrls;

    // 2. Test public key fetch (signature verification would work?)
    let publicKeyFetchable = false;
    let publicKeyError: string | undefined;
    try {
      const keyInfo = await sproomClient.getWebhookKey();
      publicKeyFetchable = !!keyInfo?.publicKey;
    } catch (err) {
      publicKeyError = err instanceof Error ? err.message : String(err);
    }
    report.publicKeyFetchable = publicKeyFetchable;
    report.publicKeyError = publicKeyError;

    // 3. Diagnosis
    const issues: string[] = [];
    if (webhooks.length === 0) {
      issues.push('No webhooks registered — Sproom has nowhere to send DocumentReceived events. Open the e-invoice settings page (the status route auto-registers webhooks) or the webhooks were not auto-registered.');
    }
    if (!registeredTypes.has('DocumentReceived')) {
      issues.push('DocumentReceived webhook is NOT registered — received e-invoices will not be pushed to AlphaFlow.');
    }
    if (!registeredTypes.has('DocumentStatusChanged')) {
      issues.push('DocumentStatusChanged webhook is NOT registered — send-history status updates will not work.');
    }
    if (report.urlMismatch) {
      issues.push(`Webhook URL mismatch: registered URLs (${registeredUrls.join(', ')}) do not match the expected URL (${expectedWebhookUrl}). Check APP_URL in .env.`);
    }
    if (!publicKeyFetchable) {
      issues.push('Sproom RSA public key is NOT fetchable — ALL webhooks will be REJECTED (fail-closed). Set SPROOM_WEBHOOK_PUBLIC_KEY in .env as a fallback (get it from the Sproom dashboard → Profile → API settings).');
    }
    if (issues.length === 0) {
      report.diagnosis = 'OK — webhooks are registered + the public key is fetchable. If received invoices still do not appear, check pm2 logs for [WEBHOOK] entries (signature mismatch, tenant resolution failure, or XML fetch failure).';
    } else {
      report.diagnosis = 'Issues found: ' + issues.join(' | ');
    }

    logger.info('[SPROOM_WEBHOOK_STATUS] Diagnostic report', {
      companyId: ctx.activeCompanyId,
      childCompanyId: company.sproomChildCompanyId,
      webhookCount: webhooks.length,
      publicKeyFetchable,
      issues,
    });

    return NextResponse.json(report);
  }
);
