import * as fs from 'fs';
import { createSkipperGlobalSetup } from '../src/globalSetup';
import { SkipperResolver } from '@get-skipper/core';

jest.mock('@get-skipper/core', () => {
  const SR = jest.fn();
  SR.prototype.initialize = jest.fn();
  SR.prototype.toJSON = jest.fn();
  return { SkipperResolver: SR, log: jest.fn(), warn: jest.fn(), error: jest.fn() };
});

const MockedSkipperResolver = SkipperResolver as jest.MockedClass<typeof SkipperResolver>;

const MOCK_CACHE = { 'tests/a.spec.ts > test': null };

const config = {
  spreadsheetId: 'sheet-id',
  credentials: { credentialsBase64: 'dGVzdA==' },
};

describe('createSkipperGlobalSetup()', () => {
  let originalCacheFile: string | undefined;
  let originalDiscoveredDir: string | undefined;

  beforeEach(() => {
    originalCacheFile = process.env.SKIPPER_CACHE_FILE;
    originalDiscoveredDir = process.env.SKIPPER_DISCOVERED_DIR;
    delete process.env.SKIPPER_CACHE_FILE;
    delete process.env.SKIPPER_DISCOVERED_DIR;
    (MockedSkipperResolver.prototype.initialize as jest.Mock).mockResolvedValue(undefined);
    (MockedSkipperResolver.prototype.toJSON as jest.Mock).mockReturnValue(MOCK_CACHE);
  });

  afterEach(() => {
    // Clean up the temp directory created by setup
    const dir = process.env.SKIPPER_DISCOVERED_DIR;
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });

    if (originalCacheFile !== undefined) process.env.SKIPPER_CACHE_FILE = originalCacheFile;
    else delete process.env.SKIPPER_CACHE_FILE;
    if (originalDiscoveredDir !== undefined) process.env.SKIPPER_DISCOVERED_DIR = originalDiscoveredDir;
    else delete process.env.SKIPPER_DISCOVERED_DIR;
  });

  it('returns an async function', () => {
    const setup = createSkipperGlobalSetup(config);
    expect(typeof setup).toBe('function');
  });

  it('initializes a SkipperResolver with the provided config', async () => {
    const setup = createSkipperGlobalSetup(config);
    await setup();
    expect(MockedSkipperResolver).toHaveBeenCalledWith(config);
    expect(MockedSkipperResolver.mock.instances[0].initialize).toHaveBeenCalledTimes(1);
  });

  it('writes the resolver cache to a temp file and sets SKIPPER_CACHE_FILE', async () => {
    const setup = createSkipperGlobalSetup(config);
    await setup();

    const cacheFile = process.env.SKIPPER_CACHE_FILE;
    expect(cacheFile).toBeDefined();
    expect(fs.existsSync(cacheFile!)).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(cacheFile!, 'utf8'));
    expect(parsed).toEqual(MOCK_CACHE);
  });

  it('sets SKIPPER_DISCOVERED_DIR to the same temp directory as the cache file', async () => {
    const setup = createSkipperGlobalSetup(config);
    await setup();

    const dir = process.env.SKIPPER_DISCOVERED_DIR;
    const cacheFile = process.env.SKIPPER_CACHE_FILE;
    expect(dir).toBeDefined();
    expect(cacheFile).toBeDefined();
    expect(cacheFile!.startsWith(dir!)).toBe(true);
  });

  it('creates a fresh temp directory on each call', async () => {
    const setup = createSkipperGlobalSetup(config);
    await setup();
    const dir1 = process.env.SKIPPER_DISCOVERED_DIR;
    if (dir1 && fs.existsSync(dir1)) fs.rmSync(dir1, { recursive: true, force: true });

    await setup();
    const dir2 = process.env.SKIPPER_DISCOVERED_DIR;

    expect(dir1).not.toBe(dir2);
    if (dir2 && fs.existsSync(dir2)) fs.rmSync(dir2, { recursive: true, force: true });
  });

  describe('usage example — @get-skipper/jest in jest.config.ts', () => {
    /**
     * In your jest.config.ts:
     *
     *   import { createSkipperGlobalSetup, createSkipperGlobalTeardown, setupFile } from '@get-skipper/jest';
     *
     *   const skipperConfig = {
     *     spreadsheetId: process.env.SKIPPER_SPREADSHEET_ID!,
     *     credentials: { credentialsBase64: process.env.GOOGLE_CREDS_B64! },
     *   };
     *
     *   export default {
     *     globalSetup: createSkipperGlobalSetup(skipperConfig),
     *     globalTeardown: createSkipperGlobalTeardown(skipperConfig),
     *     setupFilesAfterEnv: [setupFile],
     *   };
     *
     * createSkipperGlobalSetup() runs once before all test workers start.
     * The cache is written to a temp file (SKIPPER_CACHE_FILE) rather than an
     * env var, avoiding OS limits for large test suites. Workers read the file.
     */
    it('propagates the cache via a readable temp file so worker processes can load it', async () => {
      const setup = createSkipperGlobalSetup(config);
      await setup();

      const cacheFile = process.env.SKIPPER_CACHE_FILE;
      expect(cacheFile).toBeDefined();
      expect(() => JSON.parse(fs.readFileSync(cacheFile!, 'utf8'))).not.toThrow();
    });
  });
});
