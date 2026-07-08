/**
 * AlphaFlow — Encryption Keyring Module
 *
 * Manages encryption key versions for seamless key rotation.
 * Supports multiple key versions simultaneously — old keys for decryption,
 * current key for encryption. This enables zero-downtime rotation.
 *
 * ENV VARS:
 *   ENCRYPTION_KEY          — The CURRENT active key (used for all new encryptions)
 *   ENCRYPTION_KEY_PREVIOUS — Previous key(s), comma-separated (for decrypting legacy data)
 *   CURRENT_KEY_VERSION     — Version number of ENCRYPTION_KEY (default: 1)
 *
 * ROTATION PROCEDURE:
 *   1. Generate a new key: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *   2. Set ENCRYPTION_KEY_PREVIOUS=$ENCRYPTION_KEY  (move current → previous)
 *   3. Set ENCRYPTION_KEY=<new key>
 *   4. Set CURRENT_KEY_VERSION=2
 *   5. Restart the application
 *   6. Run: bun run scripts/rotate-encryption-keys.ts  (re-encrypt all data)
 *   7. After verification, remove ENCRYPTION_KEY_PREVIOUS and restart
 *
 * CIPHERTEXT FORMAT (DB strings):
 *   v{N}:iv_base64:authTag_base64:ciphertext_base64
 *   - No prefix = version 1 (backward compatible with pre-rotation data)
 *
 * FILE FORMAT (backups):
 *   No version byte in file — version tracked via Backup.encryptionKeyVersion column
 *
 * @module keyring
 */

import { randomBytes, createHash } from 'crypto';

// ─── Constants ───────────────────────────────────────────────────────────────

const KEY_LENGTH = 32; // 256 bits

// ─── Types ───────────────────────────────────────────────────────────────────

export interface KeyringInfo {
  currentVersion: number;
  availableVersions: number[];
  currentKeyFingerprint: string; // First 8 hex chars of SHA-256(key) for audit
}

// ─── Cache ───────────────────────────────────────────────────────────────────

let cachedKeyring: Map<number, Buffer> | null = null;
let cachedCurrentVersion: number | null = null;

/**
 * Invalidate the in-memory keyring cache.
 * Called after key rotation env var changes (requires process restart,
 * but this is available for testing or dynamic reload scenarios).
 */
export function invalidateKeyringCache(): void {
  cachedKeyring = null;
  cachedCurrentVersion = null;
}

// ─── Key Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse a hex-encoded key string into a 32-byte Buffer.
 * @throws Error if key is missing or has wrong length
 */
function parseKey(hexKey: string, label: string): Buffer {
  const key = Buffer.from(hexKey.trim(), 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `${label} must be exactly ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex characters). ` +
      `Got ${key.length} bytes.`
    );
  }
  return key;
}

/**
 * Compute a short fingerprint of a key for audit/logging.
 * SHA-256 of the key, first 8 hex chars. NOT the key itself.
 */
function keyFingerprint(key: Buffer): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 8);
}

// ─── Keyring Loading ─────────────────────────────────────────────────────────

/**
 * Load and validate the keyring from environment variables.
 * Results are cached for performance.
 *
 * The keyring map contains:
 *   - CURRENT_KEY_VERSION → ENCRYPTION_KEY
 *   - (CURRENT_KEY_VERSION - 1) → first entry of ENCRYPTION_KEY_PREVIOUS
 *   - etc. for comma-separated previous keys
 *
 * @throws Error if ENCRYPTION_KEY is not set or invalid
 */
