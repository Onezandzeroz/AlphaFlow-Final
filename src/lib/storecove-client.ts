/**
 * Storecove Access Point REST API Client
 *
 * Production-ready client for the Storecove Peppol Access Point API.
 * Enables AlphaFlow to submit e-invoices directly to the Peppol network
 * and NemHandel eDelivery via Storecove.
 *
 * Storecove API docs: https://www.storecove.com/docs/api/
 *
 * Workflow: Generate XML → Validate → Send to Storecove API → Auto-delivered via Peppol
 *
 * ─── NemHandel eDelivery Integration ────────────────────────────────
 *
 * When routeToNemhandel is true, Storecove routes the invoice through
 * the Danish NemHandel eDelivery network in addition to Peppol.
 * NemHandel eDelivery follows Peppol AS4 specifications with these
 * Danish-specific extensions (as of 2023 transition):
 *
 * 1. MitID Certificate: Storecove signs with a MitID Erhverv certificate
 *    on AlphaFlow's behalf (required by NemHandel; Peppol certificates
 *    not yet supported by NemHandel).
 *
 * 2. Schema Validation (XSD): The receiving Access Point MUST perform
 *    schema validation as part of the AS4 transmission process before
 *    issuing a transport acknowledgment.
 *
 * 3. Schematron Validation: The receiving AP MUST perform full
 *    schematron validation (OIOUBL schematrons) before forwarding
 *    the payload downstream.
 *
 * 4. MLR/AR Mandatory: If schematron validation fails, the receiving AP
 *    MUST return a Message Level Response (MLR) or Application Response
 *    (AR) to the sender. All senders MUST be capable of receiving MLR/AR.
 *
 * 5. eDelivery SML: NemHandel uses the eDelivery SML maintained by the
 *    European Commission. Nemhandelsregisteret (NHR) provides the SMP.
 *
 * All of the above is handled by Storecove as the Access Point provider.
 * AlphaFlow only needs to generate valid OIOUBL XML and submit it with
 * routeToNemhandel: true.
 *
 * ─── Features ──────────────────────────────────────────────────────
 *
 * - JWT Bearer token authentication
 * - Invoice submission (OIOUBL + Peppol BIS Billing 3.0)
 * - NemHandel eDelivery routing (routeToNemhandel option)
 * - Delivery status tracking with polling
 * - Peppol participant lookup (pre-flight check, including NHR)
 * - Webhook signature verification (HMAC-SHA256)
 * - Automatic retry with exponential backoff
 * - Danish CVR → Peppol scheme ID mapping
 */

import { logger } from '@/lib/logger';
import { createHmac, timingSafeEqual } from 'crypto';

// ─── TYPES ────────────────────────────────────────────────────────

