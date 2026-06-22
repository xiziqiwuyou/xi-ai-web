# Phase 04: Admin Console

Date: 2026-05-22
Priority: P0
Status: planned

## Overview

Create a backend administrator entrance without public registration:
- Admin login.
- Menu switches.
- API/provider settings.
- Assistant editing.
- Basic system settings.

## UX

Entry:
- Top-right "后台" or settings icon.
- Opens admin login if not authenticated.
- Opens admin console if authenticated.

Admin console sections:
- 菜单管理
- API 设置
- 助手库管理
- 系统设置
- 数据维护

## Files

Create:
- `C:\Users\56252\Documents\New project 2\src\features\admin\AdminModule.tsx`
- `C:\Users\56252\Documents\New project 2\src\features\admin\AdminLogin.tsx`
- `C:\Users\56252\Documents\New project 2\src\features\admin\MenuSettings.tsx`
- `C:\Users\56252\Documents\New project 2\src\features\admin\ProviderSettings.tsx`
- `C:\Users\56252\Documents\New project 2\src\features\admin\AssistantSettings.tsx`
- `C:\Users\56252\Documents\New project 2\src\features\admin\SystemSettings.tsx`

Modify:
- `C:\Users\56252\Documents\New project 2\src\api.ts`
- `C:\Users\56252\Documents\New project 2\server\index.mjs`

## Admin API

```txt
POST   /api/admin/login
POST   /api/admin/logout
GET    /api/admin/status
GET    /api/admin/bootstrap
PATCH  /api/admin/settings
PATCH  /api/admin/menu-items
GET    /api/admin/providers
POST   /api/admin/providers
PATCH  /api/admin/providers/:id
DELETE /api/admin/providers/:id
GET    /api/admin/assistants
POST   /api/admin/assistants
PATCH  /api/admin/assistants/:id
DELETE /api/admin/assistants/:id
```

## Menu Management

Admin can control:
- Label.
- Enabled.
- Visible.
- Sort order.

Recommended behavior:
- `visible=false`: do not show to guest.
- `visible=true`, `enabled=false`: show disabled item with "未启用" if product wants marketing preview.
- Default: hidden when disabled.

## API Settings

Admin can configure:
- Provider name.
- Provider type: start with `openai-compatible`.
- Base URL.
- API key write-only.
- Default chat model.
- Supported models.
- Feature capability flags: chat/image/audio/video/embedding.

Provider type future:
- `openai-compatible`
- `ollama`
- `custom-http`

## System Settings

Admin can configure:
- Site name.
- Theme variant.
- Guest chat allowed.
- Admin entry visible.
- Default menu.

## Security

- Admin console must not mount management data until admin status passes.
- API key inputs are write-only.
- Admin cookie is HttpOnly.
- No registration endpoints.
- Never expose `ADMIN_PASSWORD`.

## Success Criteria

- Admin can toggle menu items and refresh app to see changes.
- Admin can add/edit providers.
- Public guest cannot call admin endpoints.
- Public guest cannot see raw API keys.
- No registration UI exists.

## Risks

- If admin entry can be hidden, keep direct `/admin` route or keyboard-safe fallback.
- Single password admin is enough for MVP but weak for teams. Document clearly.
