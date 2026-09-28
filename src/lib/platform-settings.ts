/**
 * Platform-wide persistent settings — file-backed JSON store.
 *
 * Why a file and not a DB table?
 *   - No DB schema migration required (the user manages migrations on
 *     their own production system; we don't want to add a model just
 *     for one toggle).
 *   - Survives server restarts (unlike in-memory).
 *   - Single source of truth for ALL tenants — when the SuperDev flips
 *     the DevMode CVR-bypass toggle, every tenant's CVR gate is affected.
 *     This matches the user's requirement: "When I as SuperDev toggle
 *     CVR verification off/on, this should apply to all tenants on the
 *     entire platform."
 *
 * File location: <process.cwd()>/data/platform-settings.json
 *
 * Concurrent writes are protected by a mutex queue (one write at a time).
 * Reads are atomic (full file parse on each call) — cheap, since the
 * file is tiny (just a few keys).
 *
 * The store is intentionally minimal — add new platform-wide flags as
 * typed fields on PlatformSettings. Don't use it for per-tenant data
 * (that's what the DB is for).
 */
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';

// ─── Types ────────────────────────────────────────────────────────────

export interface PlatformSettings {
  /**
   * DevMode CVR-verification bypass — when true, the Sproom child-company
   * creation route (and any other route gating on cvrVerifiedAt) skips
   * the CVR-verification check for ALL tenants on the platform.
   *
   * Set by SuperDev via POST/DELETE /api/sproom/dev-bypass-cvr. Only
   * effective when Sproom is in a non-production environment
   * (sproomClient.environment !== 'production') — the API route hard-enforces
   * that, so even if the flag is true, it's inert against real Sproom prod.
   *
   * Default: false (CVR verification required).
   */
  cvrBypassEnabled: boolean;

  /**
   * Timestamp (ISO 8601) of the last time cvrBypassEnabled was changed.
   * Useful for audit and for the UI to show "last changed X minutes ago".
   */
  cvrBypassLastChangedAt: string | null;

  /**
   * User ID of the SuperDev who last changed cvrBypassEnabled.
   * Useful for audit trail (the audit log also has this, but having it
   * in the settings file makes it visible without a DB query).
   */
  cvrBypassLastChangedBy: string | null;
}

const DEFAULT_SETTINGS: PlatformSettings = {
  cvrBypassEnabled: false,
  cvrBypassLastChangedAt: null,
  cvrBypassLastChangedBy: null,
};

// ─── File location ────────────────────────────────────────────────────

const PROJECT_ROOT = process.cwd();
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'platform-settings.json');

// ─── Write mutex ──────────────────────────────────────────────────────

let writeChain: Promise<unknown> = Promise.resolve();

/**
 * Ensure the data/ directory exists. Idempotent — safe to call on every
 * read/write. If it can't be created, we fall through and let the actual
 * read/write throw a clear error.
 */
async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (err) {
    // mkdir can fail if the dir exists with the wrong permissions, etc.
    // Don't mask the actual problem — log and continue, the next open()
    // will throw with a more useful error.
    logger.warn('[PLATFORM_SETTINGS] Could not create data/ dir', { err: String(err) });
  }
}

/**
 * Read the settings file. Returns DEFAULT_SETTINGS if the file doesn't
 * exist yet, is empty, or fails to parse (defensive — never throws).
 * New fields added to PlatformSettings after the file was last written
 * are filled in from DEFAULT_SETTINGS (forward-compatible).
 */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PlatformSettings>;
    // Merge with defaults so missing keys get filled in (forward-compat).
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (err) {
    // File doesn't exist yet, or is invalid JSON. Either way, return defaults.
    // Don't log "file not found" — that's the expected initial state.
    const errStr = String(err);
    if (!errStr.includes('ENOENT')) {
      logger.warn('[PLATFORM_SETTINGS] Could not read settings file, using defaults', {
        err: errStr,
      });
    }
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Convenience getter — just the bypass flag.
 */
export async function isCvrBypassEnabled(): Promise<boolean> {
  const settings = await getPlatformSettings();
  return settings.cvrBypassEnabled === true;
}

/**
 * Update the settings file. Accepts a partial patch — fields not in the
 * patch keep their existing values. Writes are serialized via a Promise
 * chain so concurrent updates don't clobber each other.
 *
 * Returns the full settings object after the update.
 */
export async function updatePlatformSettings(
  patch: Partial<PlatformSettings>,
): Promise<PlatformSettings> {
  // Serialize writes — each update waits for the previous one to finish.
  writeChain = writeChain.then(async () => {
    await ensureDataDir();
    const current = await getPlatformSettings();
    const next: PlatformSettings = { ...current, ...patch };
    // Pretty-print for easy inspection (file is tiny).
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf8');
    return next;
  });
  return writeChain as Promise<PlatformSettings>;
}

/**
 * Toggle the DevMode CVR-bypass flag. Called by the SuperDev-only API
 * route (POST = enable, DELETE = disable). Records who changed it and
 * when, so the audit trail survives even without the DB audit log.
 *
 * Returns the full settings object after the toggle.
 */
export async function setCvrBypassEnabled(
  enabled: boolean,
  changedByUserId: string,
): Promise<PlatformSettings> {
  return updatePlatformSettings({
    cvrBypassEnabled: enabled,
    cvrBypassLastChangedAt: new Date().toISOString(),
    cvrBypassLastChangedBy: changedByUserId,
  });
}
