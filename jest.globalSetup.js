'use strict';

// Load .env so SKIPPER_SPREADSHEET_ID is available locally without exporting it manually
require('dotenv').config();

const spreadsheetId = process.env.SKIPPER_SPREADSHEET_ID;

if (!spreadsheetId) {
  // Skipper not configured — global setup is a no-op (tests run without gating)
  module.exports = async function skipperGlobalSetupNoop() {};
  return;
}

const { createSkipperGlobalSetup } = require('./packages/jest/dist/index');

module.exports = createSkipperGlobalSetup({
  spreadsheetId,
  credentials: { credentialsFile: './service-account-skipper-bot.json' },
});
