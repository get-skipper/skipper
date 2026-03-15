import * as path from 'path';

export { createSkipperPlugin, SKIPPER_CACHE_PATH } from './plugin';
export type { SkipperConfig } from '@get-skipper/core';

/**
 * Absolute path to the support file.
 * Use in cypress.config.ts:
 *
 * ```ts
 * import { supportFile } from '@get-skipper/cypress';
 * export default defineConfig({
 *   e2e: { supportFile: supportFile },
 * });
 * ```
 *
 * Or import directly in your existing support file:
 * ```ts
 * import '@get-skipper/cypress/support';
 * ```
 */
export const supportFile = path.resolve(__dirname, 'support.js');