export function loadKeyring(): Map<number, Buffer> {
  if (cachedKeyring) return cachedKeyring;

  const keyring = new Map<number, Buffer>();
  const currentVersion = getCurrentKeyVersion();

  // Parse current key
  const currentKeyHex = process.env.ENCRYPTION_KEY;
  if (!currentKeyHex) {
    throw new Error(
      'CRITICAL: ENCRYPTION_KEY environment variable is not set. ' +
      'Generate a key with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  const currentKey = parseKey(currentKeyHex, 'ENCRYPTION_KEY');
  keyring.set(currentVersion, currentKey);

  // Parse previous key(s) if provided
  const previousKeysRaw = process.env.ENCRYPTION_KEY_PREVIOUS;
  if (previousKeysRaw) {
    const previousKeys = previousKeysRaw.split(',').map(k => k.trim()).filter(k => k.length > 0);
    // Previous keys are assigned to versions (currentVersion - 1), (currentVersion - 2), etc.
    for (let i = 0; i < previousKeys.length; i++) {
      const version = currentVersion - 1 - i;
      if (version < 1) break; // Don't assign version 0 or negative
      keyring.set(version, parseKey(previousKeys[i], `ENCRYPTION_KEY_PREVIOUS[${i}]`));
    }
  }

  cachedKeyring = keyring;
  return keyring;
}

// ─── Key Access ──────────────────────────────────────────────────────────────

/**
 * Get the current key version number.
 * Defaults to 1 if CURRENT_KEY_VERSION is not set.
 */
export function getCurrentKeyVersion(): number {
  if (cachedCurrentVersion !== null) return cachedCurrentVersion;

  const version = parseInt(process.env.CURRENT_KEY_VERSION || '1', 10);
  if (isNaN(version) || version < 1) {
    throw new Error(
      `CURRENT_KEY_VERSION must be a positive integer. Got: "${process.env.CURRENT_KEY_VERSION}"`
    );
  }

  cachedCurrentVersion = version;
  return version;
}

/**
 * Get the encryption key for a specific version.
 * Used by the crypto module for both encrypt (current) and decrypt (any known version).
 *
 * @param version - Key version number
 * @returns The 32-byte key buffer
 * @throws Error if the requested version is not in the keyring
 */
export function getKeyForVersion(version: number): Buffer {
  const keyring = loadKeyring();
  const key = keyring.get(version);
  if (!key) {
    const currentVersion = getCurrentKeyVersion();
    throw new Error(
      `No encryption key found for version ${version}. ` +
      `Available versions: [${Array.from(keyring.keys()).sort().join(', ')}]. ` +
      `Current version: ${currentVersion}. ` +
      `Set ENCRYPTION_KEY_PREVIOUS to include the key for version ${version}.`
    );
  }
  return key;
}

/**
 * Get the current (latest) encryption key.
 * Shorthand for getKeyForVersion(getCurrentKeyVersion()).
 */
export function getCurrentKey(): Buffer {
  return getKeyForVersion(getCurrentKeyVersion());
}

/**
 * Extract the key version from a versioned ciphertext string.
 *
 * Format: `v{N}:iv:authTag:ciphertext` → N
 * Format: `iv:authTag:ciphertext` (no prefix) → 1 (backward compat)
 *
 * @param encrypted - The encrypted string
 * @returns The key version number
 */
export function extractVersion(encrypted: string): number {
  const match = encrypted.match(/^v(\d+):/);
  if (match) {
    return parseInt(match[1], 10);
  }
  // No version prefix → assume version 1 (pre-rotation data)
  return 1;
}

/**
 * Get keyring diagnostic info for health checks and audit.
 */
export function getKeyringInfo(): KeyringInfo {
  const keyring = loadKeyring();
  const currentVersion = getCurrentKeyVersion();
  const currentKey = keyring.get(currentVersion);

  return {
    currentVersion,
    availableVersions: Array.from(keyring.keys()).sort(),
    currentKeyFingerprint: currentKey ? keyFingerprint(currentKey) : 'N/A',
  };
}

/**
 * Check if a value appears to be a versioned ciphertext.
 * Versioned values start with `v{digits}:`.
 */
export function isVersioned(encrypted: string): boolean {
  return /^v\d+:/.test(encrypted);
}

/**
 * Generate a new random encryption key (256 bits).
 * @returns 64-character hex string
 */
export function generateEncryptionKey(): string {
  return randomBytes(KEY_LENGTH).toString('hex');
}