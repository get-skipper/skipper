import { SheetsWriter, log, warn, error } from '@get-skipper/core';
import type { SkipperConfig } from '@get-skipper/core';

export function createSkipperGlobalTeardown(config: SkipperConfig) {
  return async function skipperGlobalTeardown(): Promise<void> {
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
