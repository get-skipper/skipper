import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SkipperResolver, log } from '@skipper/core';
import type { SkipperConfig } from '@skipper/core';

export const SKIPPER_CACHE_PATH = path.join(os.tmpdir(), '.skipper-vitest-cache.json');

export function createSkipperGlobalSetup(config: SkipperConfig) {
  return async function skipperGlobalSetup(): Promise<void> {
    const resolver = new SkipperResolver(config);
    await resolver.initialize();
    // Write cache to a temp file instead of an env var to avoid OS env-var size
    // limits for large test suites. Vitest workers can read this shared file.
    fs.writeFileSync(SKIPPER_CACHE_PATH, JSON.stringify(resolver.toJSON()), 'utf8');
    log('[skipper] Spreadsheet loaded.');
  };
}
