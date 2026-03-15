import { SheetsClient } from './client';
import { normalizeTestId } from './cache';
import { log } from './logger';
import type { SkipperConfig, TestEntry } from './types';

export class SheetsWriter {
  private readonly client: SheetsClient;
  private readonly config: SkipperConfig;

  constructor(config: SkipperConfig) {
    this.config = config;
    this.client = new SheetsClient(config);
  }

  /**
   * Reconciles the spreadsheet with the discovered test IDs:
   * - Appends rows for tests not yet in the primary sheet (with empty disabledUntil)
   * - Deletes rows for tests that no longer exist in the suite
   *
   * Only the primary sheet is modified. Reference sheets are never written to.
   * Rows are matched by normalized testId (case-insensitive, whitespace-collapsed).
   * The header row (row 1) is never modified.
   *
   * A single fetchAll() call is made to retrieve sheet metadata, existing entries,
   * and raw rows — no redundant API calls.
   */
  async sync(discoveredIds: string[]): Promise<void> {
    // One fetchAll() resolves the sheet name from metadata, fetches existing
    // entries, and returns raw rows and the authenticated Sheets client —
    // all in two API calls (metadata + values). No second auth/fetch needed.
    const { primary, entries: existingEntries, sheets } = await this.client.fetchAll();
    const { sheetName, sheetId, rawRows, header } = primary;

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
      log('[skipper] Spreadsheet is already up to date.');
      return;
    }

    const spreadsheetId = this.config.spreadsheetId;

    const testIdIdx = header.indexOf(testIdCol);

    // Identify 0-based row indices (within rawRows) to delete, skipping header at 0.
    const rowIndicesToDelete: number[] = [];
    for (let i = 1; i < rawRows.length; i++) {
      const id = rawRows[i][testIdIdx] ? String(rawRows[i][testIdIdx]).trim() : '';
      if (id && toRemoveNormalized.has(normalizeTestId(id))) {
        rowIndicesToDelete.push(i);
      }
    }

    // Deletions must be sorted descending to avoid index shifting.
    const deleteRequests = rowIndicesToDelete
      .sort((a, b) => b - a)
      .map((rowIdx) => ({
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: rowIdx, endIndex: rowIdx + 1 },
        },
      }));

    if (deleteRequests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: deleteRequests },
      });
      log(`[skipper] Removed ${deleteRequests.length} obsolete test(s) from spreadsheet.`);
    }

    // Append new rows.
    if (toAdd.length > 0) {
      const headerIdxDisabledUntil = header.indexOf(disabledUntilCol);

      const newRows = toAdd.map((testId) => {
        const row: string[] = new Array(Math.max(testIdIdx + 1, headerIdxDisabledUntil + 1)).fill('');
        row[testIdIdx] = testId;
        if (headerIdxDisabledUntil !== -1) row[headerIdxDisabledUntil] = '';
        return row;
      });

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: sheetName,
        valueInputOption: 'RAW',
        requestBody: { values: newRows },
      });
      log(`[skipper] Added ${toAdd.length} new test(s) to spreadsheet.`);
    }
  }
}
