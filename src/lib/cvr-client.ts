/**
 * CVR Register Client — Erhvervsstyrelsen (VIRK) Elasticsearch API
 *
 * System-til-system adgang til Det Centrale Virksomhedsregister (CVR).
 * Looks up a Danish CVR number against the official CVR register and
 * returns whether the company exists, plus metadata for auto-fill.
 *
 * ─── API details ───────────────────────────────────────────────────
 *
 * Endpoint: https://distribution.virk.dk/cvr-permanent/virksomhed/_search
 * Auth:     HTTP Basic Auth (BrugerId:Password)
 * Method:   POST with Elasticsearch Query DSL in the body
 *
 * The Danish Business Authority (Erhvervsstyrelsen) issues credentials
 * via: https://datacvr.virk.dk/artikel/system-til-system-adgang-til-registeringstekster
 *
 * Eksistenstjek: query on Vrvirksomhed.cvrNummer → hits.total > 0.
 *
 * ─── Modes ─────────────────────────────────────────────────────────
 *
 * - Production: real HTTP calls when CVR_API_USERNAME + CVR_API_PASSWORD
 *   are set AND CVR_SIMULATION_MODE !== 'false'.
 * - Simulation: mock responses when credentials are missing or the
 *   simulation flag is explicitly 'true'. Lets the feature be developed
 *   and demoed without live credentials.
 *
 * ─── Caching ───────────────────────────────────────────────────────
 *
 * Results are cached in-memory for 5 minutes per CVR number to spare
 * the API quota and keep the UX snappy on repeated lookups.
 *
 * @see https://erhvervsstyrelsen.dk/kom-godt-igang-med-elasticSearch
 */

import { logger } from '@/lib/logger';
import { registerCache } from '@/lib/cache-registry';

// ─── CONFIG ──────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://distribution.virk.dk';
const DEFAULT_TIMEOUT = 10_000; // 10s — CVR can be slow under load
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── TYPES ───────────────────────────────────────────────────────

/** Result of a CVR lookup — the public contract returned to the UI. */
export interface CvrResult {
  /** Whether a company with this CVR number exists in the register */
  exists: boolean;
  /** CVR number that was looked up (normalised, 8 digits) */
  cvrNumber: string;
  /** Current company name (nyesteNavn) if found */
  name?: string;
  /** Company status code, e.g. "AKTIV" / "OPLØST" / "FEJLREGISTRERET" */
  status?: string;
  /** Street address line, e.g. "Strøget 1" */
  address?: string;
  /** Postal code, e.g. "1234" */
  postalCode?: string;
  /** City, e.g. "København" */
  city?: string;
  /** Country, e.g. "Danmark" */
  country?: string;
  /** Whether the result came from simulation mode */
  simulated?: boolean;
}

/** Normalised address extracted from the CVR beliggenhedsadresse. */
interface NormalisedAddress {
  address?: string;
  postalCode?: string;
  city?: string;
  country?: string;
}

// ─── EMBEDDED ELASTICSEARCH RESPONSE SHAPES ──────────────────────
// Only the fields we read are typed; the CVR payload is large and
// deeply nested, so unknown is used for everything we ignore.

/** CVR beliggenhedsadresse (current address) field shape. */
interface CvrBeliggenhedsadresse {
  vejnavn?: string;
  husnummerFra?: string;
  husnummerTil?: string;
  bogstavFra?: string;
  bogstavTil?: string;
  etage?: string;
  sidedoer?: string;
  postnummer?: number | string;
  postdistrikt?: string;
  landekode?: string;
  kommunekode?: number;
}

interface CvrHitSource {
  Vrvirksomhed?: {
    cvrNummer?: number;
    virksomhedMetadata?: {
      nyesteNavn?: { navn?: string };
      nyesteBeliggenhedsadresse?: CvrBeliggenhedsadresse | null;
      nyesteHovedbranche?: {
        branchekode?: string;
        branchetekst?: string;
      } | null;
      virksomhedstatus?: {
        kode?: string;
        tekst?: string;
      } | null;
    } | null;
    nyesteBeliggenhedsadresse?: unknown;
    beliggenhedsadresse?: unknown;
  } | null;
}

interface EsSearchResponse {
  took?: number;
  timed_out?: boolean;
  hits?: {
    total?: number | { value?: number; relation?: string };
    max_score?: number | null;
    hits?: Array<{ _source?: CvrHitSource }>;
  };
}

// ─── CLIENT CLASS ────────────────────────────────────────────────

/**
 * CVR Register client. Singleton via the `cvrClient` export.
 *
 * Follows the same architecture as StorecoveClient: class with
 * simulation mode, AbortController timeout, and a singleton instance.
 */
