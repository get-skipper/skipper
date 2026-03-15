import * as fs from 'fs';
import { createSkipperGlobalSetup, SKIPPER_CACHE_PATH } from '../src/globalSetup';
import { SkipperResolver } from '@skipper/core';

jest.mock('@skipper/core', () => {
  const SR = jest.fn();
  SR.prototype.initialize = jest.fn();
  SR.prototype.toJSON = jest.fn();
  return { SkipperResolver: SR, log: jest.fn(), warn: jest.fn(), error: jest.fn() };
});

const MockedSkipperResolver = SkipperResolver as jest.MockedClass<typeof SkipperResolver>;

const MOCK_CACHE = {
  'tests/auth.spec.ts > login': null,
  'tests/checkout.spec.ts > payment': '2099-12-31T00:00:00.000Z',
};

const config = {
  spreadsheetId: 'sheet-id',
  credentials: { credentialsBase64: 'dGVzdA==' },
};

describe('createSkipperGlobalSetup() — @skipper/vitest', () => {
  beforeEach(() => {
    if (fs.existsSync(SKIPPER_CACHE_PATH)) fs.unlinkSync(SKIPPER_CACHE_PATH);
    (MockedSkipperResolver.prototype.initialize as jest.Mock).mockResolvedValue(undefined);
    (MockedSkipperResolver.prototype.toJSON as jest.Mock).mockReturnValue(MOCK_CACHE);
  });

  afterEach(() => {
    if (fs.existsSync(SKIPPER_CACHE_PATH)) fs.unlinkSync(SKIPPER_CACHE_PATH);
  });

  it('returns an async function', () => {
    const setup = createSkipperGlobalSetup(config);
    expect(typeof setup).toBe('function');
  });

  it('creates a SkipperResolver with the provided config and calls initialize()', async () => {
    const setup = createSkipperGlobalSetup(config);
    await setup();
    expect(MockedSkipperResolver).toHaveBeenCalledWith(config);
    expect(MockedSkipperResolver.mock.instances[0].initialize).toHaveBeenCalledTimes(1);
  });

  it('writes the serialized cache to SKIPPER_CACHE_PATH temp file', async () => {
    const setup = createSkipperGlobalSetup(config);
    await setup();

    expect(fs.existsSync(SKIPPER_CACHE_PATH)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(SKIPPER_CACHE_PATH, 'utf8'));
    expect(parsed['tests/auth.spec.ts > login']).toBeNull();
    expect(parsed['tests/checkout.spec.ts > payment']).toBeDefined();
  });

  describe('usage example — @skipper/vitest in vitest.config.ts', () => {
    /**
     * vitest.config.ts:
     *
     *   import { createSkipperGlobalSetup, createSkipperGlobalTeardown, setupFile } from '@skipper/vitest';
     *
     *   const skipperConfig = {
     *     spreadsheetId: process.env.SKIPPER_SPREADSHEET_ID!,
     *     credentials: { credentialsBase64: process.env.GOOGLE_CREDS_B64! },
     *   };
     *
     *   export default defineConfig({
     *     test: {
     *       globalSetup: [createSkipperGlobalSetup(skipperConfig)],
     *       globalTeardown: [createSkipperGlobalTeardown(skipperConfig)],
     *       setupFiles: [setupFile],
     *     },
     *   });
     *
     * createSkipperGlobalSetup() runs in the main process before worker threads start.
     * The cache is written to SKIPPER_CACHE_PATH (a fixed temp file path) and read by
     * setup.ts in each worker thread — avoiding env var size limits for large suites.
     */
    it('writes a readable cache file that worker threads can use to rehydrate a resolver', async () => {
      const setup = createSkipperGlobalSetup(config);
      await setup();

      expect(fs.existsSync(SKIPPER_CACHE_PATH)).toBe(true);
      const raw = fs.readFileSync(SKIPPER_CACHE_PATH, 'utf8');
      expect(() => JSON.parse(raw)).not.toThrow();

      const { SkipperResolver: SR } = jest.requireActual('@skipper/core') as typeof import('@skipper/core');
      const workerResolver = SR.fromJSON(JSON.parse(raw));
      expect(typeof workerResolver.isTestEnabled).toBe('function');
    });
  });
});
