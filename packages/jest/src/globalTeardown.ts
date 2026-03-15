import * as fs from 'fs';
import * as path from 'path';
import { SheetsWriter, log, warn } from '@get-skipper/core';
import type { SkipperConfig } from '@get-skipper/core';

export function createSkipperGlobalTeardown(config: SkipperConfig) {
  return async function skipperGlobalTeardown(): Promise<void> {
    if (process.env.SKIPPER_MODE !== 'sync') return;

    // Workers write their discovered test IDs as JSON files into SKIPPER_DISCOVERED_DIR.
    // Merge all files here (globalTeardown runs in its own process, separate from workers).
    const discoveredDir = process.env.SKIPPER_DISCOVERED_DIR;
    if (!discoveredDir || !fs.existsSync(discoveredDir)) {
      warn('[skipper] No discovered tests found — skipping spreadsheet sync.');
      return;
    }

    // cache.json is the resolver snapshot written by globalSetup — skip it.
    const files = fs.readdirSync(discoveredDir).filter(f => f.endsWith('.json') && f !== 'cache.json');
    if (files.length === 0) {
      warn('[skipper] No discovered tests found — skipping spreadsheet sync.');
      fs.rmSync(discoveredDir, { recursive: true, force: true });
      return;
    }

    const allIds = new Set<string>();
    for (const file of files) {
      try {
        const ids = JSON.parse(fs.readFileSync(path.join(discoveredDir, file), 'utf8')) as string[];
        ids.forEach(id => allIds.add(id));
      } catch {
        warn(`[skipper] Failed to parse ${file} — skipping.`);
      }
    }

    // Clean up temp directory
    fs.rmSync(discoveredDir, { recursive: true, force: true });

    const discoveredIds = [...allIds];
    log(`[skipper] Syncing ${discoveredIds.length} test(s) to spreadsheet…`);
    const writer = new SheetsWriter(config);
    await writer.sync(discoveredIds);
  };
}
