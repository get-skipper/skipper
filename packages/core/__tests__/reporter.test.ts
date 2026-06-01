import type { QuarantineReport } from '../src/reporter';

let buildReport: (cache: Record<string, string | null>) => QuarantineReport;
let emitSummary: (report: QuarantineReport) => void;
let mockAppendFileSync: jest.Mock;
let mockWriteFileSync: jest.Mock;

const FUTURE_2D = new Date(Date.now() + 2 * 86_400_000).toISOString();
const FUTURE_5D = new Date(Date.now() + 5 * 86_400_000).toISOString();
const FUTURE_30D = new Date(Date.now() + 30 * 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

beforeEach(() => {
  jest.resetModules();

  mockAppendFileSync = jest.fn();
  mockWriteFileSync = jest.fn();

  jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    appendFileSync: mockAppendFileSync,
    writeFileSync: mockWriteFileSync,
  }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ({ buildReport, emitSummary } = require('../src/reporter'));
});

afterEach(() => {
  delete process.env.GITHUB_STEP_SUMMARY;
});

describe('buildReport', () => {
  it('returns zeros for an empty cache', () => {
    const report = buildReport({});
    expect(report.suppressedCount).toBe(0);
    expect(report.quarantineDebtDays).toBe(0);
    expect(report.expiringThisWeek).toEqual([]);
    expect(report.reEnabledThisRun).toEqual([]);
    expect(typeof report.generatedAt).toBe('string');
  });

  it('counts suppressed tests (disabledUntil in the future)', () => {
    const report = buildReport({
      'tests/a.ts > login': FUTURE_2D,
      'tests/b.ts > signup': FUTURE_30D,
    });
    expect(report.suppressedCount).toBe(2);
  });

  it('ignores null entries (always-enabled, no date set)', () => {
    const report = buildReport({ 'tests/a.ts > login': null });
    expect(report.suppressedCount).toBe(0);
    expect(report.reEnabledThisRun).toEqual([]);
  });

  it('identifies re-enabled tests (disabledUntil in the past)', () => {
    const report = buildReport({ 'tests/a.ts > login': PAST });
    expect(report.suppressedCount).toBe(0);
    expect(report.reEnabledThisRun).toContain('tests/a.ts > login');
  });

  it('identifies tests expiring within 7 days', () => {
    const report = buildReport({
      'tests/a.ts > soon': FUTURE_5D,
      'tests/b.ts > later': FUTURE_30D,
    });
    expect(report.expiringThisWeek).toContain('tests/a.ts > soon');
    expect(report.expiringThisWeek).not.toContain('tests/b.ts > later');
  });

  it('computes quarantine-days debt for suppressed tests', () => {
    const report = buildReport({ 'tests/a.ts > test': FUTURE_30D });
    expect(report.quarantineDebtDays).toBeGreaterThanOrEqual(29);
    expect(report.quarantineDebtDays).toBeLessThanOrEqual(30);
  });

  it('does not count re-enabled tests in quarantine-days debt', () => {
    const report = buildReport({ 'tests/a.ts > test': PAST });
    expect(report.quarantineDebtDays).toBe(0);
  });

  it('handles mixed cache correctly', () => {
    const report = buildReport({
      'tests/a.ts > suppressed-far': FUTURE_30D,
      'tests/b.ts > expiring-soon': FUTURE_5D,
      'tests/c.ts > re-enabled': PAST,
      'tests/d.ts > no-date': null,
    });
    expect(report.suppressedCount).toBe(2);
    expect(report.reEnabledThisRun).toEqual(['tests/c.ts > re-enabled']);
    expect(report.expiringThisWeek).toContain('tests/b.ts > expiring-soon');
    expect(report.expiringThisWeek).not.toContain('tests/a.ts > suppressed-far');
  });

  it('generatedAt is a valid ISO date', () => {
    const before = Date.now();
    const report = buildReport({});
    const after = Date.now();
    const ts = new Date(report.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe('emitSummary', () => {
  const report: QuarantineReport = {
    suppressedCount: 2,
    expiringThisWeek: ['tests/a.ts > test'],
    reEnabledThisRun: ['tests/b.ts > test'],
    quarantineDebtDays: 10,
    generatedAt: new Date().toISOString(),
  };

  it('writes skipper-report.json with the full report', () => {
    emitSummary(report);
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      'skipper-report.json',
      expect.stringContaining('"suppressedCount": 2'),
    );
  });

  it('logs to stdout when GITHUB_STEP_SUMMARY is not set', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    emitSummary(report);
    expect(spy).toHaveBeenCalled();
    expect(mockAppendFileSync).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('appends to GITHUB_STEP_SUMMARY when env var is set', () => {
    process.env.GITHUB_STEP_SUMMARY = '/tmp/step-summary.md';
    emitSummary(report);
    expect(mockAppendFileSync).toHaveBeenCalledWith('/tmp/step-summary.md', expect.any(String));
  });

  it('markdown includes the quarantine-days debt value', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    emitSummary(report);
    const md: string = spy.mock.calls[0][0];
    expect(md).toContain('10');
    expect(md).toContain('Skipper Quarantine Report');
    spy.mockRestore();
  });

  it('markdown lists expiring and re-enabled tests', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    emitSummary(report);
    const md: string = spy.mock.calls[0][0];
    expect(md).toContain('tests/a.ts > test');
    expect(md).toContain('tests/b.ts > test');
    spy.mockRestore();
  });
});
