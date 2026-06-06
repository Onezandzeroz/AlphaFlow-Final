import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { getProvider } from '@/lib/bank-providers';
import { tenantFilter, Permission } from '@/lib/rbac';
import { withGuard } from '@/lib/route-guard';
import { encryptOrNull } from '@/lib/crypto';

// GET - Check consent status for a bank connection
export const GET = withGuard(
  { auth: true, requireCompany: true, permissions: [Permission.BANK_CONNECT] },
  async (request, ctx, segmentData) => {
    try {
      const { id } = await (segmentData as { params: Promise<{ id: string }> }).params;

      const connection = await db.bankConnection.findFirst({
        where: { id, ...tenantFilter(ctx) },
      });

      if (!connection) {
        return NextResponse.json(
          { error: 'Bankforbindelse ikke fundet' },
          { status: 404 }
        );
      }

      const now = new Date();
      const isExpired = connection.consentExpiresAt
        ? new Date(connection.consentExpiresAt) < now
        : false;
      const daysUntilExpiry = connection.consentExpiresAt
        ? Math.ceil((new Date(connection.consentExpiresAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      return NextResponse.json({
        status: connection.status,
        consentId: connection.consentId,
        consentExpiresAt: connection.consentExpiresAt,
        isExpired,
        daysUntilExpiry,
        needsReauth: isExpired || connection.status === 'EXPIRED',
      });
    } catch (error) {
      logger.error('Check consent error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);

// POST - Initiate or renew consent for a bank connection
export const POST = withGuard(
  { auth: true, requireCompany: true, blockOversight: true, blockDemo: true, requireTokenPay: true, permissions: [Permission.BANK_CONNECT] },
  async (request, ctx, segmentData) => {
    try {
      const { id } = await (segmentData as { params: Promise<{ id: string }> }).params;

      const connection = await db.bankConnection.findFirst({
        where: { id, ...tenantFilter(ctx) },
      });

      if (!connection) {
        return NextResponse.json(
          { error: 'Bankforbindelse ikke fundet' },
          { status: 404 }
        );
      }

      const provider = getProvider(connection.provider);
      if (!provider) {
        return NextResponse.json(
          { error: 'Ukendt bankudbyder' },
          { status: 400 }
        );
      }

      // Initiate new consent
      const consentResult = await provider.initiateConsent({
        registrationNumber: connection.registrationNumber || '',
        accountNumber: connection.accountNumber,
        iban: connection.iban || undefined,
      });

      // AES-256-GCM encryption for tokens at rest (encryptOrNull handles null values)
      await db.bankConnection.update({
        where: { id },
        data: {
          consentId: consentResult.consentId,
          status: consentResult.status === 'active' ? 'ACTIVE' : 'PENDING',
          accessToken: consentResult.consentId ? encryptOrNull(consentResult.consentId) : null,
          consentExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          retryCount: 0,
          lastError: null,
        },
      });

      await auditCreate(
        ctx.id,
        'BankConnection',
        id,
        { action: 'consent_renew', bankName: connection.bankName },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      return NextResponse.json({
        consentId: consentResult.consentId,
        redirectUrl: consentResult.redirectUrl || null,
        status: consentResult.status,
      });
    } catch (error) {
      logger.error('Renew consent error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
