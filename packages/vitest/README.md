# @get-skipper/vitest

Skipper plugin for [Vitest](https://vitest.dev/) — enable/disable tests from a Google Spreadsheet.

## Installation

```bash
pnpm add -D @get-skipper/vitest
# or
npm install --save-dev @get-skipper/vitest
```

## Setup

Update `vitest.config.ts` — this is the **only change required**:

```ts
import { defineConfig } from 'vitest/config';
import { createSkipperGlobalSetup, createSkipperGlobalTeardown, setupFile } from '@get-skipper/vitest';

const skipperConfig = {
  spreadsheetId: process.env.SKIPPER_SPREADSHEET_ID!,
  credentials: { credentialsBase64: process.env.GOOGLE_CREDS_B64! },
  // Or for local dev:
  // credentials: { credentialsFile: './service-account.json' },
};

export default defineConfig({
  test: {
    globalSetup: [createSkipperGlobalSetup(skipperConfig)],
    globalTeardown: [createSkipperGlobalTeardown(skipperConfig)],
    setupFiles: [setupFile],
    // ... rest of your config
  },
});
```

No changes to test files are required. Tests with a future `disabledUntil` date are automatically skipped.

## Test ID Format

```
{relative file path} > {describe block(s)} > {test name}
```

## Modes

- **`read-only`** (default): reads the spreadsheet, skips disabled tests. No writes.
- **`sync`** (`SKIPPER_MODE=sync`): same as read-only + reconciles the spreadsheet after the run.

See the [root README](../../README.md) for full setup instructions.

## License

MIT
