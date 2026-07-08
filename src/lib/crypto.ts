/**
 * AlphaFlow — AES-256-GCM Encryption Module (with Key Rotation Support)
 *
 * Server-side only. Used to encrypt sensitive data at rest, specifically
 * bank access tokens and refresh tokens stored in the BankConnection model,
 * TOTP 2FA secrets, and backup files.
 *
 * DESIGN:
 * - Algorithm: AES-256-GCM (authenticated encryption with associated data)
 * - IV: 12 bytes (96 bits) — NIST recommended for GCM mode
 * - Auth tag: 16 bytes (128 bits) — standard GCM tag length
 * - Key: 32 bytes (256 bits) — managed via keyring.ts
 *
 * KEY ROTATION (U-1):
 * - All new encryptions use the CURRENT key (from keyring)
 * - Ciphertext is self-describing: `v{N}:iv:authTag:ciphertext`
 * - Decryption auto-detects version and uses the correct key
 * - No version prefix = version 1 (backward compatible with pre-rotation data)
 * - Keyring supports multiple versions for seamless rotation
 *
 * STRING FORMAT:
 *   `v{N}:iv_base64:authTag_base64:ciphertext_base64`
 *   N = key version number (1, 2, 3, ...)
 *   No prefix = version 1 (legacy pre-rotation data)
 *
 * FILE FORMAT (backups):
 *   [12 bytes IV] [16 bytes authTag] [N bytes ciphertext]
 *   Version tracked via Backup.encryptionKeyVersion column in DB
 *   decryptFile() accepts optional keyVersion parameter
 *
 * Security properties:
 * - Each encryption uses a unique random IV (no IV reuse)
 * - GCM provides both confidentiality AND integrity verification
 * - Tampered ciphertext is rejected during decryption
 * - Keys are never stored in the database — only in environment variables
 *
 * @module crypto
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import fs from 'fs';
import { rmSync } from 'fs';
import {
  getCurrentKey,
  getKeyForVersion,
  getCurrentKeyVersion,
  extractVersion,
  isVersioned,
  generateEncryptionKey,
} from './keyring';

// ─── Constants ───────────────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;        // 96 bits — NIST SP 800-38D recommended
const AUTH_TAG_LENGTH = 16;  // 128 bits — standard GCM authentication tag

// ─── Encrypt / Decrypt (DB Strings) ─────────────────────────────────────────

/**
 * Encrypt a plaintext string using AES-256-GCM with the CURRENT key.
 *
 * Output format: `v{N}:iv:authTag:ciphertext` (all base64, colon-separated)
 * where N is the current key version from the keyring.
 *
 * @param plaintext - The string to encrypt (e.g., an OAuth access token)
 * @returns A versioned encrypted string
 *
 * @example
 * const encrypted = encrypt('my-secret-token');
 * // => "v1:dGhpcyBpcyAxMic=:aWV3OW1WY1R6R0c=:eW91cl9lbmNyeXB0ZWRfZGF0YQ=="
 */
