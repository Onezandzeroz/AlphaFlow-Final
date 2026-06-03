/**
 * Currency formatting utilities
 *
 * Supports: DKK, EUR, USD, GBP, SEK, NOK
 * Provides proper symbol placement, decimal formatting, and locale-aware display.
 */

export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
  locale: string;
  decimals: number;
  symbolBeforeAmount: boolean;
  spaceBetweenSymbolAndAmount: boolean;
}

export const CURRENCY_CONFIG: Record<string, CurrencyConfig> = {
  DKK: {
    code: 'DKK',
    symbol: 'kr.',
    name: 'Danish Krone',
    locale: 'da-DK',
    decimals: 2,
    symbolBeforeAmount: false,
    spaceBetweenSymbolAndAmount: false,
  },
  EUR: {
    code: 'EUR',
    symbol: '\u20AC',
    name: 'Euro',
    locale: 'da-DK',
    decimals: 2,
    symbolBeforeAmount: false,
    spaceBetweenSymbolAndAmount: false,
  },
  USD: {
    code: 'USD',
    symbol: '$',
    name: 'US Dollar',
    locale: 'en-US',
    decimals: 2,
    symbolBeforeAmount: true,
    spaceBetweenSymbolAndAmount: false,
  },
  GBP: {
    code: 'GBP',
    symbol: '\u00A3',
    name: 'British Pound',
    locale: 'en-GB',
    decimals: 2,
    symbolBeforeAmount: true,
    spaceBetweenSymbolAndAmount: false,
  },
  SEK: {
    code: 'SEK',
    symbol: 'kr',
    name: 'Swedish Krona',
    locale: 'sv-SE',
    decimals: 2,
    symbolBeforeAmount: false,
    spaceBetweenSymbolAndAmount: true,
  },
  NOK: {
    code: 'NOK',
    symbol: 'kr',
    name: 'Norwegian Krone',
    locale: 'nb-NO',
    decimals: 2,
    symbolBeforeAmount: false,
    spaceBetweenSymbolAndAmount: true,
  },
};

/**
 * Format a number as a currency string with proper symbol and decimals.
 *
 * @param amount - The numeric amount to format
 * @param currency - Currency code (e.g. 'DKK', 'EUR', 'USD')
 * @returns Formatted string, e.g. "1.234,56 kr.", "€1,234.56"
 */
export function formatCurrency(amount: number, currency: string = 'DKK'): string {
  const config = CURRENCY_CONFIG[currency] || CURRENCY_CONFIG.DKK;

  // Defensive: convert string/object to number (Prisma Decimal may arrive as string)
  const num = typeof amount === 'number' ? amount : Number(amount);
  if (isNaN(num)) {
    const fallback = (0).toFixed(config.decimals);
    return config.symbolBeforeAmount
      ? `${config.symbol}${fallback}`
      : `${fallback} ${config.symbol}`;
  }

  try {
    return new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: config.code,
      minimumFractionDigits: config.decimals,
      maximumFractionDigits: config.decimals,
    }).format(num);
  } catch {
    // Fallback if Intl formatting fails
    const fixed = num.toFixed(config.decimals);
    if (config.symbolBeforeAmount) {
      return `${config.symbol}${fixed}`;
    }
    return `${fixed} ${config.symbol}`;
  }
}

/**
 * Get the currency config for a given currency code.
 * Falls back to DKK if the currency is not recognized.
 */
export function getCurrencyConfig(currency: string): CurrencyConfig {
  return CURRENCY_CONFIG[currency] || CURRENCY_CONFIG.DKK;
}

/**
 * Validate if a currency code is supported.
 */
export function isSupportedCurrency(currency: string): boolean {
  return currency in CURRENCY_CONFIG;
}

/**
 * Format a number with decimal places for use in PDF tables.
 * Uses comma as decimal separator (Danish convention).
 */
export function formatNumberForPDF(amount: number | null | undefined, decimals: number = 2): string {
  if (amount == null) return '0'.padEnd(decimals + 1, '0');
  // Defensive: convert string/object to number
  const num = typeof amount === 'number' ? amount : Number(amount);
  if (isNaN(num)) return '0'.padEnd(decimals + 1, '0');
  return num.toLocaleString('da-DK', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Get the currency symbol for a given currency code.
 */
export function getCurrencySymbol(currency: string): string {
  const config = CURRENCY_CONFIG[currency];
  return config ? config.symbol : CURRENCY_CONFIG.DKK.symbol;
}

// ─── EXCHANGE RATE SYSTEM ────────────────────────────────────────────

/** Cache entry for an exchange rate fetch */
interface CacheEntry {
  rates: Record<string, number>;
  date: string;
  fetchedAt: number;
}

/** In-memory cache with 1-hour TTL */
const exchangeRateCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/** The primary API source for exchange rates (Frankfurter — free, EU-based, no key required) */
const FRANKFURTER_API = 'https://api.frankfurter.app';

/** Supported foreign currencies for DKK exchange */
const SUPPORTED_FOREIGN = ['EUR', 'USD', 'GBP', 'SEK', 'NOK'] as const;
const ALL_CURRENCIES = ['DKK', ...SUPPORTED_FOREIGN] as const;

/**
 * Fetch the latest exchange rates from the Frankfurter API.
 * Returns all rates relative to DKK, or null on failure.
 */
async function fetchRatesFromAPI(): Promise<{ rates: Record<string, number>; date: string } | null> {
  const targetCurrencies = SUPPORTED_FOREIGN.join(',');
  const url = `${FRANKFURTER_API}/latest?from=DKK&to=${targetCurrencies}`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000), // 10 second timeout
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (!data || !data.rates || typeof data.rates !== 'object') {
      return null;
    }

    return {
      rates: data.rates as Record<string, number>,
      date: data.date ?? new Date().toISOString().split('T')[0],
    };
  } catch {
    return null;
  }
}