export class CvrClient {
  private baseUrl: string;
  private username: string;
  private password: string;
  private simulationMode: boolean;
  private timeout: number;
  private cache = new Map<string, { result: CvrResult; expiresAt: number }>();

  constructor() {
    this.baseUrl = (process.env.CVR_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.username = process.env.CVR_API_USERNAME || '';
    this.password = process.env.CVR_API_PASSWORD || '';
    // Simulation mode when explicitly enabled OR credentials missing
    const flag = process.env.CVR_SIMULATION_MODE;
    const hasCreds = !!(this.username && this.password);
    this.simulationMode = flag === undefined ? !hasCreds : flag !== 'false';
    this.timeout = DEFAULT_TIMEOUT;

    // Register with central cache registry so expired CVR entries are
    // evicted every 10 minutes even if no new lookups arrive.
    registerCache('cvr-client', () => {
      const now = Date.now();
      for (const [key, entry] of this.cache) {
        if (entry.expiresAt <= now) {
          this.cache.delete(key);
        }
      }
    });
  }

  /** True when running against the real CVR register. */
  get isProduction(): boolean {
    return !this.simulationMode && !!(this.username && this.password);
  }

  // ─── PUBLIC API ──────────────────────────────────────────────────

  /**
   * Look up a Danish CVR number in the CVR register.
   *
   * @param cvrNumber - 8-digit CVR number (digits only or DK-prefixed)
   * @returns CvrResult with `exists` plus name/status/address when found
   */
  async lookup(cvrNumber: string): Promise<CvrResult> {
    const normalised = this.normaliseCvr(cvrNumber);
    if (!normalised) {
      return { exists: false, cvrNumber: cvrNumber.trim() };
    }

    // Cache hit?
    const cached = this.cache.get(normalised);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    const result = await (this.simulationMode
      ? this.simulateLookup(normalised)
      : this.liveLookup(normalised));

    this.cache.set(normalised, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  }

  // ─── LIVE LOOKUP ─────────────────────────────────────────────────

  /**
   * Perform a real Elasticsearch query against distribution.virk.dk.
   * Uses POST with Query DSL and Basic Auth.
   */
  private async liveLookup(cvrNumber: string): Promise<CvrResult> {
    const notFound: CvrResult = { exists: false, cvrNumber };

    if (!this.username || !this.password) {
      logger.warn('[CVR_CLIENT] No credentials configured — treating as not found');
      return notFound;
    }

    const url = `${this.baseUrl}/cvr-permanent/virksomhed/_search`;
    const body = JSON.stringify({
      _source: [
        'Vrvirksomhed.cvrNummer',
        'Vrvirksomhed.virksomhedMetadata.nyesteNavn.navn',
        'Vrvirksomhed.virksomhedMetadata.nyesteBeliggenhedsadresse',
        'Vrvirksomhed.virksomhedMetadata.virksomhedstatus',
      ],
      query: {
        term: { 'Vrvirksomhed.cvrNummer': cvrNumber },
      },
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const authHeader =
        'Basic ' + Buffer.from(`${this.username}:${this.password}`).toString('base64');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: authHeader,
        },
        body,
        signal: controller.signal,
      });

      if (response.status === 401) {
        logger.error('[CVR_CLIENT] Authentication failed — check CVR_API_USERNAME/PASSWORD');
        throw new Error('CVR authentication failed (401). Verify your CVR credentials.');
      }
      if (response.status === 429) {
        logger.warn('[CVR_CLIENT] Rate limited by CVR API (429)');
        throw new Error('CVR API rate limit reached. Please try again shortly.');
      }
      if (!response.ok) {
        logger.error('[CVR_CLIENT] Unexpected status', { status: response.status });
        throw new Error(`CVR API returned ${response.status}`);
      }

      const payload = (await response.json()) as EsSearchResponse;
      const total = this.extractHitTotal(payload);
      if (total === 0) {
        return notFound;
      }

      const hit = payload.hits?.hits?.[0]?._source?.Vrvirksomhed;
      if (!hit) {
        return notFound;
      }

      const meta = hit.virksomhedMetadata ?? null;
      const name = meta?.nyesteNavn?.navn ?? undefined;
      const status = meta?.virksomhedstatus?.kode ?? undefined;
      const address = this.extractAddress(meta?.nyesteBeliggenhedsadresse ?? null);

      return {
        exists: true,
        cvrNumber,
        name,
        status,
        address: address.address,
        postalCode: address.postalCode,
        city: address.city,
        country: address.country,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error('[CVR_CLIENT] Request timed out', { cvrNumber, timeout: this.timeout });
        throw new Error('CVR lookup timed out. Please try again.');
      }
      logger.error('[CVR_CLIENT] Lookup failed', { cvrNumber, error });
      throw error instanceof Error ? error : new Error('CVR lookup failed');
    } finally {
      clearTimeout(timer);
    }
  }

