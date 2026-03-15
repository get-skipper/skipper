import * as path from 'path';

/**
 * Normalizes a testId for consistent comparison:
 * - trim leading/trailing whitespace
 * - lowercase
 * - collapse multiple whitespace characters into a single space
 */
export function normalizeTestId(id: string): string {
  return id.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Builds a canonical testId from a file path and the test title path.
 *
 * Format: "{relativePath} > {titlePath.join(' > ')}"
 * Example: "tests/auth/login.spec.ts > login > should log in with valid credentials"
 *
 * The filePath is made relative to process.cwd() if it is absolute.
 * The titlePath is the array of describe block names + the test name,
 * as provided by the test framework (never pre-joined).
 */
export function buildTestId(filePath: string, titlePath: string[]): string {
  const relativePath = path.isAbsolute(filePath)
    ? path.relative(process.cwd(), filePath)
    : filePath;

  const normalizedPath = relativePath.split(path.sep).join('/');
  return [normalizedPath, ...titlePath].join(' > ');
}
