import * as fs from 'fs';
import { test as base } from '@playwright/test';
import { SkipperResolver, buildTestId } from '@get-skipper/core';
import { SKIPPER_CACHE_PATH } from './globalSetup';

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
    async (_: Record<never, never>, use) => {
      const raw = fs.readFileSync(SKIPPER_CACHE_PATH, 'utf8');
      const data = JSON.parse(raw) as Record<string, string | null>;
      const resolver = SkipperResolver.fromJSON(data);
      await use(resolver);
    },
    { scope: 'worker' },
  ],

  _skipperAutoSkip: [
    async ({ _skipperResolver }, use, testInfo) => {
      const titlePath = testInfo.titlePath.filter(Boolean);
      const testId = buildTestId(testInfo.file, titlePath);

      if (!_skipperResolver.isTestEnabled(testId)) {
        testInfo.skip(true, `[skipper] Disabled until date in spreadsheet has not passed yet.`);
      }

      await use();
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
