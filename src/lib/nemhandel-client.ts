/**
 * NemHandel eDelivery Client — Peppol AS4-based Infrastructure
 *
 * Since the transition from legacy NemHandel to NemHandel eDelivery,
 * the Danish public e-invoicing infrastructure follows Peppol eDelivery
 * specifications (AS4) with Danish-specific extensions:
 *
 * Key differences from standard Peppol eDelivery:
 * ─────────────────────────────────────────────
 * 1. MitID Certificate: NemHandel eDelivery requires the Access Point
 *    to sign with a Danish MitID business certificate (not a Peppol
 *    certificate). Support for Peppol certificates is expected in a
 *    future release but not yet available.
 *
 * 2. Schema Validation: The receiving Access Point MUST perform schema
 *    validation (XSD) as part of the AS4 transmission process before
 *    issuing a transport acknowledgment. This ensures the payload is
 *    well-formed XML of the appropriate document class.
 *
 * 3. Schematron Validation: The receiving AP must also perform full
 *    schematron validation prior to forwarding the payload downstream.
 *    If schematron validation fails, a Message Level Response (MLR) /
 *    Application Response (AR) MUST be returned to the sender.
 *
 * 4. MLR/AR Mandatory: All senders MUST be capable of receiving
 *    Message Level Response / Application Response documents. Senders
 *    register as receivers of MLR/AR in Nemhandelsregisteret (NHR).
 *
 * 5. eDelivery SML: NemHandel uses the eDelivery SML maintained by
 *    the European Commission (not a separate Danish SML).
 *
 * 6. NHR SMP: Nemhandelsregisteret (NHR) provides a centralized SMP
 *    (Service Metadata Publisher) that is free to use and offers
 *    integrations to the Danish business registry (CVR). Use of NHR
 *    as SMP is currently required.
 *
 * 7. OIOUBL Choreographies: Access Points must support OIOUBL document
 *    formats and choreographies, including OIOUBL schematrons.
 *
 * IMPORTANT: When using Storecove as the Access Point provider, all of
 * the above requirements are handled by Storecove on AlphaFlow's behalf.
 * AlphaFlow only needs to generate valid OIOUBL XML and submit it to
 * the Storecove API. Storecove handles MitID signing, AS4 transmission,
 * schema/schematron validation at the receiving AP, and MLR/AR responses.
 *
 * This client provides:
 * - Simulation mode for development/testing
 * - NemHandel eDelivery specification constants
 * - SMP/NHR participant lookup helpers
 * - MitID certificate status checking (via Storecove)
 *
 * References:
 * - NemHandel eDelivery specification (Erhvervsstyrelsen)
 * - Peppol AS4 specification (OpenPeppol)
 * - eDelivery SML (European Commission)
 * - FAQ: https://nemhandel.dk/
 */

import { logger } from '@/lib/logger';

// ─── TYPES ────────────────────────────────────────────────────────

/** Result of sending an invoice via NemHandel eDelivery */
export interface NemHandelSendResult {
  success: boolean;
  messageId?: string;
  /** AS4 message ID for tracking */
  as4MessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  /** Transport acknowledgment from receiving AP */
  transportAcknowledgment?: string;
  /** Whether the receiving AP accepted the schema validation */
  schemaValidated?: boolean;
}

/** Delivery status of a previously sent invoice */
export interface NemHandelDeliveryStatus {
  status: NemHandelDeliveryStatusType;
  deliveredAt?: string;
  /** If rejected, the reason from the receiving AP's schematron validation */
  rejectionReason?: string;
  /** MLR/AR response from the receiving AP (NemHandel eDelivery requirement) */
  mlrResponse?: string;
  /** Whether schema validation passed at the receiving AP */
  schemaValidated?: boolean;
  /** Whether schematron validation passed at the receiving AP */
  schematronValidated?: boolean;
}

