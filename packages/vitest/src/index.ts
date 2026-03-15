import * as path from 'path';

export { createSkipperGlobalSetup } from './globalSetup';
export { createSkipperGlobalTeardown } from './globalTeardown';
export type { SkipperConfig } from '@skipper/core';

/**
 * Absolute path to the setup file.
 * Add to `setupFiles` in vitest.config.ts:
 *
 * ```ts
 * import { setupFile } from '@skipper/vitest';
 * export default defineConfig({ test: { setupFiles: [setupFile] } });
 * ```
 */
export const setupFile = path.resolve(__dirname, 'setup.js');
