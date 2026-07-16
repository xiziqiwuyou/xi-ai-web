# xi-ai-web Design System

This file is the compact implementation source of truth. The complete Figma-ready handoff lives at
`.trellis/tasks/07-15-figma-ui-redesign/research/figma-ready-design-system.md`.

## Product Direction

xi-ai-web is a focused AI creation workbench, not a landing page or analytics dashboard.

- Visual language: flat red and white with quiet neutral surfaces.
- Interaction language: restrained iOS-like tactile feedback.
- Density: compact and task-oriented.
- Shape: default radius `6-10px`; dialogs and sheets up to `12px`.
- Depth: borders and spacing first; shadow only for floating overlays.
- Never use glass blur, gradients, decorative glow, oversized icons, or styling-only card nesting.

## Tokens

| Role | Value |
| --- | --- |
| Page | `#F7F7F8` |
| Surface | `#FFFFFF` |
| Surface subtle | `#FAFAFB` |
| Primary | `#FF2442` |
| Primary hover | `#E91F3B` |
| Primary soft | `#FFF1F3` |
| Text | `#171719` |
| Text secondary | `#66666F` |
| Text muted | `#8B8B94` |
| Border | `#E8E8EC` |
| Border strong | `#D7D7DD` |
| Success | `#14875B` |
| Warning | `#A66300` |
| Danger | `#C92A3D` |
| Focus | `0 0 0 2px #FFFFFF, 0 0 0 4px rgba(255,36,66,.38)` |
| Floating shadow | `0 12px 32px rgba(20,20,24,.12)` |

Spacing uses a `4px` base: `4, 8, 12, 16, 20, 24, 32`.

## Typography

Use a local-first Chinese UI stack:

```css
font-family: "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
```

- Page title: `18px / 1.35 / 700`
- Section title: `16px / 1.4 / 700`
- Body: `14px / 1.55 / 400`
- Label: `13px / 1.4 / 600`
- Caption: `12px / 1.4 / 400`
- Monospace data/code: `ui-monospace, SFMono-Regular, Consolas, monospace`

No viewport-scaled fonts and no negative letter spacing.

## Layout

### Desktop

- Outer shell fills the browser viewport.
- Header: `56px`, compact brand, six content-width module items.
- Workspace gap: `12px`.
- Inspector: `304px`, up to `320px` for Drawing and Agents.
- Main area: flexible, minimum `640px`.
- One functional surface per region; internal sections use dividers.

### Mobile

- Top title bar: `52px`.
- Bottom navigation: `56px + env(safe-area-inset-bottom)`.
- Primary items: 对话, 绘画, 导图, 智能体, 更多.
- More sheet contains 应用, 画廊, and API status. It never contains Admin.
- Exactly one visible vertical scroll owner per screen.
- Interactive targets are at least `44x44px`.
- Sticky actions remain above the bottom navigation and software keyboard.

## Component Rules

- Buttons: `8px` radius, `36px` desktop minimum, `44px` mobile target.
- Inputs: persistent label, `8px` radius, clear focus and error state.
- Icon controls: Lucide only; `16-20px` glyph inside stable targets.
- Segmented controls: only for real views. Filters use pressed buttons.
- Empty states: top-aligned, one sentence, one action maximum.
- Dialogs/sheets: `12px` radius, no blur, focus trap, inert background, focus restoration.
- Destructive actions: confirmation or guaranteed Undo; Cancel receives initial focus.
- Hover/pressed transitions: color/border only, `120-180ms`; no layout-shifting scale.

## Navigation Contract

Public routes are `/chat`, `/image`, `/mindmap`, `/agents`, `/apps`, and `/gallery`.
`/admin` remains the only administrator entry and is never linked from public navigation.

## Accessibility And Verification

- Maintain WCAG AA text contrast.
- Visible `:focus-visible` treatment on every interactive control.
- Respect `prefers-reduced-motion`.
- Validate at `1440x900`, `1280x800`, `390x844`, and `375x812`.
- Verify keyboard navigation, browser Back/Forward, modal focus, safe areas, and no mobile horizontal overflow.
