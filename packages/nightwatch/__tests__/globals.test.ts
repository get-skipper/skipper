import { createSkipperPlugin } from '../src/globals';
import { SkipperResolver, SheetsWriter } from '@get-skipper/core';

jest.mock('@get-skipper/core', () => {
  const SR = jest.fn();
  SR.prototype.initialize = jest.fn();
  SR.prototype.isTestEnabled = jest.fn();
  const SW = jest.fn();
  SW.prototype.sync = jest.fn();
  return {
    SkipperResolver: SR,
    SheetsWriter: SW,
    buildTestId: jest.requireActual('@get-skipper/core').buildTestId,
    log: jest.fn(), warn: jest.fn(), error: jest.fn(),
  };
});

const MockedSkipperResolver = SkipperResolver as jest.MockedClass<typeof SkipperResolver>;
const MockedSheetsWriter = SheetsWriter as jest.MockedClass<typeof SheetsWriter>;

const config = {
  spreadsheetId: 'sheet-id',
  credentials: { credentialsBase64: 'dGVzdA==' },
};

function makeBrowser(currentTest: object = {}): any {
  return { skip: jest.fn(), currentTest };
}

describe('createSkipperPlugin() — @get-skipper/nightwatch', () => {
  let originalMode: string | undefined;

  beforeEach(() => {
    originalMode = process.env.SKIPPER_MODE;
    delete process.env.SKIPPER_MODE;
    (MockedSkipperResolver.prototype.initialize as jest.Mock).mockResolvedValue(undefined);
    (MockedSkipperResolver.prototype.isTestEnabled as jest.Mock).mockReturnValue(true);
    (MockedSheetsWriter.prototype.sync as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalMode !== undefined) process.env.SKIPPER_MODE = originalMode;
    else delete process.env.SKIPPER_MODE;
  });

  it('returns an object with before, beforeEach and after hooks', () => {
    const plugin = createSkipperPlugin(config);
    expect(typeof plugin.before).toBe('function');
    expect(typeof plugin.beforeEach).toBe('function');
    expect(typeof plugin.after).toBe('function');
  });

  describe('before()', () => {
    it('creates and initializes a SkipperResolver', async () => {
      const plugin = createSkipperPlugin(config);
      await plugin.before();
      expect(MockedSkipperResolver).toHaveBeenCalledWith(config);
      expect(MockedSkipperResolver.mock.instances[0].initialize).toHaveBeenCalledTimes(1);
    });
  });

  describe('beforeEach()', () => {
    it('calls done() even when resolver is not yet initialized', () => {
      const plugin = createSkipperPlugin(config);
      const done = jest.fn();
      const browser = makeBrowser();
      plugin.beforeEach(browser, done);
      expect(done).toHaveBeenCalledTimes(1);
      expect(browser.skip).not.toHaveBeenCalled();
    });

    it('skips the test when the resolver says it is disabled', async () => {
      (MockedSkipperResolver.prototype.isTestEnabled as jest.Mock).mockReturnValue(false);
      const plugin = createSkipperPlugin(config);
      await plugin.before();

      const browser = makeBrowser({ name: 'should log in', module: 'tests/auth.spec.ts' });
      const done = jest.fn();
      plugin.beforeEach(browser, done);

      expect(browser.skip).toHaveBeenCalledTimes(1);
      expect(done).toHaveBeenCalledTimes(1);
    });

    it('does not skip the test when the resolver says it is enabled', async () => {
      (MockedSkipperResolver.prototype.isTestEnabled as jest.Mock).mockReturnValue(true);
      const plugin = createSkipperPlugin(config);
      await plugin.before();

      const browser = makeBrowser({ name: 'should log in', module: 'tests/auth.spec.ts' });
      const done = jest.fn();
      plugin.beforeEach(browser, done);

      expect(browser.skip).not.toHaveBeenCalled();
      expect(done).toHaveBeenCalledTimes(1);
    });

    it('uses titlePath when available', async () => {
      const plugin = createSkipperPlugin(config);
      await plugin.before();

      const browser = makeBrowser({
        name: 'should log in',
        module: 'tests/auth.spec.ts',
        titlePath: ['login', 'should log in'],
      });
      const done = jest.fn();
      plugin.beforeEach(browser, done);

      const isEnabledCall = MockedSkipperResolver.prototype.isTestEnabled as jest.Mock;
      expect(isEnabledCall).toHaveBeenCalledWith(
        expect.stringContaining('login > should log in'),
      );
    });

    it('falls back to [name] when titlePath is not available', async () => {
      const plugin = createSkipperPlugin(config);
      await plugin.before();

      const browser = makeBrowser({ name: 'should log in', module: 'tests/auth.spec.ts' });
      const done = jest.fn();
      plugin.beforeEach(browser, done);

      const isEnabledCall = MockedSkipperResolver.prototype.isTestEnabled as jest.Mock;
      expect(isEnabledCall).toHaveBeenCalledWith(
        expect.stringContaining('should log in'),
      );
    });
  });

  describe('after()', () => {
    it('does nothing when SKIPPER_MODE is not "sync"', async () => {
      const plugin = createSkipperPlugin(config);
      await plugin.before();
      await plugin.after();
      expect(MockedSheetsWriter).not.toHaveBeenCalled();
    });

    it('skips sync when no tests were discovered', async () => {
      process.env.SKIPPER_MODE = 'sync';
      const plugin = createSkipperPlugin(config);
      await plugin.before();
      await plugin.after();
      expect(MockedSheetsWriter).not.toHaveBeenCalled();
    });

    it('calls SheetsWriter.sync() with all discovered IDs in sync mode', async () => {
      process.env.SKIPPER_MODE = 'sync';
      const plugin = createSkipperPlugin(config);
      await plugin.before();

      const done = jest.fn();
      plugin.beforeEach(makeBrowser({ name: 'test 1', module: 'tests/a.spec.ts' }), done);
      plugin.beforeEach(makeBrowser({ name: 'test 2', module: 'tests/b.spec.ts' }), done);

      await plugin.after();

      expect(MockedSheetsWriter).toHaveBeenCalledWith(config);
      const syncCall = MockedSheetsWriter.prototype.sync as jest.Mock;
      const syncArgs = syncCall.mock.calls[0][0] as string[];
      expect(syncArgs.some((id) => id.includes('test 1'))).toBe(true);
      expect(syncArgs.some((id) => id.includes('test 2'))).toBe(true);
    });
  });

  describe('usage example — @get-skipper/nightwatch in nightwatch.conf.js', () => {
    /**
     * nightwatch.conf.js:
     *
     *   const { createSkipperPlugin } = require('@get-skipper/nightwatch');
     *
     *   module.exports = {
     *     globals: createSkipperPlugin({
     *       spreadsheetId: process.env.SKIPPER_SPREADSHEET_ID,
     *       credentials: { credentialsFile: './service-account.json' },
     *     }),
     *   };
     *
     * Zero changes to test files needed.
     * - before:     loads the spreadsheet
     * - beforeEach: skips the test if disabled
     * - after:      syncs the spreadsheet (sync mode only)
     */
    it('demonstrates the complete lifecycle for a disabled and an enabled test', async () => {
      (MockedSkipperResolver.prototype.isTestEnabled as jest.Mock)
        .mockReturnValueOnce(false) // first test → disabled
        .mockReturnValueOnce(true); // second test → enabled

      const plugin = createSkipperPlugin(config);
      await plugin.before();

      const done = jest.fn();
      const disabledBrowser = makeBrowser({ name: 'stripe payment', module: 'tests/checkout.spec.ts' });
      const enabledBrowser = makeBrowser({ name: 'login', module: 'tests/auth.spec.ts' });

      plugin.beforeEach(disabledBrowser, done);
      plugin.beforeEach(enabledBrowser, done);

      expect(disabledBrowser.skip).toHaveBeenCalledTimes(1);
      expect(enabledBrowser.skip).not.toHaveBeenCalled();
    });
  });
});
