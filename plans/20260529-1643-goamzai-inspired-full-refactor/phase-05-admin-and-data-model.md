# Phase 05 - Admin and Data Model

## Overview

Status: Completed  
Priority: P1

Expand admin so it can control the new portal features while preserving the no-credential backend boundary.

## Admin Scope

Admin can manage:

- Site settings.
- Menu visibility/order/enabled.
- Model catalog.
- Assistant/app catalog.
- Prompt presets.
- Feature defaults.

Admin cannot manage:

- Public user API keys.
- Public user API base URLs.
- Public user accounts.
- Payment packages.

## Related Files

- Modify: `C:\Users\56252\Documents\New project 2\src\features\admin\AdminPortal.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\admin\AdminDrawer.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\server\index.mjs`
- Modify: `C:\Users\56252\Documents\New project 2\data\app-data.json`
- Modify: `C:\Users\56252\Documents\New project 2\src\types.ts`

## Data Model

Add optional structures:

```ts
type AppPreset = {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  prompt: string;
  enabled: boolean;
};

type PromptPreset = {
  id: string;
  moduleId: ModuleId;
  title: string;
  prompt: string;
  enabled: boolean;
};
```

## Implementation Steps

1. Add data migration in `normalizeData`.
2. Add admin CRUD APIs:
   - `/api/admin/apps`
   - `/api/admin/prompt-presets`
3. Add public bootstrap fields:
   - enabled apps
   - enabled prompt presets
4. Update admin UI:
   - left sections or tabs
   - menu editor
   - model catalog editor
   - app/prompt editor
5. Validate public bootstrap has no credentials.

## Success Criteria

- Admin can turn new modules on/off.
- Admin can add app cards used by public Apps module.
- Admin can add prompt presets per feature.
- Public bootstrap still excludes `apiKey`, `baseUrl`, `providers`, `featureSettings`.

## Completion Notes

- Data model migrated to version 4 with admin-managed `appPresets` and `promptPresets`.
- Public bootstrap now exposes enabled apps and prompt presets only.
- Admin bootstrap exposes full app/prompt preset lists for management.
- Admin CRUD is implemented for `/api/admin/apps` and `/api/admin/prompt-presets`.
- Frontend Apps and Generation modules now read presets from bootstrap data.
- Validation passed: `npm run check`, `npm run build`, `node --check server/index.mjs`, public bootstrap credential-boundary check, admin CRUD smoke test, and desktop browser screenshot QA.

## Risk

- Admin becomes too large in one drawer.
- Mitigation: make `/admin` full page tabs, keep drawer out of public shell.
