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

/** Google Sheets configuration. `source` defaults to `'google-sheets'` when omitted. */
export interface GoogleSheetsConfig {
  source?: 'google-sheets';

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

/** Azure AD application credentials for the client credentials flow. */
export interface ExcelCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export type ExcelCredentialsInput =
  | ExcelCredentials
  | { credentialsFile: string }
  | { credentialsBase64: string };

/**
 * Excel / Office 365 configuration. Reads from and writes to an Excel workbook
 * stored in OneDrive or SharePoint via the Microsoft Graph API.
 *
 * Set `source: 'excel'` to use this backend.
 */
export interface ExcelConfig {
  source: 'excel';

  /**
   * OneDrive / SharePoint workbook identifier. Use the full drive-relative path:
   *   `"drives/{driveId}/items/{itemId}"`
   * Obtain via Graph Explorer: GET /v1.0/drives/{driveId}/root/children
   */
  workbookId: string;

  /**
   * Azure AD application credentials. Three forms accepted:
   * - Inline object: `{ tenantId, clientId, clientSecret }`
   * - `{ credentialsFile: './azure-creds.json' }` — path to JSON file (local dev)
   * - `{ credentialsBase64: process.env.AZURE_CREDS_B64 }` — base64-encoded JSON (CI)
   */
  credentials: ExcelCredentialsInput;

  /** Worksheet tab name. Defaults to the first sheet. */
  sheetName?: string;

  /**
   * Additional worksheet tab names to read from (read-only).
   * Entries are merged with the primary sheet; most restrictive disabledUntil wins.
   */
  referenceSheets?: string[];

  /** Header name of the test ID column. Defaults to "testId". */
  testIdColumn?: string;

  /** Header name of the disabledUntil date column. Defaults to "disabledUntil". */
  disabledUntilColumn?: string;
}

/**
 * Unified Skipper configuration. Choose between Google Sheets (default) and Excel on Office 365.
 *
 * @example Google Sheets (backward compatible — `source` can be omitted)
 * ```ts
 * { spreadsheetId: '...', credentials: { credentialsBase64: '...' } }
 * ```
 *
 * @example Excel / Office 365
 * ```ts
 * { source: 'excel', workbookId: 'drives/{driveId}/items/{itemId}', credentials: { credentialsBase64: '...' } }
 * ```
 */
export type SkipperConfig = GoogleSheetsConfig | ExcelConfig;

export interface TestEntry {
  testId: string;
  /** null = no date set = test is enabled */
  disabledUntil: Date | null;
  notes?: string;
}
