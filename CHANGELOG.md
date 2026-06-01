# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2026-06-01

### Added

- **core**: quarantine debt report emitted after every run — surfaces suppressed test data via `GITHUB_STEP_SUMMARY` (fallback to stdout) and writes `skipper-report.json` as a run artifact. Report includes: suppressed count, tests expiring this week, re-enabled tests (expired quarantine), and total quarantine-days debt.
- All framework integrations (vitest, jest, playwright, cypress, nightwatch) now call `emitSummary()` at teardown time so the report is emitted on every run regardless of `SKIPPER_MODE`.

## [1.2.0] - 2026-04-09

### Fixed

- **core**: strict `YYYY-MM-DD` date parsing — non-padded formats (e.g. `2026-4-1`) now throw a descriptive error with the row number instead of silently producing an invalid date.
- **core**: dates are now interpreted as midnight UTC of the *next* day, so `disabledUntil: 2026-04-01` keeps the test disabled through the entire calendar day in UTC and re-enables at `2026-04-02T00:00:00Z`, regardless of the runner's local timezone.
- **ci**: add `@types/node` to Cypress devDependencies and build `core` before typechecking to fix CI typecheck failures.
- **lint**: allow underscore-prefixed unused arguments and fix empty object pattern lint errors.

## [1.1.0] - 2026-03-28

### Added

- `SKIPPER_FAIL_OPEN` env var (default `true`): when the Sheets API is unreachable and no valid cache exists, Skipper enables all tests instead of crashing. Set to `false` to restore the previous crash behaviour.
- `SKIPPER_CACHE_TTL` env var (default `300` seconds): Skipper writes a `.skipper-cache.json` file after each successful fetch and reads it as a fallback on API failure. Entries older than the TTL are ignored.
- `SKIPPER_SYNC_ALLOW_DELETE` env var (default `false`): in sync mode, orphaned rows (tests removed from the suite) are now only warned about by default. Set to `true` to delete them from the spreadsheet.

## [1.0.1] - 2026-03-26

### Added

- Full documentation for `sheetName`, `referenceSheets`, `testIdColumn`, `disabledUntilColumn`, and all other config options in the root README.

### Fixed

- Release script: keep `workspace:*` references in `package.json` and restore the lockfile after publishing, preventing broken installs on subsequent local runs.

## [1.0.0] - 2026-03-25

### Added

- Initial release of the Skipper monorepo.
- `@get-skipper/core`: Google Sheets client, resolver, writer, and cache helpers.
- `@get-skipper/playwright`, `@get-skipper/jest`, `@get-skipper/vitest`, `@get-skipper/cypress`, `@get-skipper/nightwatch`: framework-specific plugins.
- Read-only mode: skip tests whose `disabledUntil` date is in the future.
- Sync mode (`SKIPPER_MODE=sync`): reconcile the spreadsheet after a test run — append new tests, remove obsolete ones.
- `SKIPPER_DEBUG` env var for verbose logging.
- CI workflow for automated publishing to npm.

[Unreleased]: https://github.com/get-skipper/skipper/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/get-skipper/skipper/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/get-skipper/skipper/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/get-skipper/skipper/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/get-skipper/skipper/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/get-skipper/skipper/releases/tag/v1.0.0
