# Phase 04 - Request Flow and QA

## Overview

- Priority: High
- Status: Completed
- Purpose: Validate the new API modal flow, public navigation cleanup, admin route, and BYOK boundary.

## Test Matrix

### Public Boot

- Fresh tab with empty `sessionStorage`.
  - Expected: public app loads, API modal opens.
- Fill invalid URL.
  - Expected: form shows not ready; save blocked or warning shown.
- Fill valid URL + Key.
  - Expected: modal closes; config stored only in `sessionStorage`.
- Reload same tab.
  - Expected: modal does not reopen.
- New tab or cleared `sessionStorage`.
  - Expected: modal opens again.

### Public UI

- Desktop 1440px.
  - Expected: top bar has no persistent API button.
  - Expected: left nav has no admin menu.
  - Expected: settings menu hidden or absent according to Phase 02.
- Mobile 390px.
  - Expected: bottom nav has no admin/settings entry unless product explicitly keeps settings.
  - Expected: modal fits viewport and inputs are usable.

### Request Flow

- Chat submit without config.
  - Expected: modal opens, no request sent.
- Generation submit without config.
  - Expected: modal opens, no request sent.
- Apps submit without config.
  - Expected: modal opens, no request sent.
- Config present but no matching model enabled.
  - Expected: model/admin error copy, not API modal.

### Admin

- Visit `/admin` directly.
  - Expected: admin portal renders.
- Login with password when configured.
  - Expected: admin console loads.
- Public home has no admin link/button/menu.

### Boundary

- Inspect `GET /api/public/bootstrap`.
  - Expected: no API Key, no user Base URL.
- Inspect `data/*.json`.
  - Expected: no public user API URL/Key written.
- Confirm chat/generation request bodies still carry user connection only at call time.

## Commands

```powershell
npm run check
npm run build
node --check server\index.mjs
```

## Browser QA

- Use current dev server at `http://localhost:8787/`.
- Capture screenshots:
  - desktop fresh boot with modal
  - desktop after modal saved
  - mobile fresh boot with modal
  - `/admin` desktop

## Related Code Files

- Verify: `C:\Users\56252\Documents\New project 2\src\App.tsx`
- Verify: `C:\Users\56252\Documents\New project 2\src\app\TopBar.tsx`
- Verify: `C:\Users\56252\Documents\New project 2\src\app\LeftNav.tsx`
- Verify: `C:\Users\56252\Documents\New project 2\src\app\MobileNav.tsx`
- Verify: `C:\Users\56252\Documents\New project 2\src\features\settings\*.tsx`
- Verify: `C:\Users\56252\Documents\New project 2\src\features\admin\*.tsx`
- Verify: `C:\Users\56252\Documents\New project 2\server\index.mjs`

## Todo List

- [x] Run static checks.
- [x] Run production build.
- [x] Smoke public bootstrap.
- [x] Smoke direct `/admin`.
- [x] Browser/server smoke on temporary local port.
- [x] Browser QA desktop screenshot: `reports/screenshots/api-modal-desktop.png`.
- [x] Browser QA mobile screenshot: `reports/screenshots/api-modal-mobile.png`.
- [x] Verify no credential persistence beyond `sessionStorage`.

## Success Criteria

- All commands pass.
- Modal flow is usable on desktop/mobile.
- Public UI has no persistent API config top-right control.
- Public UI has no admin menu/link.
- `/admin` remains functional.
- BYOK boundary remains intact.

## Unresolved Questions

- Should users be allowed to close the first-run API modal without filling credentials and browse read-only pages?
- Should old persisted admin/menu data with `settings.visible = true` be migrated, or should frontend hard-filter `settings` forever?
