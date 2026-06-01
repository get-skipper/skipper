/**
 * Vitest setup file — add to `setupFiles` in vitest.config.ts.
 *
 * This file:
 * 1. Rehydrates the SkipperResolver from the cache file written by globalSetup
 * 2. Overrides globalThis.test / globalThis.it to auto-skip disabled tests
 * 3. Collects all discovered test IDs into SKIPPER_DISCOVERED_TESTS for sync mode
 */
import * as fs from 'fs';
import { SkipperResolver, buildTestId } from '@get-skipper/core';
import { SKIPPER_CACHE_PATH } from './globalSetup';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

function getResolver(): SkipperResolver {
  if (!fs.existsSync(SKIPPER_CACHE_PATH)) {
    throw new Error(
      '[skipper] Skipper cache file not found. ' +
        'Did you add createSkipperGlobalSetup() to globalSetup in vitest.config?',
    );
  }
  const raw = fs.readFileSync(SKIPPER_CACHE_PATH, 'utf8');
  return SkipperResolver.fromJSON(JSON.parse(raw) as Record<string, string | null>);
}

const resolver = getResolver();

// Stack tracking current describe blocks
const describeStack: string[] = [];

function appendDiscovered(testId: string): void {
  const existing = process.env.SKIPPER_DISCOVERED_TESTS;
  const arr: string[] = existing ? JSON.parse(existing) : [];
  arr.push(testId);
  process.env.SKIPPER_DISCOVERED_TESTS = JSON.stringify(arr);
}

// Override describe to maintain the stack
const originalDescribe = g.describe as ((name: string, fn: () => void) => void) | undefined;
if (originalDescribe) {
  g.describe = Object.assign((name: string, fn: () => void) => {
    describeStack.push(name);
    originalDescribe(name, () => {
      try {
        fn();
      } finally {
        describeStack.pop();
      }
    });
  }, originalDescribe);
}

// Override test / it
type TestLike = ((name: string, fn?: () => void | Promise<void>, timeout?: number) => void) & {
  skip: (name: string, fn?: () => void | Promise<void>, timeout?: number) => void;
  [key: string]: unknown;
};

const originalTest = g.test as TestLike | undefined;
if (originalTest) {
  const wrapped = Object.assign(
    (name: string, fn?: () => void | Promise<void>, timeout?: number) => {
      if (fn === undefined) return originalTest(name, fn, timeout);

      // Derive file path from Error stack
      const stack = new Error().stack ?? '';
      const match = stack.match(/\((.+?):\d+:\d+\)/);
      const filePath = match ? match[1] : 'unknown';

      const testId = buildTestId(filePath, [...describeStack, name]);
      appendDiscovered(testId);

      return resolver.isTestEnabled(testId)
        ? originalTest(name, fn, timeout)
        : originalTest.skip(name, fn, timeout);
    },
    originalTest,
  );

  g.test = wrapped;
  g.it = wrapped;
}