export function encrypt(plaintext: string): string {
  const key = getCurrentKey();
  const version = getCurrentKeyVersion();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: v{N}:iv:authTag:ciphertext (all base64)
  return `v${version}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 *
 * Automatically detects the key version from the ciphertext prefix
 * and uses the correct key from the keyring.
 *
 * - `v{N}:iv:authTag:ciphertext` → decrypts with key version N
 * - `iv:authTag:ciphertext` (no prefix) → decrypts with version 1 (backward compat)
 *
 * @param encrypted - The encrypted string
 * @returns The original plaintext string
 * @throws Error if decryption fails (wrong key, tampered data, invalid format, or key version missing)
 */
export function decrypt(encrypted: string): string {
  // Extract version and strip prefix
  const version = extractVersion(encrypted);
  const key = getKeyForVersion(version);

  // Strip version prefix if present
  const payload = isVersioned(encrypted)
    ? encrypted.slice(encrypted.indexOf(':') + 1)
    : encrypted;

  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error(
      'Invalid encrypted data format. Expected "iv:authTag:ciphertext" with 3 colon-separated base64 parts.'
    );
  }

  const [ivB64, authTagB64, ciphertextB64] = parts;

  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes, got ${iv.length}`);
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH} bytes, got ${authTag.length}`);
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Encrypt a nullable value. Returns null if input is null/undefined.
 * Uses the current key from the keyring.
 */
export function encryptOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  return encrypt(value);
}

/**
 * Decrypt a nullable value. Returns null if input is null/undefined.
 * Returns empty string if decryption yields empty result.
 * Auto-detects key version from ciphertext prefix.
 */
export function decryptOrNull(value: string | null | undefined): string {
  if (!value) return '';
  return decrypt(value);
}

/**
 * Check if a stored value looks like it was encrypted with AES-256-GCM.
 *
 * Detects both formats:
 * - Versioned: `v{N}:base64:base64:base64` (4 colon-separated parts)
 * - Legacy:    `base64:base64:base64` (3 colon-separated parts)
 *
 * Legacy base64-encoded tokens do NOT contain colons, so this check
 * reliably distinguishes encrypted from unencrypted data.
 *
 * @param value - The stored value to check
 * @returns true if the value appears to be AES-256-GCM encrypted
 */
export function isEncrypted(value: string | null | undefined): boolean {
  if (!value) return false;
  const parts = value.split(':');
  // Versioned format: v{N}:iv:authTag:ciphertext → 4 parts
  // Legacy format: iv:authTag:ciphertext → 3 parts
  if (parts.length === 4 && /^v\d+$/.test(parts[0])) return true;
  if (parts.length === 3) return parts.every(p => p.length > 0);
  return false;
}

/**
 * Migrate a legacy base64-encoded token to AES-256-GCM encrypted format.
 * If the value is already encrypted (with or without version prefix),
 * returns it unchanged. If the value is null/empty, returns null.
 *
 * Use this to upgrade existing bank tokens in the database.
 *
 * @param value - The stored value (may be base64 or already encrypted)
 * @returns The AES-256-GCM encrypted value (with version prefix), or null
 */
export function migrateBase64Token(value: string | null | undefined): string | null {
  if (!value) return null;
  if (isEncrypted(value)) return value;

  // Legacy format: raw base64-encoded plaintext
  try {
    const plaintext = Buffer.from(value, 'base64').toString('utf8');
    return encrypt(plaintext);
  } catch {
    // If base64 decode fails, the value might be plaintext — encrypt it directly
    return encrypt(value);
  }
}

/**
 * Generate a new random encryption key (re-exported from keyring).
 * @returns A 64-character hex string (32 bytes / 256 bits)
 */
export { generateEncryptionKey };

/**
 * Re-export keyring functions for caller convenience.
 * Callers that need to set encryptionKeyVersion on DB records
 * should use getCurrentKeyVersion().
 */
export { getCurrentKeyVersion, getKeyringInfo } from './keyring';

// ─── File Encryption (Backup Files) ─────────────────────────────────────────

/**
 * Encrypt a file using AES-256-GCM with the CURRENT key.
 *
 * File format (binary, NO version byte — version tracked via DB column):
 *   [12 bytes IV] [16 bytes authTag] [N bytes ciphertext]
 *
 * The IV and authTag are prepended as raw bytes (not base64) for efficient
 * streaming during decryption.
 *
 * IMPORTANT: The caller MUST set `encryptionKeyVersion: getCurrentKeyVersion()`
 * on the corresponding Backup record in the database.
 *
 * @param inputPath - Path to the unencrypted file (e.g., backup.zip)
 * @returns Path to the encrypted file (e.g., backup.zip.enc)
 * @throws Error if ENCRYPTION_KEY is not set or file operations fail
 */
export function encryptFile(inputPath: string): string {
  const key = getCurrentKey();
  const iv = randomBytes(IV_LENGTH);

  const inputBuffer = fs.readFileSync(inputPath);

  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([cipher.update(inputBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: IV (12 bytes) + authTag (16 bytes) + ciphertext
  // NOTE: No version byte in file — version tracked via Backup.encryptionKeyVersion column
  const outputBuffer = Buffer.concat([iv, authTag, encrypted]);

  const encPath = inputPath + '.enc';
  fs.writeFileSync(encPath, outputBuffer);

  // Securely delete the unencrypted original
  rmSync(inputPath, { force: true });

  return encPath;
}

/**
 * Decrypt a backup file that was encrypted with AES-256-GCM.
 *
 * IMPORTANT: The caller should pass the `encryptionKeyVersion` from the
 * Backup record in the database. If not provided, defaults to the current key.
 *
 * @param encPath - Path to the encrypted file (e.g., backup.zip.enc)
 * @param keyVersion - Key version used to encrypt this file (from Backup.encryptionKeyVersion)
 * @returns Path to a temporary decrypted file (e.g., backup.zip.tmp)
 * @throws Error if key is not available, decryption fails, or file is tampered
 */
export function decryptFile(encPath: string, keyVersion?: number): string {
  // Use provided version, or fall back to current version for backward compat
  const version = keyVersion ?? getCurrentKeyVersion();
  const key = getKeyForVersion(version);
  const encBuffer = fs.readFileSync(encPath);

  // Minimum size: IV (12) + authTag (16) + at least 1 byte ciphertext
  if (encBuffer.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error(
      'Encrypted file is too small to be valid. ' +
      `Expected at least ${IV_LENGTH + AUTH_TAG_LENGTH + 1} bytes, got ${encBuffer.length}.`
    );
  }

  // Parse: IV (12 bytes) + authTag (16 bytes) + ciphertext
  const iv = encBuffer.subarray(0, IV_LENGTH);
  const authTag = encBuffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = encBuffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  // Write to temp file for JSZip to read
  const tempPath = encPath.replace('.zip.enc', '.zip.tmp');
  fs.writeFileSync(tempPath, decrypted);

  return tempPath;
}