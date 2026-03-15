// ── Helpers ───────────────────────────────────────────────────────────────────

const inlineConfig = {
  spreadsheetId: 'sheet-id',
  credentials: {
    type: 'service_account' as const,
    project_id: 'p',
    private_key_id: 'kid',
    private_key: '-----BEGIN RSA PRIVATE KEY-----\n-----END RSA PRIVATE KEY-----\n',
    client_email: 'sa@proj.iam.gserviceaccount.com',
    client_id: '1',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
  },
};

function makeRows(rows: string[][]): { data: { values: string[][] } } {
  return { data: { values: rows } };
}

function makeMetaResponse(title = 'Sheet1', sheetId = 0) {
  return { data: { sheets: [{ properties: { title, sheetId } }] } };
}

// ── Module-scoped mock handles (reset in beforeEach) ─────────────────────────

let SheetsClientCtor: typeof import('../src/client').SheetsClient;
let mockSpreadsheetGet: jest.Mock;
let mockValuesGet: jest.Mock;

beforeEach(() => {
  jest.resetModules();

  mockSpreadsheetGet = jest.fn().mockResolvedValue(makeMetaResponse());
  mockValuesGet = jest.fn().mockResolvedValue({ data: {} });

  jest.mock('googleapis', () => ({
    google: {
      sheets: jest.fn().mockReturnValue({
        spreadsheets: {
          get: mockSpreadsheetGet,
          values: { get: mockValuesGet },
        },
      }),
    },
  }));

  jest.mock('google-auth-library', () => ({
    JWT: jest.fn().mockImplementation(() => ({})),
  }));

  // Load SheetsClient AFTER registering mocks so googleapis is intercepted
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SheetsClientCtor = require('../src/client').SheetsClient;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SheetsClient.fetchAll()', () => {
  it('returns empty entries when the sheet has no rows', async () => {
    mockValuesGet.mockResolvedValue(makeRows([]));
    const client = new SheetsClientCtor(inlineConfig);
    const { entries } = await client.fetchAll();
    expect(entries).toEqual([]);
  });

  it('returns empty entries when data.values is undefined', async () => {
    mockValuesGet.mockResolvedValue({ data: {} });
    const client = new SheetsClientCtor(inlineConfig);
    const { entries } = await client.fetchAll();
    expect(entries).toEqual([]);
  });

  it('returns a primary result with sheetName, sheetId, rawRows, header', async () => {
    mockSpreadsheetGet.mockResolvedValue(makeMetaResponse('Foglio1', 42));
    mockValuesGet.mockResolvedValue(makeRows([['testId', 'disabledUntil']]));
    const client = new SheetsClientCtor(inlineConfig);
    const { primary } = await client.fetchAll();
    expect(primary.sheetName).toBe('Foglio1');
    expect(primary.sheetId).toBe(42);
    expect(primary.header).toEqual(['testId', 'disabledUntil']);
    expect(primary.rawRows).toHaveLength(1);
  });

  it('parses rows with testId, disabledUntil and notes columns', async () => {
    mockValuesGet.mockResolvedValue(
      makeRows([
        ['testId', 'disabledUntil', 'notes'],
        ['tests/a.spec.ts > login', '2099-12-31', 'flaky'],
        ['tests/b.spec.ts > checkout', '', ''],
      ]),
    );
    const client = new SheetsClientCtor(inlineConfig);
    const { entries } = await client.fetchAll();

    expect(entries).toHaveLength(2);

    expect(entries[0].testId).toBe('tests/a.spec.ts > login');
    expect(entries[0].disabledUntil).toEqual(new Date('2099-12-31'));
    expect(entries[0].notes).toBe('flaky');

    expect(entries[1].testId).toBe('tests/b.spec.ts > checkout');
    expect(entries[1].disabledUntil).toBeNull();
  });

  it('returns disabledUntil: null when the cell is empty', async () => {
    mockValuesGet.mockResolvedValue(
      makeRows([
        ['testId', 'disabledUntil'],
        ['tests/a.spec.ts > test', ''],
      ]),
    );
    const client = new SheetsClientCtor(inlineConfig);
    const { entries: [entry] } = await client.fetchAll();
    expect(entry.disabledUntil).toBeNull();
  });

  it('returns disabledUntil: null and warns for an invalid date string', async () => {
    mockValuesGet.mockResolvedValue(
      makeRows([
        ['testId', 'disabledUntil'],
        ['tests/a.spec.ts > test', 'not-a-date'],
      ]),
    );
    const client = new SheetsClientCtor(inlineConfig);
    const { entries: [entry] } = await client.fetchAll();
    expect(entry.disabledUntil).toBeNull();
  });

  it('throws when the testId column is missing from the header', async () => {
    mockValuesGet.mockResolvedValue(
      makeRows([
        ['id', 'disabledUntil'], // wrong column name
        ['tests/a.spec.ts > test', ''],
      ]),
    );
    const client = new SheetsClientCtor(inlineConfig);
    await expect(client.fetchAll()).rejects.toThrow('"testId" not found');
  });

  it('respects custom testIdColumn and disabledUntilColumn names', async () => {
    mockValuesGet.mockResolvedValue(
      makeRows([
        ['test_name', 'skip_until'],
        ['tests/a.spec.ts > test', '2099-01-01'],
      ]),
    );
    const client = new SheetsClientCtor({
      ...inlineConfig,
      testIdColumn: 'test_name',
      disabledUntilColumn: 'skip_until',
    });
    const { entries: [entry] } = await client.fetchAll();
    expect(entry.testId).toBe('tests/a.spec.ts > test');
    expect(entry.disabledUntil).toEqual(new Date('2099-01-01'));
  });

  it('skips rows with an empty testId cell', async () => {
    mockValuesGet.mockResolvedValue(
      makeRows([
        ['testId', 'disabledUntil'],
        ['', ''],
        ['tests/a.spec.ts > test', ''],
      ]),
    );
    const client = new SheetsClientCtor(inlineConfig);
    const { entries } = await client.fetchAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].testId).toBe('tests/a.spec.ts > test');
  });

  it('resolves credentials from a base64-encoded string', async () => {
    mockValuesGet.mockResolvedValue(makeRows([]));
    const creds = Buffer.from(JSON.stringify(inlineConfig.credentials)).toString('base64');
    const client = new SheetsClientCtor({ spreadsheetId: 'sid', credentials: { credentialsBase64: creds } });
    const { entries } = await client.fetchAll();
    expect(entries).toEqual([]);
  });

  it('always fetches spreadsheet metadata to resolve sheet name and ID', async () => {
    mockSpreadsheetGet.mockResolvedValue(makeMetaResponse('Foglio1', 7));
    mockValuesGet.mockResolvedValue(makeRows([['testId', 'disabledUntil'], ['tests/a.spec.ts > test', '']]));
    const client = new SheetsClientCtor(inlineConfig);
    await client.fetchAll();

    expect(mockSpreadsheetGet).toHaveBeenCalledWith({ spreadsheetId: 'sheet-id' });
    expect(mockValuesGet).toHaveBeenCalledWith({ spreadsheetId: 'sheet-id', range: 'Foglio1' });
  });

  it('uses sheetName from config as the range but still fetches metadata for sheetId', async () => {
    mockSpreadsheetGet.mockResolvedValue(makeMetaResponse('MyCustomSheet', 3));
    mockValuesGet.mockResolvedValue(
      makeRows([
        ['testId', 'disabledUntil'],
        ['tests/a.spec.ts > test', ''],
      ]),
    );
    const client = new SheetsClientCtor({ ...inlineConfig, sheetName: 'MyCustomSheet' });
    const { primary } = await client.fetchAll();

    expect(primary.sheetName).toBe('MyCustomSheet');
    expect(primary.sheetId).toBe(3);
    expect(mockValuesGet).toHaveBeenCalledWith({ spreadsheetId: 'sheet-id', range: 'MyCustomSheet' });
  });

  it('throws when the configured sheetName is not found in metadata', async () => {
    mockSpreadsheetGet.mockResolvedValue(makeMetaResponse('Foglio1', 0));
    const client = new SheetsClientCtor({ ...inlineConfig, sheetName: 'NonExistent' });
    await expect(client.fetchAll()).rejects.toThrow('"NonExistent" not found');
  });

  describe('referenceSheets support', () => {
    it('fetches entries from both primary and reference sheets and merges them', async () => {
      mockSpreadsheetGet.mockResolvedValue({
        data: {
          sheets: [
            { properties: { title: 'Main', sheetId: 0 } },
            { properties: { title: 'Shared', sheetId: 1 } },
          ],
        },
      });
      mockValuesGet
        .mockResolvedValueOnce(makeRows([
          ['testId', 'disabledUntil'],
          ['tests/a.spec.ts > test', ''],
        ]))
        .mockResolvedValueOnce(makeRows([
          ['testId', 'disabledUntil'],
          ['tests/b.spec.ts > test', '2099-01-01'],
        ]));

      const client = new SheetsClientCtor({ ...inlineConfig, sheetName: 'Main', referenceSheets: ['Shared'] });
      const { entries } = await client.fetchAll();

      expect(entries).toHaveLength(2);
      expect(entries.map(e => e.testId)).toContain('tests/a.spec.ts > test');
      expect(entries.map(e => e.testId)).toContain('tests/b.spec.ts > test');
    });

    it('uses the most restrictive disabledUntil when the same test appears in multiple sheets', async () => {
      const testId = 'tests/shared.spec.ts > test';
      const laterDate = '2099-06-01';
      const earlierDate = '2099-01-01';

      mockSpreadsheetGet.mockResolvedValue({
        data: {
          sheets: [
            { properties: { title: 'Main', sheetId: 0 } },
            { properties: { title: 'Ref', sheetId: 1 } },
          ],
        },
      });
      mockValuesGet
        .mockResolvedValueOnce(makeRows([['testId', 'disabledUntil'], [testId, earlierDate]]))
        .mockResolvedValueOnce(makeRows([['testId', 'disabledUntil'], [testId, laterDate]]));

      const client = new SheetsClientCtor({ ...inlineConfig, sheetName: 'Main', referenceSheets: ['Ref'] });
      const { entries } = await client.fetchAll();

      expect(entries).toHaveLength(1);
      expect(entries[0].disabledUntil).toEqual(new Date(laterDate));
    });

    it('warns and skips reference sheets not found in metadata', async () => {
      mockSpreadsheetGet.mockResolvedValue(makeMetaResponse('Main', 0));
      mockSpreadsheetGet.mockResolvedValue({
        data: { sheets: [{ properties: { title: 'Main', sheetId: 0 } }] },
      });
      mockValuesGet.mockResolvedValue(makeRows([['testId', 'disabledUntil']]));

      const client = new SheetsClientCtor({ ...inlineConfig, sheetName: 'Main', referenceSheets: ['NonExistent'] });
      // Should not throw; NonExistent is silently skipped with a warning
      await expect(client.fetchAll()).resolves.toBeDefined();
    });
  });
});
