import {
  SkipperResolver,
  SheetsWriter,
  buildReport,
  emitSummary,
  buildTestId,
  log,
  warn,
} from '@get-skipper/core';
import type { SkipperConfig } from '@get-skipper/core';

/**
 * Creates a Nightwatch globals object that integrates Skipper.
 *
 * - `before`: initializes the resolver (reads the spreadsheet)
 * - `beforeEach`: skips the test if disabledUntil is in the future
 * - `after`: in sync mode, reconciles the spreadsheet with discovered tests
 *
 * Usage in nightwatch.conf.js:
 * ```js
 * const { createSkipperPlugin } = require('@get-skipper/nightwatch');
 * module.exports = {
 *   globals: createSkipperPlugin({ spreadsheetId: '...', credentials: { ... } }),
 * };
 * ```
 */
export function createSkipperPlugin(config: SkipperConfig) {
  let resolver: SkipperResolver;
  const discoveredIds: string[] = [];

  return {
    async before(): Promise<void> {
      resolver = new SkipperResolver(config);
      await resolver.initialize();
      log('[skipper] Spreadsheet loaded.');
    },

    beforeEach(browser: NightwatchBrowser, done: () => void): void {
      if (!resolver) {
        done();
        return;
      }

      const currentTest = (browser as unknown as { currentTest: NightwatchCurrentTest })
        .currentTest;
      if (!currentTest) {
        done();
        return;
      }

      // Build the title path: Nightwatch may expose titlePath or just module + name
      const titlePath: string[] =
        (currentTest as unknown as { titlePath?: string[] }).titlePath ??
        [currentTest.name].filter(Boolean);

      const filePath = currentTest.module ?? '';
      const testId = buildTestId(filePath, titlePath);
      discoveredIds.push(testId);

      if (!resolver.isTestEnabled(testId)) {
        browser.skip();
      }

      done();
    },

    async after(): Promise<void> {
      // Emit quarantine report on every run
      try {
        emitSummary(buildReport(resolver ? resolver.toJSON() : {}));
      } catch {
        warn('[skipper] Failed to emit quarantine report.');
      }

      if (process.env.SKIPPER_MODE !== 'sync') return;
      if (discoveredIds.length === 0) {
        log('[skipper] No tests discovered — skipping spreadsheet sync.');
        return;
      }

      log(`[skipper] Syncing ${discoveredIds.length} test(s) to spreadsheet…`);
      const writer = new SheetsWriter(config);
      await writer.sync(discoveredIds);
    },
  };
}

// Minimal type stubs for Nightwatch globals context (avoid requiring nightwatch types as a dep)
interface NightwatchCurrentTest {
  name: string;
  module: string;
}

interface NightwatchBrowser {
  skip(): void;
}
