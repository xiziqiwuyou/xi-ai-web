# Phase 01: Separate Admin Route

Priority: high
Status: planned

## Overview

Render a dedicated admin page when browser path is `/admin`. Do not mount admin drawer in the public app.

## Files To Modify

- Modify: `C:\Users\56252\Documents\New project 2\src\App.tsx`
- Modify/create: `C:\Users\56252\Documents\New project 2\src\features\admin\AdminPortal.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\admin\AdminDrawer.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\styles.css`

## Implementation Steps

1. Create `AdminPortal.tsx`.
   - Reuse admin auth/loading logic from `AdminDrawer`.
   - Render as full page, not drawer.
   - Use existing `AdminConsole` logic.
2. In `App.tsx`, derive route:

```ts
const isAdminRoute = window.location.pathname.replace(/\/+$/, "") === "/admin";
```

3. If `isAdminRoute`, render `AdminPortal` and skip public bootstrap shell.
4. Keep Express catch-all unchanged. Vite/production already serves SPA for `/admin`.
5. Remove `adminOpen` state from public `App`.

## Success Criteria

- `/admin` loads admin UI directly.
- `/` never mounts admin drawer.
- Admin auth behavior unchanged.

## Risk

- Reusing drawer internals may create duplicated code.
  - Mitigation: extract shared `AdminConsole` or keep one portal component and delete drawer usage.

