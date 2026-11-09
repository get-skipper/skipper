import * as fs from 'fs';
import { SkipperReporter } from '../src/reporter';
import { buildPlaywrightTestId } from '../src/testId';

type FixtureFn = (...args: unknown[]) => Promise<void>;
type FixtureTuple = [FixtureFn, Record<string, unknown>];

// Capture the fixtures object passed to `base.extend()` without loading Playwright.
const captured: { fixtures?: Record<string, FixtureTuple> } = {};
jest.mock('@playwright/test', () => ({
  test: {
    extend: (fixtures: Record<string, FixtureTuple>) => {
      captured.fixtures = fixtures;
      return {};
    },
  },
  expect: jest.fn(),
}));
jest.mock('fs', () => ({ ...jest.requireActual('fs'), readFileSync: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('../src/fixtures');

const mockedReadFileSync = fs.readFileSync as jest.Mock;

const FUTURE_ISO = '2099-12-31T00:00:00.000Z';
const FILE = `${process.cwd()}/src/tests/api/skipperPoc.spec.ts`;

/** Shape of Playwright's `TestInfo.titlePath` (worker side): [file, ...describes, title]. */
const testInfoTitlePath = ['src/tests/api/skipperPoc.spec.ts', 'Skipper POC', 'skipperTarget'];
/** Shape of Playwright's `TestCase.titlePath()` (reporter side): ['', project, file, ...]. */
const testCaseTitlePath = ['', 'api', ...testInfoTitlePath];

function fixture(name: string): FixtureTuple {
  const f = captured.fixtures?.[name];
  if (!f) throw new Error(`fixture ${name} was not registered`);
  return f;
}

async function resolveWorkerFixture(cache: Record<string, string | null>) {
  mockedReadFileSync.mockReturnValue(JSON.stringify(cache));
  let resolver: unknown;
  await fixture('_skipperResolver')[0]({}, async (r: unknown) => {
    resolver = r;
  });
  return resolver;
}

async function runAutoSkip(resolver: unknown, titlePath: string[]) {
  const testInfo = { file: FILE, titlePath, skip: jest.fn() };
  const use = jest.fn().mockResolvedValue(undefined);
  await fixture('_skipperAutoSkip')[0]({ _skipperResolver: resolver }, use, testInfo);
  return { skip: testInfo.skip, use };
}

describe('@get-skipper/playwright fixtures', () => {
  describe('_skipperResolver worker fixture (issue #6)', () => {
    it('uses an object destructuring pattern as first argument, as Playwright requires', () => {
      const [fn, options] = fixture('_skipperResolver');
      expect(options).toEqual({ scope: 'worker' });
      // Playwright parses the function source and rejects anything but `{ ... }` here.
      expect(fn.toString()).toMatch(/^async\s*\(\s*\{\s*\}\s*,/);
    });

    it('rehydrates the resolver from the globalSetup cache file', async () => {
      const resolver = (await resolveWorkerFixture({ 'a.spec.ts > t': null })) as {
        isTestEnabled(id: string): boolean;
      };
      expect(resolver.isTestEnabled('a.spec.ts > t')).toBe(true);
    });
  });

  describe('_skipperAutoSkip test fixture (issue #7)', () => {
    it('skips a test whose row uses the documented testId format', async () => {
      const resolver = await resolveWorkerFixture({
        // `{relative file path} > {describe block(s)} > {test name}`, as in the README
        'src/tests/api/skipperpoc.spec.ts > skipper poc > skippertarget': FUTURE_ISO,
      });
      const { skip, use } = await runAutoSkip(resolver, testInfoTitlePath);
      expect(skip).toHaveBeenCalledWith(true, expect.stringContaining('[skipper]'));
      expect(use).toHaveBeenCalled();
    });

    it('does not skip tests absent from the spreadsheet', async () => {
      const resolver = await resolveWorkerFixture({});
      const { skip } = await runAutoSkip(resolver, testInfoTitlePath);
      expect(skip).not.toHaveBeenCalled();
    });

    it('skips a test using the testId written by the reporter in sync mode', async () => {
      process.env.SKIPPER_MODE = 'sync';
      const reporter = new SkipperReporter({
        spreadsheetId: 'x',
        credentials: { credentialsBase64: '' },
      });
      reporter.onTestEnd(
        { location: { file: FILE }, titlePath: () => testCaseTitlePath } as never,
        {} as never,
      );
      delete process.env.SKIPPER_MODE;
      const [reporterId] = (reporter as unknown as { discoveredIds: string[] }).discoveredIds;

      const resolver = await resolveWorkerFixture({ [reporterId.toLowerCase()]: FUTURE_ISO });
      const { skip } = await runAutoSkip(resolver, testInfoTitlePath);
      expect(skip).toHaveBeenCalled();
    });
  });
});

describe('buildPlaywrightTestId()', () => {
  it('builds the documented format from TestInfo.titlePath', () => {
    expect(buildPlaywrightTestId(FILE, testInfoTitlePath)).toBe(
      'src/tests/api/skipperPoc.spec.ts > Skipper POC > skipperTarget',
    );
  });

  it('gives the same id for the fixture and the reporter title paths', () => {
    expect(buildPlaywrightTestId(FILE, testCaseTitlePath.slice(2))).toBe(
      buildPlaywrightTestId(FILE, testInfoTitlePath),
    );
  });

  it('handles tests outside any describe block', () => {
    expect(buildPlaywrightTestId(FILE, ['src/tests/api/skipperPoc.spec.ts', 'top level'])).toBe(
      'src/tests/api/skipperPoc.spec.ts > top level',
    );
  });
});