/** Configuration for the Storecove client */
export interface StorecoveClientConfig {
  /** Storecove API base URL (default: https://api.storecove.com/v2) */
  baseUrl?: string;
  /** Storecove API key (JWT Bearer token) */
  apiKey?: string;
  /** Storecove webhook secret for HMAC verification */
  webhookSecret?: string;
  /** Whether to use simulation mode (default: true if no API key) */
  simulationMode?: boolean;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/** Result of submitting an invoice to Storecove */
export interface StorecoveSubmissionResult {
  success: boolean;
  submissionId?: string;
  storecoveId?: string;
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
  status?: string;
  /** Whether NemHandel eDelivery routing was requested */
  nemhandelRouted?: boolean;
  /** AS4 message ID (for NemHandel eDelivery tracking) */
  as4MessageId?: string;
}

/** Delivery status from Storecove */
export interface StorecoveDeliveryStatus {
  status: StorecoveSubmissionStatus;
  storecoveId?: string;
  deliveredAt?: string;
  acceptedAt?: string;
  rejectedAt?: string;
  /** Rejection reason — for NemHandel eDelivery, this may include schematron validation errors */
  rejectionReason?: string;
  receiverEndpointId?: string;
  receiverScheme?: string;
  receiverIdentifier?: string;
  /** Whether the receiving AP completed schema validation (NemHandel eDelivery) */
  schemaValidated?: boolean;
  /** Whether the receiving AP completed schematron validation (NemHandel eDelivery) */
  schematronValidated?: boolean;
  /** MLR/AR response from receiving AP (NemHandel eDelivery requirement) */
  mlrResponse?: string;
}

/** Storecove submission statuses */
export type StorecoveSubmissionStatus =
  | 'processing'
  | 'delivered'
  | 'accepted'
  | 'rejected'
  | 'undeliverable'
  | 'expired'
  | 'failed';

/** Result of a Peppol participant lookup */
export interface StorecoveParticipantResult {
  exists: boolean;
  scheme: string;
  identifier: string;
  name?: string;
  countryCode?: string;
  accessPoints?: Array<{
    id: string;
    name: string;
  }>;
}

/** Storecove webhook event payload */
export interface StorecoveWebhookEvent {
  event: 'invoice_submission.status_changed' | 'invoice_submission.created' | 'legal_entity.updated';
  timestamp: string;
  data: {
    id: string;
    storecove_id: number;
    status: StorecoveSubmissionStatus;
    delivered_at?: string;
    accepted_at?: string;
    rejected_at?: string;
    rejection_reason?: string;
    receiver_endpoint_id?: string;
    receiver_scheme?: string;
    receiver_identifier?: string;
  };
}

/** Storecove legal entity */
export interface StorecoveLegalEntity {
  id: number;
  name: string;
  tax_regime: string;
  primary_email: string;
  peppol_identifiers: Array<{
    scheme: string;
    identifier: string;
  }>;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/** Storecove API error response */
interface StorecoveApiError {
  error: string;
  message: string;
  details?: unknown;
}

// ─── CONSTANTS ────────────────────────────────────────────────────

/** Storecove API base URL (EU region) */
const DEFAULT_BASE_URL = 'https://api.storecove.com/v2';

/** Default request timeout (30 seconds) */
const DEFAULT_TIMEOUT = 30000;

/** Maximum number of retries for transient failures */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff (1 second) */
const BASE_RETRY_DELAY_MS = 1000;

/** Peppol scheme ID mapping for common EU countries */
const PEPPOL_SCHEME_MAP: Record<string, string> = {
  DK: '0184',   // CVR (Danish Central Business Register)
  SE: '0188',   // Organisationsnummer
  NO: '0188',   // Organisasjonsnummer
  FI: '0188',   // Y-tunnus
  NL: '0188',   // KvK-nummer
  DE: '0188',   // Handelsregisternummer
  BE: '0188',   // KBO-nummer
  FR: '0188',   // SIREN
  GB: '0188',   // Company Number
  IT: '0188',   // Codice Fiscale / Partita IVA
  ES: '0188',   // CIF / NIF
  PT: '0188',   // NIF
  AT: '0188',   // Firmenbuchnummer
  IE: '0188',   // CRO Number
  LU: '0188',   // RCS
  PL: '0188',   // NIP
  CZ: '0188',   // ICO
  SK: '0188',   // ICO
  HU: '0188',   // Cegjegyzek
  RO: '0188',   // ONRC
  BG: '0188',   // EIK
  HR: '0188',   // OIB
  SI: '0188',   // Maticna
  EE: '0188',   // Registrikood
  LV: '0188',   // Reģistrācijas numurs
  LT: '0188',   // Įmonės kodas
  MT: '0188',   // Registration Number
  CY: '0188',   // Registration Number
  IS: '0188',   // Kennitala
  LI: '0188',   // UID
  CH: '0188',   // UID
};

// ─── CLIENT CLASS ─────────────────────────────────────────────────

/**
 * Storecove Access Point API client for Peppol e-invoice delivery.
 *
 * Supports both production and simulation modes. In simulation mode,
 * all API calls return realistic synthetic responses for development.
 * In production, it makes real HTTP calls to the Storecove REST API.
 */
export class StorecoveClient {
  private baseUrl: string;
  private apiKey: string;
  private webhookSecret: string;
  private simulationMode: boolean;
  private timeout: number;

  constructor(config: StorecoveClientConfig = {}) {
    this.baseUrl = config.baseUrl || process.env.STORECOVE_API_URL || DEFAULT_BASE_URL;
    this.apiKey = config.apiKey || process.env.STORECOVE_API_KEY || '';
    this.webhookSecret = config.webhookSecret || process.env.STORECOVE_WEBHOOK_SECRET || '';
    this.simulationMode = config.simulationMode ?? (this.apiKey ? false : true);
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
  }

  // ─── CONNECTION TEST ──────────────────────────────────────────────

