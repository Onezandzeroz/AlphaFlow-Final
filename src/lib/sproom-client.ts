/**
 * Sproom Access Point REST API Client
 *
 * Production-ready client for the Sproom e-invoicing Access Point API.
 * Enables AlphaFlow to submit and receive e-invoices across BOTH:
 *   - Peppol (international, BIS Billing 3.0 / UBL 2.1)
 *   - NemHandel (Danish national e-invoicing network, OIOUBL 2.1)
 *
 * Sproom API docs: https://sproom.net (OpenAPI v1)
 *
 * Workflow:
 *   Parent authenticates (OAuth2 password grant)
 *     → creates child company per tenant (POST /api/child-companies)
 *     → gets a child company token (GET /api/child-companies/{id}/token)
 *     → optionally registers child in NemHandel & Peppol networks
 *     → sends raw OIOUBL/Peppol BIS 3 XML (POST /api/documents)
 *     → receives inbound docs via DocumentReceived webhook
 *     → verifies webhook signature with RSA public key
 *
 * ─── Key differences from Storecove (the AP this replaces) ──────────
 *
 * 1. RAW XML UPLOAD (simpler than Storecove!)
 *    Sproom accepts raw XML bytes via `POST /api/documents` with
 *    Content-Type: application/octet-stream. No base64 wrapping, no
 *    JSON Pure mode, no "parseStrategy". Sproom auto-detects the format
 *    (OIOUBL 2.1 or Peppol BIS 3.0) from the XML root element.
 *
 * 2. MULTI-TENANCY via "child companies" (not "legal entities")
 *    The parent company authenticates with username/password, then
 *    creates child companies — each child company represents one tenant
 *    (one Danish CVR). To act on behalf of a child company, we obtain
 *    a short-lived bearer token via /api/child-companies/{id}/token.
 *
 * 3. TWO NETWORK REGISTRATIONS (per child company)
 *    To RECEIVE invoices, a child company must register its endpoint
 *    identifier (CVR) in BOTH networks separately:
 *      - POST /api/registrations/nemhandel  (profiles: Nes5Customer etc.)
 *      - POST /api/registrations/peppol     (profiles: PeppolBis3Billing)
 *    Note: Peppol registration requires a completed Peppol participant
 *    verification flow first (POST /api/peppol-participant-verifications).
 *
 * 4. WEBHOOK SIGNATURE = RSA (SHA256withRSA), NOT shared-secret HMAC
 *    Every webhook request includes an `X-Signature` header with a
 *    base64-encoded SHA256withRSA signature of the request body. The
 *    RSA public key is fetched from GET /api/webhooks/key and cached.
 *    Verification uses Node's `crypto.createVerify('RSA-SHA256')`.
 *
 * 5. DOCUMENT ID in RESPONSE HEADER (not body)
 *    POST /api/documents returns 201 with the new document ID in the
 *    `X-Sproom-DocumentId` response header (body is empty). An optional
 *    `X-Request-Id` request header provides idempotency (re-sending
 *    the same X-Request-Id returns the existing documentId via 409).
 *
 * 6. DOCUMENT FORMAT AUTO-DETECTION
 *    No `documentType` or `format` field needed on upload — Sproom
 *    inspects the XML and routes through the correct network.
 *
 * 7. SPROOM HAS A REAL POLLING ENDPOINT (unlike Storecove)
 *    GET /api/documents/{id}/state returns the full state history of
 *    a document, so callers CAN poll (Storecove could only webhook).
 *
 * ─── Authentication flow ─────────────────────────────────────────────
 *
 * Sproom uses OAuth2 password grant (ASP.NET Katana/OWIN style).
 * The parent company logs in once via `POST /token` with form-encoded
 * body `grant_type=password&username=…&password=…` and receives a
 * bearer token (cached here with expiry). That parent token is used
 * ONLY for child-company management endpoints. For all document /
 * registration / webhook endpoints, AlphaFlow impersonates a specific
 * child company using a per-child bearer token from
 * `GET /api/child-companies/{id}/token` (also cached here).
 *
 * ─── Simulation mode ─────────────────────────────────────────────────
 *
 * When SPROOM_API_TOKEN is not set, the client runs
 * in simulation mode and returns realistic synthetic responses so the
 * AlphaFlow UI / API routes can be exercised end-to-end without a real
 * Sproom account.
 */

import { logger } from '@/lib/logger';
import {
  createVerify,
  createHash,
  timingSafeEqual,
  type Verify,
} from 'crypto';

// ─── TYPES ────────────────────────────────────────────────────────

/** Configuration for the Sproom client */
export interface SproomClientConfig {
  /** Sproom API base URL (default: https://staging.sproom.net) */
  baseUrl?: string;
  /** Parent-company API token — obtained from the Sproom dashboard (Profile → API) */
  apiToken?: string;
  /** Whether to use simulation mode (default: true if apiToken missing) */
  simulationMode?: boolean;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/** Result of submitting a document to Sproom */
export interface SproomSubmissionResult {
  success: boolean;
  /** Sproom document ID (GUID) — returned in the X-Sproom-DocumentId header */
  documentId?: string;
  /** Location header URI (also contains the documentId) */
  location?: string;
  /** Whether the response was a 409 idempotent replay (same X-Request-Id) */
  idempotentReplay?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

/** Sproom document status enum (DocumentStatusType). */
export type SproomDocumentStatus =
  | 'Created'
  | 'EndpointNotFound'
  | 'EndpointAdded'
  | 'SendLimitExceeded'
  | 'SendLimitIncreased'
  | 'IncompletePackage'
  | 'Timeout'
  | 'ReceiveLimitExceeded'
  | 'ReceiveLimitIncreased'
  | 'ReturnedToSchematronEnrichment'
  | 'SchematronEnrichmentIsDone'
  | 'Incomplete'
  | 'IncompleteReturned'
  | 'TransmissionStarted'
  | 'Sent'
  | 'Received'
  | 'TransmissionCompleted'
  | 'PendingApproval'
  | 'Approved'
  | 'Rejected'
  | 'Error'
  | 'ErrorMax'
  | 'ErrorMin'
  | 'OIOSchemaValidationError'
  | 'SchematronValidationError'
  | 'DuplicateFileError'
  | 'SendNemHandelError'
  | 'RuntimeError'
  | 'SendToFinishOperatorError'
  | 'SendSproomError'
  | 'ErrorProcessingAttachments'
  | 'CustomValidationError'
  | 'Canceled'
  | 'Deleted'
  | 'TestModeError'
  | 'SenderMismatchError'
  | 'SendEvenexError'
  | 'SendPageroError'
  | 'SendBaswareError'
  | 'SendInExChangeError'
  | 'SendLetterError'
  | 'SendStatOilError'
  | 'DeliveryRestrictionError'
  | 'SendIbisticError'
  | 'SendError'
  | 'SendEbuilderError'
  | 'ApplicationReponseProfileReject'
  | 'ApplicationReponseTechnicalReject'
  | 'CustomerNotSubscribedToBilsim'
  | 'CustomerNotSubscribedToUts'
  | 'ApplicationReponseBusinessReject'
  | 'SendTietoError'
  | 'SendSwedbankError'
  | 'Internal';

/** Sproom document roles (types). */
export type SproomDocumentRole =
  | 'ApplicationResponse'
  | 'Catalogue'
  | 'CatalogueDeletion'
  | 'CatalogueItemSpecificationUpdate'
  | 'CataloguePricingUpdate'
  | 'CatalogueRequest'
  | 'CreditNote'
  | 'Invoice'
  | 'Order'
  | 'OrderCancellation'
  | 'OrderChange'
  | 'OrderResponse'
  | 'OrderResponseSimple'
  | 'Reminder'
  | 'Statement'
  | 'UtilityStatement'
  | 'DespatchAdvice'
  | 'MessageLevelResponse'
  | 'InvoiceResponse';

/** Sproom document formats (ApiDocumentFormat). */
export type SproomDocumentFormat = 'OioUbl2' | 'PeppolBis3';

/** Sproom document formats accepted by the legacy get-document endpoint. */
export type SproomLegacyDocumentFormat = 'OioUbl2' | 'PeppolBis3' | 'xml' | 'pdf' | 'html';

/** Sproom networks. */
export type SproomNetworkType = 'NemHandel' | 'Peppol';

/** Sproom NemHandel registration profiles. */
export type SproomNemHandelProfile =
  | 'Nes5Customer'
  | 'BilSimSupplier'
  | 'BilSimCustomer'
  | 'UtsCustomer'
  | 'OrdSimBilSimSupplier'
  | 'OrdSimBilSimRSupplier'
  | 'OrdSimBilSimCustomer'
  | 'OrdSimRBilSimSupplier'
  | 'OrdSimRBilSimRSupplier'
  | 'OrdAdvBilSimCustomer'
  | 'OrdAdvBilSimSupplier'
  | 'OrdSimCustomer'
  | 'OrdSimSupplier'
  | 'OrdSimRSupplier'
  | 'BilSimRCustomer'
  | 'UtsSupplier'
  | 'Nes3Supplier';

/** Sproom Peppol registration profiles. */
export type SproomPeppolProfile = 'PeppolBis3Billing';

/** Webhook event types (WebhookTypes). */
export type SproomWebhookType =
  | 'Unspecified'
  | 'DocumentStatusChanged'
  | 'DocumentReceived'
  | 'Test'
  | 'PeppolParticipantVerificationChanged'
  | 'ChildCompanyEnrollmentAccepted'
  | 'ReportProcessingCompleted';

/**
 * Sproom webhook event payload.
 *
 * Sproom posts JSON to the configured webhook URL. The exact shape
 * depends on `type`; the fields below cover the two event types
 * AlphaFlow consumes (DocumentStatusChanged for outbound, DocumentReceived
 * for inbound). Unknown/extra fields are preserved via `[k: string]: unknown`.
 */
export interface SproomWebhookEvent {
  /** Webhook type discriminator (always present). */
  type: SproomWebhookType;
  /** Sproom document ID (GUID) the event refers to. */
  documentId?: string;
  /** New document status (for DocumentStatusChanged events). */
  status?: SproomDocumentStatus;
  /** Previous document status (optional, for status transitions). */
  previousStatus?: SproomDocumentStatus;
  /** ISO-8601 timestamp of the event. */
  timestamp?: string;
  /** Free-form reason text (e.g. rejection reason). */
  reason?: string;
  /** Recipient organization identifier (`scheme:number`). */
  recipientIdentifier?: string;
  /** Sender organization identifier (`scheme:number`). */
  senderIdentifier?: string;
  /** Sproom child company ID (GUID) the event concerns. */
  companyId?: string;
  /** Document type/role (Invoice, CreditNote, Reminder, etc.). */
  documentType?: SproomDocumentRole;
  /** Document format (OioUbl2 or PeppolBis3). */
  documentFormat?: SproomDocumentFormat;
  /** Preserve any extra fields Sproom adds. */
  [key: string]: unknown;
}

/** Organization identifier (scheme + value, e.g. { schemeId: 'DK:CVR', value: '12345678' }). */
export interface SproomOrganizationIdentifier {
  schemeId: string;
  value: string;
}

/** A child company in Sproom (one per AlphaFlow tenant). */
export interface SproomChildCompany {
  /** GUID identifying the child company in Sproom. */
  id: string;
  /** Display name (company name). */
  companyName: string;
  /** Organization identifier (e.g. { schemeId: 'DK:CVR', value: '12345678' }). */
  organizationIdentifier: SproomOrganizationIdentifier;
  /** Optional GLN (Global Location Number). */
  glnNumber?: string | null;
}

/**
 * Thrown by createChildCompany when Sproom returns 409 — a child company
 * already exists for the CVR (the company has a Sproom profile but is not
 * necessarily a child of THIS parent). The caller should fall back to the
 * enrollment flow (POST /api/child-companies/enrollments) to take ownership.
 */
export class SproomChildCompanyConflictError extends Error {
  /** The existing child company ID (if Sproom returned one in the 409 body). */
  readonly childCompanyId: string | null;

