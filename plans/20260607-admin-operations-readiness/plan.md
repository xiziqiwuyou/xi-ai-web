# Admin Operations Readiness Plan

## Goal
Make the self-hosted AI studio operable by a real administrator after deployment, without adding public user accounts or storing user API keys.

## Scope
- Add admin-only operations summary: menu health, model capability coverage, tools, data path, audit/backup counts, production secret checklist.
- Add backup visibility and restore flow for server-side metadata backups.
- Add audit log filters and client-side JSON export of the currently visible filtered results.
- Add admin health endpoint with non-secret runtime/config metadata.
- Preserve public boundary: no admin entry in public chrome; public API URL/key remains client session only.

## Non-goals
- Payment, membership, users, quotas, or public sharing.
- External observability integrations.
- Storing user BYOK credentials server-side.

## Implementation Notes
- Server: implement new admin-authenticated `/api/admin/ops`, `/api/admin/backups`, `/api/admin/backups/:name/restore`, and filtered `/api/admin/audit-log` query support. These are target-state endpoints for this phase, not existing APIs.
- Client API: add typed methods for ops summary, backup listing/restore, audit export/filter.
- Admin UI: add an Operations section with production checklist, backup restore, audit filter/export, and coverage warnings.
- Implementation files: `server/index.mjs`, `src/types.ts`, `src/api.ts`, `src/features/admin/AdminConsole.tsx`, `scripts/smoke.mjs`, and likely admin CSS under `src/styles/`.
- Validation: update smoke/contract as needed; run `npm run check`, `npm run build`, `npm run privacy`, `npm run ui-contract`, `npm run ui-runtime`, and `npm run smoke`.

## Regression Guardrails
- Public `/api/public/bootstrap` must not expose admin operations data or any API key.
- Public compatibility routes `/api/conversations` and `/api/conversations/:id` must continue returning `410 Gone`.
- Backup restore must block path traversal and must create a pre-restore backup before writing restored metadata.

## Restore Safety Contract
- Restore accepts only a basename route parameter, not a path.
- Allowed backup names must match `app-data-*.json`.
- The resolved file must stay under `backupDir`; absolute paths and traversal are rejected.
- Restored JSON must pass existing `normalizeData()` before assignment and `saveData()`.
- Restore must create a `pre-restore` backup before replacing current metadata and append an audit record.

## Audit Filtering Contract
- Server filters `/api/admin/audit-log?action=&limit=`.
- No separate server export endpoint is required.
- Admin UI downloads the currently rendered filtered rows as JSON.
