/**
 * ClamAV Antivirus Scanner — U-4
 *
 * Integrates with ClamAV daemon (clamd) via TCP INSTREAM protocol
 * to scan uploaded files for malware before they are persisted.
 *
 * ─── Architecture ────────────────────────────────────────────
 *
 *   Upload route → scanBuffer(buffer, filename)
 *                → TCP connection to clamd (port 3310)
 *                → INSTREAM protocol (chunked send)
 *                → Parse response: "stream: OK" | "stream: <virus> FOUND"
 *                → If infected: reject upload + audit log
 *
 * ─── Configuration (env vars) ───────────────────────────────
 *
 *   CLAMAV_ENABLED=true|false    Enable scanning (default: false)
 *   CLAMAV_HOST=localhost        ClamAV daemon host
 *   CLAMAV_PORT=3310             ClamAV daemon TCP port
 *   CLAMAV_TIMEOUT=30000         Connection timeout in ms
 *
 * ─── VPS Setup (one-time) ───────────────────────────────────
 *
 *   sudo apt install clamav-daemon
 *   sudo systemctl enable clamav-daemon
 *   sudo systemctl start clamav-daemon
 *   # Verify:
 *   sudo clamdscan --stream /tmp/eicar.txt
 *
 * ─── EICAR Test File ────────────────────────────────────────
 *
 *   Download: https://www.eicar.org/download/eicar-com/
 *   Expected: Eicar-Test-File (not a virus) FOUND
 *
 * @see BEK 97 §8 stk. 4 (D7); GDPR Art. 32
 * @see https://linux.die.net/man/8/clamd
 * @see https://www.clamav.net/documents/clamav-daemon
 */

import * as net from 'net';
import { logger } from './logger';

// ─── Config ───────────────────────────────────────────────────────────

const CLAMAV_ENABLED = process.env.CLAMAV_ENABLED === 'true';
const CLAMAV_HOST = process.env.CLAMAV_HOST || 'localhost';
const CLAMAV_PORT = parseInt(process.env.CLAMAV_PORT || '3310', 10);
const CLAMAV_TIMEOUT = parseInt(process.env.CLAMAV_TIMEOUT || '30000', 10);

// ─── Types ────────────────────────────────────────────────────────────

export interface ScanResult {
  /** true if no malware detected */
  clean: boolean;
  /** If infected: the virus name reported by ClamAV */
  virusName?: string;
  /** If scan failed: error description */
  error?: string;
  /** Whether ClamAV was actually used (false = skipped/disabled) */
  scanned: boolean;
}

// ─── INSTREAM Protocol Implementation ──────────────────────────────────
//
// ClamAV's INSTREAM protocol (clamd docs):
//   1. Client connects to TCP socket
//   2. Client sends: "zINSTREAM\0" (10 bytes)
//   3. Client sends: <4-byte big-endian length N> + <N bytes of data>
//      (repeat for multiple chunks)
//   4. Client sends: <4-byte zero> (signals end of stream)
//   5. ClamAV responds: "stream: <result>\0"
//      where <result> is "OK" or "<virusname> FOUND"

const INSTREAM_COMMAND = Buffer.from('zINSTREAM\0', 'ascii');

/**
 * Scan a file buffer for malware using ClamAV daemon.
 *
 * This is an async operation that connects to the ClamAV TCP socket,
 * sends the file data using the INSTREAM protocol, and returns
 * the scan result.
 *
 * @param buffer - The file content to scan
 * @param filename - Original filename (for logging)
 * @returns Scan result with clean/infected/error status
 */