/**
 * Get cached rates for a given base currency, fetching fresh rates if the cache is stale.
 * Always fetches with base=DKK and computes inverses/cross-rates as needed.
 */
async function getCachedRates(): Promise<{ rates: Record<string, number>; date: string; source: string } | null> {
  const cacheKey = 'DKK';
  const now = Date.now();

  // Check cache
  const cached = exchangeRateCache.get(cacheKey);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return {
      rates: cached.rates,
      date: cached.date,
      source: 'frankfurter-api (cached)',
    };
  }

  // Fetch fresh rates
  const result = await fetchRatesFromAPI();
  if (!result) {
    // If API fails but we have stale cache, return it as a fallback
    if (cached) {
      return {
        rates: cached.rates,
        date: cached.date,
        source: 'frankfurter-api (stale fallback)',
      };
    }
    return null;
  }

  // Update cache
  exchangeRateCache.set(cacheKey, {
    rates: result.rates,
    date: result.date,
    fetchedAt: now,
  });

  return {
    rates: result.rates,
    date: result.date,
    source: 'frankfurter-api',
  };
}

/**
 * Get the exchange rate between two currencies.
 *
 * The rate returned is: "how many units of `from` equals 1 unit of `to`".
 * For example, getExchangeRate('DKK', 'EUR') ≈ 7.46 means 7.46 DKK = 1 EUR.
 *
 * Uses the Frankfurter API (ECB reference rates, free, EU-based) with 1-hour in-memory caching.
 * Falls back to stale cache if the API is temporarily unavailable.
 *
 * @param from - Source currency code (e.g. 'DKK')
 * @param to - Target currency code (e.g. 'EUR')
 * @returns Exchange rate, or null if unavailable
 */
export async function getExchangeRate(
  from: string,
  to: string
): Promise<number | null> {
  const normalizedFrom = from.toUpperCase().trim();
  const normalizedTo = to.toUpperCase().trim();

  // Same currency — no conversion needed
  if (normalizedFrom === normalizedTo) {
    return 1.0;
  }

  // Get cached rates (base=DKK)
  const data = await getCachedRates();
  if (!data) {
    return null;
  }

  const dkkToForeign = data.rates; // e.g., { EUR: 0.134, USD: 0.144, ... }

  // DKK → foreign: rate is directly in the cache
  // getExchangeRate('DKK', 'EUR') = 1 / dkkToForeign.EUR
  // Wait — the Frankfurter API returns rates as: 1 DKK = X foreign.
  // So dkkToForeign.EUR = 0.134 means 1 DKK = 0.134 EUR.
  // We want: how many DKK per 1 EUR = 1 / 0.134 ≈ 7.46
  // But the function returns "units of `from` per 1 unit of `to`":
  //   getExchangeRate('DKK', 'EUR') = units of DKK per 1 EUR = 1 / 0.134
  //   getExchangeRate('EUR', 'DKK') = units of EUR per 1 DKK = 0.134
  //   getExchangeRate('EUR', 'USD') = units of EUR per 1 USD = dkkToForeign.USD / dkkToForeign.EUR

  if (normalizedFrom === 'DKK' && normalizedTo !== 'DKK') {
    const foreignRate = dkkToForeign[normalizedTo];
    if (foreignRate == null || foreignRate === 0) return null;
    // How many DKK per 1 unit of foreign
    return 1 / foreignRate;
  }

  if (normalizedFrom !== 'DKK' && normalizedTo === 'DKK') {
    const foreignRate = dkkToForeign[normalizedFrom];
    if (foreignRate == null) return null;
    // How many foreign per 1 DKK (this is the direct rate)
    return foreignRate;
  }

  // Foreign → Foreign cross-rate
  const fromRate = dkkToForeign[normalizedFrom];
  const toRate = dkkToForeign[normalizedTo];
  if (fromRate == null || fromRate === 0 || toRate == null || toRate === 0) return null;
  // Cross-rate: (1/fromRate) / (1/toRate) = toRate / fromRate
  return toRate / fromRate;
}

/**
 * Fetch all latest exchange rates from DKK at once.
 * Returns rates for EUR, USD, GBP, SEK, NOK relative to DKK.
 *
 * @returns Object with rates, date, and source, or null on failure
 */
export async function getLatestExchangeRates(): Promise<{
  rates: Record<string, number>;
  date: string;
  source: string;
} | null> {
  return getCachedRates();
}
