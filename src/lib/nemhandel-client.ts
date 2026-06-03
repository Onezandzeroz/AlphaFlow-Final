/**
 * NemHandel REST API Client — Abstracted Simulation Layer
 *
 * Provides a typed interface for interacting with the Danish NemHandel
 * (National e-Procurement) network and Peppol BIS Billing access points.
 *
 * CURRENT STATE: This is a simulation/stub implementation. All methods
 * return successful responses with generated IDs. When real NemHandel
 * or Peppol Access Point credentials are available, replace the simulated
 * logic with actual HTTP calls.
 *
 * Future implementation notes are marked with:
 *   // TODO(REAL_API): ... (where real API calls should go)
 */

// ─── TYPES ────────────────────────────────────────────────────────

/** Result of sending an invoice via NemHandel */
export interface NemHandelSendResult {
  success: boolean;
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
  responseXml?: string;
}

/** Delivery status of a previously sent invoice */
export interface NemHandelDeliveryStatus {
  status: 'PENDING' | 'DELIVERED' | 'FAILED' | 'REJECTED';
  deliveredAt?: string;
  rejectionReason?: string;
}

/** Configuration for the NemHandel client */
export interface NemHandelClientConfig {
  /** Base URL of the NemHandel REST API */
  baseUrl?: string;
  /** API key for authentication */
  apiKey?: string;
  /** PEPPOL Access Point endpoint URL */
  peppolAccessPointUrl?: string;
  /** Whether to use simulation mode (default: true) */
  simulationMode?: boolean;
}

// ─── CLIENT CLASS ─────────────────────────────────────────────────

/**
 * NemHandel API client for sending e-invoices via the Danish
 * NemHandelsregisteret network and Peppol BIS Billing 3.0.
 *
 * In simulation mode (default), all operations succeed immediately
 * with synthetic responses. This allows full development and testing
 * of the e-invoice sending pipeline without external dependencies.
 */
export class NemHandelClient {
  private baseUrl: string;
  private apiKey: string;
  private peppolAccessPointUrl: string;
  private simulationMode: boolean;

  constructor(config: NemHandelClientConfig = {}) {
    this.baseUrl = config.baseUrl || process.env.NEMHANDEL_API_URL || 'https://nemhandel.nets.dk/api/v2';
    this.apiKey = config.apiKey || process.env.NEMHANDEL_API_KEY || '';
    this.peppolAccessPointUrl = config.peppolAccessPointUrl || process.env.PEPPOL_AP_URL || 'https://peppol.accesspoint.dk';
    this.simulationMode = config.simulationMode ?? true;
  }

  // ─── SEND INVOICE ───────────────────────────────────────────────

  /**
   * Send an OIOUBL invoice XML via NemHandel.
   *
   * In production, this would POST the XML to the NemHandel REST API
   * or a Peppol Access Point AS4 endpoint.
   *
   * @param xmlContent - Valid OIOUBL Invoice XML string
   * @param recipientCvr - Recipient CVR number for routing
   * @returns Send result with messageId on success
   */
  async sendInvoice(
    xmlContent: string,
    recipientCvr: string,
  ): Promise<NemHandelSendResult> {
    if (this.simulationMode) {
      return this.simulateSendInvoice(xmlContent, recipientCvr);
    }

    // TODO(REAL_API): POST to NemHandel REST API
    // const response = await fetch(`${this.baseUrl}/invoices`, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/xml',
    //     'Authorization': `Bearer ${this.apiKey}`,
    //     'X-Recipient-CVR': recipientCvr,
    //   },
    //   body: xmlContent,
    // });
    //
    // if (!response.ok) {
    //   const errorBody = await response.text();
    //   return {
    //     success: false,
    //     errorCode: `NEMHANDEL_${response.status}`,
    //     errorMessage: `NemHandel API error: ${response.status} - ${errorBody}`,
    //   };
    // }
    //
    // const responseXml = await response.text();
    // const messageId = extractMessageIdFromResponse(responseXml);
    // return { success: true, messageId, responseXml };

    // Fallback: treat non-simulation as an error (no credentials configured)
    return {
      success: false,
      errorCode: 'NEMHANDEL_NO_CREDENTIALS',
      errorMessage: 'NemHandel API credentials not configured. Set NEMHANDEL_API_KEY environment variable.',
    };
  }

  // ─── CHECK DELIVERY STATUS ──────────────────────────────────────

