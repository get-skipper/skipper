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

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skipper-test-'));
}

function writeIds(dir: string, ids: string[]): void {
  fs.writeFileSync(path.join(dir, 'worker-1.json'), JSON.stringify(ids));
}

function writeCacheFile(dir: string, data: Record<string, string | null>): string {
  const cacheFile = path.join(dir, 'cache.json');
  fs.writeFileSync(cacheFile, JSON.stringify(data), 'utf8');
  return cacheFile;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createSkipperGlobalTeardown()', () => {
  let savedMode: string | undefined;
  let savedDir: string | undefined;
  let savedCacheFile: string | undefined;

  beforeEach(() => {
    savedMode = process.env.SKIPPER_MODE;
    savedDir = process.env.SKIPPER_DISCOVERED_DIR;
    savedCacheFile = process.env.SKIPPER_CACHE_FILE;
    delete process.env.SKIPPER_MODE;
    delete process.env.SKIPPER_DISCOVERED_DIR;
    delete process.env.SKIPPER_CACHE_FILE;
  });

  afterEach(() => {
    if (savedMode !== undefined) process.env.SKIPPER_MODE = savedMode;
    else delete process.env.SKIPPER_MODE;
    if (savedDir !== undefined) process.env.SKIPPER_DISCOVERED_DIR = savedDir;
    else delete process.env.SKIPPER_DISCOVERED_DIR;
    if (savedCacheFile !== undefined) process.env.SKIPPER_CACHE_FILE = savedCacheFile;
    else delete process.env.SKIPPER_CACHE_FILE;
  });

  it('returns an async function', () => {
    const teardown = createSkipperGlobalTeardown(config);
    expect(typeof teardown).toBe('function');
  });

  it('emits a quarantine report when SKIPPER_CACHE_FILE exists', async () => {
    const tmpDir = makeTmpDir();
    try {
      const cacheFile = writeCacheFile(tmpDir, { 'tests/a.spec.ts > test': null });
      process.env.SKIPPER_CACHE_FILE = cacheFile;
      await createSkipperGlobalTeardown(config)();
      expect(mockBuildReport).toHaveBeenCalled();
      expect(mockEmitSummary).toHaveBeenCalled();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('skips the report gracefully when SKIPPER_CACHE_FILE is not set', async () => {
    await createSkipperGlobalTeardown(config)();
    expect(mockEmitSummary).not.toHaveBeenCalled();
  });

  it('does not call SheetsWriter.sync when SKIPPER_MODE is not "sync"', async () => {
    const tmpDir = makeTmpDir();
    writeIds(tmpDir, ['tests/a.spec.ts > test']);
    process.env.SKIPPER_DISCOVERED_DIR = tmpDir;
    try {
      const teardown = createSkipperGlobalTeardown(config);
      await teardown();
      expect(mockSync).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('warns and skips when SKIPPER_DISCOVERED_DIR is not set in sync mode', async () => {
    process.env.SKIPPER_MODE = 'sync';
    const teardown = createSkipperGlobalTeardown(config);
    await teardown();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('warns and skips when the discovered dir has no files', async () => {
    process.env.SKIPPER_MODE = 'sync';
    const tmpDir = makeTmpDir(); // empty dir
    process.env.SKIPPER_DISCOVERED_DIR = tmpDir;
    try {
      await createSkipperGlobalTeardown(config)();
      expect(mockSync).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('calls SheetsWriter.sync() with merged IDs from all worker files', async () => {
    process.env.SKIPPER_MODE = 'sync';
    const tmpDir = makeTmpDir();
    const ids = ['tests/a.spec.ts > test one', 'tests/b.spec.ts > test two'];
    writeIds(tmpDir, ids);
    process.env.SKIPPER_DISCOVERED_DIR = tmpDir;

    const teardown = createSkipperGlobalTeardown(config);
    await teardown();

    expect(mockSync).toHaveBeenCalledWith(expect.arrayContaining(ids));
    expect(mockSync.mock.calls[0][0]).toHaveLength(ids.length);
    // temp dir should be cleaned up
    expect(fs.existsSync(tmpDir)).toBe(false);
  });

  it('merges and deduplicates IDs across multiple worker files', async () => {
    process.env.SKIPPER_MODE = 'sync';
    const tmpDir = makeTmpDir();
    const shared = 'tests/shared.spec.ts > shared test';
    const unique1 = 'tests/a.spec.ts > test a';
    const unique2 = 'tests/b.spec.ts > test b';

    fs.writeFileSync(path.join(tmpDir, 'w1.json'), JSON.stringify([shared, unique1]));
    fs.writeFileSync(path.join(tmpDir, 'w2.json'), JSON.stringify([shared, unique2]));
    process.env.SKIPPER_DISCOVERED_DIR = tmpDir;

    await createSkipperGlobalTeardown(config)();

    const called = mockSync.mock.calls[0][0] as string[];
    expect(called).toHaveLength(3); // deduplicated
    expect(called).toContain(shared);
    expect(called).toContain(unique1);
    expect(called).toContain(unique2);
  });

  describe('usage example — sync mode on merge to main', () => {
    /**
     * In a CI pipeline (e.g., GitHub Actions):
     *
     *   env:
     *     SKIPPER_MODE: sync
     *     SKIPPER_SPREADSHEET_ID: ${{ secrets.SKIPPER_SPREADSHEET_ID }}
     *
     * After all Jest workers finish, globalTeardown reads per-worker files from
     * SKIPPER_DISCOVERED_DIR, merges them, and calls SheetsWriter.sync() to
     * add new tests and remove stale ones from the spreadsheet.
     */
    it('syncs discovered tests to the spreadsheet in sync mode', async () => {
      process.env.SKIPPER_MODE = 'sync';
      const tmpDir = makeTmpDir();
      const discoveredIds = [
        'tests/auth/login.spec.ts > login > should log in',
        'tests/auth/login.spec.ts > login > should fail with wrong password',
        'tests/checkout/cart.spec.ts > cart > should add item',
      ];
      writeIds(tmpDir, discoveredIds);
      process.env.SKIPPER_DISCOVERED_DIR = tmpDir;

      const teardown = createSkipperGlobalTeardown(config);
      await teardown();

      expect(mockSync).toHaveBeenCalledWith(expect.arrayContaining(discoveredIds));
    });
  });
});
