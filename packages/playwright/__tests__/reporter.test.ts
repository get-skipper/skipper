import { SkipperReporter } from '../src/reporter';
import { SheetsWriter } from '@skipper/core';

jest.mock('@skipper/core', () => {
  const SW = jest.fn();
  SW.prototype.sync = jest.fn();
  return {
    SheetsWriter: SW,
    buildTestId: jest.requireActual('@skipper/core').buildTestId,
    log: jest.fn(), warn: jest.fn(), error: jest.fn(),
  };
});

const MockedSheetsWriter = SheetsWriter as jest.MockedClass<typeof SheetsWriter>;

const config = {
  spreadsheetId: 'sheet-id',
  credentials: { credentialsBase64: 'dGVzdA==' },
};

function makeTestCase(file: string, titlePath: string[]): any {
  return {
    location: { file },
    titlePath: () => titlePath,
  };
}

const mockResult: any = {};
const mockFullResult: any = { status: 'passed' };

describe('SkipperReporter', () => {
  let originalMode: string | undefined;

  beforeEach(() => {
    originalMode = process.env.SKIPPER_MODE;
    delete process.env.SKIPPER_MODE;
    (MockedSheetsWriter.prototype.sync as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalMode !== undefined) process.env.SKIPPER_MODE = originalMode;
    else delete process.env.SKIPPER_MODE;
  });

  describe('onTestEnd()', () => {
    it('collects one testId per completed test', async () => {
      process.env.SKIPPER_MODE = 'sync';
      const reporter = new SkipperReporter(config);
      reporter.onTestEnd(
        makeTestCase('/project/tests/auth.spec.ts', ['', 'login', 'should log in']),
        mockResult,
      );
      reporter.onTestEnd(
        makeTestCase('/project/tests/checkout.spec.ts', ['', 'checkout', 'stripe']),
        mockResult,
      );
      await reporter.onEnd(mockFullResult);

      const syncCall = MockedSheetsWriter.prototype.sync as jest.Mock;
      expect(syncCall.mock.calls[0][0]).toHaveLength(2);
    });
  });

  describe('onEnd()', () => {
    it('does nothing when SKIPPER_MODE is not "sync"', async () => {
      const reporter = new SkipperReporter(config);
      reporter.onTestEnd(makeTestCase('/project/tests/a.spec.ts', ['', 'test']), mockResult);
      await reporter.onEnd(mockFullResult);
      expect(MockedSheetsWriter).not.toHaveBeenCalled();
    });

    it('skips sync when no tests were collected', async () => {
      process.env.SKIPPER_MODE = 'sync';
      const reporter = new SkipperReporter(config);
      await reporter.onEnd(mockFullResult);
      expect(MockedSheetsWriter).not.toHaveBeenCalled();
    });

    it('calls SheetsWriter.sync() with collected testIds in sync mode', async () => {
      process.env.SKIPPER_MODE = 'sync';
      const reporter = new SkipperReporter(config);
      reporter.onTestEnd(
        makeTestCase('/project/tests/auth.spec.ts', ['', 'login', 'should log in']),
        mockResult,
      );
      reporter.onTestEnd(
        makeTestCase('/project/tests/auth.spec.ts', ['', 'login', 'should fail']),
        mockResult,
      );
      await reporter.onEnd(mockFullResult);

      expect(MockedSheetsWriter).toHaveBeenCalledWith(config);
      const syncCall = MockedSheetsWriter.prototype.sync as jest.Mock;
      const syncArgs = syncCall.mock.calls[0][0] as string[];
      expect(syncArgs).toHaveLength(2);
      expect(syncArgs.some((id) => id.includes('should log in'))).toBe(true);
      expect(syncArgs.some((id) => id.includes('should fail'))).toBe(true);
    });
  });

  describe('usage example — @skipper/playwright end-to-end', () => {
    /**
     * Full Playwright integration:
     *
     * playwright.config.ts:
     *   globalSetup: createSkipperGlobalSetup(skipperConfig),
     *   reporter: [['list'], [SkipperReporter, skipperConfig]],
     *
     * test files:
     *   import { test, expect } from '@skipper/playwright';
     *   test('stripe payment', async ({ page }) => { ... }); // auto-skipped if disabled
     *
     * In sync mode (SKIPPER_MODE=sync), the reporter reconciles the spreadsheet
     * with all tests discovered during the run.
     */
    it('collects all test IDs and syncs them to the spreadsheet in sync mode', async () => {
      process.env.SKIPPER_MODE = 'sync';
      const reporter = new SkipperReporter(config);

      const testCases = [
        makeTestCase('/project/tests/auth/login.spec.ts', ['', 'login', 'should log in']),
        makeTestCase('/project/tests/auth/login.spec.ts', ['', 'login', 'should fail with wrong password']),
        makeTestCase('/project/tests/checkout/cart.spec.ts', ['', 'cart', 'should add item']),
      ];

      for (const tc of testCases) reporter.onTestEnd(tc, mockResult);
      await reporter.onEnd(mockFullResult);

      const syncCall = MockedSheetsWriter.prototype.sync as jest.Mock;
      expect(syncCall).toHaveBeenCalledTimes(1);
      expect(syncCall.mock.calls[0][0]).toHaveLength(3);
    });
  });
});