  /**
   * Test the Storecove API connection by fetching legal entities.
   * Returns true if the API key is valid and the connection works.
   */
  async testConnection(): Promise<{ connected: boolean; error?: string; legalEntitiesCount?: number }> {
    if (this.simulationMode) {
      return this.simulateTestConnection();
    }

    try {
      const response = await this.makeRequest('GET', '/legal_entities');

      if (!response.ok) {
        const error = await this.parseError(response);
        return {
          connected: false,
          error: error.message || `API returned ${response.status}`,
        };
      }

      const entities = await response.json() as StorecoveLegalEntity[];
      return {
        connected: true,
        legalEntitiesCount: entities.length,
      };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  // ─── LEGAL ENTITIES ──────────────────────────────────────────────

  /**
   * Get all legal entities registered in Storecove for this account.
   * Legal entities represent the companies that can send/receive via Peppol.
   */
  async getLegalEntities(): Promise<StorecoveLegalEntity[]> {
    if (this.simulationMode) {
      return this.simulateGetLegalEntities();
    }

    const response = await this.makeRequest('GET', '/legal_entities');
    this.assertOk(response, 'Failed to fetch legal entities');
    return response.json() as Promise<StorecoveLegalEntity[]>;
  }

  // ─── INVOICE SUBMISSION ──────────────────────────────────────────

  /**
   * Submit an e-invoice XML to Storecove for delivery via Peppol.
   *
   * This is the primary method for the AlphaFlow workflow:
   *   Generate XML → Validate → Submit to Storecove → Auto-delivered
   *
   * @param xmlContent - Valid UBL 2.1 / OIOUBL XML string
   * @param options - Submission options (routing, legal entity, etc.)
   * @returns Submission result with tracking IDs
   */
  async submitInvoice(
    xmlContent: string,
    options: {
      /** Legal entity ID in Storecove (required for production) */
      legalEntityId?: number;
      /** Override receiver scheme (e.g., '0184' for Danish CVR) */
      receiverScheme?: string;
      /** Override receiver identifier (e.g., CVR number) */
      receiverIdentifier?: string;
      /**
       * Route to Danish NemHandel eDelivery network as well.
       *
       * When true, Storecove will:
       * - Sign with MitID Erhverv certificate (required by NemHandel)
       * - Route via AS4 to NemHandel eDelivery network
       * - The receiving AP will perform schema + schematron validation
       * - MLR/AR will be returned if schematron validation fails
       *
       * This ensures delivery to Danish public institutions that
       * only accept invoices via NemHandel.
       */
      routeToNemhandel?: boolean;
    } = {},
  ): Promise<StorecoveSubmissionResult> {
    if (this.simulationMode) {
      return this.simulateSubmitInvoice(xmlContent, options);
    }

    try {
      const body: Record<string, unknown> = {
        invoice: {
          document: xmlContent,
        },
      };

      // Set legal entity if provided
      if (options.legalEntityId) {
        body.legal_entity_id = options.legalEntityId;
      }

      // Set routing overrides if provided
      if (options.receiverScheme && options.receiverIdentifier) {
        body.invoice = {
          ...(body.invoice as Record<string, unknown>),
          routing: {
            scheme: options.receiverScheme,
            identifier: options.receiverIdentifier,
          },
        };
      }

      // Route to NemHandel eDelivery if requested.
      // NemHandel eDelivery follows Peppol AS4 specifications with Danish extensions:
      // - MitID certificate signing (handled by Storecove)
      // - Schema validation at receiving AP (required before transport ack)
      // - Schematron validation before forwarding downstream
      // - MLR/AR response if schematron validation fails
      // - Uses eDelivery SML (EC) and NHR SMP (Nemhandelsregisteret)
      if (options.routeToNemhandel) {
        body.invoice = {
          ...(body.invoice as Record<string, unknown>),
          nemhandel: true,
        };
      }

      const response = await this.makeRequestWithRetry('POST', '/invoice_submissions', body);

      if (!response.ok) {
        const error = await this.parseError(response);
        return {
          success: false,
          errorCode: error.error || `STORECOVE_${response.status}`,
          errorMessage: error.message || `Storecove API error: ${response.status}`,
        };
      }

      const result = await response.json() as {
        id: string;
        storecove_id: number;
        status: string;
        message_id?: string;
      };

      return {
        success: true,
        submissionId: result.id,
        storecoveId: String(result.storecove_id),
        messageId: result.message_id,
        status: result.status,
        nemhandelRouted: options.routeToNemhandel ?? false,
      };
    } catch (error) {
      logger.error('[STORECOVE] Invoice submission failed:', error);
      return {
        success: false,
        errorCode: 'STORECOVE_EXCEPTION',
        errorMessage: error instanceof Error ? error.message : 'Unknown error during submission',
      };
    }
  }

  // ─── DELIVERY STATUS ──────────────────────────────────────────────

  /**
   * Get the delivery status of a previously submitted invoice.
   *
   * @param submissionId - The submission ID returned from submitInvoice
   * @returns Current delivery status
   */
  async getSubmissionStatus(submissionId: string): Promise<StorecoveDeliveryStatus> {
    if (this.simulationMode) {
      return this.simulateGetSubmissionStatus(submissionId);
    }

    try {
      const response = await this.makeRequest('GET', `/invoice_submissions/${submissionId}`);

      if (!response.ok) {
        const error = await this.parseError(response);
        return {
          status: 'failed',
          rejectionReason: error.message || `Failed to fetch status: ${response.status}`,
        };
      }

      const result = await response.json() as {
        id: string;
        storecove_id: number;
        status: StorecoveSubmissionStatus;
        delivered_at?: string;
        accepted_at?: string;
        rejected_at?: string;
        rejection_reason?: string;
        receiver_endpoint_id?: string;
        receiver_scheme?: string;
        receiver_identifier?: string;
      };

      return {
        status: result.status,
        storecoveId: String(result.storecove_id),
        deliveredAt: result.delivered_at,
        acceptedAt: result.accepted_at,
        rejectedAt: result.rejected_at,
        rejectionReason: result.rejection_reason,
        receiverEndpointId: result.receiver_endpoint_id,
        receiverScheme: result.receiver_scheme,
        receiverIdentifier: result.receiver_identifier,
      };
    } catch (error) {
      return {
        status: 'failed',
        rejectionReason: error instanceof Error ? error.message : 'Failed to fetch status',
      };
    }
  }

  // ─── PEPPOL PARTICIPANT LOOKUP ────────────────────────────────────

  /**
   * Check if a recipient is registered on the Peppol network.
   *
   * Pre-flight check before sending: verifies that the recipient's
   * Access Point can receive e-invoices via Peppol BIS Billing 3.0.
   *
   * @param scheme - Peppol scheme ID (e.g., '0184' for Danish CVR)
   * @param identifier - The identifier value (e.g., CVR number)
   * @returns Participant information or existence check result
   */
  async lookupParticipant(
    scheme: string,
    identifier: string,
  ): Promise<StorecoveParticipantResult> {
    if (this.simulationMode) {
      return this.simulateLookupParticipant(scheme, identifier);
    }

    try {
      const response = await this.makeRequest(
        'GET',
        `/peppol/participants/${encodeURIComponent(scheme)}/${encodeURIComponent(identifier)}`,
      );

      if (response.status === 404) {
        return {
          exists: false,
          scheme,
          identifier,
        };
      }

      if (!response.ok) {
        const error = await this.parseError(response);
        logger.warn('[STORECOVE] Participant lookup failed:', error);
        return {
          exists: false,
          scheme,
          identifier,
        };
      }

      const result = await response.json() as {
        scheme: string;
        identifier: string;
        name?: string;
        country_code?: string;
        access_points?: Array<{ id: string; name: string }>;
      };

      return {
        exists: true,
        scheme: result.scheme,
        identifier: result.identifier,
        name: result.name,
        countryCode: result.country_code,
        accessPoints: result.access_points,
      };
    } catch (error) {
      logger.warn('[STORECOVE] Participant lookup exception:', error);
      return {
        exists: false,
        scheme,
        identifier,
      };
    }
  }

  // ─── WEBHOOK VERIFICATION ─────────────────────────────────────────

  /**
   * Verify the authenticity of a Storecove webhook request.
   *
   * Storecove signs webhook payloads using HMAC-SHA256 with the
   * webhook secret configured in the Storecove dashboard.
   *
   * @param payload - Raw request body (string)
   * @param signature - X-Storecove-Signature header value
   * @returns true if the signature is valid
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    // SECURITY (U-6): Fail-closed — reject ALL webhooks when no secret is
    // configured. The old "accept all" fallback allowed unauthenticated
    // webhook forgery in production if STORECOVE_WEBHOOK_SECRET was missing.
    if (!this.webhookSecret) {
      logger.error('[STORECOVE] WEBHOOK REJECTED: STORECOVE_WEBHOOK_SECRET is not configured. ' +
        'Set it in production .env.');
      return false;
    }

    try {
      const expectedSig = createHmac('sha256', this.webhookSecret)
        .update(payload)
        .digest('hex');

      // Constant-time comparison to prevent timing attacks
      const bufferA = Buffer.from(signature, 'hex');
      const bufferB = Buffer.from(expectedSig, 'hex');

      if (bufferA.length !== bufferB.length) {
        return false;
      }

      return timingSafeEqual(bufferA, bufferB);
    } catch (error) {
      logger.error('[STORECOVE] Webhook verification error:', error);
      return false;
    }
  }

  // ─── HELPERS ──────────────────────────────────────────────────────

  /**
   * Get the Peppol scheme ID for a country code.
   * E.g., 'DK' → '0184' (CVR), 'SE' → '0188' (Organisationsnummer)
   */
  static getSchemeForCountry(countryCode: string): string {
    return PEPPOL_SCHEME_MAP[countryCode.toUpperCase()] || '0188';
  }

  /**
   * Build a Peppol endpoint identifier from country and identifier.
   * E.g., ('DK', '12345678') → '0184:12345678'
   */
  static buildEndpointId(countryCode: string, identifier: string): string {
    const scheme = StorecoveClient.getSchemeForCountry(countryCode);
    return `${scheme}:${identifier}`;
  }

  /**
   * Parse a Peppol endpoint identifier into scheme and identifier.
   * E.g., '0184:12345678' → { scheme: '0184', identifier: '12345678' }
   */
  static parseEndpointId(endpointId: string): { scheme: string; identifier: string } | null {
    const parts = endpointId.split(':');
    if (parts.length !== 2) return null;
    return { scheme: parts[0], identifier: parts[1] };
  }

  /**
   * Map Storecove status to AlphaFlow EInvoiceSendStatus.
   */
  static mapStatusToAlphaFlow(status: StorecoveSubmissionStatus): string {
    switch (status) {
      case 'processing':
        return 'SENDING';
      case 'delivered':
        return 'DELIVERED';
      case 'accepted':
        return 'ACCEPTED';
      case 'rejected':
        return 'REJECTED';
      case 'undeliverable':
      case 'expired':
      case 'failed':
        return 'FAILED';
      default:
        return 'FAILED';
    }
  }

  /**
   * Check if the client is configured for production use.
   */
  get isConfigured(): boolean {
    return !this.simulationMode && !!this.apiKey;
  }

  // ─── PRIVATE: HTTP REQUESTS ───────────────────────────────────────

  /**
   * Make an authenticated HTTP request to the Storecove API.
   */
  private async makeRequest(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Accept': 'application/json',
    };

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Make an HTTP request with automatic retry on transient failures.
   */
  private async makeRequestWithRetry(
    method: string,
    path: string,
    body?: unknown,
    retriesLeft: number = MAX_RETRIES,
  ): Promise<Response> {
    try {
      const response = await this.makeRequest(method, path, body);

      // Retry on 429 (rate limit) and 5xx (server error)
      if (
        (response.status === 429 || response.status >= 500) &&
        retriesLeft > 0
      ) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, MAX_RETRIES - retriesLeft);
        logger.info(`[STORECOVE] Retrying ${method} ${path} in ${delay}ms (${retriesLeft} retries left)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeRequestWithRetry(method, path, body, retriesLeft - 1);
      }

      return response;
    } catch (error) {
      if (retriesLeft > 0) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, MAX_RETRIES - retriesLeft);
        logger.info(`[STORECOVE] Network error, retrying ${method} ${path} in ${delay}ms (${retriesLeft} retries left)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeRequestWithRetry(method, path, body, retriesLeft - 1);
      }
      throw error;
    }
  }

  /**
   * Parse a Storecove API error response.
   */
  private async parseError(response: Response): Promise<StorecoveApiError> {
    try {
      return await response.json() as StorecoveApiError;
    } catch {
      return {
        error: `HTTP_${response.status}`,
        message: `Storecove API error: ${response.status} ${response.statusText}`,
      };
    }
  }

  /**
   * Assert that a response is OK; throw with a descriptive message otherwise.
   */
  private async assertOk(response: Response, context: string): Promise<void> {
    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(`${context}: ${error.message || response.statusText}`);
    }
  }

