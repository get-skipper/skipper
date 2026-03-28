import type { SheetsWriter as SheetsWriterType } from '../src/writer';

// ── Module-level handles (populated in beforeEach) ────────────────────────────

let SheetsWriter: typeof SheetsWriterType;
let mockFetchAll: jest.Mock;

const baseConfig = {
  spreadsheetId: 'sheet-id',
  credentials: { credentialsBase64: 'dGVzdA==' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a mock Sheets API included in the fetchAll() result.
 * writer.sync() uses it only for batchUpdate and values.append.
 */
function makeSheetsApi() {
  const mockBatchUpdate = jest.fn().mockResolvedValue({});
  const mockAppend = jest.fn().mockResolvedValue({});

  return {
    api: {
      spreadsheets: {
        batchUpdate: mockBatchUpdate,
        values: { append: mockAppend },
      },
    },
    mocks: { mockBatchUpdate, mockAppend },
  };
}

/**
 * Build the `{ primary, entries, sheets }` object that `SheetsClient.fetchAll()` returns.
 * `sheetsApi` is passed in so callers can assert on batchUpdate / append calls.
 */
function makeFetchAllResult(
  opts: {
    rows?: string[][];
    sheetId?: number;
    sheetName?: string;
    entries?: { testId: string; disabledUntil: Date | null }[];
  },
  sheetsApi: ReturnType<typeof makeSheetsApi>,
) {
  const { rows = [], sheetId = 0, sheetName = 'Sheet1', entries = [] } = opts;
  const header = rows[0] ?? [];
  return {
    primary: { sheetName, sheetId, rawRows: rows, header, entries },
    entries,
    sheets: sheetsApi.api,
  };
}

afterEach(() => {
  delete process.env.SKIPPER_SYNC_ALLOW_DELETE;
});

beforeEach(() => {
  jest.resetModules();

  // Default: empty sheet — individual tests override with makeFetchAllResult()
  mockFetchAll = jest.fn().mockResolvedValue(makeFetchAllResult({}, makeSheetsApi()));

  jest.mock('../src/client', () => ({
    SheetsClient: jest.fn().mockImplementation(() => ({
      fetchAll: mockFetchAll,
    })),
  }));

  // Load writer AFTER mocks are registered so it picks up the mocked client
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SheetsWriter = require('../src/writer').SheetsWriter;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SheetsWriter.sync()', () => {
  it('does nothing when spreadsheet is already up to date', async () => {
    const existingId = 'tests/auth.spec.ts > login';
    const sheetsApi = makeSheetsApi();
    mockFetchAll.mockResolvedValue(makeFetchAllResult({
      rows: [['testId', 'disabledUntil'], [existingId, '']],
      entries: [{ testId: existingId, disabledUntil: null }],
    }, sheetsApi));

    const writer = new SheetsWriter(baseConfig);
    await writer.sync([existingId]);

    expect(sheetsApi.mocks.mockBatchUpdate).not.toHaveBeenCalled();
    expect(sheetsApi.mocks.mockAppend).not.toHaveBeenCalled();
  });

  it('appends new test IDs that are not yet in the spreadsheet', async () => {
    const sheetsApi = makeSheetsApi();
    mockFetchAll.mockResolvedValue(makeFetchAllResult({
      rows: [['testId', 'disabledUntil', 'notes']],
      entries: [],
    }, sheetsApi));

    const writer = new SheetsWriter(baseConfig);
    await writer.sync(['tests/new.spec.ts > new test']);

    expect(sheetsApi.mocks.mockAppend).toHaveBeenCalledTimes(1);
    const appendCall = sheetsApi.mocks.mockAppend.mock.calls[0][0];
    expect(appendCall.requestBody.values[0]).toContain('tests/new.spec.ts > new test');
    expect(sheetsApi.mocks.mockBatchUpdate).not.toHaveBeenCalled();
  });

  it('deletes rows for tests no longer in the suite', async () => {
    process.env.SKIPPER_SYNC_ALLOW_DELETE = 'true';
    const obsoleteId = 'tests/removed.spec.ts > old test';
    const sheetsApi = makeSheetsApi();
    mockFetchAll.mockResolvedValue(makeFetchAllResult({
      rows: [['testId', 'disabledUntil'], [obsoleteId, '']],
      entries: [{ testId: obsoleteId, disabledUntil: null }],
    }, sheetsApi));

    const writer = new SheetsWriter(baseConfig);
    await writer.sync([]); // no tests discovered → remove all

    expect(sheetsApi.mocks.mockBatchUpdate).toHaveBeenCalledTimes(1);
    const req = sheetsApi.mocks.mockBatchUpdate.mock.calls[0][0];
    expect(req.requestBody.requests[0].deleteDimension).toBeDefined();
    expect(sheetsApi.mocks.mockAppend).not.toHaveBeenCalled();
  });

  it('appends new tests AND deletes obsolete ones in the same sync', async () => {
    process.env.SKIPPER_SYNC_ALLOW_DELETE = 'true';
    const obsoleteId = 'tests/old.spec.ts > old test';
    const newId = 'tests/new.spec.ts > new test';
    const sheetsApi = makeSheetsApi();
    mockFetchAll.mockResolvedValue(makeFetchAllResult({
      rows: [['testId', 'disabledUntil'], [obsoleteId, '']],
      entries: [{ testId: obsoleteId, disabledUntil: null }],
    }, sheetsApi));

    const writer = new SheetsWriter(baseConfig);
    await writer.sync([newId]);

    expect(sheetsApi.mocks.mockBatchUpdate).toHaveBeenCalledTimes(1); // delete
    expect(sheetsApi.mocks.mockAppend).toHaveBeenCalledTimes(1);      // append
  });

  it('sorts delete requests in descending row order to avoid index shifting', async () => {
    process.env.SKIPPER_SYNC_ALLOW_DELETE = 'true';
    const idA = 'tests/a.spec.ts > test a';
    const idB = 'tests/b.spec.ts > test b';
    const sheetsApi = makeSheetsApi();
    mockFetchAll.mockResolvedValue(makeFetchAllResult({
      rows: [
        ['testId', 'disabledUntil'],
        [idA, ''], // row index 1
        [idB, ''], // row index 2
      ],
      entries: [
        { testId: idA, disabledUntil: null },
        { testId: idB, disabledUntil: null },
      ],
    }, sheetsApi));

    const writer = new SheetsWriter(baseConfig);
    await writer.sync([]); // remove both

    const req = sheetsApi.mocks.mockBatchUpdate.mock.calls[0][0];
    const startIndices = req.requestBody.requests.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => r.deleteDimension.range.startIndex,
    );
    // Must be descending: [2, 1] not [1, 2]
    expect(startIndices[0]).toBeGreaterThan(startIndices[1]);
  });

  it('calls fetchAll exactly once per sync() call (no redundant API calls)', async () => {
    const sheetsApi = makeSheetsApi();
    mockFetchAll.mockResolvedValue(makeFetchAllResult({ rows: [['testId']] }, sheetsApi));

    const writer = new SheetsWriter(baseConfig);
    await writer.sync(['tests/new.spec.ts > test']);

    expect(mockFetchAll).toHaveBeenCalledTimes(1);
  });

  describe('SKIPPER_SYNC_ALLOW_DELETE', () => {
    it('does NOT delete orphaned rows when SKIPPER_SYNC_ALLOW_DELETE is unset (default: false)', async () => {
      const obsoleteId = 'tests/removed.spec.ts > old test';
      const sheetsApi = makeSheetsApi();
      mockFetchAll.mockResolvedValue(makeFetchAllResult({
        rows: [['testId', 'disabledUntil'], [obsoleteId, '']],
        entries: [{ testId: obsoleteId, disabledUntil: null }],
      }, sheetsApi));

      const writer = new SheetsWriter(baseConfig);
      await writer.sync([]); // orphan exists but allow-delete is off

      expect(sheetsApi.mocks.mockBatchUpdate).not.toHaveBeenCalled();
    });

    it('deletes orphaned rows when SKIPPER_SYNC_ALLOW_DELETE=true', async () => {
      process.env.SKIPPER_SYNC_ALLOW_DELETE = 'true';
      const obsoleteId = 'tests/removed.spec.ts > old test';
      const sheetsApi = makeSheetsApi();
      mockFetchAll.mockResolvedValue(makeFetchAllResult({
        rows: [['testId', 'disabledUntil'], [obsoleteId, '']],
        entries: [{ testId: obsoleteId, disabledUntil: null }],
      }, sheetsApi));

      const writer = new SheetsWriter(baseConfig);
      await writer.sync([]);

      expect(sheetsApi.mocks.mockBatchUpdate).toHaveBeenCalledTimes(1);
      const req = sheetsApi.mocks.mockBatchUpdate.mock.calls[0][0];
      expect(req.requestBody.requests[0].deleteDimension).toBeDefined();
    });

    it('still appends new tests even when allow-delete is off', async () => {
      const obsoleteId = 'tests/old.spec.ts > old test';
      const newId = 'tests/new.spec.ts > new test';
      const sheetsApi = makeSheetsApi();
      mockFetchAll.mockResolvedValue(makeFetchAllResult({
        rows: [['testId', 'disabledUntil'], [obsoleteId, '']],
        entries: [{ testId: obsoleteId, disabledUntil: null }],
      }, sheetsApi));

      const writer = new SheetsWriter(baseConfig);
      await writer.sync([newId]); // no allow-delete → no deletion, but append should happen

      expect(sheetsApi.mocks.mockBatchUpdate).not.toHaveBeenCalled();
      expect(sheetsApi.mocks.mockAppend).toHaveBeenCalledTimes(1);
    });
  });

  describe('usage example — sync mode reconciliation', () => {
    /**
     * Simulates what happens when SKIPPER_MODE=sync and a test run completes.
     *
     * The discovered IDs (all tests in the suite) are compared against the
     * spreadsheet: new tests are appended, removed tests are deleted.
     */
    it('adds newly discovered tests and removes stale ones', async () => {
      process.env.SKIPPER_SYNC_ALLOW_DELETE = 'true';
      const stillExists = 'tests/auth.spec.ts > login > should log in';
      const wasRemoved = 'tests/old-feature.spec.ts > old > test';
      const isNew = 'tests/new-feature.spec.ts > feature > works';

      const sheetsApi = makeSheetsApi();
      mockFetchAll.mockResolvedValue(makeFetchAllResult({
        rows: [
          ['testId', 'disabledUntil'],
          [stillExists, ''],
          [wasRemoved, ''],
        ],
        entries: [
          { testId: stillExists, disabledUntil: null },
          { testId: wasRemoved, disabledUntil: null },
        ],
      }, sheetsApi));

      // Discovered during the test run: stillExists + isNew (wasRemoved is gone)
      const writer = new SheetsWriter(baseConfig);
      await writer.sync([stillExists, isNew]);

      // wasRemoved should be deleted
      expect(sheetsApi.mocks.mockBatchUpdate).toHaveBeenCalledTimes(1);
      // isNew should be appended
      expect(sheetsApi.mocks.mockAppend).toHaveBeenCalledTimes(1);
      const appendedRow = sheetsApi.mocks.mockAppend.mock.calls[0][0].requestBody.values[0];
      expect(appendedRow).toContain(isNew);
    });
  });
});
