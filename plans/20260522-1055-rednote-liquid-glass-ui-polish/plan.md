# Plan: Rednote-Inspired Liquid Glass UI Polish

Date: 2026-05-22
Status: planned
Scope: UI/interaction refinement only. No implementation in this planning pass.

## Goal

Make the current UI feel closer to a Xiaohongshu-style content product:
- Warmer, lighter, more tactile.
- Softer left menu and module surfaces.
- Light liquid-glass material.
- Better hover/active/press interactions.
- More visual depth without becoming noisy.

## Current Problem

Current `src/styles.css` is clean but too flat:
- Most radii are uniform `8px`.
- Shadows are too subtle and samey.
- Left menu feels like SaaS admin, not content app.
- Active menu state lacks "selected capsule" energy.
- Cards lack specular highlight, depth, and motion.
- Workspace background has little personality.

## Design Direction

Use "Rednote-inspired", not brand copy:
- White/pink-tinted canvas.
- Soft red primary.
- Warm paper background.
- Floating translucent panels.
- Content-card grid feeling.
- Soft shadows, top highlights, inner border glow.
- Micro-interactions: hover lift, active press, sliding active marker.

Constraints:
- Do not copy Xiaohongshu logo or exact product chrome.
- Avoid decorative blobs/orbs.
- Keep text readable and dense enough for a work app.
- Cards should remain controlled; use material depth more than giant radii.

## Recommended Visual Tokens

Add tokens in `src/styles.css`:

```css
--radius-card: 8px;
--radius-control: 12px;
--radius-pill: 999px;
--glass-bg: rgba(255, 255, 255, 0.68);
--glass-border: rgba(255, 255, 255, 0.72);
--glass-shadow: 0 18px 50px rgba(255, 36, 66, 0.10), 0 4px 18px rgba(32, 23, 26, 0.08);
--inner-highlight: inset 0 1px 0 rgba(255, 255, 255, 0.78);
--ease-spring: cubic-bezier(.2, .9, .2, 1);
```

Use `8px` for content cards. Use softer pill treatment only for nav indicators, badges, compact chips.

## Phases

1. [Material System](phase-01-material-system.md)
2. [Left Navigation Polish](phase-02-left-nav-polish.md)
3. [Workspace and Module Cards](phase-03-workspace-module-polish.md)
4. [Interactions and Motion](phase-04-interactions-motion.md)
5. [Browser QA](phase-05-browser-qa.md)

## Key Files

- `C:\Users\56252\Documents\New project 2\src\styles.css`
- `C:\Users\56252\Documents\New project 2\src\app\LeftNav.tsx`
- `C:\Users\56252\Documents\New project 2\src\app\TopBar.tsx`
- `C:\Users\56252\Documents\New project 2\src\features\chat\ChatModule.tsx`
- `C:\Users\56252\Documents\New project 2\src\features\admin\AdminDrawer.tsx`

## Success Criteria

- Left menu feels tactile and premium.
- Active item is obvious without screaming.
- Panels have light glass depth and top-edge highlight.
- Hover and press states feel responsive.
- Chat and admin panels remain readable.
- Mobile has no overlap.
- Build remains clean.

## Validation

Run:

```bash
npm run check
npm run build
```

Browser checks:
- `http://localhost:8787/`
- Desktop 1440px.
- Tablet 1024px.
- Mobile 390px.
- Admin drawer open/close.
- Menu hover/active states.
- Chat composer focus/send states.

## Open Decision

Intensity level:
- Conservative: subtle glass only on nav/topbar/admin drawer.
- Recommended: glass on nav/topbar/module containers, tactile cards.
- Strong: more translucent panels and animated highlights; higher risk of looking gimmicky.

Recommendation: use the middle option.
