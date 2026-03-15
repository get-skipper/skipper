import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SkipperResolver, log } from '@get-skipper/core';
import type { SkipperConfig } from '@get-skipper/core';

export const SKIPPER_CACHE_PATH = path.join(os.tmpdir(), '.skipper-playwright-cache.json');

export function createSkipperGlobalSetup(config: SkipperConfig) {
  return async function skipperGlobalSetup(): Promise<void> {
    const resolver = new SkipperResolver(config);
    await resolver.initialize();
    fs.writeFileSync(SKIPPER_CACHE_PATH, JSON.stringify(resolver.toJSON()), 'utf8');
    log('[skipper] Spreadsheet loaded and cache written.');
  };
}
