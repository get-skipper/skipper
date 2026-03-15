import * as path from 'path';

export { createSkipperGlobalSetup } from './globalSetup';
export { createSkipperGlobalTeardown } from './globalTeardown';
export type { SkipperConfig } from '@skipper/core';

/**
 * Absolute path to the setup file.
 * Add this to `setupFilesAfterFramework` in jest.config.ts:
 *
 * ```ts
 * import { setupFile } from '@skipper/jest';
 * export default { setupFilesAfterFramework: [setupFile] };
 * ```
 */
export const setupFile = path.resolve(__dirname, 'setup.js');
