/**
 * AlphaFlow — Two-Factor Authentication (TOTP) Module
 *
 * Server-side only. Implements Time-based One-Time Password (TOTP) 2FA
 * using the otplib library. Secrets are encrypted at rest using AES-256-GCM
 * (via the existing crypto.ts module).
 *
 * Features:
 * - TOTP secret generation (RFC 6238 compatible)
 * - QR code generation for authenticator apps
 * - TOTP code verification with configurable time window
 * - Backup code generation (10 single-use codes)
 * - All secrets encrypted at rest via crypto.ts
 *
 * Design decisions:
 * - TOTP algorithm: SHA-1 (standard for authenticator apps like Google Auth, Authy)
 * - Secret encoding: base32 (RFC 3548) — standard for TOTP
 * - Time step: 30 seconds (standard)
 * - Code length: 6 digits
 * - Valid window: 1 step before/after (tolerance for clock drift)
 * - Backup codes: 10 random 8-character alphanumeric codes, hashed with SHA-256
 */

import { generateSecret, generateURI, generate, verifySync } from 'otplib';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { encrypt, decrypt, isEncrypted } from './crypto';

// ─── Constants ────────────────────────────────────────────────────────

/** Issuer name shown in authenticator apps */
export const TOTP_ISSUER = 'AlphaFlow';

/** Number of backup codes generated */
const BACKUP_CODE_COUNT = 10;

/** Length of each backup code */
const BACKUP_CODE_LENGTH = 8;

/** Characters used in backup codes */
const BACKUP_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // Removed ambiguous chars: 0/O, I/1/L

// ─── TOTP Secret Management ──────────────────────────────────────────

/**
 * Generate a new TOTP secret (unencrypted, base32-encoded).
 *
 * The secret is 160 bits (20 bytes) = 32 base32 characters.
 *
 * @returns Base32-encoded secret string
 */
export function generateTOTPSecret(): string {
  return generateSecret();
}

/**
 * Encrypt a TOTP secret for database storage.
 *
 * Uses the existing AES-256-GCM encryption from crypto.ts.
 *
 * @param secret - Plain text base32-encoded TOTP secret
 * @returns Encrypted string suitable for database storage
 */
export function encryptSecret(secret: string): string {
  return encrypt(secret);
}

/**
 * Decrypt a TOTP secret from database storage.
 *
 * @param encryptedSecret - AES-256-GCM encrypted secret string
 * @returns Plain text base32-encoded TOTP secret
 */
export function decryptSecret(encryptedSecret: string): string {
  return decrypt(encryptedSecret);
}

/**
 * Check if a stored secret is encrypted.
 * Used for migration detection.
 */
export function isSecretEncrypted(secret: string | null | undefined): boolean {
  return isEncrypted(secret);
}

// ─── TOTP Code Operations ─────────────────────────────────────────────

/**
 * Generate a QR code data URL for an authenticator app.
 *
 * The QR code encodes an otpauth:// URI with the TOTP configuration.
 * Compatible with Google Authenticator, Authy, 1Password, Microsoft Authenticator, etc.
 *
 * @param email - User's email address
 * @param secret - Plain text base32-encoded TOTP secret
 * @returns Promise resolving to a data:image/png;base64,... URL
 */
export async function generateQRCodeDataURL(email: string, secret: string): Promise<string> {
  const otpauth = generateURI({ issuer: TOTP_ISSUER, label: email, secret });

  return QRCode.toDataURL(otpauth, {
    width: 280,
    margin: 2,
    color: {
      dark: '#0f766e',   // teal-700
      light: '#ffffff',
    },
    errorCorrectionLevel: 'M',
  });
}

/**
 * Verify a TOTP code against a secret.
 *
 * Uses a time window of ±1 step (30 seconds) to account for clock drift.
 *
 * @param secret - Plain text base32-encoded TOTP secret
 * @param code - 6-digit code from the user's authenticator app
 * @returns true if the code is valid within the time window
 */
export function verifyTOTP(secret: string, code: string): boolean {
  try {
    // epochTolerance: 30 = ±1 step (30s each), same as old window: 1
    const result = verifySync({ token: code, secret, epochTolerance: 30 });
    return result.valid === true;
  } catch {
    return false;
  }
}

/**
 * Get the current TOTP code for a secret (for testing/debugging only).
 *
 * ⚠️ NEVER use this in production code — only for development/testing.
 *
 * @param secret - Plain text base32-encoded TOTP secret
 * @returns Current 6-digit TOTP code
 */
export async function getCurrentTOTP(secret: string): Promise<string> {
  return await generate({ secret });
}

// ─── Backup Codes ─────────────────────────────────────────────────────

/**
 * Generate a set of backup codes (plain text).
 *
 * Generates BACKUP_CODE_COUNT random codes of BACKUP_CODE_LENGTH characters.
 * Uses unambiguous characters only (no 0/O, I/1/L).
 *
 * @returns Array of plain text backup codes
 */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    let code = '';
    const chars = BACKUP_CODE_CHARS;
    for (let j = 0; j < BACKUP_CODE_LENGTH; j++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    codes.push(code);
  }
  return codes;
}

/**
 * Hash a backup code for secure storage.
 *
 * Uses SHA-256 with a fixed application salt to prevent rainbow table attacks.
 *
 * @param code - Plain text backup code
 * @returns SHA-256 hash (hex string)
 */
export function hashBackupCode(code: string): string {
  const salted = `alphaflow-2fa-backup:${code}`;
  return crypto.createHash('sha256').update(salted).digest('hex');
}

/**
 * Verify a backup code against stored hashed codes.
 *
 * @param plainCode - Plain text code provided by the user
 * @param hashedCodes - Array of hashed codes from database
 * @returns true if the code matches any stored hash
 */
export function verifyBackupCode(plainCode: string, hashedCodes: string[]): boolean {
  const hash = hashBackupCode(plainCode);
  return hashedCodes.includes(hash);
}

/**
 * Encrypt an array of hashed backup codes for database storage.
 *
 * @param hashedCodes - Array of SHA-256 hashed backup codes
 * @returns Encrypted string (AES-256-GCM)
 */
export function encryptBackupCodes(hashedCodes: string[]): string {
  return encrypt(JSON.stringify(hashedCodes));
}

/**
 * Decrypt backup codes from database storage.
 *
 * @param encrypted - AES-256-GCM encrypted backup codes
 * @returns Array of SHA-256 hashed backup codes
 */
export function decryptBackupCodes(encrypted: string): string[] {
  return JSON.parse(decrypt(encrypted));
}

/**
 * Remove a used backup code from the stored array.
 *
 * @param hashedCodes - Current array of hashed codes
 * @param plainCode - The plain text code that was used
 * @returns New array with the used code removed
 */
export function consumeBackupCode(hashedCodes: string[], plainCode: string): string[] {
  const hash = hashBackupCode(plainCode);
  return hashedCodes.filter(h => h !== hash);
}

// ─── Validation ───────────────────────────────────────────────────────

/**
 * Validate a TOTP code format (6 digits).
 *
 * @param code - The code to validate
 * @returns true if the code is a valid 6-digit string
 */
export function isValidTOTPFormat(code: string): boolean {
  return /^\d{6}$/.test(code);
}

/**
 * Validate a backup code format (8 alphanumeric characters).
 *
 * @param code - The code to validate
 * @returns true if the code is a valid backup code format
 */
export function isValidBackupCodeFormat(code: string): boolean {
  return /^[A-Z0-9]{8}$/.test(code);
}
