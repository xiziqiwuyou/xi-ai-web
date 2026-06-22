# Admin Operations Readiness Test Spec

## Server
- `/api/admin/ops` requires admin auth and returns no secrets.
- Operations payload includes data path, backup count, audit count, menu/model coverage, production checklist, and recent audit metadata.
- `/api/admin/backups` requires admin auth and lists available metadata backups sorted newest first.
- Restore endpoint validates backup file name, creates a pre-restore backup, normalizes restored data, writes audit record, and does not allow path traversal.
- Filtered audit endpoint supports action query and limit.
- Restore filename validation is precise: basename-only, `app-data-*.json` only, resolved under `backupDir`, no traversal or absolute paths, normalized through existing data normalization before `saveData()`.
- Public conversation compatibility routes `GET /api/conversations` and `GET /api/conversations/:id` are runtime-smoke checked and both continue returning `410`.

## Client
- Admin console can load operations data after login.
- Audit list can filter by action and export visible results.
- Audit export is client-side JSON export of the currently visible filtered audit rows; no separate server export endpoint is required.
- Backup list shows newest backups and can restore with confirmation.
- Production checklist distinguishes missing `ADMIN_PASSWORD` and default session secret.

## Regression
- Public bootstrap must not leak API keys or admin operations metadata.
- Existing model/menu editing remains functional.
- `npm run check`, `npm run build`, `npm run privacy`, `npm run ui-contract`, `npm run ui-runtime`, and `npm run smoke` pass.
