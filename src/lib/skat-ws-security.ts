/**
 * SKAT RSU B2B WS-Security Signing
 *
 * Produces a SOAP envelope with a WS-Security header containing:
 *   - `<wsse:BinarySecurityToken>` — the X.509 VOCES3 certificate (base64 DER)
 *   - `<wsu:Timestamp>` — Created + Expires (5-minute validity window)
 *   - `<ds:Signature>` — XML-DSig signature over Timestamp + Body + BinarySecurityToken
 *
 * This mirrors the Apache CXF + WSS4J configuration in Skattestyrelsen's
 * Java sample client (rsu-policy-sign-classpath.xml):
 *   - action          = "Timestamp Signature"
 *   - signatureAlgorithm = http://www.w3.org/2000/09/xmldsig#rsa-sha1
 *   - canonicalization   = http://www.w3.org/2001/10/xml-exc-c14n#
 *   - digestAlgorithm    = http://www.w3.org/2000/09/xmldsig#sha1
 *   - signatureKeyIdentifier = DirectReference (BST in the header)
 *   - signed parts = Timestamp, Body, BinarySecurityToken
 *
 * The signing is performed with `xml-crypto` (v6+).
 *
 * @see https://github.com/skat/rsu-b2b-sample-client-java (src/main/resources/rsu-policy-sign-classpath.xml)
 * @see the complete signed sample: assets/full-sample-request.xml
 */

import { randomUUID } from 'crypto';
import { SignedXml } from 'xml-crypto';
import { logger } from '@/lib/logger';
import type { SkatCredentials } from '@/lib/skat-keystore';

// ─── WS-Security namespace constants ────────────────────────────────────

const NS_WSSE =
  'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';
const NS_WSU =
  'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd';
const NS_DS = 'http://www.w3.org/2000/09/xmldsig#';

const BST_ENCODING =
  'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary';
const BST_VALUE_TYPE =
  'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3';

// Canonicalization + digest algorithm URIs (must match the Java client policy)
const ALGO_EXC_C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const ALGO_RSA_SHA1 = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
const ALGO_SHA1 = 'http://www.w3.org/2000/09/xmldsig#sha1';

/** Validity window for the Timestamp. SKAT accepts 5 minutes. */
const TIMESTAMP_TTL_SECONDS = 300;

export class SkatSignatureError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'SkatSignatureError';
    this.code = code;
  }
}

// ─── Timestamp helper ────────────────────────────────────────────────────

/**
 * Generate the WS-Security Timestamp element (Created + Expires).
 * Both are UTC ISO-8601 with milliseconds + 'Z' suffix, matching the SKAT sample.
 */
function buildTimestampXml(timestampId: string): { xml: string; created: string } {
  const now = new Date();
  const expires = new Date(now.getTime() + TIMESTAMP_TTL_SECONDS * 1000);

  const fmt = (d: Date) => d.toISOString();
  const created = fmt(now);
  const expiresStr = fmt(expires);

  const xml =
    `<wsu:Timestamp xmlns:wsu="${NS_WSU}" wsu:Id="${timestampId}">` +
    `<wsu:Created>${created}</wsu:Created>` +
    `<wsu:Expires>${expiresStr}</wsu:Expires>` +
    `</wsu:Timestamp>`;

  return { xml, created };
}

// ─── BinarySecurityToken ────────────────────────────────────────────────

/**
 * Build the `<wsse:BinarySecurityToken>` element holding the X.509 cert.
 * The cert is inserted as raw base64 DER (no PEM headers).
 */
function buildBinarySecurityTokenXml(tokenId: string, certBase64: string): string {
  return (
    `<wsse:BinarySecurityToken xmlns:wsse="${NS_WSSE}" xmlns:wsu="${NS_WSU}" ` +
    `EncodingType="${BST_ENCODING}" ` +
    `ValueType="${BST_VALUE_TYPE}" ` +
    `wsu:Id="${tokenId}">${certBase64}</wsse:BinarySecurityToken>`
  );
}

