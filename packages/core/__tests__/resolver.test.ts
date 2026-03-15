import type { SkipperResolver as SkipperResolverType } from '../src/resolver';

// ── Module-level handles (populated in beforeEach) ────────────────────────────
// jest.mock() at module level + imports is not reliably hoisted with ts-jest 29
// + Jest 30. We use jest.resetModules() + require() in beforeEach instead.

let SkipperResolver: typeof SkipperResolverType;
let mockFetchAll: jest.Mock;

const FUTURE_ISO = new Date(Date.now() + 86_400_000).toISOString(); // tomorrow
const PAST_ISO = new Date(Date.now() - 86_400_000).toISOString();   // yesterday

const baseConfig = {
  spreadsheetId: 'sheet-id',
  credentials: {
    type: 'service_account' as const,
    project_id: 'proj',
    private_key_id: 'kid',
    private_key: 'pk',
    client_email: 'sa@proj.iam.gserviceaccount.com',
    client_id: '1',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
  },
};

beforeEach(() => {
  jest.resetModules();

  // fetchAll() now returns { primary, entries } — resolver only uses entries
  mockFetchAll = jest.fn().mockResolvedValue({ primary: {}, entries: [] });

  jest.mock('../src/client', () => ({
    SheetsClient: jest.fn().mockImplementation(() => ({
      fetchAll: mockFetchAll,
    })),
  }));

  // Load resolver AFTER mocks are registered so it picks up the mocked client
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SkipperResolver = require('../src/resolver').SkipperResolver;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SkipperResolver', () => {
  describe('initialize()', () => {
    it('calls SheetsClient.fetchAll once', async () => {
      const resolver = new SkipperResolver(baseConfig);
      await resolver.initialize();
      expect(mockFetchAll).toHaveBeenCalledTimes(1);
    });

    it('populates the internal cache from entries', async () => {
      mockFetchAll.mockResolvedValue({ primary: {}, entries: [
        { testId: 'tests/a.spec.ts > login', disabledUntil: new Date(FUTURE_ISO) },
      ] });
      const resolver = new SkipperResolver(baseConfig);
      await resolver.initialize();
      expect(resolver.isTestEnabled('tests/a.spec.ts > login')).toBe(false);
    });
  });

  describe('isTestEnabled()', () => {
    it('throws if called before initialize()', () => {
      const resolver = new SkipperResolver(baseConfig);
      expect(() => resolver.isTestEnabled('any')).toThrow('initialize()');
    });

    it('returns true for tests not present in the spreadsheet (opt-out model)', async () => {
      const resolver = new SkipperResolver(baseConfig);
      await resolver.initialize();
      expect(resolver.isTestEnabled('tests/unknown.spec.ts > new test')).toBe(true);
    });

    it('returns true when disabledUntil is null (no date set = always enabled)', async () => {
      mockFetchAll.mockResolvedValue({ primary: {}, entries: [
        { testId: 'tests/a.spec.ts > login', disabledUntil: null },
      ] });
      const resolver = new SkipperResolver(baseConfig);
      await resolver.initialize();
      expect(resolver.isTestEnabled('tests/a.spec.ts > login')).toBe(true);
    });

    it('returns false when disabledUntil is in the future', async () => {
      mockFetchAll.mockResolvedValue({ primary: {}, entries: [
        { testId: 'tests/a.spec.ts > login', disabledUntil: new Date(FUTURE_ISO) },
      ] });
      const resolver = new SkipperResolver(baseConfig);
      await resolver.initialize();
      expect(resolver.isTestEnabled('tests/a.spec.ts > login')).toBe(false);
    });

    it('returns true when disabledUntil is in the past (re-enabled)', async () => {
      mockFetchAll.mockResolvedValue({ primary: {}, entries: [
        { testId: 'tests/a.spec.ts > login', disabledUntil: new Date(PAST_ISO) },
      ] });
      const resolver = new SkipperResolver(baseConfig);
      await resolver.initialize();
      expect(resolver.isTestEnabled('tests/a.spec.ts > login')).toBe(true);
    });

    it('normalizes testId for comparison (case-insensitive, whitespace-collapsed)', async () => {
      mockFetchAll.mockResolvedValue({ primary: {}, entries: [
        { testId: 'Tests/Auth.spec.ts >  Login ', disabledUntil: new Date(FUTURE_ISO) },
      ] });
      const resolver = new SkipperResolver(baseConfig);
      await resolver.initialize();
      // lookup with different casing/spacing still matches
      expect(resolver.isTestEnabled('tests/auth.spec.ts > login')).toBe(false);
    });
  });

  describe('toJSON() / fromJSON()', () => {
    it('serializes and restores the cache faithfully', async () => {
      mockFetchAll.mockResolvedValue({ primary: {}, entries: [
        { testId: 'tests/a.spec.ts > disabled', disabledUntil: new Date(FUTURE_ISO) },
        { testId: 'tests/b.spec.ts > enabled', disabledUntil: null },
      ] });
      const original = new SkipperResolver(baseConfig);
      await original.initialize();

      const restored = SkipperResolver.fromJSON(original.toJSON());

      expect(restored.isTestEnabled('tests/a.spec.ts > disabled')).toBe(false);
      expect(restored.isTestEnabled('tests/b.spec.ts > enabled')).toBe(true);
      expect(restored.isTestEnabled('tests/c.spec.ts > unknown')).toBe(true);
    });

    it('fromJSON creates an already-initialized resolver (no initialize() needed)', () => {
      const resolver = SkipperResolver.fromJSON({});
      expect(() => resolver.isTestEnabled('any test')).not.toThrow();
    });
  });

  describe('getMode()', () => {
    afterEach(() => {
      delete process.env.SKIPPER_MODE;
    });

    it('returns "read-only" when SKIPPER_MODE is not set', async () => {
      delete process.env.SKIPPER_MODE;
      const resolver = new SkipperResolver(baseConfig);
      await resolver.initialize();
      expect(resolver.getMode()).toBe('read-only');
    });

    it('returns "sync" when SKIPPER_MODE=sync', async () => {
      process.env.SKIPPER_MODE = 'sync';
      const resolver = new SkipperResolver(baseConfig);
      await resolver.initialize();
      expect(resolver.getMode()).toBe('sync');
    });

    it('returns "read-only" for unknown SKIPPER_MODE values', async () => {
      process.env.SKIPPER_MODE = 'unknown';
      const resolver = new SkipperResolver(baseConfig);
      await resolver.initialize();
      expect(resolver.getMode()).toBe('read-only');
    });
  });

  describe('usage example — full read-only flow', () => {
    /**
     * This shows the complete lifecycle used by every framework plugin:
     *
     *   1. globalSetup: new SkipperResolver(config) → initialize() → toJSON() → share cache
     *   2. worker process: SkipperResolver.fromJSON(cache) → isTestEnabled(testId)
     *
     * No spreadsheet credentials are needed in this test — SheetsClient is mocked.
     */
    it('gates tests based on spreadsheet data', async () => {
      mockFetchAll.mockResolvedValue({ primary: {}, entries: [
        // disabled for 30 days
        {
          testId: 'tests/checkout/payment.spec.ts > payment > stripe',
          disabledUntil: new Date(Date.now() + 30 * 86_400_000),
        },
        // permanently disabled (far future date)
        {
          testId: 'tests/payments/refund.spec.ts > refund',
          disabledUntil: new Date('2099-12-31'),
        },
        // explicitly enabled (no date)
        { testId: 'tests/auth/login.spec.ts > login > should log in', disabledUntil: null },
      ] });

      // globalSetup: load spreadsheet and serialize
      const globalSetupResolver = new SkipperResolver(baseConfig);
      await globalSetupResolver.initialize();
      const cache = globalSetupResolver.toJSON();

      // worker: rehydrate from cache (no network call needed)
      const workerResolver = SkipperResolver.fromJSON(cache);

      expect(workerResolver.isTestEnabled('tests/auth/login.spec.ts > login > should log in')).toBe(true);
      expect(workerResolver.isTestEnabled('tests/checkout/payment.spec.ts > payment > stripe')).toBe(false);
      expect(workerResolver.isTestEnabled('tests/payments/refund.spec.ts > refund')).toBe(false);
      // tests not in the spreadsheet are always enabled (opt-out model)
      expect(workerResolver.isTestEnabled('tests/new-feature.spec.ts > new test')).toBe(true);
    });
  });
});
