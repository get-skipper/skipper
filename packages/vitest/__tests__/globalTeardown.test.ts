import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ── Module-level handles (populated in beforeEach) ────────────────────────────
// jest.mock() at module level + imports is not reliably hoisted with ts-jest 29
// + Jest 30. We use jest.resetModules() + require() in beforeEach instead.

type TeardownFn = () => Promise<void>;
type CreateTeardown = (config: unknown) => TeardownFn;

let createSkipperGlobalTeardown: CreateTeardown;
let mockSync: jest.Mock;
let mockEmitSummary: jest.Mock;
let mockBuildReport: jest.Mock;

const config = {
  spreadsheetId: 'sheet-id',
  credentials: { credentialsBase64: 'dGVzdA==' },
};

beforeEach(() => {
  jest.resetModules();

  mockSync = jest.fn().mockResolvedValue(undefined);
  mockEmitSummary = jest.fn();
  mockBuildReport = jest.fn().mockReturnValue({
    suppressedCount: 0,
    expiringThisWeek: [],
    reEnabledThisRun: [],
    quarantineDebtDays: 0,
    generatedAt: new Date().toISOString(),
  });

  jest.mock('@get-skipper/core', () => ({
    SheetsWriter: jest.fn().mockImplementation(() => ({ sync: mockSync })),
    buildReport: mockBuildReport,
    emitSummary: mockEmitSummary,
    log: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }));

  // Load AFTER mocks are registered
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  createSkipperGlobalTeardown = require('../src/globalTeardown').createSkipperGlobalTeardown;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createSkipperGlobalTeardown() — @get-skipper/vitest', () => {
  let savedMode: string | undefined;
  let savedDiscovered: string | undefined;
  let tmpCacheFile: string | undefined;

  beforeEach(() => {
    savedMode = process.env.SKIPPER_MODE;
    savedDiscovered = process.env.SKIPPER_DISCOVERED_TESTS;
    delete process.env.SKIPPER_MODE;
    delete process.env.SKIPPER_DISCOVERED_TESTS;
  });

  afterEach(() => {
    if (savedMode !== undefined) process.env.SKIPPER_MODE = savedMode;
    else delete process.env.SKIPPER_MODE;
    if (savedDiscovered !== undefined) process.env.SKIPPER_DISCOVERED_TESTS = savedDiscovered;
    else delete process.env.SKIPPER_DISCOVERED_TESTS;
    if (tmpCacheFile && fs.existsSync(tmpCacheFile)) fs.unlinkSync(tmpCacheFile);
    tmpCacheFile = undefined;
  });

  function writeTmpCache(data: Record<string, string | null>): void {
    // Write a real cache file to the vitest cache path so the teardown can find it
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SKIPPER_CACHE_PATH } = require('../src/globalSetup');
    tmpCacheFile = SKIPPER_CACHE_PATH;
    fs.writeFileSync(SKIPPER_CACHE_PATH, JSON.stringify(data), 'utf8');
  }

  it('returns an async function', () => {
    expect(typeof createSkipperGlobalTeardown(config)).toBe('function');
  });

  it('emits a quarantine report when the cache file exists', async () => {
    writeTmpCache({ 'tests/a.spec.ts > test': null });
    await createSkipperGlobalTeardown(config)();
    expect(mockBuildReport).toHaveBeenCalled();
    expect(mockEmitSummary).toHaveBeenCalled();
  });

  it('skips the report gracefully when the cache file does not exist', async () => {
    // No cache file written — emitSummary should not be called
    await createSkipperGlobalTeardown(config)();
    expect(mockEmitSummary).not.toHaveBeenCalled();
  });

  it('does not call SheetsWriter.sync when SKIPPER_MODE is not "sync"', async () => {
    process.env.SKIPPER_DISCOVERED_TESTS = JSON.stringify(['tests/a.spec.ts > test']);
    const teardown = createSkipperGlobalTeardown(config);
    await teardown();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('warns when SKIPPER_DISCOVERED_TESTS is not set in sync mode', async () => {
    process.env.SKIPPER_MODE = 'sync';
    await createSkipperGlobalTeardown(config)();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('calls SheetsWriter.sync() with the parsed discovered IDs in sync mode', async () => {
    process.env.SKIPPER_MODE = 'sync';
    const ids = ['tests/a.spec.ts > test', 'tests/b.spec.ts > another test'];
    process.env.SKIPPER_DISCOVERED_TESTS = JSON.stringify(ids);

    await createSkipperGlobalTeardown(config)();

    expect(mockSync).toHaveBeenCalledWith(ids);
  });

  it('handles invalid JSON in SKIPPER_DISCOVERED_TESTS gracefully', async () => {
    process.env.SKIPPER_MODE = 'sync';
    process.env.SKIPPER_DISCOVERED_TESTS = '{bad json}';
    await createSkipperGlobalTeardown(config)();
    expect(mockSync).not.toHaveBeenCalled();
  });

  describe('usage example — sync mode on merge to main', () => {
    /**
     * On merge to main with SKIPPER_MODE=sync:
     * - setup.ts collects each test's ID into SKIPPER_DISCOVERED_TESTS
     * - globalTeardown reads SKIPPER_DISCOVERED_TESTS and calls SheetsWriter.sync()
     * - new tests are appended to the spreadsheet; removed tests are deleted
     */
    it('syncs all discovered tests to the spreadsheet', async () => {
      process.env.SKIPPER_MODE = 'sync';
      const ids = [
        'tests/auth/login.spec.ts > login > should log in',
        'tests/auth/login.spec.ts > login > should fail',
        'tests/checkout/cart.spec.ts > cart > add item',
      ];
      process.env.SKIPPER_DISCOVERED_TESTS = JSON.stringify(ids);

      await createSkipperGlobalTeardown(config)();

      expect(mockSync).toHaveBeenCalledWith(ids);
    });
  });
});
