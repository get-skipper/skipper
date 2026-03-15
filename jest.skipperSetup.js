'use strict';

// Only activate the Skipper test-override when the resolver cache was populated
// by globalSetup (i.e. SKIPPER_SPREADSHEET_ID was set and globalSetup succeeded).
if (process.env.SKIPPER_CACHE_FILE) {
  require('./packages/jest/dist/setup');
}
