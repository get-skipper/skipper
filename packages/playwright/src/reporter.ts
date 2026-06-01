import * as fs from 'fs';
import type { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
import { SheetsWriter, buildReport, emitSummary, buildTestId, log, warn } from '@get-skipper/core';
import type { SkipperConfig } from '@get-skipper/core';
import { SKIPPER_CACHE_PATH } from './globalSetup';

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
    // Emit quarantine report on every run
    try {
      if (fs.existsSync(SKIPPER_CACHE_PATH)) {
        const raw = fs.readFileSync(SKIPPER_CACHE_PATH, 'utf8');
        const cache = JSON.parse(raw) as Record<string, string | null>;
        emitSummary(buildReport(cache));
      } else {
        warn('[skipper] Cache file not found — skipping quarantine report.');
      }
    } catch {
      warn('[skipper] Failed to emit quarantine report.');
    }

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
