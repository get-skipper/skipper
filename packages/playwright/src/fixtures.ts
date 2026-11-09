import * as fs from 'fs';
import { test as base } from '@playwright/test';
import { SkipperResolver } from '@get-skipper/core';
import { SKIPPER_CACHE_PATH } from './globalSetup';
import { buildPlaywrightTestId } from './testId';

type SkipperWorkerFixtures = {
  _skipperResolver: SkipperResolver;
};

type SkipperTestFixtures = {
  _skipperAutoSkip: void;
};

/**
 * Extended Playwright `test` that automatically skips tests disabled in the spreadsheet.
 *
 * The resolver is initialized once per worker (reading from the cache file written
 * by the globalSetup). Each test is checked via an auto-use fixture.
 *
 * Usage: replace `import { test } from '@playwright/test'`
 *        with    `import { test } from '@get-skipper/playwright'`
 */
export const test = base.extend<SkipperTestFixtures, SkipperWorkerFixtures>({
  _skipperResolver: [
    // Playwright parses the fixture source and requires the first argument to be an
    // object destructuring pattern, so `{}` must stay as is (see issue #6).
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const raw = fs.readFileSync(SKIPPER_CACHE_PATH, 'utf8');
      const data = JSON.parse(raw) as Record<string, string | null>;
      const resolver = SkipperResolver.fromJSON(data);
      await use(resolver);
    },
    { scope: 'worker' },
  ],

  _skipperAutoSkip: [
    async ({ _skipperResolver }, use, testInfo) => {
      const testId = buildPlaywrightTestId(testInfo.file, testInfo.titlePath);

      if (!_skipperResolver.isTestEnabled(testId)) {
        testInfo.skip(true, `[skipper] Disabled until date in spreadsheet has not passed yet.`);
      }

      await use();
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