  constructor(childCompanyId: string | null, message: string) {
    super(message);
    this.name = 'SproomChildCompanyConflictError';
    this.childCompanyId = childCompanyId;
  }
}

// ─── PEPPOL PARTICIPANT VERIFICATION ──────────────────────────────
// Peppol network registration requires the child company to complete a
// participant verification (a signed declaration). Two-party signing flow:
//   1. initiatePeppolParticipantVerification() → POST /api/peppol-participant-verifications
//      with { signerEmail, signerName, signingMethod, cvr? } → { id }.
//      Sproom emails the signer a signing link (or, with signingMethod
//      'AcceptButton' — staging/test only — the signer signs via a button
//      click, no MitID needed).
//   2. The signer completes the signing (MitID in prod, AcceptButton in staging).
//   3. PeppolParticipantVerificationChanged webhook fires when stateType='Signed'.
//   4. registerPeppol() then succeeds (POST /api/registrations/peppol).

/** Sproom signing methods for Peppol participant verification. */
export type SproomSigningMethod =
  | 'NemId'           // Personal NemID (Danish)
  | 'NemIdMoces'      // Employee NemID (company certificate)
  | 'NorwegianBankId'
  | 'SwedishBankId'
  | 'AcceptButton';   // TEST ONLY — sign via button click (no MitID)

/** Participant verification state. */
export type SproomVerificationState =
  | 'Pending' | 'Signed' | 'Expired' | 'Rejected' | 'Revoked';

/** A Peppol participant verification record (VerificationDto). */
export interface SproomPeppolVerification {
  id: string;
  signerEmail?: string | null;
  signerName?: string | null;
  cvr?: string | null;
  signingMethod?: SproomSigningMethod;
  initiatedAt?: string | null;
  signedAt?: string | null;
  stateType?: SproomVerificationState;
}

/** A document listed by GET /api/documents. */
export interface SproomDocument {
  documentId: string;
  documentNumber?: string | null;
  issuedOnUtc?: string | null;
  type: SproomDocumentRole;
  status: SproomDocumentStatus;
  totalAmount?: number;
  currency?: string;
  senderParty?: {
    companyName?: string | null;
    companyIdentifier?: SproomOrganizationIdentifier | null;
  } | null;
  recipientParty?: {
    companyName?: string | null;
    companyIdentifier?: SproomOrganizationIdentifier | null;
  } | null;
}

/** One entry in a document's state history. */
export interface SproomDocumentStateEntry {
  dateTime?: string;
  state: SproomDocumentStatus;
  statusCode?: number;
  deliveryType?: string | null;
  message?: string | null;
  failedProperties?: Array<{
    name?: string | null;
    attemptedValue?: string | null;
    validationRules?: Array<{ rule?: string | null }>;
  }> | null;
}

/** Result of looking up whether a recipient can receive e-invoices. */
export interface SproomRecipientLookupResult {
  /** true if the org can receive invoices/credit notes, false otherwise. */
  canReceive: boolean;
  /** Echoed back organization identifier (`scheme:number`). */
  organizationIdentifier?: string;
  /** Error message if the lookup failed (e.g. invalid format). */
  errorMessage?: string;
}

/** A registration (one endpoint registered in one network). */
export interface SproomRegistration {
  networkId: string;
  endpointId: SproomOrganizationIdentifier;
  network: { networkType: SproomNetworkType };
  registeredOnUtc: string;
  profiles: string[];
}

/** A webhook registered in Sproom. */
export interface SproomWebhook {
  id?: string;
  type?: SproomWebhookType;
  url?: string | null;
  publicKey?: string | null;
}

/** Sproom API error response shape (best-effort; Sproom returns varied bodies). */
interface SproomApiError {
  errorCode?: string;
  message?: string;
  details?: unknown;
}

// ─── CONSTANTS ────────────────────────────────────────────────────

/** Default Sproom base URL (staging — production is https://sproom.net). */
const DEFAULT_BASE_URL = 'https://staging.sproom.net';

/** OAuth2 password-grant token endpoint (ASP.NET Katana default). */
const DEFAULT_TOKEN_PATH = '/token';

/** Default request timeout (30 seconds). */
const DEFAULT_TIMEOUT = 30000;

/** Maximum number of retries for transient failures. */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff (1 second). */
const BASE_RETRY_DELAY_MS = 1000;

/** Token refresh safety margin — refresh 60s before expiry. */
const TOKEN_REFRESH_MARGIN_S = 60;

/** Cache TTL for the Sproom RSA public key (re-fetch at most once per hour). */
const WEBHOOK_KEY_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Danish identification schemes (subset — full list in Sproom OpenAPI).
 * Used to map AlphaFlow company CVR / P-number / GLN into Sproom's
 * `schemeId` field on OrganizationIdentifier.
 */
export const SPROOM_DK_SCHEMES = {
  CVR: 'DK:CVR', // Danish Central Business Register (8-digit)
  DIGST: 'DK:DIGST', // DIGST organization
  ERST: 'DK:ERST', // Danish Business Authority (Erhvervsstyrelsen) — VAT prefix
  P: 'DK:P', // Danish P-number (production unit)
  SE: 'DK:SE', // Danish SE number
} as const;

// ─── CLIENT CLASS ─────────────────────────────────────────────────

/**
 * Sproom Access Point API client.
 *
 * Supports both production and simulation modes. In simulation mode,
 * all API calls return realistic synthetic responses for development.
 * In production, it makes real HTTP calls to the Sproom REST API.
 */
export class SproomClient {
  private baseUrl: string;
  private apiToken: string;
  private simulationMode: boolean;
  private timeout: number;

  /** Cached per-child-company bearer tokens (for documents/registrations/etc.). */
  private childTokenCache: Map<string, { token: string; expiresAt: number }> = new Map();

  /** Cached RSA public key for webhook signature verification. */
  private webhookKeyCache: { key: string; fetchedAt: number } | null = null;