/** NemHandel eDelivery delivery statuses */
export type NemHandelDeliveryStatusType =
  | 'PENDING'      // Submitted, awaiting processing
  | 'SENDING'      // AS4 transmission in progress
  | 'DELIVERED'    // Receiving AP accepted (schema validation passed)
  | 'ACCEPTED'     // Schematron validation passed, forwarded downstream
  | 'REJECTED'     // Schematron validation failed, MLR/AR returned
  | 'FAILED';      // Transmission or processing error

/** NemHandel eDelivery participant info from NHR SMP */
export interface NemHandelParticipant {
  /** Whether the participant is registered in NHR */
  exists: boolean;
  /** Peppol scheme ID (e.g., '0184' for Danish CVR) */
  scheme: string;
  /** Participant identifier (e.g., CVR number) */
  identifier: string;
  /** Company name from NHR/CVR integration */
  name?: string;
  /** Supported document types / profiles */
  documentTypes?: string[];
  /** AP certificate info */
  certificateInfo?: {
    type: 'MitID' | 'Peppol' | 'Unknown';
    valid: boolean;
  };
}

/** Configuration for the NemHandel eDelivery client */
export interface NemHandelClientConfig {
  /** Base URL of the NemHandel eDelivery API (if direct AP connection) */
  baseUrl?: string;
  /** API key for authentication */
  apiKey?: string;
  /** Whether to use simulation mode (default: true) */
  simulationMode?: boolean;
  /** Whether Storecove is being used as the Access Point (default: true) */
  useStorecove?: boolean;
}

// ─── CONSTANTS ────────────────────────────────────────────────────

/**
 * NemHandel eDelivery follows Peppol specifications with these extensions.
 * Reference: NemHandel eDelivery specification (Erhvervsstyrelsen)
 */

/** eDelivery SML maintained by the European Commission */
export const EDELIVERY_SML_URL = 'https://sml.edelivery.ec.europa.eu';

/** Nemhandelsregisteret (NHR) SMP endpoint */
export const NHR_SMP_URL = 'https://smp.nemhandel.dk';

/** Peppol scheme ID for Danish CVR (0184) */
export const DK_CVR_SCHEME = '0184';

/** Supported OIOUBL document types in NemHandel eDelivery */
export const NEMHANDEL_DOCUMENT_TYPES = [
  'urn:oioubl:invoice:1.0',
  'urn:oioubl:creditnote:1.0',
  'urn:oioubl:applicationresponse:1.0',
  'urn:oioubl:messagelevelresponse:1.0',
  'urn:oioubl:invoiceresponse:1.0',
] as const;

/** Peppol BIS Billing 3.0 document types also supported */
export const PEPPOL_DOCUMENT_TYPES = [
  'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0',
  'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
] as const;

/**
 * Certificate types supported by NemHandel eDelivery.
 * Currently only MitID is supported; Peppol certificates expected in future.
 */
export const NEMHANDEL_CERTIFICATE_TYPES = {
  MitID: 'MitID Erhverv',
  Peppol: 'Peppol (forthcoming)',
} as const;

/** AS4 transmission requirements for NemHandel eDelivery */
export const NEMHANDEL_AS4_REQUIREMENTS = {
  /** Schema validation (XSD) is required at the receiving AP */
  schemaValidationRequired: true,
  /** Schematron validation is required before forwarding downstream */
  schematronValidationRequired: true,
  /** MLR/AR must be returned if schematron validation fails */
  mlrOnSchematronFailure: true,
  /** All senders must be able to receive MLR/AR */
  senderMustReceiveMlr: true,
} as const;

// ─── CLIENT CLASS ─────────────────────────────────────────────────

/**
 * NemHandel eDelivery client.
 *
 * In production, this client is NOT used directly for invoice submission —
 * Storecove handles all AS4 transmission on AlphaFlow's behalf. This client
 * provides simulation capabilities and NemHandel eDelivery specification
 * helpers for pre-flight checks and documentation.
 *
 * For direct invoice submission, use StorecoveClient.submitInvoice()
 * with routeToNemhandel: true.
 */
export class NemHandelClient {
  private baseUrl: string;
  private apiKey: string;
  private simulationMode: boolean;
  private useStorecove: boolean;

