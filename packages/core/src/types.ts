export type SkipperMode = 'read-only' | 'sync';

export interface ServiceAccountCredentials {
  type: 'service_account';
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

export type SkipperCredentials =
  | ServiceAccountCredentials
  | { credentialsFile: string }
  | { credentialsBase64: string };

export interface SkipperConfig {
  /** Google Spreadsheet ID (from the URL). */
  spreadsheetId: string;

  /**
   * Service account credentials. Three forms accepted:
   * - Inline object: the parsed JSON service account
   * - `{ credentialsFile: './service-account.json' }` — path to JSON file (local dev)
   * - `{ credentialsBase64: process.env.GOOGLE_CREDS_B64 }` — base64-encoded JSON (CI)
   */
  credentials: SkipperCredentials;

  /** Sheet tab name. Defaults to the first sheet. */
  sheetName?: string;

  /**
   * Additional sheet tab names to read from (read-only).
   * Entries from these sheets are merged with the primary sheet.
   * Useful for shared skip lists across multiple projects.
   * When the same test ID appears in multiple sheets, the most
   * restrictive (latest) disabledUntil date wins.
   */
  referenceSheets?: string[];

  /** Header name of the test ID column. Defaults to "testId". */
  testIdColumn?: string;

  /** Header name of the disabledUntil date column. Defaults to "disabledUntil". */
  disabledUntilColumn?: string;
}

export interface TestEntry {
  testId: string;
  /** null = no date set = test is enabled */
  disabledUntil: Date | null;
  notes?: string;
}
