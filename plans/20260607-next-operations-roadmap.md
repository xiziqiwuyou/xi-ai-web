# Next Operations Roadmap

Updated: 2026-06-07

## Phase 01 - No-Database Metadata Boundary

Goal: keep the project database-free while making the metadata and credential boundaries explicit.

- Keep developer/admin metadata in `DATA_DIR/app-data.json`.
- Keep admin audit logs in `DATA_DIR/admin-audit.jsonl`.
- Keep public user API URL/key values browser-provided and request-scoped only.
- Add release checks that fail if SQLite/database code or server-side public credentials appear.

Acceptance:

- Existing public/admin APIs keep the same response shape.
- `npm run release-check` passes with JSON metadata only.
- Privacy scans confirm no backend storage of user API URL/key.
- Admin login remains required in production.

## Phase 02 - Scheduled Backup Operations

Goal: make backup behavior operational instead of only import/restore-driven.

- Add admin endpoint to create a manual backup.
- Add retention settings in admin console.
- Add optional scheduled backup interval through environment variables.
- Show backup reason, size, and age in admin UI.

Acceptance:

- Admin can create a backup without importing metadata.
- Retention is enforced and visible.
- Restore flow still creates pre-restore backup.

## Phase 03 - Provider Health Probes

Goal: help operators know whether configured model catalog entries are usable.

- Add admin-only provider/model probe endpoint.
- Probe uses operator-provided temporary API URL/key in the browser session, not server-stored secrets.
- Show per-model capability probe status in admin model catalog.

Acceptance:

- No API keys are persisted.
- Failed probes show actionable endpoint/model/capability errors.
- Public bootstrap remains secret-free.

## Phase 04 - Audit Search And Pagination

Goal: make audit logs usable after long-running operation.

- Add cursor or offset pagination for audit log.
- Add date range filters.
- Add action suggestions from known admin actions.
- Keep client-side export for the current filtered page and add full filtered export only after size limits are defined.

Acceptance:

- Large audit files do not need to be fully rendered in the browser.
- Existing `action` and `limit` filters remain compatible.

## Phase 05 - Admin UX Hardening

Goal: make daily operation safer for non-technical administrators.

- Add explicit confirmation copy for restore and destructive deletes.
- Add dirty-state warnings in admin forms.
- Add save success timestamps.
- Add empty states for backups and audit filters.

Acceptance:

- Restore/delete flows require clear confirmation.
- Admin forms are harder to accidentally abandon.
- UI remains flat red/white with small radii.

## Phase 06 - Deployment Profiles

Goal: reduce manual deployment mistakes.

- Add example Docker Compose file.
- Add `.env.production.example`.
- Add reverse proxy notes for HTTPS and secure cookies.
- Add healthcheck examples.

Acceptance:

- A server operator can deploy with Docker Compose using only the runbook.
- `npm run release-check` remains the local release gate.