  /**
   * Check the delivery status of a previously sent invoice.
   *
   * In production, this would GET from the NemHandel REST API using
   * the messageId returned from sendInvoice().
   *
   * @param messageId - The message ID returned from sendInvoice
   * @returns Current delivery status
   */
  async checkDeliveryStatus(messageId: string): Promise<NemHandelDeliveryStatus> {
    if (this.simulationMode) {
      return this.simulateDeliveryStatus(messageId);
    }

    // TODO(REAL_API): GET delivery status from NemHandel REST API
    // const response = await fetch(`${this.baseUrl}/invoices/${messageId}/status`, {
    //   headers: {
    //     'Authorization': `Bearer ${this.apiKey}`,
    //   },
    // });
    //
    // if (!response.ok) {
    //   return {
    //     status: 'FAILED',
    //     rejectionReason: `Failed to check status: ${response.status}`,
    //   };
    // }
    //
    // const data = await response.json();
    // return {
    //   status: mapNemHandelStatus(data.status),
    //   deliveredAt: data.deliveredAt,
    //   rejectionReason: data.rejectionReason,
    // };

    return {
      status: 'FAILED',
      rejectionReason: 'NemHandel API credentials not configured.',
    };
  }

  // ─── REGISTER COMPANY ───────────────────────────────────────────

  /**
   * Register a company in NemHandelsregisteret.
   *
   * In production, this would call the NemHandel registration API
   * with the company's CVR and endpoint ID.
   *
   * @param cvr - Company CVR number
   * @param endpointId - Endpoint ID (e.g., "0184:CVR12345678")
   * @returns Registration number assigned by NemHandelsregisteret
   */
  async registerCompany(cvr: string, endpointId: string): Promise<string> {
    if (this.simulationMode) {
      return this.simulateRegisterCompany(cvr, endpointId);
    }

    // TODO(REAL_API): POST to NemHandelsregisteret registration endpoint
    // const response = await fetch(`${this.baseUrl}/register`, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': `Bearer ${this.apiKey}`,
    //   },
    //   body: JSON.stringify({ cvr, endpointId }),
    // });
    //
    // if (!response.ok) {
    //   throw new Error(`Registration failed: ${response.status} - ${await response.text()}`);
    // }
    //
    // const data = await response.json();
    // return data.registrationNo;

    throw new Error('NemHandel API credentials not configured. Cannot register company.');
  }

  // ─── SIMULATION HELPERS ──────────────────────────────────────────

  /**
   * Simulate sending an invoice — always succeeds after a brief delay.
   * Generates a realistic messageId and a simulated response XML.
   */
  private async simulateSendInvoice(
    xmlContent: string,
    recipientCvr: string,
  ): Promise<NemHandelSendResult> {
    // Simulate network latency (50-200ms)
    await this.simulateLatency(50, 200);

    const messageId = `NEMH-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    // Generate a simulated acknowledgment response XML
    const responseXml = this.generateSimulatedResponseXml(messageId, recipientCvr);

    return {
      success: true,
      messageId,
      responseXml,
    };
  }

  /**
   * Simulate checking delivery status — always returns DELIVERED.
   */
  private async simulateDeliveryStatus(
    messageId: string,
  ): Promise<NemHandelDeliveryStatus> {
    // Simulate network latency (20-100ms)
    await this.simulateLatency(20, 100);

    return {
      status: 'DELIVERED',
      deliveredAt: new Date().toISOString(),
    };
  }

  /**
   * Simulate registering a company — returns a synthetic registration number.
   */
  private async simulateRegisterCompany(
    cvr: string,
    endpointId: string,
  ): Promise<string> {
    // Simulate network latency (100-300ms)
    await this.simulateLatency(100, 300);

    // Generate a realistic registration number format: NH-YYYYMMDD-XXXX
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seqPart = Math.random().toString(36).slice(2, 6).toUpperCase();

    return `NH-${datePart}-${seqPart}`;
  }

  /**
   * Generate a simulated NemHandel acknowledgment response XML.
   * This mimics the structure of a real NemHandel MessageLevelResponse.
   */
  private generateSimulatedResponseXml(messageId: string, recipientCvr: string): string {
    const now = new Date().toISOString();
    return `<?xml version="1.0" encoding="UTF-8"?>
<MessageLevelResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:MessageLevelResponse-2.1"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:ID>${messageId}</cbc:ID>
  <cbc:IssueDate>${now.slice(0, 10)}</cbc:IssueDate>
  <cbc:IssueTime>${now.slice(11, 19)}</cbc:IssueTime>
  <cac:MessageLevelResponseDocumentReference>
    <cbc:ID>${messageId}</cbc:ID>
  </cac:MessageLevelResponseDocumentReference>
  <cac:Response>
    <cbc:ResponseCode>OK</cbc:ResponseCode>
    <cbc:Description>E-faktura modtaget af NemHandel netværket</cbc:Description>
  </cac:Response>
</MessageLevelResponse>`;
  }

  /**
   * Simulate network latency between minMs and maxMs.
   */
  private simulateLatency(minMs: number, maxMs: number): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}

// ─── SINGLETON ────────────────────────────────────────────────────

/** Shared NemHandel client instance (simulation mode by default) */
export const nemHandelClient = new NemHandelClient();
