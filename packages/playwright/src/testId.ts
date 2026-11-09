import { buildTestId } from '@get-skipper/core';

/**
 * Builds the Skipper testId for a Playwright test, in the documented format
 * `{relative file path} > {describe block(s)} > {test name}`.
 *
 * `titlePath` is Playwright's `TestInfo.titlePath`, i.e. `[file, ...describes, title]`.
 * Its first element (the file) is dropped because `buildTestId` already prepends
 * the relative file path. The reporter passes `TestCase.titlePath().slice(2)`,
 * which has the same shape.
 */
export function buildPlaywrightTestId(file: string, titlePath: readonly string[]): string {
  return buildTestId(file, titlePath.slice(1).filter(Boolean));
}
