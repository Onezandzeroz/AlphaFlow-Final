/**
 * Bank Provider Abstraction Layer
 *
 * Supports:
 * - Tink API (preferred Open Banking aggregator) — FULL integration
 * - Direct bank APIs (Nordea, Danske Bank, Jyske Bank) — stubs
 * - Demo provider for testing with synthetic Danish transactions
 *
 * All providers implement the BankProvider interface.
 * OAuth2 + SCA consent flow is handled per-provider.
 *
 * Tink integration uses Tink Link for user authentication, Tink API
 * for account listing and transaction fetching. Requires:
 *   TINK_CLIENT_ID, TINK_CLIENT_SECRET (and optionally TINK_REDIRECT_URI)
 *
 * IMPORTANT: Real bank providers (Nordea, Danske Bank, etc.) require
 * API credentials to be configured via environment variables. Without
 * credentials, they return a simulated consent flow with status 'pending'
 * and a redirectUrl. They do NOT fall back to demo data.
 */

import {
  getTinkConfig,
  buildTinkLinkUrl,
  fetchAllTransactions,
} from '@/lib/tink-client';

// ─── Types ─────────────────────────────────────────────────────────

export interface BankTransaction {
  date: string;        // ISO date string YYYY-MM-DD
  description: string;
  reference: string;
  amount: number;
  balance: number;
  currency: string;
}

export interface ConsentResult {
  consentId: string;
  redirectUrl?: string;  // URL for SCA redirect
  status: 'pending' | 'active' | 'expired' | 'revoked';
  /** If true, this provider is not configured with API keys (sandbox mode) */
  sandboxMode?: boolean;
}

export interface SyncResult {
  transactions: BankTransaction[];
  hasMore: boolean;
  nextPageToken?: string;
}

export interface BankProvider {
  name: string;
  id: string;
  /** Whether this provider is the demo/test provider */
  isDemo: boolean;
  /** Whether this provider has real API credentials configured */
  isConfigured: boolean;
  /**
   * Whether this provider handles its own account selection after consent.
   * Tink returns a list of accounts from the bank — the user picks one
   * after the OAuth callback, so accountNumber is not needed upfront.
   */
  providesAccounts?: boolean;
  initiateConsent(params: {
    registrationNumber: string;
    accountNumber: string;
    iban?: string;
    /** Connection ID used as OAuth state parameter (for Tink) */
    connectionId?: string;
  }): Promise<ConsentResult>;
  refreshConsent(params: {
    consentId: string;
    refreshToken: string;
  }): Promise<ConsentResult>;
  fetchTransactions(params: {
    accessToken: string;
    accountNumber: string;
    fromDate: Date;
    toDate: Date;
  }): Promise<SyncResult>;
  /** Complete a pending consent authorization (sandbox callback) */
  completeConsent?(consentId: string): Promise<ConsentResult>;
}

// ─── Demo Bank Provider ────────────────────────────────────────────

