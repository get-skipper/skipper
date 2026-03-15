'use strict';

require('dotenv').config();

const spreadsheetId = process.env.SKIPPER_SPREADSHEET_ID;

if (!spreadsheetId) {
  module.exports = async function skipperGlobalTeardownNoop() {};
  return;
}

const { createSkipperGlobalTeardown } = require('./packages/jest/dist/index');

module.exports = createSkipperGlobalTeardown({
  spreadsheetId,
  credentials: { credentialsFile: './service-account-skipper-bot.json' },
});
