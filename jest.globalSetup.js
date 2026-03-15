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

const credsB64 = process.env.GOOGLE_CREDS_B64;
const credentials = credsB64
  ? { credentialsBase64: credsB64 }
  : { credentialsFile: './service-account-skipper-bot.json' };

module.exports = createSkipperGlobalSetup({ spreadsheetId, credentials, sheetName: 'skipper' });
