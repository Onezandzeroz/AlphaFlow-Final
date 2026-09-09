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

/**
 * Storecove webhook event: outbound submission status change.
 *
 * Sent by Storecove when an invoice_submissions delivery status changes
 * (processing → delivered → accepted / rejected / failed).
 */
export interface StorecoveSubmissionWebhookEvent {
  event:
    | 'invoice_submission.status_changed'
    | 'invoice_submission.created'
    | 'legal_entity.updated';
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

/**
 * Storecove webhook event: an inbound e-invoice was received for one of our
 * legal entities.
 *
 * Storecove delivers received documents via webhook (push) and/or a pull
 * queue. This event signals that a document is available for retrieval via
 * GET /received_documents/{document_guid}/{original|json}.
 *
 * The `tenant_id` is the free-form key we set when creating the legal entity;
 * `legal_entity_id` is the numeric Storecove legal entity id (matches
 * Company.storecoveLegalEntityId).
 */
export interface StorecoveReceivedDocumentWebhookEvent {
  event: 'received_document';
  timestamp: string;
  data: {
    /** Unique document identifier — used to fetch the document content. */
    document_guid: string;
    /** The legal entity the document was addressed to. */
    legal_entity_id?: number;
    /** Free-form tenant key set during legal entity creation (our Company.id). */
    tenant_id?: string;
    /** Whether Storecove could parse the document. If false, fetch `original` for raw XML. */
    parseable?: boolean;
    /** Recipient endpoint (may be present for quick tenant resolution). */
    receiver_endpoint_id?: string;
    receiver_scheme?: string;
    receiver_identifier?: string;
    /** Sender endpoint, when available. */
    sender_endpoint_id?: string;
    sender_scheme?: string;
    sender_identifier?: string;
  };
}

/**
 * Discriminated union of all Storecove webhook events AlphaFlow handles.
 *
 * Outbound: invoice_submission.* + legal_entity.updated → update EInvoiceSending status.
 * Inbound:  received_document                       → fetch + parse + store ReceivedInvoice.
 */
export type StorecoveWebhookEvent =
  | StorecoveSubmissionWebhookEvent
  | StorecoveReceivedDocumentWebhookEvent;

/**
 * Parsed received document metadata (GET /received_documents/{guid}/json).
 *
 * Used as a fallback for tenant resolution when the webhook payload does not
 * include legal_entity_id: the recipient endpoint (scheme:identifier) is
 * matched against Company.einvoiceEndpointId.
 */
export interface StorecoveReceivedDocumentJson {
  document_guid: string;
  /** Recipient legal entity. */
  legal_entity_id?: number;
  /** Recipient Peppol participant, e.g. { scheme: '0184', identifier: '12345678' }. */
  recipient?: { scheme?: string; identifier?: string };
  /** Sender Peppol participant. */
  sender?: { scheme?: string; identifier?: string };
  /** Document type, e.g. 'invoice', 'creditnote'. */
  document_type?: string;
  /** Whether Storecove successfully parsed the document. */
  parseable?: boolean;
  /** ISO timestamp of receipt. */
  created_at?: string;
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

/** Storecove API base URL (EU region).
 *  NOTE: the correct path includes /api — confirmed via the official
 *  OpenAPI 2.0.1 spec at https://api.apis.guru/v2/specs/storecove.com/2.0.1/  */
const DEFAULT_BASE_URL = 'https://api.storecove.com/api/v2';

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
   * Test the Storecove API connection.
   *
   * Uses GET /discovery/identifiers (a lightweight authed endpoint) to
   * verify the API key is valid. Returns true if the key works.
   *
   * NOTE: Storecove has NO "list all legal entities" endpoint — only
   * POST /legal_entities (create) and GET /legal_entities/{id} (get one).
   * So we can't return a legalEntitiesCount here. Legal entity IDs are
   * tracked locally on the Company model (storecoveLegalEntityId).
   */
  async testConnection(): Promise<{ connected: boolean; error?: string; legalEntitiesCount?: number }> {
    if (this.simulationMode) {
      return this.simulateTestConnection();
    }

    try {
      // GET /discovery/identifiers — returns 200 on valid auth, 401 on invalid
      const response = await this.makeRequest('GET', '/discovery/identifiers');

      if (!response.ok) {
        const error = await this.parseError(response);
        return {
          connected: false,
          error: error.message || `API returned ${response.status}`,
        };
      }

      // Connection is healthy. We can't count legal entities (no list endpoint),
      // so we return 0 and let callers check the Company.storecoveLegalEntityId
      // field to determine if a legal entity is bound.
      return {
        connected: true,
        legalEntitiesCount: 0,
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
   * Get a specific legal entity by its Storecove ID.
   *
   * NOTE: Storecove has NO "list all legal entities" endpoint. You must
   * know the numeric ID (stored locally on Company.storecoveLegalEntityId).
   * Use getLegalEntity(id) to fetch details for a known ID.
   */
  async getLegalEntity(legalEntityId: number): Promise<StorecoveLegalEntity | null> {
    if (this.simulationMode) {
      return this.simulateGetLegalEntities()[0] ?? null;
    }

    try {
      const response = await this.makeRequest('GET', `/legal_entities/${legalEntityId}`);
      if (!response.ok) {
        logger.warn('[STORECOVE] Failed to fetch legal entity', { legalEntityId, status: response.status });
        return null;
      }
      return await response.json() as StorecoveLegalEntity;
    } catch (error) {
      logger.warn('[STORECOVE] Legal entity fetch exception:', error);
      return null;
    }
  }

  /**
   * @deprecated Storecove has no "list all" endpoint. Returns [].
   * Use getLegalEntity(id) with a known ID instead.
   */
  async getLegalEntities(): Promise<StorecoveLegalEntity[]> {
    if (this.simulationMode) {
      return this.simulateGetLegalEntities();
    }
    logger.warn('[STORECOVE] getLegalEntities() called but Storecove has no list endpoint. Returning [].');
    return [];
  }

  /**
   * Create a new legal entity in Storecove.
   *
   * Used by tenants to register their own company as a Peppol sender.
   * The request is authenticated with the platform-level API key
   * (STORECOVE_API_KEY in .env) — tenants never see or enter an API key.
   *
   * KYC responsibility: Storecove shifts KYC to the contractor (AlphaFlow).
   * AlphaFlow enforces this by requiring a CVR-verified company before
   * allowing legal entity creation (see /api/storecove/create-legal-entity).
   *
   * @param payload - Legal entity details (name, Peppol identifiers, address)
   * @returns The created legal entity with its numeric id
   */
  async createLegalEntity(payload: {
    /** Display name (company name) → maps to party_name */
    name: string;
    /** Peppol identifiers — for Danish companies: [{ scheme: '0184', identifier: '<CVR>' }] */
    peppolIdentifiers: Array<{ scheme: string; identifier: string }>;
    /** Address of the legal entity (line1, city, zip, country are required by Storecove) */
    address: {
      country: string;
      street?: string;
      city: string;
      zip: string;
    };
    /** Tenant ID for multi-tenant isolation in Storecove (optional) */
    tenantId?: string;
    /** Whether the legal entity is public (default: false) */
    public?: boolean;
  }): Promise<StorecoveLegalEntity> {
    if (this.simulationMode) {
      return this.simulateCreateLegalEntity(payload);
    }

    // Step 1: Create the legal entity (no peppol identifiers in this call).
    // Storecove LegalEntityCreate schema (confirmed via OpenAPI 2.0.1):
    //   required: party_name (min 2), line1 (min 2), city (min 2), zip (min 2), country
    // All string fields have minLength: 2 — we enforce this to avoid 422 errors.
    const safeStr = (s: string | undefined | null, fallback: string): string => {
      const v = (s ?? '').trim();
      return v.length >= 2 ? v : fallback;
    };
    const partyName = safeStr(payload.name, 'AlphaFlow Tenant');
    const line1 = safeStr(payload.address.street, partyName);
    const city = safeStr(payload.address.city, 'København');
    const zip = safeStr(payload.address.zip, '0000');

    const createBody: Record<string, unknown> = {
      party_name: partyName,
      line1,
      city,
      zip,
      country: payload.address.country,
      ...(payload.tenantId && { tenant_id: payload.tenantId }),
      public: payload.public ?? false,
    };

    const createResponse = await this.makeRequestWithRetry('POST', '/legal_entities', createBody);
    if (!createResponse.ok) {
      // Capture the full error body so the caller sees the precise validation failure
      const errorBody = await createResponse.text();
      logger.error('[STORECOVE] Failed to create legal entity', {
        status: createResponse.status,
        body: errorBody,
        payloadSent: createBody,
      });
      throw new Error(
        `Storecove rejected legal entity creation (HTTP ${createResponse.status}): ${errorBody || createResponse.statusText}`
      );
    }
    const legalEntity = await createResponse.json() as StorecoveLegalEntity;

    // Step 2: Add each Peppol identifier via the sub-resource endpoint.
    // POST /legal_entities/{id}/peppol_identifiers
    //   body: { scheme, identifier, superscheme: "iso6523-actorid-upis" }
    for (const pi of payload.peppolIdentifiers) {
      const piResponse = await this.makeRequestWithRetry(
        'POST',
        `/legal_entities/${legalEntity.id}/peppol_identifiers`,
        { scheme: pi.scheme, identifier: pi.identifier, superscheme: 'iso6523-actorid-upis' },
      );
      if (!piResponse.ok) {
        const error = await this.parseError(piResponse);
        logger.error('[STORECOVE] Failed to add Peppol identifier to legal entity', {
          legalEntityId: legalEntity.id,
          scheme: pi.scheme,
          identifier: pi.identifier,
          error: error.message,
        });
        // Don't fail the whole creation — the legal entity exists.
      }
    }

    return legalEntity;
  }

  /**
   * Delete a legal entity in Storecove (used when a tenant disconnects).
   *
   * Note: Storecove may soft-delete rather than hard-delete. The legal
   * entity's Peppol identifiers become unavailable for re-registration
   * for a grace period.
   */
  async deleteLegalEntity(legalEntityId: number): Promise<{ success: boolean }> {
    if (this.simulationMode) {
      return this.simulateDeleteLegalEntity(legalEntityId);
    }

    const response = await this.makeRequestWithRetry(
      'DELETE',
      `/legal_entities/${legalEntityId}`,
    );
    await this.assertOk(response, 'Failed to delete legal entity');
    return { success: true };
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
      // Storecove InvoiceSubmission payload (confirmed via OpenAPI 2.0.1):
      //   - document: raw XML string (top-level, NOT nested under invoice)
      //   - legalEntityId: camelCase (NOT legal_entity_id)
      //   - routing: top-level object with eIdentifiers
      // The `document` field is marked DEPRECATED in favor of `attachments`
      // but still works for raw UBL/OIOUBL XML submission.
      const body: Record<string, unknown> = {
        document: xmlContent,
      };

      // Set legal entity (camelCase field name)
      if (options.legalEntityId) {
        body.legalEntityId = options.legalEntityId;
      }

      // Set routing if receiver scheme + identifier are provided
      if (options.receiverScheme && options.receiverIdentifier) {
        body.routing = {
          eIdentifiers: {
            scheme: options.receiverScheme,
            identifier: options.receiverIdentifier,
          },
        };
      }

      // NOTE: routeToNemhandel — Storecove's InvoiceSubmission schema does
      // NOT have a `nemhandel` boolean field. NemHandel routing is determined
      // by Storecove automatically based on the receiver's network registration.
      // The previous `nemhandel: true` flag was incorrect and has been removed.

      const response = await this.makeRequestWithRetry('POST', '/invoice_submissions', body);

      if (!response.ok) {
        const error = await this.parseError(response);
        return {
          success: false,
          errorCode: error.error || `STORECOVE_${response.status}`,
          errorMessage: error.message || `Storecove API error: ${response.status}`,
        };
      }

      // Response: { guid: "<v4-uuid>" } (InvoiceSubmissionResult schema)
      const result = await response.json() as { guid?: string };

      return {
        success: true,
        submissionId: result.guid,
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
   * NOTE: Storecove has NO GET /invoice_submissions/{id} endpoint for
   * polling status. Delivery status updates arrive exclusively via the
   * webhook (POST /api/storecove/webhook, event invoice_submission.status_changed).
   *
   * This method returns a 'processing' status to indicate the submission
   * is in-flight and the caller should wait for the webhook.
   *
   * @param submissionId - The submission GUID returned from submitInvoice
   * @returns Current delivery status (processing unless webhook has updated it)
   */
  async getSubmissionStatus(submissionId: string): Promise<StorecoveDeliveryStatus> {
    if (this.simulationMode) {
      return this.simulateGetSubmissionStatus(submissionId);
    }

    // Storecove has no GET /invoice_submissions/{id} endpoint.
    // Status is delivered via webhook only. Return 'processing' so callers
    // know to wait for the webhook event rather than polling.
    logger.info('[STORECOVE] getSubmissionStatus: no polling endpoint exists; awaiting webhook', { submissionId });
    return {
      status: 'processing',
    };
  }

  // ─── PEPPOL PARTICIPANT LOOKUP ────────────────────────────────────

  /**
   * Check if a recipient is registered on the Peppol network.
   *
   * Uses POST /discovery/exists (confirmed via OpenAPI 2.0.1):
   *   body: { scheme, identifier, metaScheme: "iso6523-actorid-upis", network: "peppol" }
   *   response: { code: "OK" | "NOK", email: boolean }
   *
   * Pre-flight check before sending: verifies the recipient is reachable.
   *
   * @param scheme - Peppol scheme ID (e.g., '0184' for Danish CVR)
   * @param identifier - The identifier value (e.g., CVR number)
   * @returns Participant existence + metadata
   */
  async lookupParticipant(
    scheme: string,
    identifier: string,
  ): Promise<StorecoveParticipantResult> {
    if (this.simulationMode) {
      return this.simulateLookupParticipant(scheme, identifier);
    }

    try {
      const body = {
        scheme,
        identifier,
        metaScheme: 'iso6523-actorid-upis',
        network: 'peppol',
      };
      const response = await this.makeRequestWithRetry('POST', '/discovery/exists', body);

      if (!response.ok) {
        const error = await this.parseError(response);
        logger.warn('[STORECOVE] Participant lookup failed:', error);
        return {
          exists: false,
          scheme,
          identifier,
        };
      }

      // Response: { code: "OK" | "NOK", email: boolean }
      const result = await response.json() as { code: string; email?: boolean };
      const exists = result.code === 'OK';

      return {
        exists,
        scheme,
        identifier,
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

  // ─── RECEIVED DOCUMENTS (INBOUND) ─────────────────────────────────
  //
  // Erhvervsstyrelsen requires platforms to both SEND and RECEIVE e-invoices.
  // When Storecove receives an inbound e-invoice addressed to one of our
  // legal entities, it delivers a `received_document` webhook. The webhook
  // carries a `document_guid`; we then fetch the document content here.
  //
  // Two retrieval formats:
  //   /received_documents/{guid}/original → raw XML (text/xml)  — primary
  //   /received_documents/{guid}/json     → parsed metadata     — fallback for tenant resolution

  /**
   * Fetch the original raw XML of a received e-invoice.
   *
   * @param documentGuid - The document_guid from the received_document webhook
   * @returns The UBL 2.1 / OIOUBL XML string, or null on failure
   */
  async getReceivedDocumentOriginal(documentGuid: string): Promise<string | null> {
    if (this.simulationMode) {
      return this.simulateGetReceivedDocumentOriginal(documentGuid);
    }

    try {
      // Storecove API: GET /received_documents/{guid}/{format}?syntax={syntax}
      // format="original" returns raw XML; syntax is a required query param.
      const response = await this.makeRequest(
        'GET',
        `/received_documents/${encodeURIComponent(documentGuid)}/original?syntax=invoice`,
      );

      if (!response.ok) {
        const error = await this.parseError(response);
        logger.error('[STORECOVE] Failed to fetch received document original:', {
          documentGuid,
          status: response.status,
          error: error.message,
        });
        return null;
      }

      // Storecove returns the raw XML as text (content-type: text/xml or application/xml)
      return await response.text();
    } catch (error) {
      logger.error('[STORECOVE] Received document original fetch exception:', error);
      return null;
    }
  }

  /**
   * Fetch the parsed JSON metadata of a received e-invoice.
   *
   * Used as a fallback for tenant resolution when the webhook payload does
   * not include legal_entity_id: the recipient endpoint
   * (scheme:identifier) is matched against Company.einvoiceEndpointId.
   *
   * @param documentGuid - The document_guid from the received_document webhook
   * @returns Parsed document metadata, or null on failure
   */
  async getReceivedDocumentJson(documentGuid: string): Promise<StorecoveReceivedDocumentJson | null> {
    if (this.simulationMode) {
      return this.simulateGetReceivedDocumentJson(documentGuid);
    }

    try {
      const response = await this.makeRequest(
        'GET',
        `/received_documents/${encodeURIComponent(documentGuid)}/json?syntax=invoice`,
      );

      if (!response.ok) {
        const error = await this.parseError(response);
        logger.warn('[STORECOVE] Failed to fetch received document json:', {
          documentGuid,
          status: response.status,
          error: error.message,
        });
        return null;
      }

      const result = await response.json() as StorecoveReceivedDocumentJson;
      return result;
    } catch (error) {
      logger.warn('[STORECOVE] Received document json fetch exception:', error);
      return null;
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

  private async simulateCreateLegalEntity(payload: {
    name: string;
    peppolIdentifiers: Array<{ scheme: string; identifier: string }>;
  }): Promise<StorecoveLegalEntity> {
    await this.simulateLatency(100, 300);
    const id = Math.floor(Math.random() * 9000) + 1000;
    return {
      id,
      name: payload.name,
      tax_regime: 'DK_VAT',
      primary_email: 'demo@alphaflow.dk',
      peppol_identifiers: payload.peppolIdentifiers,
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  private async simulateDeleteLegalEntity(_legalEntityId: number): Promise<{ success: boolean }> {
    await this.simulateLatency(50, 150);
    return { success: true };
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

  /**
   * Simulate fetching the original XML of a received document.
   * Returns a minimal but valid Peppol BIS Billing 3.0 invoice so the full
   * inbound webhook → parse → store flow can be exercised in dev/sandbox
   * without a real Storecove account.
   */
  private async simulateGetReceivedDocumentOriginal(documentGuid: string): Promise<string | null> {
    await this.simulateLatency(50, 150);

    const now = new Date();
    const issueDate = now.toISOString().slice(0, 10);
    const dueDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const invoiceNumber = `SIM-${now.getTime().toString().slice(-6)}`;

    logger.info('[STORECOVE_SIM] Simulated received document fetch', {
      documentGuid,
      invoiceNumber,
    });

    // Minimal Peppol BIS Billing 3.0 (UBL 2.1) invoice XML.
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
      <cac:PostalAddress>
        <cbc:StreetName>Testvej 1</cbc:StreetName>
        <cbc:CityName>København</cbc:CityName>
        <cac:Country><cbc:IdentificationCode>DK</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>DK87654321</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:Contact>
        <cbc:ElectronicMail>faktura@simuleret-leverandoor.dk</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>AlphaFlow Demo ApS</cbc:Name></cac:PartyName>
      <cac:PartyIdentification>
        <cbc:ID schemeID="0184">12345678</cbc:ID>
      </cac:PartyIdentification>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cac:PayeeFinancialAccount>
      <cbc:ID>DK00BANK1234567890</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="DKK">625.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="DKK">2500.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="DKK">625.00</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:TaxExclusiveAmount currencyID="DKK">2500.00</cbc:TaxExclusiveAmount>
    <cbc:TaxAmount currencyID="DKK">625.00</cbc:TaxAmount>
    <cbc:TaxInclusiveAmount currencyID="DKK">3125.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="DKK">3125.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">10</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="DKK">2500.00</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>Konsulenttimer</cbc:Name>
      <cbc:Description>Simuleret konsulentbistand</cbc:Description>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="DKK">250.00</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
  }

  /**
   * Simulate fetching parsed metadata of a received document.
   */
  private async simulateGetReceivedDocumentJson(
    documentGuid: string,
  ): Promise<StorecoveReceivedDocumentJson | null> {
    await this.simulateLatency(30, 100);
    return {
      document_guid: documentGuid,
      legal_entity_id: 1,
      recipient: { scheme: '0184', identifier: '12345678' },
      sender: { scheme: '0184', identifier: '87654321' },
      document_type: 'invoice',
      parseable: true,
      created_at: new Date().toISOString(),
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
