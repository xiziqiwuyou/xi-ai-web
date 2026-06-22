# Phase 03: Admin Console Cleanup

Priority: medium
Status: planned

## Overview

Keep admin functionality, but remove the old "显示后台入口" setting because admin entry is now a fixed separate route.

## Files To Modify

- Modify: `C:\Users\56252\Documents\New project 2\src\features\admin\AdminDrawer.tsx` or new `AdminPortal.tsx`
- Optional modify: `C:\Users\56252\Documents\New project 2\src\types.ts`
- Optional modify: `C:\Users\56252\Documents\New project 2\server\index.mjs`

## Recommended Scope

Conservative:

- Keep `adminEntryEnabled` in `SiteSettings` and persisted JSON for backward compatibility.
- Stop rendering the checkbox in admin UI.
- Server can continue normalizing the field, but public UI ignores it.

Later cleanup:

- Remove `adminEntryEnabled` from types/default settings after data migration.

## Implementation Steps

1. Remove the checkbox labeled `显示后台入口`.
2. Keep system settings fields:
   - site name
   - allow guest chat
   - default module if added later
3. Keep menu management and provider management in admin route only.
4. Update README:
   - Admin URL: `/admin`
   - Public users use per-request model connection only.

## Success Criteria

- Admin console no longer implies public homepage can show/hide backend entry.
- Admin config remains protected and usable.

