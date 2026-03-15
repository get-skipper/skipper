# @get-skipper/cypress

Skipper plugin for [Cypress](https://www.cypress.io/) — enable/disable tests from a Google Spreadsheet.

## Installation

```bash
pnpm add -D @get-skipper/cypress
# or
npm install --save-dev @get-skipper/cypress
```

## Setup

### 1. Configure `cypress.config.ts`

```ts
import { defineConfig } from 'cypress';
import { createSkipperPlugin } from '@get-skipper/cypress';

const skipperConfig = {
  spreadsheetId: process.env.SKIPPER_SPREADSHEET_ID!,
  credentials: { credentialsBase64: process.env.GOOGLE_CREDS_B64! },
  // Or for local dev:
  // credentials: { credentialsFile: './service-account.json' },
};

export default defineConfig({
  e2e: {
    setupNodeEvents: createSkipperPlugin(skipperConfig),
    // ... rest of your config
  },
});
```

### 2. Add the support file

**Option A** — import in your existing support file (`cypress/support/e2e.ts`):

```ts
import '@get-skipper/cypress/support';
```

**Option B** — set as the support file in `cypress.config.ts`:

```ts
import { supportFile } from '@get-skipper/cypress';
export default defineConfig({
  e2e: {
    supportFile: supportFile,
    setupNodeEvents: createSkipperPlugin(skipperConfig),
  },
});
```

No changes to test files are required. Tests with a future `disabledUntil` date are automatically skipped via `beforeEach`.

## Test ID Format

```
{relative spec file path} > {describe block(s)} > {test name}
```

Example:
```
cypress/e2e/auth/login.cy.ts > login > should log in with valid credentials
```

## Modes

- **`read-only`** (default): reads the spreadsheet, skips disabled tests. No writes.
- **`sync`** (`SKIPPER_MODE=sync`): same as read-only + reconciles the spreadsheet after the run.

See the [root README](../../README.md) for full setup instructions.

## License

MIT
