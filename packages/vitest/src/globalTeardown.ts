import * as fs from 'fs';
import { SheetsWriter, buildReport, emitSummary, log, warn, error } from '@get-skipper/core';
import type { SkipperConfig } from '@get-skipper/core';
import { SKIPPER_CACHE_PATH } from './globalSetup';

export function createSkipperGlobalTeardown(config: SkipperConfig) {
  return async function skipperGlobalTeardown(): Promise<void> {
    // Emit the quarantine report on every run (regardless of mode)
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

    if (process.env.SKIPPER_MODE !== 'sync') return;

    const raw = process.env.SKIPPER_DISCOVERED_TESTS;
    if (!raw) {
      warn('[skipper] No discovered tests found — skipping spreadsheet sync.');
      return;
    }

    let discoveredIds: string[];
    try {
      discoveredIds = JSON.parse(raw) as string[];
    } catch {
      error('[skipper] Failed to parse SKIPPER_DISCOVERED_TESTS — skipping sync.');
      return;
    }

    log(`[skipper] Syncing ${discoveredIds.length} test(s) to spreadsheet…`);
    const writer = new SheetsWriter(config);
    await writer.sync(discoveredIds);
  };
}
