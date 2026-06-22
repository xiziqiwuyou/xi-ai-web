# Phase 02: App Layout, Navigation, and Visual System

Date: 2026-05-22
Priority: P0
Status: planned

## Overview

Refactor UI into a Xiaohongshu-inspired portal:
- Left vertical menu.
- Red/white clean visual direction with warm neutrals and a second accent to avoid one-note palette.
- Main content changes by selected module.
- Top-right settings/admin entrance.
- Mobile collapsible menu.

## Visual Direction

Inspired by Xiaohongshu:
- Bright white canvas.
- Soft red accent.
- Dense but friendly content cards.
- Rounded controls capped at 8px radius unless repeated feed cards need subtle rounding.
- Light shadows, thin borders, high whitespace.
- Navigation icons from `lucide-react`.

Avoid:
- Exact Xiaohongshu logo, brand marks, or copy.
- Full red-only theme.
- Decorative gradient blobs.
- Marketing landing page.

## Component Structure

Create:
- `C:\Users\56252\Documents\New project 2\src\app\AppShell.tsx`
- `C:\Users\56252\Documents\New project 2\src\app\LeftNav.tsx`
- `C:\Users\56252\Documents\New project 2\src\app\TopBar.tsx`
- `C:\Users\56252\Documents\New project 2\src\app\ModuleRouter.tsx`
- `C:\Users\56252\Documents\New project 2\src\app\AdminEntry.tsx`
- `C:\Users\56252\Documents\New project 2\src\styles\tokens.css`
- `C:\Users\56252\Documents\New project 2\src\styles\layout.css`
- `C:\Users\56252\Documents\New project 2\src\styles\rednote.css`

Modify:
- `C:\Users\56252\Documents\New project 2\src\App.tsx`
- `C:\Users\56252\Documents\New project 2\src\styles.css`

## State Model

Avoid React Router for MVP unless URLs are required. Use local state:

```ts
type ModuleId =
  | "chat"
  | "image"
  | "audio"
  | "video"
  | "agents"
  | "knowledge"
  | "assistants"
  | "admin";
```

Later upgrade to routes:
- `/chat`
- `/image`
- `/audio`
- `/video`
- `/agents`
- `/knowledge`
- `/assistants`
- `/admin`

## Layout

Desktop:
- `LeftNav`: 240px.
- `TopBar`: site search, active module title, model quick status, admin entry.
- `Main`: feature module area.
- Optional right panel only inside modules that need it.

Mobile:
- Bottom tab bar or slide-out left nav.
- Admin entry in top menu.
- Chat composer fixed at bottom only in chat module.

## Implementation Steps

1. Extract current app bootstrap/auth state into hooks.
2. Create `AppShell` with left menu and top bar.
3. Replace current sidebar as chat-specific component inside Chat module.
4. Create `ModuleRouter` that only renders enabled modules from public bootstrap.
5. Move current chat UI into `features/chat`.
6. Rewrite CSS tokens and layout.
7. Validate desktop 1440px, tablet 1024px, mobile 390px.

## Success Criteria

- Left menu includes: 对话, 画图, 音频, 视频, 智能体, 知识库, 助手库.
- Disabled menus are hidden or marked based on admin setting.
- Active module is visually clear.
- Chat still streams.
- No text overlaps at mobile width.
- No nested UI cards.

## Risks

- Current `App.tsx` extraction may create state bugs.
- CSS rewrite could regress chat usability.
- Need one source of truth for enabled menu items.
