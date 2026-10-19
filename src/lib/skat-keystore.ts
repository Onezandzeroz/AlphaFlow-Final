/**
 * SKAT RSU B2B Keystore Loader
 *
 * Loads the VOCES3 System (S1) certificate used for mutual TLS (mTLS) and
 * WS-Security XML signing when talking to Skattestyrelsen's NemVirksomhed
 * web service gateway.
 *
 * Supports two credential sources (checked in order):
 *
 *   1. PKCS12 keystore (.p12 / .pfx) — the default VOCES3 delivery format
 *      from MitID Erhverv. Parsed with `node-forge` (pure JS, no openssl).
 *      Env vars: SKAT_KEYSTORE_PATH, SKAT_KEYSTORE_PASSWORD, SKAT_KEY_PASSWORD
 *
 *   2. Separate PEM files — useful when the .p12 has already been split
 *      (e.g. `openssl pkcs12 -in client.p12 -nocerts -out key.pem`).
 *      Env vars: SKAT_CERT_PATH, SKAT_KEY_PATH
 *
 * The truststore (CA bundle to verify SKAT's server certificate during mTLS)
 * is loaded from SKAT_TRUSTSTORE_PATH if set; otherwise Node's default CA
 * store is used. SKAT's test environment uses a private CA, so configuring the
 * truststore is required for the test environment.
 *
 * The parsed credentials are cached for the lifetime of the process.
 *
 * @see https://github.com/skat/rsu-b2b-sample-client-java
 */

import { readFileSync } from 'fs';
import forge from 'node-forge';
import { logger } from '@/lib/logger';

// ─── Types ──────────────────────────────────────────────────────────────

export interface SkatCredentials {
  /** X.509 certificate in PEM format (for xml-crypto signing + https.Agent). */
  certPem: string;
  /** RSA private key in PEM format (for xml-crypto signing). */
  keyPem: string;
  /** Certificate as raw base64 (DER) — for the BinarySecurityToken element. */
  certBase64: string;
  /** PKCS12 buffer for the mTLS https.Agent (`pfx` option). Null when using PEM files. */
  pfxBuffer: Buffer | null;
  /** Passphrase for the PKCS12 / private key. */
  passphrase: string;
  /** CA bundle (PEM) to trust SKAT's server cert, or null to use system CAs. */
  caPem: string | null;
}

export class SkatKeystoreError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'SkatKeystoreError';
    this.code = code;
  }
}

// ─── Cached singleton ───────────────────────────────────────────────────

let cachedCredentials: SkatCredentials | null = null;

// ─── PKCS12 parsing via node-forge ──────────────────────────────────────

/**
 * Parse a PKCS12 (.p12/.pfx) buffer into PEM cert + key using node-forge.
 *
 * VOCES3 certificates from MitID Erhverv store the cert in a `certBag` and
 * the key in a `pkcs8ShrouledKeyBag`. node-forge's `pkcs12FromAsn1` decrypts
 * the shrouded key using the supplied password.
 *
 * If multiple certs are present (e.g. a chain), the first end-entity cert
 * (not a CA) is selected for signing.
 */
