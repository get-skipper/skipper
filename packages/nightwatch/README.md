# @get-skipper/nightwatch

Skipper plugin for [Nightwatch.js](https://nightwatchjs.org/) — enable/disable tests from a Google Spreadsheet.

## Installation

```bash
pnpm add -D @get-skipper/nightwatch
# or
npm install --save-dev @get-skipper/nightwatch
```

## Setup

Update `nightwatch.conf.js` — this is the **only change required**:

```js
const { createSkipperPlugin } = require('@get-skipper/nightwatch');

module.exports = {
  globals: createSkipperPlugin({
    spreadsheetId: process.env.SKIPPER_SPREADSHEET_ID,
    credentials: { credentialsBase64: process.env.GOOGLE_CREDS_B64 },
    // Or for local dev:
    // credentials: { credentialsFile: './service-account.json' },
  }),
  // ... rest of your config
};
```

No changes to test files are required. Tests with a future `disabledUntil` date are automatically skipped via `beforeEach`.

## Test ID Format

```
{module path} > {test name}
```

If Nightwatch exposes nested describe blocks via `titlePath`, the full path is used:
```
tests/auth/login.js > login > should log in with valid credentials
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