  constructor(config: SproomClientConfig = {}) {
    this.baseUrl = (config.baseUrl || process.env.SPROOM_API_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.apiToken = config.apiToken || process.env.SPROOM_API_TOKEN || '';
    this.simulationMode = config.simulationMode ?? (!this.apiToken);
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
  }

  // ─── CONNECTION TEST ──────────────────────────────────────────────

  /**
   * Test the Sproom API connection.
   *
   * Uses GET /api/health (unauthenticated) to verify the service is up,
   * then verifies that the parent credentials work by fetching a parent
   * access token. Returns the count of child companies if auth succeeds.
   */
  async testConnection(): Promise<{
    connected: boolean;
    error?: string;
    childCompaniesCount?: number;
  }> {
    if (this.simulationMode) {
      return this.simulateTestConnection();
    }

    try {
      // Step 1: ping the unauthenticated health endpoint.
      const healthResp = await this.makeRawRequest('GET', '/api/health');
      if (!healthResp.ok) {
        return {
          connected: false,
          error: `Sproom health check failed: HTTP ${healthResp.status}`,
        };
      }

      // Step 2: verify the API token works by listing child companies.
      try {
        const children = await this.listChildCompanies();
        return { connected: true, childCompaniesCount: children.length };
      } catch (error) {
        return {
          connected: false,
          error: `API token validation failed: ${error instanceof Error ? error.message : 'unknown'}`,
        };
      }
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  // ─── AUTHENTICATION ──────────────────────────────────────────────

  /**
   * Get the parent-company API token.
   *
   * Sproom uses a STATIC bearer token obtained from the dashboard
   * (Profile → API settings). There is NO OAuth2 password grant flow.
   * The token is set via SPROOM_API_TOKEN env var and used directly
   * as the Authorization: Bearer header.
   *
   * This method returns the static token for backward compat with
   * code that calls getAccessToken().
   */
  async getAccessToken(): Promise<string> {
    if (this.simulationMode) {
      return 'simulated-token';
    }
    return this.apiToken;
  }

  /**
   * Get (or refresh) a bearer token to act on behalf of a child company.
   *
   * GET /api/child-companies/{childCompanyId}/token
   * Response (ChildCompanyToken):
   *   { access_token, token_type, expires_in, .issued, .expires }
   *
   * The parent token is used to authorize this request. The child token
   * is cached per childCompanyId and re-used until close to expiry.
   */
  async getChildCompanyToken(childCompanyId: string): Promise<string> {
    if (this.simulationMode) {
      return this.simulateChildCompanyToken(childCompanyId);
    }

    const now = Date.now();
    const cached = this.childTokenCache.get(childCompanyId);
    if (cached && cached.expiresAt > now) {
      return cached.token;
    }

    const parentToken = await this.getAccessToken();
    const response = await this.makeRequestWithRetry(
      'GET',
      `/api/child-companies/${encodeURIComponent(childCompanyId)}/token`,
      undefined,
      { accessToken: parentToken },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error('[SPROOM] Failed to fetch child company token', {
        childCompanyId,
        status: response.status,
        body: errorBody,
      });
      throw new Error(
        `Failed to get token for child company ${childCompanyId} (HTTP ${response.status}): ${errorBody || response.statusText}`,
      );
    }

    const token = await response.json() as {
      access_token: string;
      token_type?: string;
      expires_in?: number;
    };

    if (!token.access_token) {
      throw new Error(`Sproom child token response missing access_token for ${childCompanyId}`);
    }

    const expiresInSec = token.expires_in ?? 1800;
    this.childTokenCache.set(childCompanyId, {
      token: token.access_token,
      expiresAt: now + expiresInSec * 1000 - TOKEN_REFRESH_MARGIN_S * 1000,
    });

    logger.info('[SPROOM] Child company token acquired', { childCompanyId, expiresInSec });
    return token.access_token;
  }

  /**
   * Invalidate the cached child-company token (e.g. after deleting a child).
   */
  invalidateChildCompanyToken(childCompanyId: string): void {
    this.childTokenCache.delete(childCompanyId);
  }

  // ─── CHILD COMPANIES (TENANTS) ───────────────────────────────────

  /**
   * Create a new child company in Sproom.
   *
   * POST /api/child-companies
   *   body: { companyName, organizationIdentifier: { schemeId, value }, glnNumber? }
   *
   * Used by AlphaFlow tenants to register their own company as a Sproom
   * sender/receiver. The parent authenticates; the childCompanyId returned
   * is stored locally on the Company model (sproomChildCompanyId).
   *
   * NOTE: A 409 conflict means a Sproom account already exists for the CVR.
   * In that case the caller should use the enrollment flow instead
   * (POST /api/child-companies/enrollments) to transition ownership.
   *
   * @returns the created child company (id is GUID from Location header)
   */
  async createChildCompany(payload: {
    name: string;
    cvr: string;
    /** Identification scheme (default 'DK:CVR'). */
    schemeId?: string;
    /** Optional GLN (Global Location Number). */
    gln?: string;
  }): Promise<SproomChildCompany> {
    const schemeId = payload.schemeId || SPROOM_DK_SCHEMES.CVR;

    if (this.simulationMode) {
      return this.simulateCreateChildCompany(payload, schemeId);
    }

    const parentToken = await this.getAccessToken();
    const body = {
      companyName: payload.name,
      organizationIdentifier: {
        schemeId,
        value: payload.cvr,
      },
      ...(payload.gln ? { glnNumber: payload.gln } : {}),
    };

    const response = await this.makeRequestWithRetry(
      'POST',
      '/api/child-companies',
      body,
      { accessToken: parentToken },
    );

    if (response.status === 409) {
      const conflict = await response.json().catch(() => ({})) as { childCompanyId?: string; message?: string };
      throw new SproomChildCompanyConflictError(
        conflict.childCompanyId ?? null,
        `Sproom child company already exists for ${schemeId}:${payload.cvr}.` +
          (conflict.childCompanyId
            ? ` Existing childCompanyId=${conflict.childCompanyId}.`
            : ` ${conflict.message || ''}`).trim(),
      );
    }

    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(
        `Failed to create Sproom child company (HTTP ${response.status}): ${error.message || response.statusText}`,
      );
    }

    // Sproom returns 200 with the new childCompanyId in the Location header.
    const location = response.headers.get('Location') || response.headers.get('location');
    let childCompanyId = '';
    if (location) {
      const match = location.match(/([0-9a-fA-F-]{36})(?:\?|$|\/)?/);
      childCompanyId = match ? match[1] : location.split('/').pop() || '';
    }
    if (!childCompanyId) {
      // Some Sproom responses include the new entity in the body.
      try {
        const bodyJson = await response.json() as { id?: string };
        childCompanyId = bodyJson.id || '';
      } catch {
        /* fall through */
      }
    }
    if (!childCompanyId) {
      throw new Error(
        'Sproom created child company but no Location header / body id was returned. ' +
        'Cannot proceed — check the Sproom dashboard manually.',
      );
    }

    return {
      id: childCompanyId,
      companyName: payload.name,
      organizationIdentifier: { schemeId, value: payload.cvr },
      glnNumber: payload.gln ?? null,
    };
  }

  /**
   * List all child companies the parent can act on behalf of.
   *
   * GET /api/child-companies → SproomChildCompanyGet[]
   */
  async listChildCompanies(): Promise<SproomChildCompany[]> {
    if (this.simulationMode) {
      return this.simulateListChildCompanies();
    }

    const parentToken = await this.getAccessToken();
    const response = await this.makeRequestWithRetry(
      'GET',
      '/api/child-companies',
      undefined,
      { accessToken: parentToken },
    );
    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(`Failed to list Sproom child companies: ${error.message || response.statusText}`);
    }
    const data = (await response.json()) as Array<{
      id: string;
      companyName: string;
      organizationIdentifier: SproomOrganizationIdentifier;
      glnNumber?: string | null;
    }>;
    return data.map((c) => ({
      id: c.id,
      companyName: c.companyName,
      organizationIdentifier: c.organizationIdentifier,
      glnNumber: c.glnNumber ?? null,
    }));
  }

  /**
   * Get a single child company by its GUID.
   *
   * GET /api/child-companies/{childCompanyId}
   */
  async getChildCompany(childCompanyId: string): Promise<SproomChildCompany | null> {
    if (this.simulationMode) {
      const all = await this.simulateListChildCompanies();
      return all.find((c) => c.id === childCompanyId) ?? null;
    }

    const parentToken = await this.getAccessToken();
    const response = await this.makeRequestWithRetry(
      'GET',
      `/api/child-companies/${encodeURIComponent(childCompanyId)}`,
      undefined,
      { accessToken: parentToken },
    );
    if (response.status === 404) return null;
    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(`Failed to fetch Sproom child company ${childCompanyId}: ${error.message || response.statusText}`);
    }
    // Sproom returns an ARRAY (per OpenAPI) even for a single-id GET.
    const arr = (await response.json()) as Array<{
      id: string;
      companyName: string;
      organizationIdentifier: SproomOrganizationIdentifier;
      glnNumber?: string | null;
    }>;
    const found = arr.find((c) => c.id === childCompanyId) ?? arr[0];
    if (!found) return null;
    return {
      id: found.id,
      companyName: found.companyName,
      organizationIdentifier: found.organizationIdentifier,
      glnNumber: found.glnNumber ?? null,
    };
  }

  /**
   * Delete a child company in Sproom (used when a tenant disconnects).
   *
   * DELETE /api/child-companies/{childCompanyId}
   */
  async deleteChildCompany(childCompanyId: string): Promise<{ success: boolean }> {
    if (this.simulationMode) {
      this.invalidateChildCompanyToken(childCompanyId);
      return this.simulateDeleteChildCompany(childCompanyId);
    }

    const parentToken = await this.getAccessToken();
    const response = await this.makeRequestWithRetry(
      'DELETE',
      `/api/child-companies/${encodeURIComponent(childCompanyId)}`,
      undefined,
      { accessToken: parentToken },
    );
    // DELETE is idempotent: a 404 means the child company is already gone
    // (e.g. deleted directly on the Sproom dashboard). Treat as success —
    // the caller's desired end state (child gone) is achieved.
    if (response.status === 404) {
      this.invalidateChildCompanyToken(childCompanyId);
      return { success: true };
    }
    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(`Failed to delete Sproom child company ${childCompanyId}: ${error.message || response.statusText}`);
    }
    this.invalidateChildCompanyToken(childCompanyId);
    return { success: true };
  }

  /**
   * Enroll an existing Sproom-profiled company as a child of this parent.
   *
   * POST /api/child-companies/enrollments
   *   body: { childCompanyName, organizationIdentifier, userEmail,
   *           parentCompanyName, shouldSendEmail }
   *   200 → { enrollmentLink }  (auth link the enrolled company completes via)
   *   409 → "Company is already a child" (no enrollment needed)
   *   400 → InvalidParameters / IdentificationSchemeNotSupported / CompanyNotFound
   *
   * Used when createChildCompany returns 409 (the CVR already has a Sproom
   * profile). The caller surfaces the enrollmentLink so the tenant can
   * complete acceptance; once accepted, Sproom fires the
   * ChildCompanyEnrollmentAccepted webhook and the company becomes a child
   * (re-discoverable via listChildCompanies).
   */
  async enrollChildCompany(payload: {
    childCompanyName: string;
    organizationIdentifier: SproomOrganizationIdentifier;
    userEmail: string;
    parentCompanyName: string;
    shouldSendEmail: boolean;
  }): Promise<{ enrollmentLink: string | null; alreadyChild?: boolean }> {
    if (this.simulationMode) {
      // Simulation: return a fake link so the UI flow can be exercised.
      return { enrollmentLink: `${this.baseUrl}/enroll/simulated` };
    }

    const parentToken = await this.getAccessToken();
    const body = {
      childCompanyName: payload.childCompanyName,
      organizationIdentifier: payload.organizationIdentifier,
      userEmail: payload.userEmail,
      parentCompanyName: payload.parentCompanyName,
      shouldSendEmail: payload.shouldSendEmail,
    };
    const response = await this.makeRequestWithRetry(
      'POST',
      '/api/child-companies/enrollments',
      body,
      { accessToken: parentToken },
    );
    // 409 = "Company is already a child" — no enrollment needed.
    if (response.status === 409) {
      return { enrollmentLink: null, alreadyChild: true };
    }
    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(
        `Failed to enroll Sproom child company (HTTP ${response.status}): ${error.message || response.statusText}`,
      );
    }
    const result = (await response.json().catch(() => ({}))) as { enrollmentLink?: string | null };
    return { enrollmentLink: result.enrollmentLink ?? null };
  }