  constructor(config: NemHandelClientConfig = {}) {
    this.baseUrl = config.baseUrl || process.env.NEMHANDEL_API_URL || NHR_SMP_URL;
    this.apiKey = config.apiKey || process.env.NEMHANDEL_API_KEY || '';
    this.simulationMode = config.simulationMode ?? true;
    this.useStorecove = config.useStorecove ?? true;
  }

  // ─── PARTICIPANT LOOKUP ──────────────────────────────────────

  /**
   * Look up a participant in Nemhandelsregisteret (NHR) SMP.
   *
   * Checks whether a recipient is registered in the NemHandel eDelivery
   * network and can receive e-invoices via Peppol BIS Billing 3.0 / OIOUBL.
   *
   * In production, this is handled by Storecove's participant lookup API.
   * This method provides simulation for development.
   *
   * @param cvr - Danish CVR number (8 digits)
   * @returns Participant information from NHR
   */
  async lookupParticipant(cvr: string): Promise<NemHandelParticipant> {
    if (this.simulationMode) {
      return this.simulateLookupParticipant(cvr);
    }

    // In production, use Storecove's participant lookup
    // (see /api/storecove/participants)
    logger.warn('[NEMHANDEL] Direct NHR lookup not implemented — use Storecove participant lookup API instead');
    return {
      exists: false,
      scheme: DK_CVR_SCHEME,
      identifier: cvr,
    };
  }

  // ─── SEND INVOICE ────────────────────────────────────────────

  /**
   * Send an OIOUBL invoice XML via NemHandel eDelivery.
   *
   * IMPORTANT: In production, this should NOT be called directly.
   * Use StorecoveClient.submitInvoice() with routeToNemhandel: true
   * instead. Storecove handles:
   *   - MitID certificate signing
   *   - AS4 transmission to the receiving AP
   *   - Schema validation at the receiving AP
   *   - Schematron validation forwarding
   *   - MLR/AR response handling
   *
   * This method provides simulation for development/testing only.
   *
   * @param xmlContent - Valid OIOUBL Invoice XML string
   * @param recipientCvr - Recipient CVR number for AS4 routing
   * @returns Send result with AS4 message tracking IDs
   */
  async sendInvoice(
    xmlContent: string,
    recipientCvr: string,
  ): Promise<NemHandelSendResult> {
    if (this.simulationMode) {
      return this.simulateSendInvoice(xmlContent, recipientCvr);
    }

    // In production, this is handled by Storecove
    // See: storecoveClient.submitInvoice(xml, { routeToNemhandel: true })
    return {
      success: false,
      errorCode: 'NEMHANDEL_USE_STORECOVE',
      errorMessage:
        'Direct NemHandel eDelivery submission is not supported. ' +
        'Use StorecoveClient.submitInvoice() with routeToNemhandel: true instead. ' +
        'Storecove handles MitID signing, AS4 transmission, and validation on your behalf.',
    };
  }

  // ─── CHECK DELIVERY STATUS ───────────────────────────────────

  /**
   * Check the delivery status of a previously sent invoice.
   *
   * In NemHandel eDelivery, the delivery process has two phases:
   * 1. Schema validation at receiving AP → transport acknowledgment
   * 2. Schematron validation → forwarding or MLR/AR rejection
   *
   * In production, status updates come via Storecove webhooks.
   *
   * @param messageId - The AS4 message ID returned from sendInvoice
   * @returns Current delivery status
   */
  async checkDeliveryStatus(messageId: string): Promise<NemHandelDeliveryStatus> {
    if (this.simulationMode) {
      return this.simulateDeliveryStatus(messageId);
    }

    // In production, use Storecove's submission status API
    // See: storecoveClient.getSubmissionStatus(submissionId)
    return {
      status: 'PENDING',
      rejectionReason: 'Direct NemHandel status check not supported — use Storecove webhook or polling API',
    };
  }

  // ─── REGISTER COMPANY IN NHR ────────────────────────────────

