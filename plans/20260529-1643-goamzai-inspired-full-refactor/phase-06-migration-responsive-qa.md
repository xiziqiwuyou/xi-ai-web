# Phase 06 - Migration, Responsive QA, Validation

## Overview

Status: Completed  
Priority: P0

Validate the full refactor and make sure the project is still deployable.

## Migration

- Version data from `3` to `4`.
- Preserve existing:
  - settings
  - menu items
  - model catalog
  - assistants
  - conversations
- Add defaults for:
  - new menu items
  - app presets
  - prompt presets
- Never introduce backend credential fields.

## Validation Commands

- `npm run check`
- `npm run build`
- `Invoke-RestMethod http://localhost:8787/api/public/bootstrap`
- `Invoke-RestMethod http://localhost:8787/api/admin/bootstrap`

## Browser QA

Desktop:

- 1440 x 900
- 1280 x 720

Mobile:

- 390 x 844
- 360 x 740

Flows:

- Open app.
- Configure API URL/key in settings.
- Open chat.
- Open image/audio/video.
- Open apps.
- Open knowledge.
- Open PPT.
- Open mindmap.
- Open gallery.
- Open `/admin`.
- Toggle menu item.
- Refresh public app.

## Acceptance Criteria

- No overlapping nav/settings buttons.
- No broken Chinese copy.
- Buttons and labels fit on mobile.
- Public app has no system settings/admin menu.
- Admin route works separately.
- Public bootstrap contains no credentials.
- Build passes.

## Completion Notes

- Production migration smoke test passed with a temporary version 3 data directory.
- Migration preserved settings, assistants, conversations, and legacy model catalog entries.
- Migration added missing version 4 defaults: menus, app presets, and prompt presets.
- Public bootstrap boundary passed: no `apiKey`, `baseUrl`, `providers`, or `featureSettings`.
- Browser QA passed across 1440 x 900, 1280 x 720, 390 x 844, and 360 x 740.
- Covered flows: settings API entry, chat, image, audio, video, apps, knowledge, PPT, mindmap, gallery, and `/admin`.
- Mobile bottom navigation now scrolls the active module into view.
- Validation passed: `npm run check`, `npm run build`, and `node --check server/index.mjs`.
- QA artifacts:
  - `reports/phase06-migration-qa.json`
  - `reports/phase06-browser-qa.json`
  - `reports/screenshots/phase06-*.png`

## Rollback

- Keep old module IDs supported in data migration.
- If new feature module fails, admin can disable it.
- If CSS refactor causes layout regression, keep previous CSS sections until replacement is verified.

## Unresolved Questions

- Should gallery persist generated results across refresh, or only current session?
- Should PPT export real `.pptx` in this phase or later?
- Should PDF chat support upload in MVP, or paste/extracted text first?
