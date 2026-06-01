import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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

export const SKIPPER_CACHE_PATH = path.join(os.tmpdir(), '.skipper-cypress-cache.json');

/**
 * Creates a Cypress `setupNodeEvents` handler that integrates Skipper.
 *
 * - `before:run`: initializes the resolver and writes the cache to a temp file
 * - `after:run`: in sync mode, reconciles the spreadsheet with discovered tests
 *
 * Usage in cypress.config.ts:
 * ```ts
 * import { createSkipperPlugin } from '@get-skipper/cypress';
 * export default defineConfig({
 *   e2e: { setupNodeEvents: createSkipperPlugin(skipperConfig) },
 * });
 * ```
 */
export function createSkipperPlugin(config: SkipperConfig) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function setupNodeEvents(
    on: (event: string, handler: (...args: any[]) => any) => void,
  ): void {
    on('before:run', async () => {
      const resolver = new SkipperResolver(config);
      await resolver.initialize();
      fs.writeFileSync(SKIPPER_CACHE_PATH, JSON.stringify(resolver.toJSON()), 'utf8');
      log('[skipper] Spreadsheet loaded and cache written.');
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on('after:run', async (results: any) => {
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

      if (process.env.SKIPPER_MODE !== 'sync') return;

      const runs: unknown[] = results?.runs ?? [];
      const discoveredIds: string[] = [];

      for (const run of runs) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = run as any;
        const specRelative: string = r.spec?.relative ?? r.spec?.name ?? '';
        for (const test of r.tests ?? []) {
          const titlePath: string[] = test.title ?? [];
          if (titlePath.length > 0) {
            discoveredIds.push(buildTestId(specRelative, titlePath));
          }
        }
      }

      if (discoveredIds.length === 0) {
        log('[skipper] No tests discovered — skipping spreadsheet sync.');
        return;
      }

      log(`[skipper] Syncing ${discoveredIds.length} test(s) to spreadsheet…`);
      const writer = new SheetsWriter(config);
      await writer.sync(discoveredIds);
    });
  };
}
