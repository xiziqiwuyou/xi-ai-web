# Phase 01 - Foundation Cleanup and UI Consistency

## Context Links

- Report: `C:\Users\56252\Documents\New project 2\plans\20260530-1143-next-feature-ui-roadmap\reports\current-feature-gap-notes.md`
- Prior cleanup: `C:\Users\56252\Documents\New project 2\plans\20260530-0043-api-modal-admin-route-cleanup\plan.md`

## Overview

Date: 2026-05-30  
Priority: P0  
Status: Completed

Clean stale public settings/admin drawer code paths, then tighten the Rednote glass UI around the public shell, API modal, mobile nav, and admin portal.

## Key Insights

- Public settings is already filtered out, but `settings` still exists in frontend module types and registry.
- `AdminConsole` was useful but lived inside `AdminDrawer.tsx`; it has now been split into its own file.
- UI polish should happen before feature expansion so new modules use stable patterns.

## Requirements

- Public app must not show system settings or admin entry.
- API URL/Key still configured only through demand-driven modal.
- `/admin` still works directly.
- No backend persistence of public API URL/Key.
- Keep Rednote glass style visible but restrained.
- Improve menu spacing, hover, shadows, input focus, and responsive fit.

## Architecture

Refactor UI ownership:

```text
App
  AppShell public only
    LeftNav / MobileNav / TopBar
    ModuleRouter
    ApiConnectionModal

/admin route
  AdminPortal
    AdminConsole
```

Remove public settings as a module concept. Keep API configuration as modal state owned by `App`.

## Related Code Files

- Modify: `C:\Users\56252\Documents\New project 2\src\types.ts`
  - Remove `settings` from public `ModuleId` if no longer needed.
- Modify: `C:\Users\56252\Documents\New project 2\src\app\moduleRegistry.tsx`
  - Remove settings metadata, icon import, order entry, and system group if unused.
- Modify: `C:\Users\56252\Documents\New project 2\src\app\ModuleRouter.tsx`
  - Remove settings fallback branch if present.
- Modify: `C:\Users\56252\Documents\New project 2\src\features\admin\AdminPortal.tsx`
  - Import `AdminConsole` from a dedicated file.
- Create: `C:\Users\56252\Documents\New project 2\src\features\admin\AdminConsole.tsx`
  - Move console-only code from `AdminDrawer.tsx`.
- Modify or delete: `C:\Users\56252\Documents\New project 2\src\features\admin\AdminDrawer.tsx`
  - Delete drawer wrapper if no longer mounted.
- Delete or archive: `C:\Users\56252\Documents\New project 2\src\features\settings\UserSettingsModule.tsx`
  - Keep only if a non-public fallback is required.
- Modify: `C:\Users\56252\Documents\New project 2\src\styles.css`
  - Remove stale `.settings-module` and `.admin-drawer` styles after component cleanup.
  - Polish shell/menu/modal/card/input states.
- Modify: `C:\Users\56252\Documents\New project 2\server\index.mjs`
  - Remove defensive `settings` menu migration only if persisted data migration stays safe.

## Implementation Steps

1. Confirm no active route can navigate to `settings`.
2. Split `AdminConsole` into its own file.
3. Delete drawer wrapper only after imports compile.
4. Remove `settings` from `ModuleId`, `moduleMeta`, and `portalModuleOrder`.
5. Adjust any type errors in menu/default-module normalization.
6. Polish public shell:
   - Left rail width and icon scale.
   - Active state shadow and border.
   - Top bar spacing after API button removal.
   - Modal glass depth, focus ring, and mobile safe-area.
7. Polish admin portal:
   - Login panel spacing.
   - Console section rhythm.
   - Button and form consistency.
8. Remove dead CSS selectors.
9. Run TypeScript/build checks.
10. Browser-check public `/` and `/admin` desktop/mobile.

## Todo List

- [x] Split `AdminConsole` from drawer wrapper.
- [x] Remove public `settings` module from frontend types and registry.
- [x] Clean unused settings module and CSS.
- [x] Polish public shell interaction states.
- [x] Polish API modal responsive behavior.
- [x] Validate `/admin` direct route.

## Success Criteria

- `settings` cannot appear in left/mobile menu through frontend registry.
- Public page has no system settings/admin link.
- Missing API opens modal.
- `/admin` loads login/console directly.
- `npm run check` passes.
- `npm run build` passes.
- Desktop and mobile screenshots show no overlap or awkward empty chrome.

## Risk Assessment

- Risk: Removing `settings` from `ModuleId` breaks old persisted `defaultModule`.
  - Mitigation: normalize unknown or removed default modules to `chat`.
- Risk: Moving `AdminConsole` causes large diff.
  - Mitigation: move first, then polish in a separate commit/step if needed.

## Security Considerations

- Do not add admin link to public UI.
- Do not move API URL/Key into server data.
- Keep modal storage in `sessionStorage`.

## Next Steps

After Phase 01, implement knowledge upload and retrieval using stable public shell patterns.
