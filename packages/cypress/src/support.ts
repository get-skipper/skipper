/**
 * Cypress support file — include in your support file:
 *
 * ```ts
 * // cypress/support/e2e.ts
 * import '@skipper/cypress/support';
 * ```
 *
 * This file reads the cache written by the plugin and skips disabled tests
 * via a `beforeEach` hook using `this.skip()`.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SkipperResolver, buildTestId, warn } from '@skipper/core';

const CACHE_PATH = path.join(os.tmpdir(), '.skipper-cypress-cache.json');

function getResolver(): SkipperResolver | null {
  try {
    const raw = fs.readFileSync(CACHE_PATH, 'utf8');
    const data = JSON.parse(raw) as Record<string, string | null>;
    return SkipperResolver.fromJSON(data);
  } catch {
    warn(
      '[skipper] Could not read cache file. ' +
        'Make sure createSkipperPlugin() is configured in setupNodeEvents.',
    );
    return null;
  }
}

const resolver = getResolver();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

if (typeof g.beforeEach === 'function') {
  g.beforeEach(function (this: { skip: () => void }) {
    if (!resolver) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Cypress = g.Cypress as any;
    if (!Cypress) return;

    const titlePath: string[] = Cypress.currentTest?.titlePath ?? [];
    const specRelative: string = Cypress.spec?.relative ?? '';
    const testId = buildTestId(specRelative, titlePath);

    if (!resolver.isTestEnabled(testId)) {
      this.skip();
    }
  });
}