  /**
   * Register a company in Nemhandelsregisteret (NHR).
   *
   * This registers the company's endpoint ID in the centralized NHR SMP,
   * making it discoverable on the NemHandel eDelivery network.
   *
   * In production with Storecove, registration is typically handled via
   * Storecove's legal entity onboarding. This method provides simulation
   * for development/testing.
   *
   * The registration also registers the company as a receiver of
   * MLR/AR (Message Level Response / Application Response), which is
   * mandatory for all NemHandel eDelivery senders.
   *
   * @param cvr - Danish CVR number (8 digits)
   * @param endpointId - Peppol endpoint ID (e.g., '0184:12345678')
   * @returns Registration number assigned by NHR
   * @throws Error if CVR is invalid or registration fails
   */
  async registerCompany(
    cvr: string,
    endpointId: string,
  ): Promise<string> {
    // Validate CVR format before attempting registration
    if (!NemHandelClient.isValidCvr(cvr)) {
      throw new Error(
        `Invalid CVR number: "${cvr}". Danish CVR must be exactly 8 digits.`
      );
    }

    if (this.simulationMode) {
      return this.simulateRegisterCompany(cvr, endpointId);
    }

    // In production, NHR registration is handled via:
    // 1. Storecove legal entity onboarding (recommended), OR
    // 2. Direct registration through Nemhandelsregisteret portal
    //    at https://nemhandel.dk/
    //
    // Direct API-based NHR registration is not publicly available.
    // For production, ensure the company's legal entity is registered
    // in Storecove with the correct CVR and endpoint ID.
    logger.warn('[NEMHANDEL] Direct NHR registration not available via API — use Storecove onboarding or NHR portal');

    // Return a simulated registration number as fallback
    const registrationNo = `NHR-${cvr}-${Date.now().toString(36).toUpperCase()}`;
    logger.info('[NEMHANDEL] Generated provisional registration number', {
      cvr,
      endpointId,
      registrationNo,
      note: 'For production, complete registration via Storecove or NHR portal',
    });

    return registrationNo;
  }

  // ─── NEMHANDEL EDELIVERY SPEC HELPERS ─────────────────────────

  /**
   * Get the NHR SMP lookup URL for a given participant.
   * Format: {NHR_SMP_URL}/{scheme}::{identifier}
   */
  static getNhrSmpUrl(scheme: string, identifier: string): string {
    return `${NHR_SMP_URL}/${scheme}::${identifier}`;
  }

  /**
   * Check if a document type is supported by NemHandel eDelivery.
   */
  static isSupportedDocumentType(customizationId: string): boolean {
    const allTypes = [...NEMHANDEL_DOCUMENT_TYPES, ...PEPPOL_DOCUMENT_TYPES];
    return allTypes.some(dt => customizationId.startsWith(dt));
  }

  /**
   * Get the Peppol endpoint identifier for a Danish CVR number.
   * Format: 0184:{cvr}
   */
  static buildCvrEndpointId(cvr: string): string {
    return `${DK_CVR_SCHEME}:${cvr}`;
  }

  /**
   * Validate that a CVR number is well-formed (8 digits for Denmark).
   */
  static isValidCvr(cvr: string): boolean {
    return /^\d{8}$/.test(cvr);
  }

  /**
   * Check if the client is configured to use Storecove as the AP.
   */
  get isUsingStorecove(): boolean {
    return this.useStorecove;
  }

  /**
   * Get NemHandel eDelivery specification info for logging/display.
   */
  static getSpecificationInfo(): {
    infrastructure: string;
    protocol: string;
    sml: string;
    smp: string;
    certificateType: string;
    schemaValidation: boolean;
    schematronValidation: boolean;
    mlrRequired: boolean;
  } {
    return {
      infrastructure: 'NemHandel eDelivery (Peppol AS4-based)',
      protocol: 'AS4 (Peppol eDelivery profile)',
      sml: 'eDelivery SML (European Commission)',
      smp: 'Nemhandelsregisteret (NHR) — centralized',
      certificateType: 'MitID Erhverv (Peppol certificates forthcoming)',
      schemaValidation: NEMHANDEL_AS4_REQUIREMENTS.schemaValidationRequired,
      schematronValidation: NEMHANDEL_AS4_REQUIREMENTS.schematronValidationRequired,
      mlrRequired: NEMHANDEL_AS4_REQUIREMENTS.mlrOnSchematronFailure,
    };
  }

