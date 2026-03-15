/**
 * Tests for packages/jest/src/setup.ts — the per-worker setup file that
 * overrides global.test / global.it so disabled tests are skipped automatically.
 *
 * Strategy: the module executes side-effects at load time (overrides globals,
 * reads SKIPPER_CACHE_FILE). We use jest.isolateModules() + require() to load a
 * fresh copy of the module with controlled env vars and mocked globals.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildTestId } from '@get-skipper/core';

// ── Helpers ───────────────────────────────────────────────────────────────────

type TestLike = jest.Mock & {
  skip: jest.Mock;
  only: jest.Mock;
  each: jest.Mock;
};

function makeMockTest(): TestLike {
  const t = jest.fn() as jest.Mock;
  (t as TestLike).skip = jest.fn();
  (t as TestLike).only = jest.fn();
  (t as TestLike).each = jest.fn();
  return t as TestLike;
}

/** Write the given cache object to a temp file and set SKIPPER_CACHE_FILE. */
function setCacheFile(cacheData: Record<string, string | null>): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skipper-setup-test-cache-'));
  const cacheFile = path.join(tmpDir, 'cache.json');
  fs.writeFileSync(cacheFile, JSON.stringify(cacheData), 'utf8');
  process.env.SKIPPER_CACHE_FILE = cacheFile;
  return tmpDir;
}

function makeCacheWith(testId: string, isoDate: string | null): Record<string, string | null> {
  // setup.ts normalizes IDs, so we use the same normalization (lowercase)
  return { [testId.toLowerCase()]: isoDate };
}

