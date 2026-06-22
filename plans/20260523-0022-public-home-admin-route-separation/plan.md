# Plan: Public Home / Admin Route Separation

Date: 2026-05-23
Status: planned
Scope: plan only. No code implementation in this pass.

## Goal

Public home must not show system/admin settings entry.

- Home page keeps only product modules: 对话、画图、音频、视频、智能体、知识库、助手库.
- Public users only see model connection fields where needed: API URL, API Key, model.
- Backend/admin is a separate entrance: `/admin`.
- Admin-only settings stay behind admin login and never appear in public chrome.

## Current Problem

Current code still couples admin with public shell:

- `C:\Users\56252\Documents\New project 2\src\app\TopBar.tsx`
  - Imports `SlidersHorizontal`.
  - Renders top-right admin/settings icon when `settings.adminEntryEnabled`.
- `C:\Users\56252\Documents\New project 2\src\App.tsx`
  - Owns `adminOpen`.
  - Mounts `AdminDrawer` inside normal public app.
- `C:\Users\56252\Documents\New project 2\src\app\AppShell.tsx`
  - Requires `onOpenAdmin`.
- `C:\Users\56252\Documents\New project 2\src\features\admin\AdminDrawer.tsx`
  - Good admin functionality, but presented as public app drawer.

## Decision

Use `/admin` as the only admin entrance.

Public route `/`:

- No admin icon.
- No system settings text.
- No backend/settings menu.
- Only model connection controls in chat/generation modules.

Admin route `/admin`:

- Full-page admin portal.
- Login if needed.
- Admin console after login.
- Contains system settings, menu switches, provider persistence.

This is simpler and cleaner than hiding an icon with a setting.

## Phases

1. [Separate Admin Route](phase-01-separate-admin-route.md)
2. [Remove Public Admin Chrome](phase-02-remove-public-admin-chrome.md)
3. [Admin Console Cleanup](phase-03-admin-console-cleanup.md)
4. [Validation](phase-04-validation.md)

## Success Criteria

- `http://localhost:8787/` has no admin/settings/system entry in top bar or left menu.
- Public UI still allows API URL/Key/model entry inside 对话 and generation modules.
- `http://localhost:8787/admin` opens admin login/console.
- Admin APIs still require admin auth in production.
- No public text says 系统设置、后台管理、菜单开关、API 连接 except inside `/admin`.

## Open Questions

- Should `/admin` be documented only, or should there be a hidden footer link? Recommended: documented only.
- Should `adminEntryEnabled` stay in persisted settings for compatibility? Recommended: keep field, stop using it in public UI, remove toggle from admin form later.