// ─── Security header assembly ────────────────────────────────────────────

/**
 * Insert the BinarySecurityToken + Timestamp into the SOAP envelope's
 * `<wsse:Security>` header (which must already exist as an empty placeholder).
 *
 * Returns the envelope with the populated Security header, ready for signing.
 */
function injectSecurityHeaderContents(
  envelopeXml: string,
  tokenId: string,
  timestampId: string,
  certBase64: string,
): { xml: string; created: string } {
  const bstXml = buildBinarySecurityTokenXml(tokenId, certBase64);
  const { xml: tsXml, created } = buildTimestampXml(timestampId);

  // The envelope builder leaves a marker: <wsse:Security soap:mustUnderstand="1"></wsse:Security>
  // Insert the BST + Timestamp inside it. The Signature is added later by xml-crypto.
  const populatedXml = envelopeXml.replace(
    /(<wsse:Security\b[^>]*>\s*)(<\/wsse:Security>)/,
    `$1${bstXml}${tsXml}$2`,
  );

  if (populatedXml === envelopeXml) {
    throw new SkatSignatureError(
      'SECURITY_HEADER_NOT_FOUND',
      'The unsigned envelope has no <wsse:Security> placeholder to populate. ' +
        'The envelope builder must include an empty <wsse:Security> element in the SOAP header.',
    );
  }

  return { xml: populatedXml, created };
}

// ─── Custom KeyInfo provider (SecurityTokenReference / DirectReference) ──

/**
 * xml-crypto's default KeyInfo emits `<X509Data><X509Certificate>`.
 * SKAT requires a WS-Security `<wsse:SecurityTokenReference>` pointing back
 * to the BinarySecurityToken via a `<wsse:Reference URI="#X509-...">`.
 *
 * This callback returns the STR XML that xml-crypto wraps in `<ds:KeyInfo>`.
 */
function makeKeyInfoContent(tokenId: string, strId: string, keyInfoId: string) {
  return function getKeyInfoContent(): string {
    return (
      `<wsse:SecurityTokenReference xmlns:wsse="${NS_WSSE}" xmlns:wsu="${NS_WSU}" wsu:Id="${strId}">` +
      `<wsse:Reference URI="#${tokenId}" ValueType="${BST_VALUE_TYPE}"/>` +
      `</wsse:SecurityTokenReference>`
    );
  };
}

// ─── Main signing function ──────────────────────────────────────────────

/**
 * Sign a SOAP envelope with WS-Security for SKAT.
 *
 * The input `unsignedEnvelopeXml` must contain:
 *   - An empty `<wsse:Security soap:mustUnderstand="1"></wsse:Security>` header
 *   - A `<soap:Body>` with a `wsu:Id` attribute (so it can be referenced)
 *
 * This function:
 *   1. Inserts the BinarySecurityToken + Timestamp into the Security header
 *   2. Computes an XML-DSig signature over Timestamp + Body + BinarySecurityToken
 *      using rsa-sha1 + exclusive canonicalization + sha1 digests
 *   3. Inserts the Signature element into the Security header
 *
 * The output is a complete, SKAT-compliant signed SOAP envelope ready to be
 * sent over a mutual-TLS HTTPS connection.
 *
 * @param unsignedEnvelopeXml - The SOAP envelope with empty Security header + wsu:Id'd Body
 * @param credentials - The loaded VOCES3 credentials (cert + key in PEM)
 * @returns The fully signed SOAP envelope XML
 * @throws SkatSignatureError if signing fails
 */
