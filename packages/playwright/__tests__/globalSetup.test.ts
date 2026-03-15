import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createSkipperGlobalSetup, SKIPPER_CACHE_PATH } from '../src/globalSetup';
import { SkipperResolver } from '@skipper/core';

jest.mock('fs');
jest.mock('@skipper/core', () => {
  const SR = jest.fn();
  SR.prototype.initialize = jest.fn();
  SR.prototype.toJSON = jest.fn();
  return { SkipperResolver: SR, log: jest.fn(), warn: jest.fn(), error: jest.fn() };
});

const MockedSkipperResolver = SkipperResolver as jest.MockedClass<typeof SkipperResolver>;
const mockedFs = fs as jest.Mocked<typeof fs>;

const MOCK_CACHE = {
  'tests/auth.spec.ts > login': null,
  'tests/checkout.spec.ts > payment': '2099-12-31T00:00:00.000Z',
};

const config = {
  spreadsheetId: 'sheet-id',
  credentials: { credentialsBase64: 'dGVzdA==' },
};

describe('createSkipperGlobalSetup() — @skipper/playwright', () => {
  beforeEach(() => {
    (MockedSkipperResolver.prototype.initialize as jest.Mock).mockResolvedValue(undefined);
    (MockedSkipperResolver.prototype.toJSON as jest.Mock).mockReturnValue(MOCK_CACHE);
  });

  it('exports SKIPPER_CACHE_PATH in the os temp directory', () => {
    expect(SKIPPER_CACHE_PATH).toContain(os.tmpdir());
    expect(SKIPPER_CACHE_PATH).toContain('.skipper-playwright-cache.json');
  });

  it('returns an async function', () => {
    const setup = createSkipperGlobalSetup(config);
    expect(typeof setup).toBe('function');
  });

  it('creates a SkipperResolver and calls initialize()', async () => {
    const setup = createSkipperGlobalSetup(config);
    await setup();
    expect(MockedSkipperResolver).toHaveBeenCalledWith(config);
    expect(MockedSkipperResolver.mock.instances[0].initialize).toHaveBeenCalledTimes(1);
  });

  it('writes the serialized cache as JSON to the temp file', async () => {
    const setup = createSkipperGlobalSetup(config);
    await setup();

    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
      SKIPPER_CACHE_PATH,
      expect.any(String),
      'utf8',
    );

    const written = (mockedFs.writeFileSync as jest.Mock).mock.calls[0][1] as string;
    const parsed = JSON.parse(written) as Record<string, string | null>;
    // Use bracket notation — toHaveProperty treats dots/slashes as path separators
    expect(parsed['tests/auth.spec.ts > login']).toBeNull();
    expect(parsed['tests/checkout.spec.ts > payment']).toBeDefined();
  });

  describe('usage example — Playwright globalSetup configuration', () => {
    /**
     * In playwright.config.ts:
     *
     *   import { createSkipperGlobalSetup, SkipperReporter } from '@skipper/playwright';
     *
     *   const skipperConfig = {
     *     spreadsheetId: process.env.SKIPPER_SPREADSHEET_ID!,
     *     credentials: { credentialsFile: './service-account.json' },
     *   };
     *
     *   export default defineConfig({
     *     globalSetup: createSkipperGlobalSetup(skipperConfig),
     *     reporter: [['list'], [SkipperReporter, skipperConfig]],
     *   });
     *
     * In test files:
     *   import { test, expect } from '@skipper/playwright';
     *   // replaces: import { test, expect } from '@playwright/test'
     *
     * globalSetup() runs once before all workers:
     * - fetches the Google Spreadsheet
     * - writes a cache file that worker processes read via SkipperResolver.fromJSON()
     */
    it('writes the cache file so worker processes can rehydrate the resolver', async () => {
      const setup = createSkipperGlobalSetup(config);
      await setup();

      const writtenPath = (mockedFs.writeFileSync as jest.Mock).mock.calls[0][0];
      const writtenContent = (mockedFs.writeFileSync as jest.Mock).mock.calls[0][1];
      expect(writtenPath).toBe(path.join(os.tmpdir(), '.skipper-playwright-cache.json'));
      expect(() => JSON.parse(writtenContent as string)).not.toThrow();
    });
  });
});
