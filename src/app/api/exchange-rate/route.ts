import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/session';
import { requirePermission, Permission } from '@/lib/rbac';
import { getExchangeRate, getLatestExchangeRates } from '@/lib/currency-utils';
import { logger } from '@/lib/logger';

/**
 * GET /api/exchange-rate
 *
 * Query params:
 *   from=EUR&to=DKK           — single rate conversion
 *   currencies=EUR,USD,GBP     — bulk rates from DKK (optional)
 *
 * Returns:
 *   { rate, date, source } for single rate
 *   { rates, date, source } for bulk request
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx || !ctx.activeCompanyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = requirePermission(ctx, Permission.DATA_READ);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from')?.toUpperCase().trim();
    const to = searchParams.get('to')?.toUpperCase().trim();
    const currenciesParam = searchParams.get('currencies')?.toUpperCase().trim();

    // Bulk mode: return all rates for a set of currencies from DKK
    if (currenciesParam) {
      const requestedCurrencies = currenciesParam.split(',').map((c) => c.trim()).filter(Boolean);
      const allRates = await getLatestExchangeRates();

      if (!allRates) {
        return NextResponse.json({
          rates: null,
          date: null,
          source: 'unavailable',
          message: 'Exchange rate API is temporarily unavailable. You can enter rates manually.',
        });
      }

      // Build response with only the requested currencies
      const filteredRates: Record<string, number> = {};
      for (const currency of requestedCurrencies) {
        if (currency === 'DKK') {
          // DKK to DKK is always 1
          filteredRates['DKK'] = 1;
        } else if (allRates.rates[currency] != null) {
          // Return "how many DKK per 1 unit of foreign"
          const rawRate = allRates.rates[currency];
          if (rawRate !== 0) {
            filteredRates[currency] = Number((1 / rawRate).toFixed(6));
          }
        }
      }

      return NextResponse.json({
        rates: filteredRates,
        date: allRates.date,
        source: allRates.source,
      });
    }

    // Single rate mode: from → to
    if (!from || !to) {
      return NextResponse.json(
        { error: 'Missing required parameters: from and to, or currencies' },
        { status: 400 }
      );
    }

    const rate = await getExchangeRate(from, to);

    if (rate === null) {
      const allRates = await getLatestExchangeRates();
      return NextResponse.json({
        rate: null,
        date: allRates?.date ?? null,
        source: 'unavailable',
        message: 'Exchange rate API is temporarily unavailable. You can enter rates manually.',
      });
    }

    const allRates = await getLatestExchangeRates();

    return NextResponse.json({
      rate: Number(rate.toFixed(6)),
      date: allRates?.date ?? null,
      source: allRates?.source ?? 'frankfurter-api',
    });
  } catch (error) {
    logger.error('Exchange rate fetch failed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch exchange rate' },
      { status: 500 }
    );
  }
}
