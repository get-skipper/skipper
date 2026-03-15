# @skipper/core

Core package for Skipper — Google Sheets client, resolver, and shared utilities used by all framework plugins.

This package is not typically used directly. Install the plugin for your test framework instead:
- [`@skipper/playwright`](../playwright/README.md)
- [`@skipper/jest`](../jest/README.md)
- [`@skipper/vitest`](../vitest/README.md)
- [`@skipper/cypress`](../cypress/README.md)
- [`@skipper/nightwatch`](../nightwatch/README.md)

## API

### `SkipperResolver`

```ts
import { SkipperResolver } from '@skipper/core';

const resolver = new SkipperResolver({
  spreadsheetId: 'your-spreadsheet-id',
  credentials: { credentialsFile: './service-account.json' },
});

await resolver.initialize();
resolver.isTestEnabled('tests/auth/login.spec.ts > login > should log in'); // true | false
```

### `buildTestId(filePath, titlePath)`

Builds a canonical test ID from a file path and title path array:

```ts
import { buildTestId } from '@skipper/core';

buildTestId('/abs/path/tests/auth/login.spec.ts', ['login', 'should log in']);
// → "tests/auth/login.spec.ts > login > should log in"
```

### `SheetsWriter`

Used internally by plugins in sync mode to reconcile the spreadsheet.

## License

MIT
