import * as path from 'path';
import { normalizeTestId, buildTestId } from '../src/cache';

describe('normalizeTestId', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeTestId('  hello world  ')).toBe('hello world');
  });

  it('lowercases the entire string', () => {
    expect(normalizeTestId('Hello World')).toBe('hello world');
  });

  it('collapses multiple spaces into one', () => {
    expect(normalizeTestId('a   b   c')).toBe('a b c');
  });

  it('collapses tabs and newlines', () => {
    expect(normalizeTestId('a\t\tb\n\nc')).toBe('a b c');
  });

  it('is idempotent on already-normalized strings', () => {
    const id = 'tests/auth.spec.ts > login > should log in';
    expect(normalizeTestId(id)).toBe(id);
  });
});

describe('buildTestId', () => {
  it('joins a relative file path and titlePath with " > "', () => {
    const id = buildTestId('tests/auth/login.spec.ts', ['login', 'should log in']);
    expect(id).toBe('tests/auth/login.spec.ts > login > should log in');
  });

  it('converts an absolute path to relative using process.cwd()', () => {
    const absPath = path.join(process.cwd(), 'tests/auth/login.spec.ts');
    const id = buildTestId(absPath, ['login', 'should log in']);
    expect(id).toBe('tests/auth/login.spec.ts > login > should log in');
  });

  it('normalizes path separators to forward slashes', () => {
    const id = buildTestId('tests/auth/login.spec.ts', ['test']);
    expect(id).not.toContain('\\');
  });

  it('works with a single-element titlePath', () => {
    const id = buildTestId('e2e/checkout.spec.ts', ['checkout should complete']);
    expect(id).toBe('e2e/checkout.spec.ts > checkout should complete');
  });

  it('works with deeply nested describe blocks', () => {
    const id = buildTestId('specs/a.ts', ['Suite A', 'Sub B', 'Sub C', 'test name']);
    expect(id).toBe('specs/a.ts > Suite A > Sub B > Sub C > test name');
  });

  it('handles an empty titlePath gracefully', () => {
    const id = buildTestId('specs/a.ts', []);
    expect(id).toBe('specs/a.ts');
  });
});
