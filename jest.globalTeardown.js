'use strict';

require('dotenv').config();

const spreadsheetId = process.env.SKIPPER_SPREADSHEET_ID;

if (!spreadsheetId) {
  module.exports = async function skipperGlobalTeardownNoop() {};
  return;
}

const { createSkipperGlobalTeardown } = require('./packages/jest/dist/index');

const credsB64 = process.env.GOOGLE_CREDS_B64;
const credentials = credsB64
  ? { credentialsBase64: credsB64 }
  : { credentialsFile: './service-account-skipper-bot.json' };

module.exports = createSkipperGlobalTeardown({ spreadsheetId, credentials, sheetName: 'skipper' });
