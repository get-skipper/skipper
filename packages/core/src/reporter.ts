import { appendFileSync, writeFileSync } from 'fs';

export interface QuarantineReport {
  suppressedCount: number;
  expiringThisWeek: string[];
  reEnabledThisRun: string[];
  quarantineDebtDays: number;
  generatedAt: string;
}

export function buildReport(cache: Record<string, string | null>): QuarantineReport {
  const now = new Date();
  const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  let suppressedCount = 0;
  let debtMs = 0;
  const expiringThisWeek: string[] = [];
  const reEnabledThisRun: string[] = [];

  for (const [testId, iso] of Object.entries(cache)) {
    if (!iso) continue;
    const disabledUntil = new Date(iso);
    if (disabledUntil > now) {
      suppressedCount++;
      debtMs += disabledUntil.getTime() - now.getTime();
      if (disabledUntil <= oneWeekFromNow) expiringThisWeek.push(testId);
    } else {
      reEnabledThisRun.push(testId);
    }
  }

  return {
    suppressedCount,
    expiringThisWeek,
    reEnabledThisRun,
    quarantineDebtDays: Math.round(debtMs / (24 * 60 * 60 * 1000)),
    generatedAt: now.toISOString(),
  };
}

function buildMarkdownSummary(report: QuarantineReport): string {
  const lines = [
    '## Skipper Quarantine Report',
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| Suppressed tests | ${report.suppressedCount} |`,
    `| Expiring this week | ${report.expiringThisWeek.length} |`,
    `| Re-enabled this run | ${report.reEnabledThisRun.length} |`,
    `| Quarantine-days debt | ${report.quarantineDebtDays} |`,
    '',
  ];

  if (report.expiringThisWeek.length > 0) {
    lines.push('### Expiring this week', '');
    for (const id of report.expiringThisWeek) lines.push(`- \`${id}\``);
    lines.push('');
  }

  if (report.reEnabledThisRun.length > 0) {
    lines.push('### Re-enabled this run', '');
    for (const id of report.reEnabledThisRun) lines.push(`- \`${id}\``);
    lines.push('');
  }

  return lines.join('\n');
}

export function emitSummary(report: QuarantineReport): void {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  const md = buildMarkdownSummary(report);
  if (summaryFile) {
    appendFileSync(summaryFile, md);
  } else {
    console.log(md);
  }
  writeFileSync('skipper-report.json', JSON.stringify(report, null, 2));
}
