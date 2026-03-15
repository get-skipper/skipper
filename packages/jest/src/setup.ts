/**
 * Jest setup file — add to `setupFilesAfterEnv` in jest.config.ts.
 *
 * This file:
 * 1. Rehydrates the SkipperResolver from the cache file written by globalSetup
 * 2. Overrides global `test` and `it` to auto-skip disabled tests
 * 3. Collects all discovered test IDs and writes them to SKIPPER_DISCOVERED_DIR
 *    after each test file, so globalTeardown can merge them across workers.
 *
 * Uses (global as any) casts to avoid depending on @types/jest.
 */
import * as fs from 'fs';
import * as path from 'path';
import { SkipperResolver, buildTestId } from '@get-skipper/core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = global as any;

const describeStack: string[] = [];

function getResolver(): SkipperResolver {
  const cacheFile = process.env.SKIPPER_CACHE_FILE;
  if (!cacheFile) {
    throw new Error(
      '[skipper] SKIPPER_CACHE_FILE is not set. ' +
        'Did you add createSkipperGlobalSetup() to globalSetup in jest.config?',
    );
  }
  const raw = fs.readFileSync(cacheFile, 'utf8');
  return SkipperResolver.fromJSON(JSON.parse(raw) as Record<string, string | null>);
}

const resolver = getResolver();

// Collect discovered test IDs in memory; flush to disk in afterAll so
// globalTeardown (a separate process) can read them across all workers.
const discoveredIds: string[] = [];

function appendDiscovered(testId: string): void {
  discoveredIds.push(testId);
}

// Register a root-level afterAll to flush this worker's discoveries to disk.
// SKIPPER_DISCOVERED_DIR is set by globalSetup and propagated to all workers.
const discoveredDir = process.env.SKIPPER_DISCOVERED_DIR;
if (discoveredDir) {
  const workerId = process.env.JEST_WORKER_ID ?? '0';
  const originalAfterAll = g.afterAll as ((fn: () => void) => void) | undefined;
  if (originalAfterAll) {
    originalAfterAll(() => {
      if (discoveredIds.length === 0) return;
      // Use worker ID + timestamp + random to guarantee a unique file name per test file.
      const suffix = `${workerId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      fs.writeFileSync(
        path.join(discoveredDir, `${suffix}.json`),
        JSON.stringify(discoveredIds),
      );
    });
  }
}

function buildCurrentTestId(name: string): string {
  // `expect.getState().testPath` is available in Jest's setup files
  const testPath: string = (g.expect?.getState?.()?.testPath as string | undefined) ?? '';
  return buildTestId(testPath, [...describeStack, name]);
}

// Override describe to maintain the stack
const originalDescribe = g.describe as ((name: string, fn: () => void) => void) | undefined;
if (originalDescribe) {
  g.describe = Object.assign(
    (name: string, fn: () => void) => {
      describeStack.push(name);
      originalDescribe(name, () => {
        try {
          fn();
        } finally {
          describeStack.pop();
        }
      });
    },
    originalDescribe,
  );
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
      const testId = buildCurrentTestId(name);
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
