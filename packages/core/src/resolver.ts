import { SheetsClient } from './client';
import { ExcelClient } from './excel-client';
import { normalizeTestId } from './cache';
import type { SkipperConfig, GoogleSheetsConfig, SkipperMode } from './types';

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
  private readonly client: SheetsClient | ExcelClient;
  private readonly config: SkipperConfig;
  /** normalized testId → disabledUntil ISO string (null = no date = enabled) */
  private cache: Map<string, string | null> = new Map();
  private initialized = false;

  constructor(config: SkipperConfig) {
    this.config = config;
    this.client =
      config.source === 'excel'
        ? new ExcelClient(config)
        : new SheetsClient(config as GoogleSheetsConfig);
  }

  /**
   * Fetches the spreadsheet / workbook and populates the in-memory cache.
   * Must be called once before `isTestEnabled()`.
   */
  async initialize(): Promise<void> {
    const { entries } = await this.client.fetchAll();
    this.cache = new Map(
      entries.map((e) => [
        normalizeTestId(e.testId),
        e.disabledUntil ? e.disabledUntil.toISOString() : null,
      ]),
    );
    this.initialized = true;
  }

  /**
   * Returns true if the test should run.
   *
   * Logic:
   * - Not in spreadsheet → true (opt-out model: unknown tests run by default)
   * - disabledUntil is null or in the past → true
   * - disabledUntil is in the future → false
   */
  isTestEnabled(testId: string): boolean {
    if (!this.initialized) {
      throw new Error(
        '[skipper] SkipperResolver.initialize() must be called before isTestEnabled(). ' +
          'Did you forget to add the globalSetup to your config?',
      );
    }

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
