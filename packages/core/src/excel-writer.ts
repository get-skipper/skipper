import { ExcelClient } from './excel-client';
import { normalizeTestId } from './cache';
import { log } from './logger';
import type { ExcelConfig, TestEntry } from './types';

/**
 * Converts a 0-based column index to an A1-notation column letter (A, B, …, Z, AA, …).
 */
function colIndexToA1(index: number): string {
  let result = '';
  let n = index + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    result = String.fromCharCode(65 + r) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

export class ExcelWriter {
  private readonly client: ExcelClient;
  private readonly config: ExcelConfig;

  constructor(config: ExcelConfig) {
    this.config = config;
    this.client = new ExcelClient(config);
  }

  /**
   * Reconciles the workbook with the discovered test IDs:
   * - Appends rows for tests not yet in the primary worksheet (with empty disabledUntil)
   * - Deletes rows for tests that no longer exist in the suite
   *
   * Only the primary worksheet is modified. Reference worksheets are never written to.
   * Rows are matched by normalized testId (case-insensitive, whitespace-collapsed).
   * The header row (row 1) is never modified.
   *
   * Graph API has no batch row-delete endpoint, so deletions are issued sequentially
   * in descending row index order to avoid index shifting.
   */
  async sync(discoveredIds: string[]): Promise<void> {
    const { primary, entries: existingEntries, accessToken, workbookUrl } = await this.client.fetchAll();
    const { worksheetId, rawRows, header } = primary;

    const testIdCol = this.config.testIdColumn ?? 'testId';
    const disabledUntilCol = this.config.disabledUntilColumn ?? 'disabledUntil';

    const normalizedDiscovered = new Set(discoveredIds.map(normalizeTestId));
    const normalizedExisting = new Map<string, TestEntry>(
      existingEntries.map((e) => [normalizeTestId(e.testId), e]),
    );

    const toAdd = discoveredIds.filter((id) => !normalizedExisting.has(normalizeTestId(id)));
    const toRemoveNormalized = new Set(
      [...normalizedExisting.keys()].filter((nid) => !normalizedDiscovered.has(nid)),
    );

    if (toAdd.length === 0 && toRemoveNormalized.size === 0) {
      log('[skipper] Workbook is already up to date.');
      return;
    }

    const wsUrl = `${workbookUrl}/worksheets/${encodeURIComponent(worksheetId)}`;
    const testIdIdx = header.indexOf(testIdCol);

    // --- Deletions (descending row index to avoid index shifting) ---

    const rowIndicesToDelete: number[] = [];
    for (let i = 1; i < rawRows.length; i++) {
      const id = rawRows[i][testIdIdx] !== undefined ? String(rawRows[i][testIdIdx]).trim() : '';
      if (id && toRemoveNormalized.has(normalizeTestId(id))) {
        rowIndicesToDelete.push(i);
      }
    }

    // Sort descending so each delete doesn't shift subsequent indices.
    rowIndicesToDelete.sort((a, b) => b - a);

    for (const rowIdx of rowIndicesToDelete) {
      const res = await fetch(`${wsUrl}/rows(index=${rowIdx})`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`[skipper] Graph API error deleting row ${rowIdx}: ${res.status} ${body}`);
      }
    }

    if (rowIndicesToDelete.length > 0) {
      log(`[skipper] Removed ${rowIndicesToDelete.length} obsolete test(s) from workbook.`);
    }

    // --- Append new rows ---

    if (toAdd.length > 0) {
      const headerIdxDisabledUntil = header.indexOf(disabledUntilCol);
      const maxColIdx = Math.max(testIdIdx, headerIdxDisabledUntil);

      // After deletions, the next empty row is at rawRows.length - rowIndicesToDelete.length + 1
      // (1-based, +1 because rawRows includes the header at index 0, and Graph rows() are 1-based).
      let nextRow = rawRows.length - rowIndicesToDelete.length + 1;

      for (const testId of toAdd) {
        const rowValues: string[] = new Array(maxColIdx + 1).fill('');
        rowValues[testIdIdx] = testId;
        // disabledUntil stays empty (enabled by default)

        const rangeAddress = `${colIndexToA1(0)}${nextRow}:${colIndexToA1(maxColIdx)}${nextRow}`;
        const res = await fetch(`${wsUrl}/range(address='${rangeAddress}')`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: [rowValues] }),
        });

        if (!res.ok) {
          const body = await res.text();
          throw new Error(
            `[skipper] Graph API error appending row for "${testId}": ${res.status} ${body}`,
          );
        }

        nextRow++;
      }

      log(`[skipper] Added ${toAdd.length} new test(s) to workbook.`);
    }
  }
}