function parsePkcs12(pfxBuffer: Buffer, password: string): { certPem: string; keyPem: string } {
  // node-forge works with binary strings, not Buffers
  const derBytes = pfxBuffer.toString('binary');
  const asn1 = forge.asn1.fromDer(derBytes);

  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);
  } catch (err) {
    throw new SkatKeystoreError(
      'PKCS12_DECRYPT_FAILED',
      'Could not decrypt the PKCS12 keystore. Check SKAT_KEYSTORE_PASSWORD / SKAT_KEY_PASSWORD. ' +
        (err instanceof Error ? `(${err.message})` : ''),
    );
  }

  let certPem = '';
  let keyPem = '';

  // OID constants from node-forge
  const oidCertBag = forge.pki.oids.certBag;
  const oidKeyBag = forge.pki.oids.keyBag;
  const oidShroudedKeyBag = forge.pki.oids.pkcs8ShroudedKeyBag;

  for (const safeContents of p12.safeContents) {
    for (const bag of safeContents.safeBags) {
      // Certificate bag
      if (bag.type === oidCertBag && bag.attributes?.cert && !certPem) {
        // Prefer end-entity cert (basicConstraints CA = false), but fall back to first cert
        const cert = bag.attributes.cert as forge.pki.Certificate;
        const isCA = cert.extensions?.some(
          (ext: { name?: string; cA?: boolean }) =>
            ext.name === 'basicConstraints' && ext.cA === true,
        );
        if (!isCA) {
          certPem = forge.pki.certificateToPem(cert);
        } else if (!certPem) {
          // Fallback: use the CA cert if no end-entity cert found yet
          certPem = forge.pki.certificateToPem(cert);
        }
      }

      // Unshrouded key bag
      if (bag.type === oidKeyBag && bag.asn1 && !keyPem) {
        try {
          const privateKey = forge.pki.privateKeyFromAsn1(bag.asn1);
          keyPem = forge.pki.privateKeyToPem(privateKey);
        } catch {
          // ignore — try next bag
        }
      }

      // Shrouded (encrypted) key bag — node-forge already decrypted it via the password
      if (bag.type === oidShroudedKeyBag && !keyPem) {
        // node-forge exposes the decrypted key ASN1 on `bag.asn1` after pkcs12FromAsn1
        if (bag.asn1) {
          try {
            const privateKey = forge.pki.privateKeyFromAsn1(bag.asn1);
            keyPem = forge.pki.privateKeyToPem(privateKey);
          } catch {
            // Some shrouded bags need manual decryption
            try {
              const decryptedPkcs8 = forge.pki.decryptPrivateKeyInfo(bag.asn1, password);
              if (decryptedPkcs8) {
                const privateKey = forge.pki.privateKeyFromAsn1(decryptedPkcs8);
                keyPem = forge.pki.privateKeyToPem(privateKey);
              }
            } catch {
              // ignore
            }
          }
        }
      }
    }
  }

  if (!certPem) {
    throw new SkatKeystoreError(
      'PKCS12_NO_CERTIFICATE',
      'No X.509 certificate found in the PKCS12 keystore. ' +
        'The keystore must contain at least one certificate.',
    );
  }

  if (!keyPem) {
    throw new SkatKeystoreError(
      'PKCS12_NO_PRIVATE_KEY',
      'No RSA private key found in the PKCS12 keystore. ' +
        'The keystore must contain the private key matching the certificate.',
    );
  }

  return { certPem, keyPem };
}

// ─── PEM extraction helper ───────────────────────────────────────────────

/**
 * Strip PEM headers/footers and whitespace to get the raw base64 DER content.
 * Used for the BinarySecurityToken (which is base64-encoded DER, not PEM).
 */