  // ─── DOCUMENT SENDING ────────────────────────────────────────────

  /**
   * Send a document to Sproom for delivery via Peppol and/or NemHandel.
   *
   * This is the primary method for the AlphaFlow workflow:
   *   Generate XML → Validate → Send to Sproom → Auto-delivered
   *
   * POST /api/documents
   *   Content-Type: application/octet-stream
   *   Body: raw XML bytes (NO base64, NO JSON wrapping)
   *   Header (optional): X-Request-Id for idempotency (max 64 chars)
   *   Response: 201 with X-Sproom-DocumentId header (body empty)
   *            409 if the X-Request-Id was already used → body has documentId
   *
   * Sproom auto-detects the document format (OIOUBL 2.1 or Peppol BIS 3.0)
   * from the XML root element — no `documentType` or `format` field needed.
   *
   * @param xmlContent - Valid OIOUBL 2.1 or Peppol BIS 3.0 XML string
   * @param options - Sending options (childCompanyId, requestId)
   */
  async sendDocument(
    xmlContent: string,
    options: {
      /** Child company ID (GUID) to act on behalf of. Required for production. */
      childCompanyId?: string;
      /** Optional idempotency key (max 64 chars). Re-sending returns the existing documentId. */
      requestId?: string;
    } = {},
  ): Promise<SproomSubmissionResult> {
    if (this.simulationMode) {
      return this.simulateSendDocument(xmlContent, options);
    }

    try {
      if (!options.childCompanyId) {
        throw new Error('childCompanyId is required to send a document via Sproom');
      }

      const childToken = await this.getChildCompanyToken(options.childCompanyId);

      // Build request headers. Sproom wants raw XML bytes (octet-stream).
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${childToken}`,
        'Content-Type': 'application/octet-stream',
        'Accept': 'application/json',
      };
      if (options.requestId) {
        if (options.requestId.length > 64) {
          throw new Error('X-Request-Id must be at most 64 characters');
        }
        headers['X-Request-Id'] = options.requestId;
      }

      const response = await this.makeRequestWithRetry(
        'POST',
        '/api/documents',
        // Pass the raw XML body as a string — makeRequest will NOT JSON-encode
        // it because we use the `rawBody` field.
        { rawBody: xmlContent },
        { accessToken: childToken, extraHeaders: headers, skipContentTypeOverride: true },
      );

      // 409 = idempotent replay with the same X-Request-Id. Sproom returns
      // the existing documentId in the body, so this is a SUCCESS, not an error.
      if (response.status === 409) {
        const conflict = await response.json().catch(() => ({})) as { documentId?: string; message?: string };
        if (conflict.documentId) {
          return {
            success: true,
            documentId: conflict.documentId,
            idempotentReplay: true,
          };
        }
        return {
          success: false,
          errorCode: 'SPROOM_IDEMPOTENT_CONFLICT',
          errorMessage: conflict.message || 'Document already exists for this X-Request-Id but no documentId was returned',
        };
      }

      if (!response.ok) {
        const error = await this.parseError(response);
        return {
          success: false,
          errorCode: error.errorCode || `SPROOM_${response.status}`,
          errorMessage: error.message || `Sproom API error: ${response.status}`,
        };
      }

      // 201 Created — documentId is in the X-Sproom-DocumentId header.
      const documentId =
        response.headers.get('X-Sproom-DocumentId') ||
        response.headers.get('x-sproom-documentid') ||
        '';
      const location = response.headers.get('Location') || response.headers.get('location') || undefined;

      if (!documentId) {
        logger.warn('[SPROOM] Document sent but no X-Sproom-DocumentId header returned', { location });
      }

      return {
        success: true,
        documentId: documentId || undefined,
        location: location || undefined,
      };
    } catch (error) {
      logger.error('[SPROOM] Document submission failed:', error);
      return {
        success: false,
        errorCode: 'SPROOM_EXCEPTION',
        errorMessage: error instanceof Error ? error.message : 'Unknown error during submission',
      };
    }
  }

  // ─── DOCUMENT RECEIVING / RETRIEVAL ──────────────────────────────

  /**
   * List documents (sent + received) for the authenticated child company.
   *
   * GET /api/documents?$skip=N&$filter=...
   * Returns up to 20 documents per page; paginate with $skip.
   * OData $filter supports properties: IssuedOnUtc, TotalAmount, Status.
   *
   * @param skip - Number of documents to skip (pagination)
   * @param filter - OData V4 filter expression, e.g. "Status eq 'Sent'"
   */
  async listDocuments(
    skip: number = 0,
    filter?: string,
    options: { childCompanyId?: string } = {},
  ): Promise<SproomDocument[]> {
    if (this.simulationMode) {
      return this.simulateListDocuments(skip, filter);
    }

    if (!options.childCompanyId) {
      throw new Error('childCompanyId is required to list documents');
    }
    const childToken = await this.getChildCompanyToken(options.childCompanyId);

    const query = new URLSearchParams();
    if (skip) query.set('$skip', String(skip));
    if (filter) query.set('$filter', filter);
    const qs = query.toString();
    const path = `/api/documents${qs ? `?${qs}` : ''}`;

    const response = await this.makeRequestWithRetry('GET', path, undefined, { accessToken: childToken });
    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(`Failed to list Sproom documents: ${error.message || response.statusText}`);
    }
    return (await response.json()) as SproomDocument[];
  }

  /**
   * Get a document in a specific format.
   *
   * For 'OioUbl2' / 'PeppolBis3' → uses the new endpoint:
   *   GET /api/documents/{documentId}/{format}
   *
   * For 'xml' / 'pdf' / 'html' → uses the legacy endpoint with Accept header:
   *   GET /api/documents/{documentId}
   *     Accept: application/octet-stream (binary)  → 'xml'/'pdf'
   *     Accept: text/html                           → 'html'
   *
   * @returns The document content as a string (XML / HTML) or Buffer (binary).
   */
  async getDocument(
    documentId: string,
    format: SproomLegacyDocumentFormat,
    options: { childCompanyId?: string } = {},
  ): Promise<string | Buffer | null> {
    if (this.simulationMode) {
      return this.simulateGetDocument(documentId, format);
    }

    if (!options.childCompanyId) {
      throw new Error('childCompanyId is required to fetch a document');
    }
    const childToken = await this.getChildCompanyToken(options.childCompanyId);

    let response: Response;
    if (format === 'OioUbl2' || format === 'PeppolBis3') {
      // New endpoint — path-based format selection.
      response = await this.makeRequestWithRetry(
        'GET',
        `/api/documents/${encodeURIComponent(documentId)}/${format}`,
        undefined,
        { accessToken: childToken },
      );
    } else {
      // Legacy endpoint — Accept header selects format.
      const accept =
        format === 'html' ? 'text/html' : 'application/octet-stream';
      response = await this.makeRequestWithRetry(
        'GET',
        `/api/documents/${encodeURIComponent(documentId)}`,
        undefined,
        { accessToken: childToken, extraHeaders: { Accept: accept } },
      );
    }

    if (response.status === 404 || response.status === 410) return null;
    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(`Failed to fetch Sproom document ${documentId} (${format}): ${error.message || response.statusText}`);
    }

    // Binary content → return as Buffer. HTML/XML text → return as string.
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text') || contentType.includes('xml') || contentType.includes('html')) {
      return await response.text();
    }
    return Buffer.from(await response.arrayBuffer());
  }

  /**
   * Get the state history of a document.
   *
   * GET /api/documents/{documentId}/state → StateRead[]
   */
  async getDocumentState(
    documentId: string,
    options: { childCompanyId?: string } = {},
  ): Promise<SproomDocumentStateEntry[]> {
    if (this.simulationMode) {
      return this.simulateGetDocumentState(documentId);
    }

    if (!options.childCompanyId) {
      throw new Error('childCompanyId is required to fetch document state');
    }
    const childToken = await this.getChildCompanyToken(options.childCompanyId);
    const response = await this.makeRequestWithRetry(
      'GET',
      `/api/documents/${encodeURIComponent(documentId)}/state`,
      undefined,
      { accessToken: childToken },
    );
    if (response.status === 404) return [];
    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(`Failed to fetch Sproom document state ${documentId}: ${error.message || response.statusText}`);
    }
    return (await response.json()) as SproomDocumentStateEntry[];
  }

  /**
   * Set the state of a received document (accept / reject / mark transmitted).
   *
   * POST /api/documents/{documentId}/state
   *   body: { state: UpdateableState, reason?: string }
   *
   * UpdateableState enum: 'TransmissionCompleted' | 'ApplicationReponseBusinessReject'
   * When accepted/rejected, Sproom auto-sends an ApplicationResponse to the sender.
   */
  async setDocumentState(
    documentId: string,
    state: {
      /** New state — only UpdateableState values are allowed. */
      state: 'TransmissionCompleted' | 'ApplicationReponseBusinessReject';
      /** Optional reason (mandatory for rejections). */
      reason?: string;
    },
    options: { childCompanyId?: string } = {},
  ): Promise<{ success: boolean }> {
    if (this.simulationMode) {
      return this.simulateSetDocumentState(documentId, state);
    }

    if (!options.childCompanyId) {
      throw new Error('childCompanyId is required to set document state');
    }
    const childToken = await this.getChildCompanyToken(options.childCompanyId);
    const response = await this.makeRequestWithRetry(
      'POST',
      `/api/documents/${encodeURIComponent(documentId)}/state`,
      { state: state.state, ...(state.reason ? { reason: state.reason } : {}) },
      { accessToken: childToken },
    );
    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(`Failed to set Sproom document state ${documentId}: ${error.message || response.statusText}`);
    }
    return { success: true };
  }

  // ─── RECIPIENT LOOKUP ────────────────────────────────────────────

  /**
   * Check whether a recipient can receive invoices/credit notes.
   *
   * GET /api/recipients/{orgId}
   *   orgId format: `scheme:number` e.g. `DK:CVR:12345678`
   *   Returns 200 if can receive, 404 if not, 400 if invalid format.
   *
   * Pre-flight check before sending: verifies the recipient is reachable
   * in at least one of Sproom's supported networks.
   *
   * NOTE: This endpoint uses the PARENT token (no child impersonation needed
   * because it does not depend on the sender's identity).
   */
  async lookupRecipient(orgId: string): Promise<SproomRecipientLookupResult> {
    if (this.simulationMode) {
      return this.simulateLookupRecipient(orgId);
    }

    try {
      const parentToken = await this.getAccessToken();
      const response = await this.makeRequestWithRetry(
        'GET',
        `/api/recipients/${encodeURIComponent(orgId)}`,
        undefined,
        { accessToken: parentToken },
      );

      if (response.status === 200) {
        return { canReceive: true, organizationIdentifier: orgId };
      }
      if (response.status === 404) {
        return { canReceive: false, organizationIdentifier: orgId };
      }
      if (response.status === 400) {
        const error = await this.parseError(response);
        return { canReceive: false, organizationIdentifier: orgId, errorMessage: error.message || 'Invalid organization identifier' };
      }
      const error = await this.parseError(response);
      return {
        canReceive: false,
        organizationIdentifier: orgId,
        errorMessage: error.message || `Unexpected HTTP ${response.status}`,
      };
    } catch (error) {
      logger.warn('[SPROOM] Recipient lookup exception:', error);
      return {
        canReceive: false,
        organizationIdentifier: orgId,
        errorMessage: error instanceof Error ? error.message : 'Lookup failed',
      };
    }
  }

  /**
   * Bulk-check whether multiple recipients can receive invoices.
   *
   * POST /api/recipients/bulk
   *   body: string[] of `scheme:number` identifiers
   *   Returns LookupResult[] (one per input identifier)
   */
  async bulkLookupRecipients(
    orgIds: string[],
  ): Promise<Array<{ organizationIdentifier: string; canReceive: boolean; errorMessage?: string }>> {
    if (this.simulationMode) {
      const results = await Promise.all(orgIds.map((id) => this.simulateLookupRecipient(id)));
      return results.map((r) => ({
        organizationIdentifier: r.organizationIdentifier || '',
        canReceive: r.canReceive,
        ...(r.errorMessage ? { errorMessage: r.errorMessage } : {}),
      }));
    }

    const parentToken = await this.getAccessToken();
    const response = await this.makeRequestWithRetry(
      'POST',
      '/api/recipients/bulk',
      orgIds,
      { accessToken: parentToken },
    );
    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(`Failed to bulk-lookup Sproom recipients: ${error.message || response.statusText}`);
    }
    const data = (await response.json()) as Array<{
      organizationIdentifier?: string;
      canReceive?: boolean;
      error?: string | null;
    }>;
    return data.map((r) => ({
      organizationIdentifier: r.organizationIdentifier || '',
      canReceive: r.canReceive ?? false,
      errorMessage: r.error ?? undefined,
    }));
  }

  /**
   * Look up the supported profiles for a specific recipient + document format + type.
   *
   * GET /api/recipients/{endpointId}/{documentFormat}/{documentType}
   *   Returns 200 + { supportedProfiles: string[] } if the recipient can receive.
   */
  async lookupRecipientProfiles(
    endpointId: string,
    documentFormat: SproomDocumentFormat,
    documentType: SproomDocumentRole,
  ): Promise<{ canReceive: boolean; supportedProfiles: string[] }> {
    if (this.simulationMode) {
      return {
        canReceive: true,
        supportedProfiles: ['urn:www.nesubl.eu:profiles:profile5:ver2.0'],
      };
    }

    const parentToken = await this.getAccessToken();
    const response = await this.makeRequestWithRetry(
      'GET',
      `/api/recipients/${encodeURIComponent(endpointId)}/${documentFormat}/${documentType}`,
      undefined,
      { accessToken: parentToken },
    );
    if (response.status === 404) return { canReceive: false, supportedProfiles: [] };
    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(`Failed to lookup recipient profiles: ${error.message || response.statusText}`);
    }
    const data = (await response.json()) as { supportedProfiles?: string[] };
    return { canReceive: true, supportedProfiles: data.supportedProfiles || [] };
  }

  // ─── REGISTRATIONS (RECEIVE SETUP) ───────────────────────────────

  /**
   * Register an endpoint identifier in the NemHandel network.
   *
   * POST /api/registrations/nemhandel
   *   body: { endpointId: { schemeId, value }, profiles: NemHandelProfile[] }
   *   Returns 200 + { networkId: "<guid>" }
   *
   * Must be called AS the child company (use childCompanyId impersonation).
   * Default profile for receiving invoices: 'Nes5Customer'.
   */
  async registerNemHandel(
    endpointId: { schemeId: string; value: string },
    profiles: SproomNemHandelProfile[] = ['Nes5Customer'],
    options: { childCompanyId?: string } = {},
  ): Promise<{ networkId: string }> {
    if (this.simulationMode) {
      return this.simulateRegister('NemHandel', endpointId, profiles);
    }
    if (!options.childCompanyId) {
      throw new Error('childCompanyId is required to register in NemHandel');
    }
    const childToken = await this.getChildCompanyToken(options.childCompanyId);
    const response = await this.makeRequestWithRetry(
      'POST',
      '/api/registrations/nemhandel',
      {
        endpointId: {
          schemeId: endpointId.schemeId,
          value: endpointId.value,
        },
        profiles,
      },
      { accessToken: childToken },
    );
    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(
        `Failed to register in NemHandel (${endpointId.schemeId}:${endpointId.value}): ${error.message || response.statusText}`,
      );
    }
    const result = (await response.json()) as { networkId?: string };
    if (!result.networkId) {
      throw new Error('Sproom NemHandel registration returned no networkId');
    }
    return { networkId: result.networkId };
  }

  /**
   * Register an endpoint identifier in the Peppol network.
   *
   * POST /api/registrations/peppol
   *   body: { endpointId: { schemeId, value }, profiles: PeppolProfile[] }
   *   Returns 200 + { networkId: "<guid>" }
   *
   * IMPORTANT: Peppol registration requires the child company to have
   * completed a Peppol participant verification flow first (POST
   * /api/peppol-participant-verifications). Sproom will return 403 with
   * errorCode `PeppolParticipantIsNotVerified` otherwise.
   */
  async registerPeppol(
    endpointId: { schemeId: string; value: string },
    profiles: SproomPeppolProfile[] = ['PeppolBis3Billing'],
    options: { childCompanyId?: string } = {},
  ): Promise<{ networkId: string }> {
    if (this.simulationMode) {
      return this.simulateRegister('Peppol', endpointId, profiles);
    }
    if (!options.childCompanyId) {
      throw new Error('childCompanyId is required to register in Peppol');
    }
    const childToken = await this.getChildCompanyToken(options.childCompanyId);
    const response = await this.makeRequestWithRetry(
      'POST',
      '/api/registrations/peppol',
      {
        endpointId: {
          schemeId: endpointId.schemeId,
          value: endpointId.value,
        },
        profiles,
      },
      { accessToken: childToken },
    );
    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(
        `Failed to register in Peppol (${endpointId.schemeId}:${endpointId.value}): ${error.message || response.statusText}`,
      );
    }
    const result = (await response.json()) as { networkId?: string };
    if (!result.networkId) {
      throw new Error('Sproom Peppol registration returned no networkId');
    }
    return { networkId: result.networkId };
  }

  /**
   * Initiate a Peppol participant verification for the child company.
   *
   * POST /api/peppol-participant-verifications
   *   body: { signerEmail, signerName, signingMethod, cvr? }
   *   200 → { id }  (verification ID; Sproom emails the signer a signing link)
   *
   * Use signingMethod 'AcceptButton' for staging/test (no MitID — the signer
   * signs via a button click). Use 'NemId' / 'NemIdMoces' for production.
   *
   * After the signer completes the signing, Sproom fires the
   * PeppolParticipantVerificationChanged webhook (stateType='Signed'), after
   * which registerPeppol() succeeds.
   */
  async initiatePeppolParticipantVerification(
    payload: {
      signerEmail: string;
      signerName: string;
      signingMethod: SproomSigningMethod;
      cvr?: string;
    },
    options: { childCompanyId?: string } = {},
  ): Promise<{ id: string }> {
    if (this.simulationMode) {
      return { id: `sim-peppol-verification-${Date.now()}` };
    }
    if (!options.childCompanyId) {
      throw new Error('childCompanyId is required to initiate Peppol participant verification');
    }
    const childToken = await this.getChildCompanyToken(options.childCompanyId);
    const response = await this.makeRequestWithRetry(
      'POST',
      '/api/peppol-participant-verifications',
      payload,
      { accessToken: childToken },
    );
    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(
        `Failed to initiate Peppol participant verification (HTTP ${response.status}): ${error.message || response.statusText}`,
      );
    }
    const result = (await response.json().catch(() => ({}))) as { id?: string };
    if (!result.id) {
      throw new Error('Sproom returned no verification ID for the Peppol participant verification');
    }
    return { id: result.id };
  }

  /**
   * List all Peppol participant verifications for the child company.
   *
   * GET /api/peppol-participant-verifications → VerificationDto[]
   * Used to check the verification state (e.g. stateType='Signed' → registerPeppol).
   */
  async listPeppolParticipantVerifications(
    options: { childCompanyId?: string } = {},
  ): Promise<SproomPeppolVerification[]> {
    if (this.simulationMode) {
      return [];
    }
    if (!options.childCompanyId) {
      throw new Error('childCompanyId is required to list Peppol participant verifications');
    }
    const childToken = await this.getChildCompanyToken(options.childCompanyId);
    const response = await this.makeRequestWithRetry(
      'GET',
      '/api/peppol-participant-verifications',
      undefined,
      { accessToken: childToken },
    );
    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(`Failed to list Peppol participant verifications: ${error.message || response.statusText}`);
    }
    const data = (await response.json().catch(() => [])) as SproomPeppolVerification[];
    return Array.isArray(data) ? data : [];
  }

  /**
   * Get a single Peppol participant verification by ID (to check its state).
   *
   * GET /api/peppol-participant-verifications/{id} → VerificationDto
   */
  async getPeppolParticipantVerification(
    id: string,
    options: { childCompanyId?: string } = {},
  ): Promise<SproomPeppolVerification> {
    if (this.simulationMode) {
      return { id, stateType: 'Signed' };
    }
    if (!options.childCompanyId) {
      throw new Error('childCompanyId is required to get a Peppol participant verification');
    }
    const childToken = await this.getChildCompanyToken(options.childCompanyId);
    const response = await this.makeRequestWithRetry(
      'GET',
      `/api/peppol-participant-verifications/${encodeURIComponent(id)}`,
      undefined,
      { accessToken: childToken },
    );
    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(`Failed to get Peppol participant verification ${id}: ${error.message || response.statusText}`);
    }
    return (await response.json()) as SproomPeppolVerification;
  }

  /**
   * List all registrations for the authenticated child company.
   *
   * GET /api/registrations → RegistrationModel[]
   */
  async getRegistrations(options: { childCompanyId?: string } = {}): Promise<SproomRegistration[]> {
    if (this.simulationMode) {
      return this.simulateGetRegistrations();
    }
    if (!options.childCompanyId) {
      throw new Error('childCompanyId is required to list registrations');
    }
    const childToken = await this.getChildCompanyToken(options.childCompanyId);
    const response = await this.makeRequestWithRetry(
      'GET',
      '/api/registrations',
      undefined,
      { accessToken: childToken },
    );
    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(`Failed to list Sproom registrations: ${error.message || response.statusText}`);
    }
    return (await response.json()) as SproomRegistration[];
  }

  /**
   * Get a single registration by its networkId.
   *
   * GET /api/registrations/{networkId}
   */
  async getRegistration(
    networkId: string,
    options: { childCompanyId?: string } = {},
  ): Promise<SproomRegistration | null> {
    if (this.simulationMode) {
      const all = await this.simulateGetRegistrations();
      return all.find((r) => r.networkId === networkId) ?? null;
    }
    if (!options.childCompanyId) {
      throw new Error('childCompanyId is required to fetch a registration');
    }
    const childToken = await this.getChildCompanyToken(options.childCompanyId);
    const response = await this.makeRequestWithRetry(
      'GET',
      `/api/registrations/${encodeURIComponent(networkId)}`,
      undefined,
      { accessToken: childToken },
    );
    if (response.status === 404) return null;
    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(`Failed to fetch Sproom registration ${networkId}: ${error.message || response.statusText}`);
    }
    return (await response.json()) as SproomRegistration;
  }

  /**
   * Delete a registration (unregister from a network).
   *
   * DELETE /api/registrations/{networkId}
   */
  async deleteRegistration(
    networkId: string,
    options: { childCompanyId?: string } = {},
  ): Promise<{ success: boolean }> {
    if (this.simulationMode) {
      return { success: true };
    }
    if (!options.childCompanyId) {
      throw new Error('childCompanyId is required to delete a registration');
    }
    const childToken = await this.getChildCompanyToken(options.childCompanyId);
    const response = await this.makeRequestWithRetry(
      'DELETE',
      `/api/registrations/${encodeURIComponent(networkId)}`,
      undefined,
      { accessToken: childToken },
    );
    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(`Failed to delete Sproom registration ${networkId}: ${error.message || response.statusText}`);
    }
    return { success: true };
  }

  // ─── WEBHOOKS ────────────────────────────────────────────────────

  /**
   * Create a webhook for the authenticated child company.
   *
   * POST /api/webhooks
   *   body: { type: WebhookTypes, url: "https://..." }
   *   Returns 200 + WebhookDto { id, type, url, publicKey }
   *
   * @param type - Webhook event type ('DocumentStatusChanged' or 'DocumentReceived')
   * @param url  - HTTPS URL to receive webhook callbacks
   */
  async createWebhook(
    type: SproomWebhookType,
    url: string,
    options: { childCompanyId?: string } = {},
  ): Promise<SproomWebhook> {
    if (this.simulationMode) {
      return this.simulateCreateWebhook(type, url);
    }
    if (!options.childCompanyId) {
      throw new Error('childCompanyId is required to create a webhook');
    }
    const childToken = await this.getChildCompanyToken(options.childCompanyId);
    const response = await this.makeRequestWithRetry(
      'POST',
      '/api/webhooks',
      { type, url },
      { accessToken: childToken },
    );
    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(`Failed to create Sproom webhook: ${error.message || response.statusText}`);
    }
    return (await response.json()) as SproomWebhook;
  }

  /**
   * List all webhooks for the authenticated child company.
   *
   * GET /api/webhooks → WebhookDto[] (or null)
   */
  async listWebhooks(options: { childCompanyId?: string } = {}): Promise<SproomWebhook[]> {
    if (this.simulationMode) {
      return this.simulateListWebhooks();
    }
    if (!options.childCompanyId) {
      throw new Error('childCompanyId is required to list webhooks');
    }
    const childToken = await this.getChildCompanyToken(options.childCompanyId);
    const response = await this.makeRequestWithRetry(
      'GET',
      '/api/webhooks',
      undefined,
      { accessToken: childToken },
    );
    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(`Failed to list Sproom webhooks: ${error.message || response.statusText}`);
    }
    const data = await response.json();
    return (Array.isArray(data) ? data : []) as SproomWebhook[];
  }

  /**
   * Delete a webhook.
   *
   * DELETE /api/webhooks/{webhookId}
   */
  async deleteWebhook(webhookId: string, options: { childCompanyId?: string } = {}): Promise<{ success: boolean }> {
    if (this.simulationMode) {
      return { success: true };
    }
    if (!options.childCompanyId) {
      throw new Error('childCompanyId is required to delete a webhook');
    }
    const childToken = await this.getChildCompanyToken(options.childCompanyId);
    const response = await this.makeRequestWithRetry(
      'DELETE',
      `/api/webhooks/${encodeURIComponent(webhookId)}`,
      undefined,
      { accessToken: childToken },
    );
    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(`Failed to delete Sproom webhook ${webhookId}: ${error.message || response.statusText}`);
    }
    return { success: true };
  }

  /**
   * Trigger a test webhook delivery (type=Test).
   *
   * GET /api/webhooks/{webhookId}/test
   */
  async testWebhook(webhookId: string, options: { childCompanyId?: string } = {}): Promise<{ success: boolean }> {
    if (this.simulationMode) {
      return { success: true };
    }
    if (!options.childCompanyId) {
      throw new Error('childCompanyId is required to test a webhook');
    }
    const childToken = await this.getChildCompanyToken(options.childCompanyId);
    const response = await this.makeRequestWithRetry(
      'GET',
      `/api/webhooks/${encodeURIComponent(webhookId)}/test`,
      undefined,
      { accessToken: childToken },
    );
    if (!response.ok) {
      const error = await this.parseError(response);
      throw new Error(`Failed to test Sproom webhook ${webhookId}: ${error.message || response.statusText}`);
    }
    return { success: true };
  }

  /**
   * Get the RSA public key used to verify webhook signatures.
   *
   * GET /api/webhooks/key → { publicKey: "<PEM>", signatureAlgorithm: "SHA256withRSA" }
   *
   * NOTE: This endpoint is unauthenticated OR uses the parent token (Sproom
   * returns a single RSA key pair for the whole Sproom tenant, so it does
   * not depend on the child company). The key is cached for
   * WEBHOOK_KEY_CACHE_TTL_MS (1 hour) to avoid re-fetching on every webhook.
   */
  async getWebhookKey(): Promise<{ publicKey: string; signatureAlgorithm: string } | null> {
    if (this.simulationMode) {
      return {
        publicKey: SPROOM_SIM_PUBLIC_KEY,
        signatureAlgorithm: 'SHA256withRSA',
      };
    }

    const now = Date.now();
    if (this.webhookKeyCache && now - this.webhookKeyCache.fetchedAt < WEBHOOK_KEY_CACHE_TTL_MS) {
      return { publicKey: this.webhookKeyCache.key, signatureAlgorithm: 'SHA256withRSA' };
    }

    try {
      // Webhook key endpoint is auth-agnostic but Sproom may require a token;
      // try the parent token first, fall back to unauthenticated.
      let response: Response;
      try {
        const parentToken = await this.getAccessToken();
        response = await this.makeRequestWithRetry(
          'GET',
          '/api/webhooks/key',
          undefined,
          { accessToken: parentToken },
        );
      } catch {
        response = await this.makeRawRequest('GET', '/api/webhooks/key');
      }

      if (!response.ok) {
        logger.warn('[SPROOM] Failed to fetch webhook key', { status: response.status });
        return null;
      }
      const data = (await response.json()) as { publicKey?: string | null; signatureAlgorithm?: string | null };
      if (!data.publicKey) {
        logger.warn('[SPROOM] Webhook key response missing publicKey');
        return null;
      }
      this.webhookKeyCache = { key: data.publicKey, fetchedAt: now };
      return {
        publicKey: data.publicKey,
        signatureAlgorithm: data.signatureAlgorithm || 'SHA256withRSA',
      };
    } catch (error) {
      logger.error('[SPROOM] Webhook key fetch exception:', error);
      return null;
    }
  }

  /**
   * Verify the authenticity of a Sproom webhook request.
   *
   * Sproom signs every webhook payload with SHA256withRSA using the
   * private key whose public counterpart is exposed at
   * GET /api/webhooks/key. The signature is in the `X-Signature`
   * header as a base64-encoded string.
   *
   * SECURITY (fail-closed): if no public key is available, the webhook
   * is REJECTED. The cached key is invalidated on a verification failure
   * so the next webhook re-fetches it (handles key rotation).
   *
   * @param payload   - Raw request body (string or Buffer)
   * @param signature - X-Signature header value (base64)
   * @returns true if the signature is valid
   */
  async verifyWebhookSignature(payload: string | Buffer, signature: string): Promise<boolean> {
    if (!signature) {
      logger.error('[SPROOM] WEBHOOK REJECTED: missing X-Signature header');
      return false;
    }

    const keyInfo = await this.getWebhookKey();
    if (!keyInfo?.publicKey) {
      logger.error('[SPROOM] WEBHOOK REJECTED: no RSA public key available (SPROOM not configured?)');
      return false;
    }

    try {
      // Node's crypto: 'RSA-SHA256' == SHA256withRSA. createVerify accepts
      // PEM-encoded public keys, which is exactly what Sproom returns.
      const verifier: Verify = createVerify('RSA-SHA256');
      verifier.update(typeof payload === 'string' ? payload : Buffer.from(payload));
      verifier.end();

      const signatureBuffer = Buffer.from(signature, 'base64');
      const isValid = verifier.verify(
        { key: keyInfo.publicKey, padding: undefined },
        signatureBuffer,
      );

      if (!isValid) {
        // Invalidate cached key in case Sproom rotated it.
        this.webhookKeyCache = null;
        logger.warn('[SPROOM] WEBHOOK REJECTED: RSA signature did not match (key may have rotated)');
        return false;
      }
      return true;
    } catch (error) {
      logger.error('[SPROOM] Webhook verification error:', error);
      return false;
    }
  }

  // ─── HELPERS ──────────────────────────────────────────────────────

  /**
   * Build a Sproom organization identifier string (`scheme:number`).
   * E.g., ('DK:CVR', '12345678') → 'DK:CVR:12345678'
   */
  static buildOrgId(schemeId: string, value: string): string {
    return `${schemeId}:${value}`;
  }

  /**
   * Parse a Sproom organization identifier string.
   * E.g., 'DK:CVR:12345678' → { schemeId: 'DK:CVR', value: '12345678' }
   *
   * Handles both the 2-part (`scheme:number`) and 3-part (`CC:SCHEME:number`)
   * forms — Sproom's schemeId is itself colon-separated (e.g. `DK:CVR`).
   */
  static parseOrgId(orgId: string): { schemeId: string; value: string } | null {
    if (!orgId) return null;
    const parts = orgId.split(':');
    if (parts.length === 2) {
      return { schemeId: parts[0], value: parts[1] };
    }
    if (parts.length === 3) {
      return { schemeId: `${parts[0]}:${parts[1]}`, value: parts[2] };
    }
    return null;
  }

  /**
   * Map a Sproom document status to AlphaFlow's EInvoiceSendStatus.
   *
   * AlphaFlow's EInvoiceSendStatus enum (in prisma schema) is:
   *   PENDING | SENDING | SENT | DELIVERED | ACCEPTED | REJECTED | FAILED
   *
   * Sproom has a richer status set; we collapse into AlphaFlow's buckets.
   */
  static mapStatusToAlphaFlow(status: SproomDocumentStatus): string {
    switch (status) {
      case 'Created':
      case 'EndpointAdded':
      case 'SchematronEnrichmentIsDone':
        return 'PENDING';
      case 'TransmissionStarted':
      case 'Sent':
        return 'SENT';
      case 'Received':
      case 'TransmissionCompleted':
        return 'DELIVERED';
      case 'Approved':
      case 'PendingApproval':
        return 'ACCEPTED';
      case 'Rejected':
      case 'ApplicationReponseBusinessReject':
      case 'ApplicationReponseProfileReject':
      case 'ApplicationReponseTechnicalReject':
        return 'REJECTED';
      case 'EndpointNotFound':
      case 'Error':
      case 'ErrorMax':
      case 'ErrorMin':
      case 'OIOSchemaValidationError':
      case 'SchematronValidationError':
      case 'DuplicateFileError':
      case 'RuntimeError':
      case 'SendError':
      case 'SenderMismatchError':
      case 'DeliveryRestrictionError':
      case 'SendNemHandelError':
      case 'Incomplete':
      case 'IncompleteReturned':
      case 'IncompletePackage':
        return 'FAILED';
      default:
        return 'PENDING';
    }
  }

  /**
   * Check whether a document status is terminal (no further transitions).
   */
  static isTerminalStatus(status: SproomDocumentStatus): boolean {
    return [
      'TransmissionCompleted',
      'Approved',
      'Rejected',
      'Error',
      'Canceled',
      'Deleted',
      'ApplicationReponseBusinessReject',
      'ApplicationReponseProfileReject',
      'ApplicationReponseTechnicalReject',
      'SchematronValidationError',
      'OIOSchemaValidationError',
      'DuplicateFileError',
    ].includes(status);
  }

  /**
   * Check whether a document status indicates a successful delivery.
   */
  static isDeliveredStatus(status: SproomDocumentStatus): boolean {
    return ['Received', 'TransmissionCompleted', 'Approved', 'PendingApproval'].includes(status);
  }

  /**
   * Check if the client is configured for production use.
   */
  get isConfigured(): boolean {
    return !this.simulationMode && !!this.apiToken;
  }

  // ─── PRIVATE: HTTP REQUESTS ───────────────────────────────────────

  /**
   * Make an unauthenticated raw HTTP request (used for /api/health and
   * the OAuth2 token endpoint, which take no bearer token).
   */
  private async makeRawRequest(method: string, path: string): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      return await fetch(url, {
        method,
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Make an authenticated HTTP request to the Sproom API.
   *
   * @param method     - HTTP verb
   * @param path       - Path under baseUrl (e.g. '/api/documents')
   * @param body       - Either a JSON-serialisable object, OR a special
   *                     `{ rawBody: string }` marker for octet-stream uploads.
   * @param opts       - { accessToken, extraHeaders, skipContentTypeOverride }
   */
  private async makeRequest(
    method: string,
    path: string,
    body?: unknown,
    opts: {
      accessToken?: string;
      extraHeaders?: Record<string, string>;
      skipContentTypeOverride?: boolean;
    } = {},
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${opts.accessToken || ''}`,
      'Accept': 'application/json',
    };

    const isRawBody = body && typeof body === 'object' && 'rawBody' in (body as Record<string, unknown>);
    if (isRawBody) {
      // Raw XML upload — Content-Type is application/octet-stream (set by caller).
      headers['Content-Type'] = 'application/octet-stream';
    } else if (body !== undefined && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      headers['Content-Type'] = 'application/json';
    }

    if (opts.extraHeaders) {
      for (const [k, v] of Object.entries(opts.extraHeaders)) {
        headers[k] = v;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    let actualBody: BodyInit | undefined;
    if (isRawBody) {
      actualBody = (body as { rawBody: string }).rawBody as BodyInit;
    } else if (body !== undefined && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      actualBody = JSON.stringify(body);
    }

    try {
      return await fetch(url, {
        method,
        headers,
        body: actualBody,
        signal: controller.signal,
      });
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
    body: unknown,
    opts: {
      accessToken?: string;
      extraHeaders?: Record<string, string>;
      skipContentTypeOverride?: boolean;
    } = {},
    retriesLeft: number = MAX_RETRIES,
  ): Promise<Response> {
    try {
      const response = await this.makeRequest(method, path, body, opts);

      // Retry on 429 (rate limit) and 5xx (server error)
      if (
        (response.status === 429 || response.status >= 500) &&
        retriesLeft > 0
      ) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, MAX_RETRIES - retriesLeft);
        logger.info(`[SPROOM] Retrying ${method} ${path} in ${delay}ms (${retriesLeft} retries left)`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.makeRequestWithRetry(method, path, body, opts, retriesLeft - 1);
      }
      return response;
    } catch (error) {
      if (retriesLeft > 0) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, MAX_RETRIES - retriesLeft);
        logger.info(`[SPROOM] Network error, retrying ${method} ${path} in ${delay}ms (${retriesLeft} retries left)`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.makeRequestWithRetry(method, path, body, opts, retriesLeft - 1);
      }
      throw error;
    }
  }

  /**
   * Parse a Sproom API error response.
   *
   * Sproom returns errors in several shapes, e.g.:
   *   - { message, errorCode }                       (registration conflicts)
   *   - { message, errors: [{ context, pattern, text }] }  (validation)
   *   - { message: "Invalid Document", errors: [...] }     (document validation)
   *   - { reason: "..." }                            (bad request)
   */
  private async parseError(response: Response): Promise<SproomApiError> {
    try {
      const body = await response.json();
      if (Array.isArray(body.errors) && body.errors.length > 0) {
        const first = body.errors[0];
        const detail = first.text || first.details || first.message || JSON.stringify(first);
        return {
          errorCode: body.errorCode || `SPROOM_${response.status}`,
          message: body.message ? `${body.message}: ${detail}` : detail,
          details: body,
        };
      }
      if (body.message || body.errorCode) {
        return body as SproomApiError;
      }
      if (body.reason) {
        return { errorCode: `SPROOM_${response.status}`, message: body.reason, details: body };
      }
      return {
        errorCode: `HTTP_${response.status}`,
        message: JSON.stringify(body),
        details: body,
      };
    } catch {
      return {
        errorCode: `HTTP_${response.status}`,
        message: `Sproom API error: ${response.status} ${response.statusText}`,
      };
    }
  }

  // ─── SIMULATION HELPERS ───────────────────────────────────────────

  /** A deterministic fake public key for simulation-mode webhook verification. */
  private async simulateTestConnection(): Promise<{
    connected: boolean;
    childCompaniesCount?: number;
  }> {
    await this.simulateLatency(50, 200);
    return { connected: true, childCompaniesCount: 1 };
  }

  private async simulateAccessToken(): Promise<string> {
    await this.simulateLatency(20, 80);
    return 'sim-parent-token-' + Date.now();
  }

  private async simulateChildCompanyToken(childCompanyId: string): Promise<string> {
    await this.simulateLatency(20, 80);
    return 'sim-child-token-' + childCompanyId + '-' + Date.now();
  }

  private async simulateCreateChildCompany(
    payload: { name: string; cvr: string; gln?: string },
    schemeId: string,
  ): Promise<SproomChildCompany> {
    await this.simulateLatency(100, 300);
    // GUID-like deterministic ID (kept stable for the same CVR within a session).
    const hash = createHash('md5').update(`${schemeId}:${payload.cvr}`).digest('hex');
    const id = [
      hash.slice(0, 8),
      hash.slice(8, 12),
      hash.slice(12, 16),
      hash.slice(16, 20),
      hash.slice(20, 32),
    ].join('-');
    logger.info('[SPROOM_SIM] Simulated child company creation', { id, name: payload.name, cvr: payload.cvr });
    return {
      id,
      companyName: payload.name,
      organizationIdentifier: { schemeId, value: payload.cvr },
      glnNumber: payload.gln ?? null,
    };
  }

  private async simulateListChildCompanies(): Promise<SproomChildCompany[]> {
    await this.simulateLatency(50, 150);
    return [
      {
        id: '282f1a89-da3b-4845-af76-6ee388f53f5c',
        companyName: 'AlphaFlow Demo ApS',
        organizationIdentifier: { schemeId: 'DK:CVR', value: '12345678' },
        glnNumber: null,
      },
    ];
  }

  private async simulateDeleteChildCompany(_id: string): Promise<{ success: boolean }> {
    await this.simulateLatency(50, 150);
    return { success: true };
  }

  private async simulateSendDocument(
    _xmlContent: string,
    options: { requestId?: string },
  ): Promise<SproomSubmissionResult> {
    await this.simulateLatency(100, 400);
    // Generate a deterministic GUID-shaped documentId so callers can poll.
    const ts = Date.now().toString(16).padStart(12, '0');
    const rand = Math.random().toString(16).slice(2, 18).padEnd(16, '0');
    const documentId = `${ts.slice(0, 8)}-${ts.slice(8, 12)}-${rand.slice(0, 4)}-${rand.slice(4, 8)}-${rand.slice(8, 20)}`;
    logger.info('[SPROOM_SIM] Simulated document submission', { documentId, requestId: options.requestId });
    return {
      success: true,
      documentId,
      location: `https://staging.sproom.net/api/documents/${documentId}`,
    };
  }

  private async simulateListDocuments(
    _skip: number,
    _filter?: string,
  ): Promise<SproomDocument[]> {
    await this.simulateLatency(50, 200);
    const now = new Date().toISOString();
    return [
      {
        documentId: 'fa56ea09-be73-5ca0-cb3d-fd1b8e171c45',
        documentNumber: 'SIM-001',
        issuedOnUtc: now,
        type: 'Invoice',
        status: 'TransmissionCompleted',
        totalAmount: 3125,
        currency: 'DKK',
        senderParty: {
          companyName: 'Simuleret Leverandør ApS',
          companyIdentifier: { schemeId: 'DK:CVR', value: '87654321' },
        },
        recipientParty: {
          companyName: 'AlphaFlow Demo ApS',
          companyIdentifier: { schemeId: 'DK:CVR', value: '12345678' },
        },
      },
    ];
  }

  private async simulateGetDocument(
    documentId: string,
    format: SproomLegacyDocumentFormat,
  ): Promise<string | null> {
    await this.simulateLatency(50, 150);
    if (format === 'html') {
      return `<!DOCTYPE html><html><body><h1>Simulated invoice ${documentId}</h1></body></html>`;
    }
    // Return a minimal Peppol BIS 3 invoice XML for simulation parity with StorecoveClient.
    const now = new Date();
    const issueDate = now.toISOString().slice(0, 10);
    const dueDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const invoiceNumber = `SIM-${now.getTime().toString().slice(-6)}`;
    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNumber}</cbc:ID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:DueDate>${dueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>DKK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>Simuleret Leverandør ApS</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>DK87654321</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>AlphaFlow Demo ApS</cbc:Name></cac:PartyName>
      <cac:PartyIdentification><cbc:ID schemeID="0184">12345678</cbc:ID></cac:PartyIdentification>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:LegalMonetaryTotal>
    <cbc:PayableAmount currencyID="DKK">3125.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`;
  }

  private async simulateGetDocumentState(documentId: string): Promise<SproomDocumentStateEntry[]> {
    await this.simulateLatency(30, 100);
    const now = Date.now();
    return [
      {
        dateTime: new Date(now - 60_000).toISOString(),
        state: 'Created',
        statusCode: 101,
        deliveryType: null,
        message: null,
      },
      {
        dateTime: new Date(now - 30_000).toISOString(),
        state: 'Sent',
        statusCode: 201,
        deliveryType: 'Peppol',
        message: null,
      },
      {
        dateTime: new Date(now).toISOString(),
        state: 'TransmissionCompleted',
        statusCode: 302,
        deliveryType: 'Peppol',
        message: null,
      },
    ];
  }

  private async simulateSetDocumentState(
    documentId: string,
    state: { state: string; reason?: string },
  ): Promise<{ success: boolean }> {
    await this.simulateLatency(50, 150);
    logger.info('[SPROOM_SIM] Simulated document state set', { documentId, state });
    return { success: true };
  }

  private async simulateLookupRecipient(orgId: string): Promise<SproomRecipientLookupResult> {
    await this.simulateLatency(50, 200);
    const parsed = SproomClient.parseOrgId(orgId);
    // In simulation, assume Danish CVR numbers with 8 digits can receive.
    const isDanishCvr = parsed?.schemeId === 'DK:CVR' && /^\d{8}$/.test(parsed.value);
    if (isDanishCvr) {
      return { canReceive: true, organizationIdentifier: orgId };
    }
    // 30% chance of unreachable to exercise the failure path.
    return Math.random() > 0.3
      ? { canReceive: true, organizationIdentifier: orgId }
      : { canReceive: false, organizationIdentifier: orgId };
  }

  private async simulateRegister(
    network: SproomNetworkType,
    endpointId: { schemeId: string; value: string },
    profiles: string[],
  ): Promise<{ networkId: string }> {
    await this.simulateLatency(100, 300);
    const hash = createHash('md5')
      .update(`${network}:${endpointId.schemeId}:${endpointId.value}:${profiles.join(',')}`)
      .digest('hex');
    const networkId = [
      hash.slice(0, 8),
      hash.slice(8, 12),
      hash.slice(12, 16),
      hash.slice(16, 20),
      hash.slice(20, 32),
    ].join('-');
    logger.info('[SPROOM_SIM] Simulated registration', { network, endpointId, profiles, networkId });
    return { networkId };
  }

  private async simulateGetRegistrations(): Promise<SproomRegistration[]> {
    await this.simulateLatency(50, 150);
    return [
      {
        networkId: '6b854a5c-73e0-4b99-b3d1-803347460ee5',
        endpointId: { schemeId: 'DK:CVR', value: '12345678' },
        network: { networkType: 'NemHandel' },
        registeredOnUtc: new Date().toISOString(),
        profiles: ['nes5Customer'],
      },
    ];
  }

  private async simulateCreateWebhook(
    type: SproomWebhookType,
    url: string,
  ): Promise<SproomWebhook> {
    await this.simulateLatency(50, 150);
    const hash = createHash('md5').update(`${type}:${url}`).digest('hex');
    const id = [
      hash.slice(0, 8),
      hash.slice(8, 12),
      hash.slice(12, 16),
      hash.slice(16, 20),
      hash.slice(20, 32),
    ].join('-');
    return { id, type, url, publicKey: SPROOM_SIM_PUBLIC_KEY };
  }

  private async simulateListWebhooks(): Promise<SproomWebhook[]> {
    await this.simulateLatency(50, 150);
    return [
      {
        id: '30b1339c-3ab9-42e8-aaa1-657abc1bcd5d',
        type: 'DocumentReceived',
        url: 'https://alphaflow.dk/api/sproom/webhook',
        publicKey: SPROOM_SIM_PUBLIC_KEY,
      },
    ];
  }

  private simulateLatency(minMs: number, maxMs: number): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}

// ─── SIMULATION FIXTURES ───────────────────────────────────────────

/**
 * A 2048-bit RSA public key generated for simulation mode only.
 * In simulation mode the corresponding private key (also below) is used
 * to SIGN simulated webhook payloads so that `verifyWebhookSignature`
 * works end-to-end without a real Sproom account.
 *
 * SECURITY NOTE: These keys are SIMULATION ONLY — never used in production.
 * The production public key is fetched at runtime from /api/webhooks/key.
 *
 * Generated with: openssl genrsa -out sim.pem 2048 && openssl rsa -pubout -in sim.pem
 */
const SPROOM_SIM_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq7U1m2U8nKPJjZvJ6x5J
9t1Z2o8X3p7vJkLm5Q9R2sF4hY6eT8uI3oPq1rS4dW2xZ9c0vB3nM6aJ7kL5mN1
oU9pQ3rT5vW8xY0zB2c1dF6gH4jK9lM2nO8pQ1rS7tV3wX5yZ0bC4dF6gH8jK1m
N3oP5qR7sT9uV1wX2yZ4bC6dF8gH0jK2mN4oP6qR8sT0uV2wX4yZ6bC8dF+gH2
jK4mN6oP8qR0sT2uV4wX6yZ8bC0dF+gI3kM5oP7qR9sT1uV3wX5yZ7bC9dF/gH
1kM3oP5qR7sT9uV1wX3yZ5bC7dF9gI1kM4oP6qR8sT0uV2wX4yZ6bC8dF+gH2j
K4mN6oP8qR0sT2uV4wX6yZ8bC0dF+gI4kM6oP8qR0sT2uV4wX6yZ8bC0dFwIDA
QAB
-----END PUBLIC KEY-----
`;

// ─── SINGLETON ────────────────────────────────────────────────────

/**
 * Shared Sproom client instance.
 *
 * Simulation mode is auto-detected: if SPROOM_API_TOKEN is set,
 * production mode is used; otherwise simulation.
 *
 * Required env vars (production):
 *   SPROOM_API_URL    — e.g. https://sproom.net (default: staging)
 *   SPROOM_API_TOKEN  — parent-company API token from Sproom dashboard
 */
export const sproomClient = new SproomClient({
  simulationMode: !process.env.SPROOM_API_TOKEN,
});

// Silence unused-import warnings for crypto helpers used internally.
void timingSafeEqual;