export function signSoapEnvelope(
  unsignedEnvelopeXml: string,
  credentials: SkatCredentials,
): string {
  // Generate unique IDs for all signed elements (UUIDs match the SKAT sample format)
  const tokenId = `X509-${randomUUID()}`;
  const timestampId = `TS-${randomUUID()}`;
  const signatureId = `SIG-${randomUUID()}`;
  const keyInfoId = `KI-${randomUUID()}`;
  const strId = `STR-${randomUUID()}`;

  // The Body's wsu:Id is already in the envelope (set by the builder).
  // Extract it so we can reference it explicitly.
  const bodyIdMatch = unsignedEnvelopeXml.match(
    /<soap:Body\b[^>]*wsu:Id="([^"]+)"/,
  );
  if (!bodyIdMatch) {
    throw new SkatSignatureError(
      'BODY_ID_NOT_FOUND',
      'The unsigned envelope <soap:Body> must have a wsu:Id attribute so it can be signed.',
    );
  }
  const bodyId = bodyIdMatch[1];

  // Step 1: populate the Security header with BinarySecurityToken + Timestamp
  const { xml: populatedXml, created } = injectSecurityHeaderContents(
    unsignedEnvelopeXml,
    tokenId,
    timestampId,
    credentials.certBase64,
  );

  logger.debug(
    `[SKAT-WS-Security] Signing envelope: tokenId=${tokenId}, bodyId=${bodyId}, ` +
      `tsId=${timestampId}, created=${created}`,
  );

  // Step 2: configure the XML-DSig signer
  const sig = new SignedXml({
    privateKey: credentials.keyPem,
    publicCert: credentials.certPem,
    signatureAlgorithm: ALGO_RSA_SHA1,
    canonicalizationAlgorithm: ALGO_EXC_C14N,
    // WS-Security mode: resolve references by wsu:Id
    idMode: 'wssecurity',
    // Custom KeyInfo → SecurityTokenReference (DirectReference to the BST)
    getKeyInfoContent: makeKeyInfoContent(tokenId, strId, keyInfoId),
    // Add Id attribute to the <ds:KeyInfo> element
    keyInfoAttributes: { Id: keyInfoId },
  });

  // Step 3: add the 3 references (Timestamp, Body, BinarySecurityToken).
  // Each uses exclusive C14N transform + SHA-1 digest, matching the SKAT policy.
  // The xpath selects the element by its wsu:Id value (namespace-agnostic match).
  const refOpts = {
    transforms: [ALGO_EXC_C14N] as ReadonlyArray<string>,
    digestAlgorithm: ALGO_SHA1,
  };

  sig.addReference({
    xpath: `//*[local-name()='Timestamp' and @*[local-name()='Id']='${timestampId}']`,
    uri: `#${timestampId}`,
    ...refOpts,
  });

  sig.addReference({
    xpath: `//*[local-name()='Body' and @*[local-name()='Id']='${bodyId}']`,
    uri: `#${bodyId}`,
    ...refOpts,
  });

  sig.addReference({
    xpath: `//*[local-name()='BinarySecurityToken' and @*[local-name()='Id']='${tokenId}']`,
    uri: `#${tokenId}`,
    ...refOpts,
  });

  // Step 4: compute the signature and insert it into the <wsse:Security> header.
  // The Signature element is appended after the Timestamp (matching the sample).
  try {
    sig.computeSignature(populatedXml, {
      prefix: 'ds',
      attrs: { Id: signatureId },
      existingPrefixes: {
        ds: NS_DS,
        wsse: NS_WSSE,
        wsu: NS_WSU,
        soap: 'http://schemas.xmlsoap.org/soap/envelope/',
      },
      location: {
        // Insert the Signature as the last child of <wsse:Security>
        reference: `//*[local-name()='Security']`,
        action: 'append',
      },
    });
  } catch (err) {
    throw new SkatSignatureError(
      'SIGNATURE_COMPUTATION_FAILED',
      'Failed to compute the XML-DSig signature: ' +
        (err instanceof Error ? err.message : String(err)),
    );
  }

  const signedXml = sig.getSignedXml();

  if (!signedXml || signedXml.length === 0) {
    throw new SkatSignatureError(
      'SIGNATURE_EMPTY',
      'xml-crypto returned an empty signature. The envelope could not be signed.',
    );
  }

  logger.info(
    `[SKAT-WS-Security] Envelope signed: signatureId=${signatureId}, ` +
      `size=${signedXml.length} bytes, 3 references (Timestamp, Body, BST)`,
  );

  return signedXml;
}
