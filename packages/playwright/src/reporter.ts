import type { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
import { SheetsWriter, buildTestId, log } from '@get-skipper/core';
import type { SkipperConfig } from '@get-skipper/core';

/**
 * SkipperReporter collects all test IDs discovered during the run.
 * In sync mode (`SKIPPER_MODE=sync`), it reconciles the spreadsheet on completion:
 * - Adds new tests (with empty disabledUntil)
 * - Removes rows for tests no longer in the suite
 *
 * Add to playwright.config.ts:
 * ```ts
 * reporter: [['list'], [SkipperReporter, skipperConfig]]
 * ```
 */
export class SkipperReporter implements Reporter {
  private readonly config: SkipperConfig;
  private readonly discoveredIds: string[] = [];

  constructor(config: SkipperConfig) {
    this.config = config;
  }

  onTestEnd(test: TestCase, _result: TestResult): void {
    const titlePath = test.titlePath().filter(Boolean);
    const testId = buildTestId(test.location.file, titlePath);
    this.discoveredIds.push(testId);
  }

  async onEnd(_result: FullResult): Promise<void> {
    const mode = process.env.SKIPPER_MODE;
    if (mode !== 'sync') return;

    if (this.discoveredIds.length === 0) {
      log('[skipper] No tests discovered — skipping spreadsheet sync.');
      return;
    }

    log(`[skipper] Syncing ${this.discoveredIds.length} test(s) to spreadsheet…`);
    const writer = new SheetsWriter(this.config);
    await writer.sync(this.discoveredIds);
  }
}