/** Load setup.ts in an isolated module registry. */
function loadSetup(): void {
  jest.isolateModules(() => {
    require('../src/setup');
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('@get-skipper/jest setup.ts', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = global as any;
  let mockTest: TestLike;
  let savedTest: unknown;
  let savedIt: unknown;
  let savedDescribe: unknown;
  let savedAfterAll: unknown;
  let capturedAfterAll: (() => void) | null;
  let cacheDir: string | undefined;

  beforeEach(() => {
    savedTest = g.test;
    savedIt = g.it;
    savedDescribe = g.describe;
    savedAfterAll = g.afterAll;
    capturedAfterAll = null;
    cacheDir = undefined;

    mockTest = makeMockTest();
    g.test = mockTest;
    g.it = mockTest;
    g.describe = jest.fn((name: string, fn: () => void) => fn());
    // Capture the afterAll callback so we can invoke it manually in tests
    g.afterAll = jest.fn((fn: () => void) => { capturedAfterAll = fn; });
  });

  afterEach(() => {
    g.test = savedTest;
    g.it = savedIt;
    g.describe = savedDescribe;
    g.afterAll = savedAfterAll;
    delete process.env.SKIPPER_CACHE_FILE;
    delete process.env.SKIPPER_DISCOVERED_DIR;
    delete process.env.JEST_WORKER_ID;
    if (cacheDir && fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  it('throws when SKIPPER_CACHE_FILE is not set', () => {
    delete process.env.SKIPPER_CACHE_FILE;
    expect(() => loadSetup()).toThrow('SKIPPER_CACHE_FILE is not set');
  });

  it('replaces global.test and global.it with wrapped versions', () => {
    cacheDir = setCacheFile({});
    loadSetup();
    expect(g.test).not.toBe(mockTest);
    expect(g.it).not.toBe(mockTest);
  });

  it('runs enabled tests normally (calls originalTest)', () => {
    cacheDir = setCacheFile({}); // no disabled tests
    loadSetup();

    const fn = jest.fn();
    g.test('my enabled test', fn);

    expect(mockTest).toHaveBeenCalledWith('my enabled test', fn, undefined);
    expect(mockTest.skip).not.toHaveBeenCalled();
  });

  it('skips tests that are disabled in the cache', () => {
    // Build the testId as setup.ts would: buildTestId(testPath, [testName])
    const testPath: string = (expect.getState().testPath as string | undefined) ?? '';
    const testName = 'my disabled test';
    const testId = buildTestId(testPath, [testName]).toLowerCase();
    const futureDate = new Date(Date.now() + 86_400_000).toISOString();

    cacheDir = setCacheFile(makeCacheWith(testId, futureDate));
    loadSetup();

    const fn = jest.fn();
    g.test(testName, fn);

    expect(mockTest.skip).toHaveBeenCalledWith(testName, fn, undefined);
    expect(mockTest).not.toHaveBeenCalled();
  });

  it('runs tests whose disabledUntil date has passed', () => {
    const testPath: string = (expect.getState().testPath as string | undefined) ?? '';
    const testName = 'my re-enabled test';
    const testId = buildTestId(testPath, [testName]).toLowerCase();
    const pastDate = new Date(Date.now() - 86_400_000).toISOString(); // yesterday

    cacheDir = setCacheFile(makeCacheWith(testId, pastDate));
    loadSetup();

    const fn = jest.fn();
    g.test(testName, fn);

    expect(mockTest).toHaveBeenCalledWith(testName, fn, undefined);
    expect(mockTest.skip).not.toHaveBeenCalled();
  });

  it('calls originalTest directly when fn is undefined (test.todo pattern)', () => {
    cacheDir = setCacheFile({});
    loadSetup();

    g.test('todo test');

    expect(mockTest).toHaveBeenCalledWith('todo test', undefined, undefined);
  });

  it('writes discovered test IDs to SKIPPER_DISCOVERED_DIR via the afterAll hook', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skipper-setup-test-'));
    try {
      cacheDir = setCacheFile({});
      process.env.SKIPPER_DISCOVERED_DIR = tmpDir;
      process.env.JEST_WORKER_ID = '1';

      loadSetup();

      g.test('first test', jest.fn());
      g.test('second test', jest.fn());

      // Invoke the afterAll callback that setup.ts registered
      expect(capturedAfterAll).not.toBeNull();
      capturedAfterAll!();

      const files = fs.readdirSync(tmpDir);
      expect(files).toHaveLength(1);
      const ids = JSON.parse(fs.readFileSync(path.join(tmpDir, files[0]), 'utf8')) as string[];
      expect(ids).toHaveLength(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('does not write to disk when SKIPPER_DISCOVERED_DIR is not set', () => {
    cacheDir = setCacheFile({});
    // SKIPPER_DISCOVERED_DIR not set → afterAll not registered
    loadSetup();

    g.test('some test', jest.fn());

    // afterAll should NOT have been called (no dir set)
    expect(g.afterAll).not.toHaveBeenCalled();
  });

  describe('usage example — automatic test skipping', () => {
    /**
     * Once configured in jest.config.ts via `setupFilesAfterEnv: [setupFile]`,
     * every call to test() / it() is intercepted:
     *
     *   test('stripe payment', async () => { ... });
     *   // ↑ automatically skipped if this test's ID is disabled in the spreadsheet
     *
     * No changes are needed in test files — just configure the plugin once.
     */
    it('demonstrates transparent test skipping without modifying test files', () => {
      const testPath = (expect.getState().testPath as string | undefined) ?? '';
      const disabledId = buildTestId(testPath, ['checkout', 'stripe payment']).toLowerCase();

      cacheDir = setCacheFile({
        [disabledId]: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      });

      loadSetup();

      const stripeFn = jest.fn();
      const loginFn = jest.fn();

      g.describe('checkout', () => {
        g.test('stripe payment', stripeFn);
      });
      g.test('login', loginFn);

      // stripe payment → disabled → .skip was called
      expect(mockTest.skip).toHaveBeenCalledWith('stripe payment', stripeFn, undefined);
      // login → not in spreadsheet → runs normally
      expect(mockTest).toHaveBeenCalledWith('login', loginFn, undefined);
    });
  });
});
