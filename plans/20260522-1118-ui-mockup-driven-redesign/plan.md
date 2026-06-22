# Plan: Mockup-Driven Premium UI Redesign

Date: 2026-05-22
Status: planned
Reference: `plans/20260522-1118-ui-mockup-driven-redesign/reference-ui.png`
Scope: plan only. No code implementation in this pass.

## Goal

Use the generated UI mockup as the design direction, but sanitize it for a real user-facing product:
- Narrower left menu.
- Larger icon-first menu tiles.
- Higher quality glass, shadows, and rounded controls.
- More complete module affordances.
- Remove design annotations and sensitive/internal content.

## Mockup Keep

- Slim floating left rail.
- Large rounded-square menu icons.
- Active menu: red glass tile, glow, small active marker.
- Main layout: conversation list + chat panel.
- Bottom composer: large focused glass input, tool icons, model chip, red send button.
- Soft white/pink glass panels with layered shadows.
- Admin entry as small top-right control.

## Mockup Adjust/Delete

Do not ship these as public UI:
- Right-side design annotation panels: `菜单状态`, `输入状态`, `功能特性`.
- Fake operational metrics: `GPU 负载`, `服务状态`, synthetic percentages.
- Fake model telemetry: `上下文 8.2K`, `生成耗时 8.2s` unless real.
- Explicit public label `进入后台（管理员）`; use a small icon button or hide by setting.
- Any `API 连接`, `系统设置`, `菜单开关` wording outside admin-authenticated screens.
- Bulk feature-description sidebar in the normal app. Use concise module empty states and admin metadata instead.
- Any Xiaohongshu/Rednote brand name in visible app text.
- Fake sample conversations as seeded user data.

## Information Architecture

Public app:
- Left rail: 对话, 画图, 音频, 视频, 智能体, 知识库, 助手库.
- Top bar: active module title, search, model status if real, admin icon.
- Main area: module content.

Admin-authenticated only:
- 菜单开关
- API 连接
- 系统设置
- 服务状态 only when real health checks exist.

## Visual Direction

- Left rail width: 88-104px desktop.
- Icon tile: 58-64px square, label below or compact.
- Card radius: 12px for major panels, 16-18px for icon tiles, pills for chips.
- Glass: translucent but readable. Main content should remain mostly opaque.
- Shadows: red ambient shadow + neutral contact shadow.
- Background: warm white/pink paper, no decorative blobs.

## Phases

1. [Content Sanitation](phase-01-content-sanitization.md)
2. [Left Rail Redesign](phase-02-left-rail-redesign.md)
3. [Chat Surface and Composer](phase-03-chat-surface-composer.md)
4. [Module Empty States](phase-04-module-empty-states.md)
5. [Admin Entry and Privacy](phase-05-admin-entry-privacy.md)
6. [QA and Visual Validation](phase-06-qa.md)

## Key Files

- `C:\Users\56252\Documents\New project 2\src\styles.css`
- `C:\Users\56252\Documents\New project 2\src\app\LeftNav.tsx`
- `C:\Users\56252\Documents\New project 2\src\app\TopBar.tsx`
- `C:\Users\56252\Documents\New project 2\src\app\ModuleRouter.tsx`
- `C:\Users\56252\Documents\New project 2\src\features\chat\ChatModule.tsx`
- `C:\Users\56252\Documents\New project 2\src\features\admin\AdminDrawer.tsx`

## Success Criteria

- Left menu is visibly narrower and more premium.
- Icons are larger and more tactile.
- Public app does not expose internal/admin/config wording.
- Placeholder modules explain value briefly without becoming a feature-manual panel.
- Admin-only content is behind admin drawer.
- Mobile still works without overlap.

## Validation

Run:

```bash
npm run check
npm run build
```

Then inspect:
- Desktop `http://localhost:8787/`
- 1024px width
- 390px width
- Admin drawer
- Chat composer focus state
- Disabled menu item behavior
