import * as fs from 'fs';
import * as path from 'path';
import { SheetsClient } from './client';
import { normalizeTestId } from './cache';
import { warn } from './logger';
import type { SkipperConfig, SkipperMode } from './types';

const DISK_CACHE_FILE = path.join(process.cwd(), '.skipper-cache.json');

interface DiskCacheData {
  timestamp: number;
  entries: Record<string, string | null>;
}

function readDiskCache(ttlSeconds: number): Record<string, string | null> | null {
  try {
    const raw = fs.readFileSync(DISK_CACHE_FILE, 'utf8');
    const data = JSON.parse(raw) as DiskCacheData;
    if ((Date.now() - data.timestamp) / 1000 <= ttlSeconds) return data.entries;
  } catch {
    // file missing or invalid — no cache available
  }
  return null;
}

function writeDiskCache(entries: Record<string, string | null>): void {
  try {
    fs.writeFileSync(DISK_CACHE_FILE, JSON.stringify({ timestamp: Date.now(), entries }));
  } catch {
    // non-fatal — cache write failure is ignored
  }
}

/**
 * SkipperResolver is the primary interface used by framework plugins.
 *
 * Lifecycle:
 * 1. Call `initialize()` once before tests run (in globalSetup / before hook).
 * 2. Call `isTestEnabled(testId)` per test to decide whether to skip.
 * 3. In sync mode, call `toJSON()` to serialize the cache for cross-process sharing.
 * 4. In worker processes, use `SkipperResolver.fromJSON()` to rehydrate.
 */
export class SkipperResolver {
  private readonly client: SheetsClient;
  private readonly config: SkipperConfig;
  /** normalized testId → disabledUntil ISO string (null = no date = enabled) */
  private cache: Map<string, string | null> = new Map();
  private initialized = false;
  /** When true, all tests are enabled (fail-open fallback with no valid cache). */
  private allEnabled = false;

  constructor(config: SkipperConfig) {
    this.config = config;
    this.client = new SheetsClient(config);
  }

  /**
   * Fetches the spreadsheet and populates the in-memory cache.
   * Must be called once before `isTestEnabled()`.
   *
   * On API failure:
   * - If a valid `.skipper-cache.json` exists within SKIPPER_CACHE_TTL seconds, it is used.
   * - Otherwise, if SKIPPER_FAIL_OPEN is not "false", all tests are enabled (fail-open).
   * - Otherwise (SKIPPER_FAIL_OPEN=false), the original error is re-thrown.
   */
  async initialize(): Promise<void> {
    const ttl = parseInt(process.env.SKIPPER_CACHE_TTL ?? '300', 10);
    const failOpen = process.env.SKIPPER_FAIL_OPEN !== 'false';

    let entries: Record<string, string | null>;
    try {
      const result = await this.client.fetchAll();
      entries = Object.fromEntries(
        result.entries.map((e) => [
          normalizeTestId(e.testId),
          e.disabledUntil ? e.disabledUntil.toISOString() : null,
        ]),
      );
      writeDiskCache(entries);
    } catch (err) {
      const cached = readDiskCache(ttl);
      if (cached !== null) {
        warn('[skipper] API unreachable — using cached skip list (SKIPPER_CACHE_TTL).');
        entries = cached;
      } else if (failOpen) {
        warn('[skipper] API unreachable and no valid cache — running all tests (SKIPPER_FAIL_OPEN=true).');
        this.allEnabled = true;
        this.initialized = true;
        return;
      } else {
        throw err;
      }
    }

    this.cache = new Map(Object.entries(entries));
    this.initialized = true;
  }

  /**
   * Returns true if the test should run.
   *
   * Logic:
   * - Not in spreadsheet → true (opt-out model: unknown tests run by default)
   * - disabledUntil is null or in the past → true
   * - disabledUntil is in the future → false
   * - allEnabled (fail-open with no cache) → always true
   */
  isTestEnabled(testId: string): boolean {
    if (!this.initialized) {
      throw new Error(
        '[skipper] SkipperResolver.initialize() must be called before isTestEnabled(). ' +
          'Did you forget to add the globalSetup to your config?',
      );
    }

    if (this.allEnabled) return true;

    const normalized = normalizeTestId(testId);
    if (!this.cache.has(normalized)) return true;

    const iso = this.cache.get(normalized);
    if (!iso) return true;

    return new Date(iso) <= new Date();
  }

  /**
   * Serializes the cache for cross-process sharing (e.g. globalSetup → workers).
   * Dates are stored as ISO strings; null means no date (enabled).
   */
  toJSON(): Record<string, string | null> {
    return Object.fromEntries(this.cache);
  }

  /**
   * Rehydrates a resolver from a serialized cache.
   * Used in worker processes that cannot call initialize() again.
   */
  static fromJSON(data: Record<string, string | null>): SkipperResolver {
    // We pass a dummy config since the client is never used after fromJSON
    const resolver = new SkipperResolver({
      spreadsheetId: '',
      credentials: { credentialsBase64: '' },
    });
    resolver.cache = new Map(Object.entries(data));
    resolver.initialized = true;
    return resolver;
  }

  getMode(): SkipperMode {
    const mode = process.env.SKIPPER_MODE;
    if (mode === 'sync') return 'sync';
    return 'read-only';
  }
}
