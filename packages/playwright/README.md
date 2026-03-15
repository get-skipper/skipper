# @get-skipper/playwright

Skipper plugin for [Playwright](https://playwright.dev/) — enable/disable tests from a Google Spreadsheet.

## Installation

```bash
pnpm add -D @get-skipper/playwright
# or
npm install --save-dev @get-skipper/playwright
```

## Setup

### 1. Configure `playwright.config.ts`

```ts
import { defineConfig } from '@playwright/test';
import { createSkipperGlobalSetup, SkipperReporter } from '@get-skipper/playwright';

const skipperConfig = {
  spreadsheetId: process.env.SKIPPER_SPREADSHEET_ID!,
  credentials: { credentialsBase64: process.env.GOOGLE_CREDS_B64! },
  // Or for local dev:
  // credentials: { credentialsFile: './service-account.json' },
};

export default defineConfig({
  globalSetup: createSkipperGlobalSetup(skipperConfig),
  reporter: [
    ['list'],
    [SkipperReporter, skipperConfig], // handles sync mode
  ],
  // ... rest of your config
});
```

### 2. Update test file imports

Replace the `@playwright/test` import with `@get-skipper/playwright`:

```ts
// Before:
import { test, expect } from '@playwright/test';

// After:
import { test, expect } from '@get-skipper/playwright';
```

The API is identical — `test` and `expect` work exactly as before. Tests with a future `disabledUntil` date in the spreadsheet are automatically skipped.

## Test ID Format

Tests are identified in the spreadsheet as:

```
{relative file path} > {describe block(s)} > {test name}
```

Example:
```
tests/auth/login.spec.ts > login > should log in with valid credentials
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

See the [root README](../../README.md) for full setup instructions including Google Sheets configuration.

## License

MIT
