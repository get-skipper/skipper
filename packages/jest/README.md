# @get-skipper/jest

Skipper plugin for [Jest](https://jestjs.io/) — enable/disable tests from a Google Spreadsheet.

## Installation

```bash
pnpm add -D @get-skipper/jest
# or
npm install --save-dev @get-skipper/jest
```

## Setup

Update `jest.config.ts` — this is the **only change required**:

```ts
import { createSkipperGlobalSetup, createSkipperGlobalTeardown, setupFile } from '@get-skipper/jest';

const skipperConfig = {
  spreadsheetId: process.env.SKIPPER_SPREADSHEET_ID!,
  credentials: { credentialsBase64: process.env.GOOGLE_CREDS_B64! },
  // Or for local dev:
  // credentials: { credentialsFile: './service-account.json' },
};

export default {
  globalSetup: createSkipperGlobalSetup(skipperConfig),
  globalTeardown: createSkipperGlobalTeardown(skipperConfig),
  setupFilesAfterFramework: [setupFile],
  // ... rest of your config
};
```

No changes to test files are required. Tests with a future `disabledUntil` date are automatically skipped.

## Test ID Format

Tests are identified in the spreadsheet as:

```
{relative file path} > {describe block(s)} > {test name}
```

Example:
```
tests/auth/login.test.ts > login > should log in with valid credentials
```

## Options

| Option | Default | Description |
|---|---|---|
| `sheetName` | first tab | Sheet tab to read/write |
| `referenceSheets` | `[]` | Additional tabs to read (read-only) |
| `testIdColumn` | `"testId"` | Column header for the test ID |
| `disabledUntilColumn` | `"disabledUntil"` | Column header for the disable date |

See the [root README](../../README.md) for the full configuration reference.

## Modes

- **`read-only`** (default): reads the spreadsheet, skips disabled tests. No writes.
- **`sync`** (`SKIPPER_MODE=sync`): same as read-only + reconciles the spreadsheet after the run.

See the [root README](../../README.md) for full setup instructions.

## License

MIT