  // ─── SIMULATION ──────────────────────────────────────────────────

  /**
   * Mock lookup for development/demo without real credentials.
   * Any 8-digit CVR returns exists:true with synthetic data so the
   * UI flow can be exercised. A curated list returns realistic names.
   */
  private simulateLookup(cvrNumber: string): CvrResult {
    // Small set of well-known CVR numbers returns realistic data.
    const known: Record<string, Partial<CvrResult>> = {
      '30714024': { name: 'Nine A/S', status: 'AKTIV', address: 'Strandvejen 100', postalCode: '2900', city: 'Hellerup', country: 'Danmark' },
      '25992658': { name: 'Erhvervsstyrelsen', status: 'AKTIV', address: 'Landskronagade 33', postalCode: '2100', city: 'København', country: 'Danmark' },
      '17519385': { name: 'DSV A/S', status: 'AKTIV', address: 'Gl. Kongevej 23', postalCode: '1610', city: 'København', country: 'Danmark' },
    };

    const base = known[cvrNumber] ?? {
      name: `Demo Virksomhed ${cvrNumber.slice(-4)}`,
      status: 'AKTIV',
      address: 'Testvej 1',
      postalCode: '1000',
      city: 'København',
      country: 'Danmark',
    };

    return { exists: true, cvrNumber, simulated: true, ...base };
  }

  // ─── HELPERS ─────────────────────────────────────────────────────

  /** Normalise to 8 digits; returns null if invalid. */
  private normaliseCvr(input: string): string | null {
    const digits = (input || '').toUpperCase().replace(/^DK/, '').replace(/\D/g, '');
    return digits.length === 8 ? digits : null;
  }

  /** Elasticsearch v6 returns hits.total as a number; v7+ as an object. */
  private extractHitTotal(payload: EsSearchResponse): number {
    const total = payload.hits?.total;
    if (typeof total === 'number') return total;
    if (total && typeof total === 'object' && typeof total.value === 'number') {
      return total.value;
    }
    return 0;
  }

  /** Build an address string + components from the CVR beliggenhedsadresse. */
  private extractAddress(addr: CvrBeliggenhedsadresse | null | undefined): NormalisedAddress {
    if (!addr || typeof addr !== 'object') return {};

    const vej = addr.vejnavn ?? '';
    const husFra = addr.husnummerFra ?? '';
    const husTil = addr.husnummerTil ?? '';
    const bogFra = addr.bogstavFra ?? '';
    const bogTil = addr.bogstavTil ?? '';
    const etage = addr.etage ?? '';
    const sidedoer = addr.sidedoer ?? '';

    // Combine into "Vejnavn Husnr Bogstav, Etage. Sidedør"
    const housePart = [husFra, husTil && husTil !== husFra ? `-${husTil}` : '']
      .join('')
      .trim();
    const letterPart = [bogFra, bogTil && bogTil !== bogFra ? `-${bogTil}` : ''].join('').trim();
    const streetLine = [vej, housePart, letterPart].filter(Boolean).join(' ');
    const floorPart = [etage ? `${etage}.` : '', sidedoer].filter(Boolean).join(' ');
    const addressLine = [streetLine, floorPart].filter(Boolean).join(', ');

    const postalCode = addr.postnummer != null ? String(addr.postnummer) : undefined;
    const city = addr.postdistrikt ?? undefined;
    const country = this.landekodeTilLand(addr.landekode);

    return {
      address: addressLine || undefined,
      postalCode,
      city,
      country,
    };
  }

  /** Map a CVR landekode (e.g. "DK") to a Danish country name. */
  private landekodeTilLand(kode?: string): string | undefined {
    if (!kode) return undefined;
    const map: Record<string, string> = {
      DK: 'Danmark',
      SE: 'Sverige',
      NO: 'Norge',
      DE: 'Tyskland',
      GB: 'Storbritannien',
      US: 'USA',
    };
    return map[kode.toUpperCase()] ?? kode;
  }
}

// ─── SINGLETON EXPORT ────────────────────────────────────────────

/**
 * Shared CvrClient instance. Reads credentials from environment on
 * first import (Node module caching keeps the config stable).
 */
export const cvrClient = new CvrClient();
