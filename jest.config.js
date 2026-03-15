/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/packages/**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@skipper/core$': '<rootDir>/packages/core/src/index.ts',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.base.json',
      },
    ],
  },

  // ── Skipper integration ────────────────────────────────────────────────────
  // Loads the spreadsheet once before all workers start and writes SKIPPER_CACHE.
  // No-op when SKIPPER_SPREADSHEET_ID is not set (e.g. in CI without credentials).
  globalSetup: '<rootDir>/jest.globalSetup.js',
  globalTeardown: '<rootDir>/jest.globalTeardown.js',
  // Reads SKIPPER_CACHE per worker and wraps global test/it to auto-skip disabled tests.
  setupFilesAfterEnv: ['<rootDir>/jest.skipperSetup.js'],

  clearMocks: true,
  restoreMocks: true,
  forceExit: true,
};

module.exports = config;