export async function scanBuffer(
  buffer: Buffer,
  filename: string
): Promise<ScanResult> {
  // If ClamAV is not enabled, skip scan
  if (!CLAMAV_ENABLED) {
    logger.debug(`[ClamAV] Scan SKIPPED (CLAMAV_ENABLED not set): ${filename}`);
    return { clean: true, scanned: false };
  }

  return new Promise<ScanResult>((resolve) => {
    let resolved = false;
    const safeResolve = (result: ScanResult) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    };

    const socket = new net.Socket();

    // Set timeout
    socket.setTimeout(CLAMAV_TIMEOUT);

    socket.connect(CLAMAV_PORT, CLAMAV_HOST, () => {
      // Send INSTREAM command
      socket.write(INSTREAM_COMMAND);

      // Send file data in chunks (max 16KB per chunk for safety)
      const CHUNK_SIZE = 16384;
      let offset = 0;

      const sendNextChunk = () => {
        if (offset >= buffer.length) {
          // Send zero-length terminator
          const term = Buffer.alloc(4, 0);
          socket.write(term);
          return;
        }

        const end = Math.min(offset + CHUNK_SIZE, buffer.length);
        const chunkSize = end - offset;
        const sizeBuf = Buffer.alloc(4);
        sizeBuf.writeUInt32BE(chunkSize, 0);

        socket.write(sizeBuf);
        socket.write(buffer.subarray(offset, end));
        offset = end;

        // Avoid backpressure issues — drain before next chunk
        if (socket.writableNeedDrain) {
          socket.once('drain', sendNextChunk);
        } else {
          // Use setImmediate to avoid stack overflow on large files
          setImmediate(sendNextChunk);
        }
      };

      sendNextChunk();
    });

    // Buffer for accumulating response data
    let responseData = Buffer.alloc(0);

    socket.on('data', (data: Buffer) => {
      responseData = Buffer.concat([responseData, data]);

      // Check if we have a complete NUL-terminated response
      const nulIndex = responseData.indexOf(0);
      if (nulIndex !== -1) {
        const responseStr = responseData.subarray(0, nulIndex).toString('utf8').trim();
        socket.destroy();

        // Parse response
        // "stream: OK" → clean
        // "stream: Eicar-Test-File (not a virus) FOUND" → infected
        if (responseStr === 'stream: OK') {
          logger.info(`[ClamAV] CLEAN: ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
          safeResolve({ clean: true, scanned: true });
        } else if (responseStr.includes('FOUND')) {
          // Extract virus name: "stream: <name> FOUND"
          const match = responseStr.match(/stream:\s*(.+?)\s+FOUND/);
          const virusName = match ? match[1] : 'unknown';
          logger.warn(`[ClamAV] INFECTED: ${filename} — ${virusName}`);
          safeResolve({ clean: false, virusName, scanned: true });
        } else {
          logger.error(`[ClamAV] Unexpected response for ${filename}: "${responseStr}"`);
          safeResolve({ clean: true, scanned: true, error: `Unexpected ClamAV response: ${responseStr}` });
        }
      }
    });

    socket.on('timeout', () => {
      logger.error(`[ClamAV] TIMEOUT scanning ${filename} (${CLAMAV_TIMEOUT}ms)`);
      socket.destroy();
      safeResolve({ clean: true, scanned: true, error: `Scan timeout (${CLAMAV_TIMEOUT}ms)` });
    });

    socket.on('error', (err: Error) => {
      logger.error(`[ClamAV] ERROR scanning ${filename}: ${err.message}`);
      safeResolve({
        clean: true,
        scanned: true,
        error: `ClamAV connection failed: ${err.message}`,
      });
    });

    socket.on('close', () => {
      // If we haven't resolved yet, the connection closed unexpectedly
      // (e.g., clamd restarted). Resolve with error.
      if (!resolved) {
        logger.error(`[ClamAV] Connection closed unexpectedly for ${filename}`);
        safeResolve({ clean: true, scanned: true, error: 'Connection closed unexpectedly' });
      }
    });
  });
}

/**
 * Check if ClamAV scanning is enabled and available.
 * Useful for logging / status endpoints.
 */
export function isClamAvEnabled(): boolean {
  return CLAMAV_ENABLED;
}

/**
 * Get ClamAV configuration for diagnostics.
 */
export function getClamAvConfig(): { enabled: boolean; host: string; port: number; timeout: number } {
  return {
    enabled: CLAMAV_ENABLED,
    host: CLAMAV_HOST,
    port: CLAMAV_PORT,
    timeout: CLAMAV_TIMEOUT,
  };
}