  // ─── SIMULATION HELPERS ───────────────────────────────────────────

  private async simulateTestConnection(): Promise<{ connected: boolean; legalEntitiesCount?: number }> {
    await this.simulateLatency(50, 200);
    return { connected: true, legalEntitiesCount: 1 };
  }

  private async simulateGetLegalEntities(): Promise<StorecoveLegalEntity[]> {
    await this.simulateLatency(50, 150);
    return [
      {
        id: 1,
        name: 'AlphaFlow Demo ApS',
        tax_regime: 'DK_VAT',
        primary_email: 'demo@alphaflow.dk',
        peppol_identifiers: [
          { scheme: '0184', identifier: '12345678' },
        ],
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
  }

  private async simulateSubmitInvoice(
    _xmlContent: string,
    options: { receiverScheme?: string; receiverIdentifier?: string; routeToNemhandel?: boolean },
  ): Promise<StorecoveSubmissionResult> {
    await this.simulateLatency(100, 400);

    const submissionId = `sc-sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const storecoveId = Math.floor(Math.random() * 1000000);
    const messageId = `MSG-SC-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const as4MessageId = options.routeToNemhandel
      ? `AS4-${Date.now()}-${Math.random().toString(36).slice(2, 12).toUpperCase()}`
      : undefined;

    logger.info('[STORECOVE_SIM] Simulated invoice submission', {
      submissionId,
      storecoveId,
      receiverScheme: options.receiverScheme,
      receiverIdentifier: options.receiverIdentifier,
      routeToNemhandel: options.routeToNemhandel,
      as4MessageId,
    });

    return {
      success: true,
      submissionId,
      storecoveId: String(storecoveId),
      messageId,
      status: 'processing',
      nemhandelRouted: options.routeToNemhandel ?? false,
      as4MessageId,
    };
  }

  private async simulateGetSubmissionStatus(
    submissionId: string,
  ): Promise<StorecoveDeliveryStatus> {
    await this.simulateLatency(20, 100);

    // Simulate the NemHandel eDelivery two-phase validation:
    // Phase 1: Schema validation at receiving AP (always passes in sim)
    // Phase 2: Schematron validation (80% pass rate)
    const isDelivered = Math.random() > 0.2;
    const schematronPassed = isDelivered;

    return {
      status: isDelivered ? 'delivered' : 'processing',
      storecoveId: submissionId,
      deliveredAt: isDelivered ? new Date().toISOString() : undefined,
      acceptedAt: isDelivered ? new Date().toISOString() : undefined,
      receiverScheme: '0184',
      receiverIdentifier: '87654321',
      schemaValidated: true,
      schematronValidated: schematronPassed,
      mlrResponse: schematronPassed ? undefined : 'MLR-REJECTED-SCHEMATRON',
    };
  }

  private async simulateLookupParticipant(
    scheme: string,
    identifier: string,
  ): Promise<StorecoveParticipantResult> {
    await this.simulateLatency(50, 200);

    // In simulation, assume DK CVR numbers with 8 digits exist
    const isDanishCvr = scheme === '0184' && /^\d{8}$/.test(identifier);

    return {
      exists: isDanishCvr || Math.random() > 0.3,
      scheme,
      identifier,
      name: isDanishCvr ? `Virksomhed ${identifier} ApS` : undefined,
      countryCode: scheme === '0184' ? 'DK' : undefined,
      accessPoints: isDanishCvr
        ? [{ id: 'storecove-ap', name: 'Storecove Access Point' }]
        : undefined,
    };
  }

  private simulateLatency(minMs: number, maxMs: number): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise(resolve => setTimeout(resolve, delay));
  }
}

// ─── SINGLETON ────────────────────────────────────────────────────

/**
 * Shared Storecove client instance.
 * Simulation mode is auto-detected: if STORECOVE_API_KEY is set,
 * production mode is used; otherwise simulation mode is active.
 */
export const storecoveClient = new StorecoveClient({
  simulationMode: !process.env.STORECOVE_API_KEY,
});
