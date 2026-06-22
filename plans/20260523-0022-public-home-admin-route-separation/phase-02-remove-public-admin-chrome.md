# Phase 02: Remove Public Admin Chrome

Priority: high
Status: planned

## Overview

Remove all admin/system-setting controls from public top bar and shell.

## Files To Modify

- Modify: `C:\Users\56252\Documents\New project 2\src\app\TopBar.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\app\AppShell.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\App.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\styles.css`

## Implementation Steps

1. Remove `SlidersHorizontal` import from `TopBar.tsx`.
2. Remove `settings` and `onOpenAdmin` props from `TopBar`.
3. Remove admin button markup entirely.
4. Remove `onOpenAdmin` prop from `AppShell`.
5. Remove `.admin-trigger.icon-only` public top-bar dependency if unused.
6. Keep top bar search and active module heading.

## Public UI Rule

Allowed in public home:

- `模型接入`
- `API URL`
- `API Key`
- `模型`

Not allowed in public home:

- `系统设置`
- `后台管理`
- `菜单开关`
- `管理员入口`
- `API 连接`

## Success Criteria

- Search in public app files has no admin chrome terms:

```bash
rg -n "系统设置|后台管理|菜单开关|管理员入口|API 连接" src/app src/features/chat src/features/generation
```

Only `src/features/admin/*` may contain those strings.

