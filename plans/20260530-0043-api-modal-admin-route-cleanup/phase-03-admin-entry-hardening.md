# Phase 03 - Admin Entry Hardening

## Overview

- Priority: Medium
- Status: Completed
- Purpose: Make `/admin` the only admin access path and remove stale public admin-entry concepts.

## Requirements

- Public app must not render any admin entry button/link/menu.
- Admin remains available by typing `/admin` in the address bar.
- Admin login and admin APIs keep current password/cookie behavior.
- Public bootstrap must not expose any user credential fields.
- Admin controls menus/model catalog/assistants/apps/prompt presets only.

## Related Code Files

- Modify: `C:\Users\56252\Documents\New project 2\src\types.ts`
  - Consider removing `adminEntryEnabled` from `SiteSettings` if no longer needed.
- Modify: `C:\Users\56252\Documents\New project 2\server\index.mjs`
  - Remove or ignore `adminEntryEnabled`.
  - Keep `/api/admin/*` protected by existing admin auth.
  - Keep `/admin` route handled by SPA fallback.
- Modify: `C:\Users\56252\Documents\New project 2\src\features\admin\AdminDrawer.tsx`
  - Split `AdminConsole` into its own file if cleaning drawer wrapper.
  - Remove unused public drawer component after split.
- Modify: `C:\Users\56252\Documents\New project 2\src\features\admin\AdminPortal.tsx`
  - Import `AdminConsole` from new location if split.
- Modify: `C:\Users\56252\Documents\New project 2\src\styles.css`
  - Remove unused `.admin-layer`, `.admin-drawer`, `.admin-scrim` styles only after drawer wrapper is gone.
- Modify: `C:\Users\56252\Documents\New project 2\README.md`
  - Document that admin is only available at `/admin`.

## Options

### Option A - Minimal Cleanup

- Keep `AdminDrawer.tsx` file but ensure it is not used.
- Keep `adminEntryEnabled` ignored.
- Fast, low risk.
- Leaves dead code.

### Option B - Proper Cleanup

- Move `AdminConsole` to `AdminConsole.tsx`.
- Delete drawer wrapper and stale styles.
- Remove `adminEntryEnabled` from type/server/admin form.
- Slightly more work, cleaner boundary.

## Recommendation

Use Option B if touching admin files anyway. It prevents future regressions where someone re-adds a public admin drawer.

## Implementation Steps

1. Search all admin public-entry references.
2. Split reusable `AdminConsole` from drawer wrapper if needed.
3. Update `AdminPortal` import.
4. Remove stale public drawer wrapper and styles.
5. Remove `adminEntryEnabled` from:
   - `SiteSettings`
   - defaults
   - normalization
   - admin settings form
6. Keep `/admin` path behavior in `App.tsx`.
7. Update README.

## Todo List

- [x] Confirm no public admin trigger exists.
- [x] Leave unused admin drawer wrapper unmounted; public shell has no admin import or trigger.
- [x] Remove `adminEntryEnabled` if safe.
- [x] Keep `/admin` direct route working.
- [x] Update docs.

## Success Criteria

- Public UI has no admin affordance.
- Visiting `/admin` renders admin portal.
- Admin login/logout still works.
- Public API bootstrap has no API URL/Key and no public admin entry requirement.
- Type check passes after removing stale fields.

## Security Considerations

- `/admin` is discoverable by URL. That is acceptable only with `ADMIN_PASSWORD` configured in production.
- README should continue warning that production must set `ADMIN_PASSWORD`.
- Do not weaken `requireAdmin`.
