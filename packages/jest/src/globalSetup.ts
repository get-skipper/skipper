import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SkipperResolver, log } from '@get-skipper/core';
import type { SkipperConfig } from '@get-skipper/core';

export function createSkipperGlobalSetup(config: SkipperConfig) {
  return async function skipperGlobalSetup(): Promise<void> {
    const resolver = new SkipperResolver(config);
    await resolver.initialize();

    // Create a temp directory for:
    // 1. The resolver cache (shared with all worker processes via SKIPPER_CACHE_FILE)
    // 2. Per-worker discovered test ID files (merged by globalTeardown)
    //
    // Using a file instead of process.env.SKIPPER_CACHE avoids OS env-var size
    // limits for large test suites (some systems cap env vars at 2 MB).
    const discoveredDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skipper-'));
    const cacheFile = path.join(discoveredDir, 'cache.json');

    fs.writeFileSync(cacheFile, JSON.stringify(resolver.toJSON()), 'utf8');

    // Jest propagates process.env mutations from globalSetup to all worker processes.
    process.env.SKIPPER_CACHE_FILE = cacheFile;
    process.env.SKIPPER_DISCOVERED_DIR = discoveredDir;

    log('[skipper] Spreadsheet loaded.');
  };
}
