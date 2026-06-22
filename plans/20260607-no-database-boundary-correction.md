# No-Database Boundary Correction

Updated: 2026-06-07

## User Correction

The project does not need a database.

Public users should bring API URL and API key from the web page and pass them with each request.
The backend must not store public user API URL/key values.
The admin backend is only for developers/operators to manage metadata and login permissions.

## Implemented

- Removed SQLite runtime dependency and `node:sqlite` usage.
- Removed `STORAGE_DRIVER` configuration.
- Restored JSON-only developer metadata persistence:
  - `DATA_DIR/app-data.json`
  - `DATA_DIR/admin-audit.jsonl`
  - `DATA_DIR/backups/app-data-*.json`
- Kept admin login and admin-only operations routes.
- Updated operations panel to display metadata file instead of storage backend.
- Updated release check to fail if database-related server code returns:
  - `node:sqlite`
  - `DatabaseSync`
  - `STORAGE_DRIVER`
  - `app-data.sqlite`
- Updated operations runbook and roadmap to document the no-database boundary.

## Verification

- `node --check server/index.mjs`
- `node --check scripts/release-check.mjs`
- `npm run check`
- `npm run build`
- `npm run privacy`
- `npm run smoke`
- `npm run release-check`
- `npm run ui-contract`
- `npm run feature-audit`
- `npm run provider-contracts`

All checks passed.

## Boundary

Allowed backend persistence:

- developer/admin metadata
- admin audit log
- metadata backups

Disallowed backend persistence:

- public user API URL
- public user API key
- public user accounts/sessions
- database storage requirement
