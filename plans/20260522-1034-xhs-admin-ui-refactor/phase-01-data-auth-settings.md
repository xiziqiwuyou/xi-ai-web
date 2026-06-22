# Phase 01: Data, Auth, and Settings Model

Date: 2026-05-22
Priority: P0
Status: planned

## Overview

Create a simple public/admin model:
- Guests can use enabled public modules.
- Admin logs in through a backend admin entrance.
- Admin can edit API providers, menu visibility, site branding, and feature toggles.
- No user registration.

## Requirements

- Keep existing JSON persistence.
- Add admin session separate from guest access.
- Move API/provider management behind admin auth.
- Public bootstrap must expose only safe data.
- Admin bootstrap can expose management metadata, never raw API keys.

## Recommended Data Shape

File: `C:\Users\56252\Documents\New project 2\data\app-data.json`

```ts
type AppData = {
  version: 2;
  settings: {
    siteName: string;
    theme: "rednote";
    allowGuestChat: boolean;
    adminEntryEnabled: boolean;
  };
  menuItems: Array<{
    id: "chat" | "image" | "audio" | "video" | "agents" | "knowledge" | "assistants";
    label: string;
    enabled: boolean;
    visible: boolean;
    order: number;
  }>;
  providers: Provider[];
  assistants: Assistant[];
  conversations: Conversation[];
  featureSettings: {
    chat: { enabledProviderIds: string[] };
    image: { enabledProviderIds: string[]; defaultModel?: string };
    audio: { enabledProviderIds: string[]; defaultModel?: string };
    video: { enabledProviderIds: string[]; defaultModel?: string };
    knowledge: { maxUploadMb: number; enabled: boolean };
  };
};
```

## API Design

Modify `C:\Users\56252\Documents\New project 2\server\index.mjs`.

Public:
- `GET /api/public/bootstrap`
  - Returns site settings, visible enabled menu items, safe provider summaries, public assistants.
- Existing chat endpoints stay public only when `settings.allowGuestChat === true`.

Admin:
- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/admin/bootstrap`
- `PATCH /api/admin/settings`
- `PATCH /api/admin/menu-items`
- Move provider CRUD under `/api/admin/providers`
- Move assistant management under `/api/admin/assistants` unless assistant editing should be public.

Compatibility:
- Keep current `/api/bootstrap` temporarily as alias or migrate frontend in same PR.
- Keep conversation APIs unchanged initially, but check menu/chat availability.

## Security

- Use `ADMIN_PASSWORD` instead of current `APP_PASSWORD`.
- Set `HttpOnly`, `SameSite=Lax`, `Secure` when behind HTTPS.
- Admin APIs must require admin cookie.
- Public bootstrap must never include `apiKey`.
- Rate-limit admin login later if app is internet-facing. MVP can add simple in-memory delay after failures.

## Files

Modify:
- `C:\Users\56252\Documents\New project 2\server\index.mjs`
- `C:\Users\56252\Documents\New project 2\src\types.ts`
- `C:\Users\56252\Documents\New project 2\src\api.ts`
- `C:\Users\56252\Documents\New project 2\.env.example`
- `C:\Users\56252\Documents\New project 2\README.md`

Create:
- `C:\Users\56252\Documents\New project 2\src\api\admin.ts`
- `C:\Users\56252\Documents\New project 2\src\api\public.ts`

## Implementation Steps

1. Add `settings`, `menuItems`, and `featureSettings` defaults in `createDefaultData`.
2. Add migration in `normalizeData` from version 1 to version 2.
3. Replace shared auth helpers with `hasAdminAuth` and `requireAdmin`.
4. Add admin login/logout/status endpoints.
5. Add public/admin bootstrap separation.
6. Move provider mutation endpoints behind admin guard.
7. Update frontend API wrappers.

## Success Criteria

- Guest can load public bootstrap without logging in.
- Admin can log in from admin endpoint.
- Provider API keys remain write-only.
- Disabled menu items do not appear in public bootstrap.
- Existing chat still works when chat menu is enabled.

## Risks

- Breaking current app startup if migration is incomplete.
- Accidentally exposing provider metadata. Sanitize all admin/public responses.