function generateDemoTransactions(days: number = 30): BankTransaction[] {
  const transactions: BankTransaction[] = [];
  const now = new Date();
  let balance = 52438.50; // Starting balance

  // Template transactions with Danish patterns
  const templates = [
    { desc: 'MobilePay - Jens Hansen', minAmt: 50, maxAmt: 500, type: 'credit' as const, freq: 0.6 },
    { desc: 'MobilePay - Marie Sørensen', minAmt: 100, maxAmt: 800, type: 'credit' as const, freq: 0.3 },
    { desc: 'Nordea Leje A/S', minAmt: -8500, maxAmt: -7500, type: 'debit' as const, freq: 1.0 },
    { desc: 'SKAT - Kildeskat', minAmt: -15000, maxAmt: -10000, type: 'debit' as const, freq: 1.0 },
    { desc: 'Løn - Virksomhed ApS', minAmt: 30000, maxAmt: 40000, type: 'credit' as const, freq: 1.0 },
    { desc: 'REMA 1000 - København', minAmt: -600, maxAmt: -150, type: 'debit' as const, freq: 0.8 },
    { desc: 'Netto Supermarked', minAmt: -400, maxAmt: -100, type: 'debit' as const, freq: 0.7 },
    { desc: 'Føtex - Field\'s', minAmt: -800, maxAmt: -200, type: 'debit' as const, freq: 0.5 },
    { desc: 'DSB - Rejsekort', minAmt: -300, maxAmt: -50, type: 'debit' as const, freq: 0.6 },
    { desc: 'Orsted - El & Varme', minAmt: -1200, maxAmt: -600, type: 'debit' as const, freq: 1.0 },
    { desc: 'TDC - Mobilabonnement', minAmt: -299, maxAmt: -199, type: 'debit' as const, freq: 1.0 },
    { desc: 'Tryg Forsikring', minAmt: -2500, maxAmt: -1500, type: 'debit' as const, freq: 1.0 },
    { desc: 'Shell - Brændstof', minAmt: -600, maxAmt: -200, type: 'debit' as const, freq: 0.4 },
    { desc: 'IKEA Danmark', minAmt: -3000, maxAmt: -300, type: 'debit' as const, freq: 0.2 },
    { desc: 'Wolt - Restaurant', minAmt: -300, maxAmt: -80, type: 'debit' as const, freq: 0.5 },
    { desc: 'Apple - iCloud+', minAmt: -29, maxAmt: -9, type: 'debit' as const, freq: 1.0 },
    { desc: 'Spotify Premium', minAmt: -109, maxAmt: -59, type: 'debit' as const, freq: 1.0 },
    { desc: 'Faktura #2025-042 - Alpha Consult', minAmt: 5000, maxAmt: 25000, type: 'credit' as const, freq: 0.4 },
    { desc: 'Faktura #2025-038 - Beta Solutions', minAmt: 3000, maxAmt: 15000, type: 'credit' as const, freq: 0.3 },
    { desc: 'Overførsel - Sparekassen', minAmt: -20000, maxAmt: -5000, type: 'debit' as const, freq: 0.2 },
    { desc: 'MobilePay - Peter Nielsen', minAmt: -400, maxAmt: -50, type: 'debit' as const, freq: 0.3 },
  ];

  // Deterministic seed for consistent demo data
  let seed = 42;
  function seededRandom(): number {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  for (let d = days; d >= 0; d--) {
    const date = new Date(now);
    date.setDate(date.getDate() - d);
    const dateStr = date.toISOString().split('T')[0];

    // Skip weekends for salary and SKAT
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    for (const template of templates) {
      if (seededRandom() > template.freq) continue;

      // Salary and SKAT only on last business day of month approximation
      if ((template.desc.includes('Løn') || template.desc.includes('SKAT')) && d > 1) {
        if (seededRandom() > 0.03) continue;
      }

      // Skip weekends for some transactions
      if (isWeekend && template.desc.includes('Løn')) continue;

      let amount: number;
      if (template.type === 'credit') {
        amount = template.minAmt + seededRandom() * (template.maxAmt - template.minAmt);
      } else {
        amount = -(Math.abs(template.minAmt) + seededRandom() * (Math.abs(template.maxAmt) - Math.abs(template.minAmt)));
      }

      amount = Math.round(amount * 100) / 100;
      balance = Math.round((balance + amount) * 100) / 100;

      transactions.push({
        date: dateStr,
        description: template.desc,
        reference: `REF${dateStr.replace(/-/g, '')}${Math.floor(seededRandom() * 1000).toString().padStart(3, '0')}`,
        amount,
        balance,
        currency: 'DKK',
      });
    }
  }

  // Sort by date
  transactions.sort((a, b) => a.date.localeCompare(b.date));

  // Recalculate running balance
  let runningBalance = 52438.50;
  for (const tx of transactions) {
    runningBalance = Math.round((runningBalance + tx.amount) * 100) / 100;
    tx.balance = runningBalance;
  }

  return transactions;
}

const DemoBankProvider: BankProvider = {
  name: 'Demo Bank (Test)',
  id: 'demo',
  isDemo: true,
  isConfigured: true,

  async initiateConsent() {
    return {
      consentId: `demo-consent-${Date.now()}`,
      status: 'active',
    };
  },

  async refreshConsent() {
    return {
      consentId: `demo-consent-${Date.now()}`,
      status: 'active',
    };
  },

  async fetchTransactions(params) {
    const transactions = generateDemoTransactions(30);
    return {
      transactions,
      hasMore: false,
    };
  },
};

// ─── Real Bank Provider Factory ────────────────────────────────────
/**
 * Creates a real bank provider that requires API credentials.
 * Without credentials, it runs in "sandbox mode" which:
 * - Returns a simulated consent flow (pending → redirect)
 * - Does NOT return demo transaction data
 * - Requires explicit consent authorization before syncing
 */
function createRealBankProvider(config: {
  name: string;
  id: string;
  envKey: string;
  authorizeUrl: string;
}): BankProvider {
  const isConfigured = !!process.env[config.envKey];

  // In-memory store for sandbox pending consents
  const pendingConsents = new Map<string, { authorized: boolean }>();

  return {
    name: config.name,
    id: config.id,
    isDemo: false,
    isConfigured,

    async initiateConsent(params) {
      if (isConfigured) {
        // Production: redirect to real bank authorization
        const consentId = `${config.id}-consent-${Date.now()}`;
        return {
          consentId,
          redirectUrl: `${config.authorizeUrl}?consent_id=${consentId}&state=${consentId}`,
          status: 'pending',
        };
      }

      // Sandbox mode: simulated consent flow
      const consentId = `${config.id}-sandbox-${Date.now()}`;
      pendingConsents.set(consentId, { authorized: false });

      return {
        consentId,
        redirectUrl: `/api/bank-connections/consent-callback?consent_id=${consentId}&provider=${config.id}`,
        status: 'pending',
        sandboxMode: true,
      };
    },

    async refreshConsent(params) {
      if (isConfigured) {
        // Production: exchange refresh token
        return { consentId: params.consentId, status: 'active' };
      }
      // Sandbox: always active
      return { consentId: params.consentId, status: 'active' };
    },

    async fetchTransactions(params) {
      if (isConfigured) {
        // Production: fetch from real API
        throw new Error(`${config.name} API integration requires production configuration`);
      }
      // Sandbox: NO demo data for real banks
      // Real banks must go through consent flow first
      throw new Error(`${config.name} requires bank authorization before syncing. Complete the consent flow first.`);
    },

    async completeConsent(consentId: string) {
      if (!isConfigured && pendingConsents.has(consentId)) {
        pendingConsents.set(consentId, { authorized: true });
        return { consentId, status: 'active' };
      }
      if (!isConfigured) {
        // Unknown consent, still authorize
        return { consentId, status: 'active' };
      }
      // Production: would verify with the bank
      return { consentId, status: 'active' };
    },
  };
}

// ─── Tink Provider (Full Integration) ────────────────────────────

function createTinkProvider(): BankProvider {
  const config = getTinkConfig();
  const isConfigured = config !== null;

  return {
    name: 'Tink (Open Banking)',
    id: 'tink',
    isDemo: false,
    isConfigured,
    providesAccounts: true, // Tink returns account list after OAuth

    async initiateConsent(params) {
      if (!config) {
        // No credentials configured — fall back to generic sandbox stub
        // (same as the old createRealBankProvider behavior for unconfigured providers)
        const consentId = `tink-sandbox-${Date.now()}`;
        return {
          consentId,
          redirectUrl: `/api/bank-connections/consent-callback?consent_id=${consentId}&provider=tink`,
          status: 'pending',
          sandboxMode: true,
        };
      }

      // Build the Tink Link authorization URL.
      // The `state` parameter carries the connection ID so the callback
      // can update the correct BankConnection record.
      const state = params.connectionId || `tink-${Date.now()}`;
      const redirectUrl = buildTinkLinkUrl(config, state);

      return {
        consentId: state,
        redirectUrl,
        status: 'pending',
      };
    },

    async refreshConsent(params) {
      if (!config) {
        return { consentId: params.consentId, status: 'active' };
      }

      // Attempt to re-authorize via stored credentialsId (refreshToken field)
      // If the credential is still valid on Tink's side, we can get a new
      // access token without user interaction.
      // Note: This requires a currently-valid access_token, which we may not
      // have. In that case, the user must re-authenticate through Tink Link.
      // The re-auth flow is handled in the sync route.
      return {
        consentId: params.consentId,
        redirectUrl: buildTinkLinkUrl(config, params.consentId),
        status: 'pending',
      };
    },

    async fetchTransactions(params) {
      if (!config) {
        throw new Error(
          'Tink er ikke konfigureret. Sæt TINK_CLIENT_ID og TINK_CLIENT_SECRET i .env.'
        );
      }

      // The accessToken here is the decrypted Tink access_token.
      // The accountNumber here is the Tink accountId (stored after account selection).
      const result = await fetchAllTransactions(config, params.accessToken, params.accountNumber, {
        fromDate: params.fromDate,
        toDate: params.toDate,
      });

      // Convert Tink transactions to BankTransaction format
      const transactions: BankTransaction[] = result.map(tx => ({
        date: tx.date,
        description: tx.description || tx.merchantName || '',
        reference: tx.id,
        amount: tx.amount,
        balance: tx.balance ?? 0,
        currency: tx.currencyCode || 'DKK',
      }));

      return {
        transactions,
        hasMore: false, // fetchAllTransactions handles pagination internally
      };
    },
  };
}

// ─── Provider Instances ─────────────────────────────────────────────

const TinkProvider = createTinkProvider();

const NordeaProvider = createRealBankProvider({
  name: 'Nordea',
  id: 'nordea',
  envKey: 'NORDEA_CLIENT_ID',
  authorizeUrl: 'https://openbanking.nordea.com/authorize',
});

const DanskeBankProvider = createRealBankProvider({
  name: 'Danske Bank',
  id: 'danske_bank',
  envKey: 'DANSKE_BANK_CLIENT_ID',
  authorizeUrl: 'https://openbanking.danskebank.com/authorize',
});

const JyskeBankProvider = createRealBankProvider({
  name: 'Jyske Bank',
  id: 'jyske_bank',
  envKey: 'JYSKE_BANK_CLIENT_ID',
  authorizeUrl: 'https://openbanking.jyskebank.dk/authorize',
});

// ─── Provider Registry ─────────────────────────────────────────────

const providers: Map<string, BankProvider> = new Map([
  ['demo', DemoBankProvider],
  ['tink', TinkProvider],
  ['nordea', NordeaProvider],
  ['danske_bank', DanskeBankProvider],
  ['jyske_bank', JyskeBankProvider],
]);

export function getProvider(providerId: string): BankProvider | undefined {
  return providers.get(providerId);
}

export function getAllProviders(): BankProvider[] {
  return Array.from(providers.values());
}

export function getAvailableBanks(): { id: string; name: string; isDemo: boolean; isConfigured: boolean; providesAccounts?: boolean }[] {
  return Array.from(providers.values()).map(p => ({
    id: p.id,
    name: p.name,
    isDemo: p.isDemo,
    isConfigured: p.isConfigured,
    providesAccounts: p.providesAccounts,
  }));
}

// Export the demo transaction generator for testing
export { generateDemoTransactions };
