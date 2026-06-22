# Phase 01: Content Sanitation

Status: planned
Priority: P0

## Goal

Separate design-reference content from real user-facing UI.

## Remove or Rewrite

Public UI should not show:
- `后台可控制菜单和 API`
- `进入后台（管理员）`
- `下一步可在后台绑定对应供应商和模型`
- `管理员可以在后台打开这个菜单`
- `请先在后台配置可用模型服务`
- Any fake `GPU`, `上下文`, `耗时`, `在线` metric unless backed by real data.

Recommended replacements:
- `暂未开放`
- `当前功能未启用`
- `请选择可用模型`
- `暂无内容`
- Admin button label: icon only, tooltip/title `管理`

## Files

Modify:
- `src/app/TopBar.tsx`
- `src/app/LeftNav.tsx`
- `src/app/ModuleRouter.tsx`
- `src/features/chat/ChatModule.tsx`

## Implementation Steps

1. Audit all visible strings in public app components.
2. Move admin/config language into `AdminDrawer` only.
3. Replace fake/stateful metrics with real conditional data.
4. Keep feature descriptions only in compact module empty states.

## Success Criteria

- Guest user does not see implementation/admin jargon.
- No fake operational data appears.
- Admin settings remain discoverable but not loud.
