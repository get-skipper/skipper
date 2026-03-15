#!/usr/bin/env node
/**
 * Creates the Google Spreadsheet used by Skipper to gate this monorepo's own
 * test suite, then writes its ID to .env.
 *
 * Run once:
 *   node scripts/setup-spreadsheet.js
 */

'use strict';

const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

const CREDENTIALS_FILE = path.resolve(__dirname, '..', 'service-account-skipper-bot.json');
const ENV_FILE = path.resolve(__dirname, '..', '.env');

async function main() {
  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));

  const auth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  console.log('Creating spreadsheet…');

  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: 'Skipper — monorepo test gating' },
      sheets: [
        {
          properties: { title: 'Sheet1' },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                {
                  values: [
                    { userEnteredValue: { stringValue: 'testId' } },
                    { userEnteredValue: { stringValue: 'disabledUntil' } },
                    { userEnteredValue: { stringValue: 'notes' } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  });

  const spreadsheetId = res.data.spreadsheetId;
  const url = res.data.spreadsheetUrl;

  console.log('');
  console.log('✓ Spreadsheet created');
  console.log('  ID :', spreadsheetId);
  console.log('  URL:', url);
  console.log('');
  console.log('NOTE: the spreadsheet is only accessible to the service account.');
  console.log('To also view it in your browser, share it with your Google account.');

  // Append (or create) .env with the spreadsheet ID
  let envContent = '';
  if (fs.existsSync(ENV_FILE)) {
    envContent = fs.readFileSync(ENV_FILE, 'utf8');
    // Remove any existing SKIPPER_SPREADSHEET_ID line
    envContent = envContent.replace(/^SKIPPER_SPREADSHEET_ID=.*\n?/m, '');
  }
  envContent += `SKIPPER_SPREADSHEET_ID=${spreadsheetId}\n`;
  fs.writeFileSync(ENV_FILE, envContent, 'utf8');

  console.log('');
  console.log('✓ Written to .env: SKIPPER_SPREADSHEET_ID=' + spreadsheetId);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Run SKIPPER_MODE=sync pnpm test   to populate the spreadsheet with all test IDs');
  console.log('  2. Open the sheet and set disabledUntil dates for any tests you want to skip');
  console.log('  3. Run pnpm test normally — disabled tests are skipped automatically');
}

main().catch((err) => {
  console.error('Error:', err.message ?? err);
  process.exit(1);
});
