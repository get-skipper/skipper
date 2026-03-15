import * as fs from 'fs';
import { normalizeTestId } from './cache';
import { warn } from './logger';
import type { ExcelConfig, ExcelCredentials, ExcelCredentialsInput, TestEntry } from './types';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

// Excel's epoch starts on Dec 30, 1899 (day 0).
const EXCEL_EPOCH_MS = new Date(1899, 11, 30).getTime();

function resolveCredentials(config: ExcelConfig): ExcelCredentials {
  const { credentials } = config;

  if ('credentialsFile' in credentials) {
    const raw = fs.readFileSync(credentials.credentialsFile, 'utf8');
    return JSON.parse(raw) as ExcelCredentials;
  }

  if ('credentialsBase64' in credentials) {
    const raw = Buffer.from(credentials.credentialsBase64, 'base64').toString('utf8');
    return JSON.parse(raw) as ExcelCredentials;
  }

  return credentials as ExcelCredentials;
}

function parseExcelDate(raw: string | number): Date | null {
  if (typeof raw === 'number') {
    // Excel serial number → JS Date
    return new Date(EXCEL_EPOCH_MS + raw * 86_400_000);
  }
  const str = String(raw).trim();
  if (!str) return null;
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export interface WorksheetFetchResult {
  worksheetName: string;
  /** Graph API worksheet string ID (GUID). */
  worksheetId: string;
  /** Raw rows including the header row (row 0). */
  rawRows: (string | number)[][];
  /** Parsed header cells (trimmed). */
  header: string[];
  /** Parsed test entries. */
  entries: TestEntry[];
}

export interface ExcelFetchAllResult {
  /** Full data for the primary (writable) worksheet — used by ExcelWriter. */
  primary: WorksheetFetchResult;
  /** Merged entries from primary + all referenceSheets — used by SkipperResolver. */
  entries: TestEntry[];
  /** Bearer token reused by ExcelWriter for write operations. */
  accessToken: string;
  /** Workbook base URL, e.g. `https://graph.microsoft.com/v1.0/drives/{id}/items/{id}/workbook`. */
  workbookUrl: string;
}

export class ExcelClient {
  private readonly config: ExcelConfig;

  constructor(config: ExcelConfig) {
    this.config = config;
  }

  private async fetchWorksheet(
    accessToken: string,
    workbookUrl: string,
    worksheetName: string,
    worksheetId: string,
  ): Promise<WorksheetFetchResult> {
    const testIdCol = this.config.testIdColumn ?? 'testId';
    const disabledUntilCol = this.config.disabledUntilColumn ?? 'disabledUntil';

    const url = `${workbookUrl}/worksheets/${encodeURIComponent(worksheetId)}/usedRange`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // Graph returns 400 when usedRange is called on a completely empty worksheet.
    if (res.status === 400) {
      return { worksheetName, worksheetId, rawRows: [], header: [], entries: [] };
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`[skipper] Graph API error fetching worksheet "${worksheetName}": ${res.status} ${body}`);
    }

    const data = (await res.json()) as { values?: (string | number)[][] };
    const rawRows = data.values ?? [];

    if (rawRows.length === 0) {
      return { worksheetName, worksheetId, rawRows, header: [], entries: [] };
    }

    const header = rawRows[0].map((h) => String(h).trim());
    const testIdIdx = header.indexOf(testIdCol);
    const disabledUntilIdx = header.indexOf(disabledUntilCol);
    const notesIdx = header.indexOf('notes');

    if (testIdIdx === -1) {
      throw new Error(
        `[skipper] Column "${testIdCol}" not found in worksheet "${worksheetName}". ` +
          `Found columns: ${header.join(', ')}`,
      );
    }

    const entries: TestEntry[] = [];
    for (let i = 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      const testId = row[testIdIdx] !== undefined ? String(row[testIdIdx]).trim() : '';
      if (!testId) continue;

      let disabledUntil: Date | null = null;
      if (disabledUntilIdx !== -1 && row[disabledUntilIdx] !== undefined && row[disabledUntilIdx] !== '') {
        const parsed = parseExcelDate(row[disabledUntilIdx] as string | number);
        if (parsed !== null) {
          disabledUntil = parsed;
        } else {
          warn(
            `[skipper] Row ${i + 1} in "${worksheetName}": invalid date "${row[disabledUntilIdx]}" in "${disabledUntilCol}" — treating as enabled`,
          );
        }
      }

      const notes = notesIdx !== -1 && row[notesIdx] !== undefined ? String(row[notesIdx]) : undefined;
      entries.push({ testId, disabledUntil, notes });
    }

    return { worksheetName, worksheetId, rawRows, header, entries };
  }

  /**
   * Fetches the primary worksheet and all reference worksheets in a single auth session.
   *
   * @azure/identity is imported dynamically so that worker processes that only call
   * SkipperResolver.fromJSON() never load it (mirrors the SheetsClient pattern).
   *
   * Deduplication: when the same testId appears in multiple sheets, the most
   * restrictive (latest) disabledUntil wins.
   */
  async fetchAll(): Promise<ExcelFetchAllResult> {
    // Dynamic import — only executed when actually fetching from the workbook.
    const { ClientSecretCredential } = await import('@azure/identity');

    const creds = resolveCredentials(this.config);
    const credential = new ClientSecretCredential(
      creds.tenantId,
      creds.clientId,
      creds.clientSecret,
    );
    const tokenResponse = await credential.getToken('https://graph.microsoft.com/.default');
    const accessToken = tokenResponse.token;

    const workbookUrl = `${GRAPH_BASE}/${this.config.workbookId}/workbook`;

    // Fetch worksheet list to resolve names → IDs.
    const wsListRes = await fetch(`${workbookUrl}/worksheets`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!wsListRes.ok) {
      const body = await wsListRes.text();
      throw new Error(`[skipper] Graph API error listing worksheets: ${wsListRes.status} ${body}`);
    }
    const wsListData = (await wsListRes.json()) as {
      value: { id: string; name: string }[];
    };
    const worksheetList = wsListData.value ?? [];

    const worksheetIdByName = new Map<string, string>(
      worksheetList.map((ws) => [ws.name, ws.id]),
    );

    const primaryName =
      this.config.sheetName ?? worksheetList[0]?.name ?? 'Sheet1';
    const primaryId = worksheetIdByName.get(primaryName);
    if (!primaryId) {
      throw new Error(`[skipper] Worksheet "${primaryName}" not found in workbook.`);
    }

    const primary = await this.fetchWorksheet(accessToken, workbookUrl, primaryName, primaryId);

    const referenceEntries: TestEntry[] = [];
    for (const refName of this.config.referenceSheets ?? []) {
      const refId = worksheetIdByName.get(refName);
      if (!refId) {
        warn(`[skipper] Reference worksheet "${refName}" not found — skipping.`);
        continue;
      }
      const result = await this.fetchWorksheet(accessToken, workbookUrl, refName, refId);
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

    return { primary, entries: [...merged.values()], accessToken, workbookUrl };
  }
}
