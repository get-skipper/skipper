import * as fs from 'fs';
import { createSkipperPlugin } from '../src/plugin';
import { SkipperResolver, SheetsWriter } from '@skipper/core';

jest.mock('fs');
jest.mock('@skipper/core', () => {
  const SR = jest.fn();
  SR.prototype.initialize = jest.fn();
  SR.prototype.toJSON = jest.fn();
  const SW = jest.fn();
  SW.prototype.sync = jest.fn();
  return {
    SkipperResolver: SR,
    SheetsWriter: SW,
    buildTestId: jest.requireActual('@skipper/core').buildTestId,
    log: jest.fn(), warn: jest.fn(), error: jest.fn(),
  };
});

const MockedSkipperResolver = SkipperResolver as jest.MockedClass<typeof SkipperResolver>;
const MockedSheetsWriter = SheetsWriter as jest.MockedClass<typeof SheetsWriter>;
const mockedFs = fs as jest.Mocked<typeof fs>;

const config = {
  spreadsheetId: 'sheet-id',
  credentials: { credentialsBase64: 'dGVzdA==' },
};

type EventHandler = (...args: any[]) => any;

function captureHandlers(plugin: ReturnType<typeof createSkipperPlugin>) {
  const handlers: Record<string, EventHandler> = {};
  const on = jest.fn((event: string, handler: EventHandler) => {
    handlers[event] = handler;
  });
  plugin(on);
  return { on, handlers };
}

describe('createSkipperPlugin() — @skipper/cypress', () => {
  let originalMode: string | undefined;

  beforeEach(() => {
    originalMode = process.env.SKIPPER_MODE;
    delete process.env.SKIPPER_MODE;
    (MockedSkipperResolver.prototype.initialize as jest.Mock).mockResolvedValue(undefined);
    (MockedSkipperResolver.prototype.toJSON as jest.Mock).mockReturnValue({
      'tests/auth.spec.ts > login': null,
    });
    (MockedSheetsWriter.prototype.sync as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalMode !== undefined) process.env.SKIPPER_MODE = originalMode;
    else delete process.env.SKIPPER_MODE;
  });

  it('returns a setupNodeEvents function', () => {
    const plugin = createSkipperPlugin(config);
    expect(typeof plugin).toBe('function');
  });

  it('registers handlers for "before:run" and "after:run"', () => {
    const plugin = createSkipperPlugin(config);
    const { on } = captureHandlers(plugin);
    expect(on).toHaveBeenCalledWith('before:run', expect.any(Function));
    expect(on).toHaveBeenCalledWith('after:run', expect.any(Function));
  });

  describe('before:run handler', () => {
    it('initializes SkipperResolver and writes the cache to a temp file', async () => {
      const plugin = createSkipperPlugin(config);
      const { handlers } = captureHandlers(plugin);

      await handlers['before:run']();

      expect(MockedSkipperResolver).toHaveBeenCalledWith(config);
      expect(MockedSkipperResolver.mock.instances[0].initialize).toHaveBeenCalledTimes(1);
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.skipper-cypress-cache.json'),
        expect.any(String),
        'utf8',
      );
    });

    it('writes valid JSON to the cache file', async () => {
      const plugin = createSkipperPlugin(config);
      const { handlers } = captureHandlers(plugin);

      await handlers['before:run']();

      const [, content] = (mockedFs.writeFileSync as jest.Mock).mock.calls[0];
      expect(() => JSON.parse(content as string)).not.toThrow();
    });
  });

  describe('after:run handler', () => {
    const mockResults = {
      runs: [
        {
          spec: { relative: 'cypress/e2e/auth.cy.ts' },
          tests: [{ title: ['login', 'should log in'] }, { title: ['login', 'should fail'] }],
        },
      ],
    };

    it('does nothing when SKIPPER_MODE is not "sync"', async () => {
      const plugin = createSkipperPlugin(config);
      const { handlers } = captureHandlers(plugin);

      await handlers['after:run'](mockResults);

      expect(MockedSheetsWriter).not.toHaveBeenCalled();
    });

    it('calls SheetsWriter.sync() with discovered test IDs in sync mode', async () => {
      process.env.SKIPPER_MODE = 'sync';
      const plugin = createSkipperPlugin(config);
      const { handlers } = captureHandlers(plugin);

      await handlers['after:run'](mockResults);

      expect(MockedSheetsWriter).toHaveBeenCalledWith(config);
      const syncCall = MockedSheetsWriter.prototype.sync as jest.Mock;
      expect(syncCall).toHaveBeenCalledTimes(1);
      expect(syncCall.mock.calls[0][0]).toHaveLength(2);
    });

    it('skips sync when no tests are present in results', async () => {
      process.env.SKIPPER_MODE = 'sync';
      const plugin = createSkipperPlugin(config);
      const { handlers } = captureHandlers(plugin);

      await handlers['after:run']({ runs: [] });

      expect(MockedSheetsWriter).not.toHaveBeenCalled();
    });

    it('handles null results gracefully', async () => {
      process.env.SKIPPER_MODE = 'sync';
      const plugin = createSkipperPlugin(config);
      const { handlers } = captureHandlers(plugin);
      await expect(handlers['after:run'](null)).resolves.toBeUndefined();
    });
  });

  describe('usage example — @skipper/cypress in cypress.config.ts', () => {
    /**
     * cypress.config.ts:
     *
     *   import { defineConfig } from 'cypress';
     *   import { createSkipperPlugin } from '@skipper/cypress';
     *
     *   const skipperConfig = {
     *     spreadsheetId: process.env.SKIPPER_SPREADSHEET_ID!,
     *     credentials: { credentialsFile: './service-account.json' },
     *   };
     *
     *   export default defineConfig({
     *     e2e: {
     *       setupNodeEvents: createSkipperPlugin(skipperConfig),
     *       supportFile: require.resolve('@skipper/cypress/support'),
     *     },
     *   });
     *
     * The plugin:
     * - before:run: loads the spreadsheet and writes a cache file for support.ts
     * - after:run:  in sync mode, reconciles the spreadsheet with discovered tests
     * - support.ts: reads the cache in each test process and skips disabled tests
     */
    it('demonstrates the full before:run → after:run lifecycle', async () => {
      process.env.SKIPPER_MODE = 'sync';
      const plugin = createSkipperPlugin(config);
      const { handlers } = captureHandlers(plugin);

      await handlers['before:run']();

      const results = {
        runs: [
          {
            spec: { relative: 'cypress/e2e/auth.cy.ts' },
            tests: [
              { title: ['login', 'should log in with valid credentials'] },
              { title: ['login', 'should fail with wrong password'] },
            ],
          },
          {
            spec: { relative: 'cypress/e2e/checkout.cy.ts' },
            tests: [{ title: ['checkout', 'should add item to cart'] }],
          },
        ],
      };
      await handlers['after:run'](results);

      const syncCall = MockedSheetsWriter.prototype.sync as jest.Mock;
      expect(syncCall.mock.calls[0][0]).toHaveLength(3);
    });
  });
});