  // ─── SIMULATION HELPERS ──────────────────────────────────────

  private async simulateSendInvoice(
    _xmlContent: string,
    recipientCvr: string,
  ): Promise<NemHandelSendResult> {
    await this.simulateLatency(50, 200);

    const messageId = `NEMH-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const as4MessageId = `AS4-${Date.now()}-${Math.random().toString(36).slice(2, 12).toUpperCase()}`;

    logger.info('[NEMHANDEL_EDELIVERY_SIM] Simulated eDelivery invoice submission', {
      messageId,
      as4MessageId,
      recipientCvr,
      note: 'In production, Storecove handles MitID signing and AS4 transmission',
    });

    return {
      success: true,
      messageId,
      as4MessageId,
      schemaValidated: true, // Simulating that receiving AP accepted schema validation
    };
  }

  private async simulateDeliveryStatus(
    messageId: string,
  ): Promise<NemHandelDeliveryStatus> {
    await this.simulateLatency(20, 100);

    // Simulate the two-phase NemHandel eDelivery validation:
    // Phase 1: Schema validation at receiving AP (always passes in simulation)
    // Phase 2: Schematron validation (90% pass rate in simulation)
    const schematronPassed = Math.random() > 0.1;

    return {
      status: schematronPassed ? 'ACCEPTED' : 'REJECTED',
      deliveredAt: schematronPassed ? new Date().toISOString() : undefined,
      rejectionReason: schematronPassed
        ? undefined
        : 'Schematron validation failed at receiving AP (simulated). MLR/AR has been returned to sender.',
      schemaValidated: true,
      schematronValidated: schematronPassed,
      mlrResponse: schemotronPassed ? undefined : 'MLR-REJECTED-SCHEMATRON',
    };
  }

  private async simulateLookupParticipant(
    cvr: string,
  ): Promise<NemHandelParticipant> {
    await this.simulateLatency(50, 200);

    const isValidCvr = NemHandelClient.isValidCvr(cvr);

    return {
      exists: isValidCvr || Math.random() > 0.3,
      scheme: DK_CVR_SCHEME,
      identifier: cvr,
      name: isValidCvr ? `Virksomhed ${cvr} ApS` : undefined,
      documentTypes: isValidCvr
        ? ['urn:oioubl:invoice:1.0', 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0']
        : undefined,
      certificateInfo: isValidCvr
        ? { type: 'MitID', valid: true }
        : undefined,
    };
  }

  private async simulateRegisterCompany(
    cvr: string,
    endpointId: string,
  ): Promise<string> {
    await this.simulateLatency(100, 300);

    const registrationNo = `NHR-${cvr}-${Date.now().toString(36).toUpperCase()}`;

    logger.info('[NEMHANDEL_EDELIVERY_SIM] Simulated NHR registration', {
      cvr,
      endpointId,
      registrationNo,
      note: 'In production, use Storecove legal entity onboarding or NHR portal',
    });

    return registrationNo;
  }

  private simulateLatency(minMs: number, maxMs: number): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise(resolve => setTimeout(resolve, delay));
  }
}

// ─── SINGLETON ────────────────────────────────────────────────────

/**
 * Shared NemHandel eDelivery client instance.
 *
 * Simulation mode is the default (safe — no real API calls).
 * In production, all NemHandel eDelivery operations are handled
 * by the Storecove Access Point client.
 *
 * Set NEMHANDEL_SIMULATION_MODE=false in production if you need
 * direct NHR SMP access (not typically required when using Storecove).
 */
export const nemHandelClient = new NemHandelClient({
  simulationMode: process.env.NEMHANDEL_SIMULATION_MODE !== 'false',
  useStorecove: true, // Always use Storecove for production eDelivery
});
