# Phase 05: Admin Entry and Privacy

Status: planned
Priority: P0

## Goal

Keep admin controls available but not overexposed.

## Changes

Public top bar:
- Replace visible `后台` text with icon-only button.
- Tooltip/title: `管理`.
- Respect `adminEntryEnabled`.

Admin drawer:
- Keep explicit labels there:
  - 后台管理
  - 菜单开关
  - API 连接
  - 系统设置

Health/status:
- Do not show `服务状态`, `GPU 负载`, `在线` in public app unless real endpoints exist.

## Files

Modify:
- `src/app/TopBar.tsx`
- `src/features/admin/AdminDrawer.tsx`
- `src/styles.css`

## Success Criteria

- Guest user sees a polished product, not backend plumbing.
- Admin can still access settings.
- No raw API key or fake status appears.
