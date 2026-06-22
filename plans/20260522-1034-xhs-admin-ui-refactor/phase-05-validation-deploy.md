# Phase 05: Validation and Deployment Hardening

Date: 2026-05-22
Priority: P1
Status: planned

## Overview

Validate the refactor end-to-end and keep server deployment simple.

## Checks

Run:

```bash
npm run check
npm run build
```

Manual browser checks:
- Desktop: `http://localhost:8787/`
- Mobile viewport: 390px wide.
- Admin login.
- Toggle menu item.
- Refresh public app.
- Chat stream.
- Provider add/edit without exposing API key.

API checks:
- `GET /api/public/bootstrap`
- `GET /api/admin/bootstrap` without cookie returns 401.
- `POST /api/admin/login` with wrong password returns 401.
- `POST /api/admin/login` with correct password sets cookie.
- `PATCH /api/admin/menu-items` persists to JSON.

## Deployment Config

Update:
- `C:\Users\56252\Documents\New project 2\.env.example`
- `C:\Users\56252\Documents\New project 2\README.md`
- `C:\Users\56252\Documents\New project 2\Dockerfile`

Environment:

```txt
PORT=8787
DATA_DIR=/app/data
ADMIN_PASSWORD=change-me
ADMIN_SESSION_SECRET=long-random-secret
PUBLIC_BASE_URL=https://your-domain.example
```

Compatibility:
- Deprecate `APP_PASSWORD`.
- Support it as fallback for one release only if needed.

## Testing Targets

- TypeScript clean.
- Production build clean.
- No browser console errors on first load.
- No text overlap on mobile.
- Disabled modules cannot be reached through UI.
- Admin-only endpoints protected.

## Rollback

- Keep current chat API contract until after UI refactor ships.
- Data migration must preserve version 1 fields.
- Before migration, copy JSON file:
  - `app-data.json` to `app-data.backup-YYYYMMDDHHmm.json`

## Future Work After This Plan

- Real image provider integration.
- Real TTS/STT provider integration.
- Video generation task queue.
- Knowledge base with file upload and vector search.
- Agent runtime/tool calling.
- SQLite/Postgres migration if multiple admins or high concurrency are needed.
