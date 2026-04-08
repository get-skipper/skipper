import * as fs from 'fs';
import { normalizeTestId } from './cache';
import { warn } from './logger';
import type { SkipperConfig, TestEntry, ServiceAccountCredentials } from './types';

// googleapis and google-auth-library are imported dynamically inside fetchAll() so that
// worker processes that only call SkipperResolver.fromJSON() never load these modules.
// Loading googleapis initialises an HTTP keep-alive agent that prevents worker exit.
import type { sheets_v4 } from 'googleapis';

function resolveCredentials(config: SkipperConfig): ServiceAccountCredentials {
  const { credentials } = config;

  if ('credentialsFile' in credentials) {
    const raw = fs.readFileSync(credentials.credentialsFile, 'utf8');
    return JSON.parse(raw) as ServiceAccountCredentials;
  }

  if ('credentialsBase64' in credentials) {
    const raw = Buffer.from(credentials.credentialsBase64, 'base64').toString('utf8');
    return JSON.parse(raw) as ServiceAccountCredentials;
  }

  return credentials as ServiceAccountCredentials;
}

export interface SheetFetchResult {
  /** Resolved sheet tab name. */
  sheetName: string;
  /** Numeric sheet ID (used for batchUpdate deletions). */
  sheetId: number;
  /** Raw rows including the header row (row 0). */
  rawRows: string[][];
  /** Parsed header cells (trimmed). */
  header: string[];
  /** Parsed test entries. */
  entries: TestEntry[];
}

export interface FetchAllResult {
  /** Full data for the primary (writable) sheet — used by SheetsWriter. */
  primary: SheetFetchResult;
  /** Merged entries from primary + all referenceSheets — used by SkipperResolver. */
  entries: TestEntry[];
  /**
   * Authenticated Sheets API client — returned here so callers (SheetsWriter)
   * can reuse the same auth session for write operations without a second auth call.
   */
  sheets: sheets_v4.Sheets;
}

export class SheetsClient {
  private readonly config: SkipperConfig;

  constructor(config: SkipperConfig) {
    this.config = config;
  }

  private async fetchSheet(
    sheets: sheets_v4.Sheets,
    sheetName: string,
    sheetId: number,
  ): Promise<SheetFetchResult> {
    const spreadsheetId = this.config.spreadsheetId;
    const testIdCol = this.config.testIdColumn ?? 'testId';
    const disabledUntilCol = this.config.disabledUntilColumn ?? 'disabledUntil';

    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: sheetName });
    const rawRows = (response.data.values ?? []) as string[][];

    if (rawRows.length === 0) {
      return { sheetName, sheetId, rawRows, header: [], entries: [] };
    }

    const header = rawRows[0].map((h: string) => String(h).trim());
    const testIdIdx = header.indexOf(testIdCol);
    const disabledUntilIdx = header.indexOf(disabledUntilCol);
    const notesIdx = header.indexOf('notes');

    if (testIdIdx === -1) {
      throw new Error(
        `[skipper] Column "${testIdCol}" not found in sheet "${sheetName}". ` +
          `Found columns: ${header.join(', ')}`,
      );
    }

    const entries: TestEntry[] = [];
    for (let i = 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      const testId = row[testIdIdx] ? String(row[testIdIdx]).trim() : '';
      if (!testId) continue;

      let disabledUntil: Date | null = null;
      if (disabledUntilIdx !== -1 && row[disabledUntilIdx]) {
        const raw = String(row[disabledUntilIdx]).trim();
        if (raw) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            throw new Error(
              `[skipper] Row ${i + 1} in "${sheetName}": date "${raw}" in "${disabledUntilCol}" must be in YYYY-MM-DD format (e.g. "2026-04-01")`,
            );
          }
          const [year, month, day] = raw.split('-').map(Number);
          // Parse as midnight UTC of the next day: "disabled until 2026-04-01" keeps
          // the test disabled through the entire calendar day in UTC and re-enables
          // at 2026-04-02T00:00:00Z, regardless of the runner's local timezone.
          disabledUntil = new Date(Date.UTC(year, month - 1, day + 1));
        }
      }

      const notes = notesIdx !== -1 && row[notesIdx] ? String(row[notesIdx]) : undefined;
      entries.push({ testId, disabledUntil, notes });
    }

    return { sheetName, sheetId, rawRows, header, entries };
  }

  /**
   * Fetches the primary sheet and all reference sheets in a single API session.
   *
   * Returns:
   * - `primary`: the primary sheet's full result (rawRows + header) for writer use
   * - `entries`: merged test entries from all sheets (for resolver use)
   * - `sheets`: the authenticated Sheets API client (reuse for write operations)
   *
   * googleapis and google-auth-library are loaded here via dynamic import so that
   * worker processes, which only call SkipperResolver.fromJSON(), never load them.
   *
   * Deduplication: when the same testId appears in multiple sheets, the most
   * restrictive (latest) disabledUntil wins.
   */
  async fetchAll(): Promise<FetchAllResult> {
    // Dynamic imports — only executed when actually fetching from the spreadsheet.
    const { google } = await import('googleapis');
    const { JWT } = await import('google-auth-library');

    const creds = resolveCredentials(this.config);
    const auth = new JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const spreadsheetId = this.config.spreadsheetId;
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const allSheetMeta = meta.data.sheets ?? [];

    const sheetIdByName = new Map<string, number>(
      allSheetMeta
        .filter((s) => s.properties?.title != null && s.properties.sheetId != null)
        .map((s) => [s.properties!.title!, s.properties!.sheetId!]),
    );

    const primaryName = this.config.sheetName ?? allSheetMeta[0]?.properties?.title ?? 'Sheet1';
    const primaryId = sheetIdByName.get(primaryName);
    if (primaryId == null) {
      throw new Error(`[skipper] Sheet "${primaryName}" not found in spreadsheet.`);
    }

    const primary = await this.fetchSheet(sheets, primaryName, primaryId);

    const referenceEntries: TestEntry[] = [];
    for (const refName of this.config.referenceSheets ?? []) {
      const refId = sheetIdByName.get(refName);
      if (refId == null) {
        warn(`[skipper] Reference sheet "${refName}" not found — skipping.`);
        continue;
      }
      const result = await this.fetchSheet(sheets, refName, refId);
      referenceEntries.push(...result.entries);
    }

    const merged = new Map<string, TestEntry>();
    for (const entry of [...primary.entries, ...referenceEntries]) {
      const key = normalizeTestId(entry.testId);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, entry);
      } else if (entry.disabledUntil !== null) {
        if (existing.disabledUntil === null || entry.disabledUntil > existing.disabledUntil) {
          merged.set(key, entry);
        }
      }
    }

    return { primary, entries: [...merged.values()], sheets };
  }
}
