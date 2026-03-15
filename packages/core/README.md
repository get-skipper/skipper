# @get-skipper/core

Core package for Skipper — Google Sheets client, resolver, and shared utilities used by all framework plugins.

This package is not typically used directly. Install the plugin for your test framework instead:
- [`@get-skipper/playwright`](../playwright/README.md)
- [`@get-skipper/jest`](../jest/README.md)
- [`@get-skipper/vitest`](../vitest/README.md)
- [`@get-skipper/cypress`](../cypress/README.md)
- [`@get-skipper/nightwatch`](../nightwatch/README.md)

## API

### `SkipperResolver`

```ts
import { SkipperResolver } from '@get-skipper/core';

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
import { buildTestId } from '@get-skipper/core';

buildTestId('/abs/path/tests/auth/login.spec.ts', ['login', 'should log in']);
// → "tests/auth/login.spec.ts > login > should log in"
```

### `SheetsWriter`

Used internally by plugins in sync mode to reconcile the spreadsheet.

## License

MIT
