# Phase 05: Responsive QA and Validation

Priority: medium
Status: planned

## Overview

Validate the redesign and permissions with type checks, production build, server smoke tests, and browser screenshots.

## Related Code Files

- Verify all files changed in phases 01-04.

## Checks

Run:

```bash
npm run check
npm run build
```

Then start production server:

```bash
npm run start
```

## API Smoke Tests

1. Public bootstrap:

```bash
curl http://localhost:8787/api/public/bootstrap
```

Expected:

- `settings`, `menuItems`, `assistants`, `conversations`.
- No API key.

2. Admin status:

```bash
curl http://localhost:8787/api/admin/status
```

Expected:

- Auth state matches `ADMIN_PASSWORD` setup.

3. Unauthenticated admin bootstrap:

```bash
curl -i http://localhost:8787/api/admin/bootstrap
```

Expected:

- `401` when `ADMIN_PASSWORD` is configured.
- Not unlocked in production if password is absent.

4. Transient chat:

```json
{
  "assistantId": "...",
  "model": "gpt-4.1-mini",
  "temperature": 0.7,
  "content": "你好",
  "transientProvider": {
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "sk-...",
    "model": "gpt-4.1-mini"
  }
}
```

Expected:

- SSE starts.
- Key is not written into `data/app-data.json`.

## Visual QA

Inspect:

- Desktop `1440x900`.
- Medium `1024x768`.
- Mobile `390x844`.
- Admin drawer login.
- Admin drawer after login.
- Chat composer focus state.
- Connection popover.
- Disabled or hidden menu item behavior.

## Success Criteria

- No TypeScript errors.
- Production build succeeds.
- No visible overlap.
- Left rail remains premium at desktop and medium widths.
- Mobile navigation remains usable.
- Admin-only settings cannot be changed by unauthenticated users.
- Transient user API key never persists.