function pemToBase64(pem: string): string {
  return pem
    .replace(/-----BEGIN [A-Z0-9 ]+-----/g, '')
    .replace(/-----END [A-Z0-9 ]+-----/g, '')
    .replace(/\s+/g, '');
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Load the SKAT mTLS credentials from the configured environment variables.
 *
 * Resolution order:
 *   1. SKAT_KEYSTORE_PATH (.p12/.pfx) → parse with node-forge
 *   2. SKAT_CERT_PATH + SKAT_KEY_PATH (PEM files) → read directly
 *
 * The truststore (SKAT_TRUSTSTORE_PATH) is optional; when set, it provides
 * the CA bundle used to verify SKAT's server certificate during mTLS.
 *
 * Results are cached — subsequent calls return the same object.
 *
 * @throws SkatKeystoreError if credentials are missing or the keystore cannot be parsed.
 */
export function loadSkatCredentials(): SkatCredentials {
  if (cachedCredentials) return cachedCredentials;

  const keystorePath = process.env.SKAT_KEYSTORE_PATH || '';
  const certPath = process.env.SKAT_CERT_PATH || '';
  const keyPath = process.env.SKAT_KEY_PATH || '';
  const keystorePassword = process.env.SKAT_KEYSTORE_PASSWORD || '';
  const keyPassword = process.env.SKAT_KEY_PASSWORD || '';
  const truststorePath = process.env.SKAT_TRUSTSTORE_PATH || '';

  let certPem = '';
  let keyPem = '';
  let pfxBuffer: Buffer | null = null;
  let passphrase = '';

  if (keystorePath) {
    // ── Path 1: PKCS12 keystore ──
    logger.info(`[SKAT-Keystore] Loading PKCS12 keystore: ${keystorePath}`);
    try {
      pfxBuffer = readFileSync(keystorePath);
    } catch (err) {
      throw new SkatKeystoreError(
        'KEYSTORE_NOT_READABLE',
        `Could not read keystore file at ${keystorePath}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }

    // VOCES3 .p12 files use a single password for both the keystore and the key.
    // Prefer SKAT_KEY_PASSWORD, fall back to SKAT_KEYSTORE_PASSWORD.
    passphrase = keyPassword || keystorePassword;

    const parsed = parsePkcs12(pfxBuffer, passphrase);
    certPem = parsed.certPem;
    keyPem = parsed.keyPem;
  } else if (certPath && keyPath) {
    // ── Path 2: Separate PEM files ──
    logger.info(`[SKAT-Keystore] Loading PEM cert/key: ${certPath}, ${keyPath}`);
    try {
      certPem = readFileSync(certPath, 'utf8');
    } catch (err) {
      throw new SkatKeystoreError(
        'CERT_NOT_READABLE',
        `Could not read certificate file at ${certPath}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
    try {
      keyPem = readFileSync(keyPath, 'utf8');
    } catch (err) {
      throw new SkatKeystoreError(
        'KEY_NOT_READABLE',
        `Could not read private key file at ${keyPath}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
    passphrase = keyPassword;
  } else {
    throw new SkatKeystoreError(
      'NO_CREDENTIALS_CONFIGURED',
      'No SKAT credentials configured. Set either SKAT_KEYSTORE_PATH (PKCS12 .p12/.pfx) ' +
        'or both SKAT_CERT_PATH + SKAT_KEY_PATH (PEM files). ' +
        'See docs/SKAT-setup.md for onboarding instructions.',
    );
  }

  // Validate the PEM looks correct
  if (!certPem.includes('BEGIN CERTIFICATE')) {
    throw new SkatKeystoreError(
      'INVALID_CERTIFICATE',
      'The certificate does not appear to be a valid PEM-encoded X.509 certificate.',
    );
  }
  if (!keyPem.includes('PRIVATE KEY')) {
    throw new SkatKeystoreError(
      'INVALID_PRIVATE_KEY',
      'The private key does not appear to be a valid PEM-encoded RSA/EC private key.',
    );
  }

  // Optional truststore (CA bundle for verifying SKAT's server cert)
  let caPem: string | null = null;
  if (truststorePath) {
    try {
      caPem = readFileSync(truststorePath, 'utf8');
      logger.info(`[SKAT-Keystore] Loaded truststore: ${truststorePath}`);
    } catch (err) {
      logger.warn(
        `[SKAT-Keystore] Could not read truststore at ${truststorePath}: ` +
          (err instanceof Error ? err.message : String(err)) +
          '. Falling back to system CA store.',
      );
    }
  }

  const certBase64 = pemToBase64(certPem);

  cachedCredentials = {
    certPem,
    keyPem,
    certBase64,
    pfxBuffer,
    passphrase,
    caPem,
  };

  logger.info(
    `[SKAT-Keystore] Credentials loaded (cert: ${certBase64.length} bytes base64, ` +
      `keystore: ${pfxBuffer ? 'PKCS12' : 'PEM'}, truststore: ${caPem ? 'yes' : 'system CA'})`,
  );

  return cachedCredentials;
}

/**
 * Check whether SKAT credentials are configured WITHOUT throwing.
 * Used by hasSkatCredentials() to decide between live + simulation mode.
 */
export function isSkatCredentialsConfigured(): boolean {
  const keystorePath = process.env.SKAT_KEYSTORE_PATH || '';
  const certPath = process.env.SKAT_CERT_PATH || '';
  const keyPath = process.env.SKAT_KEY_PATH || '';
  return !!(keystorePath || (certPath && keyPath));
}

/**
 * Reset the credential cache. Primarily for testing or hot-reloading after
 * a keystore rotation.
 */
export function resetSkatCredentialCache(): void {
  cachedCredentials = null;
}
